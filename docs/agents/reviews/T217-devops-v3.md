# Review T217 – devops – vòng 3
Kết luận: APPROVED

## Tôi đã tự kiểm tra
Đã đọc: `CLAUDE.md`, `docs/agents/QUY_TRINH.md` (mẫu review), `reports/T217.md` (mục "Vòng sửa 2"), `design/QD_DB_TEST.md` (bản vòng sửa 2) và review trước của tôi `reviews/T217-devops-v2.md`. Không đọc review của agent khác. Không đọc `.env.test`. Tôi không sửa file nào trong repo ngoài file review này và không cài gói vào repo.

### Chạy lại §4.2 và §4.4 trên embedded (thư mục nháp `scratchpad/t217v2`, gói `embedded-postgres@16.14.0-beta.17` lấy từ `scratchpad/pg-spike`)
`check.mjs` dùng K7 **đúng câu** ở QĐ:95 (thêm cột `upper` chỉ để in ra). `down.mjs` viết theo đúng §4.2 bước 7 (QĐ:61-68): `pg_ctl status` cho mã 0 thì gọi `stop`, mã 3 thì bỏ qua `stop`, mã khác thì báo lỗi. Sau đó xóa `DATA_DIR`.
```
$ node up.mjs                 -> initdb exit 0; pg_ctl start exit 0 ms 276; UP=0
$ node check.mjs              (tiến trình riêng, @prisma/client 5.22)
CREATE DATABASE -> 0
K4 template1 pg_trgm 1.6, unaccent 1.1
K1 160014 | K2 Asia/Ho_Chi_Minh | K3 UTF8 | K4 nckh_test pg_trgm 1.6, unaccent 1.1
K5 De tai Nghien cuu | K6 1 (number)
K7 [{"datcollate":"en-US","datctype":"en-US","low":"đề","up":"ĐỀ"}]   # không còn lỗi 42704
CHECK=0

--- down khi server đang chạy
status 0 / stop 0 / DATA removed true / DOWN=0 / tasklist postgres: 0
--- down gọi lặp
no DATA_DIR, skip / DOWN2=0
--- postmaster.pid cũ
up -> UP=0, 6 tiến trình postgres; taskkill /F /IM postgres.exe; data/postmaster.pid vẫn còn
status 3 / DATA removed true / STALE_DOWN=0
tasklist | grep -ci postgres -> 0 ; netstat | grep -c :54329 -> 0
```
Đã dọn sạch: không còn tiến trình postgres, cổng 54329 không còn ai nghe, `t217v2/data` đã xóa.

### `npm test` (tự chạy ở gốc, 2026-11-01)
```
$ NO_COLOR=1 npm test
 RUN  v4.1.12 .../packages/shared   Test Files 2 passed (2)   Tests 21 passed (21)
 RUN  v4.1.12 .../apps/api          Test Files 9 passed (9)   Tests 87 passed (87)
 RUN  v4.1.12 .../apps/web          Test Files 3 passed (3)   Tests 23 passed (23)
EXIT=0
```
Kết quả khớp bằng chứng của điều phối viên trong báo cáo, mục "Vòng sửa 2". Vấn đề #5 (INFO) của vòng 2 (`apps/web` không có test) đã hết.

## Đối chiếu đặc tả / vấn đề vòng 2
| # v2 | Mức | Đã sửa đúng? | Kiểm thực tế |
|---|---|---|---|
| 1 | MAJOR | **Đúng** | K7 (QĐ:95) đọc từ `pg_database`. §4.3 (QĐ:73) đã bỏ `SHOW lc_ctype` và thêm ghi chú về PG16. Chạy thật thì K7 qua, `check` thoát 0 |
| 2 | MINOR | **Đúng** | QĐ:83 đã dùng cú pháp `npx -w @nckh/api prisma generate` và giải thích vì sao `-w` phải đặt trước. `db-test.js` bắt lỗi "did not initialize yet" nhưng không tự generate. Bước generate đã có trong §6 bước 1 (QĐ:142), README (QĐ:153) và thứ tự bước CI (QĐ:154: `npm ci` → generate → external up → reset → test) |
| 3 | MINOR | **Đúng** | §4.2 bước 7 (QĐ:61-68) dùng `pg_ctl status` cho mã 0, 3 và các mã khác. Khi `stop` lỗi thì giữ `DATA_DIR`. Bằng chứng bắt buộc nằm ở §6 bước 4.6 (QĐ:151). Đã chạy thật, kể cả trường hợp pid cũ: thoát 0 và `DATA_DIR` bị xóa |
| 4 | INFO | Đúng | V2 ghi là "đã chạy thử (DO v2)". T201 còn phải chạy thêm từ PowerShell |
| 5 | INFO | Hết | `npm test` gốc thoát 0, `apps/web` có 3 file test |

NFR08 (môi trường test lặp lại được): QĐ đã đủ chi tiết để T201 làm theo mà không phải đoán. Mọi chỉ định có thể chạy thử cục bộ đều đã chạy thật, và tôi không thấy lỗi.

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| 1 | INFO | `docs/agents/design/QD_DB_TEST.md:36` và `:154` | §3 ghi "CI không gọi `db:test:up`", nhưng §6 bước 6 lại cho CI chạy `DB_TEST_DRIVER=external npm run db:test:up`. Ý đã rõ nhờ §1.1 (CI không dùng embedded), nên không chặn duyệt. | Lần sửa tài liệu tới, đổi câu ở §3 thành "CI không dùng embedded; chỉ gọi `db:test:up` với `DB_TEST_DRIVER=external`". |
| 2 | INFO | — (xác nhận khi đẩy lên GitHub, thuộc T202) | Nhánh `external` trên runner ubuntu với service `postgres:16` (`TZ=Asia/Ho_Chi_Minh`) chưa chạy được ở đây. Cần xác nhận khi đẩy lên: log CI của bước `db:test:up` in K1–K7 đều `OK`, K2 = `Asia/Ho_Chi_Minh`, và K7 ra `en_US.utf8`. | Ghi vào tiêu chí review T202. |

Kết luận: APPROVED – BLOCKER 0, MAJOR 0, MINOR 0, INFO 2.
