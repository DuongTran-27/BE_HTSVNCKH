# Hệ thống quản lý NCKH sinh viên – Khoa CNTT

Monorepo gồm:

| Thư mục | Nội dung |
|---|---|
| `packages/shared` | Enum, bảng chuyển trạng thái, schema Zod dùng chung frontend + backend |
| `apps/api` | Backend Node.js + Express 5 + Prisma (PostgreSQL/Supabase) |
| `apps/web` | Frontend React + Vite (Giai đoạn 3) |
| `docs/` | Lộ trình triển khai |

## Chạy thử

```bash
npm install
npm test                  # chạy toàn bộ test – cần DB test đang chạy (mục "Database test" bên dưới)
```

## Database test

DB test tách khỏi DB dev: Postgres 16 ở `localhost:54329`, DB `nckh_test`, có sẵn `pg_trgm`, `unaccent`, `TimeZone=Asia/Ho_Chi_Minh`;
chuỗi kết nối nằm trong `apps/api/.env.test` (chỉ trỏ localhost, được commit). Dữ liệu dùng một lần, mất khi `down`.

```bash
npx -w @nckh/api prisma generate   # lần đầu sau khi clone / npm ci (db-test.js dùng @prisma/client)
npm run db:test:up        # bật DB + in bảng kiểm tra K1–K7; gọi lại khi đang chạy → "DB test đã chạy."
npm run db:test:reset     # xóa sạch và dựng lại schema (+ after_init.sql); chỉ chạy với DB *_test ở localhost
npm test
npm run db:test:down
```

`db:test:up` chọn trình theo biến `DB_TEST_DRIVER` (quyết định: `docs/agents/design/QD_DB_TEST.md`):

| Giá trị | Trình |
|---|---|
| (không đặt) | `docker info` chạy được → `docker`, ngược lại → `embedded` |
| `docker` | `docker compose -f docker-compose.test.yml up -d --wait` |
| `embedded` | gói `embedded-postgres` 16.14 (không cần Docker/admin), dữ liệu ở `%TEMP%\nckh-db-test` (ngoài repo) |
| `external` | Postgres tự chạy sẵn ở cổng 54329 (CI, hoặc bản cài tay); chỉ tạo extension/DB và kiểm tra |

Đã chọn trình thì lỗi ở trình đó là lỗi (không tự chuyển trình khác). `npm test` không tự bỏ qua test DB: chưa bật DB thì `globalSetup` của `apps/api` thử kết nối một lần và dừng ngay kèm hướng dẫn.

Chốt chặn NFR08 (`apps/api/scripts/test-db-guard.js`), hai lớp:
1. **Chuỗi URL** – Vitest của `apps/api`, `db:test:up` và `db:test:reset` nạp `apps/api/.env.test` (biến có sẵn, vd. CI, được ưu tiên) rồi **từ chối chạy** nếu bất kỳ URL nào `schema.prisma` dùng (`DATABASE_URL`, `DIRECT_URL`) có: host không phải `localhost`/`127.0.0.1`/`::1`; tên DB không phải **đúng một đoạn** dạng `<chữ/số/_>_test` (`/nckh_dev/x_test` bị chặn); tham số ngoài danh sách trắng (`schema`, `connection_limit`, `connect_timeout`, `pool_timeout`, `socket_timeout`, `sslmode`, `statement_cache_size`, `pgbouncer`, `application_name` – `?host=` bị chặn).
2. **Mức DB** – trên chính kết nối sẽ ghi/xóa (`db:test:reset`, `globalSetup`, `resetData`): `current_database()` phải dạng `*_test` và địa chỉ server là loopback hoặc dải riêng (10.x, 172.16–31.x, 192.168.x – Docker/CI service container hiện ra 172.x).

Gặp lỗi "Từ chối …" thì bỏ biến đã export trong shell (`unset DATABASE_URL DIRECT_URL`). `db:test:reset` báo "Không kết nối được DB test" (P1001) nghĩa là DB chưa bật: chạy `npm run db:test:up`.

> **Workspace mới phải có `vitest.config.js` (hoặc `vite.config.js` có `test`) riêng** – kể cả rỗng như `packages/shared/vitest.config.js`. Nếu không, `vitest run` trong workspace đó đi ngược lên nhặt `vitest.config.js` gốc (`projects`) và chạy test của **mọi** workspace.

Quy ước test integration (`apps/api`):
- File test chạy **tuần tự** (`fileParallelism: false`) vì mọi file dùng chung `nckh_test`.
- Dọn dữ liệu bằng `resetData(prisma)` trong `apps/api/tests/db.js` (vd. `beforeEach`): `TRUNCATE` mọi bảng `RESTART IDENTITY CASCADE` + `ALTER SEQUENCE topic_code_seq RESTART`. Không dùng `deleteMany` cho `AuditLog`/`StatusHistory` (trigger chỉ-thêm chặn DELETE).

## Lint, định dạng, độ phủ, CI

Cần Node `>=22.22.0` (react-router 8.4). Cài bằng `npm ci` (không dùng `--omit=optional`: vite 8 cần binding rolldown/lightningcss).

```bash
npm run lint              # ESLint flat config (eslint.config.js)
npm run format:check      # Prettier – chỉ các file cấu hình T202; CI kiểm thêm mọi file mới của PR
npm run test:coverage     # cần DB test; độ phủ apps/api/src/modules + packages/shared/src → coverage/
```

Prettier chưa áp cho code cũ (định dạng hàng loạt sẽ tạo diff khổng lồ); file **mới** phải qua Prettier (`npx prettier --write <file>`).
CI (`.github/workflows/ci.yml`) chạy mỗi PR: lint + format + build web (Node 24); test trên Postgres 16 service container, ma trận Node 22.22 và 24
(`DB_TEST_DRIVER=external` → `db:test:up` → `db:test:reset` → `npm test`), bảng độ phủ ở Job Summary và artifact `coverage`.

## Kết nối Supabase

1. Tạo project Supabase, bật extension `pg_trgm` và `unaccent` (Database > Extensions).
2. Sao chép `apps/api/.env.example` thành `apps/api/.env`, điền chuỗi kết nối.
3. Tạo bảng:
   ```bash
   cd apps/api
   npx prisma migrate dev --name init
   npx prisma migrate dev --create-only --name search_and_security
   # dán nội dung prisma/sql/after_init.sql vào migration vừa tạo, rồi:
   npx prisma migrate dev
   ```
4. `npm run dev -w @nckh/api` → http://localhost:4000/api/health

## Trạng thái hiện tại

Xem `docs/LO_TRINH.md`.
