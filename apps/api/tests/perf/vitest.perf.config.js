import { defineConfig } from 'vitest/config';
import { assertTestDbEnv } from '../../scripts/test-db-guard.js';

// Vẫn qua chốt chặn NFR08: URL phải là DB *_test cục bộ. Không nằm trong `npm test` (include riêng, đuôi .perf.js).
try { assertTestDbEnv('Từ chối chạy perf'); }
catch (e) { console.error(e.message); process.exit(1); }

export default defineConfig({
  root: new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
  test: {
    include: ['tests/perf/*.perf.js'],
    globalSetup: './tests/global-setup.js',
    fileParallelism: false,
    testTimeout: 600000,
    hookTimeout: 600000,
  },
});
