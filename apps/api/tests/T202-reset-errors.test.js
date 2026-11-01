// T202 (MINOR 1 reviews/T201-kiem-thu-v3.md): DB test không chạy (P1001) phải hướng dẫn "db:test:up",
// không được báo nhầm là bị chốt chặn NFR08 từ chối.
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const apiDir = fileURLToPath(new URL('..', import.meta.url));

describe('db:test:reset – lỗi kết nối tách khỏi từ chối', () => {
  it('cổng không có server → hướng dẫn db:test:up, thoát ≠0', () => {
    // URL hợp lệ với chốt chặn chuỗi (localhost, *_test) nhưng cổng 1 không có Postgres.
    const url = Object.assign(new URL(process.env.DATABASE_URL), { port: '1', search: '' }).toString();
    const r = spawnSync(process.execPath, ['scripts/reset-test-db.js'], {
      cwd: apiDir,
      encoding: 'utf8',
      timeout: 120000,
      env: { ...process.env, NO_COLOR: '1', DATABASE_URL: url, DIRECT_URL: url },
    });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/P1001/);
    expect(r.stderr).toMatch(/Không kết nối được DB test.*npm run db:test:up/);
    expect(r.stderr).not.toMatch(/Từ chối reset/);
  }, 150000);
});
