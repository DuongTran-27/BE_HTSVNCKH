// Đợt NCKH (FR04, API_GD2 §4.3). Chỉ STAFF ghi; LECTURER/STUDENT chỉ đọc đợt của khoa mình; ADMIN không có quyền (FR25).
import { effectiveRoundConfig, validateRoundFields, topicSubmitSchema } from '@nckh/shared';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';

const DATE_FIELDS = ['regOpenAt', 'regCloseAt', 'reviewDeadline', 'endAt'];
// Phần lưu vào AuditLog: mốc và config (API_GD2 §4.3)
const snapshot = (r) => ({
  name: r.name,
  academicYear: r.academicYear,
  ...Object.fromEntries(DATE_FIELDS.map((k) => [k, new Date(r[k]).toISOString()])),
  config: r.config ?? {},
});
const fail = (details) => badRequest('VALIDATION_ERROR', 'Dữ liệu không hợp lệ', details);
// G45 (API_GD6 §10): tham số hồ sơ mà đề tài WAITING_ADVISOR/HAS_ADVISOR không sửa được để đáp ứng
const PROFILE_KEYS = ['minSummaryWords', 'minKeywords', 'maxKeywords'];
const passes = (cfg, t) => topicSubmitSchema(cfg).safeParse({ ...t, fieldId: t.fieldId ?? '' }).success;
const assertNoStuckTopics = async (oldCfg, newCfg, q) => {
  if (PROFILE_KEYS.every((k) => oldCfg[k] === newCfg[k])) return; // không đổi tham số hồ sơ → không quét
  // Chỉ đề tài trở nên không đạt vì thay đổi này; đề tài đã không đạt từ trước không chặn việc nới tham số
  const bad = (await q.pendingTopics()).filter((t) => passes(oldCfg, t) && !passes(newCfg, t));
  if (bad.length) {
    throw conflict('ROUND_CONFIG_BLOCKS_TOPICS', `Thay đổi này làm ${bad.length} đề tài đang chờ/đã có giảng viên hướng dẫn không còn đủ điều kiện gửi xét duyệt mà nhóm không sửa được hồ sơ`,
      { codes: bad.slice(0, 50).map((t) => t.code), total: bad.length });
  }
};

export const createRoundService = ({ repo, now = () => new Date() }) => {
  const present = (r, user) => {
    const t = now().getTime();
    const out = {
      id: r.id,
      facultyId: r.facultyId,
      name: r.name,
      academicYear: r.academicYear,
      regOpenAt: r.regOpenAt.toISOString(),
      regCloseAt: r.regCloseAt.toISOString(),
      reviewDeadline: r.reviewDeadline.toISOString(),
      endAt: r.endAt.toISOString(),
      effectiveConfig: effectiveRoundConfig(r.config),
      registrationOpen: r.regOpenAt.getTime() <= t && t < r.regCloseAt.getTime(), // API_GD2 §1.4: nửa mở như topics/service.js
    };
    return user.role === 'STAFF' ? { ...out, config: r.config ?? {} } : out; // GV/SV chỉ cần effectiveConfig
  };
  // STAFF: khoa trong phạm vi; GV/SV: khoa của mình; ADMIN: không có
  const visibleFaculties = (user) => {
    if (user.role === 'STAFF') return user.staffFacultyIds ?? [];
    if (user.role === 'LECTURER' || user.role === 'STUDENT') return user.facultyId ? [user.facultyId] : [];
    throw forbidden();
  };
  const mustFind = async (id) => {
    const r = await repo.findById(id);
    if (!r) throw notFound();
    return r;
  };
  const toDates = (o) =>
    Object.fromEntries(Object.entries(o).map(([k, v]) => [k, DATE_FIELDS.includes(k) ? new Date(v) : v]));

  return {
    async list(user, query) {
      const allowed = visibleFaculties(user);
      if (query.facultyId && !allowed.includes(query.facultyId)) throw forbidden();
      const { items, total } = await repo.list({
        facultyIds: query.facultyId ? [query.facultyId] : allowed,
        academicYear: query.academicYear,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      });
      return { items: items.map((r) => present(r, user)), page: query.page, pageSize: query.pageSize, total };
    },

    async get(user, id) {
      const r = await mustFind(id);
      if (!visibleFaculties(user).includes(r.facultyId)) throw forbidden();
      return { round: present(r, user) };
    },

    async create(user, body, ip) {
      if (user.role !== 'STAFF' || !user.staffFacultyIds?.includes(body.facultyId)) throw forbidden();
      const faculty = await repo.findFaculty(body.facultyId);
      if (!faculty?.isActive) throw fail({ facultyId: 'Khoa không tồn tại hoặc đã ngừng dùng' });
      const data = toDates({ ...body, config: body.config ?? {} });
      const row = await repo.create(data, (r) => ({
        actorId: user.id,
        action: 'ROUND_CREATE',
        entityType: 'Round',
        entityId: r.id,
        before: null,
        after: snapshot(r),
        ip,
      }));
      return { round: present(row, user) };
    },

    async update(user, id, body, ip) {
      // Thứ tự theo hợp đồng §2: id không tồn tại -> 404, tồn tại nhưng ngoài phạm vi -> 403
      const row = await repo.updateLocked(id, async (before, q) => {
        if (!before) throw notFound();
        if (user.role !== 'STAFF' || !user.staffFacultyIds?.includes(before.facultyId)) throw forbidden();
        // Gộp với giá trị hiện tại rồi kiểm lại thứ tự mốc + cấu hình hiệu lực; config gửi lên thay hẳn bản cũ
        const errors = validateRoundFields({ ...snapshot(before), ...body });
        if (Object.keys(errors).length) throw fail(errors);
        if (body.config !== undefined) await assertNoStuckTopics(effectiveRoundConfig(before.config), effectiveRoundConfig(body.config), q);
        return {
          data: toDates(body),
          buildAudit: (r) => ({
            actorId: user.id,
            action: 'ROUND_UPDATE',
            entityType: 'Round',
            entityId: r.id,
            before: snapshot(before),
            after: snapshot(r),
            ip,
          }),
        };
      });
      return { round: present(row, user) };
    },
  };
};
