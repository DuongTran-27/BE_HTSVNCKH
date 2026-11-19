// Hội đồng nghiệm thu (FR35 – API_GD7 §6): lập, đổi tên/thành viên, gán đề tài (tất cả hoặc không), hủy phân công.
// Ghi: STAFF trong phạm vi khoa của hội đồng. Đọc: STAFF trong phạm vi hoặc thành viên hội đồng. ADMIN 403 ở route (FR25).
// Xung đột lợi ích (GVHD hiện hành ngồi hội đồng chấm đề tài của mình) kiểm dưới khóa khi gán và khi đổi thành viên.
import { Prisma } from '@prisma/client';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { topicName } from '../notifications/notify.js';

const ROLE_ORDER = { CHAIR: 0, SECRETARY: 1, MEMBER: 2 };
const iso = (d) => d?.toISOString() ?? null;
const fail = (details) => badRequest('VALIDATION_ERROR', 'Dữ liệu không hợp lệ', details);
const CONCURRENT = () => conflict('CONCURRENT_UPDATE', 'Dữ liệu vừa được người khác cập nhật, vui lòng tải lại');
const alreadyAssigned = (topicCodes) => conflict('TOPIC_ALREADY_ASSIGNED', 'Đề tài đã được phân công cho một hội đồng', { topicCodes });
const conflictOfInterest = (conflicts) => conflict('CONFLICT_OF_INTEREST',
  `Không thể gán. ${conflicts.map((c) => `${c.lecturerName} là GVHD của đề tài ${c.topicCode}`).join('; ')}`, { conflicts });
const inScope = (user, facultyId) => user.role === 'STAFF' && !!user.staffFacultyIds?.includes(facultyId);
const sortMembers = (ms) => [...ms].sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.lecturerId.localeCompare(b.lecturerId));
const memberSet = (ms) => sortMembers(ms).map((m) => ({ lecturerId: m.lecturerId, role: m.role }));
const link = (id) => `/hoi-dong/${id}`;

const presentAssignment = (a, memberCount) => ({
  id: a.id,
  topic: { id: a.topic.id, code: a.topic.code, title: a.topic.title, status: a.topic.status },
  advisor: a.topic.advisings[0] ? { fullName: a.topic.advisings[0].lecturer.fullName } : null,
  scoredCount: a._count.scores, memberCount,
  finalScore: a.finalScore?.toFixed(2) ?? null, decision: a.decision, decidedAt: iso(a.decidedAt), cancelledAt: iso(a.cancelledAt),
});
// CouncilView (§6.1); danh sách: không có assignments, thêm assignmentCount
export const presentCouncil = (c) => ({
  id: c.id, code: c.code, name: c.name, version: c.version,
  round: { id: c.round.id, name: c.round.name, academicYear: c.round.academicYear },
  members: sortMembers(c.members).map((m) => ({ lecturerId: m.lecturerId, fullName: m.lecturer.fullName, role: m.role })),
  ...(c.assignments ? { assignments: c.assignments.map((a) => presentAssignment(a, c.members.length)) } : { assignmentCount: c._count.assignments }),
  locked: c.locked, createdAt: iso(c.createdAt),
});

// GV hội đồng: LECTURER không khóa, cùng khoa với đợt (§6.2) – không thì 400 tại `members`
const assertLecturers = async (repo, members, facultyId) => {
  const ids = members.map((m) => m.lecturerId);
  const ok = (await repo.findLecturers(ids)).filter((u) => u.role === 'LECTURER' && !u.isLocked && u.facultyId === facultyId);
  if (ok.length !== ids.length) throw fail({ members: 'Giảng viên không hợp lệ' });
};

export const createCouncilService = ({ repo, now = () => new Date() }) => {
  const view = async (id, opts) => ({ council: presentCouncil(await repo.findCouncil(id, opts)) });
  // Ghi: hội đồng tồn tại (404) và thuộc khoa trong phạm vi (403)
  const loadForStaff = async (user, id) => {
    const c = await repo.findCouncilBrief(id);
    if (!c) throw notFound();
    if (!inScope(user, c.facultyId)) throw forbidden();
    return c;
  };

  return {
    // POST /api/councils (§6.2)
    async create(user, body, ip) {
      const round = await repo.findRound(body.roundId);
      if (!round) throw fail({ roundId: 'Đợt không tồn tại' });
      if (!inScope(user, round.facultyId)) throw forbidden();
      await assertLecturers(repo, body.members, round.facultyId);
      const members = memberSet(body.members);
      const id = await repo.councilTx(async (o) => {
        const code = await o.nextCode(round.academicYear);
        const c = await o.createCouncil({ code, name: body.name, facultyId: round.facultyId, roundId: round.id, createdById: user.id, members: { create: members } });
        await o.audit({ actorId: user.id, action: 'COUNCIL_CREATE', entityType: 'Council', entityId: c.id, before: null, after: { code, name: body.name, roundId: round.id, members }, ip });
        await o.notify(members.map((m) => ({ userId: m.lecturerId, type: 'COUNCIL_MEMBER_ADDED', title: `Bạn được mời vào ${body.name} (${code})`, link: link(c.id), dedupeKey: `COUNCIL_MEMBER_ADDED:${c.id}:v0` })), user.id);
        return c.id;
      });
      return view(id);
    },

    // PATCH /api/councils/:id – đổi tên, khóa lạc quan version
    async rename(user, id, body, ip) {
      await loadForStaff(user, id);
      await repo.councilTx(async (o) => {
        const c = await o.lockCouncil(id);
        if (c.version !== body.version || !(await o.bumpCouncil(id, body.version, { name: body.name }))) throw CONCURRENT();
        await o.audit({ actorId: user.id, action: 'COUNCIL_UPDATE', entityType: 'Council', entityId: id, before: { name: c.name }, after: { name: body.name }, ip });
      });
      return view(id);
    },

    // PUT /api/councils/:id/members (§6.2): thay toàn bộ
    async setMembers(user, id, body, ip) {
      const pre = await loadForStaff(user, id);
      await assertLecturers(repo, body.members, pre.facultyId);
      const after = memberSet(body.members);
      await repo.councilTx(async (o) => {
        const c = await o.lockCouncil(id); // FOR UPDATE: chặn gán/chấm/chốt đang chạy (FOR SHARE) cho tới khi xong
        if (c.version !== body.version) throw CONCURRENT();
        if (await o.hasScores(id)) throw conflict('COUNCIL_LOCKED', 'Hội đồng đã có điểm, không đổi được thành viên');
        const ids = new Set(after.map((m) => m.lecturerId));
        const conflicts = (await o.openAssignmentAdvisors(id)).flatMap((a) => a.topic.advisings
          .filter((x) => ids.has(x.lecturerId)).map((x) => ({ topicCode: a.topic.code, lecturerName: x.lecturer.fullName })));
        if (conflicts.length) throw conflictOfInterest(conflicts);
        const before = memberSet(await o.members(id));
        await o.replaceMembers(id, after);
        if (!(await o.bumpCouncil(id, body.version))) throw CONCURRENT();
        await o.audit({ actorId: user.id, action: 'COUNCIL_MEMBERS_SET', entityType: 'Council', entityId: id, before: { members: before }, after: { members: after }, ip });
        const had = new Set(before.map((m) => m.lecturerId));
        const key = (type) => `${type}:${id}:v${body.version + 1}`;
        await o.notify([
          ...after.filter((m) => !had.has(m.lecturerId)).map((m) => ({ userId: m.lecturerId, type: 'COUNCIL_MEMBER_ADDED', title: `Bạn được mời vào ${c.name} (${c.code})`, link: link(id), dedupeKey: key('COUNCIL_MEMBER_ADDED') })),
          ...before.filter((m) => !ids.has(m.lecturerId)).map((m) => ({ userId: m.lecturerId, type: 'COUNCIL_MEMBER_REMOVED', title: `Bạn không còn trong ${c.name} (${c.code})`, link: '/thong-bao', dedupeKey: key('COUNCIL_MEMBER_REMOVED') })),
        ], user.id);
      });
      return view(id);
    },

    // POST /api/councils/:id/assignments (§6.3): tất cả hoặc không (UC16) – lỗi ở bất kỳ đề tài nào → rollback cả lô
    async assign(user, id, body, ip) {
      await loadForStaff(user, id);
      const topicIds = [...body.topicIds].sort();
      await repo.councilTx(async (o) => {
        const c = await o.lockCouncilShare(id);
        const rows = await o.lockTopics(topicIds);
        if (rows.length !== topicIds.length || rows.some((t) => t.facultyId !== c.facultyId || t.roundId !== c.roundId)) {
          throw fail({ topicIds: 'Đề tài không thuộc đợt của hội đồng' });
        }
        const notWaiting = rows.filter((t) => t.status !== 'WAITING_DEFENSE').map((t) => t.code);
        if (notWaiting.length) throw conflict('NOT_WAITING_DEFENSE', 'Chỉ phân công/chấm khi đề tài đang chờ bảo vệ', { topicCodes: notWaiting });
        // GVHD hiện hành đọc sau khóa Topic (thay GV khóa cùng dòng; ở WAITING_DEFENSE không thay được – G35)
        const memberIds = new Set((await o.members(id)).map((m) => m.lecturerId));
        const code = new Map(rows.map((t) => [t.id, t.code]));
        const conflicts = (await o.currentAdvisors(topicIds)).filter((a) => memberIds.has(a.lecturerId))
          .map((a) => ({ topicCode: code.get(a.topicId), lecturerName: a.lecturer.fullName }));
        if (conflicts.length) throw conflictOfInterest(conflicts);
        for (const topicId of topicIds) {
          let a;
          try {
            a = await o.createAssignment({ councilId: id, topicId, assignedById: user.id });
          } catch (e) {
            // Index council_assignment_one_open là chốt chặn duy nhất; lỗi rollback cả lô
            if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw alreadyAssigned([code.get(topicId)]);
            throw e;
          }
          await o.audit({ actorId: user.id, action: 'COUNCIL_ASSIGN', entityType: 'CouncilAssignment', entityId: a.id, before: null, after: { councilId: id, topicId }, ip });
          await o.notifyTopic({ topicId, to: ['advisor', 'members'], userIds: [...memberIds], actorId: user.id, type: 'COUNCIL_ASSIGNED', key: `COUNCIL_ASSIGNED:${a.id}`, link: `/de-tai/${topicId}`, title: (t) => `Đề tài ${topicName(t)} được phân công cho ${c.name}` });
        }
      });
      return view(id);
    },

    // POST /api/council-assignments/:id/cancel (§6.4): chỉ phân công mở, chưa có điểm (có điểm thì dùng RETURN_FROM_DEFENSE)
    async cancelAssignment(user, id, body, ip) {
      const a = await repo.findAssignmentBrief(id);
      if (!a) throw notFound();
      if (!inScope(user, a.council.facultyId)) throw forbidden();
      await repo.councilTx(async (o) => {
        await o.lockCouncilShare(a.councilId);
        await o.lockTopic(a.topicId); // cùng chiều Topic → Assignment với RETURN_FROM_DEFENSE và chốt (DC-09)
        const s = await o.assignmentState(id);
        if (s.decidedAt || s.cancelledAt) throw conflict('ASSIGNMENT_DECIDED', s.decidedAt ? 'Hội đồng đã chốt kết quả đề tài này' : 'Phân công đã bị hủy');
        if (s._count.scores > 0) throw conflict('ASSIGNMENT_HAS_SCORES', 'Đề tài đã có điểm, không hủy phân công được');
        if (!(await o.cancelAssignment(id, now(), body.reason))) throw conflict('ASSIGNMENT_DECIDED', 'Phân công đã bị hủy');
        await o.audit({ actorId: user.id, action: 'COUNCIL_UNASSIGN', entityType: 'CouncilAssignment', entityId: id, before: { cancelledAt: null }, after: { councilId: a.councilId, topicId: a.topicId, reason: body.reason }, ip });
        const memberIds = (await o.members(a.councilId)).map((m) => m.lecturerId);
        await o.notifyTopic({ topicId: a.topicId, userIds: memberIds, actorId: user.id, type: 'COUNCIL_UNASSIGNED', key: `COUNCIL_UNASSIGNED:${id}`, link: link(a.councilId), title: (t) => `Đề tài ${topicName(t)} không còn được phân công cho ${a.council.name}` });
      });
      return view(a.councilId, { includeCancelled: true });
    },

    // GET /api/councils (§6.5): STAFF khoa trong phạm vi; LECTURER hội đồng mình là thành viên
    async list(user, q) {
      const scope = user.role === 'STAFF' ? { facultyId: { in: user.staffFacultyIds ?? [] } } : { members: { some: { lecturerId: user.id } } };
      const where = {
        AND: [scope, ...(q.roundId ? [{ roundId: q.roundId }] : []),
          ...(q.q ? [{ OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { code: { contains: q.q, mode: 'insensitive' } }] }] : [])],
      };
      const { total, rows } = await repo.listCouncils({ where, skip: (q.page - 1) * q.pageSize, take: q.pageSize });
      return { items: rows.map(presentCouncil), page: q.page, pageSize: q.pageSize, total };
    },

    // GET /api/councils/:id – STAFF trong phạm vi (được xem cả phân công đã hủy) hoặc thành viên hội đồng
    async get(user, id, q) {
      const c = await repo.findCouncilBrief(id);
      if (!c) throw notFound();
      const staff = inScope(user, c.facultyId);
      if (!staff && !c.members.some((m) => m.lecturerId === user.id)) throw forbidden();
      return view(id, { includeCancelled: staff && q.includeCancelled === 'true' });
    },
  };
};
