// Đóng đề tài FR27 (API_GD45 §7). `applyClose` chạy applyTransition (khóa Topic bằng updateMany); `extra` nhận ops gắn với tx.
import { recordAudit } from '../audit/service.js';
import { applyTransition } from './stateMachine.js';
import { loadCloseConditions } from './closeConditions.js';
import { notifyTopic } from '../notifications/notify.js';

const ops = (tx) => ({
  closeConditions: (topicId) => loadCloseConditions(tx, topicId),
  // Hạ bản hiện hành TRƯỚC khi tạo bản mới (result_one_current không deferrable, §6.4)
  currentResult: (topicId) => tx.resultVersion.findFirst({ where: { topicId, isCurrent: true } }),
  maxResultVersion: async (topicId) => (await tx.resultVersion.aggregate({ where: { topicId }, _max: { version: true } }))._max.version ?? 0,
  demoteResult: (id) => tx.resultVersion.updateMany({ where: { id, isCurrent: true }, data: { isCurrent: false } }),
  createResult: (data) => tx.resultVersion.create({ data }),
  audit: (entry) => recordAudit(tx, entry),
  notify: (args) => notifyTopic(tx, args), // FR13, cùng tx
});

export const createCloseRepo = (prisma) => ({
  readCloseConditions: (topicId) => loadCloseConditions(prisma, topicId),
  applyClose: (args, extra) => applyTransition(prisma, { ...args, extra: (tx) => extra(ops(tx)) }),
});
