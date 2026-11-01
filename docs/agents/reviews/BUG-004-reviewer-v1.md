# Review BUG-004 – reviewer – vòng 1
Kết luận: APPROVED

## Tôi đã tự kiểm tra
Đã đọc: dòng BUG-004 trong `BANG_CONG_VIEC.md`; `reports/BUG-004.md`; `apps/api/vitest.config.js`, `scripts/test-db-guard.js`, `tests/global-setup.js`, `tests/T201-qa-isolation.test.js`. Đã chạy chung với T201: xem `reviews/T201-reviewer-v2.md`.
```
$ npm run db:test:up → exit=0 ; npm run db:test:reset → exit=0
$ NO_COLOR=1 npm test ×2 → 21/21, 123/123, 32/32, exit=0
$ (apps/api) ✓ TC-NFR08-02 ; ✓ TC-NFR08-05 (khớp chặt /Từ chối chạy test/)
$ (apps/api) DATABASE_URL='…localhost:54329/nckh_test?options=…' npx vitest run tests/csv.test.js
  → "Từ chối chạy test: chỉ được chạy trên DB test cục bộ (NFR08). - DATABASE_URL có tham số không được phép: options …", exit=1
$ npm run db:test:down → exit=0
```

## Đối chiếu đặc tả
| Điều kiện đạt | Đạt? | Ghi chú |
|---|---|---|
| Config từ chối khi host `DATABASE_URL`/`DIRECT_URL` không cục bộ | Đạt | `vitest.config.js:6-7` kiểm lúc nạp config, trước khi Prisma kết nối và trước mọi test |
| Thông báo tiếng Việt, thoát ≠0 | Đạt | `process.exit(1)` kèm hướng dẫn `unset` |
| Chặn cả khi chạy một file lẻ / chạy từ gốc | Đạt | Chạy lẻ trong `apps/api`: có, vì chốt chặn nằm trong config. Chạy từ gốc: có, nhờ `projects` (BUG-005c, TC-NFR08-06) |
| Test đỏ chuyển xanh | Đạt | TC-NFR08-02 xanh. Regex của test này lỏng (MINOR #3 ở `T201-reviewer-v2.md`), nhưng TC-NFR08-05 và unit `checkTestDbEnv` đã chứng minh đúng điều cần |

## Vấn đề
Không có vấn đề riêng. Đề xuất siết regex TC-NFR08-02 (dành cho kiem-thu, không chặn) ghi ở `T201-reviewer-v2.md` #3.
