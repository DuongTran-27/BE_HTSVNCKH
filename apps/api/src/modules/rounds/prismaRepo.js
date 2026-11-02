import { recordAudit } from '../audit/service.js';

export const createRoundRepo = (prisma) => ({
  findById: (id) => prisma.round.findUnique({ where: { id } }),
  findFaculty: (id) => prisma.faculty.findUnique({ where: { id }, select: { id: true, isActive: true } }),
  async list({ facultyIds, academicYear, skip, take }) {
    const where = {
      ...(facultyIds ? { facultyId: { in: facultyIds } } : {}),
      ...(academicYear ? { academicYear } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.round.findMany({ where, orderBy: [{ regOpenAt: 'desc' }, { id: 'asc' }], skip, take }),
      prisma.round.count({ where }),
    ]);
    return { items, total };
  },
  // Ghi đợt + AuditLog trong cùng transaction (FR15)
  create: (data, buildAudit) =>
    prisma.$transaction(async (tx) => {
      const row = await tx.round.create({ data });
      await recordAudit(tx, buildAudit(row));
      return row;
    }),
  // Khóa dòng đợt, đọc bản mới nhất, để `compute(before)` kiểm tra và dựng { data, buildAudit }, rồi ghi + AuditLog.
  // Hai PATCH đồng thời thành tuần tự: bên sau thấy bản của bên trước (thứ tự mốc, `before` của AuditLog không cũ).
  updateLocked: (id, compute) =>
    prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Round" WHERE id = ${id} FOR NO KEY UPDATE`;
      const { data, buildAudit } = await compute(await tx.round.findUnique({ where: { id } }));
      const row = await tx.round.update({ where: { id }, data });
      await recordAudit(tx, buildAudit(row));
      return row;
    }),
});
