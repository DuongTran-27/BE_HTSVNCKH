// Đề nghị nhận hướng dẫn (FR16, API_GD2 §6, §5.5). Chuyển trạng thái chỉ qua checkTransition + applyTransition.
import { effectiveRoundConfig, topicSubmitSchema } from '@nckh/shared';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { checkTransition } from './stateMachine.js';
import { relations, canView } from './service.js';
import { topicName } from '../notifications/notify.js';

const iso = (d) => d?.toISOString() ?? null;

// Đủ trường bắt buộc theo cấu hình đợt (FR05) – dùng chung với gửi xét duyệt
export const assertTopicComplete = (t) => {
  const cfg = effectiveRoundConfig(t.round.config);
  const parsed = topicSubmitSchema(cfg).safeParse({ title: t.title, summary: t.summary, objectives: t.objectives, keywords: t.keywords, fieldId: t.fieldId ?? '' });
  if (parsed.success) return;
  const details = {};
  for (const i of parsed.error.issues) details[i.path[0] ?? '_'] ??= i.message;
  throw badRequest('TOPIC_INCOMPLETE', 'Hồ sơ chưa đủ thông tin bắt buộc', details);
};

export const createAdvisorService = ({ repo, getTopic, now = () => new Date() }) => {
  // Điều kiện không cần khóa của REQUEST_ADVISOR (§6); trả lecturerId đã kiểm
  const precheckRequest = async (t, body) => {
    const n = now();
    if (!(t.round.regOpenAt <= n && n < t.round.regCloseAt)) throw conflict('REGISTRATION_CLOSED', 'Ngoài thời gian đăng ký của đợt');
    assertTopicComplete(t);
    const lec = await repo.findUser(body.lecturerId);
    if (!lec || lec.role !== 'LECTURER' || lec.isLocked || lec.facultyId !== t.round.facultyId) {
      throw badRequest('VALIDATION_ERROR', 'Dữ liệu không hợp lệ', { lecturerId: 'Không tìm thấy giảng viên phù hợp' });
    }
  };

  const audit = (o, user, action, t, after, ip) =>
    o.audit({ actorId: user.id, action, entityType: 'AdvisorRequest', entityId: t.id, before: { status: t.status }, after, ip });
  // Phản hồi của GV → thành viên (FR13); nhận và từ chối chung khóa vì một đề nghị chỉ có một phản hồi (§8.3)
  const notifyResponse = (o, user, t, type, title) =>
    o.notify({ topicId: t.id, to: ['members'], actorId: user.id, type, key: `ADVISOR_RESPONSE:${t.advisorRequests[0]?.id}`, link: `/de-tai/${t.id}`, title });

  // extra chạy TRONG transaction của applyTransition, sau khi Topic đã bị khóa
  const extras = {
    REQUEST_ADVISOR: (t, user, body, ip) => async (o) => {
      const cfg = effectiveRoundConfig(t.round.config);
      const members = await o.liveMembers(t.id); // đọc lại trong tx (§5.5 bước 2)
      if (members.length < cfg.minMembers) throw conflict('GROUP_TOO_SMALL', `Nhóm chưa đủ số thành viên tối thiểu (${cfg.minMembers})`);
      // khóa cả GV (tăng dần theo id cùng các SV) rồi kiểm lại GV trong tx
      await o.lockUsers([...members.map((m) => m.userId), body.lecturerId]);
      const lec = await o.findUser(body.lecturerId);
      if (!lec || lec.role !== 'LECTURER' || lec.isLocked || lec.facultyId !== t.round.facultyId) {
        throw badRequest('VALIDATION_ERROR', 'Dữ liệu không hợp lệ', { lecturerId: 'Không tìm thấy giảng viên phù hợp' });
      }
      const over = [];
      for (const m of members) {
        if ((await o.countStudentActive(m.userId, t.round.id, t.id)) >= cfg.maxActiveTopicsPerStudent) over.push(m.user.code);
      }
      if (over.length) throw conflict('STUDENT_TOPIC_LIMIT', 'Sinh viên đã đạt số đề tài hoạt động tối đa trong đợt', { codes: over });
      const req = await o.createRequest({ topicId: t.id, lecturerId: body.lecturerId });
      await o.withdrawPendingInvitations(t.id, now());
      await o.audit({ actorId: user.id, action: 'ADVISOR_REQUEST_CREATE', entityType: 'AdvisorRequest', entityId: req.id, before: null, after: { topicId: t.id, lecturerId: body.lecturerId }, ip });
      await o.notify({ topicId: t.id, userIds: [body.lecturerId], actorId: user.id, type: 'ADVISOR_REQUESTED', key: `ADVISOR_REQUESTED:${req.id}`, link: '/de-nghi-huong-dan', title: (x) => `Đề nghị hướng dẫn đề tài ${topicName(x)}` });
    },
    ACCEPT_ADVISING: (t, user, _body, ip) => async (o) => {
      const cfg = effectiveRoundConfig(t.round.config);
      await o.lockUsers([user.id]);
      if ((await o.countLecturerActive(user.id, t.round.id)) >= cfg.maxTopicsPerLecturer) {
        throw conflict('LECTURER_QUOTA_EXCEEDED', 'Giảng viên đã đủ hạn mức hướng dẫn trong đợt');
      }
      if (!(await o.closeRequest(t.id, 'ACCEPTED', { respondedAt: now() }))) throw conflict('CONCURRENT_UPDATE', 'Dữ liệu vừa được người khác cập nhật, vui lòng tải lại');
      await o.createAdvising({ topicId: t.id, lecturerId: user.id, startAt: now() });
      await audit(o, user, 'ADVISOR_REQUEST_ACCEPT', t, { status: 'ACCEPTED' }, ip);
      await notifyResponse(o, user, t, 'ADVISOR_ACCEPTED', (x) => `${user.fullName} đã nhận hướng dẫn đề tài ${topicName(x)}`);
    },
    DECLINE_ADVISING: (t, user, body, ip) => async (o) => {
      if (!(await o.closeRequest(t.id, 'DECLINED', { respondedAt: now(), reason: body.reason }))) throw conflict('CONCURRENT_UPDATE', 'Dữ liệu vừa được người khác cập nhật, vui lòng tải lại');
      await audit(o, user, 'ADVISOR_REQUEST_DECLINE', t, { status: 'DECLINED', reason: body.reason }, ip);
      await notifyResponse(o, user, t, 'ADVISOR_DECLINED', (x) => `Giảng viên đã từ chối hướng dẫn đề tài ${topicName(x)}`); // lý do không đưa vào tiêu đề (§8.2)
    },
    WITHDRAW_ADVISOR_REQUEST: (t, user, _body, ip) => async (o) => {
      if (!(await o.closeRequest(t.id, 'WITHDRAWN', { respondedAt: now() }))) throw conflict('CONCURRENT_UPDATE', 'Dữ liệu vừa được người khác cập nhật, vui lòng tải lại');
      await audit(o, user, 'ADVISOR_REQUEST_WITHDRAW', t, { status: 'WITHDRAWN' }, ip);
      // Chỉ mã đề tài: sau khi rút, GV chỉ còn thấy mã trong danh sách đề nghị (advisorService.listRequests)
      const req = t.advisorRequests[0];
      await o.notify({ topicId: t.id, userIds: [req?.lecturerId], actorId: user.id, type: 'ADVISOR_REQUEST_WITHDRAWN', key: `ADVISOR_REQUEST_WITHDRAWN:${req?.id}`, link: '/de-nghi-huong-dan', title: (x) => `Nhóm đã rút đề nghị hướng dẫn đề tài ${x.code}` });
    },
  };

  return {
    async act(user, topicId, body, ip) {
      const t = await repo.findDetail(topicId);
      if (!t) throw notFound();
      const rel = relations(t, user);
      if (!canView(t, rel)) throw forbidden(); // trước checkTransition để không lộ trạng thái (§8.1 bước 2)
      const transition = checkTransition({ topic: t, action: body.action, actor: user, reason: body.reason, ctx: rel });
      if (body.version !== t.version) throw conflict('CONCURRENT_UPDATE', 'Dữ liệu vừa được người khác cập nhật, vui lòng tải lại');
      if (body.action === 'REQUEST_ADVISOR') await precheckRequest(t, body);
      const after = await repo.apply(
        { topic: { id: t.id, version: body.version }, transition, actor: user, reason: body.reason },
        extras[body.action](t, user, body, ip),
      );
      // Sau DECLINE đề tài về Nháp và GV hết quan hệ nên không còn quyền xem chi tiết (§5.1): chỉ trả tóm lược.
      if (body.action === 'DECLINE_ADVISING') return { topic: { id: after.id, code: after.code, status: after.status, version: after.version } };
      return getTopic(user, topicId);
    },

    async listRequests(user, q) {
      const where = {
        ...(q.status && { status: q.status }),
        ...(q.roundId && { topic: { roundId: q.roundId } }),
      };
      const scope = user.role === 'LECTURER' ? { lecturerId: user.id }
        : user.role === 'STUDENT' ? { topic: { members: { some: { userId: user.id, leftAt: null } } } }
        : { topic: { facultyId: { in: user.staffFacultyIds ?? [] }, status: { not: 'DRAFT' } } };
      const w = { AND: [where, scope] };
      const { items, total } = await repo.listRequests({ where: w, skip: (q.page - 1) * q.pageSize, take: q.pageSize });
      const n = now();
      return {
        page: q.page, pageSize: q.pageSize, total,
        items: items.map((r) => ({
          id: r.id, status: r.status, createdAt: iso(r.createdAt), respondedAt: iso(r.respondedAt), reason: r.reason,
          pendingDays: r.status === 'PENDING' ? Math.floor((n - r.createdAt) / 86400000) : null,
          topic: user.role === 'LECTURER' && !['PENDING', 'ACCEPTED'].includes(r.status) ? { id: r.topic.id, code: r.topic.code, round: r.topic.round } : r.topic, lecturer: { id: r.lecturer.id, fullName: r.lecturer.fullName },
        })),
      };
    },

    async listLecturers(user, q) {
      const round = await repo.findRound(q.roundId);
      if (!round) throw notFound();
      const ok = user.role === 'STAFF' ? user.staffFacultyIds?.includes(round.facultyId) : user.facultyId === round.facultyId;
      if (!ok) throw forbidden();
      const max = effectiveRoundConfig(round.config).maxTopicsPerLecturer;
      const { items, total } = await repo.listLecturers({ round, q: q.q, skip: (q.page - 1) * q.pageSize, take: q.pageSize });
      return {
        page: q.page, pageSize: q.pageSize, total,
        items: items.map((u) => ({ id: u.id, code: u.code, fullName: u.fullName, activeTopicCount: u.activeTopicCount, maxTopics: max, isFull: u.activeTopicCount >= max })),
      };
    },
  };
};
