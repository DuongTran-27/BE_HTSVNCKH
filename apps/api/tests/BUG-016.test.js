import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';
import { createMemoryAuthRepo, fakeHasher, testEnv } from './helpers.js';

const base = { JWT_ACCESS_SECRET: 'x'.repeat(32) };

describe('BUG-016 – env TTL và limiter phiên', () => {
  it('từ chối TTL access > 900s và refresh > 30 ngày, nhận giá trị mặc định', () => {
    expect(() => loadEnv({ ...base, ACCESS_TOKEN_TTL_SECONDS: '901' })).toThrow(/ACCESS_TOKEN_TTL_SECONDS/);
    expect(() => loadEnv({ ...base, REFRESH_TOKEN_TTL_DAYS: '31' })).toThrow(/REFRESH_TOKEN_TTL_DAYS/);
    expect(() => loadEnv({ ...base, REFRESH_TOKEN_TTL_DAYS: '0' })).toThrow(/REFRESH_TOKEN_TTL_DAYS/);
    expect(loadEnv(base)).toMatchObject({ ACCESS_TOKEN_TTL_SECONDS: 900, REFRESH_TOKEN_TTL_DAYS: 7 });
  });

  it.each(['refresh', 'logout'])('/api/auth/%s trả 429 RATE_LIMITED khi vượt 300 lần/15 phút', async (path) => {
    const app = createApp({ env: testEnv, logger: undefined, authRepo: createMemoryAuthRepo(), hasher: fakeHasher });
    let last;
    for (let i = 0; i < 301; i++) last = await request(app).post(`/api/auth/${path}`);
    expect(last.status).toBe(429);
    expect(last.body.error.code).toBe('RATE_LIMITED');
  });
});
