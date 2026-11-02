// Danh mục khoa/ngành/lớp/lĩnh vực + từ đồng nghĩa (FR04, API_GD2 §4.1–4.2). Repo được tiêm để test không cần DB.
import { badRequest, forbidden, notFound } from '../../lib/errors.js';

const WRITE_ROLES = {
  Faculty: ['ADMIN'],
  Major: ['ADMIN', 'STAFF'],
  Class: ['ADMIN', 'STAFF'],
  Field: ['ADMIN', 'STAFF'],
};
export const writeRoles = (kind) => WRITE_ROLES[kind];

const pick = (row) => ({ ...row }); // bản ghi danh mục không có trường nhạy cảm
const inScope = (user, facultyId) => user.role === 'STAFF' && user.staffFacultyIds?.includes(facultyId);
// ADMIN quản danh mục mọi khoa; STAFF chỉ trong phạm vi khoa (ngành, lớp)
const canWriteIn = (user, facultyId) => user.role === 'ADMIN' || inScope(user, facultyId);

export const createCatalogService = ({ repo }) => {
  const audit = (user, action, entityType, row, before, after, ip) => ({
    actorId: user.id,
    action,
    entityType,
    entityId: row.id,
    before,
    after,
    ip,
  });

  const mustFind = async (kind, id) => {
    const row = await repo.findById(kind, id);
    if (!row) throw notFound();
    return row;
  };
  // Cha phải tồn tại và còn dùng (API_GD2 §4.1: không chọn được danh mục đã ngừng dùng cho bản ghi mới)
  const activeParent = async (kind, id, field) => {
    const p = await repo.findById(kind, id);
    if (!p || !p.isActive)
      throw badRequest('VALIDATION_ERROR', 'Dữ liệu không hợp lệ', {
        [field]: 'Danh mục không tồn tại hoặc đã ngừng dùng',
      });
    return p;
  };

  return {
    async list(kind, user, query) {
      const includeInactive = query.includeInactive === 'true';
      if (includeInactive && !['ADMIN', 'STAFF'].includes(user.role)) throw forbidden();
      return { items: (await repo.list(kind, { ...query, includeInactive })).map(pick) };
    },

    async create(kind, user, body, ip) {
      let facultyId; // khoa dùng để kiểm phạm vi
      if (kind === 'Major') facultyId = (await activeParent('Faculty', body.facultyId, 'facultyId')).id;
      if (kind === 'Class') facultyId = (await activeParent('Major', body.majorId, 'majorId')).facultyId;
      if (kind === 'Faculty' && user.role !== 'ADMIN') throw forbidden();
      if (facultyId && !canWriteIn(user, facultyId)) throw forbidden('Khoa không thuộc phạm vi bạn quản lý');
      const row = await repo.create(kind, body, (r) => audit(user, 'CATALOG_CREATE', kind, r, null, pick(r), ip));
      return pick(row);
    },

    async update(kind, user, id, body, ip) {
      const before = await mustFind(kind, id);
      if (kind === 'Faculty' && user.role !== 'ADMIN') throw forbidden();
      if ((kind === 'Major' || kind === 'Class') && !canWriteIn(user, before.facultyId)) {
        throw forbidden('Khoa không thuộc phạm vi bạn quản lý');
      }
      if (kind === 'Class' && body.name !== undefined) {
        throw badRequest('VALIDATION_ERROR', 'Dữ liệu không hợp lệ', { name: 'Lớp không có tên' });
      }
      const data = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined)); // code không đổi sau khi tạo
      const keys = Object.keys(data);
      const row = await repo.update(kind, id, data, (r) =>
        audit(
          user,
          'CATALOG_UPDATE',
          kind,
          r,
          Object.fromEntries(keys.map((k) => [k, before[k]])),
          Object.fromEntries(keys.map((k) => [k, r[k]])),
          ip,
        ),
      );
      return pick(row);
    },

    // Từ đồng nghĩa: chỉ STAFF (route đã chặn vai trò)
    async listSynonyms(query) {
      return { items: await repo.listSynonyms(query) };
    },
    async createSynonym(user, body, ip) {
      return repo.createSynonym(body, (r) =>
        audit(user, 'CATALOG_CREATE', 'Synonym', r, null, { term: r.term, canonical: r.canonical }, ip),
      );
    },
    async deleteSynonym(user, id, ip) {
      const before = await repo.findSynonym(id);
      if (!before) throw notFound();
      await repo.deleteSynonym(id, (r) =>
        audit(user, 'CATALOG_UPDATE', 'Synonym', r, { term: r.term, canonical: r.canonical }, null, ip),
      );
    },
  };
};
