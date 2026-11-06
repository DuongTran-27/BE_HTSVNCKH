import { recordAudit } from '../audit/service.js';
import { nextTopicCode } from './code.js';
import { createGroupRepo } from './groupRepo.js';
import { createAdvisorRepo } from './advisorRepo.js';
import { createListRepo } from './listRepo.js';
import { createReviewRepo } from './reviewRepo.js';
import { createSimilarityRepo } from '../similarity/prismaRepo.js';
import { createExecutionRepo } from '../execution/prismaRepo.js';
import { createCloseRepo } from './closeRepo.js';
import { REQUIRED_REMOVED_WHERE } from './closeConditions.js';
import { createNotificationRepo } from '../notifications/prismaRepo.js';
import { createStatsRepo } from '../stats/prismaRepo.js';
import { createChangeRequestRepo } from '../changeRequests/prismaRepo.js';

const person = { select: { id: true, code: true, fullName: true } };
const DETAIL_INCLUDE = {
  round: true,
  field: { select: { id: true, name: true } },
  members: { where: { leftAt: null }, orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }], include: { user: person } },
  invitations: { where: { status: 'PENDING' }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], include: { invitee: person } },
  advisings: { where: { endAt: null }, take: 1, include: { lecturer: person } },
  advisorRequests: { where: { status: 'PENDING' }, take: 1, include: { lecturer: person } },
  submissions: { orderBy: { seq: 'desc' }, take: 1, include: { decision: { include: { decidedBy: person } }, similarityCheck: { select: { status: true } } } },
  similarityChecks: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1 },
  // G5 (API_GD6 §9.3): quyền cho phép mới nhất; hiệu lực suy ra cùng submissions[0]
  similarityBypasses: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1, include: { grantedBy: { select: { fullName: true } } } },
  // T405 (API_GD45 §7.4): closeReadiness + currentResult
  milestones: { where: { required: true }, orderBy: { order: 'asc' }, select: { id: true, name: true, evaluation: true } },
  results: { where: { isCurrent: true }, take: 1, select: { version: true, result: true, summary: true, createdById: true, createdAt: true } },
  _count: { select: { milestones: { where: REQUIRED_REMOVED_WHERE } } },
  // GĐ6 (API_GD6 §1.1, §2.5): yêu cầu đang chờ (quan hệ isChangeTarget + pendingChangeRequests)
  changeRequests: { where: { status: 'PENDING' }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true, type: true, targetUserId: true, targetAcceptedAt: true, createdAt: true } },
};
// Prisma không include cùng quan hệ hai lần với điều kiện khác → GV đã kết thúc đọc bằng câu riêng
export const findFormerAdvisings = (db, topicId) => db.advising.findMany({
  where: { topicId, endAt: { not: null } }, orderBy: [{ endAt: 'asc' }, { id: 'asc' }],
  select: { lecturerId: true, startAt: true, endAt: true, readOnlyGranted: true, lecturer: { select: { fullName: true } } },
});
// FR21 (API_GD6 §5.4): dòng thành viên đã rời – câu riêng vì `members` đã include với leftAt null
export const findFormerMembers = (db, topicId) => db.topicMember.findMany({
  where: { topicId, leftAt: { not: null } }, orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }], select: { userId: true, joinedAt: true, leftAt: true },
});

export const createTopicRepo = (prisma) => ({
  ...createGroupRepo(prisma),
  ...createAdvisorRepo(prisma),
  ...createReviewRepo(prisma),
  ...createListRepo(prisma),
  ...createSimilarityRepo(prisma),
  ...createExecutionRepo(prisma),
  ...createCloseRepo(prisma),
  ...createNotificationRepo(prisma),
  ...createStatsRepo(prisma),
  ...createChangeRequestRepo(prisma),
  findRound: (id) => prisma.round.findUnique({ where: { id } }),
  findField: (id) => prisma.field.findUnique({ where: { id }, select: { id: true, name: true, isActive: true } }),
  findDetail: async (id) => {
    const t = await prisma.topic.findUnique({ where: { id }, include: DETAIL_INCLUDE });
    return t && { ...t, formerAdvisings: await findFormerAdvisings(prisma, id), formerMembers: await findFormerMembers(prisma, id) };
  },

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
