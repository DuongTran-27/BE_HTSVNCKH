# Review BUG-005 – kiem-thu – vòng 1
Kết luận: APPROVED

## Tôi đã tự kiểm tra
Đã đọc: dòng BUG-005 trong `BANG_CONG_VIEC.md`, `reports/BUG-005.md`, `reports/T201.md` "Vòng sửa 3"; `apps/api/scripts/test-db-guard.js`, `reset-test-db.js`, `tests/db.js`, `tests/global-setup.js`, `vitest.config.js` (gốc, `apps/api`, `packages/shared`). Test QA `T201-qa-guard-bypass.test.js` (mtime 18:58:39) và `T201-qa-isolation.test.js` (18:44:23) không bị sửa.
```
$ npm run db:test:up → OK; npm run db:test:reset → exit=0
$ npx vitest run tests/T201-qa-guard-bypass.test.js tests/T201-qa-isolation.test.js --reporter=verbose
  → ✓ TC-NFR08-03 (a) ✓ TC-NFR08-04 (b reset) ✓ TC-NFR08-05 (b vitest) ✓ TC-NFR08-06 (c) ✓ TC-NFR08-01 ✓ TC-NFR08-02
$ NO_COLOR=1 npm test (gốc, 2 lần) → 21/21, 123/123, 32/32, exit=0 cả 2 lần
$ (gốc) DATABASE_URL=…localhost:54329/nckh_dev_qa npx vitest run           → "Từ chối chạy test", exit=1, dev_marker còn 1
$ (gốc) DATABASE_URL=…/nckh_dev_qa npx vitest run --project @nckh/api …     → "Từ chối chạy test", exit=1
$ (apps/api) DATABASE_URL=…/nckh_dev_qa npx vitest run --config <rỗng> --root . tests/T201-db-helpers.test.js
  → "Từ chối dọn dữ liệu: … DB "nckh_dev_qa" tại "::1" không phải DB test cục bộ (NFR08)", dev_marker còn 1
$ checkTestDbEnv: ?%68ost=, ?HOST=, /nckh_test%3Fhost=x, nhiều host → đều bị chặn
$ npm run db:test:down → đã dừng, tasklist postgres = 0
```
Chi tiết kịch bản S1–S9: `reviews/T201-kiem-thu-v3.md`.

## Đối chiếu đặc tả
| Điều kiện đạt | Đạt? | Ghi chú |
|---|---|---|
| (a) `/<db dev>/x_test` không reset DB dev | Đạt | Tên DB một đoạn `^\w+_test$`; TC-NFR08-03 xanh, `dev_marker` còn |
| (b) `?host=` bị từ chối ở reset và vitest | Đạt | Danh sách trắng tham số (chặt hơn đề xuất); TC-NFR08-04/05 xanh, khớp `/Từ chối/` |
| (c) chạy vitest từ gốc repo không đụng DB dev | Đạt | `projects` gốc + lớp mức DB ở `resetData`/`globalSetup`; TC-NFR08-06 xanh |
| Lớp mức DB trên chính kết nối phá dữ liệu | Đạt | `DB_LEVEL_CHECK_SQL` ở reset (qua `prisma db execute --url`, cùng engine với `db push`), `globalSetup`, `resetData`; đã thử bỏ qua lớp chuỗi – vẫn chặn |
| Thông báo tiếng Việt, exit ≠ 0 | Đạt | |

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| 1 | MINOR | `apps/api/scripts/reset-test-db.js:26-28` | Lỗi kết nối (DB tắt) bị báo là "Từ chối reset … không trỏ DB test cục bộ ở mức DB" – sai nghĩa, thiếu hướng dẫn `db:test:up` | Phân biệt P0001 với lỗi kết nối (xem T201 v3 #1) |

Quyết định cho phép dải IP riêng ở lớp mức DB: chấp nhận – lý do ở `T201-kiem-thu-v3.md`.

Kết luận: APPROVED – BLOCKER 0, MAJOR 0, MINOR 1
