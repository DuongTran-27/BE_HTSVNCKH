// Nhóm, lời mời, trưởng nhóm (FR03, API_GD2 §5.3–5.4). Phần có khóa chạy qua lockTx: service nhận `ops` gắn với tx.
import { INACTIVE_STATUSES } from '@nckh/shared';
import { recordAudit } from '../audit/service.js';
import { withLockTx } from '../../lib/tx.js';

const person = { select: { id: true, code: true, fullName: true } };
const LIVE = { leftAt: null };

const ops = (db) => ({
  // Khóa Topic mức NO KEY UPDATE; trả null nếu không có
  lockTopic: async (id) => (await db.$queryRaw`SELECT id, status FROM "Topic" WHERE id = ${id} FOR NO KEY UPDATE`)[0] ?? null,
  // updateMany có điều kiện = câu khóa đồng thời tăng version; trả true nếu khớp
  bumpTopic: async (where) => (await db.topic.updateMany({ where, data: { version: { increment: 1 } } })).count === 1,
  findGroup: (id) => db.topic.findUnique({ where: { id }, select: { id: true, status: true, version: true, code: true, title: true, round: true, members: { where: LIVE, select: { userId: true, role: true } } } }),
  findStudentByCode: (code) => db.user.findFirst({ where: { code: { equals: code, mode: 'insensitive' } }, select: { id: true, code: true, fullName: true, role: true, isLocked: true, facultyId: true } }),
  countMembers: (topicId) => db.topicMember.count({ where: { topicId, ...LIVE } }),
  countPendingInvitations: (topicId) => db.invitation.count({ where: { topicId, status: 'PENDING' } }),
  hasPendingInvitation: async (topicId, inviteeId) => !!(await db.invitation.findFirst({ where: { topicId, inviteeId, status: 'PENDING' }, select: { id: true } })),
  createInvitation: (data) => db.invitation.create({ data, include: { invitee: person, topic: { select: { id: true, code: true, title: true } } } }),
  // Số đề tài hoạt động của SV trong đợt, không tính đề tài `exceptTopicId`
  countActiveTopics: (userId, roundId, exceptTopicId) =>
    db.topic.count({ where: { roundId, id: { not: exceptTopicId }, status: { notIn: INACTIVE_STATUSES }, members: { some: { userId, ...LIVE } } } }),
  // Cập nhật có điều kiện PENDING (§5.3): count 1 = bên này thắng
  closeInvitation: async (id, status, respondedAt) =>
    (await db.invitation.updateMany({ where: { id, status: 'PENDING' }, data: { status, respondedAt } })).count === 1,
  addMember: (topicId, userId) => db.topicMember.create({ data: { topicId, userId, role: 'MEMBER' } }),
  // Đổi LEADER cũ -> MEMBER TRƯỚC, đích -> LEADER SAU (partial unique index không deferrable)
  setLeader: async (topicId, oldId, newId) => {
    await db.topicMember.updateMany({ where: { topicId, userId: oldId, ...LIVE }, data: { role: 'MEMBER' } });
    await db.topicMember.updateMany({ where: { topicId, userId: newId, ...LIVE }, data: { role: 'LEADER' } });
  },
  audit: (entry) => recordAudit(db, entry),
});

export const createGroupRepo = (prisma) => ({
  lockTx: (fn) => withLockTx(prisma, (tx) => fn(ops(tx))),
  tx: (fn) => prisma.$transaction((tx) => fn(ops(tx))),
  read: ops(prisma),
  findInvitation: (id) => prisma.invitation.findUnique({
    where: { id },
    include: { invitee: person, topic: { select: { id: true, code: true, title: true, status: true, members: { where: { ...LIVE, role: 'LEADER' }, select: { userId: true } } } } },
  }),
  listInvitations: async ({ inviteeId, status, skip, take }) => {
    const where = { inviteeId, ...(status && { status }) };
    const [items, total] = await Promise.all([
      prisma.invitation.findMany({
        where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip, take,
        include: { topic: { select: { id: true, code: true, title: true, round: { select: { id: true, name: true } }, members: { where: LIVE, select: { role: true, user: person } } } } },
      }),
      prisma.invitation.count({ where }),
    ]);
    return { items, total };
  },
});
