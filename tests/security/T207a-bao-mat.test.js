// T207a bao-mat: reset mật khẩu (và đổi mật khẩu) thu hồi phiên bằng một `updateMany ... userId` KHÔNG lấy khóa họ.
// Refresh chạy trong khóa họ: tạo N rồi CAS O, cả hai cùng commit ở cuối transaction. Nếu UPDATE của reset lấy
// snapshot trước commit đó và gặp dòng O khi refresh đang giữ khóa dòng (sau CAS, trước COMMIT) thì EvalPlanQual
// bỏ qua O, còn N không có trong snapshot → N sống sót sau reset (API_GD2 §3.2 "thu hồi mọi refresh token").
// Code thật, chỉ chèn điểm dừng sau thân hàm trong khóa họ (đúng khoảng giữa CAS và COMMIT).
// Đã đóng (T207a vòng 1): refresh lấy FOR SHARE dòng User, reset phải chờ refresh commit rồi mới thu hồi.
import { it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createAuthService } from '../../src/modules/auth/service.js';
import { createAuthRepo } from '../../src/modules/auth/prismaRepo.js';
import { createAccountService } from '../../src/modules/accounts/service.js';
import { createAccountRepo } from '../../src/modules/accounts/prismaRepo.js';
import { sha256 } from '../../src/lib/tokens.js';
import { resetData } from '../db.js';
import { testEnv, fakeHasher } from '../helpers.js';

const prisma = new PrismaClient();
afterAll(() => prisma.$disconnect());
const authRepo = createAuthRepo(prisma);

it('reset mật khẩu ‖ refresh đang commit: không được còn refresh token sống sau reset', async () => {
  await resetData(prisma);
  const admin = await prisma.user.create({
    data: { code: 'QT907', email: 'qt907@t.vn', fullName: 'QT', role: 'ADMIN', passwordHash: 'x' },
  });
  const victim = await prisma.user.create({
    data: { code: 'SV907', email: 'sv907@t.vn', fullName: 'SV', role: 'STUDENT', passwordHash: 'x' },
  });
  await prisma.refreshToken.create({
    data: { userId: victim.id, family: 'fam-907', tokenHash: sha256('O'), expiresAt: new Date(Date.now() + 86400e3) },
  });

  let release;
  const gate = new Promise((r) => (release = r));
  let paused;
  const isPaused = new Promise((r) => (paused = r));
  // Refresh thật; dừng sau khi đã tạo N + CAS O, trước khi transaction khóa họ commit
  const auth = createAuthService({
    hasher: fakeHasher,
    env: testEnv,
    repo: {
      ...authRepo,
      withFamilyLock: (family, fn) =>
        authRepo.withFamilyLock(family, async (r) => {
          const out = await fn(r);
          paused();
          await gate;
          return out;
        }),
    },
  });
  const refresh = auth.refresh({ refreshToken: 'O' });
  await isPaused;

  const accounts = createAccountService({ repo: createAccountRepo(prisma), hasher: fakeHasher, genPassword: () => 'Tam12345abcdXY' });
  const actor = { id: admin.id, role: 'ADMIN', staffFacultyIds: [] };
  const reset = accounts.resetPassword(actor, victim.id, '127.0.0.1');
  let blocked = false;
  for (let i = 0; i < 150 && !blocked; i++) {
    const [{ n }] = await prisma.$queryRaw`SELECT count(*)::int AS n FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock' AND (query ILIKE 'UPDATE%RefreshToken%userId%' OR query ILIKE 'SELECT%"User"%FOR NO KEY UPDATE%')`;
    blocked = n > 0;
    if (!blocked) await new Promise((r) => setTimeout(r, 20));
  }
  expect(blocked).toBe(true); // reset đứng chờ (khóa dòng User do refresh giữ SHARE; trước đây là khóa dòng O)
  release();
  await refresh; // refresh thành công, trả N cho kẻ giữ phiên
  await reset;

  const live = await prisma.refreshToken.count({ where: { userId: victim.id, revokedAt: null } });
  expect(live).toBe(0);
}, 30000);
