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

// Mệnh đề FROM + WHERE duy nhất cho thống kê và danh sách đề tài xuất Excel (FR39 – GD7 §10.3): không có bộ lọc thứ hai.
// GVHD hiện hành: tối đa một dòng nhờ advising_one_current; kết quả chỉ tính đề tài CLOSED (G27), một bản nhờ result_one_current.
// scope: { facultyIds } (STAFF) hoặc { lecturerId } (LECTURER).
export const statsWhere = (scope, q) => {
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
  return Prisma.sql`
      FROM "Topic" t
      JOIN "Round" r ON r.id = t."roundId"
      LEFT JOIN "Field" f ON f.id = t."fieldId"
      LEFT JOIN "Advising" a ON a."topicId" = t.id AND a."endAt" IS NULL
      LEFT JOIN "User" l ON l.id = a."lecturerId"
      LEFT JOIN "ResultVersion" rv ON rv."topicId" = t.id AND rv."isCurrent" AND t.status = 'CLOSED'
      WHERE ${Prisma.join(where, ' AND ')}`;
};

export const createStatsRepo = (prisma) => ({
  // Trả [{ key, name, count }].
  groupTopics: (groupBy, scope, q) =>
    prisma.$queryRaw(Prisma.sql`SELECT ${DIMS[groupBy]}, count(*)::int AS count ${statsWhere(scope, q)} GROUP BY 1, 2`),

  // Danh sách đề tài cho sheet 2 (FR39). Không chọn tên/mã SV, email, SĐT, nhận xét (GD7 §10.3).
  // Điểm bảo vệ = phân công đã chốt (decidedAt) mới nhất, chỉ khi CLOSED – cùng định nghĩa với cột kết quả (m8).
  listTopicsForExport: (scope, q, limit) =>
    prisma.$queryRaw(Prisma.sql`
      SELECT t.code, t.title, t.status::text AS status, r.name AS "roundName", r."academicYear",
        f.name AS "fieldName", l."fullName" AS "lecturerName", t.origin::text AS origin, rv.result::text AS result,
        (SELECT count(*)::int FROM "TopicMember" m WHERE m."topicId" = t.id AND m."leftAt" IS NULL) AS "memberCount",
        CASE WHEN t.status = 'CLOSED' THEN (SELECT ca."finalScore"::float8 FROM "CouncilAssignment" ca
          WHERE ca."topicId" = t.id AND ca."decidedAt" IS NOT NULL AND ca."cancelledAt" IS NULL
          ORDER BY ca."decidedAt" DESC LIMIT 1) END AS "defenseScore"
      ${statsWhere(scope, q)}
      ORDER BY t.code LIMIT ${limit}`),
});
