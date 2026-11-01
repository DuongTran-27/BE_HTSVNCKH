import { defineConfig } from 'vitest/config';

// BUG-005c: "npx vitest run apps/api/tests/..." từ gốc repo phải dùng config của từng workspace – nếu không,
// chốt chặn DB test, globalSetup và fileParallelism:false trong apps/api/vitest.config.js bị bỏ qua (NFR08).
// Vitest tìm config ngược lên thư mục cha: workspace nào không có config riêng sẽ nhặt file này (xem packages/shared).
export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/*'],
    // T202 (NFR09): độ phủ module nghiệp vụ – "npm run test:coverage" (gốc). Ngưỡng 70% kiểm ở /kiem-tra-cuoi.
    coverage: {
      provider: 'v8',
      include: ['apps/api/src/modules/**', 'packages/shared/src/**'],
      exclude: ['**/*.test.js'],
      reporter: ['text', 'json-summary', 'html'],
    },
  },
});
