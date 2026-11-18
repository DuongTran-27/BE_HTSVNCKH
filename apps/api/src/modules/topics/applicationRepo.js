// Đơn ứng tuyển (FR32, FR33 – API_GD7 §4.3–4.4). Phần ghi chạy trong withLockTx; service nhận `ops` gắn với tx.
import { recordAudit } from '../audit/service.js';
import { withLockTx } from '../../lib/tx.js';
import { lockUsers } from './advisorRepo.js';
import { groupOps } from './groupRepo.js';
import { notifyTopic } from '../notifications/notify.js';

const LIVE = { leftAt: null };
const appOps = (db) => ({
  // M3 BM: FOR SHARE – nhiều SV ứng tuyển không chặn nhau, nhưng xung đột với khóa ghi của chốt nhóm/ngừng tuyển/duyệt đơn
  lockTopicShare: async (id) => (await db.$queryRaw`SELECT id, status, "facultyId" FROM "Topic" WHERE id = ${id} FOR SHARE`)[0] ?? null,
  lockTopic: async (id) => (await db.$queryRaw`SELECT id, status, "facultyId", "roundId", "recruitSlots" FROM "Topic" WHERE id = ${id} FOR NO KEY UPDATE`)[0] ?? null,
  roundConfig: async (roundId) => (await db.round.findUnique({ where: { id: roundId }, select: { config: true } }))?.config,
  isCurrentAdvisor: async (topicId, lecturerId) => (await db.advising.count({ where: { topicId, lecturerId, endAt: null } })) > 0,
  isMember: async (topicId, userId) => (await db.topicMember.count({ where: { topicId, userId, ...LIVE } })) > 0,
  countMembers: (topicId) => db.topicMember.count({ where: { topicId, ...LIVE } }),
  countActiveTopics: (userId, roundId, exceptTopicId) => groupOps(db).countActiveTopics(userId, roundId, exceptTopicId),
  lockUsers: (ids) => lockUsers(db, ids), // cùng khóa User FOR NO KEY UPDATE với REQUEST_ADVISOR (§4.6 #11)
  findUser: (id) => db.user.findUnique({ where: { id }, select: { id: true, isLocked: true, facultyId: true } }),
  createApplication: (data) => db.topicApplication.create({ data, select: { id: true } }),
  // Cập nhật có điều kiện PENDING: true = bên này thắng
  closeApplication: async (id, status, data) => (await db.topicApplication.updateMany({ where: { id, status: 'PENDING' }, data: { status, ...data } })).count === 1,
  addMember: (data) => db.topicMember.create({ data }),
  bumpTopic: (id) => db.topic.update({ where: { id }, data: { version: { increment: 1 } } }),
  // G51: đơn chờ khác của SV trong cùng đợt
  otherPending: (studentId, roundId, exceptId) => db.topicApplication.findMany({ where: { studentId, status: 'PENDING', id: { not: exceptId }, topic: { roundId } }, select: { id: true, topicId: true }, orderBy: { id: 'asc' } }),
  withdrawApplications: (ids, respondedAt) => db.topicApplication.updateMany({ where: { id: { in: ids }, status: 'PENDING' }, data: { status: 'WITHDRAWN', respondedAt } }),
  audit: (entry) => recordAudit(db, entry),
  notify: (args) => notifyTopic(db, args), // FR13, cùng tx
});

// ApplicationView (§4.1): SV chỉ mã, họ tên, mã lớp – không email, SĐT (FR30)
const VIEW = {
  id: true, status: true, coverLetter: true, reason: true, createdAt: true, respondedAt: true, studentId: true, topicId: true,
  topic: { select: { id: true, code: true, title: true, status: true, facultyId: true, advisings: { where: { endAt: null }, select: { lecturerId: true } } } },
  student: { select: { id: true, code: true, fullName: true, class: { select: { code: true } } } },
};

export const createApplicationRepo = (prisma) => ({
  appTx: (fn) => withLockTx(prisma, (tx) => fn(appOps(tx))),
  appRead: appOps(prisma),
  findApplication: (id) => prisma.topicApplication.findUnique({ where: { id }, select: VIEW }),
  listApplications: async ({ where, skip, take }) => {
    const [items, total] = await Promise.all([
      prisma.topicApplication.findMany({ where, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], skip, take, select: VIEW }),
      prisma.topicApplication.count({ where }),
    ]);
    return { items, total };
  },
});
