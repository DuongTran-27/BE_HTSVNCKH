// Gửi xét duyệt, snapshot, quyết định (FR07, FR17, API_GD2 §8). Submission/ReviewDecision chỉ thêm (trigger DB).
import { recordAudit } from '../audit/service.js';
import { applyTransition } from './stateMachine.js';

const ops = (db) => ({
  nextSeq: async (topicId) => ((await db.submission.aggregate({ where: { topicId }, _max: { seq: true } }))._max.seq ?? 0) + 1,
  createSubmission: (data) => db.submission.create({ data }),
  createDecision: (data) => db.reviewDecision.create({ data }),
  audit: (entry) => recordAudit(db, entry),
  // FR17: bản đề cương mới nhất (Document bất biến nên snapshot không đổi theo thời gian)
  latestProposalDocumentIds: async (topicId) => (await db.document.findMany({ where: { topicId, stage: 'PROPOSAL', status: 'READY' }, orderBy: { version: 'desc' }, take: 1, select: { id: true } })).map((d) => d.id),
});

const person = { select: { id: true, fullName: true } };

export const createReviewRepo = (prisma) => ({
  listSubmissions: (topicId) => prisma.submission.findMany({
    where: { topicId }, orderBy: { seq: 'desc' },
    include: { createdBy: person, decision: true, similarityCheck: { select: { level: true, status: true } } },
  }),
  findSubmissions: (topicId, seqs) => prisma.submission.findMany({
    where: { topicId, seq: { in: seqs } },
    include: { createdBy: person, decision: { include: { decidedBy: person } }, similarityCheck: true },
  }),
  findDocumentBriefs: (ids) => prisma.document.findMany({ where: { id: { in: ids } }, select: { id: true, fileName: true, kind: true, version: true, uploadedAt: true } }),
  listStatusHistory: (topicId) => prisma.statusHistory.findMany({
    where: { topicId }, orderBy: [{ at: 'asc' }, { id: 'asc' }], include: { actor: { select: { fullName: true, role: true } } },
  }),
  applyReview: (args, extra) => applyTransition(prisma, { ...args, extra: (tx) => extra(ops(tx)) }),
});
