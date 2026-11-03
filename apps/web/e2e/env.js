// Cấu hình dùng chung cho prepare.js, playwright.config.js, vite.e2e.config.js (T309).
// DB riêng nckh_t309_test (hậu tố _test để qua chốt NFR08); không dùng DB dev hay nckh_test, không đọc .env.
import { fileURLToPath } from 'node:url';

export const API_PORT = 4309;
export const WEB_PORT = 5309;
export const DB_NAME = 'nckh_t309_test';
export const DB_URL = `postgresql://postgres:postgres@localhost:54329/${DB_NAME}`;
export const TEMPLATE_URL = 'postgresql://postgres:postgres@localhost:54329/template1';
export const OUT_DIR = fileURLToPath(new URL('./.out/', import.meta.url));
export const STATE_FILE = `${OUT_DIR}state.json`;

export const API_ENV = {
  NODE_ENV: 'development',
  PORT: String(API_PORT),
  DATABASE_URL: DB_URL,
  DIRECT_URL: DB_URL,
  JWT_ACCESS_SECRET: 'e2e-t309-secret-khong-dung-that-0123456789',
  CORS_ORIGIN: `http://localhost:${WEB_PORT}`,
};
