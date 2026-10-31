// Kiểm chứng bảo mật T215 vòng 1 (bao-mat). Tấn công lại các đường đã chặn ở T199 + các đường lân cận.
import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import { gzipSync } from 'node:zlib';
import http from 'node:http';
import { once } from 'node:events';
import pino from 'pino';
import { createApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { signAccessToken } from '../../src/lib/tokens.js';
import { createMemoryAuthRepo, fakeHasher, testEnv, student } from '../helpers.js';

const makeApp = (logger) => createApp({ env: testEnv, logger, authRepo: createMemoryAuthRepo([student]), hasher: fakeHasher });
const badLogin = (app, ip, identifier = 'SV001') => {
  const r = request(app).post('/api/auth/login').send({ identifier, password: 'sai-mat-khau' });
  return ip ? r.set('x-forwarded-for', ip) : r;
};
const noLeak = (r) => {
  expect(r.text).not.toMatch(/at \w+ \(|node_modules|stack|\.js:\d+/);
  expect(r.text.length).toBeLessThan(1024);
};

afterEach(() => vi.restoreAllMocks());

describe('T215 bao-mat – không lộ chi tiết nội bộ', () => {
  it('413 / 400 / 429 không chứa stack, đường dẫn, tên thư viện', async () => {
    const app = makeApp();
    noLeak(await request(app).post('/api/auth/login').send({ identifier: 'x', password: 'a'.repeat(200_000) }));
    noLeak(await request(app).post('/api/auth/login').send({ identifier: 'x', password: 'a'.repeat(129) }));
    noLeak(await request(app).post('/api/auth/login').set('content-type', 'application/json').send('{"a":'));
    for (let i = 0; i < 20; i++) await badLogin(app, undefined, `SV${900 + i}`);
    const r = await badLogin(app);
    expect(r.status).toBe(429);
    noLeak(r);
  });

  // supertest làm hỏng Buffer nhị phân nên gửi bằng http thô
  it('gzip bomb: 5MB giải nén từ vài KB vẫn bị chặn 413 (limit tính sau giải nén)', async () => {
    const body = gzipSync(JSON.stringify({ identifier: 'SV001', password: 'a'.repeat(5_000_000) }));
    expect(body.length).toBeLessThan(100_000);
    const srv = makeApp().listen(0);
    await once(srv, 'listening');
    const status = await new Promise((resolve, reject) => {
      const rq = http.request({ port: srv.address().port, path: '/api/auth/login', method: 'POST',
        headers: { 'content-type': 'application/json', 'content-encoding': 'gzip', 'content-length': body.length } },
      (r) => { r.resume(); resolve(r.statusCode); });
      rq.on('error', reject);
      rq.end(body);
    });
    srv.close();
    expect(status).toBe(413);
  });

  // MINOR (BM-v1 #1): lỗi body-parser 4xx khác (content-encoding lạ → 415, gzip hỏng → 400) rơi về
  // 500 INTERNAL + logger.error. Không lộ dữ liệu, nhưng sai mã và ai cũng làm rác log error được.
  // Đổi it.fails → it khi errorHandler xử lý lỗi body-parser có status 4xx.
  it.each([
    ['content-encoding lạ', 'br-fake', '{}'],
    ['gzip hỏng', 'gzip', 'khong-phai-gzip'],
  ])('%s: không lộ chi tiết', async (_n, enc, body) => {
    const r = await request(makeApp()).post('/api/auth/login')
      .set('content-type', 'application/json').set('content-encoding', enc).send(body);
    noLeak(r);
  });
  it.fails.each([
    ['content-encoding lạ', 'br-fake', '{}'],
    ['gzip hỏng', 'gzip', 'khong-phai-gzip'],
  ])('%s: trả 4xx và không ghi log error (hiện 500 INTERNAL)', async (_n, enc, body) => {
    const logger = pino({ level: 'silent' });
    vi.spyOn(logger, 'error');
    const r = await request(makeApp(logger)).post('/api/auth/login')
      .set('content-type', 'application/json').set('content-encoding', enc).send(body);
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.status).toBeLessThan(500);
    expect(logger.error).not.toHaveBeenCalled();
  });
});

describe('T215 bao-mat – limiter', () => {
  it('đăng nhập IPv6 rải trong cùng /56 (khác /64) vẫn chung bucket', async () => {
    const app = makeApp();
    const s = [];
    for (let i = 0; i < 22; i++) s.push((await badLogin(app, `2001:db8:1:${i.toString(16)}::1`, `SV${900 + i}`)).status);
    expect(s.at(-1)).toBe(429);
  });

  it('đổi biến thể đường dẫn (/LOGIN, /login/) không có bucket mới', async () => {
    const app = makeApp();
    for (let i = 0; i < 20; i++) await badLogin(app, undefined, `SV${900 + i}`);
    expect((await request(app).post('/api/auth/LOGIN').send({ identifier: 'SV001', password: 'x' })).status).toBe(429);
    expect((await request(app).post('/api/auth/login/').send({ identifier: 'SV001', password: 'x' })).status).toBe(429);
  });

  it('/change-password: 400 do body sai cũng bị đếm (limiter đứng trước validate); đổi IP không thoát', async () => {
    const app = makeApp();
    const token = signAccessToken(student, { secret: testEnv.JWT_ACCESS_SECRET, ttlSeconds: 900 });
    const s = [];
    for (let i = 0; i < 6; i++) {
      s.push((await request(app).post('/api/auth/change-password').set('authorization', `Bearer ${token}`)
        .set('x-forwarded-for', `10.0.0.${i}`).send({ currentPassword: 'x'.repeat(i), newPassword: 'a' })).status);
    }
    expect(s.slice(0, 5).every((x) => x === 400)).toBe(true);
    expect(s[5]).toBe(429);
  });

  // Rủi ro hạ tầng (T703/T706): trust proxy = 1 tin đúng 1 hop. Không có proxy phía trước (chạy trực tiếp),
  // client tự đặt X-Forwarded-For là có bucket mới. Test này ghi nhận hành vi, không phải lỗi của T215.
  it('trust proxy 1 + không có proxy: X-Forwarded-For IPv4 giả mạo đổi bucket (ghi nhận)', async () => {
    const app = makeApp();
    const s = [];
    for (let i = 0; i < 25; i++) s.push((await badLogin(app, `198.51.100.${i}`, `SV${900 + i}`)).status);
    expect(s).not.toContain(429);
  });
});

describe('T215 bao-mat – ENABLE_SWAGGER', () => {
  it.each([['false', false], ['true', true]])('"%s" → %s', (v, want) => {
    expect(loadEnv({ ...testEnv, ENABLE_SWAGGER: v }).ENABLE_SWAGGER).toBe(want);
  });
  it.each(['', 'abc', ' '])('"%s" → ném lỗi khi khởi động', (v) => {
    expect(() => loadEnv({ ...testEnv, ENABLE_SWAGGER: v })).toThrow();
  });
});
