// Kiểm chứng bảo mật T199 vòng 2 (QD_ZOD §4.2, §4.6). Do bao-mat viết khi review T199 vòng 2.
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { createMemoryAuthRepo, fakeHasher, testEnv, student } from '../helpers.js';

const makeApp = () => createApp({ env: testEnv, logger: undefined, authRepo: createMemoryAuthRepo([student]), hasher: fakeHasher });
const login = (app, ip, identifier = 'SV001') => {
  const r = request(app).post('/api/auth/login').send({ identifier, password: 'sai-mat-khau' });
  return ip ? r.set('x-forwarded-for', ip) : r;
};

describe('T199 v2 – rate limit', () => {
  // QD_ZOD §4.2: 429 phải ra lỗi chuẩn { error: { code: 'RATE_LIMITED' } }. express-rate-limit mặc định
  // tự gửi text "Too many requests..." nên errorHandler không bao giờ thấy. T215 đã sửa
  // bằng option `handler` trong createLimiter; test giữ làm hồi quy.
  it('lần đăng nhập thứ 21 trả 429 với mã chuẩn RATE_LIMITED, tiếng Việt', async () => {
    const app = makeApp();
    for (let i = 0; i < 20; i++) await login(app, undefined, `SV${900 + i}`);
    const r = await login(app);
    expect(r.status).toBe(429);
    expect(r.body.error.code).toBe('RATE_LIMITED');
  });

  // QD_ZOD §4.6 coi limiter đăng nhập "đã có". express-rate-limit 7.x khóa theo IP đầy đủ, nên một máy
  // IPv6 (thường được cấp cả /64) đổi địa chỉ là có bucket mới -> vượt giới hạn thử mật khẩu, và store
  // trong bộ nhớ phình theo số địa chỉ. T215 đã sửa bằng `ipv6Subnet: 56` (v8); test giữ làm hồi quy.
  it('đổi địa chỉ IPv6 trong cùng /64 không vượt được giới hạn đăng nhập', async () => {
    const app = makeApp();
    const statuses = [];
    for (let i = 1; i <= 25; i++) statuses.push((await login(app, `2001:db8:1:2::${i.toString(16)}`, `SV${900 + i}`)).status); // dò rải nhiều tài khoản, tránh khóa theo tài khoản
    expect(statuses).toContain(429);
  });
});
