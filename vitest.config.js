import { defineConfig } from 'vitest/config';
import { assertTestDbEnv } from './scripts/test-db-guard.js';

// NFR08 (BUG-004): nạp .env.test, rồi từ chối chạy nếu bất kỳ URL Prisma nào không trỏ DB test cục bộ
// (shell đã export DATABASE_URL/DIRECT_URL của DB dev thắng .env.test vì loadEnvFile không ghi đè).
try {
  assertTestDbEnv('Từ chối chạy test');
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

export default defineConfig({
  test: {
    globalSetup: './tests/global-setup.js',
    // Mọi file test integration dùng chung một DB nckh_test; chạy file song song thì file này xóa dữ liệu
    // file kia đang dùng (kiem-thu tái hiện "expected 2 to be 1"). Test trong một file vẫn tuần tự như mặc định.
    fileParallelism: false,
    // T202 (NFR09): độ phủ module nghiệp vụ – "npm run test:coverage". Ngưỡng ≥70% theo từng thư mục; dưới ngưỡng thì vitest exit ≠ 0.
    coverage: {
      provider: 'v8',
      include: ['src/modules/**', 'shared/src/**'],
      exclude: ['**/*.test.js'],
      reporter: ['text', 'json-summary', 'html'],
      thresholds: {
        'src/modules/**': { lines: 70, statements: 70, functions: 70, branches: 70 },
        'shared/src/**': { lines: 70, statements: 70, functions: 70, branches: 70 },
      },
    },
  },
});
