// Gửi/gửi lại hồ sơ và quyết định xét duyệt (FR06, FR07, FR17, API_GD2 §8.2–8.3).
import { effectiveRoundConfig } from '@nckh/shared';
import { AppError, conflict, forbidden, notFound } from '../../lib/errors.js';
import { runSimilarityCheck, similarityView } from '../similarity/service.js';
import { checkTransition } from './stateMachine.js';
import { relations, canView } from './service.js';
import { assertTopicComplete } from './advisorService.js';

export const REVIEW_ACTIONS = ['SUBMIT_FOR_REVIEW', 'RESUBMIT', 'REQUEST_REVISION', 'REJECT', 'APPROVE'];
const STALE = () => conflict('STALE_SUBMISSION', 'Hồ sơ đã có phiên bản mới hơn hoặc đã được quyết định, vui lòng tải lại');
const CONCURRENT = () => conflict('CONCURRENT_UPDATE', 'Dữ liệu vừa được người khác cập nhật, vui lòng tải lại');

export const createReviewService = ({ repo, getTopic, now = () => new Date() }) => {
  const submit = async (t, rel, user, body, ip) => {
    // 1. quyền xem (403) đã kiểm ở act; kiểm rẻ trước, không chạy thuật toán nếu sai trạng thái/vai trò
    const args = { topic: t, action: body.action, actor: user, ctx: rel };
    checkTransition({ ...args, skipSimilarity: true });
    if (body.version !== t.version) throw CONCURRENT();
    // 2. chỉ SUBMIT bị giới hạn thời gian đăng ký; RESUBMIT thì không (§12-G2)
    const n = now();
    if (body.action === 'SUBMIT_FOR_REVIEW' && !(t.round.regOpenAt <= n && n < t.round.regCloseAt)) {
      throw conflict('REGISTRATION_CLOSED', 'Ngoài thời gian đăng ký của đợt');
    }
    assertTopicComplete(t); // 3
    const cfg = effectiveRoundConfig(t.round.config);
    const justification = body.justification || null;
    // 4. ngoài transaction; lỗi vẫn được lưu với status ERROR
    const row = await runSimilarityCheck({
      repo, topic: t, cfg, justification,
      audit: (r) => ({ actorId: user.id, action: 'SIMILARITY_CHECK', entityType: 'SimilarityCheck', entityId: r.id, before: null, after: { topicId: t.id, status: r.status, level: r.level, forSubmit: true }, ip }),
    });
    const view = similarityView(row, user.role);
    let transition;
    try { // 5. lỗi FR06 không bao giờ thành "không trùng"
      transition = checkTransition({ ...args, justification: body.justification, ctx: { ...rel, cfg, similarity: { status: row.status, level: row.level } } });
    } catch (e) {
      if (e instanceof AppError && ['SIMILARITY_NOT_CHECKED', 'JUSTIFICATION_REQUIRED'].includes(e.code)) e.details = { similarityCheck: view };
      throw e;
    }
    // 6.
    let submission;
    await repo.applyReview({ topic: { id: t.id, version: body.version }, transition, actor: user }, async (o) => {
      submission = await o.createSubmission({
        topicId: t.id, seq: await o.nextSeq(t.id), createdById: user.id, similarityCheckId: row.id,
        payload: { title: t.title, summary: t.summary, objectives: t.objectives, keywords: t.keywords, fieldId: t.fieldId, fieldName: t.field?.name ?? null, documentIds: [] },
      });
      await o.audit({ actorId: user.id, action: 'TOPIC_SUBMIT', entityType: 'Submission', entityId: submission.id, before: { status: t.status }, after: { topicId: t.id, seq: submission.seq, action: body.action }, ip });
    });
    return { ...(await getTopic(user, t.id)), submission: { id: submission.id, seq: submission.seq, createdAt: submission.createdAt.toISOString() }, similarityCheck: view };
  };

  const decide = async (t, rel, user, body, ip) => {
    const transition = checkTransition({ topic: t, action: body.action, actor: user, reason: body.reason, ctx: rel });
    if (body.version !== t.version) throw CONCURRENT();
    const latest = t.submissions[0]; // seq lớn nhất (DETAIL_INCLUDE)
    if (!latest || latest.id !== body.submissionId || latest.decision) throw STALE();
    await repo.applyReview({ topic: { id: t.id, version: body.version }, transition, actor: user, reason: body.reason }, async (o) => {
      await o.createDecision({ submissionId: latest.id, action: body.action, reason: body.reason ?? null, decidedById: user.id, decidedAt: now() });
      await o.audit({ actorId: user.id, action: `REVIEW_${body.action}`, entityType: 'Submission', entityId: latest.id, before: { status: t.status }, after: { topicId: t.id, seq: latest.seq, reason: body.reason ?? null }, ip });
    });
    return getTopic(user, t.id);
  };

  return {
    async act(user, topicId, body, ip) {
      const t = await repo.findDetail(topicId);
      if (!t) throw notFound();
      const rel = relations(t, user);
      if (!canView(t, rel)) throw forbidden(); // trước checkTransition (§8.1 bước 2)
      return body.action === 'SUBMIT_FOR_REVIEW' || body.action === 'RESUBMIT' ? submit(t, rel, user, body, ip) : decide(t, rel, user, body, ip);
    },
  };
};
