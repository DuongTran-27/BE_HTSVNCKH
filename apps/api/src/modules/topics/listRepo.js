// Danh sách đề tài (FR08, API_GD2 §9.1). Phạm vi/bộ lọc do service dựng; repo chỉ chạy truy vấn.
import { Prisma } from '@prisma/client';

const person = { select: { id: true, code: true, fullName: true } };
const LIST_INCLUDE = {
  round: true,
  field: { select: { id: true, name: true } },
  members: { where: { leftAt: null }, select: { role: true, user: person } },
  advisings: { where: { endAt: null }, take: 1, include: { lecturer: person } },
  submissions: { orderBy: { seq: 'desc' }, take: 1, select: { seq: true, createdAt: true } },
  similarityChecks: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1, select: { status: true, level: true } },
  results: { where: { isCurrent: true }, take: 1, select: { result: true } },
};
const esc = (s) => s.replace(/[\\%_]/g, '\\$&');

export const createListRepo = (prisma) => ({
  // Dùng đúng biểu thức của index topic_title_trgm_idx; keywords không có index (quét, chấp nhận ở quy mô 2.000 đề tài)
  searchIds: async (q) => {
    const like = `%${esc(q)}%`;
    const rows = await prisma.$queryRaw(Prisma.sql`
      SELECT id FROM "Topic"
      WHERE lower(immutable_unaccent(title)) LIKE lower(immutable_unaccent(${like}))
         OR code ILIKE ${like}
         OR EXISTS (SELECT 1 FROM unnest(keywords) k WHERE lower(immutable_unaccent(k)) LIKE lower(immutable_unaccent(${like})))`);
    return rows.map((r) => r.id);
  },
  list: async ({ where, orderBy, skip, take }) => {
    const [total, rows] = await prisma.$transaction([
      prisma.topic.count({ where }),
      prisma.topic.findMany({ where, orderBy, skip, take, include: LIST_INCLUDE }),
    ]);
    return { total, rows };
  },
});
