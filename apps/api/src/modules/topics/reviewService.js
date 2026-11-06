// Gửi/gửi lại hồ sơ và quyết định xét duyệt (FR06, FR07, FR17, API_GD2 §8.2–8.3).
import { effectiveRoundConfig } from '@nckh/shared';
import { AppError, conflict, forbidden, notFound } from '../../lib/errors.js';
import { runSimilarityCheck, similarityView, activeBypassOf } from '../similarity/service.js';
import { checkTransition } from './stateMachine.js';
import { relations, canView } from './service.js';
import { assertTopicComplete } from './advisorService.js';
import { topicName } from '../notifications/notify.js';

export const REVIEW_ACTIONS = ['SUBMIT_FOR_REVIEW', 'RESUBMIT', 'REQUEST_REVISION', 'REJECT', 'APPROVE'];
const STALE = () => conflict('STALE_SUBMISSION', 'Hồ sơ đã có phiên bản mới hơn hoặc đã được quyết định, vui lòng tải lại');
const DECISION_TEXT = { APPROVE: 'được duyệt', REQUEST_REVISION: 'cần chỉnh sửa', REJECT: 'bị từ chối' };
const CONCURRENT = () => conflict('CONCURRENT_UPDATE', 'Dữ liệu vừa được người khác cập nhật, vui lòng tải lại');

export const createReviewService = ({ repo, getTopic, logger, now = () => new Date() }) => {
  // Tx đã commit: nếu đọc lại lỗi vẫn trả kết quả tối thiểu thay vì báo lỗi cho việc đã xong (T212a MINOR 1)
  const readAfter = (user, t, transition, body) =>
    getTopic(user, t.id).catch((e) => {
      logger?.warn({ err: e, topicId: t.id }, 'Đọc lại đề tài sau khi chuyển trạng thái lỗi; trả kết quả tối thiểu');
      return { topic: { id: t.id, status: transition.to, version: body.version + 1 } };
    });

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
    // G5 (API_GD6 §9.4): FR06 lỗi + cán bộ đã cho phép (đọc trước transaction, kiểm lại dưới khóa) → gửi với cờ "chưa kiểm tra"
    const bypass = row.status !== 'OK' ? activeBypassOf(t.similarityBypasses?.[0], t.submissions[0]) : null;
    let transition;
    try { // 5. lỗi FR06 không bao giờ thành "không trùng"
      transition = checkTransition({ ...args, justification: body.justification, ctx: { ...rel, cfg, similarity: { status: row.status, level: row.level }, similarityBypass: !!bypass } });
    } catch (e) {
      if (e instanceof AppError && ['SIMILARITY_NOT_CHECKED', 'JUSTIFICATION_REQUIRED'].includes(e.code)) e.details = { similarityCheck: view };
      throw e;
    }
    // 6.
    let submission;
    await repo.applyReview({ topic: { id: t.id, version: body.version }, transition, actor: user }, async (o) => {
      // Dòng Topic đã khóa bởi updateMany: gửi đôi dùng cùng quyền thì lần sau thấy quyền đã hết hiệu lực
      if (bypass && (await o.activeBypass(t.id))?.id !== bypass.id) {
        throw new AppError(409, 'SIMILARITY_NOT_CHECKED', 'Chưa kiểm tra được trùng lặp, vui lòng thử lại', { similarityCheck: view });
      }
      submission = await o.createSubmission({
        topicId: t.id, seq: await o.nextSeq(t.id), createdById: user.id, similarityCheckId: row.id,
        payload: { title: t.title, summary: t.summary, objectives: t.objectives, keywords: t.keywords, fieldId: t.fieldId, fieldName: t.field?.name ?? null, documentIds: await o.latestProposalDocumentIds(t.id), ...(bypass && { similarityBypassId: bypass.id }) },
      });
      await o.audit({ actorId: user.id, action: 'TOPIC_SUBMIT', entityType: 'Submission', entityId: submission.id, before: { status: t.status }, after: { topicId: t.id, seq: submission.seq, action: body.action }, ip });
    });
    return { ...(await readAfter(user, t, transition, body)), submission: { id: submission.id, seq: submission.seq, createdAt: submission.createdAt.toISOString(), unchecked: row.status !== 'OK' }, similarityCheck: view };
  };

  const decide = async (t, rel, user, body, ip) => {
    const transition = checkTransition({ topic: t, action: body.action, actor: user, reason: body.reason, ctx: rel });
    if (body.version !== t.version) throw CONCURRENT();
    const latest = t.submissions[0]; // seq lớn nhất (DETAIL_INCLUDE)
    if (!latest || latest.id !== body.submissionId || latest.decision) throw STALE();
    await repo.applyReview({ topic: { id: t.id, version: body.version }, transition, actor: user, reason: body.reason }, async (o) => {
      await o.createDecision({ submissionId: latest.id, action: body.action, reason: body.reason ?? null, decidedById: user.id, decidedAt: now() });
      await o.audit({ actorId: user.id, action: `REVIEW_${body.action}`, entityType: 'Submission', entityId: latest.id, before: { status: t.status }, after: { topicId: t.id, seq: latest.seq, reason: body.reason ?? null }, ip });
      await o.notify({ topicId: t.id, to: ['members', 'advisor'], actorId: user.id, type: 'REVIEW_DECIDED', key: `REVIEW_DECIDED:${latest.id}`, link: `/de-tai/${t.id}`, title: (x) => `Kết quả xét duyệt: đề tài ${topicName(x)} ${DECISION_TEXT[body.action]}` });
    });
    return readAfter(user, t, transition, body);
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
