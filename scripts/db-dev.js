// Postgres DEV cục bộ bằng embedded-postgres (không cần Docker): localhost:54330, DB nckh_dev, dữ liệu giữ lại giữa các lần chạy.
// Dùng: node scripts/db-dev.js up|down   (npm run db:dev:up / db:dev:down). Tách hẳn DB test (54329, bị xóa khi test).
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = 54330;
const DATA_DIR = path.join(os.homedir(), '.nckh-db-dev');
const url = (db) => `postgresql://postgres:postgres@localhost:${PORT}/${db}`;
const run = (cmd, args) => spawnSync(cmd, args, { stdio: 'ignore' });

const portOpen = () =>
  new Promise((resolve) => {
    const s = net.connect({ host: 'localhost', port: PORT }, () => {
      s.destroy();
      resolve(true);
    });
    s.on('error', () => resolve(false));
  });

const binaries = () =>
  import(`@embedded-postgres/${process.platform === 'win32' ? 'windows' : process.platform}-${process.arch}`);

async function withClient(db, fn) {
  const { PrismaClient } = await import('@prisma/client');
  const c = new PrismaClient({ datasourceUrl: url(db) });
  try {
    return await fn(c);
  } finally {
    await c.$disconnect();
  }
}

async function up() {
  if (await portOpen()) return console.log(`DB dev đã chạy tại localhost:${PORT}.`);
  const { initdb, pg_ctl } = await binaries();
  if (!existsSync(path.join(DATA_DIR, 'PG_VERSION'))) {
    const pw = path.join(os.tmpdir(), `nckh-db-dev-pw-${process.pid}`);
    writeFileSync(pw, 'postgres');
    const r = run(initdb, [
      '-D',
      DATA_DIR,
      '--encoding=UTF8',
      '--locale=C',
      '--username=postgres',
      '--auth=scram-sha-256',
      `--pwfile=${pw}`,
    ]);
    rmSync(pw, { force: true });
    if (r.status !== 0) throw new Error(`initdb thất bại (mã ${r.status}). Xóa "${DATA_DIR}" rồi chạy lại.`);
  }
  // -l và stdio 'ignore' bắt buộc, thiếu thì lệnh treo (QD_DB_TEST §4.2 bước 5)
  const r = run(pg_ctl, [
    'start',
    '-w',
    '-D',
    DATA_DIR,
    '-l',
    path.join(DATA_DIR, 'server.log'),
    '-o',
    `-p ${PORT} -c listen_addresses=localhost -c timezone=Asia/Ho_Chi_Minh`,
  ]);
  if (r.status !== 0)
    throw new Error(`pg_ctl start thất bại (mã ${r.status}). Xem ${path.join(DATA_DIR, 'server.log')}`);
  await withClient('postgres', async (c) => {
    if ((await c.$queryRawUnsafe("SELECT 1 FROM pg_database WHERE datname = 'nckh_dev'")).length === 0) {
      await c.$executeRawUnsafe('CREATE DATABASE nckh_dev');
    }
    await c.$executeRawUnsafe("ALTER DATABASE nckh_dev SET nckh.seed_allowed = 'on'"); // DB dev cục bộ: cho phép seed
  });
  await withClient('nckh_dev', async (c) => {
    await c.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS pg_trgm');
    await c.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS unaccent');
  });
  console.log(`DB dev chạy tại ${url('nckh_dev')} (dữ liệu: ${DATA_DIR}).`);
}

async function down() {
  if (!existsSync(DATA_DIR)) return console.log('Chưa có DB dev.');
  const { pg_ctl } = await binaries();
  if (run(pg_ctl, ['status', '-D', DATA_DIR]).status !== 0) return console.log('DB dev không chạy.');
  const r = run(pg_ctl, ['stop', '-w', '-m', 'fast', '-D', DATA_DIR]);
  if (r.status !== 0) throw new Error(`pg_ctl stop thất bại (mã ${r.status}).`);
  console.log('Đã dừng DB dev (dữ liệu vẫn giữ).');
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const actions = { up, down };
  const cmd = process.argv[2];
  if (!actions[cmd]) {
    console.error('Dùng: node scripts/db-dev.js up|down');
    process.exit(2);
  }
  actions[cmd]().catch((e) => {
    console.error(`db-dev ${cmd} lỗi: ${e.message}`);
    process.exitCode = 1;
  });
}
