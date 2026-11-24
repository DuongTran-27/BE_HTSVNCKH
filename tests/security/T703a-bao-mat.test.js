// T703 bước A (bao-mat): test chấp nhận cho 5 mục. Test đỏ = lỗi còn tồn tại; backend-dev sửa code cho xanh.
import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { PassThrough } from 'node:stream';
import { createApp } from '../../src/app.js';
import { drainThen } from '../../src/lib/multipart.js';
import { signAccessToken } from '../../src/lib/tokens.js';
import { ROUTES, swaggerHtml } from '../../src/openapi/spec.js';
import { createMemoryAuthRepo, fakeHasher, testEnv, student } from '../helpers.js';

const stub = new Proxy({}, { get: () => async () => null });
const build = (env, authRepo = createMemoryAuthRepo(), hasher = fakeHasher) =>
  createApp({ env, logger: undefined, authRepo, hasher, catalogRepo: stub, roundRepo: stub, accountRepo: stub, topicRepo: stub, storage: stub });

describe('T703a-1 drainThen chỉ gỡ listener của chính nó', () => {
  it('listener "data" của middleware khác vẫn nhận dữ liệu sau khi drain dừng vì vượt maxBytes', async () => {
    const req = new PassThrough();
    const other = vi.fn();
    req.on('data', other);
    const next = vi.fn();
    drainThen(req, next, new Error('x'), { maxBytes: 4, timeoutMs: 1000 });
    req.write(Buffer.alloc(8));
    await new Promise((r) => setImmediate(r));
    expect(next).toHaveBeenCalledTimes(1);
    other.mockClear();
    req.write(Buffer.alloc(2));
    await new Promise((r) => setImmediate(r));
    expect(other).toHaveBeenCalled(); // removeAllListeners('data') gỡ luôn listener này
    req.end();
  });
});

describe('T703a-2 login không lộ tài khoản qua thời gian phản hồi', () => {
  it('tài khoản không tồn tại vẫn chạy verify (hash giả) đúng một lần, trả 401 chung', async () => {
    const hasher = { ...fakeHasher, verify: vi.fn(fakeHasher.verify) };
    const app = build(testEnv, createMemoryAuthRepo([student]), hasher);
    const res = await request(app).post('/api/auth/login').send({ identifier: 'khong-ton-tai', password: 'Matkhau123' });
    expect(res.status).toBe(401);
    expect(hasher.verify).toHaveBeenCalledTimes(1);
    const known = await request(app).post('/api/auth/login').send({ identifier: 'SV001', password: 'sai-mat-khau' });
    expect(known.body.error).toEqual(res.body.error); // cùng thông báo
  });
});

describe('T703a-3 x-request-id do client gửi', () => {
  const crashApp = () => build(testEnv, { ...createMemoryAuthRepo(), findUserByIdentifier: async () => { throw new Error('boom'); } });
  const idOf = async (header) => {
    const r = request(crashApp()).post('/api/auth/login').send({ identifier: 'a', password: 'b' });
    const res = await (header === undefined ? r : r.set('x-request-id', header));
    expect(res.status).toBe(500);
    return res.body.error.requestId;
  };
  it('giá trị hợp lệ ^[\\w-]{1,64}$ được giữ', async () => {
    expect(await idOf('abc-123_X')).toBe('abc-123_X');
  });
  it.each([['quá dài', 'a'.repeat(65)], ['ký tự lạ', 'x"<script>'], ['khoảng trắng', 'a b'], ['rỗng', '']])('%s: sinh id mới', async (_n, v) => {
    const id = await idOf(v);
    expect(id).not.toBe(v);
    expect(id).toMatch(/^[\w-]{1,64}$/);
  });
});

describe('T703a-5 Swagger UI', () => {
  it('ghim swagger-ui-dist phiên bản đầy đủ + SRI + crossorigin cho mọi tài nguyên CDN', () => {
    const tags = swaggerHtml.match(/<(?:script|link)[^>]*unpkg\.com[^>]*>/g) ?? [];
    expect(tags.length).toBe(2);
    for (const t of tags) {
      expect(t).toMatch(/swagger-ui-dist@\d+\.\d+\.\d+\//);
      expect(t).toMatch(/integrity="sha(256|384|512)-[A-Za-z0-9+/=]+"/);
      expect(t).toMatch(/crossorigin="anonymous"/);
    }
  });
  it('ENABLE_SWAGGER được dùng thật: production luôn 404; ngoài production chỉ bật khi ENABLE_SWAGGER=true', async () => {
    const st = async (env) => (await request(build(env)).get('/api/openapi.json')).status;
    expect(await st({ ...testEnv, NODE_ENV: 'production', ENABLE_SWAGGER: true })).toBe(404);
    expect(await st({ ...testEnv, NODE_ENV: 'development', ENABLE_SWAGGER: false })).toBe(404);
    expect(await st({ ...testEnv, NODE_ENV: 'development', ENABLE_SWAGGER: true })).toBe(200);
  });
});

describe('T703a-5 vai trò trong ROUTES khớp guard thật', () => {
  const users = {
    A: { id: 'ua', code: 'AD1', email: 'ad@x.vn', fullName: 'A', role: 'ADMIN', passwordHash: 'h:x' },
    S: { id: 'us', code: 'CB1', email: 'cb@x.vn', fullName: 'S', role: 'STAFF', passwordHash: 'h:x', staffScopes: [{ facultyId: 'f1' }] },
    L: { id: 'ul', code: 'GV1', email: 'gv@x.vn', fullName: 'L', role: 'LECTURER', passwordHash: 'h:x' },
    V: { id: 'uv', code: 'SV1', email: 'sv@x.vn', fullName: 'V', role: 'STUDENT', passwordHash: 'h:x' },
  };
  const app = build(testEnv, createMemoryAuthRepo(Object.values(users)));
  const token = (c) => signAccessToken(users[c], { secret: testEnv.JWT_ACCESS_SECRET, ttlSeconds: 900 });
  const cases = ROUTES.filter(([, , roles]) => /^[ASLV]+$/.test(roles))
    .flatMap(([m, p, roles]) => [...'ASLV'].filter((c) => !roles.includes(c)).map((c) => [`${m} ${p} – ${users[c].role}`, m, p, c]));

  it('có đủ ca để kiểm', () => expect(cases.length).toBeGreaterThan(50));
  // Chiều nguy hiểm: vai trò KHÔNG có trong ROUTES phải bị 403 FORBIDDEN (trước mọi validate/xử lý nghiệp vụ)
  it.each(cases)('%s → 403', async (_n, method, path, c) => {
    const url = `/api${path.replace(/:\w+/g, '1')}`;
    const res = await request(app)[method.toLowerCase()](url).set('authorization', `Bearer ${token(c)}`).send({});
    expect([res.status, res.body?.error?.code]).toEqual([403, 'FORBIDDEN']);
  });
});
