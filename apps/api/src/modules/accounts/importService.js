// Nhập CSV tài khoản (FR02, API_GD2 §3.2, QD_ZOD §4.4). Preview không ghi DB; confirm kiểm lại từ đầu rồi ghi tất cả
// trong một transaction hoặc không ghi gì. Mật khẩu tạm chỉ trả một lần, không vào log/AuditLog.
import { ROLES, USER_IMPORT_HEADERS, USER_IMPORT_MAX_ROWS, USER_IMPORT_MAX_BYTES, userImportRowSchema, parseCsv } from '@nckh/shared';
import { badRequest, conflict, forbidden } from '../../lib/errors.js';
import { generateTempPassword } from '../../lib/tempPassword.js';
import { importLock as defaultLock } from './importLock.js';

export const IMPORT_HASH_CONCURRENCY = 2; // QD_ZOD §4.4.5: luôn chừa luồng threadpool cho login/đổi mật khẩu
const REPORT_LIMIT = 100;
const fileError = (message) => badRequest('VALIDATION_ERROR', 'Dữ liệu không hợp lệ', { file: message });

// Kiểm nội dung file (QD_ZOD §4.3.6): UTF-8 hợp lệ, không có byte 0x00; bỏ BOM.
export const decodeCsv = (buffer) => {
  if (!buffer?.length || buffer.length > USER_IMPORT_MAX_BYTES) throw fileError('File rỗng hoặc vượt quá dung lượng cho phép');
  if (buffer.includes(0)) throw fileError('Loại file không được hỗ trợ');
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer).replace(/^\uFEFF/, '');
  } catch {
    throw fileError('Loại file không được hỗ trợ');
  }
};

const mapLimit = async (items, limit, fn) => {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
};

export const createImportService = ({ repo, hasher, genPassword = generateTempPassword, importLock = defaultLock }) => {
  const mustImportInto = (actor, facultyId) => {
    if (actor.role === ROLES.ADMIN) return;
    if (actor.role === ROLES.STAFF && actor.staffFacultyIds.includes(facultyId)) return;
    throw forbidden();
  };

  // Phân tích và kiểm toàn bộ file; trả báo cáo + danh sách dòng hợp lệ (có số dòng).
  const analyze = async (actor, facultyId, buffer) => {
    mustImportInto(actor, facultyId);
    if (!(await repo.findFaculty(facultyId))?.isActive) {
      throw badRequest('VALIDATION_ERROR', 'Dữ liệu không hợp lệ', { facultyId: 'Khoa không tồn tại hoặc đã ngừng dùng' });
    }
    let records;
    try {
      records = parseCsv(decodeCsv(buffer));
    } catch (e) {
      throw e.status ? e : fileError('File CSV không đọc được (ngoặc kép không đóng)');
    }
    const [header, ...data] = records;
    if (!header || header.length !== USER_IMPORT_HEADERS.length || header.some((h, i) => h.trim() !== USER_IMPORT_HEADERS[i])) {
      throw fileError(`Dòng tiêu đề phải là: ${USER_IMPORT_HEADERS.join(',')}`);
    }
    if (!data.length) throw fileError('File không có dòng dữ liệu');
    if (data.length > USER_IMPORT_MAX_ROWS) throw fileError(`File vượt quá ${USER_IMPORT_MAX_ROWS} dòng dữ liệu`);

    const errors = []; // { row, field, message }
    const rows = []; // dòng qua schema: { row, ...giá trị }
    data.forEach((cells, i) => {
      const row = i + 2; // tính cả dòng tiêu đề
      if (cells.length !== USER_IMPORT_HEADERS.length) {
        errors.push({ row, field: null, message: `Sai số cột (cần ${USER_IMPORT_HEADERS.length}, có ${cells.length})` });
        return;
      }
      const parsed = userImportRowSchema.safeParse(Object.fromEntries(USER_IMPORT_HEADERS.map((h, k) => [h, cells[k]])));
      if (parsed.success) return rows.push({ row, ...parsed.data });
      const seen = new Set();
      for (const is of parsed.error.issues) {
        const field = String(is.path[0] ?? '') || null;
        if (seen.has(field)) continue; // một lỗi cho mỗi trường
        seen.add(field);
        errors.push({ row, field, message: is.message });
      }
    });

    // Trùng trong file (mã không phân biệt hoa thường, khớp unique lower(code))
    const first = { code: new Map(), email: new Map(), whole: new Map() };
    const candidates = [];
    for (const r of rows) {
      const k = { code: r.code.toLowerCase(), email: r.email };
      const whole = first.whole.get(`${k.code}\u0000${k.email}`);
      if (whole) {
        errors.push({ row: r.row, field: null, message: `Dòng trùng hoàn toàn với dòng ${whole}` });
        continue;
      }
      let dup = false;
      for (const f of ['code', 'email']) {
        const at = first[f].get(k[f]);
        if (at) {
          errors.push({ row: r.row, field: f, message: `${f === 'code' ? 'Mã' : 'Email'} trùng với dòng ${at}` });
          dup = true;
        } else first[f].set(k[f], r.row);
      }
      first.whole.set(`${k.code}\u0000${k.email}`, r.row);
      if (!dup) candidates.push(r);
    }

    // Trùng với DB và lớp hợp lệ của khoa (hai truy vấn cho cả file)
    const [existing, classes] = await Promise.all([
      repo.findExisting({ codes: candidates.map((r) => r.code.toLowerCase()), emails: candidates.map((r) => r.email) }),
      repo.findClassesByCodes(facultyId, [...new Set(candidates.map((r) => r.classCode).filter(Boolean))]),
    ]);
    const dbCodes = new Set(existing.map((u) => u.code.toLowerCase()));
    const dbEmails = new Set(existing.map((u) => u.email));
    const classIds = new Map(classes.map((c) => [c.code, c.id]));
    const valid = [];
    for (const r of candidates) {
      const before = errors.length;
      if (dbCodes.has(r.code.toLowerCase())) errors.push({ row: r.row, field: 'code', message: 'Mã đã tồn tại' });
      if (dbEmails.has(r.email)) errors.push({ row: r.row, field: 'email', message: 'Email đã tồn tại' });
      if (r.classCode && !classIds.has(r.classCode)) {
        errors.push({ row: r.row, field: 'classCode', message: 'Lớp không tồn tại, đã ngừng dùng hoặc không thuộc khoa' });
      }
      if (errors.length === before) valid.push({ ...r, classId: classIds.get(r.classCode) ?? null });
    }

    errors.sort((a, b) => a.row - b.row);
    const report = {
      validCount: valid.length,
      errorCount: data.length - valid.length, // số dòng lỗi thật (một dòng có thể nhiều lỗi)
      errors: errors.slice(0, REPORT_LIMIT),
      preview: valid.slice(0, REPORT_LIMIT).map(({ row, code, email, fullName, role, classCode }) => ({
        row, code, email, fullName, role, classCode: classCode ?? '',
      })),
    };
    return { report, valid };
  };

  return {
    async preview(actor, facultyId, buffer) {
      return (await analyze(actor, facultyId, buffer)).report;
    },

    async confirm(actor, facultyId, buffer, ip) {
      mustImportInto(actor, facultyId); // 403 trước khi giữ cờ
      if (!importLock.tryAcquire()) throw conflict('IMPORT_IN_PROGRESS', 'Đang có lượt nhập khác, vui lòng thử lại sau');
      try {
        const { report, valid } = await analyze(actor, facultyId, buffer);
        if (report.errorCount > 0) throw badRequest('IMPORT_HAS_ERRORS', 'File có dòng lỗi, chưa ghi dữ liệu nào', report);
        // Băm TRƯỚC transaction, tối đa IMPORT_HASH_CONCURRENCY phép song song
        const hashed = await mapLimit(valid, IMPORT_HASH_CONCURRENCY, async (r) => {
          const temporaryPassword = genPassword();
          return { r, temporaryPassword, passwordHash: await hasher.hash(temporaryPassword, { temporary: true }) };
        });
        await repo.importUsers(
          hashed.map(({ r, passwordHash }) => ({
            code: r.code, email: r.email, fullName: r.fullName, role: r.role,
            facultyId, classId: r.classId, passwordHash, mustChangePassword: true,
          })),
          (created) =>
            created.map((u) => ({
              actorId: actor.id,
              action: 'USER_CREATE',
              entityType: 'User',
              entityId: u.id,
              after: { code: u.code, role: u.role, email: u.email, fullName: u.fullName, classId: u.classId, facultyId: u.facultyId, source: 'CSV_IMPORT' },
              ip,
            })),
        );
        return {
          createdCount: hashed.length,
          credentials: hashed.map(({ r, temporaryPassword }) => ({ code: r.code, email: r.email, fullName: r.fullName, temporaryPassword })),
        };
      } finally {
        importLock.release();
      }
    },
  };
};
