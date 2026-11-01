import { defineConfig } from 'vitest/config';

// Có file này để "vitest run" trong packages/shared không đi ngược lên nhặt vitest.config.js gốc (projects: chạy mọi workspace).
export default defineConfig({});
