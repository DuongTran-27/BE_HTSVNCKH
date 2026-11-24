// Đề nghị ra hội đồng / trả về (FR34, FR35 – API_GD7 §5). `applyDefense` chạy applyTransition (khóa Topic bằng updateMany); `extra` nhận ops gắn với tx.
import { recordAudit } from '../audit/service.js';
import { applyTransition } from './stateMachine.js';
import { loadCloseConditions } from './closeConditions.js';
import { notifyTopic } from '../notifications/notify.js';

// Báo cáo tổng kết: tài liệu giai đoạn FINAL đã xác minh (§5.1)
const hasFinalReport = async (db, topicId) => (await db.document.count({ where: { topicId, stage: 'FINAL', status: 'READY' } })) > 0;

const ops = (tx) => ({
  closeConditions: (topicId) => loadCloseConditions(tx, topicId),
  hasFinalReport: (topicId) => hasFinalReport(tx, topicId),
  createProcessScore: (data) => tx.processScore.create({ data, select: { id: true } }),
  // §5.4: hủy phân công mở; RETURNING = đúng các dòng thực sự bị hủy (điểm đã chấm giữ lại làm lịch sử)
  cancelOpenAssignments: (topicId, at, reason) => tx.$queryRaw`
    UPDATE "CouncilAssignment" SET "cancelledAt" = ${at}, "cancelReason" = ${reason}
    WHERE "topicId" = ${topicId} AND "decidedAt" IS NULL AND "cancelledAt" IS NULL RETURNING id, "councilId"`,
  councilMemberIds: async (councilIds) => (await tx.councilMember.findMany({ where: { councilId: { in: councilIds } }, select: { lecturerId: true } })).map((m) => m.lecturerId),
  audit: (entry) => recordAudit(tx, entry),
  notify: (args) => notifyTopic(tx, args), // FR13, cùng tx
});

export const createDefenseRepo = (prisma) => ({
  readFinalReport: (topicId) => hasFinalReport(prisma, topicId),
  applyDefense: (args, extra) => applyTransition(prisma, { ...args, extra: (tx) => extra(ops(tx)) }),
});
