// Danh sách đề tài (FR08, API_GD2 §9.1). Phạm vi/bộ lọc do service dựng; repo chỉ chạy truy vấn.
import { Prisma } from '@prisma/client';

const person = { select: { id: true, code: true, fullName: true } };
const LIST_INCLUDE = {
  round: { select: { id: true, name: true, academicYear: true, regOpenAt: true, regCloseAt: true, reviewDeadline: true } },
  field: { select: { id: true, name: true } },
  members: { where: { leftAt: null }, select: { role: true, user: person } },
  advisings: { where: { endAt: null }, take: 1, include: { lecturer: person } },
  submissions: { orderBy: { seq: 'desc' }, take: 1, select: { seq: true, createdAt: true, similarityCheck: { select: { status: true } } } },
  similarityChecks: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1, select: { status: true, level: true } },
  results: { where: { isCurrent: true }, take: 1, select: { result: true } },
};
// Kho chung (§9.2): chỉ chọn đúng trường FR08, không include quan hệ nào khác
const REPO_SELECT = { code: true, title: true, summary: true, field: { select: { name: true } }, round: { select: { academicYear: true } }, results: { where: { isCurrent: true }, take: 1, select: { result: true } } };
const esc = (s) => s.replace(/[\\%_]/g, '\\$&');

export const createListRepo = (prisma) => ({
  // Dùng đúng biểu thức của index topic_title_trgm_idx; keywords không có index (quét, chấp nhận ở quy mô 2.000 đề tài)
  // shortcut: IN(id…) giới hạn ~32.767 tham số bind (~36.000 đề tài với q 2 ký tự phổ biến), khi mở rộng nhiều khoa chuyển sang = ANY($1::text[]) hoặc EXISTS
  searchIds: async (q) => {
    if (q.trim().length < 2) return []; // chặn IN gần toàn bảng; schema đã từ chối q < 2 ký tự (400), đây là lớp phòng thủ
    const like = `%${esc(q)}%`;
    const rows = await prisma.$queryRaw(Prisma.sql`
      SELECT id FROM "Topic"
      WHERE lower(immutable_unaccent(title)) LIKE lower(immutable_unaccent(${like}))
         OR code ILIKE ${like}
         OR EXISTS (SELECT 1 FROM unnest(keywords) k WHERE lower(immutable_unaccent(k)) LIKE lower(immutable_unaccent(${like})))`);
    return rows.map((r) => r.id);
  },
  listRepository: async ({ where, orderBy, skip, take }) => {
    const [total, rows] = await prisma.$transaction([
      prisma.topic.count({ where }),
      prisma.topic.findMany({ where, orderBy, skip, take, select: REPO_SELECT }),
    ]);
    return { total, rows };
  },
  findRepositoryItem: (where) => prisma.topic.findFirst({ where, select: REPO_SELECT }),
  list: async ({ where, orderBy, skip, take }) => {
    const [total, rows] = await prisma.$transaction([
      prisma.topic.count({ where }),
      prisma.topic.findMany({ where, orderBy, skip, take, include: LIST_INCLUDE }),
    ]);
    return { total, rows };
  },
});
