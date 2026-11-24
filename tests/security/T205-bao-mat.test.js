// T205 bao-mat: logout gọi revokeFamily hai lần chỉ đóng khe khi có MỘT lần xoay chen vào. Nếu trong lúc
// logout chạy có hai lần xoay nối tiếp (O→N rồi N→M), mỗi UPDATE của logout có thể bỏ sót một token mới
// (snapshot READ COMMITTED + EvalPlanQual bỏ qua dòng đã bị CAS) → M còn sống sau 204 (FR01, NFR01).
// Dòng X (token sống thứ hai cùng họ, bị khóa) chỉ là công cụ làm chậm UPDATE đầu cho tất định; ngoài đời
// độ trễ đến từ tải DB / lập lịch. Đã đóng bằng khóa tư vấn theo họ (T207a).
import { it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createAuthService } from '../../src/modules/auth/service.js';
import { createAuthRepo } from '../../src/modules/auth/prismaRepo.js';
import { sha256 } from '../../src/lib/tokens.js';
import { resetData } from '../db.js';
import { testEnv } from '../helpers.js';

const prisma = new PrismaClient();
const repo = createAuthRepo(prisma);
const svc = createAuthService({ repo, hasher: { verify: async () => true, hash: async (p) => p }, env: testEnv });
afterAll(() => prisma.$disconnect());

const tokenData = (userId, family, raw) => ({
  userId, family, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + 86400e3),
});
// Transaction giữ khóa tới khi gọi commit()
const held = (fn) => {
  let release;
  const gate = new Promise((r) => (release = r));
  let ready;
  const isReady = new Promise((r) => (ready = r));
  const done = prisma.$transaction(async (tx) => { await fn(tx); ready(); await gate; }, { timeout: 20000 });
  return { isReady, commit: () => (release(), done) };
};
const famLock = (tx, family) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${family}))`;
// Chờ có phiên đang đứng chờ khóa chạy đúng câu lệnh khớp `like` (lọc theo câu, không đếm phiên lạ trên cùng DB)
const waitBlocked = async (like) => {
  for (let i = 0; i < 150; i++) {
    const [{ n }] = await prisma.$queryRaw`SELECT count(*)::int AS n FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock' AND query ILIKE ${like}`;
    if (n > 0) return true;
    await new Promise((r) => setTimeout(r, 20));
  }
  return false;
};
const ADVISORY = '%pg_advisory_xact_lock%';
const UPDATE_FAMILY = 'UPDATE%RefreshToken%family%';

it('logout ‖ hai lần xoay nối tiếp (O→N→M): không được còn token sống sau logout', async () => {
  await resetData(prisma);
  const user = await prisma.user.create({
    data: { code: 'SV905', email: 'sv905@st.edu.vn', fullName: 'X', role: 'STUDENT', passwordHash: 'x' },
  });
  const family = 'fam-chain';
  const o = await prisma.refreshToken.create({ data: tokenData(user.id, family, 'O') });
  const x = await prisma.refreshToken.create({ data: tokenData(user.id, family, 'X') });

  // Refresh A giữ khóa họ (như refresh thật): tạo N, CAS O (chưa commit). C: khóa X để giữ UPDATE của logout lại.
  const a = held(async (tx) => {
    await famLock(tx, family);
    await tx.refreshToken.create({ data: tokenData(user.id, family, 'N') });
    await tx.refreshToken.updateMany({ where: { id: o.id, revokedAt: null }, data: { revokedAt: new Date() } });
  });
  const c = held((tx) => tx.$executeRaw`SELECT 1 FROM "RefreshToken" WHERE id = ${x.id} FOR UPDATE`);
  await Promise.all([a.isReady, c.isReady]);

  const logout = svc.logout({ refreshToken: 'O' });
  expect(await waitBlocked(ADVISORY)).toBe(true); // logout chờ khóa họ, chưa chạy UPDATE
  await a.commit(); // N, CAS O commit; logout có khóa họ, UPDATE (snapshot mới, thấy N) kẹt ở X
  expect(await waitBlocked(UPDATE_FAMILY)).toBe(true);

  // Refresh B (client đã nhận N) đến giữa chừng: phải chờ khóa họ của logout, không xoay chen được
  const refreshB = svc.refresh({ refreshToken: 'N' }).then(() => 200, (e) => e.status);
  expect(await waitBlocked(ADVISORY)).toBe(true);
  await c.commit();
  await logout;
  expect(await refreshB).toBe(401); // N đã bị logout thu hồi

  const live = await prisma.refreshToken.findMany({ where: { family, revokedAt: null }, select: { tokenHash: true } });
  expect(live).toEqual([]);
}, 30000);
