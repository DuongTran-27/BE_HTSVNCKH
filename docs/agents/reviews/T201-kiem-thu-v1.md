# Review T201 – kiem-thu – vòng 1
Kết luận: CHANGES_REQUESTED

Góc nhìn: người viết test integration cho T203–T214 trên DB test (embedded-postgres, máy không có Docker).

## Tôi đã tự kiểm tra
Đã đọc: CLAUDE.md, `design/QD_DB_TEST.md`, `reports/T201.md` (gồm "Vòng sửa 1"), `apps/api/scripts/db-test.js`, `apps/api/scripts/reset-test-db.js`, `apps/api/tests/T201-db-test.test.js`, `apps/api/vitest.config.js`, `apps/api/.env.test`, `docker-compose.test.yml`, `prisma/sql/after_init.sql`, `prisma/schema.prisma` (datasource). Không đọc `.env`.

Lệnh đã chạy (Git Bash, Windows 11):
```
$ time npm run db:test:up            → K1–K7 OK (160014, Asia/Ho_Chi_Minh, UTF8, pg_trgm 1.6 + unaccent 1.1 ở 2 DB, locale en-US), exit=0, real 5.7s
$ time npm run db:test:reset         → "Đã reset DB test (db push + after_init.sql).", exit=0, real 3.5s
$ npm test   (lần 1)                 → shared 21/21, api 110/110, web 32/32, exit=0
$ npm test   (lần 2)                 → shared 21/21, api 110/110, web 32/32, exit=0   (không chập chờn)
$ npx vitest run tests/T201-qa-isolation.test.js  (2 lần)  → 2 failed, giống nhau cả 2 lần (BUG-003, BUG-004)
$ npm test -w @nckh/api (có file QA) → 2 failed | 110 passed (112)
$ npm run db:test:down               → "Embedded: đã dừng server." "đã xóa ...nckh-db-test", exit=0
$ (DB tắt) npx vitest run tests/T201-db-test.test.js → 8 × FAIL, mỗi test ~4,1 s, tổng 34 s; thông báo "Không truy vấn được DB test (nckh_test). Chạy "npm run db:test:up" rồi "npm run db:test:reset"."
$ npm run db:test:down (lần 2)       → "Không có DB test nào đang chạy ...", exit=0; tasklist không còn postgres; DATA_DIR đã xóa
```

Thử FR06 trên DB sau reset (qua `@prisma/client`, script nháp ngoài repo):
```
similarity(lower(immutable_unaccent('Xây dựng HỆ THỐNG quản lý Đề tài NCKH')), lower(immutable_unaccent('xay dung he thong quan ly de tai nckh'))) = 1
similarity(... 'Ứng dụng học sâu nhận diện biển số xe' ... 'Ứng dụng deep learning nhận dạng biển số') = 0.4255
unaccent('Đ đ Ơ ư Ỹ ỹ') = 'D d O u Y y'; lower(immutable_unaccent('ĐƯỜNG')) = 'duong'
pg_indexes: topic_title_trgm_idx USING gin (lower(immutable_unaccent(title)) gin_trgm_ops) – có
pg_trigger: audit_log_append_only, status_history_append_only – có; now() = ...+07
```

Thử xung đột song song (2 file tạm `tests/zz-qa-race-{a,b}.test.js`, đã xóa sau khi chạy): mỗi file `faculty.deleteMany()` → `create` → `count() === 1`, 30 vòng.
```
npx vitest run a b                         (2 lần) → 2 failed: "expected 2 to be 1"
npx vitest run --no-file-parallelism a b           → 2 passed
```

Thử cô lập dev/test (trên chính server test, DB `nckh_dev_qa` có bảng `dev_marker`):
```
$ DIRECT_URL="postgresql://postgres:postgres@localhost:54329/nckh_dev_qa" node scripts/reset-test-db.js
The PostgreSQL database "nckh_dev_qa" schema "public" at "localhost:54329" was successfully reset.
Đã reset DB test (db push + after_init.sql).   exit=0
→ nckh_dev_qa: dev_marker biến mất, có 27 bảng Prisma          (BUG-003)
$ DATABASE_URL="postgresql://u:p@db-dev.example.invalid:5432/nckh_dev" npx vitest run tests/T201-db-test.test.js
Can't reach database server at `db-dev.example.invalid:5432`  (vitest dùng thẳng URL dev)   (BUG-004)
```

Thử dọn dữ liệu nhanh cho test: `TRUNCATE <27 bảng> RESTART IDENTITY CASCADE` = 157 ms; `nextval('topic_code_seq')` trước = 1, sau TRUNCATE = 2 (sequence không về đầu).

Test QA thêm (giữ đỏ): `apps/api/tests/T201-qa-isolation.test.js` – TC-NFR08-01, TC-NFR08-02. Dùng host `*.invalid` nên dù sản phẩm sai cũng không chạm DB thật nào.

## Đối chiếu đặc tả
| Điều kiện đạt | Đạt? | Ghi chú |
|---|---|---|
| NFR08 – DB dev và test tách riêng | **Không** | Mặc định thì tách (54329/nckh_test). Nhưng biến môi trường có sẵn thắng `.env.test` mà không có chốt chặn: reset xóa được DB qua `DIRECT_URL` (BUG-003), vitest chạy trên DB dev (BUG-004) |
| Postgres 16 + pg_trgm/unaccent, dùng được cho FR06 | Đạt | K1–K7 OK; `similarity(lower(immutable_unaccent(...)))` tiếng Việt có dấu, chữ `Đ` cho đúng 1; index GIN trigram và trigger chỉ-thêm có sau reset |
| Script reset DB test xác định | Đạt (mức suite) | `db push --force-reset` + `after_init.sql`, 3,5 s, cho cùng schema mỗi lần. Chưa có cách reset nhanh giữa các test (vấn đề 3) |
| Test chạy lặp lại / song song an toàn | **Không** | `npm test` 2 lần cùng kết quả. Nhưng vitest chạy file song song trên cùng DB, không có quy ước cô lập → tái hiện xung đột thật (vấn đề 2) |
| Lỗi rõ khi DB tắt | Đạt, chậm | Thông báo tiếng Việt có hướng dẫn, nhưng 4 s × mỗi test (vấn đề 4) |
| `up`/`down` lặp, thoát ≠0 khi sai | Đạt | `down` 2 lần exit 0; không còn tiến trình, DATA_DIR đã xóa |

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| 1 | BLOCKER | `apps/api/scripts/reset-test-db.js:11-18` (chặn host), `:27`/`:29` (prisma) | **BUG-003.** Chỉ kiểm host `DATABASE_URL`, nhưng `prisma db push --force-reset` / `migrate reset` chạy trên `directUrl`. Shell đã export `DIRECT_URL` (ví dụ sau khi `source .env` Supabase) → `loadEnvFile` không ghi đè → `db:test:reset` **xóa sạch DB dev**. Đã tái hiện: mất bảng `dev_marker`, exit 0, in "Đã reset DB test" | Trước mọi lệnh prisma: kiểm cả `DATABASE_URL` và `DIRECT_URL` đều host cục bộ **và** cùng host:port/DB (hoặc bỏ `??=`, gán thẳng `DIRECT_URL = DATABASE_URL`). Nên kiểm thêm tên DB kết thúc `_test`. Làm xanh TC-NFR08-01. `db-test.js` dùng `datasourceUrl` nên không dính, nhưng nên dùng chung một hàm kiểm |
| 2 | MAJOR | `apps/api/vitest.config.js:7` | Chưa có quy ước cô lập dữ liệu khi vitest chạy file song song (mặc định `fileParallelism: true`). T203–T214 mỗi task một file integration trên cùng `nckh_test` → test chập chờn kiểu "expected 2 to be 1" (đã tái hiện; `--no-file-parallelism` hết lỗi) | Chọn và chốt ngay trong T201: cách đơn giản nhất là `test: { fileParallelism: false }` (hoặc tách project `tests/integration/**` chạy tuần tự, unit vẫn song song). Không khuyên schema riêng mỗi worker: `db push` mỗi schema ~3 s và `after_init.sql`/`immutable_unaccent` gắn `public`. Ghi quy ước vào README |
| 3 | MAJOR | `apps/api/scripts/reset-test-db.js`, `apps/api/tests/` (thiếu helper) | Reset chỉ có mức suite (3,5 s, phải chạy tay trước `npm test`). Không có helper dọn dữ liệu giữa các test, trong khi có 2 cái bẫy đã đo: (a) `deleteMany` trên `AuditLog`/`StatusHistory` có dòng sẽ lỗi do trigger chỉ-thêm → phải `TRUNCATE`; (b) `TRUNCATE ... RESTART IDENTITY` **không** đưa `topic_code_seq` về đầu (1 → 2) → mã đề tài FR05 phụ thuộc thứ tự test | Thêm `apps/api/tests/helpers/db.js` (hoặc giao rõ cho T203 trên bảng việc) có `resetData(prisma)`: `TRUNCATE` mọi bảng public `RESTART IDENTITY CASCADE` + `ALTER SEQUENCE topic_code_seq RESTART WITH 1` (~160 ms) |
| 4 | MAJOR | `apps/api/vitest.config.js` | **BUG-004.** Shell đã export `DATABASE_URL` của DB dev → vitest dùng luôn, không cảnh báo; khi T203+ có test ghi/xóa thì dữ liệu dev bị phá. Đã tái hiện (vitest kết nối `db-dev.example.invalid:5432`) | Trong config hoặc `globalSetup`: host `DATABASE_URL`/`DIRECT_URL` không cục bộ → ném lỗi tiếng Việt, vitest thoát ≠0. Làm xanh TC-NFR08-02. CI vẫn chạy vì service ở `localhost:54329` |
| 5 | MINOR | `apps/api/tests/T201-db-test.test.js:62-75` | DB tắt: mỗi test tự kết nối, chờ ~4 s → 34 s cho 8 test; integration T203+ sẽ nhân lên và mỗi test in lỗi P1001 thô | `globalSetup` thử kết nối một lần (timeout ngắn), sai → dừng ngay với đúng thông báo hướng dẫn hiện có |

## Lỗi tìm thấy
| ID | Mức | Mô tả ngắn | Test đỏ | Trạng thái |
|---|---|---|---|---|
| BUG-003 | BLOCKER | `db:test:reset` xóa DB do `DIRECT_URL` đã export trỏ tới, vượt chốt chặn localhost | `apps/api/tests/T201-qa-isolation.test.js` TC-NFR08-01 (đỏ 2/2 lần) | TODO – đã ghi `BANG_CONG_VIEC.md` |
| BUG-004 | MAJOR | vitest chạy trên `DATABASE_URL` dev đã export, không chặn | `apps/api/tests/T201-qa-isolation.test.js` TC-NFR08-02 (đỏ 2/2 lần) | TODO – đã ghi `BANG_CONG_VIEC.md` |

Ghi chú: chủ trì BUG-003/004 ghi DO (code của T201, không phải BE/FE nghiệp vụ). Hệ quả: `npm test -w @nckh/api` hiện đỏ 2 test cho tới khi sửa – cố ý, theo quy tắc giữ test đỏ.

Trạng thái cuối: đã `db:test:down`, không còn tiến trình postgres, `DATA_DIR` đã xóa (DB nháp `nckh_dev_qa` nằm trong DATA_DIR nên cũng mất).

Kết luận: CHANGES_REQUESTED – BLOCKER 1, MAJOR 3, MINOR 1
