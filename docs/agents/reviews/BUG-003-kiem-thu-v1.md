# Review BUG-003 – kiem-thu – vòng 1
Kết luận: APPROVED

## Tôi đã tự kiểm tra
Đã đọc: dòng BUG-003 trong `BANG_CONG_VIEC.md`, `reports/BUG-003.md`, `apps/api/scripts/test-db-guard.js`, `reset-test-db.js`, `db-test.js`, `tests/T201-db-helpers.test.js`. Test QA `tests/T201-qa-isolation.test.js` không bị sửa (mtime trước review T201 v1, nội dung như cũ).

Trên server test (embedded, `localhost:54329`), DB nháp `nckh_dev_qa` có bảng `dev_marker`:
```
$ DIRECT_URL=postgresql://postgres:postgres@localhost:54329/nckh_dev_qa node scripts/reset-test-db.js
Từ chối reset: chỉ được chạy trên DB test cục bộ (NFR08).
- DIRECT_URL trỏ tới DB "nckh_dev_qa", tên DB test phải kết thúc "_test".
exit=1                                       (dev_marker còn)
$ DIRECT_URL=postgresql://u:p@db-dev.example.invalid:5432/postgres node scripts/reset-test-db.js   → bị chặn, exit=1
$ npx vitest run tests/T201-qa-isolation.test.js (2 lần)  → TC-NFR08-01 ✓ cả 2 lần
$ npm test (gốc, 2 lần) → shared 21/21, api 118/118, web 32/32, exit=0
```

## Đối chiếu đặc tả
| Điều kiện đạt | Đạt? | Ghi chú |
|---|---|---|
| NFR08: reset không chạm DB ngoài DB test khi `DIRECT_URL` đã export | Đạt | Kiểm mọi biến `env("…")` trong `schema.prisma`, trước mọi lệnh prisma; thêm điều kiện tên `_test` chặn cả DB dev trên localhost |
| Test đỏ chuyển xanh, không bị làm yếu | Đạt | TC-NFR08-01 xanh 2/2; file test không đổi |
| Có test hồi quy riêng | Đạt | 5 test `checkTestDbEnv/prismaUrlVars` |

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| – | – | – | Kịch bản BUG-003 đã đóng. Đường vòng mới tìm được trên cùng chốt chặn (`/<db>/x_test`, `?host=`) theo dõi ở **BUG-005**, không mở lại BUG-003 | Xem `reviews/T201-kiem-thu-v2.md` |

Kết luận: APPROVED – BLOCKER 0, MAJOR 0, MINOR 0
