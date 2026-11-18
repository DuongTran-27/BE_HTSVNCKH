// Ứng tuyển, rút, duyệt/từ chối đơn (FR32, FR33, FR03 – API_GD7 §4.1–4.4, G51). Quyền theo quan hệ đọc từ DB; giới hạn kiểm SAU câu khóa.
import { Prisma } from '@prisma/client';
import { effectiveRoundConfig } from '@nckh/shared';
import { conflict, forbidden, notFound } from '../../lib/errors.js';
import { topicName } from '../notifications/notify.js';
import { relations } from './service.js';
import { scopeOf } from './recruitmentService.js';

const iso = (d) => d?.toISOString() ?? null;
const closedApp = (msg = 'Đơn ứng tuyển không còn chờ xử lý') => conflict('APPLICATION_CLOSED', msg);
const notRecruiting = () => conflict('NOT_RECRUITING', 'Đề tài không còn nhận ứng tuyển');
const topicLimit = () => conflict('STUDENT_TOPIC_LIMIT', 'Sinh viên đã đạt số đề tài hoạt động tối đa trong đợt');
const isAdvisorOf = (a, user) => a.topic.advisings.some((x) => x.lecturerId === user.id);

export const presentApplication = (a, user) => {
  const pending = a.status === 'PENDING';
  const availableActions = [
    ...(pending && a.topic.status === 'RECRUITING' && user.role === 'LECTURER' && isAdvisorOf(a, user) ? ['ACCEPT', 'DECLINE'] : []),
    ...(pending && a.studentId === user.id ? ['WITHDRAW'] : []),
  ];
  return {
    id: a.id, status: a.status, coverLetter: a.coverLetter, reason: a.reason, createdAt: iso(a.createdAt), respondedAt: iso(a.respondedAt),
    topic: { id: a.topic.id, code: a.topic.code, title: a.topic.title, status: a.topic.status },
    student: { id: a.student.id, code: a.student.code, fullName: a.student.fullName, classCode: a.student.class?.code ?? null },
    availableActions,
  };
};

export const createApplicationService = ({ repo, getTopic, now = () => new Date() }) => {
  const view = async (id, user) => ({ application: presentApplication(await repo.findApplication(id), user) });
  // GVHD hiện hành của đề tài có đơn; kiểm trước khóa (403 sớm) và lại dưới khóa (API_GD6 §1.2)
  const loadForAdvisor = async (user, id) => {
    const a = await repo.findApplication(id);
    if (!a) throw notFound();
    if (!isAdvisorOf(a, user)) throw forbidden();
    return a;
  };
  const lockAsAdvisor = async (o, a, user) => {
    const row = await o.lockTopic(a.topicId);
    if (!(await o.isCurrentAdvisor(a.topicId, user.id))) throw forbidden();
    return row;
  };
  const query = (q, scope) => ({
    ...scope,
    ...(q.status && { status: q.status }),
    ...(q.topicId && { topicId: q.topicId }),
  });
  const page = async (where, q, user) => {
    const { items, total } = await repo.listApplications({ where, skip: (q.page - 1) * q.pageSize, take: q.pageSize });
    return { items: items.map((a) => presentApplication(a, user)), page: q.page, pageSize: q.pageSize, total };
  };

  return {
    // POST /api/recruitments/:topicId/applications (§4.3)
    async apply(user, topicId, body, ip) {
      // Kiểm sớm cho thông điệp rõ; không RECRUITING hoặc khác khoa → 404 như bảng tin
      const t = await repo.findRecruitment({ id: topicId, status: 'RECRUITING', ...scopeOf(user) }, null);
      if (!t) throw notFound();
      const n = now();
      if (!(t.round.regOpenAt <= n && n < t.round.regCloseAt)) throw conflict('REGISTRATION_CLOSED', 'Ngoài thời gian đăng ký của đợt');
      if (await repo.appRead.isMember(topicId, user.id)) throw conflict('ALREADY_MEMBER', 'Bạn đã là thành viên đề tài này');
      const cfg = effectiveRoundConfig(t.round.config);
      if ((await repo.appRead.countActiveTopics(user.id, t.round.id, topicId)) >= cfg.maxActiveTopicsPerStudent) throw topicLimit();
      const id = await repo.appTx(async (o) => {
        const row = await o.lockTopicShare(topicId);
        // M3 BM: kiểm lại sau khóa → không có đơn PENDING mồ côi trên đề tài đã chốt/ngừng tuyển
        if (!row || row.status !== 'RECRUITING' || row.facultyId !== user.facultyId) throw notRecruiting();
        let created;
        try {
          created = await o.createApplication({ topicId, studentId: user.id, coverLetter: body.coverLetter });
        } catch (e) {
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw conflict('APPLICATION_EXISTS', 'Bạn đã ứng tuyển đề tài này');
          throw e;
        }
        // Không ghi nội dung lời giới thiệu vào nhật ký, chỉ độ dài
        await o.audit({ actorId: user.id, action: 'APPLICATION_CREATE', entityType: 'TopicApplication', entityId: created.id, before: null, after: { topicId, coverLetterLength: body.coverLetter.length }, ip });
        await o.notify({ topicId, to: ['advisor'], actorId: user.id, type: 'APPLICATION_RECEIVED', key: `APPLICATION_RECEIVED:${created.id}`, link: `/de-tai/${topicId}`, title: (x) => `${user.fullName} ứng tuyển đề tài ${topicName(x)}` });
        return created.id;
      });
      return view(id, user);
    },

    // POST /api/applications/:id/withdraw – chính SV, chỉ đơn PENDING
    async withdraw(user, id, ip) {
      const a = await repo.findApplication(id);
      if (!a) throw notFound();
      if (a.studentId !== user.id) throw forbidden();
      await repo.appTx(async (o) => {
        if (!(await o.closeApplication(id, 'WITHDRAWN', { respondedAt: now() }))) throw closedApp();
        await o.audit({ actorId: user.id, action: 'APPLICATION_WITHDRAW', entityType: 'TopicApplication', entityId: id, before: { status: 'PENDING' }, after: { status: 'WITHDRAWN', topicId: a.topicId }, ip });
      });
      return view(id, user);
    },

    // POST /api/applications/:id/accept (§4.4). Thứ tự khóa: Topic → User SV (GD7 §1.2)
    async accept(user, id, ip) {
      const pre = await loadForAdvisor(user, id);
      await repo.appTx(async (o) => {
        const row = await lockAsAdvisor(o, pre, user); // 1
        if (row.status !== 'RECRUITING') throw notRecruiting();
        const cfg = effectiveRoundConfig(await o.roundConfig(row.roundId));
        // 2. m2 BM DC-05: chỉ tiêu = min(recruitSlots, maxMembers hiện hành của đợt) – cán bộ có thể đã hạ maxMembers
        const cap = Math.min(row.recruitSlots ?? cfg.maxMembers, cfg.maxMembers);
        const members = await o.countMembers(pre.topicId);
        if (members >= cap) throw conflict('GROUP_FULL', `Nhóm đã đạt số lượng tối đa (${cap})`);
        await o.lockUsers([pre.studentId]); // 3
        const stu = await o.findUser(pre.studentId);
        if (!stu || stu.isLocked || stu.facultyId !== row.facultyId) throw closedApp('Sinh viên không còn đủ điều kiện');
        const active = await o.countActiveTopics(pre.studentId, row.roundId, pre.topicId);
        if (active >= cfg.maxActiveTopicsPerStudent) throw conflict('STUDENT_TOPIC_LIMIT', 'Sinh viên đã đạt số đề tài hoạt động tối đa trong đợt', { codes: [pre.student.code] });
        const at = now();
        if (!(await o.closeApplication(id, 'ACCEPTED', { decidedById: user.id, respondedAt: at }))) throw closedApp(); // 4
        const role = members === 0 ? 'LEADER' : 'MEMBER'; // 5. người được duyệt đầu tiên là trưởng nhóm (FR33)
        const m = await o.addMember({ topicId: pre.topicId, userId: pre.studentId, role, joinedAt: at });
        await o.bumpTopic(pre.topicId);
        await o.audit({ actorId: user.id, action: 'APPLICATION_ACCEPT', entityType: 'TopicApplication', entityId: id, before: { status: 'PENDING' }, after: { status: 'ACCEPTED', topicId: pre.topicId }, ip });
        await o.audit({ actorId: user.id, action: 'MEMBER_JOIN', entityType: 'TopicMember', entityId: m.id, before: null, after: { topicId: pre.topicId, userId: pre.studentId, role, applicationId: id }, ip });
        // 6. G51: SV vừa chạm giới hạn → đơn chờ khác trong đợt tự rút, báo GVHD các đề tài đó
        if (active + 1 >= cfg.maxActiveTopicsPerStudent) {
          const others = await o.withdrawOtherPending(pre.studentId, row.roundId, id, at);
          for (const x of others) {
            await o.audit({ actorId: user.id, action: 'APPLICATION_WITHDRAW', entityType: 'TopicApplication', entityId: x.id, before: { status: 'PENDING' }, after: { status: 'WITHDRAWN', topicId: x.topicId, auto: true, acceptedApplicationId: id }, ip });
            await o.notify({ topicId: x.topicId, to: ['advisor'], actorId: user.id, type: 'APPLICATION_WITHDRAWN', key: `APPLICATION_WITHDRAWN:${x.id}`, link: `/de-tai/${x.topicId}`, title: (t) => `Đơn của ${pre.student.fullName} vào đề tài ${topicName(t)} tự rút: sinh viên đã được nhận vào đề tài khác` });
          }
        }
        await o.notify({ topicId: pre.topicId, userIds: [pre.studentId], actorId: user.id, type: 'APPLICATION_ACCEPTED', key: `APPLICATION_ACCEPTED:${id}`, link: `/de-tai/${pre.topicId}`, title: (t) => `Bạn đã được nhận vào nhóm đề tài ${topicName(t)}` });
      });
      return { ...(await view(id, user)), ...(await getTopic(user, pre.topicId)) };
    },

    // POST /api/applications/:id/decline – như accept bước 1, không cần RECRUITING; lý do bắt buộc (schema)
    async decline(user, id, body, ip) {
      const pre = await loadForAdvisor(user, id);
      await repo.appTx(async (o) => {
        await lockAsAdvisor(o, pre, user);
        if (!(await o.closeApplication(id, 'DECLINED', { reason: body.reason, decidedById: user.id, respondedAt: now() }))) throw closedApp();
        await o.audit({ actorId: user.id, action: 'APPLICATION_DECLINE', entityType: 'TopicApplication', entityId: id, before: { status: 'PENDING' }, after: { status: 'DECLINED', topicId: pre.topicId, reason: body.reason }, ip });
        await o.notify({ topicId: pre.topicId, userIds: [pre.studentId], actorId: user.id, type: 'APPLICATION_DECLINED', key: `APPLICATION_DECLINED:${id}`, link: '/tuyen-sinh', title: (t) => `Đơn ứng tuyển đề tài ${topicName(t)} bị từ chối` });
      });
      return view(id, user);
    },

    // GET /api/applications (§4.2): SV đơn của mình; GV đơn vào đề tài mình là GVHD hiện hành; cán bộ trong phạm vi (chỉ đọc)
    async list(user, q) {
      const topic = {
        ...(user.role === 'LECTURER' && { advisings: { some: { lecturerId: user.id, endAt: null } } }),
        ...(user.role === 'STAFF' && { facultyId: { in: user.staffFacultyIds ?? [] }, status: { not: 'DRAFT' } }),
        ...(q.roundId && { roundId: q.roundId }),
      };
      const scope = user.role === 'STUDENT' ? { studentId: user.id } : {};
      return page(query(q, { ...scope, topic }), q, user);
    },

    // GET /api/topics/:id/applications – GVHD hiện hành, cán bộ trong phạm vi; còn lại 403
    async listForTopic(user, topicId, q) {
      const t = await repo.findDetail(topicId);
      if (!t) throw notFound();
      const rel = relations(t, user);
      if (!(rel.isCurrentAdvisor || (rel.inStaffScope && t.status !== 'DRAFT'))) throw forbidden();
      return page(query({ ...q, topicId }, {}), q, user);
    },
  };
};
