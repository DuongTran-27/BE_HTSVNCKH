// DC-02 (FR30, API_GD7 §10.1): hồ sơ cá nhân /api/me/profile + phone ở GET /api/users/:id. DB test thật, dữ liệu riêng.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../src/app.js';
import { createAuthRepo } from '../src/modules/auth/prismaRepo.js';
import { createAccountRepo } from '../src/modules/accounts/prismaRepo.js';
import { signAccessToken } from '../src/lib/tokens.js';
import { fakeHasher, testEnv } from './helpers.js';
import { resetData } from './db.js';

const prisma = new PrismaClient();
const app = createApp({ env: testEnv, logger: undefined, authRepo: createAuthRepo(prisma), hasher: fakeHasher, accountRepo: createAccountRepo(prisma) });
const U = {}, tok = {};
const as = (w) => ({ Authorization: `Bearer ${tok[w]}` });
const mk = async (key, role, extra = {}) => {
  U[key] = await prisma.user.create({ data: { code: key, email: `${key.toLowerCase()}@t.vn`, fullName: key, passwordHash: 'x', role, mustChangePassword: false, ...extra } });
  tok[key] = signAccessToken(U[key], { secret: testEnv.JWT_ACCESS_SECRET, ttlSeconds: 600 });
};
const audits = (id) => prisma.auditLog.findMany({ where: { entityType: 'User', entityId: id, action: 'PROFILE_UPDATE' }, orderBy: { id: 'asc' } });

beforeAll(async () => {
  await resetData(prisma);
  const f1 = await prisma.faculty.create({ data: { code: 'CNTT', name: 'Công nghệ thông tin' } });
  const f2 = await prisma.faculty.create({ data: { code: 'KT', name: 'Kinh tế' } });
  const m = await prisma.major.create({ data: { facultyId: f1.id, code: 'KTPM', name: 'Kỹ thuật phần mềm' } });
  const c = await prisma.class.create({ data: { majorId: m.id, code: 'K1' } });
  await mk('ADM', 'ADMIN');
  await mk('SV1', 'STUDENT', { facultyId: f1.id, classId: c.id });
  await mk('GV1', 'LECTURER', { facultyId: f1.id });
  await mk('ST1', 'STAFF', { facultyId: f1.id });
  await mk('ST2', 'STAFF', { facultyId: f2.id });
  await prisma.staffScope.create({ data: { userId: U.ST1.id, facultyId: f1.id } });
  await prisma.staffScope.create({ data: { userId: U.ST2.id, facultyId: f2.id } });
});
afterAll(() => prisma.$disconnect());

describe('GET /api/me/profile', () => {
  it('chưa đăng nhập 401', async () => expect((await request(app).get('/api/me/profile')).status).toBe(401));
  it('SV: có khoa, lớp, ngành, phone null; không lộ passwordHash', async () => {
    const r = await request(app).get('/api/me/profile').set(as('SV1'));
    expect(r.status).toBe(200);
    expect(r.body.profile).toEqual({
      id: U.SV1.id, code: 'SV1', email: 'sv1@t.vn', fullName: 'SV1', role: 'STUDENT', phone: null,
      faculty: { id: U.SV1.facultyId, name: 'Công nghệ thông tin' },
      class: { id: U.SV1.classId, code: 'K1', major: { name: 'Kỹ thuật phần mềm' } },
    });
  });
  it.each(['ADM', 'GV1', 'ST1'])('%s xem được hồ sơ của mình (faculty/class có thể null)', async (w) => {
    const r = await request(app).get('/api/me/profile').set(as(w));
    expect(r.status).toBe(200);
    expect(r.body.profile.id).toBe(U[w].id);
    expect(r.body.profile.class).toBeNull();
  });
  it('ADMIN: faculty null', async () => expect((await request(app).get('/api/me/profile').set(as('ADM'))).body.profile.faculty).toBeNull());
});

describe('PATCH /api/me/profile', () => {
  const patch = (w, body) => request(app).patch('/api/me/profile').set(as(w)).send(body);
  it('401 khi chưa đăng nhập', async () => expect((await request(app).patch('/api/me/profile').send({ phone: null })).status).toBe(401));
  it('chuẩn hóa, lưu và ghi AuditLog before/after', async () => {
    const r = await patch('SV1', { phone: ' 091 234-5678 ' });
    expect(r.status).toBe(200);
    expect(r.body.profile.phone).toBe('0912345678');
    expect((await prisma.user.findUnique({ where: { id: U.SV1.id } })).phone).toBe('0912345678');
    const a = await audits(U.SV1.id);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ actorId: U.SV1.id, before: { phone: null }, after: { phone: '0912345678' } });
  });
  it('null xóa số, audit thứ hai', async () => {
    const r = await patch('SV1', { phone: null });
    expect(r.status).toBe(200);
    expect(r.body.profile.phone).toBeNull();
    const a = await audits(U.SV1.id);
    expect(a.at(-1)).toMatchObject({ before: { phone: '0912345678' }, after: { phone: null } });
  });
  it('ADMIN tự sửa hồ sơ của mình', async () => {
    expect((await patch('ADM', { phone: '+84912345678' })).body.profile.phone).toBe('+84912345678');
  });
  it('số sai -> 400 tiếng Việt, không đổi DB, không audit', async () => {
    const before = (await audits(U.GV1.id)).length;
    const r = await patch('GV1', { phone: '0212345678' });
    expect(r.status).toBe(400);
    expect(r.body.error.details.phone).toBe('Số điện thoại không hợp lệ');
    expect((await prisma.user.findUnique({ where: { id: U.GV1.id } })).phone).toBeNull();
    expect(await audits(U.GV1.id)).toHaveLength(before);
  });
  it.each([[{ phone: null, role: 'ADMIN' }], [{ phone: null, fullName: 'X' }], [{ phone: null, email: 'a@b.vn' }], [{}]])('strict: %j -> 400', async (b) => {
    const r = await patch('SV1', b);
    expect(r.status).toBe(400);
    const u = await prisma.user.findUnique({ where: { id: U.SV1.id } });
    expect([u.role, u.fullName, u.email]).toEqual(['STUDENT', 'SV1', 'sv1@t.vn']);
  });
  it('giới hạn 10 lần / 15 phút / người dùng, lần 11 trả 429', async () => {
    await mk('LIM', 'LECTURER');
    const codes = [];
    for (let i = 0; i < 11; i++) codes.push((await patch('LIM', { phone: null })).status);
    expect(codes.slice(0, 10).every((c) => c === 200)).toBe(true);
    expect(codes[10]).toBe(429);
  });
});

describe('GET /api/users/:id có phone', () => {
  it('ADMIN và STAFF trong phạm vi thấy phone; danh sách không có phone', async () => {
    await prisma.user.update({ where: { id: U.GV1.id }, data: { phone: '0987654321' } });
    expect((await request(app).get(`/api/users/${U.GV1.id}`).set(as('ADM'))).body.user.phone).toBe('0987654321');
    expect((await request(app).get(`/api/users/${U.GV1.id}`).set(as('ST1'))).body.user.phone).toBe('0987654321');
    const list = await request(app).get('/api/users').set(as('ADM'));
    expect(list.status).toBe(200);
    expect(list.body.items.every((u) => !('phone' in u))).toBe(true);
  });
  it('STAFF ngoài phạm vi 403; SV/GV 403 (không thấy phone người khác)', async () => {
    expect((await request(app).get(`/api/users/${U.GV1.id}`).set(as('ST2'))).status).toBe(403);
    expect((await request(app).get(`/api/users/${U.GV1.id}`).set(as('SV1'))).status).toBe(403);
    expect((await request(app).get(`/api/users/${U.SV1.id}`).set(as('GV1'))).status).toBe(403);
  });
});
