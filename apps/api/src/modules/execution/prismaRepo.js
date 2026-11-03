// Mốc thực hiện (FR09, API_GD45 §3). Service nhận repo này; `writeMilestone` chạy trong withLockTx với câu khóa Topic đầu tiên.
import { withLockTx } from '../../lib/tx.js';
import { recordAudit } from '../audit/service.js';
import { lockTopicForExecution } from './lock.js';

const person = { select: { id: true, fullName: true, role: true } };
const VIEW_INCLUDE = {
  documents: { where: { status: 'READY' }, orderBy: { version: 'desc' }, take: 1, select: { id: true, version: true, uploadedAt: true, isLate: true } },
  _count: { select: { dueChanges: true } },
};

const ops = (tx) => ({
  countMilestones: (topicId) => tx.milestone.count({ where: { topicId } }),
  maxOrder: async (topicId) => (await tx.milestone.aggregate({ where: { topicId }, _max: { order: true } }))._max.order ?? 0,
  create: (data) => tx.milestone.create({ data }),
  findMilestone: (id) => tx.milestone.findUnique({ where: { id } }),
  // Khóa lạc quan theo version của mốc; count 0 = lệch
  updateVersioned: async (id, version, data) => (await tx.milestone.updateMany({ where: { id, version }, data: { ...data, version: { increment: 1 } } })).count === 1,
  createDueChange: (data) => tx.milestoneDueChange.create({ data }),
  audit: (entry) => recordAudit(tx, entry),
});

export const createExecutionRepo = (prisma) => ({
  // Đề tài + quan hệ tối thiểu để tính quyền (cùng hình dạng `relations` của topics/service.js)
  findExecTopic: (id) => prisma.topic.findUnique({
    where: { id },
    select: {
      id: true, status: true, facultyId: true,
      members: { where: { leftAt: null }, select: { userId: true, role: true } },
      advisings: { where: { endAt: null }, take: 1, select: { lecturerId: true } },
    },
  }),
  findMilestoneTopicId: async (id) => (await prisma.milestone.findUnique({ where: { id }, select: { topicId: true } }))?.topicId ?? null,
  listMilestones: (topicId) => prisma.milestone.findMany({ where: { topicId }, orderBy: { order: 'asc' }, include: VIEW_INCLUDE }),
  viewMilestone: (id) => prisma.milestone.findUnique({ where: { id }, include: VIEW_INCLUDE }),
  listDueChanges: (milestoneId) => prisma.milestoneDueChange.findMany({ where: { milestoneId }, orderBy: [{ changedAt: 'desc' }, { id: 'desc' }], include: { changedBy: person } }),
  // Số mốc đã bị bỏ cờ bắt buộc khi chưa Đạt (m3); cột + index thay vì đọc AuditLog. T405 dùng cho closeReadiness.
  countRequiredRemoved: (topicId) => prisma.milestone.count({ where: { topicId, required: false, requiredRemovedAt: { not: null }, evaluation: { not: 'PASSED' } } }),
  writeMilestone: (topicId, fn) => withLockTx(prisma, async (tx) => {
    await lockTopicForExecution(tx, topicId);
    return fn(ops(tx));
  }),
});
