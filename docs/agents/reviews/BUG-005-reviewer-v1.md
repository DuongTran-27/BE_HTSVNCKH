# Review BUG-005 – reviewer – vòng 1
Kết luận: APPROVED

## Tôi đã tự kiểm tra
Đã đọc: dòng BUG-005 trong `BANG_CONG_VIEC.md`; `reports/BUG-005.md`; `reports/T201.md` mục "Vòng sửa 3"; `apps/api/scripts/test-db-guard.js`, `reset-test-db.js`; `tests/db.js`, `tests/global-setup.js`, `tests/T201-db-helpers.test.js`, `tests/T201-qa-guard-bypass.test.js`; `vitest.config.js` gốc, `apps/api/vitest.config.js`, `packages/shared/vitest.config.js`, `apps/web/vite.config.js`. Mã nguồn vitest 4.1.12 (`coverage.*.js:223`, `cli-api.*.js:3833/3884`) cho thấy `fileParallelism: false` ở project `apps/api` được giữ khi chạy qua `projects` từ thư mục gốc.
```
$ npm run db:test:up → exit=0 ; npm run db:test:reset → exit=0
$ NO_COLOR=1 npm test ×2 → shared RUN …/packages/shared 21/21; api 14 files 123/123; web 32/32; exit=0 cả 2 lần
$ (apps/api) npx vitest run tests/T201-qa-guard-bypass.test.js … --reporter=verbose
  ✓ TC-NFR08-03 (/<db dev>/x_test)  ✓ TC-NFR08-04 (reset ?host=)  ✓ TC-NFR08-05 (vitest ?host=)  ✓ TC-NFR08-06 (chạy từ gốc)
  ✓ T201-db-helpers > BUG-005: nhiều đoạn đường dẫn, tham số host/lạ bị chặn; …
$ (gốc) npx vitest run → 23 files, 176 tests, exit=0
$ ?options=… → bị chặn (danh sách trắng) ; DB "postgres" → bị chặn
$ npm run db:test:down → exit=0; tasklist postgres = 0
```

## Đối chiếu đặc tả
| Điều kiện đạt | Đạt? | Ghi chú |
|---|---|---|
| (a) Tên DB đúng một đoạn `^\w+_test$` | Đạt | `test-db-guard.js:13`, `:31`. TC-NFR08-03 xanh |
| (b) Từ chối URL có `host` | Đạt, chặt hơn đề xuất | Dùng danh sách trắng tham số (`test-db-guard.js:10-11`, `:29`, `:32`), nên chặn được cả `Host`, `hostaddr`, `options`… TC-NFR08-04, TC-NFR08-05 xanh |
| (c) Chạy từ gốc repo có chốt chặn | Đạt | Gốc có `projects: ['packages/*','apps/*']`, nên config `apps/api` (chốt chặn, `globalSetup`, `fileParallelism`) được nạp. TC-NFR08-06 xanh |
| `resetData` kiểm mức DB trước TRUNCATE, lỗi tiếng Việt | Đạt | `tests/db.js:7-8`. SQL dùng chung `DB_LEVEL_CHECK_SQL`, nên cùng lớp kiểm ở `reset-test-db.js:21-30` (qua chính Prisma CLI) và `global-setup.js:13-15` |
| `inet_server_addr()` null/loopback | Lệch có lý do, chấp nhận | Lớp mức DB còn cho phép các dải riêng 10/8, 172.16/12, 192.168/16, fc00::/7, để Docker/CI service container (172.x) chạy được. Một DB `*_test` trên máy khác trong LAN vẫn bị lớp chuỗi chặn (host phải là localhost). Cái tên `*_test` mới là điều kiện chính. T202 cần xác nhận trên CI (đã ghi trong báo cáo) |
| `projects` gốc không đổi `npm test` từng workspace | Đạt | `npm test` gốc vẫn chạy `--workspaces`. Shared có config rỗng riêng (vẫn 21 test, đúng thư mục). Web có `vite.config.js` riêng (vẫn 32 test) |
| Test QA không bị sửa | Đạt | Không có skip/only. QA v3 xác nhận mtime |

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| 1 | MINOR | `README.md:43` | README chưa cập nhật quy tắc mới (một đoạn tên DB, danh sách trắng tham số, kiểm mức DB) và chưa ghi rằng workspace mới phải có config vitest riêng vì gốc dùng `projects` | Đã ghi chi tiết ở `T201-reviewer-v2.md` #1. Sửa chung với T201 |
