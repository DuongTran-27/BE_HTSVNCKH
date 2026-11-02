// T205 bao-mat: logout gọi revokeFamily hai lần chỉ đóng khe khi có MỘT lần xoay chen vào. Nếu trong lúc
// logout chạy có hai lần xoay nối tiếp (O→N rồi N→M), mỗi UPDATE của logout có thể bỏ sót một token mới
// (snapshot READ COMMITTED + EvalPlanQual bỏ qua dòng đã bị CAS) → M còn sống sau 204 (FR01, NFR01).
// Dòng X (token sống thứ hai cùng họ, bị khóa) chỉ là công cụ làm chậm UPDATE đầu cho tất định; ngoài đời
// độ trễ đến từ tải DB / lập lịch. it.fails: lỗ còn mở (MINOR) – sửa xong thì đổi thành it.
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
const waitLogoutBlocked = async () => {
  for (let i = 0; i < 150; i++) {
    const [{ n }] = await prisma.$queryRaw`SELECT count(*)::int AS n FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock'
        AND query ILIKE 'UPDATE%RefreshToken%' AND query ILIKE '%family%'`;
    if (n > 0) return true;
    await new Promise((r) => setTimeout(r, 20));
  }
  return false;
};

it.fails('logout ‖ hai lần xoay nối tiếp (O→N→M): không được còn token sống sau logout', async () => {
  await resetData(prisma);
  const user = await prisma.user.create({
    data: { code: 'SV905', email: 'sv905@st.edu.vn', fullName: 'X', role: 'STUDENT', passwordHash: 'x' },
  });
  const family = 'fam-chain';
  const o = await prisma.refreshToken.create({ data: tokenData(user.id, family, 'O') });
  const x = await prisma.refreshToken.create({ data: tokenData(user.id, family, 'X') });

  // Refresh A: tạo N, CAS O (chưa commit). C: khóa X để giữ UPDATE đầu của logout lại.
  const a = held(async (tx) => {
    await tx.refreshToken.create({ data: tokenData(user.id, family, 'N') });
    await tx.refreshToken.updateMany({ where: { id: o.id, revokedAt: null }, data: { revokedAt: new Date() } });
  });
  const c = held((tx) => tx.$executeRaw`SELECT 1 FROM "RefreshToken" WHERE id = ${x.id} FOR UPDATE`);
  await Promise.all([a.isReady, c.isReady]);

  const logout = svc.logout({ refreshToken: 'O' });
  expect(await waitLogoutBlocked()).toBe(true); // UPDATE #1 (snapshot không có N) chờ khóa
  await a.commit(); // N, CAS O commit; UPDATE #1 vẫn kẹt ở X
  expect(await waitLogoutBlocked()).toBe(true);

  // Refresh B (client đã nhận N): tạo M, CAS N – chưa commit
  const n = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256('N') } });
  const b = held(async (tx) => {
    await tx.refreshToken.create({ data: tokenData(user.id, family, 'M') });
    await tx.refreshToken.updateMany({ where: { id: n.id, revokedAt: null }, data: { revokedAt: new Date() } });
  });
  await b.isReady;
  await c.commit(); // UPDATE #1 xong; UPDATE #2 lấy snapshot (thấy N, không thấy M) và chờ khóa N
  expect(await waitLogoutBlocked()).toBe(true);
  await b.commit();
  await logout;

  const live = await prisma.refreshToken.findMany({ where: { family, revokedAt: null }, select: { tokenHash: true } });
  expect(live).toEqual([]); // thực tế: [{ tokenHash: sha256('M') }]
}, 30000);
