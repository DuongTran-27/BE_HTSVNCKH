import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Cùng origin khi dev, như rewrite /api của Vercel khi chạy thật (API_GD2 §1.1)
  server: { proxy: { '/api': 'http://localhost:4000' } },
  test: { environment: 'jsdom' },
});
