// Bộ dựng dùng chung cho test SSO (TASK-DC-03): env bật SSO, OAuth2Client giả, chạy start → callback.
import request from 'supertest';
import { testEnv } from './helpers.js';

export const APP_URL = 'https://app.test';
export const ssoEnv = {
  ...testEnv, GOOGLE_CLIENT_ID: 'cid.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'sec',
  GOOGLE_ALLOWED_DOMAINS: ['vanlanguni.vn'], PUBLIC_APP_URL: APP_URL,
};

// OAuth2Client giả: ghi lại tham số, trả payload ID token do test đặt (nonce lấy từ URL start nếu không ghi đè)
export const fakeGoogle = () => {
  const g = {
    calls: [], payload: {}, getTokenError: null, verifyError: null, idToken: 'id-token-gia',
    generateAuthUrl: (opts) => `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams(opts)}`,
    getToken: async (opts) => { g.calls.push(opts); if (g.getTokenError) throw g.getTokenError; return { tokens: { id_token: g.idToken } }; },
    verifyIdToken: async (opts) => { g.verifyArgs = opts; if (g.verifyError) throw g.verifyError; return { getPayload: () => g.payload }; },
  };
  return g;
};

export const cookieValue = (res, name) => (res.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${name}=`))?.split(';')[0].slice(name.length + 1);
export const setCookieLine = (res, name) => (res.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${name}=`));

// start → (payload Google) → callback. `mutate` sửa query/cookie trước callback.
export const runSso = async (app, google, { email = 'sv001@vanlanguni.vn', payload = {}, next, ip, mutate = (x) => x } = {}) => {
  const s = request(app).get('/api/auth/google/start').query(next === undefined ? {} : { next });
  if (ip) s.set('x-forwarded-for', ip);
  const start = await s;
  const loc = new URL(start.headers.location);
  google.payload = { email, email_verified: true, hd: 'vanlanguni.vn', nonce: loc.searchParams.get('nonce'), ...payload };
  const x = mutate({ query: { code: 'ma-google', state: loc.searchParams.get('state') }, cookie: cookieValue(start, 'nckh_oauth') });
  const c = request(app).get('/api/auth/google/callback').query(x.query);
  if (x.cookie !== undefined) c.set('Cookie', `nckh_oauth=${x.cookie}`);
  if (ip) c.set('x-forwarded-for', ip);
  return { start, loc, res: await c };
};
