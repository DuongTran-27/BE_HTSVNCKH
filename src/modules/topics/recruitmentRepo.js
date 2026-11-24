// Đề tài GV công bố (FR31, API_GD7 §3.3–3.4) và bảng tin (§4.2). `applyRecruitment` chạy applyTransition (withLockTx); `extra` nhận ops gắn với tx.
import { recordAudit } from '../audit/service.js';
import { applyTransition } from './stateMachine.js';
import { lockUsers, countLecturerActive } from './advisorRepo.js';
import { notifyTopic } from '../notifications/notify.js';
import { byId } from './applicationRepo.js';

const ops = (db) => ({
  // Cùng khóa User GV FOR NO KEY UPDATE như ACCEPT_ADVISING / duyệt thay GV (§3.5 #9)
  lockUsers: (ids) => lockUsers(db, ids),
  countLecturerActive: (lecturerId, roundId) => countLecturerActive(db, lecturerId, roundId),
  liveMembers: (topicId) => db.topicMember.findMany({ where: { topicId, leftAt: null }, select: { id: true, userId: true, role: true }, orderBy: { id: 'asc' } }),
  removeMembers: (ids, leftAt) => db.topicMember.updateMany({ where: { id: { in: ids }, leftAt: null }, data: { leftAt } }),
  // Từ chối mọi đơn đang chờ; RETURNING = đúng các dòng thật sự cập nhật (m1 BM DC-06) – đơn SV vừa rút không bị báo "từ chối"
  declinePendingApplications: async (topicId, { reason, decidedById, respondedAt }) => byId(await db.$queryRaw`
    UPDATE "TopicApplication" SET status = 'DECLINED', reason = ${reason}, "decidedById" = ${decidedById}, "respondedAt" = ${respondedAt}
    WHERE "topicId" = ${topicId} AND status = 'PENDING' RETURNING id, "studentId"`),
  audit: (entry) => recordAudit(db, entry),
  notify: (args) => notifyTopic(db, args), // FR13, cùng tx
});

// Bảng tin: không chọn thành viên, ứng viên, số đơn (FR08, §4.2); myApplication chỉ đơn của chính SV
const boardSelect = (studentId) => ({
  id: true, code: true, title: true, summary: true, objectives: true, keywords: true, requirements: true, recruitSlots: true, updatedAt: true,
  field: { select: { id: true, name: true } },
  round: { select: { id: true, name: true, regOpenAt: true, regCloseAt: true, config: true } }, // config: hạn mức ứng tuyển (§4.3), không trả ra ngoài
  advisings: { where: { endAt: null }, take: 1, select: { lecturer: { select: { id: true, fullName: true } } } },
  _count: { select: { members: { where: { leftAt: null } } } },
  ...(studentId && {
    applications: { where: { studentId, status: { not: 'WITHDRAWN' } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1, select: { id: true, status: true } },
  }),
});

export const createRecruitmentRepo = (prisma) => ({
  applyRecruitment: (args, extra) => applyTransition(prisma, { ...args, extra: (tx) => extra(ops(tx)) }),
  listRecruitments: async ({ where, skip, take, studentId }) => {
    const [items, total] = await Promise.all([
      prisma.topic.findMany({ where, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], skip, take, select: boardSelect(studentId) }),
      prisma.topic.count({ where }),
    ]);
    return { items, total };
  },
  findRecruitment: (where, studentId) => prisma.topic.findFirst({ where, select: boardSelect(studentId) }),
});
