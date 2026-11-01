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

Chốt chặn NFR08: Vitest của `apps/api`, `db:test:up` và `db:test:reset` nạp `apps/api/.env.test` (biến có sẵn, vd. CI, được ưu tiên) rồi **từ chối chạy** nếu bất kỳ URL nào `schema.prisma` dùng (`DATABASE_URL`, `DIRECT_URL`) không trỏ host cục bộ hoặc tên DB không kết thúc `_test`. Gặp lỗi này thì bỏ biến đã export trong shell (`unset DATABASE_URL DIRECT_URL`).

Quy ước test integration (`apps/api`):
- File test chạy **tuần tự** (`fileParallelism: false`) vì mọi file dùng chung `nckh_test`.
- Dọn dữ liệu bằng `resetData(prisma)` trong `apps/api/tests/db.js` (vd. `beforeEach`): `TRUNCATE` mọi bảng `RESTART IDENTITY CASCADE` + `ALTER SEQUENCE topic_code_seq RESTART`. Không dùng `deleteMany` cho `AuditLog`/`StatusHistory` (trigger chỉ-thêm chặn DELETE).

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
