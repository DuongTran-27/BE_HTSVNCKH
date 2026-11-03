// Gửi xét duyệt, snapshot, quyết định (FR07, FR17, API_GD2 §8). Submission/ReviewDecision chỉ thêm (trigger DB).
import { recordAudit } from '../audit/service.js';
import { applyTransition } from './stateMachine.js';

const ops = (db) => ({
  nextSeq: async (topicId) => ((await db.submission.aggregate({ where: { topicId }, _max: { seq: true } }))._max.seq ?? 0) + 1,
  createSubmission: (data) => db.submission.create({ data }),
  createDecision: (data) => db.reviewDecision.create({ data }),
  audit: (entry) => recordAudit(db, entry),
});

export const createReviewRepo = (prisma) => ({
  applyReview: (args, extra) => applyTransition(prisma, { ...args, extra: (tx) => extra(ops(tx)) }),
});
