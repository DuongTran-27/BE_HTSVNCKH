// T706 bước B: ORIGIN_SECRET (chặn gọi thẳng Render), trim CORS_ORIGIN, log đo hop.
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { Writable } from 'node:stream';
import { createApp } from '../src/app.js';
import { createLogger } from '../src/lib/logger.js';
import { loadEnv } from '../src/config/env.js';
import { createMemoryAuthRepo, fakeHasher, testEnv } from './helpers.js';

const SECRET = 's'.repeat(40);
const build = (env = {}, logger) => createApp({ env: { ...testEnv, ...env }, logger, authRepo: createMemoryAuthRepo(), hasher: fakeHasher });
const secured = build({ ORIGIN_SECRET: SECRET });

describe('ORIGIN_SECRET', () => {
  it.each([
    ['thiếu header', undefined],
    ['sai cùng độ dài', 'x'.repeat(40)],
    ['sai khác độ dài', 'ngan'],
  ])('%s -> 404 chuẩn', async (_n, val) => {
    const r = request(secured).get('/api/auth/me');
    const res = await (val === undefined ? r : r.set('x-nckh-origin', val));
    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe('Không tìm thấy đường dẫn');
  });

  it('đúng secret -> đi tiếp (401 chưa đăng nhập)', async () => {
    expect((await request(secured).get('/api/auth/me').set('x-nckh-origin', SECRET)).status).toBe(401);
  });

  it('chỉ miễn đúng GET /api/health', async () => {
    expect((await request(secured).get('/api/health')).status).toBe(200);
    expect((await request(secured).get('/api/health/x')).status).toBe(404);
    expect((await request(secured).post('/api/health')).status).toBe(404);
    expect((await request(secured).post('/api/cron/reminders')).status).toBe(404);
  });

  it('không đặt biến -> như cũ', async () => {
    expect((await request(build()).get('/api/auth/me')).status).toBe(401);
  });

  it('production thiếu ORIGIN_SECRET -> env ném lỗi tiếng Việt', () => {
    const base = { NODE_ENV: 'production', JWT_ACCESS_SECRET: 'x'.repeat(40), CLOUDINARY_URL: 'cloudinary://a:b@c' };
    expect(() => loadEnv(base)).toThrow(/Production cần ORIGIN_SECRET/);
    expect(loadEnv({ ...base, ORIGIN_SECRET: SECRET }).ORIGIN_SECRET).toBe(SECRET);
    expect(() => loadEnv({ ...base, ORIGIN_SECRET: 'ngan' })).toThrow(/ORIGIN_SECRET/);
  });

  it('log không chứa giá trị header', async () => {
    let out = '';
    const logger = createLogger({ NODE_ENV: 'development' }, new Writable({ write(c, _e, cb) { out += c; cb(); } }));
    await request(build({ NODE_ENV: 'development', ORIGIN_SECRET: SECRET }, logger)).get('/api/auth/me').set('x-nckh-origin', SECRET);
    expect(out).toContain('x-nckh-origin'); // có log request, giá trị bị che
    expect(out).not.toContain(SECRET);
  });
});

describe('CORS_ORIGIN có khoảng trắng', () => {
  it('trim và bỏ phần tử rỗng', async () => {
    const app = build({ CORS_ORIGIN: 'http://a.test , http://b.test,' });
    const res = await request(app).get('/api/health').set('Origin', 'http://b.test');
    expect(res.headers['access-control-allow-origin']).toBe('http://b.test');
  });
});

describe('LOG_PROXY_HOPS', () => {
  const run = async (env) => {
    let out = '';
    const logger = createLogger({ NODE_ENV: 'development' }, new Writable({ write(c, _e, cb) { out += c; cb(); } }));
    await request(build({ NODE_ENV: 'development', ...env }, logger)).get('/api/health').set('x-forwarded-for', '1.2.3.4');
    return out;
  };
  it('chỉ log khi bật', async () => {
    expect(await run({})).not.toContain('proxy hops');
    const on = await run({ LOG_PROXY_HOPS: true });
    expect(on).toContain('proxy hops');
    expect(on).toContain('1.2.3.4');
  });
});
