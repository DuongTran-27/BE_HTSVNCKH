// T205 (FR01, NFR01): auth chạy trên Postgres thật qua repo Prisma – đăng nhập, xoay vòng, phát hiện dùng lại,
// logout (kể cả token đã xoay, logout lặp), khóa tài khoản, đổi mật khẩu, và khe logout ‖ refresh ở mức DB.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../src/app.js';
import { createAuthService } from '../src/modules/auth/service.js';
import { createAuthRepo } from '../src/modules/auth/prismaRepo.js';
import { passwordHasher } from '../src/lib/password.js';
import { sha256 } from '../src/lib/tokens.js';
import { resetData } from './db.js';
import { testEnv } from './helpers.js';

const prisma = new PrismaClient();
const repo = createAuthRepo(prisma);
const svc = createAuthService({ repo, hasher: passwordHasher, env: testEnv });
const app = createApp({ env: testEnv, logger: undefined, authRepo: repo, hasher: passwordHasher });
const PASSWORD = 'Matkhau@123';
let passwordHash;
let user;

const cookieOf = (res) => (res.headers['set-cookie'] ?? []).find((c) => c.startsWith('nckh_rt='))?.split(';')[0];
const rawOf = (cookie) => cookie.slice('nckh_rt='.length);
const tokenOf = (cookie) => prisma.refreshToken.findUnique({ where: { tokenHash: sha256(rawOf(cookie)) } });
const liveCount = (where) => prisma.refreshToken.count({ where: { ...where, revokedAt: null } });
const login = (identifier = 'SV900', password = PASSWORD) =>
  request(app).post('/api/auth/login').send({ identifier, password });

beforeAll(async () => {
  passwordHash = await passwordHasher.hash(PASSWORD);
});
// Dữ liệu riêng từng test: dọn rồi tạo lại người dùng trước mỗi test
beforeEach(async () => {
  await resetData(prisma);
  user = await prisma.user.create({
    data: {
      code: 'SV900',
      email: 'sv900@st.edu.vn',
      fullName: 'Trần Thị B',
      role: 'STUDENT',
      passwordHash,
      mustChangePassword: false,
    },
  });
});
afterAll(() => prisma.$disconnect());

describe('FR01 trên Postgres – đăng nhập', () => {
  it('đăng nhập bằng mã (không phân biệt hoa thường) hoặc email; DB chỉ lưu bản băm; access token ≤ 15 phút', async () => {
    for (const id of ['sv900', 'SV900', 'sv900@st.edu.vn']) {
      const res = await login(id);
      expect(res.status).toBe(200);
      expect(res.body.user).toMatchObject({ id: user.id, code: 'SV900', role: 'STUDENT' });
      const c = cookieOf(res);
      const rec = await tokenOf(c);
      expect(rec).toMatchObject({ userId: user.id, revokedAt: null });
      expect(await prisma.refreshToken.count({ where: { tokenHash: rawOf(c) } })).toBe(0);
      const { iat, exp } = jwt.decode(res.body.accessToken);
      expect(exp - iat).toBeLessThanOrEqual(15 * 60);
    }
  });

  it('5 lần sai liên tiếp → tạm khóa (429), kể cả mật khẩu đúng; sai thì thông báo chung', async () => {
    for (let i = 0; i < 5; i++) {
      const r = await login('SV900', 'SaiMatKhau1');
      expect(r.status).toBe(401);
      expect(r.body.error.message).toBe('Mã/email hoặc mật khẩu không đúng');
    }
    expect((await prisma.user.findUnique({ where: { id: user.id } })).lockedUntil).not.toBeNull();
    const r = await login();
    expect(r.status).toBe(429);
    expect(r.body.error.code).toBe('TEMP_LOCKED');
  });

  it('tài khoản bị khóa: không đăng nhập được; access token và refresh token cũ bị từ chối ở lần gọi kế tiếp', async () => {
    const res = await login();
    const c = cookieOf(res);
    await prisma.user.update({ where: { id: user.id }, data: { isLocked: true } });
    expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${res.body.accessToken}`)).status).toBe(
      401,
    );
    expect((await request(app).post('/api/auth/refresh').set('Cookie', c)).status).toBe(401);
    expect(await liveCount({ userId: user.id })).toBe(0);
    const again = await login();
    expect(again.status).toBe(403);
    expect(again.body.error.code).toBe('ACCOUNT_LOCKED');
  });

  it('repo Prisma nạp kèm staffScopes của cán bộ', async () => {
    const f = await prisma.faculty.create({ data: { code: 'CNTT9', name: 'Khoa thử' } });
    const staff = await prisma.user.create({
      data: {
        code: 'CB900',
        email: 'cb900@edu.vn',
        fullName: 'Cán bộ',
        role: 'STAFF',
        passwordHash,
        staffScopes: { create: { facultyId: f.id } },
      },
    });
    expect((await repo.findUserById(staff.id)).staffScopes).toEqual([{ facultyId: f.id }]);
    expect((await repo.findUserByIdentifier('cb900')).staffScopes).toEqual([{ facultyId: f.id }]);
  });
});

describe('FR01 trên Postgres – refresh, logout', () => {
  it('refresh xoay vòng (replacedBy trỏ token mới); dùng lại token cũ → 401 và thu hồi cả họ', async () => {
    const c1 = cookieOf(await login());
    const r = await request(app).post('/api/auth/refresh').set('Cookie', c1);
    expect(r.status).toBe(200);
    const c2 = cookieOf(r);
    const [t1, t2] = [await tokenOf(c1), await tokenOf(c2)];
    expect(t1.revokedAt).not.toBeNull();
    expect(t1.replacedBy).toBe(t2.id);
    expect(t2).toMatchObject({ family: t1.family, revokedAt: null });
    expect((await request(app).post('/api/auth/refresh').set('Cookie', c1)).status).toBe(401);
    expect(await liveCount({ family: t1.family })).toBe(0);
    expect((await request(app).post('/api/auth/refresh').set('Cookie', c2)).status).toBe(401);
  });

  it('revokeToken (CAS) lần hai cùng id trả false, không ghi đè revokedAt/replacedBy', async () => {
    const { refreshRecord } = await svc.login({ identifier: 'SV900', password: PASSWORD });
    const at = new Date('2026-11-01T00:00:00Z');
    expect(await repo.revokeToken(refreshRecord.id, at, 'moi-1')).toBe(true);
    expect(await repo.revokeToken(refreshRecord.id, new Date(), 'moi-2')).toBe(false);
    const rec = await prisma.refreshToken.findUnique({ where: { id: refreshRecord.id } });
    expect(rec).toMatchObject({ revokedAt: at, replacedBy: 'moi-1' });
  });

  it('logout thu hồi phiên hiện tại; logout lặp bằng token của họ đã thu hồi → 204 rỗng; phiên khác còn sống', async () => {
    const other = cookieOf(await login());
    const c = cookieOf(await login());
    const first = await request(app).post('/api/auth/logout').set('Cookie', c);
    expect(first.status).toBe(204);
    expect((await tokenOf(c)).revokedAt).not.toBeNull();
    const again = await request(app).post('/api/auth/logout').set('Cookie', c);
    expect(again.status).toBe(204);
    expect(again.text).toBe('');
    expect((await request(app).post('/api/auth/refresh').set('Cookie', c)).status).toBe(401);
    expect((await request(app).post('/api/auth/refresh').set('Cookie', other)).status).toBe(200);
  });

  it('logout bằng token đã xoay → token mới nhất của họ bị thu hồi trên DB', async () => {
    const c1 = cookieOf(await login());
    const c2 = cookieOf(await request(app).post('/api/auth/refresh').set('Cookie', c1));
    const c3 = cookieOf(await request(app).post('/api/auth/refresh').set('Cookie', c2));
    expect((await request(app).post('/api/auth/logout').set('Cookie', c1)).status).toBe(204);
    expect((await tokenOf(c3)).revokedAt).not.toBeNull();
    expect(await liveCount({ family: (await tokenOf(c1)).family })).toBe(0);
  });

  it('đổi mật khẩu: thu hồi phiên khác, giữ phiên hiện tại; mật khẩu cũ không còn dùng được', async () => {
    const other = cookieOf(await login());
    const res = await login();
    const cur = cookieOf(res);
    const r = await request(app)
      .post('/api/auth/change-password')
      .set('Cookie', cur)
      .set('Authorization', `Bearer ${res.body.accessToken}`)
      .send({ currentPassword: PASSWORD, newPassword: 'MatKhauMoi@456' });
    expect(r.status).toBe(204);
    expect((await tokenOf(other)).revokedAt).not.toBeNull();
    expect((await tokenOf(cur)).revokedAt).toBeNull();
    expect((await login()).status).toBe(401);
    expect((await login('SV900', 'MatKhauMoi@456')).status).toBe(200);
  });
});

// Khe logout ‖ refresh (reviews/BUG-002-bao-mat-v1.md MINOR 1) trên Postgres READ COMMITTED.
describe('FR01 trên Postgres – logout đồng thời với refresh', () => {
  const lockWaiters = async () =>
    (
      await prisma.$queryRaw`
    SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'
        AND query ILIKE '%pg_advisory_xact_lock%'`
    )[0].n;

  it('logout chờ khóa họ của refresh đang chạy, rồi thu hồi cả token mới N', async () => {
    const { refreshToken, refreshRecord: o } = await svc.login({ identifier: 'SV900', password: PASSWORD });
    let logout;
    let blocked = false;
    // Giữ một "refresh" chưa commit (đang giữ khóa tư vấn của họ như refresh thật): tạo N rồi CAS token cũ O
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${o.family}))`;
        await tx.refreshToken.create({
          data: {
            userId: user.id,
            tokenHash: sha256('token-moi-N'),
            family: o.family,
            expiresAt: new Date(Date.now() + 86400e3),
          },
        });
        await tx.refreshToken.updateMany({ where: { id: o.id, revokedAt: null }, data: { revokedAt: new Date() } });
        logout = svc.logout({ refreshToken });
        // Logout phải đứng chờ khóa tư vấn của họ cho tới khi refresh commit
        for (let i = 0; i < 100 && !blocked; i++) {
          blocked = (await lockWaiters()) > 0;
          if (!blocked) await new Promise((r) => setTimeout(r, 20));
        }
      },
      { timeout: 15000 },
    );
    await logout;
    expect(blocked).toBe(true);
    expect(await liveCount({ family: o.family })).toBe(0);
  });

  // Logout bắt đầu giữa các bước refresh (hook trong khóa họ): logout phải chờ refresh commit rồi thu hồi cả họ,
  // không deadlock, không còn token sống (trước đây refresh bị 401; nay hai việc tuần tự).
  it.each(['beforeCreate', 'beforeRotate'])(
    'logout chen giữa refresh (%s) → chờ khóa họ, sau cùng không còn token sống',
    async (at) => {
      const { refreshToken, refreshRecord } = await svc.login({ identifier: 'SV900', password: PASSWORD });
      let logout = null;
      const fire = () => {
        logout ??= svc.logout({ refreshToken });
      };
      const hooked = createAuthService({
        hasher: passwordHasher,
        env: testEnv,
        repo: {
          ...repo,
          withFamilyLock: (family, fn) =>
            repo.withFamilyLock(family, (r) =>
              fn({
                ...r,
                createRefreshToken: async (d) => {
                  if (at === 'beforeCreate') fire();
                  return r.createRefreshToken(d);
                },
                revokeToken: async (...a) => {
                  if (at === 'beforeRotate') fire();
                  return r.revokeToken(...a);
                },
              }),
            ),
        },
      });
      const result = await hooked.refresh({ refreshToken }).then(
        () => 'ok',
        (e) => e.status,
      );
      expect(logout).not.toBeNull();
      expect(result).toBe('ok'); // logout chờ refresh xong nên refresh không bị thu hồi giữa chừng
      await logout;
      expect(await liveCount({ family: refreshRecord.family })).toBe(0);
    },
  );

  it('20 lượt refresh và logout chạy song song thật: không lượt nào để lại token sống', async () => {
    for (let i = 0; i < 20; i++) {
      const { refreshToken, refreshRecord } = await svc.login({ identifier: 'SV900', password: PASSWORD });
      await Promise.allSettled([svc.refresh({ refreshToken }), svc.logout({ refreshToken })]);
      expect(await liveCount({ family: refreshRecord.family }), `lượt ${i}`).toBe(0);
    }
  }, 60000);
});
