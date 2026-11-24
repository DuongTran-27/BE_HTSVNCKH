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
import { createRecruitmentRepo } from './recruitmentRepo.js';
import { createApplicationRepo } from './applicationRepo.js';
import { createDefenseRepo } from './defenseRepo.js';
import { createCouncilRepo } from '../councils/prismaRepo.js';

const person = { select: { id: true, code: true, fullName: true } };
// GĐ7 §1.1: thành viên các hội đồng có phân công chưa hủy của đề tài, mới nhất trước (dùng chung với findExecTopic)
export const COUNCIL_SEATS = {
  where: { cancelledAt: null }, orderBy: [{ assignedAt: 'desc' }, { id: 'desc' }],
  select: { id: true, decidedAt: true, council: { select: { members: { select: { lecturerId: true, role: true } } } } },
};
// GĐ7 §7.5: thêm dữ liệu cho TopicDetail.defense / councilAccess
const DEFENSE_SEATS = {
  ...COUNCIL_SEATS,
  select: {
    ...COUNCIL_SEATS.select, finalScore: true, decision: true,
    council: { select: { code: true, name: true, members: { select: { lecturerId: true, role: true } } } },
    scores: { select: { memberId: true, score: true, comment: true, updatedAt: true, member: { select: { fullName: true } } } },
  },
};
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
  results: { where: { isCurrent: true }, take: 1, select: { version: true, result: true, source: true, summary: true, createdById: true, createdAt: true } },
  // GĐ7 §5.5: điểm quá trình mới nhất (chỉ thêm)
  processScores: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1, select: { score: true, comment: true, createdAt: true, lecturer: { select: { fullName: true } } } },
  // GĐ7 §1.1: quan hệ isCouncilMember/isCouncilOfficer; §7.5 defense
  councilAssignments: DEFENSE_SEATS,
  // GĐ7 §3.2: applicationCounts.pending
  _count: { select: { milestones: { where: REQUIRED_REMOVED_WHERE }, applications: { where: { status: 'PENDING' } } } },
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
  ...createRecruitmentRepo(prisma),
  ...createApplicationRepo(prisma),
  ...createDefenseRepo(prisma),
  ...createCouncilRepo(prisma),
  findRound: (id) => prisma.round.findUnique({ where: { id } }),
  findField: (id) => prisma.field.findUnique({ where: { id }, select: { id: true, name: true, isActive: true } }),
  findDetail: async (id) => {
    const t = await prisma.topic.findUnique({ where: { id }, include: DETAIL_INCLUDE });
    return t && { ...t, formerAdvisings: await findFormerAdvisings(prisma, id), formerMembers: await findFormerMembers(prisma, id) };
  },

  // Tạo nháp + trưởng nhóm + AuditLog trong một transaction; mã lấy từ sequence (FR05)
  // GV công bố (API_GD7 §3.1): Advising của GV thay cho trưởng nhóm
  create: ({ round, userId, origin = 'STUDENT', data, joinedAt }, buildAudit) =>
    prisma.$transaction(async (tx) => {
      const code = await nextTopicCode(tx, round.academicYear);
      const owner = origin === 'LECTURER'
        ? { advisings: { create: { lecturerId: userId, startAt: joinedAt } } }
        : { members: { create: { userId, role: 'LEADER', joinedAt } } };
      const topic = await tx.topic.create({
        data: { ...data, code, origin, roundId: round.id, facultyId: round.facultyId, status: 'DRAFT', ...owner },
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
