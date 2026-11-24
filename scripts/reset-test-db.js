// Xóa sạch và dựng lại DB test. Dùng: npm run db:test:reset
// prisma migrate reset (migration chứa after_init.sql). Thiếu thư mục migrations thì báo lỗi, không có nhánh db push.
import { execFileSync, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assertTestDbEnv, DB_LEVEL_CHECK_SQL, prismaUrlVars } from './test-db-guard.js';

const apiDir = fileURLToPath(new URL('..', import.meta.url));
const prismaCli = createRequire(import.meta.url).resolve('prisma/build/index.js');
// Chặn xóa nhầm DB thật (BUG-003): kiểm mọi URL Prisma dùng (DATABASE_URL, DIRECT_URL...) TRƯỚC mọi lệnh prisma.
try {
  assertTestDbEnv('Từ chối reset');
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

const run = (cmd) => {
  try {
    execSync(cmd, { cwd: apiDir, stdio: 'inherit', env: process.env });
  } catch (e) {
    console.error(`Reset DB test thất bại tại: ${cmd}`);
    process.exit(e.status ?? 1);
  }
};
// BUG-005: kiểm lại ở mức DB qua chính Prisma CLI (cùng cách hiểu URL với db push/migrate reset) trước khi xóa.
for (const name of prismaUrlVars()) {
  try {
    // Gọi thẳng CLI bằng node (không qua shell) để URL không bị shell diễn giải.
    execFileSync(process.execPath, [prismaCli, 'db', 'execute', '--stdin', '--url', process.env[name]], {
      cwd: apiDir,
      input: DB_LEVEL_CHECK_SQL,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (e) {
    const detail = String(e.stderr ?? e.message).trim();
    // P1001 = không tới được server (DB chưa bật), khác với bị chốt chặn từ chối (RAISE EXCEPTION, P0001).
    console.error(
      detail.includes('P1001')
        ? `Không kết nối được DB test qua ${name}. Chạy "npm run db:test:up" rồi chạy lại "npm run db:test:reset".\n${detail}`
        : `Từ chối reset: ${name} không trỏ DB test cục bộ ở mức DB (NFR08).\n${detail}`,
    );
    process.exit(1);
  }
}
const migrationsDir = `${apiDir}prisma/migrations`;
const hasMigrations = existsSync(migrationsDir) && readdirSync(migrationsDir).some((d) => /^\d/.test(d));

if (!hasMigrations) {
  console.error(
    `Không tìm thấy migration trong ${migrationsDir}. Tạo bằng prisma migrate dev trước khi reset DB test.`,
  );
  process.exit(1);
}
run('npx prisma migrate reset --force --skip-seed');
console.log('Đã reset DB test (migrate reset).');
