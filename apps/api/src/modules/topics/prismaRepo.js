import { recordAudit } from '../audit/service.js';
import { nextTopicCode } from './code.js';
import { createGroupRepo } from './groupRepo.js';
import { createAdvisorRepo } from './advisorRepo.js';
import { createListRepo } from './listRepo.js';
import { createReviewRepo } from './reviewRepo.js';
import { createSimilarityRepo } from '../similarity/prismaRepo.js';
import { createExecutionRepo } from '../execution/prismaRepo.js';
import { createCloseRepo } from './closeRepo.js';
import { createNotificationRepo } from '../notifications/prismaRepo.js';

const person = { select: { id: true, code: true, fullName: true } };
const DETAIL_INCLUDE = {
  round: true,
  field: { select: { id: true, name: true } },
  members: { where: { leftAt: null }, orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }], include: { user: person } },
  invitations: { where: { status: 'PENDING' }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], include: { invitee: person } },
  advisings: { where: { endAt: null }, take: 1, include: { lecturer: person } },
  advisorRequests: { where: { status: 'PENDING' }, take: 1, include: { lecturer: person } },
  submissions: { orderBy: { seq: 'desc' }, take: 1, include: { decision: { include: { decidedBy: person } } } },
  similarityChecks: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1 },
  // T405 (API_GD45 §7.4): closeReadiness + currentResult
  milestones: { where: { required: true }, orderBy: { order: 'asc' }, select: { id: true, name: true, evaluation: true } },
  results: { where: { isCurrent: true }, take: 1, select: { version: true, result: true, summary: true, createdById: true, createdAt: true } },
  _count: { select: { milestones: { where: { required: false, requiredRemovedAt: { not: null }, evaluation: { not: 'PASSED' } } } } },
};

export const createTopicRepo = (prisma) => ({
  ...createGroupRepo(prisma),
  ...createAdvisorRepo(prisma),
  ...createReviewRepo(prisma),
  ...createListRepo(prisma),
  ...createSimilarityRepo(prisma),
  ...createExecutionRepo(prisma),
  ...createCloseRepo(prisma),
  ...createNotificationRepo(prisma),
  findRound: (id) => prisma.round.findUnique({ where: { id } }),
  findField: (id) => prisma.field.findUnique({ where: { id }, select: { id: true, isActive: true } }),
  findDetail: (id) => prisma.topic.findUnique({ where: { id }, include: DETAIL_INCLUDE }),

  // Tạo nháp + trưởng nhóm + AuditLog trong một transaction; mã lấy từ sequence (FR05)
  create: ({ round, userId, data }, buildAudit) =>
    prisma.$transaction(async (tx) => {
      const code = await nextTopicCode(tx, round.academicYear);
      const topic = await tx.topic.create({
        data: { ...data, code, roundId: round.id, facultyId: round.facultyId, status: 'DRAFT', members: { create: { userId, role: 'LEADER' } } },
      });
      await recordAudit(tx, buildAudit(topic));
      return topic.id;
    }),

  // Khóa lạc quan: chỉ ghi khi version và trạng thái còn khớp; trả false nếu không
  update: ({ id, version, editableStatuses, data }, buildAudit) =>
    prisma.$transaction(async (tx) => {
      const r = await tx.topic.updateMany({
        where: { id, version, status: { in: editableStatuses } },
        data: { ...data, version: { increment: 1 } },
      });
      if (r.count !== 1) return false;
      await recordAudit(tx, buildAudit());
      return true;
    }),
});
