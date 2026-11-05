// Thống kê FR14 (API_GD45 §9): một câu GROUP BY. Biểu thức chiều chỉ lấy từ bảng trắng DIMS, giá trị lọc luôn là tham số.
import { Prisma } from '@prisma/client';

const DIMS = {
  lecturer: Prisma.sql`l.id AS key, l."fullName" AS name`,
  field: Prisma.sql`f.id AS key, f.name AS name`,
  status: Prisma.sql`t.status::text AS key, NULL::text AS name`,
  result: Prisma.sql`rv.result::text AS key, NULL::text AS name`,
  academicYear: Prisma.sql`r."academicYear" AS key, r."academicYear" AS name`,
  round: Prisma.sql`r.id AS key, r.name AS name`,
};

export const createStatsRepo = (prisma) => ({
  // scope: { facultyIds } (STAFF) hoặc { lecturerId } (LECTURER). Trả [{ key, name, count }].
  groupTopics: async (groupBy, scope, q) => {
    const where = [Prisma.sql`t.status <> 'DRAFT'`];
    if (scope.facultyIds) where.push(Prisma.sql`t."facultyId" = ANY(${scope.facultyIds}::text[])`);
    if (scope.lecturerId) where.push(Prisma.sql`a."lecturerId" = ${scope.lecturerId}`);
    if (q.facultyId) where.push(Prisma.sql`t."facultyId" = ${q.facultyId}`);
    if (q.roundId) where.push(Prisma.sql`t."roundId" = ${q.roundId}`);
    if (q.fieldId) where.push(Prisma.sql`t."fieldId" = ${q.fieldId}`);
    if (q.academicYear) where.push(Prisma.sql`r."academicYear" = ${q.academicYear}`);
    if (q.lecturerId) where.push(Prisma.sql`a."lecturerId" = ${q.lecturerId}`);
    if (q.status) where.push(Prisma.sql`t.status = CAST(${q.status} AS "TopicStatus")`);
    if (q.result) where.push(Prisma.sql`rv.result = CAST(${q.result} AS "FinalResult")`);
    // GVHD hiện hành: tối đa một dòng nhờ advising_one_current; kết quả chỉ tính đề tài CLOSED (G27), một bản nhờ result_one_current
    return prisma.$queryRaw(Prisma.sql`
      SELECT ${DIMS[groupBy]}, count(*)::int AS count
      FROM "Topic" t
      JOIN "Round" r ON r.id = t."roundId"
      LEFT JOIN "Field" f ON f.id = t."fieldId"
      LEFT JOIN "Advising" a ON a."topicId" = t.id AND a."endAt" IS NULL
      LEFT JOIN "User" l ON l.id = a."lecturerId"
      LEFT JOIN "ResultVersion" rv ON rv."topicId" = t.id AND rv."isCurrent" AND t.status = 'CLOSED'
      WHERE ${Prisma.join(where, ' AND ')}
      GROUP BY 1, 2`);
  },
});
