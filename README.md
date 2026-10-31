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
npm test                  # chạy toàn bộ test (không cần database)
```

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
