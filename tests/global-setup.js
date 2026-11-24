import { DB_LEVEL_CHECK_SQL } from '../scripts/test-db-guard.js';

// Thử kết nối DB test MỘT lần trước mọi test: DB tắt → dừng ngay với hướng dẫn, không để từng test chờ timeout.
// Rồi kiểm ở mức DB (BUG-005) rằng Prisma thật sự kết nối DB *_test cục bộ, không chỉ tin vào chuỗi URL.
export default async function setup() {
  const { PrismaClient } = await import('@prisma/client');
  const client = new PrismaClient();
  try {
    await client.$queryRawUnsafe('SELECT 1').catch((e) => {
      throw new Error('Không kết nối được DB test (nckh_test). Chạy "npm run db:test:up" rồi "npm run db:test:reset" '
        + `(lần đầu: "npx -w @nckh/api prisma generate"). Lỗi gốc: ${e.message.split('\n').filter(Boolean).pop()}`);
    });
    await client.$executeRawUnsafe(DB_LEVEL_CHECK_SQL).catch((e) => {
      throw new Error(`Từ chối chạy test: ${e.message.split('\n').filter(Boolean).pop()}`);
    });
  } finally {
    await client.$disconnect();
  }
}
