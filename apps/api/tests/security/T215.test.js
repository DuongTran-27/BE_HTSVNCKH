// T215 – thực hiện QD_ZOD §6: 413, slice details, loadEnv stringbool, limiter dùng chung (login, change-password).
import { describe, it, expect, vi, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import pino from 'pino';
import { topicDraftSchema, topicSubmitSchema } from '@nckh/shared';
import { createApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { validate } from '../../src/middlewares/validate.js';
import { errorHandler } from '../../src/middlewares/errorHandler.js';
import { createLimiter } from '../../src/middlewares/rateLimit.js';
import { createMemoryAuthRepo, fakeHasher, testEnv, student } from '../helpers.js';

const otherStudent = { ...student, id: 'u2', code: 'SV002', email: 'sv002@st.edu.vn' };
const makeApp = (logger) => createApp({ env: testEnv, logger, authRepo: createMemoryAuthRepo([student, otherStudent]), hasher: fakeHasher });
const RATE_MSG = 'Thao tác quá nhiều lần, vui lòng thử lại sau';

// App nhỏ dùng validate + errorHandler thật, cho schema chưa có route
const schemaApp = (schema) => {
  const app = express();
  app.use(express.json({ limit: '100kb' }));
  app.post('/x', validate(schema), (_req, res) => res.json({ ok: true }));
  app.use(errorHandler(undefined));
  return app;
};

afterEach(() => vi.restoreAllMocks());

describe('T215 – giới hạn kích thước và lỗi chuẩn', () => {
  it('body quá 100kb → 413 PAYLOAD_TOO_LARGE tiếng Việt, không ghi log error', async () => {
    const logger = pino({ level: 'silent' });
    vi.spyOn(logger, 'error');
    const r = await request(makeApp(logger)).post('/api/auth/login').send({ identifier: 'SV001', password: 'a'.repeat(110_000) });
    expect(r.status).toBe(413);
    expect(r.body.error).toEqual({ code: 'PAYLOAD_TOO_LARGE', message: 'Dữ liệu gửi lên quá lớn' });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('body dưới 100kb vẫn được xử lý (không 413)', async () => {
    const r = await request(makeApp()).post('/api/auth/login').send({ identifier: 'SV001', password: 'Matkhau123', pad: 'a'.repeat(90_000) });
    expect(r.status).toBe(200);
  });

  it.each([
    ['topicDraftSchema', topicDraftSchema],
    ['topicSubmitSchema', topicSubmitSchema()],
  ])('keywords 5.000 phần tử "a" → 400 VALIDATION_ERROR, response nhỏ (%s)', async (_n, schema) => {
    const r = await request(schemaApp(schema)).post('/x').send({ keywords: new Array(5000).fill('a') });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_ERROR');
    expect(r.text.length).toBeLessThan(1024);
  });

  it('validate chỉ phản chiếu tối đa 50 issue đầu vào details', async () => {
    const shape = Object.fromEntries(Array.from({ length: 80 }, (_, i) => [`f${i}`, z.string()]));
    const r = await request(schemaApp(z.object(shape))).post('/x').send({});
    expect(r.status).toBe(400);
    expect(Object.keys(r.body.error.details)).toHaveLength(50);
    expect(r.body.error.details).toHaveProperty('f0');
    expect(r.body.error.details).not.toHaveProperty('f50');
  });
});

describe('T215 – loadEnv ENABLE_SWAGGER (z.stringbool)', () => {
  it.each([['false', false], ['true', true], ['FALSE', false], ['1', true], ['0', false]])('%s → %s', (raw, expected) => {
    expect(loadEnv({ ...testEnv, ENABLE_SWAGGER: raw }).ENABLE_SWAGGER).toBe(expected);
  });
  it('bỏ dòng → false', () => {
    expect(loadEnv(testEnv).ENABLE_SWAGGER).toBe(false);
  });
  it.each([['abc'], ['']])('giá trị %j → ném lỗi khi khởi động', (raw) => {
    expect(() => loadEnv({ ...testEnv, ENABLE_SWAGGER: raw })).toThrow(/ENABLE_SWAGGER/);
  });
});

describe('T215 – rate limit dùng chung', () => {
  const loginOk = (app, ip = '203.0.113.7') => request(app).post('/api/auth/login').set('x-forwarded-for', ip).send({ identifier: 'SV001', password: 'Matkhau123' });
  const loginBad = (app, ip, i) => request(app).post('/api/auth/login').set('x-forwarded-for', ip).send({ identifier: `SV${900 + i}`, password: 'sai' });

  it('đăng nhập: 429 có thông điệp tiếng Việt', async () => {
    const app = makeApp();
    for (let i = 0; i < 20; i++) await loginBad(app, '203.0.113.8', i);
    const r = await loginBad(app, '203.0.113.8', 99);
    expect(r.status).toBe(429);
    expect(r.body.error).toMatchObject({ code: 'RATE_LIMITED', message: RATE_MSG });
  });

  it('đăng nhập đúng không bị đếm: 25 lần đúng từ cùng IP không bị 429 (skipSuccessfulRequests)', async () => {
    const app = makeApp();
    const statuses = [];
    for (let i = 0; i < 25; i++) statuses.push((await loginOk(app)).status);
    expect(statuses.every((s) => s === 200)).toBe(true);
    // Lần sai vẫn bị đếm sau các lần đúng
    for (let i = 0; i < 20; i++) await loginBad(app, '203.0.113.7', i);
    expect((await loginBad(app, '203.0.113.7', 99)).status).toBe(429);
  });

  it('dò sai bằng IPv6 trong cùng /56 vẫn bị 429 dù có xen lần đăng nhập đúng', async () => {
    const app = makeApp();
    const statuses = [];
    for (let i = 1; i <= 25; i++) {
      if (i % 5 === 0) await loginOk(app, `2001:db8:1:2${i.toString(16).padStart(2, '0')}::1`);
      statuses.push((await loginBad(app, `2001:db8:1:2${i.toString(16).padStart(2, '0')}::${i}`, i)).status);
    }
    expect(statuses.slice(0, 20).every((s) => s === 401)).toBe(true);
    expect(statuses.slice(20)).toEqual([429, 429, 429, 429, 429]);
  });

  it('IP khác /56 có bucket riêng', async () => {
    const app = makeApp();
    for (let i = 0; i < 21; i++) await loginBad(app, '2001:db8:1:200::1', i);
    expect((await loginBad(app, '2001:db8:1:100::1', 50)).status).toBe(401);
  });

  it('/change-password lần thứ 6 trong 15 phút → 429 RATE_LIMITED; người dùng khác không bị ảnh hưởng', async () => {
    const app = makeApp();
    const token = async (identifier) => (await request(app).post('/api/auth/login').send({ identifier, password: 'Matkhau123' })).body.accessToken;
    const change = (t) => request(app).post('/api/auth/change-password').set('Authorization', `Bearer ${t}`)
      .send({ currentPassword: 'SaiMatKhau1', newPassword: 'Moi12345' });
    const t1 = await token('SV001');
    for (let i = 0; i < 5; i++) expect((await change(t1)).status).toBe(400); // WRONG_PASSWORD, vẫn bị đếm
    const r = await change(t1);
    expect(r.status).toBe(429);
    expect(r.body.error).toMatchObject({ code: 'RATE_LIMITED', message: RATE_MSG });
    expect((await change(await token('SV002'))).status).toBe(400);
  });

  it('/change-password chưa đăng nhập → 401 (requireAuth đứng trước limiter)', async () => {
    const app = makeApp();
    for (let i = 0; i < 7; i++) {
      expect((await request(app).post('/api/auth/change-password').send({ currentPassword: 'x', newPassword: 'Moi12345' })).status).toBe(401);
    }
  });

  it('createLimiter: không in cảnh báo ERR_ERL_ cho cả hai nhánh, keyBy lạ bị từ chối', async () => {
    const logs = [];
    vi.spyOn(console, 'error').mockImplementation((...a) => logs.push(a.join(' ')));
    vi.spyOn(console, 'warn').mockImplementation((...a) => logs.push(a.join(' ')));
    const app = express();
    app.set('trust proxy', 1);
    app.use((req, _res, next) => { req.user = { id: 'u1' }; next(); });
    app.get('/ip', createLimiter({ windowMs: 60e3, limit: 5, keyBy: 'ip', skipSuccessfulRequests: true }), (_q, s) => s.end());
    app.get('/user', createLimiter({ windowMs: 60e3, limit: 5, keyBy: 'user' }), (_q, s) => s.end());
    await request(app).get('/ip').set('x-forwarded-for', '2001:db8::1');
    await request(app).get('/user').set('x-forwarded-for', '2001:db8::1');
    expect(logs.filter((l) => l.includes('ERR_ERL'))).toEqual([]);
    expect(() => createLimiter({ windowMs: 1, limit: 1, keyBy: 'email' })).toThrow();
  });
});
