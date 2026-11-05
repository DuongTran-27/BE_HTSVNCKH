// Chốt chặn NFR08 dùng chung cho reset-test-db.js, db-test.js và vitest.config.js:
// nạp .env.test (không ghi đè biến có sẵn – CI), rồi kiểm MỌI biến URL mà schema.prisma dùng (env("...")).
// Hai lớp: (1) phân tích chuỗi URL ở đây; (2) DB_LEVEL_CHECK_SQL chạy trên chính kết nối Prisma trước khi phá dữ liệu.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const apiDir = fileURLToPath(new URL('..', import.meta.url));
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', '[::1]'];
// Danh sách trắng tham số URL Prisma (BUG-005b): "host" làm Prisma kết nối host khác hostname; tham số lạ cũng từ chối.
const ALLOWED_PARAMS = [
  'schema',
  'connection_limit',
  'connect_timeout',
  'pool_timeout',
  'socket_timeout',
  'sslmode',
  'statement_cache_size',
  'pgbouncer',
  'application_name',
];
// Đúng MỘT đoạn đường dẫn (BUG-005a): Prisma lấy đoạn đầu của "/nckh_dev/x_test" làm tên DB.
const TEST_DB = /^\w+_test$/;

// Tên biến lấy từ schema để url/directUrl/shadowDatabaseUrl thêm sau này cũng bị kiểm.
export const prismaUrlVars = (schema = readFileSync(`${apiDir}prisma/schema.prisma`, 'utf8')) => [
  ...new Set([...schema.matchAll(/env\("(\w+)"\)/g)].map((m) => m[1])),
];

// Trả danh sách lỗi (rỗng = an toàn). URL hợp lệ: host cục bộ, tên DB một đoạn kết thúc "_test", chỉ tham số trong danh sách trắng.
export function checkTestDbEnv(env, vars) {
  const errors = [];
  for (const name of vars) {
    const raw = env[name];
    if (!raw) {
      errors.push(`${name} chưa đặt.`);
      continue;
    }
    let url;
    try {
      url = new URL(raw);
    } catch {
      errors.push(`${name} không phải URL hợp lệ.`);
      continue;
    }
    let db;
    try {
      db = decodeURIComponent(url.pathname.slice(1));
    } catch {
      db = url.pathname.slice(1);
    }
    const badParams = [...url.searchParams.keys()].filter((k) => !ALLOWED_PARAMS.includes(k));
    if (!LOCAL_HOSTS.includes(url.hostname))
      errors.push(`${name} trỏ tới host "${url.hostname}", chỉ cho phép localhost.`);
    else if (!TEST_DB.test(db))
      errors.push(`${name} trỏ tới DB "${db}", tên DB test phải là một tên dạng "<chữ/số/_>_test".`);
    if (badParams.length)
      errors.push(
        `${name} có tham số không được phép: ${badParams.join(', ')} (chỉ nhận ${ALLOWED_PARAMS.join(', ')}).`,
      );
  }
  return errors;
}

// Kiểm ở mức DB thật, trên đúng kết nối sẽ phá dữ liệu – không phụ thuộc cách hiểu URL.
// Địa chỉ server: null (unix socket), loopback, hoặc dải riêng – Docker/CI service container nhận kết nối
// localhost:port qua cầu mạng nên server thấy địa chỉ 172.x; DB dev Supabase là địa chỉ công khai.
export const DB_LEVEL_CHECK_SQL = `DO $$
DECLARE a inet := inet_server_addr();
BEGIN
  IF current_database() !~ '^[A-Za-z0-9_]+_test$' OR NOT (a IS NULL OR a <<= ANY (ARRAY['127.0.0.0/8', '::1/128', '10.0.0.0/8',
      '172.16.0.0/12', '192.168.0.0/16', 'fc00::/7']::inet[])) THEN
    RAISE EXCEPTION 'Từ chối: DB "%" tại "%" không phải DB test cục bộ (NFR08)', current_database(), host(a);
  END IF;
END $$;`;

// Nạp .env.test rồi kiểm; sai thì ném lỗi tiếng Việt (người gọi quyết định thoát).
export function assertTestDbEnv(action) {
  process.loadEnvFile(`${apiDir}.env.test`);
  process.env.DIRECT_URL ??= process.env.DATABASE_URL;
  const errors = checkTestDbEnv(process.env, prismaUrlVars());
  if (errors.length) {
    throw new Error(
      `${action}: chỉ được chạy trên DB test cục bộ (NFR08).\n- ${errors.join('\n- ')}\n` +
        'Bỏ biến đã export trong shell (vd. "unset DATABASE_URL DIRECT_URL") để dùng apps/api/.env.test.',
    );
  }
  return new URL(process.env.DATABASE_URL);
}
