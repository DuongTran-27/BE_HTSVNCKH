import { recordAudit, recordAuditMany } from '../audit/service.js';
import { conflict } from '../../lib/errors.js';

const withScopes = { staffScopes: { select: { facultyId: true } } };
const likeEscape = (s) => s.replace(/[\\%_]/g, '\\$&');

export const createAccountRepo = (prisma) => ({
  findById: (id) => prisma.user.findUnique({ where: { id }, include: withScopes }),
  findFaculty: (id) => prisma.faculty.findUnique({ where: { id }, select: { id: true, isActive: true } }),
  findFaculties: (ids) => prisma.faculty.findMany({ where: { id: { in: ids } }, select: { id: true, isActive: true } }),
  findClass: (id) =>
    prisma.class.findUnique({ where: { id }, select: { id: true, isActive: true, major: { select: { facultyId: true } } } }),

  async list({ scopeFacultyIds, allowedRoles, filters, skip, take }) {
    const and = [];
    if (scopeFacultyIds) and.push({ facultyId: { in: scopeFacultyIds } });
    if (allowedRoles) and.push({ role: { in: allowedRoles } });
    if (filters.role) and.push({ role: filters.role });
    if (filters.facultyId) and.push({ facultyId: filters.facultyId });
    if (filters.classId) and.push({ classId: filters.classId });
    if (filters.isLocked) and.push({ isLocked: filters.isLocked === 'true' });
    if (filters.q) {
      // Không dấu, không phân biệt hoa thường; tham số ràng buộc (không nối chuỗi) – bảng nhỏ nên không cần index
      const like = `%${likeEscape(filters.q)}%`;
      const rows = await prisma.$queryRaw`SELECT id FROM "User"
        WHERE lower(immutable_unaccent(code || ' ' || email || ' ' || "fullName")) LIKE lower(immutable_unaccent(${like}))`;
      and.push({ id: { in: rows.map((r) => r.id) } });
    }
    const where = { AND: and };
    const [items, total] = await Promise.all([
      prisma.user.findMany({ where, include: withScopes, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip, take }),
      prisma.user.count({ where }),
    ]);
    return { items, total };
  },

  // Tạo tài khoản (+ phạm vi khoa của STAFF) + AuditLog trong một transaction
  create: ({ data, staffFacultyIds }, buildAudits) =>
    prisma.$transaction(async (tx) => {
      // Đăng nhập tra mã không phân biệt hoa thường: cấm hai mã chỉ khác hoa/thường
      const clash = await tx.user.findFirst({ where: { code: { equals: data.code, mode: 'insensitive' } }, select: { id: true } });
      if (clash) throw conflict('DUPLICATE', 'Dữ liệu đã tồn tại', { code: 'Đã tồn tại' });
      const row = await tx.user.create({ data });
      if (staffFacultyIds) await tx.staffScope.createMany({ data: staffFacultyIds.map((facultyId) => ({ userId: row.id, facultyId })) });
      const created = await tx.user.findUnique({ where: { id: row.id }, include: withScopes });
      for (const a of buildAudits(created)) await recordAudit(tx, a);
      return created;
    }),

  // Nhập CSV (T207b): mã không phân biệt hoa thường khớp unique lower(code); email đã lưu chữ thường
  findExisting: ({ codes, emails }) =>
    prisma.$queryRaw`SELECT code, email FROM "User" WHERE lower(code) = ANY(${codes}) OR email = ANY(${emails})`,
  findClassesByCodes: (facultyId, codes) =>
    prisma.class.findMany({ where: { code: { in: codes }, isActive: true, major: { facultyId } }, select: { id: true, code: true } }),
  // Ghi tất cả user + AuditLog trong MỘT transaction; va chạm unique do người khác tạo cùng lúc -> rollback, 409
  importUsers: async (data, buildAudits) => {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const created = await tx.user.createManyAndReturn({ data });
          await recordAuditMany(tx, buildAudits(created));
          return created.length;
        },
        { timeout: 20000, maxWait: 5000 },
      );
    } catch (e) {
      if (e?.code === 'P2002') {
        throw conflict('DUPLICATE', 'Dữ liệu đã tồn tại', { file: 'Có mã hoặc email vừa được tạo bởi người khác, hãy xem trước lại' });
      }
      throw e;
    }
  },

  // Xóa cứng chỉ khi chưa có dữ liệu nghiệp vụ: FK RESTRICT (P2003) -> rollback, 409 (NFR05). AuditLog ghi trước khi xóa.
  // compute(before, { actorExists, adminsLeft }) kiểm quyền; adminsLeft = số ADMIN còn lại nếu xóa.
  remove: async (id, actorId, compute) => {
    const inUse = () => conflict('IN_USE', 'Tài khoản đã có dữ liệu nghiệp vụ nên không thể xóa, hãy khóa tài khoản thay vì xóa');
    try {
      return await prisma.$transaction(async (tx) => {
        // Khóa mọi dòng ADMIN theo thứ tự id rồi mới tới dòng bị xóa: hai ADMIN xóa nhau chạy tuần tự, không thể còn 0 ADMIN
        const admins = await tx.$queryRaw`SELECT id FROM "User" WHERE role = 'ADMIN' ORDER BY id FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${id} FOR UPDATE`;
        const before = await tx.user.findUnique({ where: { id }, include: withScopes });
        const actorExists = !!(await tx.user.findUnique({ where: { id: actorId }, select: { id: true } }));
        const adminsLeft = admins.length - (before?.role === 'ADMIN' ? 1 : 0);
        const { buildAudits } = compute(before, { actorExists, adminsLeft });
        // Tham chiếu không có FK RESTRICT: người thực hiện trong AuditLog (FR15 "ghi ai"); ChangeRequest người đích/người quyết định (SET NULL)
        if (await tx.auditLog.findFirst({ where: { actorId: id }, select: { id: true } })) throw inUse();
        if (await tx.changeRequest.findFirst({ where: { OR: [{ targetUserId: id }, { decidedById: id }] }, select: { id: true } })) throw inUse();
        for (const a of buildAudits()) await recordAudit(tx, a);
        await tx.staffScope.deleteMany({ where: { userId: id } });
        await tx.refreshToken.deleteMany({ where: { userId: id } });
        await tx.notification.deleteMany({ where: { userId: id } });
        await tx.user.delete({ where: { id } });
      });
    } catch (e) {
      if (e?.code === 'P2003') throw inUse();
      throw e;
    }
  },

  // Khóa dòng user, đọc bản mới nhất; compute(before, { admins }) kiểm tra và trả { data, scopeIds?, revokeTokens?, buildAudits(after) }.
  // guardAdmins: khóa trước mọi dòng ADMIN theo thứ tự id (admins = [{ id, isLocked }]) để hai ADMIN khóa nhau chạy tuần tự.
  updateLocked: (id, compute, { guardAdmins = false } = {}) =>
    prisma.$transaction(async (tx) => {
      const admins = guardAdmins ? await tx.$queryRaw`SELECT id, "isLocked" FROM "User" WHERE role = 'ADMIN' ORDER BY id FOR UPDATE` : null;
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${id} FOR NO KEY UPDATE`;
      const before = await tx.user.findUnique({ where: { id }, include: withScopes });
      const { data = {}, scopeIds, revokeTokens, buildAudits } = await compute(before, { admins });
      if (scopeIds) {
        await tx.staffScope.deleteMany({ where: { userId: id } });
        await tx.staffScope.createMany({ data: scopeIds.map((facultyId) => ({ userId: id, facultyId })) });
      }
      await tx.user.update({ where: { id }, data });
      if (revokeTokens) await tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      const after = await tx.user.findUnique({ where: { id }, include: withScopes });
      for (const a of buildAudits(after)) await recordAudit(tx, a);
      return after;
    }),
});
