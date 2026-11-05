// Mốc thực hiện (FR09, API_GD45 §3). Service nhận repo này; `writeMilestone` chạy trong withLockTx với câu khóa Topic đầu tiên.
import { withLockTx } from '../../lib/tx.js';
import { recordAudit } from '../audit/service.js';
import { lockTopicForExecution, lockTopicRow } from './lock.js';

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
  // FR11
  findMilestoneForDoc: (id) => tx.milestone.findUnique({ where: { id }, select: { id: true, topicId: true, evaluation: true, dueAt: true } }),
  chainStats: async (topicId, milestoneId) => {
    const a = await tx.document.aggregate({ where: { topicId, milestoneId }, _max: { version: true }, _count: { _all: true } });
    return { max: a._max.version ?? 0, count: a._count._all };
  },
  createDocument: (data) => tx.document.create({ data }),
  // FR10
  createProgress: (data) => tx.progressUpdate.create({ data }),
  findProgress: (id) => tx.progressUpdate.findUnique({ where: { id } }),
  // lockedAt: null cùng câu UPDATE với nhận xét (T404) → không có bản sửa sau khi đã nhận xét; count 0 = đã khóa
  updateProgressUnlocked: async (id, data) => (await tx.progressUpdate.updateMany({ where: { id, lockedAt: null }, data })).count === 1,
});

const PROGRESS_INCLUDE = {
  author: { select: { id: true, code: true, fullName: true } },
  feedbacks: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 20, select: { id: true, content: true, createdAt: true, lecturer: { select: { fullName: true } } } },
};

export const createExecutionRepo = (prisma) => {
  const write = (topicId, fn) => withLockTx(prisma, async (tx) => {
    await lockTopicForExecution(tx, topicId);
    return fn(ops(tx));
  });
  return {
  // Đề tài + quan hệ tối thiểu để tính quyền (cùng hình dạng `relations` của topics/service.js)
  findExecTopic: (id) => prisma.topic.findUnique({
    where: { id },
    select: {
      id: true, status: true, facultyId: true, round: { select: { config: true } },
      advisorRequests: { where: { status: 'PENDING' }, take: 1, select: { lecturerId: true } },
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
  writeMilestone: (topicId, fn) => write(topicId, fn),
  writeProgress: (topicId, fn) => write(topicId, fn),
  // Upload/link: khóa Topic rồi để service kiểm trạng thái theo stage (đề cương: DRAFT/NEEDS_REVISION; mốc: IN_PROGRESS)
  writeDocument: (topicId, fn) => withLockTx(prisma, async (tx) => fn(ops(tx), await lockTopicRow(tx, topicId))),
  findMilestoneBrief: (id) => prisma.milestone.findUnique({ where: { id }, select: { id: true, topicId: true, evaluation: true } }),
  findDocument: (id) => prisma.document.findUnique({ where: { id }, select: { id: true, topicId: true, stage: true, kind: true, version: true, publicId: true, status: true } }),
  auditNow: (entry) => recordAudit(prisma, entry),
  listDocuments: async (topicId, { milestoneId }) => {
    const rows = await prisma.document.findMany({
      where: { topicId, status: 'READY', ...(milestoneId && { milestoneId }) },
      orderBy: [{ milestone: { order: 'asc' } }, { stage: 'asc' }, { version: 'desc' }],
      take: 1000,
      include: { uploadedBy: { select: { id: true, fullName: true } }, _count: { select: { feedbacks: true } } },
    });
    return rows;
  },
  findProgressMeta: (id) => prisma.progressUpdate.findUnique({ where: { id }, select: { topicId: true, authorId: true } }),
  viewProgress: (id) => prisma.progressUpdate.findUnique({ where: { id }, include: PROGRESS_INCLUDE }),
  listProgress: async (topicId, { skip, take }) => {
    const [items, total] = await Promise.all([
      prisma.progressUpdate.findMany({ where: { topicId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip, take, include: PROGRESS_INCLUDE }),
      prisma.progressUpdate.count({ where: { topicId } }),
    ]);
    return { items, total };
  },
  };
};
