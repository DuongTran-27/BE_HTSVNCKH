# Review BUG-004 – kiem-thu – vòng 1
Kết luận: APPROVED

## Tôi đã tự kiểm tra
Đã đọc: dòng BUG-004 trong `BANG_CONG_VIEC.md`, `reports/BUG-004.md`, `apps/api/vitest.config.js`, `scripts/test-db-guard.js`, `tests/global-setup.js`. Test QA `tests/T201-qa-isolation.test.js` không bị sửa.
```
$ DATABASE_URL=postgresql://u:p@db-dev.example.invalid:5432/nckh_dev node scripts/reset-test-db.js → bị chặn, exit=1
$ npx vitest run tests/T201-qa-isolation.test.js (2 lần)  → TC-NFR08-02 ✓ cả 2 lần
$ (thử đường vòng) DATABASE_URL=DIRECT_URL=…localhost:54329/nckh_test?host=db-dev.example.invalid npx vitest run tests/csv.test.js
  → qua chốt chặn config, globalSetup kết nối `db-dev.example.invalid:54329`        (→ BUG-005)
$ (thử đường vòng, gốc repo) DATABASE_URL=…db-dev.example.invalid… npx vitest run apps/api/tests/T201-db-helpers.test.js
  → không nạp apps/api/vitest.config.js, không chặn                                (→ BUG-005)
$ npm test (gốc, 2 lần) → shared 21/21, api 118/118, web 32/32, exit=0
```

## Đối chiếu đặc tả
| Điều kiện đạt | Đạt? | Ghi chú |
|---|---|---|
| NFR08: `npm test` / vitest trong `apps/api` từ chối `DATABASE_URL`/`DIRECT_URL` dev đã export | Đạt | Chặn khi nạp config, thông báo tiếng Việt, exit 1 trước mọi test |
| Test đỏ chuyển xanh, không bị làm yếu | Đạt | TC-NFR08-02 xanh 2/2 |

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| 1 | MINOR | `apps/api/tests/T201-qa-isolation.test.js:33` (test của QA) | TC-NFR08-02 khớp `/localhost\|DB test/`, cũng khớp thông báo lỗi kết nối của `globalSetup` → không phân biệt "chốt chặn từ chối" với "không tới được host". Lỗi ở test, không ở sửa lỗi | TC-NFR08-05 (file mới) khớp chặt `/Từ chối chạy test/`; reviewer quyết có siết TC-NFR08-02 |

Kịch bản BUG-004 đã đóng. Đường vòng `?host=` và chạy từ gốc repo theo dõi ở **BUG-005**.

Kết luận: APPROVED – BLOCKER 0, MAJOR 0, MINOR 1
