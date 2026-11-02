// T207a vòng 1 (bao-mat): phiên không sống sót qua reset/đổi mật khẩu khi cấp token đồng thời; mã đăng nhập duy nhất không phân biệt hoa thường.
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../src/app.js';
import { createAuthService } from '../../src/modules/auth/service.js';
import { createAuthRepo } from '../../src/modules/auth/prismaRepo.js';
import { createAccountService } from '../../src/modules/accounts/service.js';
import { createAccountRepo } from '../../src/modules/accounts/prismaRepo.js';
import { sha256, signAccessToken } from '../../src/lib/tokens.js';
import { resetData } from '../db.js';
import { testEnv, fakeHasher } from '../helpers.js';

const prisma = new PrismaClient();
afterAll(() => prisma.$disconnect());
const authRepo = createAuthRepo(prisma);
const gateOf = () => {
  let release;
  let paused;
  return { gate: new Promise((r) => (release = r)), release: () => release(), isPaused: new Promise((r) => (paused = r)), pause: () => paused() };
};
const waitBlocked = async (like) => {
  for (let i = 0; i < 150; i++) {
    const [{ n }] = await prisma.$queryRaw`SELECT count(*)::int AS n FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock' AND query ILIKE ${like}`;
    if (n > 0) return true;
    await new Promise((r) => setTimeout(r, 20));
  }
  return false;
};
const live = (userId) => prisma.refreshToken.count({ where: { userId, revokedAt: null } });
let admin;
let victim;
beforeEach(async () => {
  await resetData(prisma);
  admin = await prisma.user.create({ data: { code: 'QT908', email: 'qt908@t.vn', fullName: 'QT', role: 'ADMIN', passwordHash: 'x', mustChangePassword: false } });
  victim = await prisma.user.create({
    data: { code: 'SV908', email: 'sv908@t.vn', fullName: 'SV', role: 'STUDENT', passwordHash: 'h:Cu12345', mustChangePassword: false },
  });
  await prisma.refreshToken.create({
    data: { userId: victim.id, family: 'fam-908', tokenHash: sha256('O'), expiresAt: new Date(Date.now() + 86400e3) },
  });
});
const reset = () =>
  createAccountService({ repo: createAccountRepo(prisma), hasher: fakeHasher, genPassword: () => 'Tam12345abcdXY' })
    .resetPassword({ id: admin.id, role: 'ADMIN', staffFacultyIds: [] }, victim.id, '127.0.0.1');
// Refresh thật, dừng sau thân hàm trong khóa họ (giữa CAS và COMMIT)
const pausedRefresh = (g) =>
  createAuthService({
    hasher: fakeHasher,
    env: testEnv,
    repo: {
      ...authRepo,
      withFamilyLock: (family, fn) =>
        authRepo.withFamilyLock(family, async (r) => {
          const out = await fn(r);
          g.pause();
          await g.gate;
          return out;
        }),
    },
  }).refresh({ refreshToken: 'O' });

describe('thu hồi phiên không bỏ sót token đang được cấp', () => {
  it('đổi mật khẩu ‖ refresh đang commit: token N cũng bị thu hồi', async () => {
    const g = gateOf();
    const refresh = pausedRefresh(g);
    await g.isPaused;
    const svc = createAuthService({ repo: authRepo, hasher: fakeHasher, env: testEnv });
    const change = svc.changePassword({ userId: victim.id, currentPassword: 'Cu12345', newPassword: 'Moi12345' });
    expect(await waitBlocked('SELECT%"User"%FOR NO KEY UPDATE%')).toBe(true);
    g.release();
    await refresh;
    await change;
    expect(await live(victim.id)).toBe(0);
    expect((await prisma.user.findUnique({ where: { id: victim.id } })).passwordHash).toBe('h:Moi12345');
  }, 30000);

  it('đăng nhập (mật khẩu cũ) ‖ reset: reset commit trong lúc xác minh → đăng nhập bị từ chối, không còn token sống', async () => {
    const g = gateOf();
    const slow = { ...fakeHasher, verify: async (h, p) => { g.pause(); await g.gate; return fakeHasher.verify(h, p); } };
    const login = createAuthService({ repo: authRepo, hasher: slow, env: testEnv })
      .login({ identifier: 'SV908', password: 'Cu12345' })
      .then(() => 200, (e) => e.status);
    await g.isPaused;
    await reset(); // commit hẳn khi login còn đang "băm"
    g.release();
    expect(await login).toBe(401);
    expect(await live(victim.id)).toBe(0);
  }, 30000);

  it('refresh ‖ khóa tài khoản: không còn token sống', async () => {
    const g = gateOf();
    const refresh = pausedRefresh(g);
    await g.isPaused;
    const lock = createAccountService({ repo: createAccountRepo(prisma), hasher: fakeHasher })
      .setLocked({ id: admin.id, role: 'ADMIN', staffFacultyIds: [] }, victim.id, true, null);
    expect(await waitBlocked('SELECT%"User"%FOR NO KEY UPDATE%')).toBe(true);
    g.release();
    await refresh;
    await lock;
    expect(await live(victim.id)).toBe(0);
  }, 30000);
});

describe('mã đăng nhập duy nhất không phân biệt hoa thường', () => {
  it('hai lệnh tạo đồng thời sv1/SV1 → đúng một lệnh thành công, lệnh kia 409', async () => {
    const app = createApp({ env: testEnv, logger: undefined, authRepo, hasher: fakeHasher, accountRepo: createAccountRepo(prisma) });
    const bearer = signAccessToken(admin, { secret: testEnv.JWT_ACCESS_SECRET, ttlSeconds: 600 });
    const mk = (code, email) =>
      request(app).post('/api/users').set('Authorization', `Bearer ${bearer}`).send({ code, email, fullName: 'X', role: 'ADMIN' });
    for (let i = 0; i < 5; i++) {
      const res = await Promise.all([mk(`sv${i}`, `a${i}@t.vn`), mk(`SV${i}`, `b${i}@t.vn`)]);
      expect(res.map((r) => r.status).sort()).toEqual([201, 409]);
    }
    await expect(prisma.$executeRaw`INSERT INTO "User" (id, code, email, "fullName", "passwordHash", role) VALUES ('x1','Sv0','z@t.vn','n','h','STUDENT')`).rejects.toThrow();
  }, 30000);
});
