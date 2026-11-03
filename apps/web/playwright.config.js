import process from 'node:process';
import { defineConfig, devices } from '@playwright/test';
import { API_ENV, API_PORT, OUT_DIR, WEB_PORT } from './e2e/env.js';

// DB được dựng lại bằng `node e2e/prepare.js` (script test:e2e chạy trước Playwright).
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.js',
  outputDir: `${OUT_DIR}test-results`,
  reporter: [['list']],
  workers: 1, // các ca dùng chung một DB; luồng M1 là chuỗi bước tuần tự
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: { baseURL: `http://localhost:${WEB_PORT}`, locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node ../api/src/server.js',
      url: `http://localhost:${API_PORT}/api/health`,
      env: { ...process.env, ...API_ENV },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `npx vite --config e2e/vite.e2e.config.js --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
