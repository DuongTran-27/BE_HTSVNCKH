import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createMemoryAuthRepo, fakeHasher, testEnv, student } from './helpers.js';
import { passwordHasher } from '../src/lib/password.js';

const cookieOf = (res) => (res.headers['set-cookie'] ?? []).find((c) => c.startsWith('nckh_rt='))?.split(';')[0];

let repo, app;
beforeEach(() => {
  repo = createMemoryAuthRepo([student]);
  app = createApp({ env: testEnv, logger: undefined, authRepo: repo, hasher: fakeHasher });
});

const login = (password = 'Matkhau123', identifier = 'SV001') =>
  request(app).post('/api/auth/login').send({ identifier, password });

describe('Đăng nhập và phiên (FR01)', () => {
  it('health trả ok', async () => {
    const r = await request(app).get('/api/health');
    expect(r.status).toBe(200);
  });
  it('đăng nhập bằng mã hoặc email, cookie httpOnly path /api/auth', async () => {
    const r = await login();
    expect(r.status).toBe(200);
    expect(r.body.accessToken).toBeTruthy();
    expect(r.body.user).not.toHaveProperty('passwordHash');
    const raw = r.headers['set-cookie'][0];
    expect(raw).toMatch(/HttpOnly/);
    expect(raw).toMatch(/Path=\/api\/auth/);
    expect((await login('Matkhau123', 'sv001@st.edu.vn')).status).toBe(200);
  });
  it('sai mật khẩu: thông báo chung; 5 lần sai → tạm khóa', async () => {
    for (let i = 0; i < 5; i += 1) expect((await login('sai')).status).toBe(401);
    const r = await login();
    expect(r.status).toBe(429);
    expect(r.body.error.code).toBe('TEMP_LOCKED');
  });
  it('thiếu trường → 400 có lỗi theo trường', async () => {
    const r = await request(app).post('/api/auth/login').send({ identifier: '' });
    expect(r.status).toBe(400);
    expect(r.body.error.details).toHaveProperty('identifier');
  });
  it('refresh xoay vòng token; dùng lại token cũ → thu hồi cả họ phiên', async () => {
    const c1 = cookieOf(await login());
    const r2 = await request(app).post('/api/auth/refresh').set('Cookie', c1);
    expect(r2.status).toBe(200);
    const c2 = cookieOf(r2);
    expect(c2).not.toBe(c1);
    expect((await request(app).post('/api/auth/refresh').set('Cookie', c1)).status).toBe(401); // dùng lại
    expect((await request(app).post('/api/auth/refresh').set('Cookie', c2)).status).toBe(401); // họ đã bị thu hồi
  });
  it('logout thu hồi phiên hiện tại', async () => {
    const c = cookieOf(await login());
    expect((await request(app).post('/api/auth/logout').set('Cookie', c)).status).toBe(204);
    expect((await request(app).post('/api/auth/refresh').set('Cookie', c)).status).toBe(401);
  });
  it('tài khoản bị khóa: access token cũ bị từ chối ở lần gọi kế tiếp', async () => {
    const { accessToken } = (await login()).body;
    expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${accessToken}`)).status).toBe(200);
    await repo.updateUser('u1', { isLocked: true });
    expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${accessToken}`)).status).toBe(401);
  });
  it('đổi mật khẩu thu hồi các phiên khác, giữ phiên hiện tại', async () => {
    const other = cookieOf(await login());
    const cur = await login();
    const r = await request(app).post('/api/auth/change-password')
      .set('Authorization', `Bearer ${cur.body.accessToken}`).set('Cookie', cookieOf(cur))
      .send({ currentPassword: 'Matkhau123', newPassword: 'Moi12345' });
    expect(r.status).toBe(204);
    expect((await request(app).post('/api/auth/refresh').set('Cookie', other)).status).toBe(401);
    expect((await request(app).post('/api/auth/refresh').set('Cookie', cookieOf(cur))).status).toBe(200);
  });
  it('đường dẫn lạ → 404 JSON chuẩn', async () => {
    const r = await request(app).get('/api/khong-co');
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe('NOT_FOUND');
  });
});

describe('Argon2id thật', () => {
  it('băm và xác minh', async () => {
    const h = await passwordHasher.hash('Matkhau123');
    expect(h.startsWith('$argon2id$')).toBe(true);
    expect(await passwordHasher.verify(h, 'Matkhau123')).toBe(true);
    expect(await passwordHasher.verify(h, 'sai')).toBe(false);
  });
});
