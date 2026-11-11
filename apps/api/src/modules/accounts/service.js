// Tài khoản (FR02, FR25, API_GD2 §3). ADMIN quản mọi tài khoản; STAFF chỉ LECTURER/STUDENT trong phạm vi khoa.
// Không có endpoint đổi role, không tự đăng ký. Mật khẩu tạm chỉ trả một lần, không vào log/AuditLog.
import { ROLES } from '@nckh/shared';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { generateTempPassword } from '../../lib/tempPassword.js';

const STAFF_MANAGED = [ROLES.LECTURER, ROLES.STUDENT];
const fail = (details) => badRequest('VALIDATION_ERROR', 'Dữ liệu không hợp lệ', details);

export const userView = (u) => ({
  id: u.id,
  code: u.code,
  email: u.email,
  fullName: u.fullName,
  role: u.role,
  facultyId: u.facultyId ?? null,
  classId: u.classId ?? null,
  isLocked: u.isLocked,
  mustChangePassword: u.mustChangePassword,
  staffFacultyIds: u.role === ROLES.STAFF ? u.staffScopes.map((s) => s.facultyId) : [],
  createdAt: u.createdAt.toISOString(),
});
const profile = (u) => ({ email: u.email, fullName: u.fullName, classId: u.classId ?? null, facultyId: u.facultyId ?? null });
const scopeOf = (u) => u.staffScopes.map((s) => s.facultyId).sort();

export const createAccountService = ({ repo, hasher, genPassword = generateTempPassword }) => {
  const canManage = (actor, target) =>
    actor.role === ROLES.ADMIN ||
    (actor.role === ROLES.STAFF && STAFF_MANAGED.includes(target.role) && actor.staffFacultyIds.includes(target.facultyId));
  const mustManage = (actor, target) => {
    if (!target) throw notFound(); // id không tồn tại -> 404, ngoài phạm vi -> 403 (API_GD2 §2)
    if (!canManage(actor, target)) throw forbidden();
  };
  const notSelf = (actor, target) => {
    if (actor.id === target.id) throw forbidden('Không thể thực hiện thao tác này với chính tài khoản của bạn');
  };
  const audit = (actor, ip, action, entityId, before, after) => ({
    actorId: actor.id,
    action,
    entityType: 'User',
    entityId,
    before,
    after,
    ip,
  });

  // Danh mục tham chiếu phải tồn tại và isActive (400 tại trường đó)
  const refErrors = async ({ facultyId, classId, staffFacultyIds }) => {
    const errors = {};
    if (facultyId && !(await repo.findFaculty(facultyId))?.isActive) errors.facultyId = 'Khoa không tồn tại hoặc đã ngừng dùng';
    if (classId) {
      const c = await repo.findClass(classId);
      if (!c?.isActive) errors.classId = 'Lớp không tồn tại hoặc đã ngừng dùng';
      else if (facultyId && c.major.facultyId !== facultyId) errors.classId = 'Lớp không thuộc khoa đã chọn';
    }
    if (staffFacultyIds) {
      const found = await repo.findFaculties(staffFacultyIds);
      if (found.length !== new Set(staffFacultyIds).size || found.some((f) => !f.isActive)) {
        errors.staffFacultyIds = 'Có khoa không tồn tại hoặc đã ngừng dùng';
      }
    }
    return errors;
  };

  return {
    async list(actor, q) {
      const staff = actor.role === ROLES.STAFF;
      if (staff && q.facultyId && !actor.staffFacultyIds.includes(q.facultyId)) throw forbidden();
      const { items, total } = await repo.list({
        scopeFacultyIds: staff ? actor.staffFacultyIds : undefined,
        allowedRoles: staff ? STAFF_MANAGED : undefined,
        filters: q,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      });
      return { items: items.map(userView), page: q.page, pageSize: q.pageSize, total };
    },

    async get(actor, id) {
      const u = await repo.findById(id);
      mustManage(actor, u);
      return { user: userView(u) };
    },

    async create(actor, body, ip) {
      if (actor.role === ROLES.STAFF && (!STAFF_MANAGED.includes(body.role) || !actor.staffFacultyIds.includes(body.facultyId))) {
        throw forbidden();
      }
      const errors = await refErrors(body);
      if (Object.keys(errors).length) throw fail(errors);
      const temporaryPassword = genPassword();
      const passwordHash = await hasher.hash(temporaryPassword, { temporary: true }); // băm TRƯỚC transaction
      const { code, email, fullName, role, facultyId = null, classId = null, staffFacultyIds } = body;
      const row = await repo.create(
        { data: { code, email, fullName, role, facultyId, classId, passwordHash, mustChangePassword: true }, staffFacultyIds },
        (u) => [
          audit(actor, ip, 'USER_CREATE', u.id, null, { code, role, ...profile(u) }),
          ...(staffFacultyIds ? [audit(actor, ip, 'STAFF_SCOPE_SET', u.id, null, { facultyIds: scopeOf(u) })] : []),
        ],
      );
      return { user: userView(row), temporaryPassword };
    },

    async update(actor, id, body, ip) {
      const row = await repo.updateLocked(id, async (before) => {
        mustManage(actor, before);
        if (body.facultyId !== undefined && actor.role !== ROLES.ADMIN) throw forbidden();
        const isStudent = before.role === ROLES.STUDENT;
        let errors = {};
        if (body.facultyId !== undefined && before.role === ROLES.ADMIN) errors.facultyId = 'Quản trị viên không thuộc khoa nào';
        else if (body.classId !== undefined && !isStudent) errors.classId = 'Chỉ sinh viên mới có lớp';
        else {
          // Lớp phải active và thuộc khoa hiệu lực, kể cả khi chỉ đổi facultyId của sinh viên
          const facultyId = body.facultyId ?? before.facultyId;
          const classId = body.classId ?? before.classId;
          const touched = body.facultyId !== undefined || body.classId !== undefined;
          errors = await refErrors({ facultyId, classId: isStudent && touched ? classId : undefined });
          if (body.facultyId === undefined) delete errors.facultyId; // khoa cũ không bị kiểm lại khi không đổi
        }
        if (Object.keys(errors).length) throw fail(errors);
        return {
          data: body,
          buildAudits: (after) => [audit(actor, ip, 'USER_UPDATE', id, profile(before), profile(after))],
        };
      });
      return { user: userView(row) };
    },

    async setLocked(actor, id, locked, ip) {
      const row = await repo.updateLocked(id, (before, { admins }) => {
        mustManage(actor, before);
        notSelf(actor, before);
        if (locked && before.role === ROLES.ADMIN) {
          // Người thực hiện vừa bị khóa/xóa trong lúc chờ khóa dòng -> 403; phải còn ít nhất một ADMIN hoạt động khác
          if (!admins.some((a) => a.id === actor.id && !a.isLocked)) throw forbidden();
          if (!admins.some((a) => a.id !== id && !a.isLocked)) throw conflict('LAST_ADMIN', 'Phải còn ít nhất một quản trị viên đang hoạt động');
        }
        return {
          data: locked ? { isLocked: true } : { isLocked: false, failedLogins: 0, lockedUntil: null },
          revokeTokens: locked,
          buildAudits: (after) => [
            audit(actor, ip, locked ? 'USER_LOCK' : 'USER_UNLOCK', id, { isLocked: before.isLocked }, { isLocked: after.isLocked }),
          ],
        };
      }, { guardAdmins: locked && actor.role === ROLES.ADMIN });
      return { user: userView(row) };
    },

    async resetPassword(actor, id, ip) {
      // Kiểm quyền TRƯỚC khi băm (không cho người không có quyền ép tốn CPU), rồi kiểm lại dưới khóa dòng
      const pre = await repo.findById(id);
      mustManage(actor, pre);
      notSelf(actor, pre);
      const temporaryPassword = genPassword();
      const passwordHash = await hasher.hash(temporaryPassword, { temporary: true });
      await repo.updateLocked(id, (before) => {
        mustManage(actor, before);
        notSelf(actor, before);
        return {
          data: { passwordHash, mustChangePassword: true, failedLogins: 0, lockedUntil: null },
          revokeTokens: true,
          buildAudits: () => [audit(actor, ip, 'USER_RESET_PASSWORD', id, null, { mustChangePassword: true })],
        };
      });
      return { temporaryPassword };
    },

    // Chỉ ADMIN; tài khoản đã tham gia nghiệp vụ không xóa được (409), dùng khóa thay thế
    async remove(actor, id, ip) {
      if (actor.role !== ROLES.ADMIN) throw forbidden();
      await repo.remove(id, actor.id, (before, { actorExists, adminsLeft }) => {
        if (!actorExists) throw forbidden(); // người thực hiện vừa bị xóa trong lúc chờ khóa
        mustManage(actor, before);
        notSelf(actor, before);
        if (adminsLeft < 1) throw conflict('LAST_ADMIN', 'Phải còn ít nhất một quản trị viên');
        return {
          buildAudits: () => [audit(actor, ip, 'USER_DELETE', id, { code: before.code, role: before.role, ...profile(before) }, null)],
        };
      });
    },

    async setStaffScopes(actor, id, facultyIds, ip) {
      if (actor.role !== ROLES.ADMIN) throw forbidden();
      const ids = [...new Set(facultyIds)];
      const row = await repo.updateLocked(id, async (before) => {
        if (!before) throw notFound();
        if (before.role !== ROLES.STAFF) throw fail({ _: 'Chỉ cán bộ khoa mới có phạm vi khoa' });
        const errors = await refErrors({ staffFacultyIds: ids });
        if (Object.keys(errors).length) throw fail({ facultyIds: errors.staffFacultyIds });
        return {
          scopeIds: ids,
          buildAudits: (after) => [audit(actor, ip, 'STAFF_SCOPE_SET', id, { facultyIds: scopeOf(before) }, { facultyIds: scopeOf(after) })],
        };
      });
      return { user: userView(row) };
    },
  };
};
