// Đề tài GV công bố (FR31, API_GD7 §3.3–3.4) và bảng tin (§4.2). `applyRecruitment` chạy applyTransition (withLockTx); `extra` nhận ops gắn với tx.
import { recordAudit } from '../audit/service.js';
import { applyTransition } from './stateMachine.js';
import { lockUsers, countLecturerActive } from './advisorRepo.js';
import { notifyTopic } from '../notifications/notify.js';

const ops = (db) => ({
  // Cùng khóa User GV FOR NO KEY UPDATE như ACCEPT_ADVISING / duyệt thay GV (§3.5 #9)
  lockUsers: (ids) => lockUsers(db, ids),
  countLecturerActive: (lecturerId, roundId) => countLecturerActive(db, lecturerId, roundId),
  liveMembers: (topicId) => db.topicMember.findMany({ where: { topicId, leftAt: null }, select: { id: true, userId: true }, orderBy: { id: 'asc' } }),
  removeMembers: (ids, leftAt) => db.topicMember.updateMany({ where: { id: { in: ids }, leftAt: null }, data: { leftAt } }),
  pendingApplications: (topicId) => db.topicApplication.findMany({ where: { topicId, status: 'PENDING' }, select: { id: true, studentId: true }, orderBy: { id: 'asc' } }),
  declineApplications: (ids, data) => db.topicApplication.updateMany({ where: { id: { in: ids }, status: 'PENDING' }, data: { status: 'DECLINED', ...data } }),
  audit: (entry) => recordAudit(db, entry),
  notify: (args) => notifyTopic(db, args), // FR13, cùng tx
});

// Bảng tin: không chọn thành viên, ứng viên, số đơn (FR08, §4.2); myApplication chỉ đơn của chính SV
const boardSelect = (studentId) => ({
  id: true, code: true, title: true, summary: true, objectives: true, keywords: true, requirements: true, recruitSlots: true, updatedAt: true,
  field: { select: { id: true, name: true } },
  round: { select: { id: true, name: true, regOpenAt: true, regCloseAt: true } },
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
