import { recordAudit } from '../audit/service.js';

// kind -> delegate Prisma. Ghi luôn kèm AuditLog trong CÙNG transaction (FR15).
const DELEGATE = { Faculty: 'faculty', Major: 'major', Class: 'class', Field: 'field' };
const LIMIT = 1000;

// Lớp không có facultyId riêng: lấy từ ngành để service kiểm phạm vi.
const withFaculty = (row) => (row?.major ? { ...row, facultyId: row.major.facultyId } : row);
const include = (kind) => (kind === 'Class' ? { major: { select: { facultyId: true } } } : undefined);

export const createCatalogRepo = (prisma) => ({
  async list(kind, { includeInactive, facultyId, majorId, q }) {
    const where = {
      ...(includeInactive ? {} : { isActive: true }),
      ...(kind === 'Major' && facultyId ? { facultyId } : {}),
      ...(kind === 'Class' && majorId ? { majorId } : {}),
      ...(q
        ? {
            OR: [
              { code: { contains: q, mode: 'insensitive' } },
              ...(kind === 'Class' ? [] : [{ name: { contains: q, mode: 'insensitive' } }]),
            ],
          }
        : {}),
    };
    const rows = await prisma[DELEGATE[kind]].findMany({
      where,
      orderBy: { code: 'asc' },
      take: LIMIT,
      include: include(kind),
    });
    return rows.map(withFaculty);
  },
  async findById(kind, id) {
    return withFaculty(await prisma[DELEGATE[kind]].findUnique({ where: { id }, include: include(kind) }));
  },
  async create(kind, data, buildAudit) {
    return prisma.$transaction(async (tx) => {
      const row = await tx[DELEGATE[kind]].create({ data });
      await recordAudit(tx, buildAudit(row));
      return row;
    });
  },
  async update(kind, id, data, buildAudit) {
    return prisma.$transaction(async (tx) => {
      const row = await tx[DELEGATE[kind]].update({ where: { id }, data }); // P2025 nếu không còn -> 404
      await recordAudit(tx, buildAudit(row));
      return row;
    });
  },
  listSynonyms: ({ q }) =>
    prisma.synonym.findMany({
      where: q
        ? { OR: [{ term: { contains: q, mode: 'insensitive' } }, { canonical: { contains: q, mode: 'insensitive' } }] }
        : {},
      orderBy: { term: 'asc' },
      take: LIMIT,
    }),
  findSynonym: (id) => prisma.synonym.findUnique({ where: { id } }),
  createSynonym: (data, buildAudit) =>
    prisma.$transaction(async (tx) => {
      const row = await tx.synonym.create({ data });
      await recordAudit(tx, buildAudit(row));
      return row;
    }),
  deleteSynonym: (id, buildAudit) =>
    prisma.$transaction(async (tx) => {
      const row = await tx.synonym.delete({ where: { id } }); // xóa cứng có chủ ý (API_GD2 §4.2)
      await recordAudit(tx, buildAudit(row));
    }),
});
