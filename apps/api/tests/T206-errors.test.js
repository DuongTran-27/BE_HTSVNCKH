// T206: errorHandler với lỗi Prisma giả từng dạng (API_GD2 §1.8, §11c), requirePasswordChanged, conflict(details),
// publicUser.staffFacultyIds, redact. Không cần DB.
import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { errorHandler } from '../src/middlewares/errorHandler.js';
import { requirePasswordChanged } from '../src/middlewares/auth.js';
import { conflict } from '../src/lib/errors.js';
import { publicUser } from '../src/modules/auth/service.js';
import { redact } from '../src/modules/audit/service.js';
import { createApp } from '../src/app.js';
import { signAccessToken } from '../src/lib/tokens.js';
import { createMemoryAuthRepo, fakeHasher, testEnv } from './helpers.js';

// Lỗi giả có cùng hình dạng với lỗi Prisma 5 (name, code, meta, message)
const prismaErr = (name, code, extra = {}) =>
  Object.assign(new Error(extra.message ?? 'prisma'), { name, code, ...extra });
const known = (code, extra) => prismaErr('PrismaClientKnownRequestError', code, extra);

const run = async (err, { logger, duplicateFields } = {}) => {
  const app = express();
  app.get('/x', (req, _res) => {
    if (duplicateFields) req.duplicateFields = duplicateFields;
    throw err;
  });
  app.use(errorHandler(logger));
  return request(app).get('/x');
};

describe('errorHandler – lỗi Prisma', () => {
  it('P2002 -> 409 DUPLICATE, details đổi tên cột sang tên trường request', async () => {
    const r = await run(known('P2002', { meta: { target: ['code'] } }), { duplicateFields: { code: 'code' } });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatchObject({ code: 'DUPLICATE', details: { code: 'Đã tồn tại' } });
  });
  it('P2002 không ánh xạ được cột -> không có details (không lộ tên cột/constraint)', async () => {
    for (const opts of [{}, { duplicateFields: { code: 'code' } }]) {
      const r = await run(known('P2002', { meta: { target: ['email', 'code'] } }), opts);
      expect(r.status).toBe(409);
      expect(r.body.error.details).toBeUndefined();
    }
    const r = await run(known('P2002', { meta: { target: 'topic_one_leader' } }), {
      duplicateFields: { code: 'code' },
    });
    expect(r.body.error).toMatchObject({ code: 'DUPLICATE' });
    expect(r.body.error.details).toBeUndefined();
  });
  it('P2025 -> 404 NOT_FOUND', async () => {
    const r = await run(known('P2025'));
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe('NOT_FOUND');
  });
  it.each([
    ['P2010 + meta.code 55P03', known('P2010', { meta: { code: '55P03', message: 'x' } })],
    ['P2034 (deadlock / xung đột ghi)', known('P2034')],
    [
      'lỗi không mã, message có "canceling statement due to lock timeout"',
      prismaErr('PrismaClientUnknownRequestError', undefined, {
        message: 'ERROR: canceling statement due to lock timeout',
      }),
    ],
    ['message chứa 55P03', prismaErr('PrismaClientUnknownRequestError', undefined, { message: 'code: 55P03' })],
  ])('tranh chấp khóa: %s -> 409 CONCURRENT_UPDATE', async (_n, err) => {
    const r = await run(err);
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('CONCURRENT_UPDATE');
    expect(r.body.error.message).not.toMatch(/Đề tài/);
  });
  it('P2028 -> 503 SERVICE_BUSY và ghi logger.warn', async () => {
    const logger = { warn: vi.fn(), error: vi.fn() };
    const r = await run(known('P2028', { message: 'Transaction already closed' }), { logger });
    expect(r.status).toBe(503);
    expect(r.body.error.code).toBe('SERVICE_BUSY');
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.error).not.toHaveBeenCalled();
  });
  it('P2010 mã khác 55P03, lỗi Prisma khác, lỗi thường -> 500 INTERNAL, không lộ message', async () => {
    for (const err of [
      known('P2010', { meta: { code: '23505' }, message: 'secret detail' }),
      known('P2003', { message: 'secret detail' }),
      new Error('lock timeout'),
    ]) {
      const r = await run(err, { logger: { error: vi.fn() } });
      expect(r.status).toBe(500);
      expect(r.body.error.code).toBe('INTERNAL');
      expect(JSON.stringify(r.body)).not.toContain('secret detail');
    }
  });
});

describe('conflict() có details', () => {
  it('mang details, tham số tùy chọn', () => {
    expect(conflict('X', 'm', { a: 1 }).details).toEqual({ a: 1 });
    expect(conflict('X', 'm').details).toBeUndefined();
  });
});

describe('requirePasswordChanged (FR02)', () => {
  it('403 PASSWORD_CHANGE_REQUIRED khi mustChangePassword, qua khi đã đổi', async () => {
    const app = express();
    app.use((req, _res, next) => {
      req.user = { mustChangePassword: req.get('x-must') === '1' };
      next();
    });
    app.get('/ok', requirePasswordChanged, (_req, res) => res.json({ ok: true }));
    app.use(errorHandler());
    const blocked = await request(app).get('/ok').set('x-must', '1');
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
    expect((await request(app).get('/ok').set('x-must', '0')).status).toBe(200);
  });

  it('gắn một lần ở app.js cho mọi tiền tố nghiệp vụ; /api/auth, /api/health không bị chặn; đường dẫn lạ vẫn 404', async () => {
    const authRepo = createMemoryAuthRepo([
      {
        id: 'a',
        code: 'A1',
        email: 'a@x.vn',
        fullName: 'A',
        role: 'STAFF',
        passwordHash: 'h:x',
        mustChangePassword: true,
        staffScopes: [{ facultyId: 'f1' }],
      },
    ]);
    const reached = vi.fn();
    const app = createApp({
      env: testEnv,
      logger: undefined,
      authRepo,
      hasher: fakeHasher,
      catalogRepo: {
        list: async () => {
          reached();
          return [];
        },
      },
      roundRepo: null,
    });
    const token = signAccessToken({ id: 'a', role: 'STAFF' }, { secret: testEnv.JWT_ACCESS_SECRET, ttlSeconds: 60 });
    const r = await request(app).get('/api/faculties').set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
    expect(reached).not.toHaveBeenCalled();
    expect((await request(app).get('/api/health')).status).toBe(200);
    expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`)).status).toBe(200);
    expect((await request(app).get('/api/faculties')).status).toBe(401);
    expect((await request(app).get('/api/khong-co')).status).toBe(404);
  });
});

describe('publicUser.staffFacultyIds (API_GD2 §1.1)', () => {
  it('STAFF: danh sách khoa trong StaffScope; vai trò khác: []', () => {
    const base = { id: 'u', code: 'c', email: 'e', fullName: 'n', mustChangePassword: false };
    expect(
      publicUser({ ...base, role: 'STAFF', staffScopes: [{ facultyId: 'f1' }, { facultyId: 'f2' }] }).staffFacultyIds,
    ).toEqual(['f1', 'f2']);
    expect(publicUser({ ...base, role: 'STAFF' }).staffFacultyIds).toEqual([]);
    expect(publicUser({ ...base, role: 'LECTURER', staffScopes: [{ facultyId: 'f1' }] }).staffFacultyIds).toEqual([]);
  });
});

describe('redact (T204 bao-mat MINOR 1)', () => {
  it('bỏ thêm key$, authorization, cookie, credential, otp, salt', () => {
    const out = redact({
      apiKey: 1,
      privateKey: 1,
      Authorization: 'Bearer x',
      cookie: 'c',
      credentials: 1,
      otp: '1',
      salt: 's',
      passwordHash: 'h',
      ok: 1,
      nested: [{ setCookie: 'x', keep: 2 }],
    });
    expect(out).toEqual({ ok: 1, nested: [{ keep: 2 }] });
  });
  it('giữ nguyên giá trị không phải plain object (BigInt, Buffer, class instance)', () => {
    const buf = Buffer.from('ab');
    class Dec {
      constructor(v) {
        this.v = v;
      }
    }
    const dec = new Dec('1.5');
    const out = redact({ n: 10n, buf, dec, d: new Date('2026-01-01T00:00:00Z'), nul: null });
    expect(out.n).toBe(10n);
    expect(out.buf).toBe(buf);
    expect(out.dec).toBe(dec);
    expect(out.d).toBe('2026-01-01T00:00:00.000Z');
    expect(out.nul).toBeNull();
  });
});
