// Thông báo FR13 (API_GD45 §8.1, §8.4). Mọi truy vấn của người dùng đều lọc theo userId = chính mình.
import { Prisma } from '@prisma/client';
import { notify, staffIdsOf } from './notify.js';

const person = { where: { leftAt: null }, select: { userId: true } };

export const createNotificationRepo = (prisma) => ({
  listNotifications: async ({ userId, readFilter, skip, take }) => {
    const where = { userId, ...readFilter };
    const [items, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip, take, select: { id: true, type: true, title: true, link: true, readAt: true, createdAt: true } }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return { items, total, unreadCount };
  },
  countUnread: (userId) => prisma.notification.count({ where: { userId, readAt: null } }),
  markRead: async (userId, id, at) => (await prisma.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: at } })).count,
  ownsNotification: async (userId, id) => !!(await prisma.notification.findFirst({ where: { id, userId }, select: { id: true } })),
  markAllRead: (userId, at) => prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: at } }),

  // ---- Nhắc hạn (§8.4) ----
  // Mốc chưa Đạt của đề tài IN_PROGRESS, hạn ≤ until. Mới nhất trước: khi chạm trần, mốc quá hạn lâu (đã được nhắc ở lần chạy trước) bị bỏ trước.
  findDueMilestones: (until, take) => prisma.milestone.findMany({
    where: { dueAt: { lte: until }, evaluation: { not: 'PASSED' }, topic: { status: 'IN_PROGRESS' } },
    orderBy: [{ dueAt: 'desc' }, { id: 'asc' }], take,
    select: {
      id: true, name: true, dueAt: true, topicId: true,
      topic: { select: { code: true, title: true, round: { select: { config: true } }, members: person, advisings: { where: { endAt: null }, select: { lecturerId: true } } } },
      documents: { where: { status: 'READY' }, orderBy: { uploadedAt: 'desc' }, take: 1, select: { uploadedAt: true } },
      feedbacks: { where: { evaluation: 'NEEDS_WORK' }, orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
    },
  }),
  findStaleAdvisorRequests: (before, take) => prisma.advisorRequest.findMany({
    where: { status: 'PENDING', remindedAt: null, createdAt: { lte: before } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take,
    select: { id: true, lecturerId: true, createdAt: true, topicId: true, topic: { select: { code: true, title: true, facultyId: true, round: { select: { config: true } } } } },
  }),
  // Mỗi phần một transaction ngắn; ops gắn với tx
  reminderTx: (fn) => prisma.$transaction((tx) => fn({
    notify: (items) => notify(tx, items),
    staffIdsOf: (facultyId) => staffIdsOf(tx, facultyId),
    // Đánh dấu có điều kiện remindedAt IS NULL: hai lần chạy chồng nhau chỉ một bên nhận được id (FR16.4 "nhắc một lần")
    markReminded: async (ids, at) => ids.length
      ? (await tx.$queryRaw`UPDATE "AdvisorRequest" SET "remindedAt" = ${at} WHERE id IN (${Prisma.join(ids)}) AND "remindedAt" IS NULL AND status = 'PENDING' RETURNING id`).map((r) => r.id)
      : [],
  }), { timeout: 30000 }),
});
