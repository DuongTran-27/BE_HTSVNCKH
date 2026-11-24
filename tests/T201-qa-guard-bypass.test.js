// QA T201 vòng 2 (NFR08, BUG-005): chốt chặn DB test phải kiểm ĐÚNG cái Prisma sẽ kết nối, và mọi đường chạy
// test đều phải qua chốt chặn. Dùng DB nháp "nckh_qa_guard" (tên không kết thúc _test, đóng vai DB dev) trên chính
// server test, có bảng dev_marker 1 dòng; host ngoài dùng *.invalid nên không chạm DB thật nào.
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const apiDir = fileURLToPath(new URL('..', import.meta.url));
const rootDir = apiDir; // sau khi tách repo, gốc repo chính là thư mục backend
const DEV_DB = 'nckh_qa_guard';
const urlFor = (db) => Object.assign(new URL(process.env.DATABASE_URL), { pathname: `/${db}`, search: '' }).toString();

const envWith = (extra) => {
  const env = { ...process.env, NO_COLOR: '1' };
  delete env.DATABASE_URL;
  delete env.DIRECT_URL;
  return { ...env, ...extra };
};
const runNode = (args, extra, cwd = apiDir) =>
  spawnSync(process.execPath, args, { cwd, env: envWith(extra), encoding: 'utf8', timeout: 120000 });

const withDb = async (db, fn) => {
  const c = new PrismaClient({ datasourceUrl: urlFor(db) });
  try { return await fn(c); } finally { await c.$disconnect(); }
};
const markerRows = () => withDb(DEV_DB, async (c) => {
  const [{ t }] = await c.$queryRawUnsafe("SELECT to_regclass('public.dev_marker')::text AS t");
  if (!t) return -1; // bảng đã bị xóa (db push --force-reset)
  const [{ n }] = await c.$queryRawUnsafe('SELECT count(*)::int AS n FROM dev_marker');
  return n;
});

describe('NFR08 – chốt chặn DB test không vượt được (BUG-005)', () => {
  beforeEach(async () => {
    await withDb('postgres', async (c) => {
      await c.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${DEV_DB} WITH (FORCE)`);
      await c.$executeRawUnsafe(`CREATE DATABASE ${DEV_DB}`);
    });
    await withDb(DEV_DB, async (c) => {
      await c.$executeRawUnsafe('CREATE TABLE dev_marker (id int)');
      await c.$executeRawUnsafe('INSERT INTO dev_marker VALUES (1)');
    });
  });
  afterAll(() => withDb('postgres', (c) => c.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${DEV_DB} WITH (FORCE)`)));

  it('TC-NFR08-03: reset không xóa DB dev khi URL có thêm đoạn đường dẫn kết thúc _test (/<db dev>/x_test)', () => {
    // Prisma lấy đoạn đầu của đường dẫn làm tên DB → kết nối nckh_qa_guard, chốt chặn lại thấy "nckh_qa_guard/x_test".
    const bad = urlFor(DEV_DB).replace(`/${DEV_DB}`, `/${DEV_DB}/x_test`);
    const r = runNode(['scripts/reset-test-db.js'], { DATABASE_URL: bad, DIRECT_URL: bad });
    return markerRows().then((n) => {
      expect(n, `DB dev bị reset:\n${r.stdout.slice(-300)}`).toBe(1);
      expect(r.status).not.toBe(0);
    });
  }, 150000);

  it('TC-NFR08-04: reset từ chối URL có tham số ?host= (Prisma kết nối host trong tham số, không phải localhost)', () => {
    const bad = `${urlFor('nckh_test')}?host=db-dev.example.invalid`;
    const r = runNode(['scripts/reset-test-db.js'], { DIRECT_URL: bad });
    expect(r.status).not.toBe(0);
    expect(`${r.stdout}\n${r.stderr}`, 'phải chặn trước khi Prisma kết nối db-dev.example.invalid').toMatch(/Từ chối reset/);
  }, 150000);

  it('TC-NFR08-05: vitest từ chối URL có tham số ?host= (không phải lỗi kết nối của globalSetup)', () => {
    const bad = `${urlFor('nckh_test')}?host=db-dev.example.invalid`;
    const vitest = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url));
    const r = runNode([vitest, 'run', 'tests/csv.test.js'], { DATABASE_URL: bad, DIRECT_URL: bad });
    expect(r.status).not.toBe(0);
    expect(`${r.stdout}\n${r.stderr}`).toMatch(/Từ chối chạy test/);
  }, 150000);

  it('TC-NFR08-06: chạy test integration từ thư mục gốc repo (trước đây là gốc monorepo, nay trùng thư mục backend) không xóa dữ liệu DB dev', () => {
    // Vd. "npx vitest run tests/..." ở gốc: không có chốt chặn ở config → resetData() TRUNCATE DB đang trỏ tới.
    const vitest = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url));
    const r = runNode([vitest, 'run', 'tests/T201-db-helpers.test.js'], { DATABASE_URL: urlFor(DEV_DB) }, rootDir);
    return markerRows().then((n) => {
      expect(n, `dữ liệu DB dev bị xóa khi chạy từ gốc:\n${r.stdout.slice(-300)}`).toBe(1);
    });
  }, 150000);
});
