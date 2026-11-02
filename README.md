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

## Chạy cục bộ (DB dev, không cần Docker)

```bash
npx -w @nckh/api prisma generate
npm run db:dev:up         # embedded-postgres localhost:54330, DB nckh_dev, dữ liệu ở ~/.nckh-db-dev (giữ lại giữa các lần)
```
Tạo `apps/api/.env` (không commit) với `DATABASE_URL` và `DIRECT_URL` = `postgresql://postgres:postgres@localhost:54330/nckh_dev`,
`JWT_ACCESS_SECRET` ≥ 32 ký tự ngẫu nhiên, `CORS_ORIGIN=http://localhost:5173`. Rồi:
```bash
cd apps/api && npx prisma migrate deploy && npx prisma db seed && cd ../..
npm run dev:api           # http://localhost:4000/api/health (tự nạp apps/api/.env)
npm run dev:web           # http://localhost:5173 (proxy /api → 4000)
npm run db:dev:down       # dừng DB dev
```

## Database test

DB test tách khỏi DB dev: Postgres 16 ở `localhost:54329`, DB `nckh_test`, có sẵn `pg_trgm`, `unaccent`, `TimeZone=Asia/Ho_Chi_Minh`;
chuỗi kết nối nằm trong `apps/api/.env.test` (chỉ trỏ localhost, được commit). Dữ liệu dùng một lần, mất khi `down`.

```bash
npx -w @nckh/api prisma generate   # lần đầu sau khi clone / npm ci (db-test.js dùng @prisma/client)
npm run db:test:up        # bật DB + in bảng kiểm tra K1–K7; gọi lại khi đang chạy → "DB test đã chạy."
npm run db:test:reset     # xóa sạch và áp lại mọi migration (prisma migrate reset); chỉ chạy với DB *_test ở localhost
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
- Mọi file test chèn dữ liệu phải gọi `resetData(prisma)` (`apps/api/tests/db.js`) ở `beforeAll` **trước** lần chèn đầu tiên (thêm `beforeEach` nếu cần): `TRUNCATE` mọi bảng `RESTART IDENTITY CASCADE` + `ALTER SEQUENCE topic_code_seq RESTART`; hàm này tự kiểm DB `*_test` trước khi xóa. Không dùng `deleteMany` cho `AuditLog`, `StatusHistory`, `Submission`, `ReviewDecision`, `SimilarityCheck` (trigger chỉ-thêm chặn UPDATE/DELETE).

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
   npx prisma migrate deploy   # áp prisma/migrations (init + search_and_security = prisma/sql/after_init.sql)
   ```
   Tạo quản trị viên đầu tiên trên production **chưa có cách an toàn** (chưa có task; không dùng seed cho việc này).
   - Đổi schema: `npx prisma migrate dev --create-only --name <tên>`, đọc `migration.sql` trước khi áp. **Migration tự sinh có `DROP INDEX`/`DROP TRIGGER` cho các đối tượng trong `after_init.sql` (`topic_title_trgm_idx`, 5 partial unique index, 5 trigger chỉ-thêm) → xóa dòng đó trước khi commit.** (Prisma 5.22 đã thử ở T203: không sinh, nhưng phiên bản sau có thể khác; `tests/T203-schema.test.js` đỏ nếu đối tượng nào bị xóa.)
   - Bảng mới: migration phải có `ALTER TABLE "<Bảng>" ENABLE ROW LEVEL SECURITY;` (NFR03 – chặn Data API Supabase); `tests/T203-schema.test.js` đỏ nếu bảng nào trong schema `public` chưa bật RLS.
   - Index/trigger SQL thô mới: viết vào migration mới tạo bằng `--create-only`, thêm vào danh sách kiểm trong `tests/T203-schema.test.js`.
4. `npm run dev -w @nckh/api` → http://localhost:4000/api/health

## Dữ liệu mẫu (chỉ DB dev/demo)

**Không bao giờ chạy trên production.** Mọi tài khoản mẫu, kể cả quản trị `QT001`, dùng chung mật khẩu công khai dưới đây;
`mustChangePassword` không bảo vệ được: ai đăng nhập trước sẽ tự đặt mật khẩu và chiếm tài khoản.
Lỡ chạy trên DB không phải dev/demo: xóa toàn bộ tài khoản mẫu (email `@nckh.example`) và dữ liệu mẫu ngay.

Seed chỉ chạy trên database đã được **bật cờ cho phép dữ liệu mẫu** (gắn với chính DB đích, nên URL trỏ nhầm sang
production vẫn bị từ chối – production không có cờ). Bật một lần trên DB dev/demo, **không bao giờ chạy lệnh này trên production**:
```sql
ALTER DATABASE postgres SET nckh.seed_allowed = 'on';   -- Supabase: SQL Editor của project demo; DB cục bộ: thay "postgres" bằng tên DB dev
```
```bash
cd apps/api
npx prisma db seed
```
Seed in database/host đích, rồi từ chối nếu `NODE_ENV=production`, nếu DB chưa bật cờ (DB test cục bộ `*_test` được miễn,
cùng chốt NFR08 của test), hoặc nếu DB đã có người dùng (nạp lại: `prisma migrate reset` trên DB dev).
Nội dung: khoa CNTT, 3 ngành, 6 lĩnh vực, một đợt luôn đang mở đăng ký (mốc tính từ lúc chạy seed: mở từ 60 ngày trước,
đóng sau 90 ngày), từ điển đồng nghĩa, 30 đề tài (3 mỗi trạng thái, kết quả FR06 chạy thuật toán thật).
Tài khoản `QT001` (quản trị), `CB001–CB002` (cán bộ), `GV001–GV008`, `SV22001–SV22040`; email `<mã viết thường>@nckh.example`;
mật khẩu chung `Nckh@2026-dev`, phải đổi ở lần đăng nhập đầu.

## Trạng thái hiện tại

Xem `docs/LO_TRINH.md`.
