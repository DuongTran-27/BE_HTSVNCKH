// Đề tài GV công bố tuyển SV (FR31, API_GD7 §3.3–3.4) và bảng tin đọc (§4.2). Chuyển trạng thái chỉ qua checkTransition + applyTransition.
import { effectiveRoundConfig, topicPublishSchema } from '@nckh/shared';
import { AppError, badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { runSimilarityCheck, similarityView } from '../similarity/service.js';
import { checkTransition } from './stateMachine.js';
import { relations, canView } from './service.js';
import { topicName } from '../notifications/notify.js';

export const RECRUIT_ACTIONS = ['PUBLISH_RECRUITMENT', 'UNPUBLISH_RECRUITMENT', 'FINALIZE_GROUP'];
export const UNPUBLISH_DECLINE_REASON = 'Giảng viên ngừng tuyển';
export const FINALIZE_DECLINE_REASON = 'Đề tài đã chốt nhóm';
const CONCURRENT = () => conflict('CONCURRENT_UPDATE', 'Dữ liệu vừa được người khác cập nhật, vui lòng tải lại');
const iso = (d) => d.toISOString();

// Đủ trường như FR05 + số SV cần tuyển 1..maxMembers (§3.3 bước 2)
export const assertPublishable = (t) => {
  const cfg = effectiveRoundConfig(t.round.config);
  const parsed = topicPublishSchema(cfg).safeParse({
    title: t.title, summary: t.summary, objectives: t.objectives, keywords: t.keywords, fieldId: t.fieldId ?? '', recruitSlots: t.recruitSlots ?? undefined,
  });
  if (parsed.success) return;
  const details = {};
  for (const i of parsed.error.issues) details[i.path[0] ?? '_'] ??= i.message;
  throw badRequest('TOPIC_INCOMPLETE', 'Hồ sơ chưa đủ thông tin bắt buộc', details);
};

// Phạm vi bảng tin: khoa của người gọi; STAFF: các khoa trong phạm vi. Không có khoa → rỗng (không bao giờ "mọi khoa")
export const scopeOf = (user) => ({ facultyId: { in: user.role === 'STAFF' ? (user.staffFacultyIds ?? []) : user.facultyId ? [user.facultyId] : [] } });

export const createRecruitmentService = ({ repo, getTopic, now = () => new Date() }) => {
  const publish = async (t, rel, user, body, ip) => {
    const args = { topic: t, action: body.action, actor: user, ctx: rel };
    const transition = checkTransition({ ...args, skipSimilarity: true }); // 1. quyền + trạng thái, chưa chạy thuật toán
    // Phòng thủ nhiều lớp (§0): đề tài SV đề xuất không có Advising ở DRAFT, nhưng vẫn kiểm nguồn
    if (t.origin !== 'LECTURER') throw conflict('INVALID_TRANSITION', 'Chỉ công bố được đề tài do giảng viên tạo');
    if (body.version !== t.version) throw CONCURRENT();
    assertPublishable(t); // 2
    const n = now();
    if (!(t.round.regOpenAt <= n && n < t.round.regCloseAt)) throw conflict('REGISTRATION_CLOSED', 'Ngoài thời gian đăng ký của đợt'); // 3
    const cfg = effectiveRoundConfig(t.round.config);
    // 4. FR06 ngoài transaction, lưu cả khi lỗi; không áp cờ bỏ qua G5 (G50)
    const row = await runSimilarityCheck({
      repo, topic: t, cfg, justification: body.justification || null,
      audit: (r) => ({ actorId: user.id, action: 'SIMILARITY_CHECK', entityType: 'SimilarityCheck', entityId: r.id, before: null, after: { topicId: t.id, status: r.status, level: r.level, forPublish: true }, ip }),
    });
    const view = similarityView(row, user.role);
    try { // lỗi FR06 không bao giờ thành "không trùng"
      checkTransition({ ...args, justification: body.justification, ctx: { ...rel, cfg, similarity: { status: row.status, level: row.level } } });
    } catch (e) {
      if (e instanceof AppError && ['SIMILARITY_NOT_CHECKED', 'JUSTIFICATION_REQUIRED'].includes(e.code)) e.details = { similarityCheck: view };
      throw e;
    }
    // 5. dưới khóa: Topic (updateMany theo version) → User GV → đếm hạn mức FR16
    await repo.applyRecruitment({ topic: { id: t.id, version: body.version }, transition, actor: user }, async (o) => {
      await o.lockUsers([user.id]);
      // Đề tài này đã là RECRUITING trong tx nên đã được đếm: vượt khi tổng > hạn mức (= đếm đề tài khác ≥ hạn mức)
      if ((await o.countLecturerActive(user.id, t.round.id)) > cfg.maxTopicsPerLecturer) {
        throw conflict('LECTURER_QUOTA_EXCEEDED', 'Giảng viên đã đủ hạn mức hướng dẫn trong đợt');
      }
      await o.audit({ actorId: user.id, action: 'TOPIC_PUBLISH_RECRUITMENT', entityType: 'Topic', entityId: t.id, before: { status: t.status }, after: { status: transition.to, recruitSlots: t.recruitSlots, similarityCheckId: row.id }, ip });
    });
    return { ...(await getTopic(user, t.id)), similarityCheck: view };
  };

  const unpublish = async (t, rel, user, body, ip) => {
    const transition = checkTransition({ topic: t, action: body.action, actor: user, reason: body.reason, ctx: rel });
    if (body.version !== t.version) throw CONCURRENT();
    const at = now();
    await repo.applyRecruitment({ topic: { id: t.id, version: body.version }, transition, actor: user, reason: body.reason }, async (o) => {
      // Đọc lại dưới khóa Topic (M2 BM): gỡ mọi thành viên hiện hành → giải phóng suất đề tài hoạt động (FR03)
      const members = await o.liveMembers(t.id);
      if (members.length) await o.removeMembers(members.map((m) => m.id), at);
      for (const m of members) {
        await o.audit({ actorId: user.id, action: 'MEMBER_REMOVE', entityType: 'TopicMember', entityId: m.id, before: { topicId: t.id, userId: m.userId, leftAt: null }, after: { leftAt: iso(at), reason: body.reason }, ip });
      }
      const apps = await o.declinePendingApplications(t.id, { reason: UNPUBLISH_DECLINE_REASON, decidedById: user.id, respondedAt: at });
      await o.audit({ actorId: user.id, action: 'TOPIC_UNPUBLISH_RECRUITMENT', entityType: 'Topic', entityId: t.id, before: { status: t.status }, after: { status: transition.to, reason: body.reason, removedMembers: members.length, declinedApplications: apps.length }, ip });
      // Người bị gỡ không còn xem được đề tài → liên kết về bảng tin
      if (members.length) {
        await o.notify({ topicId: t.id, userIds: members.map((m) => m.userId), actorId: user.id, type: 'RECRUITMENT_CANCELLED', key: `RECRUITMENT_CANCELLED:${t.id}:${body.version}`, link: '/tuyen-sinh', title: (x) => `Giảng viên đã ngừng tuyển đề tài ${topicName(x)}; bạn không còn là thành viên` });
      }
      for (const a of apps) {
        await o.notify({ topicId: t.id, userIds: [a.studentId], actorId: user.id, type: 'APPLICATION_DECLINED', key: `APPLICATION_DECLINED:${a.id}`, link: '/tuyen-sinh', title: (x) => `Đơn ứng tuyển đề tài ${topicName(x)} bị từ chối: giảng viên ngừng tuyển` });
      }
    });
    return getTopic(user, t.id);
  };

  // FINALIZE_GROUP (§4.5): RECRUITING → HAS_ADVISOR; sau đó trưởng nhóm gửi xét duyệt như luồng cũ (G48, CAU_HOI #14)
  const finalize = async (t, rel, user, body, ip) => {
    const transition = checkTransition({ topic: t, action: body.action, actor: user, ctx: rel });
    if (body.version !== t.version) throw CONCURRENT();
    const cfg = effectiveRoundConfig(t.round.config);
    const at = now();
    await repo.applyRecruitment({ topic: { id: t.id, version: body.version }, transition, actor: user }, async (o) => {
      // Đọc lại dưới khóa Topic: duyệt đơn đồng thời đã tăng version nên không lọt thành viên sau chốt
      const members = await o.liveMembers(t.id);
      if (members.length < cfg.minMembers) throw conflict('GROUP_TOO_SMALL', `Nhóm chưa đủ số thành viên tối thiểu (${cfg.minMembers})`);
      const apps = await o.declinePendingApplications(t.id, { reason: FINALIZE_DECLINE_REASON, decidedById: user.id, respondedAt: at });
      await o.audit({ actorId: user.id, action: 'TOPIC_FINALIZE_GROUP', entityType: 'Topic', entityId: t.id, before: { status: t.status }, after: { status: transition.to, members: members.map((m) => ({ userId: m.userId, role: m.role })), declinedApplications: apps.length }, ip });
      await o.notify({ topicId: t.id, to: ['members'], actorId: user.id, type: 'GROUP_FINALIZED', key: `GROUP_FINALIZED:${t.id}:${body.version}`, link: `/de-tai/${t.id}`, title: (x) => `Giảng viên đã chốt nhóm đề tài ${topicName(x)}; trưởng nhóm gửi hồ sơ xét duyệt` });
      for (const a of apps) {
        await o.notify({ topicId: t.id, userIds: [a.studentId], actorId: user.id, type: 'APPLICATION_DECLINED', key: `APPLICATION_DECLINED:${a.id}`, link: '/tuyen-sinh', title: (x) => `Đơn ứng tuyển đề tài ${topicName(x)} bị từ chối: đề tài đã chốt nhóm` });
      }
    });
    return getTopic(user, t.id);
  };

  const presentItem = (t, user, full) => {
    const n = now();
    const adv = t.advisings[0];
    return {
      topicId: t.id, code: t.code, title: t.title, summaryExcerpt: t.summary.slice(0, 300),
      field: t.field ? { id: t.field.id, name: t.field.name } : null,
      round: { id: t.round.id, name: t.round.name, registrationOpen: t.round.regOpenAt <= n && n < t.round.regCloseAt },
      lecturer: adv ? { id: adv.lecturer.id, fullName: adv.lecturer.fullName } : null,
      recruitSlots: t.recruitSlots, acceptedCount: t._count.members,
      myApplication: user.role === 'STUDENT' ? (t.applications?.[0] ?? null) : null,
      ...(full && { summary: t.summary, objectives: t.objectives, keywords: t.keywords, requirements: t.requirements }),
    };
  };
  const studentIdOf = (user) => (user.role === 'STUDENT' ? user.id : null);

  return {
    async act(user, topicId, body, ip) {
      const t = await repo.findDetail(topicId);
      if (!t) throw notFound();
      const rel = relations(t, user);
      if (!canView(t, rel)) throw forbidden(); // trước checkTransition để không lộ trạng thái (API_GD2 §8.1)
      const run = { PUBLISH_RECRUITMENT: publish, UNPUBLISH_RECRUITMENT: unpublish, FINALIZE_GROUP: finalize }[body.action];
      return run(t, rel, user, body, ip);
    },

    async list(user, q) {
      const where = {
        status: 'RECRUITING', ...scopeOf(user),
        ...(q.roundId && { roundId: q.roundId }),
        ...(q.fieldId && { fieldId: q.fieldId }),
        ...(q.lecturerId && { advisings: { some: { lecturerId: q.lecturerId, endAt: null } } }),
        ...(q.q && { OR: [{ title: { contains: q.q, mode: 'insensitive' } }, { keywords: { has: q.q } }] }),
      };
      const { items, total } = await repo.listRecruitments({ where, skip: (q.page - 1) * q.pageSize, take: q.pageSize, studentId: studentIdOf(user) });
      return { items: items.map((t) => presentItem(t, user, false)), page: q.page, pageSize: q.pageSize, total };
    },

    // Không RECRUITING hoặc ngoài phạm vi khoa → 404 (không lộ tồn tại)
    async get(user, topicId) {
      const t = await repo.findRecruitment({ id: topicId, status: 'RECRUITING', ...scopeOf(user) }, studentIdOf(user));
      if (!t) throw notFound();
      return { recruitment: presentItem(t, user, true) };
    },
  };
};
