# TASK-DC-02 – Hồ sơ cá nhân: migration `dc_profile`, `/api/me/profile`, `phone` ở `GET /api/users/:id`
- Agent: backend-dev · Trạng thái: REVIEW · Ngày: 2026-11-18
- FR/NFR: FR30, FR25, FR15 · Đã đọc: DAC_TA mục 9, `design/API_GD7.md` §2.1, §10.1, §11, TASK-DC-01

## Đã làm
- Migration `20261118000100_dc_profile`: `ALTER TABLE "User" ADD COLUMN "phone" TEXT` (nullable); `schema.prisma` thêm `User.phone`. RLS: `User` đã bật RLS từ migration `search_and_security` (bật động cho mọi bảng public), cột mới không cần policy.
- `packages/shared/src/users.js`: `PHONE_REGEX`, `profileUpdateSchema` (strictObject, `phone` bắt buộc, `string|null`; bỏ khoảng trắng/dấu chấm/gạch, rỗng/null = xóa → `null`; lỗi "Số điện thoại không hợp lệ").
- `GET/PATCH /api/me/profile` (module accounts, mount trước `/api/me` của topics): mọi vai trò kể cả ADMIN, chỉ hồ sơ của người gọi (không nhận id). PATCH limiter 10/15 phút/user. Ghi `phone` + AuditLog `PROFILE_UPDATE` (`before/after: { phone }`) cùng một transaction, khóa dòng `FOR NO KEY UPDATE`.
- `GET /api/users/:id` thêm `phone` (quyền cũ: ADMIN/STAFF trong phạm vi). `userView` (danh sách/tạo/sửa) không đổi → không lộ `phone`; không đụng `TopicDetail.members`, CSV, Excel.
- OpenAPI: thêm 2 route (test T701 đối chiếu route ↔ tài liệu xanh).

## File thay đổi
`apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20261118000100_dc_profile/migration.sql`, `apps/api/src/modules/accounts/{prismaRepo,service,routes}.js`, `apps/api/src/app.js`, `apps/api/src/openapi/spec.js`, `packages/shared/src/users.js`, `packages/shared/src/users.test.js` (+14 ca), `apps/api/tests/DC02-profile.test.js` (mới, 18 ca), `docs/agents/BANG_CONG_VIEC.md` (DC-02 → REVIEW).

## Điều kiện đạt ↔ test
| Điều kiện (GD7 §10.1) | Test | Kết quả |
|---|---|---|
| GET trả đủ trường, faculty/class null khi không có; mọi vai trò kể cả ADMIN; 401 | DC02 "GET /api/me/profile" (6 ca) | Đạt |
| Chuẩn hóa số, lưu DB, AuditLog before/after | DC02 "chuẩn hóa, lưu…", "null xóa số" | Đạt |
| Số sai → 400 tiếng Việt, DB và audit không đổi | DC02 "số sai…"; users.test "từ chối …" (6) | Đạt |
| Strict: trường khác (role/fullName/email), body rỗng → 400, không đổi dữ liệu | DC02 strict (4 ca); users.test | Đạt |
| Limiter 10/15 phút/user → 429 | DC02 "giới hạn…" | Đạt |
| ADMIN tự sửa hồ sơ mình | DC02 "ADMIN tự sửa…" | Đạt |
| `phone` ở `GET /api/users/:id` cho ADMIN/STAFF trong phạm vi; không ở danh sách | DC02 "GET /api/users/:id có phone" | Đạt |
| 403 vai trò/phạm vi sai (SV, GV, STAFF ngoài khoa) | DC02 "STAFF ngoài phạm vi 403; SV/GV 403" | Đạt |

## Bằng chứng chạy lệnh
```
$ npm run db:test:up        -> DB test đã chạy.
$ npm run db:test:reset     -> áp đủ migration (gồm dc_profile); "Đã reset DB test (migrate reset)."
  (prisma generate: EPERM rename query_engine-windows.dll.node do dev server giữ DLL; JS client vẫn sinh, có `phone`)
$ npx vitest run tests/DC02-profile.test.js   -> Tests 18 passed (18)
$ npm run lint
> eslint . --max-warnings 0     (không lỗi, không cảnh báo)
$ npm test
 Test Files  7 passed (7)    Tests  91 passed (91)     [shared]
 Test Files  73 passed (73)  Tests  996 passed (996)   [api]
 Test Files  32 passed (32)  Tests  245 passed (245)   [web]
exit=0
```
Tổng 1332/1332 đạt.

## Còn lại / rủi ro
- `prisma generate` EPERM trên máy này (tắt dev server rồi chạy lại để thay engine; engine cùng phiên bản nên không bắt buộc).
- E2E chưa chạy. UI là DC-12.
- AuditLog `actorId` = chính người dùng (tự sửa), `entityType: 'User'`.

## Câu hỏi cho reviewer
1. Mount `/api/me/profile` nằm trong nhánh `if (accountRepo)` (không cần `topicRepo`) – chủ ý, vì hồ sơ thuộc module tài khoản.
2. Thiết kế không nêu thông báo cho `phone` thiếu/sai kiểu (số, object): dùng cùng thông điệp "Số điện thoại không hợp lệ".
