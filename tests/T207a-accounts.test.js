// T207a (FR02, FR25, FR15): API tài khoản trên DB test thật qua supertest. Dữ liệu riêng, resetData ở beforeAll.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../src/app.js';
import { createAuthRepo } from '../src/modules/auth/prismaRepo.js';
import { createAccountRepo } from '../src/modules/accounts/prismaRepo.js';
import { createFirstAdmin } from '../src/modules/accounts/bootstrapAdmin.js';
import { main as createAdminCli } from '../scripts/create-admin.js';
import { signAccessToken, sha256 } from '../src/lib/tokens.js';
import { fakeHasher, testEnv } from './helpers.js';
import { resetData } from './db.js';

const prisma = new PrismaClient();
const app = createApp({
  env: testEnv,
  logger: undefined,
  authRepo: createAuthRepo(prisma),
  hasher: fakeHasher,
  accountRepo: createAccountRepo(prisma),
});

let F1, F2, F3, C1, C2, C3off;
const U = {};
const tok = {};
const as = (who) => ({ Authorization: `Bearer ${tok[who]}` });
const get = (who, url) => request(app).get(url).set(as(who));
const post = (who, url, body) => request(app).post(url).set(as(who)).send(body);
const patch = (who, url, body) => request(app).patch(url).set(as(who)).send(body);
const put = (who, url, body) => request(app).put(url).set(as(who)).send(body);
const audits = (entityId) => prisma.auditLog.findMany({ where: { entityType: 'User', entityId }, orderBy: { id: 'asc' } });
const dbUser = (id) => prisma.user.findUnique({ where: { id }, include: { staffScopes: true } });
const liveTokens = (userId) => prisma.refreshToken.count({ where: { userId, revokedAt: null } });
const newToken = (userId, raw) =>
  prisma.refreshToken.create({
    data: { userId, family: `fam-${raw}`, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + 86400e3) },
  });
let seq = 0;
const studentBody = (extra = {}) => {
  seq += 1;
  return { code: `SVX${seq}`, email: `svx${seq}@st.edu.vn`, fullName: `Sinh viên ${seq}`, role: 'STUDENT', facultyId: F1.id, classId: C1.id, ...extra };
};
const mkUser = async (key, role, extra = {}) => {
  const u = await prisma.user.create({
    data: { code: key, email: `${key.toLowerCase()}@t.vn`, fullName: key, passwordHash: 'x', role, mustChangePassword: false, ...extra },
  });
  U[key] = u;
  tok[key] = signAccessToken(u, { secret: testEnv.JWT_ACCESS_SECRET, ttlSeconds: 600 });
  return u;
};

beforeAll(async () => {
  await resetData(prisma);
  [F1, F2, F3] = await Promise.all([
    prisma.faculty.create({ data: { code: 'CNTT', name: 'Công nghệ thông tin' } }),
    prisma.faculty.create({ data: { code: 'KT', name: 'Kinh tế' } }),
    prisma.faculty.create({ data: { code: 'OLD', name: 'Khoa cũ', isActive: false } }),
  ]);
  const m1 = await prisma.major.create({ data: { facultyId: F1.id, code: 'KTPM', name: 'KTPM' } });
  const m2 = await prisma.major.create({ data: { facultyId: F2.id, code: 'KTDN', name: 'KTDN' } });
  C1 = await prisma.class.create({ data: { majorId: m1.id, code: 'KTPM01' } });
  C2 = await prisma.class.create({ data: { majorId: m2.id, code: 'KTDN01' } });
  C3off = await prisma.class.create({ data: { majorId: m1.id, code: 'KTPM00', isActive: false } });

  await mkUser('admin', 'ADMIN');
  await mkUser('admin2', 'ADMIN');
  const s1 = await mkUser('staff1', 'STAFF', { facultyId: F1.id });
  const s2 = await mkUser('staff2', 'STAFF', { facultyId: F2.id });
  await prisma.staffScope.createMany({
    data: [
      { userId: s1.id, facultyId: F1.id },
      { userId: s2.id, facultyId: F2.id },
    ],
  });
  await mkUser('lect', 'LECTURER', { facultyId: F1.id });
  await mkUser('stud', 'STUDENT', { facultyId: F1.id, classId: C1.id });
  await mkUser('studF2', 'STUDENT', { facultyId: F2.id, classId: C2.id });
  await mkUser('mustChange', 'ADMIN', { mustChangePassword: true });
}, 60000);
afterAll(() => prisma.$disconnect());

describe('quyền (FR25, FR02)', () => {
  it('chưa đăng nhập 401; phải đổi mật khẩu trước 403 PASSWORD_CHANGE_REQUIRED', async () => {
    expect((await request(app).get('/api/users')).status).toBe(401);
    const r = await get('mustChange', '/api/users');
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
  });

  it('GIẢNG VIÊN và SINH VIÊN 403 trên mọi endpoint', async () => {
    for (const who of ['lect', 'stud']) {
      const id = U.studF2.id;
      expect((await get(who, '/api/users')).status, who).toBe(403);
      expect((await get(who, `/api/users/${id}`)).status, who).toBe(403);
      expect((await post(who, '/api/users', studentBody())).status, who).toBe(403);
      expect((await patch(who, `/api/users/${id}`, { fullName: 'X' })).status, who).toBe(403);
      expect((await post(who, `/api/users/${id}/lock`)).status, who).toBe(403);
      expect((await post(who, `/api/users/${id}/unlock`)).status, who).toBe(403);
      expect((await post(who, `/api/users/${id}/reset-password`)).status, who).toBe(403);
      expect((await put(who, `/api/users/${U.staff1.id}/staff-scopes`, { facultyIds: [F1.id] })).status, who).toBe(403);
    }
  });

  it('gán phạm vi khoa chỉ ADMIN: CÁN BỘ 403', async () => {
    const r = await put('staff1', `/api/users/${U.staff1.id}/staff-scopes`, { facultyIds: [F1.id, F2.id] });
    expect(r.status).toBe(403);
    expect((await dbUser(U.staff1.id)).staffScopes).toHaveLength(1);
  });
});

describe('tạo tài khoản (FR02)', () => {
  it('TC-FR02-01 ADMIN tạo SV: 201, mật khẩu tạm chỉ trả một lần + no-store, chỉ lưu hash, mustChangePassword, AuditLog không có mật khẩu', async () => {
    const r = await post('admin', '/api/users', studentBody({ code: 'SV100', email: 'SV100@St.edu.vn' }));
    expect(r.status).toBe(201);
    expect(r.headers['cache-control']).toBe('no-store');
    const pw = r.body.temporaryPassword;
    expect(pw.length).toBeGreaterThanOrEqual(12);
    expect(pw).toMatch(/[A-Za-z]/);
    expect(pw).toMatch(/\d/);
    expect(r.body.user).toMatchObject({ code: 'SV100', email: 'sv100@st.edu.vn', role: 'STUDENT', mustChangePassword: true, isLocked: false, staffFacultyIds: [] });
    expect(JSON.stringify(r.body.user)).not.toMatch(/passwordHash|failedLogins|lockedUntil/);
    const row = await dbUser(r.body.user.id);
    expect(row.passwordHash).toBe(`h:${pw}`);
    expect(row.mustChangePassword).toBe(true);
    const a = await audits(r.body.user.id);
    expect(a.map((x) => x.action)).toEqual(['USER_CREATE']);
    expect(a[0].actorId).toBe(U.admin.id);
    expect(JSON.stringify(a, (_k, v) => (typeof v === 'bigint' ? String(v) : v))).not.toContain(pw);
    // GET lại không còn mật khẩu
    expect(JSON.stringify((await get('admin', `/api/users/${r.body.user.id}`)).body)).not.toContain(pw);
  });

  it('TC-FR02-02 mật khẩu tạm đăng nhập được, nhưng bị buộc đổi mật khẩu trước khi dùng API nghiệp vụ', async () => {
    const c = await post('admin', '/api/users', studentBody({ code: 'SV101', email: 'sv101@st.edu.vn' }));
    const login = await request(app).post('/api/auth/login').send({ identifier: 'SV101', password: c.body.temporaryPassword });
    expect(login.status).toBe(200);
    expect(login.body.user.mustChangePassword).toBe(true);
    const r = await request(app).get('/api/users').set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
  });

  it('ADMIN tạo CÁN BỘ kèm phạm vi: AuditLog USER_CREATE + STAFF_SCOPE_SET, view có staffFacultyIds', async () => {
    const r = await post('admin', '/api/users', {
      code: 'CB100', email: 'cb100@t.vn', fullName: 'Cán bộ', role: 'STAFF', facultyId: F1.id, staffFacultyIds: [F1.id, F2.id],
    });
    expect(r.status).toBe(201);
    expect(r.body.user.staffFacultyIds.sort()).toEqual([F1.id, F2.id].sort());
    expect((await audits(r.body.user.id)).map((x) => x.action)).toEqual(['USER_CREATE', 'STAFF_SCOPE_SET']);
  });

  it('ADMIN tạo ADMIN không cần khoa; gửi facultyId cho ADMIN thì 400', async () => {
    const ok = await post('admin', '/api/users', { code: 'QT100', email: 'qt100@t.vn', fullName: 'QT', role: 'ADMIN' });
    expect(ok.status).toBe(201);
    expect(ok.body.user.facultyId).toBeNull();
    const bad = await post('admin', '/api/users', { code: 'QT101', email: 'qt101@t.vn', fullName: 'QT', role: 'ADMIN', facultyId: F1.id });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details.facultyId).toBeTruthy();
  });

  it('CÁN BỘ: tạo SV/GV trong khoa mình được; tạo ADMIN/STAFF hoặc khoa ngoài phạm vi → 403, không ghi gì', async () => {
    expect((await post('staff1', '/api/users', studentBody())).status).toBe(201);
    const before = await prisma.user.count();
    expect((await post('staff1', '/api/users', { code: 'GV100', email: 'gv100@t.vn', fullName: 'G', role: 'LECTURER', facultyId: F1.id })).status).toBe(201);
    const denied = [
      { code: 'CB101', email: 'cb101@t.vn', fullName: 'C', role: 'STAFF', facultyId: F1.id, staffFacultyIds: [F1.id] },
      { code: 'QT102', email: 'qt102@t.vn', fullName: 'Q', role: 'ADMIN' },
      studentBody({ facultyId: F2.id, classId: C2.id }),
    ];
    for (const b of denied) expect((await post('staff1', '/api/users', b)).status, b.code).toBe(403);
    expect(await prisma.user.count()).toBe(before + 1);
  });

  it('danh mục tham chiếu: lớp khoa khác / lớp ngừng dùng / khoa ngừng dùng → 400 tại đúng trường; thiếu lớp cho SV 400', async () => {
    const wrongFaculty = await post('admin', '/api/users', studentBody({ classId: C2.id }));
    expect(wrongFaculty.status).toBe(400);
    expect(wrongFaculty.body.error.details.classId).toBeTruthy();
    const off = await post('admin', '/api/users', studentBody({ classId: C3off.id }));
    expect(off.body.error.details.classId).toBeTruthy();
    const offFaculty = await post('admin', '/api/users', { code: 'GV102', email: 'gv102@t.vn', fullName: 'G', role: 'LECTURER', facultyId: F3.id });
    expect(offFaculty.status).toBe(400);
    expect(offFaculty.body.error.details.facultyId).toBeTruthy();
    const noClass = await post('admin', '/api/users', studentBody({ classId: undefined }));
    expect(noClass.status).toBe(400);
    expect(noClass.body.error.details.classId).toBeTruthy();
    const badScope = await post('admin', '/api/users', {
      code: 'CB102', email: 'cb102@t.vn', fullName: 'C', role: 'STAFF', facultyId: F1.id, staffFacultyIds: [F3.id],
    });
    expect(badScope.body.error.details.staffFacultyIds).toBeTruthy();
  });

  it('TC-FR02-03 trùng mã / email (kể cả khác hoa thường) → 409 DUPLICATE, details đúng trường, không tạo dòng nào', async () => {
    const before = await prisma.user.count();
    const dupCode = await post('admin', '/api/users', studentBody({ code: 'sv100' }));
    expect(dupCode.status).toBe(409);
    expect(dupCode.body.error).toMatchObject({ code: 'DUPLICATE', details: { code: 'Đã tồn tại' } });
    const dupEmail = await post('admin', '/api/users', studentBody({ email: 'SV100@st.edu.vn' }));
    expect(dupEmail.status).toBe(409);
    expect(dupEmail.body.error.details).toEqual({ email: 'Đã tồn tại' });
    expect(await prisma.user.count()).toBe(before);
  });

  it('TC-FR02-04 không có tự nâng quyền: role lạ 400; body có passwordHash/mustChangePassword bị bỏ qua', async () => {
    expect((await post('admin', '/api/users', studentBody({ role: 'SUPERUSER' }))).status).toBe(400);
    const r = await post('admin', '/api/users', studentBody({ passwordHash: 'h:mine', mustChangePassword: false }));
    expect(r.status).toBe(201);
    const row = await dbUser(r.body.user.id);
    expect(row.passwordHash).not.toBe('h:mine');
    expect(row.mustChangePassword).toBe(true);
  });
});

describe('xem và liệt kê', () => {
  it('GET /:id: 404 khi không có; CÁN BỘ ngoài phạm vi 403; ADMIN xem được; id lạ ký tự 404', async () => {
    expect((await get('admin', '/api/users/khong-ton-tai')).status).toBe(404);
    expect((await get('staff1', `/api/users/${U.studF2.id}`)).status).toBe(403);
    expect((await get('staff1', `/api/users/${U.admin.id}`)).status).toBe(403);
    expect((await get('staff1', `/api/users/${U.stud.id}`)).status).toBe(200);
    const r = await get('admin', `/api/users/${U.staff1.id}`);
    expect(r.body.user.staffFacultyIds).toEqual([F1.id]);
  });

  it('danh sách: CÁN BỘ chỉ thấy GV/SV khoa mình; lọc khoa ngoài phạm vi 403; ADMIN thấy tất cả', async () => {
    const r = await get('staff2', '/api/users');
    expect(r.status).toBe(200);
    expect(r.body.items.every((u) => u.facultyId === F2.id && ['LECTURER', 'STUDENT'].includes(u.role))).toBe(true);
    expect(r.body.items.map((u) => u.id)).toContain(U.studF2.id);
    expect(r.body.items.map((u) => u.id)).not.toContain(U.staff2.id);
    expect((await get('staff2', `/api/users?facultyId=${F1.id}`)).status).toBe(403);
    expect((await get('staff2', '/api/users?role=ADMIN')).body.items).toEqual([]);
    const all = await get('admin', '/api/users?pageSize=100');
    expect(all.body.items.map((u) => u.id)).toEqual(expect.arrayContaining([U.admin.id, U.studF2.id, U.stud.id]));
    expect(JSON.stringify(all.body)).not.toMatch(/passwordHash|failedLogins|lockedUntil/);
  });

  it('lọc và tìm không dấu; phân trang; page quá lớn trả items rỗng', async () => {
    await post('admin', '/api/users', studentBody({ code: 'SVTIM1', email: 'tim1@t.vn', fullName: 'Nguyễn Văn Ánh' }));
    const q = await get('admin', `/api/users?q=${encodeURIComponent('nguyen van anh')}`);
    expect(q.body.items.map((u) => u.code)).toEqual(['SVTIM1']);
    expect((await get('admin', '/api/users?q=%25')).body.total).toBe(0); // ký tự đại diện LIKE không khớp tất cả
    expect((await get('admin', '/api/users?role=STAFF&isLocked=false')).body.items.every((u) => u.role === 'STAFF')).toBe(true);
    const p1 = await get('admin', '/api/users?pageSize=2&page=1');
    expect(p1.body).toMatchObject({ page: 1, pageSize: 2 });
    expect(p1.body.items).toHaveLength(2);
    expect((await get('admin', '/api/users?page=9999')).body.items).toEqual([]);
    expect((await get('admin', '/api/users?isLocked=maybe')).status).toBe(400);
  });
});

describe('sửa (PATCH)', () => {
  it('ADMIN sửa email/họ tên/lớp: ghi AuditLog before/after; role, code, password trong body bị bỏ qua', async () => {
    const c = await post('admin', '/api/users', studentBody({ code: 'SV200', email: 'sv200@t.vn' }));
    const id = c.body.user.id;
    const r = await patch('admin', `/api/users/${id}`, { fullName: 'Tên mới', email: 'Moi200@T.vn', role: 'ADMIN', code: 'KHAC', password: 'x' });
    expect(r.status).toBe(200);
    expect(r.body.user).toMatchObject({ fullName: 'Tên mới', email: 'moi200@t.vn', role: 'STUDENT', code: 'SV200' });
    const a = (await audits(id)).find((x) => x.action === 'USER_UPDATE');
    expect(a.before).toMatchObject({ email: 'sv200@t.vn' });
    expect(a.after).toMatchObject({ email: 'moi200@t.vn', fullName: 'Tên mới' });
  });

  it('kiểm lỗi: rỗng 400; email trùng 409; classId cho GV 400; lớp khác khoa 400; CÁN BỘ đổi facultyId 403; ngoài phạm vi 403; 404', async () => {
    expect((await patch('admin', `/api/users/${U.stud.id}`, {})).status).toBe(400);
    const dup = await patch('admin', `/api/users/${U.stud.id}`, { email: U.lect.email });
    expect(dup.status).toBe(409);
    expect(dup.body.error.details).toEqual({ email: 'Đã tồn tại' });
    const cls = await patch('admin', `/api/users/${U.lect.id}`, { classId: C1.id });
    expect(cls.status).toBe(400);
    expect((await patch('admin', `/api/users/${U.stud.id}`, { classId: C2.id })).body.error.details.classId).toBeTruthy();
    expect((await patch('staff1', `/api/users/${U.stud.id}`, { facultyId: F2.id })).status).toBe(403);
    expect((await patch('staff1', `/api/users/${U.studF2.id}`, { fullName: 'X' })).status).toBe(403);
    expect((await patch('admin', '/api/users/khong-co', { fullName: 'X' })).status).toBe(404);
    expect((await patch('staff1', `/api/users/${U.stud.id}`, { fullName: 'Tên hợp lệ' })).status).toBe(200);
  });

  it('đổi facultyId của SV mà lớp cũ không thuộc khoa mới → 400', async () => {
    const r = await patch('admin', `/api/users/${U.stud.id}`, { facultyId: F2.id });
    expect(r.status).toBe(400);
    expect(r.body.error.details.classId).toBeTruthy();
    expect((await dbUser(U.stud.id)).facultyId).toBe(F1.id);
  });
});

describe('khóa / mở khóa / reset', () => {
  it('khóa: isLocked, thu hồi mọi refresh token, user bị khóa gọi API 401, AuditLog USER_LOCK; mở: reset failedLogins/lockedUntil', async () => {
    const c = await post('admin', '/api/users', studentBody({ code: 'SV300', email: 'sv300@t.vn' }));
    const id = c.body.user.id;
    await newToken(id, 'sv300-a');
    await newToken(id, 'sv300-b');
    await prisma.user.update({ where: { id }, data: { mustChangePassword: false, failedLogins: 3, lockedUntil: new Date(Date.now() + 600e3) } });
    const bearer = signAccessToken({ id, role: 'STUDENT' }, { secret: testEnv.JWT_ACCESS_SECRET, ttlSeconds: 600 });

    const r = await post('admin', `/api/users/${id}/lock`);
    expect(r.status).toBe(200);
    expect(r.body.user.isLocked).toBe(true);
    expect(await liveTokens(id)).toBe(0);
    expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${bearer}`)).status).toBe(401);
    expect((await audits(id)).map((x) => x.action)).toContain('USER_LOCK');

    const u = await post('staff1', `/api/users/${id}/unlock`);
    expect(u.status).toBe(200);
    const row = await dbUser(id);
    expect(row).toMatchObject({ isLocked: false, failedLogins: 0, lockedUntil: null });
    expect((await audits(id)).map((x) => x.action)).toContain('USER_UNLOCK');
  });

  it('không tự khóa / tự reset mình (403); CÁN BỘ ngoài phạm vi 403; id lạ 404', async () => {
    expect((await post('admin', `/api/users/${U.admin.id}/lock`)).status).toBe(403);
    expect((await post('admin', `/api/users/${U.admin.id}/reset-password`)).status).toBe(403);
    expect((await dbUser(U.admin.id)).isLocked).toBe(false);
    expect((await post('staff1', `/api/users/${U.studF2.id}/lock`)).status).toBe(403);
    expect((await post('staff1', `/api/users/${U.studF2.id}/reset-password`)).status).toBe(403);
    expect((await post('staff1', `/api/users/${U.admin.id}/lock`)).status).toBe(403);
    expect((await post('admin', '/api/users/khong-co/lock')).status).toBe(404);
    expect((await post('admin', '/api/users/khong-co/reset-password')).status).toBe(404);
    expect((await dbUser(U.studF2.id)).isLocked).toBe(false);
  });

  it('reset: hash mới, mustChangePassword, failedLogins/lockedUntil về mặc định, thu hồi phiên, no-store, AuditLog không có mật khẩu; mật khẩu cũ hết hiệu lực', async () => {
    const c = await post('admin', '/api/users', studentBody({ code: 'SV301', email: 'sv301@t.vn' }));
    const id = c.body.user.id;
    await newToken(id, 'sv301-a');
    await prisma.user.update({ where: { id }, data: { mustChangePassword: false, failedLogins: 4, lockedUntil: new Date(Date.now() + 600e3) } });

    const r = await post('staff1', `/api/users/${id}/reset-password`);
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    const pw = r.body.temporaryPassword;
    expect(Object.keys(r.body)).toEqual(['temporaryPassword']);
    expect(pw).not.toBe(c.body.temporaryPassword);
    const row = await dbUser(id);
    expect(row).toMatchObject({ passwordHash: `h:${pw}`, mustChangePassword: true, failedLogins: 0, lockedUntil: null });
    expect(await liveTokens(id)).toBe(0);
    const a = (await audits(id)).find((x) => x.action === 'USER_RESET_PASSWORD');
    expect(a.actorId).toBe(U.staff1.id);
    expect(JSON.stringify(a, (_k, v) => (typeof v === 'bigint' ? String(v) : v))).not.toContain(pw);
    const login = (p) => request(app).post('/api/auth/login').send({ identifier: 'SV301', password: p });
    expect((await login(c.body.temporaryPassword)).status).toBe(401);
    const ok = await login(pw);
    expect(ok.status).toBe(200);
    expect(ok.body.user.mustChangePassword).toBe(true);
  });
});

describe('phạm vi khoa cán bộ (PUT staff-scopes)', () => {
  it('ADMIN thay toàn bộ phạm vi: AuditLog before/after, hiệu lực ngay ở request kế tiếp', async () => {
    const c = await post('admin', '/api/users', {
      code: 'CB200', email: 'cb200@t.vn', fullName: 'C', role: 'STAFF', facultyId: F1.id, staffFacultyIds: [F1.id],
    });
    const id = c.body.user.id;
    await prisma.user.update({ where: { id }, data: { mustChangePassword: false } });
    const bearer = signAccessToken({ id, role: 'STAFF' }, { secret: testEnv.JWT_ACCESS_SECRET, ttlSeconds: 600 });
    const list = (q = '') => request(app).get(`/api/users?facultyId=${F2.id}${q}`).set('Authorization', `Bearer ${bearer}`);
    expect((await list()).status).toBe(403);

    const r = await put('admin', `/api/users/${id}/staff-scopes`, { facultyIds: [F2.id, F2.id] });
    expect(r.status).toBe(200);
    expect(r.body.user.staffFacultyIds).toEqual([F2.id]);
    const a = (await audits(id)).filter((x) => x.action === 'STAFF_SCOPE_SET');
    expect(a).toHaveLength(2);
    expect(a[1].before).toEqual({ facultyIds: [F1.id] });
    expect(a[1].after).toEqual({ facultyIds: [F2.id] });
    expect((await list()).status).toBe(200);
  });

  it('lỗi: đích không phải STAFF 400; khoa ngừng dùng/không tồn tại 400; danh sách rỗng 400; id lạ 404', async () => {
    expect((await put('admin', `/api/users/${U.lect.id}/staff-scopes`, { facultyIds: [F1.id] })).status).toBe(400);
    expect((await put('admin', `/api/users/${U.staff1.id}/staff-scopes`, { facultyIds: [F3.id] })).body.error.details.facultyIds).toBeTruthy();
    expect((await put('admin', `/api/users/${U.staff1.id}/staff-scopes`, { facultyIds: ['khong-co'] })).status).toBe(400);
    expect((await put('admin', `/api/users/${U.staff1.id}/staff-scopes`, { facultyIds: [] })).status).toBe(400);
    expect((await put('admin', '/api/users/khong-co/staff-scopes', { facultyIds: [F1.id] })).status).toBe(404);
    expect((await dbUser(U.staff1.id)).staffScopes.map((s) => s.facultyId)).toEqual([F1.id]);
  });
});

describe('xóa (DELETE)', () => {
  const del = (who, url) => request(app).delete(url).set(as(who));

  it('ADMIN xóa tài khoản chưa có nghiệp vụ: 204, xóa phạm vi/token/thông báo, AuditLog USER_DELETE còn lại', async () => {
    const c = await post('admin', '/api/users', { code: 'CBDEL', email: 'cbdel@t.vn', fullName: 'Cán bộ xóa', role: 'STAFF', facultyId: F1.id, staffFacultyIds: [F1.id] });
    const id = c.body.user.id;
    await newToken(id, 'cbdel');
    await prisma.notification.create({ data: { userId: id, type: 'X', title: 't', dedupeKey: 'k' } });
    const r = await del('admin', `/api/users/${id}`);
    expect(r.status).toBe(204);
    expect(await dbUser(id)).toBeNull();
    expect(await prisma.staffScope.count({ where: { userId: id } })).toBe(0);
    expect(await prisma.refreshToken.count({ where: { userId: id } })).toBe(0);
    expect(await prisma.notification.count({ where: { userId: id } })).toBe(0);
    const a = (await audits(id)).find((x) => x.action === 'USER_DELETE');
    expect(a).toMatchObject({ actorId: U.admin.id, after: null });
    expect(a.before).toMatchObject({ code: 'CBDEL', role: 'STAFF', email: 'cbdel@t.vn' });
  });

  it('không xóa chính mình; CÁN BỘ/GV/SV 403; id không có 404; không đổi gì', async () => {
    expect((await del('admin', `/api/users/${U.admin.id}`)).status).toBe(403);
    expect((await del('staff1', `/api/users/${U.stud.id}`)).status).toBe(403);
    expect((await del('lect', `/api/users/${U.stud.id}`)).status).toBe(403);
    expect((await del('admin', '/api/users/khong-co')).status).toBe(404);
    expect(await dbUser(U.admin.id)).not.toBeNull();
    expect(await dbUser(U.stud.id)).not.toBeNull();
  });

  it('tài khoản đã tham gia đề tài: 409 IN_USE, rollback cả AuditLog (NFR05)', async () => {
    const c = await post('admin', '/api/users', studentBody({ code: 'SVDEL', email: 'svdel@t.vn' }));
    const id = c.body.user.id;
    const round = await prisma.round.create({
      data: { facultyId: F1.id, name: 'Đợt xóa', academicYear: '2026-2027', regOpenAt: new Date(), regCloseAt: new Date(Date.now() + 1e9), reviewDeadline: new Date(Date.now() + 2e9), endAt: new Date(Date.now() + 3e9), config: {} },
    });
    await prisma.topic.create({ data: { code: 'T207-DEL', roundId: round.id, facultyId: F1.id, members: { create: { userId: id, role: 'LEADER' } } } });
    const r = await del('admin', `/api/users/${id}`);
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('IN_USE');
    expect(await dbUser(id)).not.toBeNull();
    expect((await audits(id)).map((x) => x.action)).not.toContain('USER_DELETE');
  });
});

describe('rate limit tạo / reset (30 / 15 phút / người dùng, dùng chung)', () => {
  it('29 lần reset + 1 lần tạo vẫn qua; lần thứ 31 (tạo hoặc reset) → 429 RATE_LIMITED', async () => {
    const target = await prisma.user.create({
      data: { code: 'SVLIM', email: 'svlim@t.vn', fullName: 'L', role: 'STUDENT', passwordHash: 'x', facultyId: F1.id, classId: C1.id },
    });
    for (let i = 0; i < 29; i++) expect((await post('admin2', `/api/users/${target.id}/reset-password`)).status, `reset ${i}`).toBe(200);
    expect((await post('admin2', '/api/users', studentBody())).status).toBe(201);
    const r = await post('admin2', `/api/users/${target.id}/reset-password`);
    expect(r.status).toBe(429);
    expect(r.body.error.code).toBe('RATE_LIMITED');
    expect((await post('admin2', '/api/users', studentBody())).status).toBe(429);
    // người khác không bị ảnh hưởng
    expect((await post('admin', '/api/users', studentBody())).status).toBe(201);
  }, 60000);
});

describe('tạo quản trị viên đầu tiên (CLI, production)', () => {
  const input = { code: 'QTCLI', email: 'Qtcli@Khoa.edu.vn', fullName: 'Quản trị đầu tiên' };

  it('đã có ADMIN thì từ chối; --force mới tạo thêm; chỉ lưu hash; AuditLog không có mật khẩu', async () => {
    await expect(createFirstAdmin(prisma, fakeHasher, input)).rejects.toThrow(/Đã có quản trị viên/);
    expect(await prisma.user.count({ where: { code: 'QTCLI' } })).toBe(0);
    const { user, temporaryPassword } = await createFirstAdmin(prisma, fakeHasher, input, { force: true });
    expect(user).toMatchObject({ role: 'ADMIN', email: 'qtcli@khoa.edu.vn', mustChangePassword: true, facultyId: null });
    expect(user.passwordHash).toBe(`h:${temporaryPassword}`);
    const [a] = await audits(user.id);
    expect(a).toMatchObject({ action: 'USER_CREATE', actorId: null });
    expect(JSON.stringify(a, (_k, v) => (typeof v === 'bigint' ? String(v) : v))).not.toContain(temporaryPassword);
  });

  it('DB chưa có ADMIN: tạo được không cần --force; dữ liệu sai bị từ chối; hai lệnh đồng thời chỉ một thành công', async () => {
    await prisma.$executeRaw`UPDATE "User" SET role = 'STAFF' WHERE role = 'ADMIN'`; // dữ liệu test riêng, dọn lại ở cuối
    const bad = createFirstAdmin(prisma, fakeHasher, { code: 'có dấu', email: 'x', fullName: '' });
    await expect(bad).rejects.toThrow(/Dữ liệu không hợp lệ/);
    const results = await Promise.allSettled([
      createFirstAdmin(prisma, fakeHasher, { code: 'QTA', email: 'qta@t.vn', fullName: 'A' }),
      createFirstAdmin(prisma, fakeHasher, { code: 'QTB', email: 'qtb@t.vn', fullName: 'B' }),
    ]);
    expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.user.count({ where: { role: 'ADMIN' } })).toBe(1);
  });

  it('lệnh CLI in mật khẩu tạm đúng một lần và dùng hasher Argon2 thật', async () => {
    const lines = [];
    await createAdminCli(['--code', 'QTCLI2', '--email', 'qtcli2@t.vn', '--name', 'Quản trị', '--force'], {
      prisma: new PrismaClient(),
      log: (l) => lines.push(l),
    });
    expect(lines).toHaveLength(2);
    const pw = lines[1].split(': ').pop();
    const row = await prisma.user.findFirst({ where: { code: 'QTCLI2' } });
    expect(row.passwordHash).toMatch(/^\$argon2id\$/);
    expect(row.passwordHash).not.toContain(pw);
    expect(lines[0]).not.toContain(pw);
  }, 30000);
});
