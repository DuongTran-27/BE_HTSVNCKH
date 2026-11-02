import { recordAudit } from '../audit/service.js';
import { nextTopicCode } from './code.js';

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
};

export const createTopicRepo = (prisma) => ({
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
