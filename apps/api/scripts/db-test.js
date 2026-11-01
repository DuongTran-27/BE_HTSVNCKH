// Bật/tắt Postgres cho test (NFR08) theo docs/agents/design/QD_DB_TEST.md.
// Dùng: node apps/api/scripts/db-test.js up|down   (npm run db:test:up / db:test:down)
// Trình: DB_TEST_DRIVER=docker|embedded|external; không đặt → `docker info` thoát 0 thì docker, ngược lại embedded.
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertTestDbEnv } from './test-db-guard.js';

export const DRIVERS = ['docker', 'embedded', 'external'];
export const DATA_DIR = path.join(os.tmpdir(), 'nckh-db-test');
const apiDir = fileURLToPath(new URL('..', import.meta.url));
const composeFile = path.resolve(apiDir, '../../docker-compose.test.yml');

// probeDocker trả kết quả kiểu spawnSync; timeout/ENOENT có `error`, status null.
export function pickDriver(forced, probeDocker) {
  if (forced) {
    if (!DRIVERS.includes(forced)) throw new Error(`DB_TEST_DRIVER="${forced}" không hợp lệ, chỉ nhận: ${DRIVERS.join(', ')}.`);
    return forced;
  }
  const r = probeDocker();
  return !r.error && r.status === 0 ? 'docker' : 'embedded';
}

const one = (rows) => rows[0]?.v;
const exts = (rows) => rows.map((r) => r.extname).join(',') === 'pg_trgm,unaccent';
const extText = (rows) => rows.map((r) => `${r.extname} ${r.extversion}`).join(', ') || '(không có)';
// judge(rows) → [đạt?, giá trị in ra]. Bảng K1–K7 ở QĐ §4.4.
export const CHECKS = [
  { id: 'K1', label: 'server_version_num', db: 'nckh_test', sql: "SELECT current_setting('server_version_num')::int AS v",
    judge: (r) => [Number(one(r)) >= 160000 && Number(one(r)) < 170000, one(r)] },
  { id: 'K2', label: 'TimeZone', db: 'nckh_test', sql: "SELECT current_setting('TimeZone') AS v",
    judge: (r) => [one(r) === 'Asia/Ho_Chi_Minh', one(r)] },
  { id: 'K3', label: 'server_encoding', db: 'nckh_test', sql: "SELECT current_setting('server_encoding') AS v",
    judge: (r) => [one(r) === 'UTF8', one(r)] },
  ...['nckh_test', 'template1'].map((db) => ({ id: 'K4', label: `extension ${db}`, db,
    sql: "SELECT extname::text AS extname, extversion FROM pg_extension WHERE extname IN ('pg_trgm','unaccent') ORDER BY 1",
    judge: (r) => [exts(r), extText(r)] })),
  { id: 'K5', label: "unaccent('Đề tài Nghiên cứu')", db: 'nckh_test', sql: "SELECT unaccent('Đề tài Nghiên cứu') AS v",
    judge: (r) => [one(r) === 'De tai Nghien cuu', one(r)] },
  { id: 'K6', label: 'similarity', db: 'nckh_test', sql: "SELECT similarity(lower(unaccent('ĐỀ TÀI Quản lý')), 'de tai quan ly') AS v",
    judge: (r) => [Number(one(r)) === 1, one(r)] },
  { id: 'K7', label: 'locale (chỉ ghi nhận)', db: 'nckh_test',
    sql: "SELECT datcollate, datctype, lower('ĐỀ') AS low FROM pg_database WHERE datname = current_database()",
    judge: (r) => [r.length === 1, r[0] ? `datcollate=${r[0].datcollate} datctype=${r[0].datctype} lower('ĐỀ')=${r[0].low}` : '(rỗng)'] },
];

const loadUrl = () => assertTestDbEnv('db-test'); // chung chốt chặn NFR08 với reset/vitest
export const urlFor = (url, db) => Object.assign(new URL(url), { pathname: `/${db}` }).toString();

async function withClient(url, db, fn) {
  const { PrismaClient } = await import('@prisma/client');
  let client;
  try { client = new PrismaClient({ datasourceUrl: urlFor(url, db) }); }
  catch (e) {
    if (String(e.message).includes('did not initialize yet')) throw new Error('Prisma client chưa generate. Chạy: npx -w @nckh/api prisma generate');
    throw e;
  }
  try { return await fn(client); } finally { await client.$disconnect(); }
}

// QĐ §4.2 bước 6: mỗi lệnh SQL một lần gọi; CREATE DATABASE ngoài transaction.
async function provision(url) {
  const ext = async (c) => {
    await c.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS pg_trgm');
    await c.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS unaccent');
  };
  await withClient(url, 'template1', async (c) => {
    await ext(c);
    const found = await c.$queryRawUnsafe("SELECT 1 FROM pg_database WHERE datname = 'nckh_test'");
    if (found.length === 0) await c.$executeRawUnsafe('CREATE DATABASE nckh_test');
  });
  await withClient(url, 'nckh_test', ext);
}

// In bảng K1–K7; trả true nếu tất cả OK. Lỗi SQL/kết nối = SAI, không nuốt.
async function verify(url) {
  let ok = true;
  for (const db of ['nckh_test', 'template1']) {
    await withClient(url, db, async (c) => {
      for (const k of CHECKS.filter((x) => x.db === db)) {
        let pass, shown;
        try { [pass, shown] = k.judge(await c.$queryRawUnsafe(k.sql)); }
        catch (e) { pass = false; shown = `lỗi: ${e.message.split('\n').filter(Boolean).pop()}`; }
        ok &&= pass;
        console.log(`${k.id} ${k.label} = ${shown} ${pass ? 'OK' : 'SAI'}`);
      }
    }).catch((e) => { console.log(`Kiểm tra DB test: lỗi kết nối ${db}.`); throw e; });
  }
  console.log(ok ? 'Kiểm tra DB test: tất cả OK.' : 'Kiểm tra DB test: có mục SAI.');
  return ok;
}

const portOpen = (port) => new Promise((resolve) => {
  const s = net.connect({ host: 'localhost', port }, () => { s.destroy(); resolve(true); });
  s.on('error', () => resolve(false));
  s.setTimeout(2000, () => { s.destroy(); resolve(false); });
});

async function binaries() {
  const plat = process.platform === 'win32' ? 'windows' : process.platform;
  return import(`@embedded-postgres/${plat}-${process.arch}`);
}
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { stdio: 'ignore', ...opts });
const hint = `Gỡ: chạy lại "npm run db:test:up" (tự xóa thư mục) hoặc xóa tay "${DATA_DIR}".`;

async function upEmbedded(url) {
  const { initdb, pg_ctl } = await binaries();
  const pwFile = path.join(os.tmpdir(), `nckh-db-test-pw-${process.pid}`);
  let locale;
  try {
    writeFileSync(pwFile, decodeURIComponent(url.password));
    for (const l of ['en-US', 'C']) {
      rmSync(DATA_DIR, { recursive: true, force: true, maxRetries: 5 });
      const r = run(initdb, ['-D', DATA_DIR, '--encoding=UTF8', `--locale=${l}`, `--username=${decodeURIComponent(url.username)}`,
        '--auth=scram-sha-256', `--pwfile=${pwFile}`], { stdio: ['ignore', 'ignore', 'pipe'] });
      if (r.status === 0) { locale = l; break; }
      console.error(`initdb lỗi với --locale=${l}: ${String(r.stderr ?? r.error ?? '').trim()}`);
    }
  } finally { rmSync(pwFile, { force: true }); }
  if (!locale) throw new Error(`initdb thất bại. ${hint}`);
  if (locale === 'C') console.warn('CẢNH BÁO: dùng --locale=C, khác CI ở sắp xếp/hoa thường chữ có dấu (QĐ §4.3).');
  console.log(`initdb xong (UTF8, locale ${locale}) tại ${DATA_DIR}`);
  // -l và stdio 'ignore' bắt buộc: thiếu thì postgres giữ handle của Node và lệnh treo (QĐ §4.2 bước 5).
  const log = path.join(DATA_DIR, 'server.log');
  const r = run(pg_ctl, ['start', '-w', '-D', DATA_DIR, '-l', log,
    '-o', `-p ${url.port || 5432} -c listen_addresses=localhost -c timezone=Asia/Ho_Chi_Minh`]);
  if (r.status !== 0) throw new Error(`pg_ctl start thất bại (mã ${r.status}). Xem log: ${log}`);
}

async function stopEmbedded() {
  if (!existsSync(DATA_DIR)) { console.log('Embedded: không có DATA_DIR, bỏ qua.'); return; }
  const { pg_ctl } = await binaries();
  const st = run(pg_ctl, ['status', '-D', DATA_DIR]).status;
  if (st === 0) {
    const r = run(pg_ctl, ['stop', '-w', '-m', 'fast', '-D', DATA_DIR]);
    if (r.status !== 0) throw new Error(`pg_ctl stop thất bại (mã ${r.status}); giữ nguyên ${DATA_DIR}.`);
    console.log('Embedded: đã dừng server.');
  } else if (st !== 3) {
    throw new Error(`pg_ctl status trả mã ${st}: "${DATA_DIR}" không phải data dir hợp lệ (initdb lỗi giữa chừng?). ${hint}`);
  }
  rmSync(DATA_DIR, { recursive: true, force: true, maxRetries: 5 });
  console.log(`Embedded: đã xóa ${DATA_DIR}.`);
}

const dockerInfo = () => spawnSync('docker', ['info'], { timeout: 10000, stdio: 'ignore' });
const compose = (...args) => {
  const r = spawnSync('docker', ['compose', '-f', composeFile, ...args], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`docker compose ${args.join(' ')} thất bại (mã ${r.status ?? r.error?.code}).`);
};

async function up() {
  const url = loadUrl();
  const driver = pickDriver(process.env.DB_TEST_DRIVER, dockerInfo);
  const port = Number(url.port || 5432);
  console.log(`DB test: ${driver === 'embedded' ? 'embedded-postgres 16.14' : driver} tại localhost:${port}`);
  if (driver === 'embedded' && await portOpen(port)) {
    if (!(await verify(url))) throw new Error(`Cổng ${port} đang bận nhưng kiểm tra không qua; không xóa gì.`);
    console.log('DB test đã chạy.');
    return;
  }
  if (driver === 'docker') compose('up', '-d', '--wait');
  if (driver === 'embedded') await upEmbedded(url);
  await provision(url) // idempotent; với docker init.sql đã làm, chạy lại vô hại
    .catch((e) => { console.log('Kiểm tra DB test: lỗi kết nối (bước tạo extension/DB).'); throw e; });
  if (!(await verify(url))) throw new Error('DB test không đạt kiểm tra K1–K7.');
}

async function down() {
  const forced = process.env.DB_TEST_DRIVER;
  if (forced) pickDriver(forced); // chỉ để kiểm giá trị hợp lệ
  if (forced === 'external') return console.log('external: không có gì để dừng.');
  if (forced === 'docker') return compose('down');
  if (forced === 'embedded') return stopEmbedded();
  // Không ép: dừng theo trạng thái thật (QĐ §4.2 bước 7).
  const embedded = existsSync(DATA_DIR);
  if (embedded) await stopEmbedded();
  const docker = dockerInfo().status === 0;
  if (docker) compose('down');
  if (!embedded && !docker) console.log('Không có DB test nào đang chạy (không có DATA_DIR, Docker không chạy).');
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const cmd = process.argv[2];
  const actions = { up, down };
  if (!actions[cmd]) { console.error('Dùng: node apps/api/scripts/db-test.js up|down'); process.exit(2); }
  actions[cmd]().catch((e) => { console.error(`db-test ${cmd} lỗi: ${e.message}`); process.exitCode = 1; });
}
