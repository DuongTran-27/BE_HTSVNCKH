// QA T201 (NFR08 – DB dev/test tách riêng): test và script reset không bao giờ được chạm DB ngoài DB test cục bộ,
// kể cả khi shell đã export DATABASE_URL/DIRECT_URL của DB dev (Supabase). Host *.invalid: không phân giải được,
// nên dù sản phẩm sai cũng không có DB thật nào bị đụng.
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const apiDir = fileURLToPath(new URL('..', import.meta.url));
const DEV_URL = 'postgresql://postgres.ref:secret@db-dev.example.invalid:5432/postgres';

// Môi trường con không có DATABASE_URL/DIRECT_URL từ tiến trình test (vitest.config đã nạp .env.test).
const envWith = (extra) => {
  const env = { ...process.env, NO_COLOR: '1' };
  delete env.DATABASE_URL;
  delete env.DIRECT_URL;
  return { ...env, ...extra };
};
const runNode = (args, extra) => spawnSync(process.execPath, args, { cwd: apiDir, env: envWith(extra), encoding: 'utf8', timeout: 90000 });

describe('NFR08 – cô lập DB test khỏi DB dev', () => {
  it('TC-NFR08-01: reset từ chối khi DIRECT_URL (CLI Prisma dùng cho db push/migrate reset) trỏ host không cục bộ', () => {
    // .env.test cho DATABASE_URL=localhost nhưng DIRECT_URL đã export sẵn → loadEnvFile không ghi đè.
    const r = runNode(['scripts/reset-test-db.js'], { DIRECT_URL: DEV_URL });
    const out = `${r.stdout}\n${r.stderr}`;
    expect(r.status).not.toBe(0);
    expect(out, 'phải chặn trước khi gọi prisma, không phải lỗi kết nối').toMatch(/Từ chối reset/);
  }, 120000);

  it('TC-NFR08-02: vitest từ chối chạy khi DATABASE_URL đã export trỏ host không cục bộ', () => {
    const vitest = fileURLToPath(new URL('../../../node_modules/vitest/vitest.mjs', import.meta.url));
    const r = runNode([vitest, 'run', 'tests/csv.test.js'], { DATABASE_URL: DEV_URL });
    expect(r.status, `vitest vẫn chạy với DB dev:\n${r.stdout.slice(-400)}`).not.toBe(0);
    expect(`${r.stdout}\n${r.stderr}`).toMatch(/localhost|DB test/);
  }, 120000);
});
