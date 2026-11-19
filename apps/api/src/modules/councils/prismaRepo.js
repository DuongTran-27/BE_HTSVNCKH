// Hội đồng nghiệm thu (FR35 – API_GD7 §6). Phần ghi chạy trong withLockTx; service nhận `ops` gắn với tx.
// Thứ tự khóa (§1.2): Council → Topic (id tăng dần).
import { Prisma } from '@prisma/client';
import { recordAudit } from '../audit/service.js';
import { withLockTx } from '../../lib/tx.js';
import { notify, notifyTopic } from '../notifications/notify.js';

const OPEN = { decidedAt: null, cancelledAt: null };
const MEMBERS = { select: { lecturerId: true, role: true, lecturer: { select: { fullName: true } } } };
const ROUND = { select: { id: true, name: true, academicYear: true } };
const ASSIGNMENT = {
  select: {
    id: true, finalScore: true, decision: true, decidedAt: true, cancelledAt: true, assignedAt: true, _count: { select: { scores: true } },
    topic: { select: { id: true, code: true, title: true, status: true, advisings: { where: { endAt: null }, take: 1, select: { lecturer: { select: { fullName: true } } } } } },
  },
};
// `locked` (§6.1): hội đồng đã có ít nhất một điểm bảo vệ
const scoredCouncilIds = async (db, ids) => new Set((await db.councilAssignment.findMany({
  where: { councilId: { in: ids }, scores: { some: {} } }, select: { councilId: true }, distinct: ['councilId'],
})).map((a) => a.councilId));

const ops = (db) => ({
  // HD-<năm học đầu>-<nnn>, sequence riêng như mã đề tài (FR05) – không trùng khi tạo đồng thời
  nextCode: async (academicYear) => {
    const [{ nextval }] = await db.$queryRaw`SELECT nextval('council_code_seq')`;
    return `HD-${academicYear.slice(0, 4)}-${String(Number(nextval)).padStart(3, '0')}`;
  },
  createCouncil: (data) => db.council.create({ data, select: { id: true, code: true } }),
  // FOR UPDATE khi đổi thành viên/tên; FOR SHARE khi gán/hủy gán (chặn đổi thành viên, các thao tác gán không chặn nhau)
  lockCouncil: async (id) => (await db.$queryRaw`SELECT id, code, version, name FROM "Council" WHERE id = ${id} FOR UPDATE`)[0] ?? null,
  lockCouncilShare: async (id) => (await db.$queryRaw`SELECT id, "facultyId", "roundId", name FROM "Council" WHERE id = ${id} FOR SHARE`)[0] ?? null,
  bumpCouncil: async (id, version, data = {}) => (await db.council.updateMany({ where: { id, version }, data: { ...data, version: { increment: 1 } } })).count === 1,
  hasScores: async (councilId) => (await db.defenseScore.count({ where: { assignment: { councilId } } })) > 0,
  members: (councilId) => db.councilMember.findMany({ where: { councilId }, select: { lecturerId: true, role: true } }),
  replaceMembers: async (councilId, members) => {
    await db.councilMember.deleteMany({ where: { councilId } }); // bảng liên kết; lịch sử ở AuditLog COUNCIL_MEMBERS_SET
    await db.councilMember.createMany({ data: members.map((m) => ({ councilId, ...m })) });
  },
  // Đề tài đang gán (phân công mở) + GVHD hiện hành – kiểm xung đột lợi ích khi đổi thành viên
  openAssignmentAdvisors: (councilId) => db.councilAssignment.findMany({
    where: { councilId, ...OPEN },
    select: { topic: { select: { code: true, advisings: { where: { endAt: null }, select: { lecturerId: true, lecturer: { select: { fullName: true } } } } } } },
  }),
  lockTopics: (ids) => db.$queryRaw`SELECT id, code, status, "facultyId", "roundId" FROM "Topic" WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR NO KEY UPDATE`,
  currentAdvisors: (topicIds) => db.advising.findMany({ where: { topicId: { in: topicIds }, endAt: null }, select: { topicId: true, lecturerId: true, lecturer: { select: { fullName: true } } } }),
  createAssignment: (data) => db.councilAssignment.create({ data, select: { id: true } }),
  lockTopic: async (id) => (await db.$queryRaw`SELECT id FROM "Topic" WHERE id = ${id} FOR NO KEY UPDATE`)[0] ?? null,
  assignmentState: (id) => db.councilAssignment.findUnique({ where: { id }, select: { decidedAt: true, cancelledAt: true, _count: { select: { scores: true } } } }),
  // Cập nhật có điều kiện còn mở: true = bên này thắng
  cancelAssignment: async (id, at, reason) => (await db.councilAssignment.updateMany({ where: { id, ...OPEN }, data: { cancelledAt: at, cancelReason: reason } })).count === 1,
  audit: (entry) => recordAudit(db, entry),
  notify: (items, actorId) => notify(db, items, actorId), // FR13, cùng tx
  notifyTopic: (args) => notifyTopic(db, args),
});

export const createCouncilRepo = (prisma) => ({
  councilTx: (fn) => withLockTx(prisma, (tx) => fn(ops(tx))),
  findLecturers: (ids) => prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, role: true, isLocked: true, facultyId: true } }),
  // Thông tin tối thiểu để kiểm quyền trước khóa (403 sớm)
  findCouncilBrief: (id) => prisma.council.findUnique({ where: { id }, select: { id: true, facultyId: true, members: { select: { lecturerId: true } } } }),
  findCouncil: async (id, { includeCancelled = false } = {}) => {
    const c = await prisma.council.findUnique({
      where: { id },
      include: { round: ROUND, members: MEMBERS, assignments: { where: includeCancelled ? {} : { cancelledAt: null }, orderBy: [{ assignedAt: 'asc' }, { id: 'asc' }], ...ASSIGNMENT } },
    });
    return c && { ...c, locked: (await scoredCouncilIds(prisma, [id])).has(id) };
  },
  listCouncils: async ({ where, skip, take }) => {
    const [total, rows] = await prisma.$transaction([
      prisma.council.count({ where }),
      prisma.council.findMany({
        where, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip, take,
        include: { round: ROUND, members: MEMBERS, _count: { select: { assignments: { where: { cancelledAt: null } } } } },
      }),
    ]);
    const scored = await scoredCouncilIds(prisma, rows.map((c) => c.id));
    return { total, rows: rows.map((c) => ({ ...c, locked: scored.has(c.id) })) };
  },
  findAssignmentBrief: (id) => prisma.councilAssignment.findUnique({ where: { id }, select: { id: true, councilId: true, topicId: true, council: { select: { facultyId: true, name: true } } } }),
});
