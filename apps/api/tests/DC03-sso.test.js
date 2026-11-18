// TASK-DC-03 (FR28, API_GD7 §8.4): đăng nhập Google bằng OAuth2Client giả tiêm vào – không gọi mạng.
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createHash, createHmac } from 'node:crypto';
import { createApp } from '../src/app.js';
import { loadEnv, missingGoogleEnv } from '../src/config/env.js';
import { safeNext } from '../src/modules/auth/ssoService.js';
import { createMemoryAuthRepo, fakeHasher, testEnv, student } from './helpers.js';
import { ssoEnv, fakeGoogle, runSso, cookieValue, setCookieLine, APP_URL } from './sso-kit.js';
import { SSO_ERROR_LABEL, ssoCallbackQuerySchema } from '@nckh/shared';

const stateKey = createHmac('sha256', testEnv.JWT_ACCESS_SECRET).update('oauth-state').digest();
const ssoError = (res) => new URL(res.headers.location).searchParams.get('sso_error');

const svUser = { ...student, email: 'sv001@vanlanguni.vn' };
const admin = { id: 'a1', code: 'QT01', email: 'qt01@vanlanguni.vn', fullName: 'Quản trị', role: 'ADMIN', passwordHash: 'h:x' };
let repo, google, app;
const build = (env = ssoEnv, users = [svUser, admin]) => {
  repo = createMemoryAuthRepo(users);
  google = fakeGoogle();
  app = createApp({ env, logger: undefined, authRepo: repo, hasher: fakeHasher, google });
};
beforeEach(() => build());

describe('FR28 bật/tắt theo cấu hình (§8.1)', () => {
  it('thiếu biến → providers false, start/callback 404, đăng nhập mật khẩu vẫn chạy', async () => {
    build(testEnv, [student]);
    expect((await request(app).get('/api/auth/providers')).body).toEqual({ google: false });
    const s = await request(app).get('/api/auth/google/start');
    expect(s.status).toBe(404);
    expect(s.headers['ratelimit-limit']).toBeUndefined();
    expect((await request(app).get('/api/auth/google/callback?code=a&state=b')).status).toBe(404);
    expect((await request(app).post('/api/auth/login').send({ identifier: 'SV001', password: 'Matkhau123' })).status).toBe(200);
  });

  it('đủ biến → providers true', async () => {
    expect((await request(app).get('/api/auth/providers')).body).toEqual({ google: true });
  });

  it('missingGoogleEnv chỉ trả tên biến thiếu; chuỗi rỗng = thiếu; tên miền/URL sai làm cấu hình lỗi', () => {
    const base = { JWT_ACCESS_SECRET: 'x'.repeat(40) };
    expect(missingGoogleEnv(loadEnv({ ...base, GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: '' }))).toEqual(['GOOGLE_CLIENT_SECRET', 'GOOGLE_ALLOWED_DOMAINS', 'PUBLIC_APP_URL']);
    const full = loadEnv({ ...base, GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 's', GOOGLE_ALLOWED_DOMAINS: ' VanLangUni.vn, vlu.edu.vn', PUBLIC_APP_URL: 'http://localhost:5173' });
    expect(full.GOOGLE_ALLOWED_DOMAINS).toEqual(['vanlanguni.vn', 'vlu.edu.vn']);
    expect(missingGoogleEnv(full)).toEqual([]);
    for (const bad of [{ GOOGLE_ALLOWED_DOMAINS: 'khong-co-cham' }, { GOOGLE_ALLOWED_DOMAINS: 'a.vn,@evil.com' }, { PUBLIC_APP_URL: 'https://x.vn/' }, { PUBLIC_APP_URL: 'javascript://x.vn' }]) {
      expect(() => loadEnv({ ...base, ...bad })).toThrow();
    }
    const prod = { ...base, NODE_ENV: 'production', CLOUDINARY_URL: 'cloudinary://a:b@c', ORIGIN_SECRET: 'o'.repeat(32) };
    expect(() => loadEnv({ ...prod, PUBLIC_APP_URL: 'http://app.vn' })).toThrow(/https/);
    expect(loadEnv({ ...prod, PUBLIC_APP_URL: 'https://app.vn' }).PUBLIC_APP_URL).toBe('https://app.vn');
  });

  it('bật mà không tiêm OAuth2Client → lỗi khởi động rõ ràng', () => {
    expect(() => createApp({ env: ssoEnv, authRepo: createMemoryAuthRepo(), hasher: fakeHasher })).toThrow(/OAuth2Client/);
  });
});

describe('GET /api/auth/google/start (§8.2 bước 2)', () => {
  it('302 tới Google với PKCE S256, state, nonce, redirect_uri, hd (1 tên miền), prompt; cookie nckh_oauth httpOnly, path riêng, SameSite=Lax', async () => {
    const res = await request(app).get('/api/auth/google/start?next=/de-tai/1');
    expect(res.status).toBe(302);
    const p = new URL(res.headers.location).searchParams;
    expect(p.get('response_type')).toBe('code');
    expect(p.get('scope')).toBe('openid email profile');
    expect(p.get('redirect_uri')).toBe(`${APP_URL}/api/auth/google/callback`);
    expect(p.get('code_challenge_method')).toBe('S256');
    expect(p.get('prompt')).toBe('select_account');
    expect(p.get('hd')).toBe('vanlanguni.vn');
    const line = setCookieLine(res, 'nckh_oauth');
    expect(line).toMatch(/HttpOnly/);
    expect(line).toMatch(/Path=\/api\/auth\/google/);
    expect(line).toMatch(/SameSite=Lax/);
    const saved = jwt.decode(cookieValue(res, 'nckh_oauth'));
    expect(saved).toMatchObject({ state: p.get('state'), nonce: p.get('nonce'), next: '/de-tai/1' });
    expect(saved.exp - saved.iat).toBe(600);
    expect(Buffer.from(saved.codeVerifier, 'base64url')).toHaveLength(32);
    expect(createHash('sha256').update(saved.codeVerifier).digest('base64url')).toBe(p.get('code_challenge'));
    expect(res.headers.location).not.toContain(saved.codeVerifier);
  });

  it('nhiều tên miền → không gửi hd; production → cookie Secure', async () => {
    build({ ...ssoEnv, NODE_ENV: 'production', GOOGLE_ALLOWED_DOMAINS: ['vanlanguni.vn', 'vlu.edu.vn'] });
    const res = await request(app).get('/api/auth/google/start');
    expect(new URL(res.headers.location).searchParams.has('hd')).toBe(false);
    expect(setCookieLine(res, 'nckh_oauth')).toMatch(/Secure/);
  });

  it('next dài 5.000 ký tự bị bỏ, cookie < 4 KB; next sai dạng bị bỏ', async () => {
    const res = await request(app).get('/api/auth/google/start').query({ next: `/${'a'.repeat(4999)}` });
    expect(setCookieLine(res, 'nckh_oauth').length).toBeLessThan(4096);
    expect(jwt.decode(cookieValue(res, 'nckh_oauth')).next).toBeUndefined();
    for (const bad of ['//evil.com', '/\\evil.com', 'https://evil.com', 'de-tai', `/${'a'.repeat(512)}`, ['/a', '/b']]) expect(safeNext(bad)).toBeUndefined();
    expect(safeNext(`/${'a'.repeat(511)}`)).toHaveLength(512);
  });
});

describe('GET /api/auth/google/callback – thành công (§8.2 bước 3)', () => {
  it('cookie nckh_rt, đích cố định /dang-nhap/google, không có token trên URL, refresh trả đúng user, AuditLog LOGIN_SSO', async () => {
    const { res } = await runSso(app, google, { next: '/de-tai?x=1&y=2' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${APP_URL}/dang-nhap/google?next=${encodeURIComponent('/de-tai?x=1&y=2')}`);
    const rt = cookieValue(res, 'nckh_rt');
    expect(rt).toBeTruthy();
    expect(setCookieLine(res, 'nckh_rt')).toMatch(/Path=\/api\/auth/);
    expect(setCookieLine(res, 'nckh_oauth')).toMatch(/Expires=Thu, 01 Jan 1970/); // cookie trạng thái bị xóa
    expect(res.headers.location).not.toContain(rt);
    expect(google.calls[0]).toMatchObject({ code: 'ma-google', redirect_uri: `${APP_URL}/api/auth/google/callback` });
    expect(google.calls[0].codeVerifier).toBeTruthy();
    expect(google.verifyArgs).toEqual({ idToken: 'id-token-gia', audience: ssoEnv.GOOGLE_CLIENT_ID });
    const r = await request(app).post('/api/auth/refresh').set('Cookie', `nckh_rt=${rt}`);
    expect(r.status).toBe(200);
    expect(r.body.user).toMatchObject({ id: svUser.id, role: 'STUDENT' });
    expect(repo.audits).toEqual([expect.objectContaining({ actorId: svUser.id, action: 'LOGIN_SSO', entityType: 'User', entityId: svUser.id, after: { provider: 'google' } })]);
  });

  it('email hoa thường khác nhau vẫn khớp; mustChangePassword không đổi', async () => {
    build(ssoEnv, [{ ...svUser, email: 'SV001@VanLangUni.vn', mustChangePassword: true }]);
    const { res } = await runSso(app, google, { email: 'Sv001@VANLANGUNI.VN' });
    expect(res.headers.location).toBe(`${APP_URL}/dang-nhap/google`);
    const r = await request(app).post('/api/auth/refresh').set('Cookie', `nckh_rt=${cookieValue(res, 'nckh_rt')}`);
    expect(r.body.user.mustChangePassword).toBe(true);
  });

  it('next=//evil.com → server vẫn chuyển hướng về PUBLIC_APP_URL, không mang next', async () => {
    const { res } = await runSso(app, google, { next: '//evil.com' });
    expect(res.headers.location).toBe(`${APP_URL}/dang-nhap/google`);
  });

  it('cookie nckh_oauth không dùng được làm Bearer', async () => {
    const start = await request(app).get('/api/auth/google/start');
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${cookieValue(start, 'nckh_oauth')}`);
    expect(me.status).toBe(401);
  });
});

describe('GET /api/auth/google/callback – mọi nhánh lỗi → 302 /dang-nhap?sso_error=', () => {
  const cases = [
    ['Google trả error=access_denied → CANCELLED', { mutate: (x) => ({ ...x, query: { error: 'access_denied', state: x.query.state } }) }, 'CANCELLED'],
    ['state sai → STATE_MISMATCH', { mutate: (x) => ({ ...x, query: { ...x.query, state: 'khac' } }) }, 'STATE_MISMATCH'],
    ['thiếu state → STATE_MISMATCH', { mutate: (x) => ({ ...x, query: { code: 'c' } }) }, 'STATE_MISMATCH'],
    ['thiếu code → STATE_MISMATCH', { mutate: (x) => ({ ...x, query: { state: x.query.state } }) }, 'STATE_MISMATCH'],
    ['thiếu cookie → STATE_MISMATCH', { mutate: (x) => ({ ...x, cookie: undefined }) }, 'STATE_MISMATCH'],
    ['cookie hết hạn (đúng khóa dẫn xuất) → STATE_MISMATCH', { mutate: (x) => {
      const p = jwt.decode(x.cookie);
      return { ...x, cookie: jwt.sign({ ...p, iat: p.iat - 700, exp: p.exp - 700 }, stateKey) };
    } }, 'STATE_MISMATCH'],
    ['cookie ký sai khóa → STATE_MISMATCH', { mutate: (x) => ({ ...x, cookie: jwt.sign(jwt.decode(x.cookie), 'sai-khoa') }) }, 'STATE_MISMATCH'],
    ['cookie alg none → STATE_MISMATCH', { mutate: (x) => ({ ...x, cookie: jwt.sign(jwt.decode(x.cookie), null, { algorithm: 'none' }) }) }, 'STATE_MISMATCH'],
    ['cookie là access token (ký bằng JWT_ACCESS_SECRET) → STATE_MISMATCH', { mutate: (x) => ({ ...x, cookie: jwt.sign(jwt.decode(x.cookie), testEnv.JWT_ACCESS_SECRET) }) }, 'STATE_MISMATCH'],
    ['code quá 2048 ký tự → STATE_MISMATCH', { mutate: (x) => ({ ...x, query: { ...x.query, code: 'a'.repeat(2049) } }) }, 'STATE_MISMATCH'],
    ['lặp khóa state (mảng) → STATE_MISMATCH', { mutate: (x) => ({ ...x, query: { ...x.query, state: [x.query.state, x.query.state] } }) }, 'STATE_MISMATCH'],
    ['nonce sai → STATE_MISMATCH', { payload: { nonce: 'khac' } }, 'STATE_MISMATCH'],
    ['email_verified false → EMAIL_NOT_VERIFIED', { payload: { email_verified: false } }, 'EMAIL_NOT_VERIFIED'],
    ['email_verified chuỗi "true" → EMAIL_NOT_VERIFIED', { payload: { email_verified: 'true' } }, 'EMAIL_NOT_VERIFIED'],
    ['hd khác danh sách → DOMAIN_NOT_ALLOWED', { email: 'sv001@khac.vn', payload: { hd: 'khac.vn' } }, 'DOMAIN_NOT_ALLOWED'],
    ['email @gmail.com (không hd) → DOMAIN_NOT_ALLOWED', { email: 'sv001@gmail.com', payload: { hd: undefined } }, 'DOMAIN_NOT_ALLOWED'],
    ['email x@evil.vanlanguni.vn.attacker.com với hd hợp lệ giả → DOMAIN_NOT_ALLOWED', { email: 'x@evil.vanlanguni.vn.attacker.com' }, 'DOMAIN_NOT_ALLOWED'],
    ['email tên miền con của hd → DOMAIN_NOT_ALLOWED', { email: 'sv001@st.vanlanguni.vn' }, 'DOMAIN_NOT_ALLOWED'],
    ['không có tài khoản → NO_ACCOUNT', { email: 'chua-co@vanlanguni.vn' }, 'NO_ACCOUNT'],
    ['ADMIN → PASSWORD_ONLY', { email: 'qt01@vanlanguni.vn' }, 'PASSWORD_ONLY'],
  ];
  it.each(cases)('%s', async (_n, opts, code) => {
    const { res } = await runSso(app, google, opts);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${APP_URL}/dang-nhap?sso_error=${code}`);
    expect(cookieValue(res, 'nckh_rt')).toBeUndefined();
    expect(repo.tokens.size).toBe(0);
    expect(repo.audits).toHaveLength(0);
    expect(SSO_ERROR_LABEL[code]).toBeTruthy();
  });

  it('Google lỗi khi đổi code hoặc kiểm ID token → GOOGLE_ERROR', async () => {
    google = fakeGoogle();
    google.getTokenError = new Error('invalid_grant: chi tiết của Google');
    app = createApp({ env: ssoEnv, authRepo: repo, hasher: fakeHasher, google });
    expect(ssoError((await runSso(app, google)).res)).toBe('GOOGLE_ERROR');
    google.getTokenError = null;
    google.verifyError = new Error('Wrong recipient');
    expect(ssoError((await runSso(app, google)).res)).toBe('GOOGLE_ERROR');
    google.verifyError = null;
    google.idToken = undefined;
    expect(ssoError((await runSso(app, google)).res)).toBe('GOOGLE_ERROR');
    expect(repo.tokens.size).toBe(0);
  });

  it('tài khoản bị khóa / tạm khóa → ACCOUNT_LOCKED', async () => {
    build(ssoEnv, [{ ...svUser, isLocked: true }]);
    expect(ssoError((await runSso(app, google)).res)).toBe('ACCOUNT_LOCKED');
    build(ssoEnv, [{ ...svUser, lockedUntil: new Date(Date.now() + 60e3) }]);
    expect(ssoError((await runSso(app, google)).res)).toBe('ACCOUNT_LOCKED');
    build(ssoEnv, [{ ...svUser, lockedUntil: new Date(Date.now() - 60e3) }]); // tạm khóa đã hết hạn → được vào
    expect((await runSso(app, google)).res.headers.location).toBe(`${APP_URL}/dang-nhap/google`);
  });

  it('bị khóa giữa lúc kiểm và lúc cấp phiên (đọc lại sau khóa) → ACCOUNT_LOCKED, không có token', async () => {
    const lockUser = repo.lockUser;
    repo.lockUser = async (id, share) => { repo.users.get(id).isLocked = true; return lockUser(id, share); };
    expect(ssoError((await runSso(app, google)).res)).toBe('ACCOUNT_LOCKED');
    expect(repo.tokens.size).toBe(0);
  });

  it('hai tài khoản trùng email khác hoa thường (dữ liệu bẩn) → NO_ACCOUNT, không đoán', async () => {
    build(ssoEnv, [svUser, { ...svUser, id: 'u2', code: 'SV002', email: 'SV001@vanlanguni.vn' }]);
    expect(ssoError((await runSso(app, google)).res)).toBe('NO_ACCOUNT');
  });

});

describe('Giới hạn tần suất SSO (M1, n1 BM)', () => {
  it('21 callback lỗi cùng IP → lần 21 bị 429 RATE_LIMITED; IP khác không bị ảnh hưởng', async () => {
    const statuses = [];
    for (let i = 0; i < 21; i++) statuses.push((await request(app).get('/api/auth/google/callback?code=a&state=b').set('x-forwarded-for', '203.0.113.7')).status);
    expect(statuses.slice(0, 20).every((s) => s === 302)).toBe(true);
    const last = await request(app).get('/api/auth/google/callback?code=a&state=b').set('x-forwarded-for', '203.0.113.7');
    expect(statuses[20]).toBe(429);
    expect(last.body.error.code).toBe('RATE_LIMITED');
    expect((await request(app).get('/api/auth/google/callback?code=a&state=b').set('x-forwarded-for', '203.0.113.8')).status).toBe(302);
  });

  it('25 lần SSO thành công cùng IP trong 15 phút không bị 429', async () => {
    for (let i = 0; i < 25; i++) {
      const { start, res } = await runSso(app, google, { ip: '203.0.113.9' });
      expect(start.status).toBe(302);
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe(`${APP_URL}/dang-nhap/google`);
    }
    expect(repo.audits).toHaveLength(25);
  });

});

describe('ssoCallbackQuerySchema (shared)', () => {
  it('bỏ khóa lạ; giới hạn độ dài', () => {
    expect(ssoCallbackQuerySchema.parse({ code: 'c', state: 's', scope: 'x', authuser: '0' })).toEqual({ code: 'c', state: 's' });
    expect(ssoCallbackQuerySchema.safeParse({ state: 'a'.repeat(129) }).success).toBe(false);
    expect(ssoCallbackQuerySchema.safeParse({ error: 'a'.repeat(65) }).success).toBe(false);
  });
});
