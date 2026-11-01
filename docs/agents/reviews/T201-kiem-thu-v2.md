# Review T201 – kiem-thu – vòng 2
Kết luận: CHANGES_REQUESTED

Góc nhìn: người viết test integration cho T203–T214; kiểm lại 5 vấn đề vòng 1 và thử tìm đường vòng qua chốt chặn mới.

## Tôi đã tự kiểm tra
Đã đọc: dòng T201/BUG-003/BUG-004 trong `BANG_CONG_VIEC.md`; `reports/T201.md` mục "Vòng sửa 2"; `reports/BUG-003.md`, `reports/BUG-004.md`; `apps/api/scripts/test-db-guard.js`, `reset-test-db.js`, `db-test.js`; `apps/api/vitest.config.js`, `tests/global-setup.js`, `tests/db.js`, `tests/T201-db-helpers.test.js`; `prisma/schema.prisma` (datasource); `package.json` gốc và `apps/api`. Không đọc `.env` (chỉ kiểm tồn tại: không có `apps/api/.env`, `apps/api/prisma/.env`, `.env` gốc).

`tests/T201-qa-isolation.test.js` **không bị sửa**: mtime 18:44:23, trước review v1 (18:46:22); nội dung đúng như vòng 1 (TC-NFR08-01, -02, host `*.invalid`).

Shell không export `DATABASE_URL`/`DIRECT_URL`/`DB_TEST_DRIVER` (kiểm tên biến, không in giá trị). Git Bash, Windows 11.
```
$ npm run db:test:up        → K1–K7 OK, "Kiểm tra DB test: tất cả OK.", exit=0, real 7.4s
$ npm run db:test:reset     → "Đã reset DB test (db push + after_init.sql).", exit=0
$ NO_COLOR=1 npm test (lần 1) → shared 21/21, api 13 files 118/118, web 32/32, exit=0
$ NO_COLOR=1 npm test (lần 2) → shared 21/21, api 13 files 118/118, web 32/32, exit=0
```

Thử lại kịch bản tấn công vòng 1 + biến thể (`apps/api`, DB nháp `nckh_dev_qa` có bảng `dev_marker` trên server test):
```
A1 DIRECT_URL=…localhost:54329/nckh_dev_qa  reset          → "Từ chối reset … DB "nckh_dev_qa" … phải kết thúc "_test"", exit=1
A2 DIRECT_URL=…db-dev.example.invalid:5432/postgres reset    → "… host "db-dev.example.invalid", chỉ cho phép localhost.", exit=1
A3 DATABASE_URL=…db-dev.example.invalid:5432/nckh_dev reset  → bị chặn (DATABASE_URL), exit=1
A6 cả 2 URL host ngoài, DB nckh_test                          → bị chặn cả 2 biến, exit=1
A9 DIRECT_URL host 0.0.0.0                                   → bị chặn, exit=1
A10 postgresql://u:p@localhost@db-dev.example.invalid:5432/nckh_test → bị chặn (hostname đúng là db-dev…), exit=1
TC-NFR08-01, TC-NFR08-02 (2 lần)                              → xanh
```
Đường vòng tìm được (BUG-005, mới):
```
B1 DATABASE_URL=DIRECT_URL=…localhost:54329/nckh_test?host=db-dev.example.invalid npx vitest run tests/csv.test.js
   → qua chốt chặn; globalSetup: "Please make sure your database server is running at `db-dev.example.invalid:54329`"
B2 DIRECT_URL=…localhost:54329/nckh_test?host=db-dev.example.invalid node scripts/reset-test-db.js
   → qua chốt chặn; "P1001: Can't reach database server at `db-dev.example.invalid:54329`" … "Reset DB test thất bại tại: npx prisma db push --force-reset"
B3 DATABASE_URL=DIRECT_URL=…localhost:54329/nckh_dev_qa/x_test node scripts/reset-test-db.js
   → "Đã reset DB test (db push + after_init.sql).", exit=0
   → nckh_dev_qa: dev_marker còn? false, số bảng 27            (DB dev bị reset)
C1 (gốc repo) DATABASE_URL=…db-dev.example.invalid:5432/nckh_dev npx vitest run apps/api/tests/T201-db-helpers.test.js
   → không có "Từ chối"; PrismaClientInitializationError "Can't reach database server at `db-dev.example.invalid:5432`"
     (config apps/api không được nạp → không chốt chặn; với DB tới được, resetData() TRUNCATE nó – xem TC-NFR08-06)
```

Test QA mới (giữ đỏ): `apps/api/tests/T201-qa-guard-bypass.test.js` TC-NFR08-03…06. Dựng DB nháp `nckh_qa_guard` (đóng vai DB dev, 1 dòng trong `dev_marker`) trên server test mỗi test, xóa ở `afterAll`; host ngoài là `*.invalid`.
```
$ NO_COLOR=1 npx vitest run tests/T201-qa-guard-bypass.test.js tests/T201-qa-isolation.test.js   (2 lần, giống nhau)
 × TC-NFR08-03 … DB dev bị reset: expected -1 to be 1          (bảng dev_marker bị xóa)
 × TC-NFR08-04 … expected 'Prisma schema loaded from prisma\sche…' to match /Từ chối reset/
 × TC-NFR08-05 … expected '\n RUN  v4.1.12 …' to match /Từ chối chạy test/
 × TC-NFR08-06 … dữ liệu DB dev bị xóa khi chạy từ gốc: expected +0 to be 1   (TRUNCATE dev_marker)
 ✓ TC-NFR08-01, ✓ TC-NFR08-02
$ NO_COLOR=1 npm test -w @nckh/api   (2 lần) → Test Files 1 failed | 13 passed (14), Tests 4 failed | 118 passed (122), exit=1 – cả 2 lần
```

Xác nhận `fileParallelism: false` (2 file tạm `tests/zz-qa-race-{a,b}.test.js`: 30 vòng `faculty.deleteMany → create → count()===1`; đã xóa, `ls tests | grep -c zz-qa` = 0; `faculty` dọn về 0):
```
npx vitest run a b                            (lần 1, lần 2) → Test Files 2 passed (2)
npx vitest run a b --fileParallelism=true     (đối chứng)    → 2 failed: "expected 2 to be 1"
```
(Ghi chú: `--file-parallelism a b` nuốt `a` làm giá trị cờ, chỉ chạy 1 file – phải dùng `--fileParallelism=true`.)

DB tắt:
```
$ npm run db:test:down → "Embedded: đã dừng server." "đã xóa …\nckh-db-test", exit=0; tasklist postgres = 0; DATA_DIR không còn
$ time npm test -w @nckh/api → "Error: Không kết nối được DB test (nckh_test). Chạy "npm run db:test:up" …", real 5.0s (vòng 1: 34 s)
$ npm run db:test:down (lần 2) → "Không có DB test nào đang chạy …"
```

## Đối chiếu đặc tả
| Điều kiện đạt | Đạt? | Ghi chú |
|---|---|---|
| NFR08 – DB dev và test tách riêng | **Chưa** | Kịch bản vòng 1 (biến đã export) đã chặn đúng. Còn 3 đường vòng: `/<db>/x_test`, `?host=`, chạy vitest từ gốc repo (BUG-005) |
| Postgres 16 + pg_trgm/unaccent | Đạt | K1–K7 OK |
| Script reset DB test xác định | Đạt | 2 lần `npm test` sau reset cùng kết quả |
| Test file song song an toàn | Đạt | `fileParallelism: false` hiệu lực (có đối chứng đỏ) |
| Dọn dữ liệu giữa test | Đạt | `resetData` (TRUNCATE một câu + `topic_code_seq` RESTART), có test trên DB thật |
| Lỗi rõ, nhanh khi DB tắt | Đạt | 5 s, thông báo tiếng Việt, không test nào báo xanh |

## Kiểm từng vấn đề vòng 1
| # vòng 1 | Mức | Đóng? | Bằng chứng |
|---|---|---|---|
| 1 BUG-003 (reset qua `DIRECT_URL`) | BLOCKER | Đóng | A1, A2, TC-NFR08-01 xanh; `dev_marker` còn |
| 2 Song song | MAJOR | Đóng | zz-qa-race: 2/2 xanh; đối chứng `fileParallelism=true` đỏ |
| 3 Helper dọn dữ liệu | MAJOR | Đóng | `tests/db.js`; `T201-db-helpers` > resetData xanh (trigger chặn `deleteMany`, sequence = 1, id AuditLog = 1) |
| 4 BUG-004 (vitest dùng URL dev) | MAJOR | Đóng | A3/lệnh BUG-004 bị chặn, TC-NFR08-02 xanh |
| 5 DB tắt chậm | MINOR | Đóng | 34 s → 5 s |

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| 1 | MAJOR | `apps/api/scripts/test-db-guard.js:20-23` | **BUG-005 (a,b).** Chốt chặn đọc URL khác Prisma: `pathname.slice(1)` lấy cả `nckh_dev_qa/x_test` trong khi Prisma dùng đoạn đầu `nckh_dev_qa` (B3: DB dev bị reset, exit 0); bỏ qua `?host=` trong khi Prisma kết nối host đó (B1, B2) | Tên DB phải khớp `^\w+_test$` (đúng một đoạn); từ chối URL có tham số `host` (`url.searchParams.has('host')`). Làm xanh TC-NFR08-03/04/05 |
| 2 | MAJOR | `apps/api/tests/db.js:3-9` | **BUG-005 (c).** Chốt chặn chỉ nằm ở `apps/api/vitest.config.js`; chạy từ gốc repo (`npx vitest run apps/api/tests/…`) không nạp config → `resetData()` TRUNCATE mọi bảng trên DB mà `DATABASE_URL` đã export trỏ tới (TC-NFR08-06: `dev_marker` còn 0 dòng). T203–T214 sẽ gọi `resetData` ở mọi file integration | `resetData` tự kiểm ở mức DB trước TRUNCATE: `SELECT current_database(), inet_server_addr()::text` → tên kết thúc `_test`, địa chỉ null/127.0.0.1/::1, sai → ném "Từ chối dọn dữ liệu: …" (chặn cả a,b cho đường này) |
| 3 | MINOR | `apps/api/tests/T201-qa-isolation.test.js:33` (test của tôi) | TC-NFR08-02 khớp `/localhost\|DB test/` – thông báo lỗi kết nối của `globalSetup` ("Không kết nối được DB test") cũng khớp, nên test vẫn xanh nếu chốt chặn config bị gỡ mà host ngoài không tới được | Không sửa test cũ; TC-NFR08-05 ở file mới khớp chặt `/Từ chối chạy test/`. Reviewer quyết có siết TC-NFR08-02 không |
| 4 | MINOR | `reports/T201.md` "Còn lại / rủi ro" | Ghi chốt chặn chỉ bỏ sót lệnh prisma gọi tay với `--url`; chưa ghi 3 đường vòng trên | Cập nhật khi sửa BUG-005 |

## Lỗi tìm thấy
| ID | Mức | Mô tả ngắn | Test đỏ | Trạng thái |
|---|---|---|---|---|
| BUG-003 | BLOCKER | reset xóa DB qua `DIRECT_URL` đã export | TC-NFR08-01 | Đã sửa – xanh 2/2 (xem `BUG-003-kiem-thu-v1.md`) |
| BUG-004 | MAJOR | vitest chạy trên `DATABASE_URL` dev đã export | TC-NFR08-02 | Đã sửa – xanh 2/2 (xem `BUG-004-kiem-thu-v1.md`) |
| BUG-005 | MAJOR | chốt chặn vượt được: `/<db>/x_test`, `?host=`, chạy vitest từ gốc repo | `apps/api/tests/T201-qa-guard-bypass.test.js` TC-NFR08-03…06 (đỏ 2/2 lần) | TODO – đã ghi `BANG_CONG_VIEC.md`, chủ trì DO (T201) |

Mức MAJOR (không BLOCKER) vì (a),(b) cần URL cố ý dựng, (c) cần đồng thời chạy từ gốc repo và đã export URL DB dev; kịch bản vô tình phổ biến nhất (BUG-003/004) đã chặn. Hệ quả: `npm test -w @nckh/api` đỏ 4 test cho tới khi sửa – cố ý.

Trạng thái cuối: đã `db:test:down`, không còn tiến trình postgres, `DATA_DIR` đã xóa; file tạm zz-qa-race đã xóa.

Kết luận: CHANGES_REQUESTED – BLOCKER 0, MAJOR 2, MINOR 2
