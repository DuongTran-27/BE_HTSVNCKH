// Đề nghị hướng dẫn (FR16, API_GD2 §5.5, §6). `apply` chạy applyTransition (qua withLockTx); `extra` nhận ops gắn với tx.
import { Prisma } from '@prisma/client';
import { INACTIVE_STATUSES } from '@nckh/shared';
import { recordAudit } from '../audit/service.js';
import { applyTransition } from './stateMachine.js';
import { groupOps } from './groupRepo.js';
import { notifyTopic } from '../notifications/notify.js';

const person = { select: { id: true, code: true, fullName: true } };
const activeTopic = (roundId) => ({ roundId, status: { notIn: INACTIVE_STATUSES } });

const ops = (db) => ({
  findUser: (id) => db.user.findUnique({ where: { id }, select: { id: true, role: true, isLocked: true, facultyId: true } }),
  // Khóa User mức NO KEY UPDATE, id tăng dần (§1.8), sau khóa Topic
  lockUsers: (ids) => db.$queryRaw`SELECT id FROM "User" WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR NO KEY UPDATE`,
  liveMembers: (topicId) => db.topicMember.findMany({ where: { topicId, leftAt: null }, select: { userId: true, user: { select: { code: true } } }, orderBy: { userId: 'asc' } }),
  // Đếm bằng câu riêng, sau khóa; không tính chính đề tài đang chuyển
  countStudentActive: (userId, roundId, exceptTopicId) => groupOps(db).countActiveTopics(userId, roundId, exceptTopicId),
  countLecturerActive: (lecturerId, roundId) => db.advising.count({ where: { lecturerId, endAt: null, topic: activeTopic(roundId) } }),
  createRequest: (data) => db.advisorRequest.create({ data }),
  withdrawPendingInvitations: (topicId, at) => db.invitation.updateMany({ where: { topicId, status: 'PENDING' }, data: { status: 'WITHDRAWN', respondedAt: at } }),
  // Chỉ một đề nghị PENDING mỗi đề tài; count 0 = đã bị xử lý
  closeRequest: async (topicId, status, data) =>
    (await db.advisorRequest.updateMany({ where: { topicId, status: 'PENDING' }, data: { status, ...data } })).count === 1,
  createAdvising: (data) => db.advising.create({ data }),
  audit: (entry) => recordAudit(db, entry),
  notify: (args) => notifyTopic(db, args), // FR13, cùng tx
});

export const createAdvisorRepo = (prisma) => ({
  findUser: (id) => prisma.user.findUnique({ where: { id }, select: { id: true, role: true, isLocked: true, facultyId: true } }),
  apply: (args, extra) => applyTransition(prisma, { ...args, extra: (tx) => extra(ops(tx), tx) }),

  listRequests: async ({ where, skip, take }) => {
    const [items, total] = await Promise.all([
      prisma.advisorRequest.findMany({
        where, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], skip, take,
        include: { lecturer: person, topic: { select: { id: true, code: true, title: true, status: true, version: true, round: { select: { id: true, name: true } } } } },
      }),
      prisma.advisorRequest.count({ where }),
    ]);
    return { items, total };
  },
  listLecturers: async ({ round, q, skip, take }) => {
    const where = {
      role: 'LECTURER', isLocked: false, facultyId: round.facultyId,
      ...(q && { OR: [{ fullName: { contains: q, mode: 'insensitive' } }, { code: { contains: q, mode: 'insensitive' } }] }),
    };
    const [items, total] = await Promise.all([
      prisma.user.findMany({ where, orderBy: [{ fullName: 'asc' }, { id: 'asc' }], skip, take, select: { id: true, code: true, fullName: true } }),
      prisma.user.count({ where }),
    ]);
    const counts = await prisma.advising.groupBy({
      by: ['lecturerId'], _count: { _all: true },
      where: { lecturerId: { in: items.map((u) => u.id) }, endAt: null, topic: activeTopic(round.id) },
    });
    const byId = new Map(counts.map((c) => [c.lecturerId, c._count._all]));
    return { items: items.map((u) => ({ ...u, activeTopicCount: byId.get(u.id) ?? 0 })), total };
  },
});
