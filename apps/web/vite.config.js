import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Cùng origin khi dev, như rewrite /api của Vercel khi chạy thật (API_GD2 §1.1)
  server: { proxy: { '/api': 'http://localhost:4000' } },
  // e2e/ chạy bằng Playwright (`npm run test:e2e`), không qua Vitest
  test: { environment: 'jsdom', exclude: ['**/node_modules/**', 'e2e/**'] },
});
