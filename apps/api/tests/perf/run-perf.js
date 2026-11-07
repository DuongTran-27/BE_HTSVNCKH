// T704 (NFR04): chạy benchmark hiệu năng trên DB riêng nckh_t704_test (không đụng nckh_test/DB dev).
// Dùng: npm run perf -w @nckh/api [-- --reset]   (--reset = migrate reset trước khi đo). Cần Postgres test đang chạy (npm run db:test:up).
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const apiDir = fileURLToPath(new URL('../..', import.meta.url));
process.loadEnvFile(`${apiDir}.env.test`);
const url = new URL(process.env.DATABASE_URL);
url.pathname = '/nckh_t704_test';
const env = { ...process.env, DATABASE_URL: url.href, DIRECT_URL: url.href };
const run = (args) => {
  const r = spawnSync(process.execPath, args, { cwd: apiDir, env, stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
if (process.argv.includes('--reset')) {
  // Tạo DB riêng nếu chưa có (lỗi "đã tồn tại" bỏ qua); chạy trên server test qua DB nckh_test.
  spawnSync(process.execPath, [fileURLToPath(import.meta.resolve('prisma/build/index.js')), 'db', 'execute', '--stdin', '--url', process.env.DATABASE_URL],
    { cwd: apiDir, input: 'CREATE DATABASE nckh_t704_test', stdio: ['pipe', 'ignore', 'ignore'] });
  run(['scripts/reset-test-db.js']);
}
run([fileURLToPath(new URL('../../../../node_modules/vitest/vitest.mjs', import.meta.url)), 'run', '--config', 'tests/perf/vitest.perf.config.js']);
