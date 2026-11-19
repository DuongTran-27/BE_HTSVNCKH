import { DB_LEVEL_CHECK_SQL } from '../scripts/test-db-guard.js';

// Dọn dữ liệu DB test giữa các test integration. TRUNCATE (không deleteMany) vì AuditLog/StatusHistory có trigger
// chỉ-thêm chặn DELETE; RESTART IDENTITY không đụng topic_code_seq (sequence riêng, FR05) nên phải restart tay.
export async function resetData(prisma) {
  // BUG-005: tự kiểm ở mức DB trên chính kết nối này – kể cả khi vitest chạy không qua apps/api/vitest.config.js.
  try { await prisma.$executeRawUnsafe(DB_LEVEL_CHECK_SQL); }
  catch (e) { throw new Error(`Từ chối dọn dữ liệu: ${e.message.split('\n').filter(Boolean).pop()}`, { cause: e }); }
  const rows = await prisma.$queryRawUnsafe(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'",
  );
  const tables = rows.map((r) => `public."${r.tablename.replaceAll('"', '""')}"`);
  // Bảng chỉ-thêm chặn TRUNCATE bằng trigger (T204); replica tắt trigger thường, chỉ trong transaction này (cần superuser – DB test có).
  if (tables.length) {
    await prisma.$transaction([
      prisma.$executeRawUnsafe('SET LOCAL session_replication_role = replica'),
      prisma.$executeRawUnsafe(`TRUNCATE ${tables.join(', ')} RESTART IDENTITY CASCADE`),
    ]);
  }
  await prisma.$executeRawUnsafe('ALTER SEQUENCE topic_code_seq RESTART');
  await prisma.$executeRawUnsafe('ALTER SEQUENCE council_code_seq RESTART'); // GĐ7 §2.3, mã hội đồng (m3 BM DC-07)
}
