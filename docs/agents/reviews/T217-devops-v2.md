# Review T217 – devops – vòng 2
Kết luận: CHANGES_REQUESTED

## Tôi đã tự kiểm tra
Đã đọc: `CLAUDE.md`, `docs/agents/QUY_TRINH.md`, `reports/T217.md` (mục "Vòng sửa 1"), `design/QD_DB_TEST.md` (bản vòng sửa 1), `reviews/T217-devops-v1.md`, `reviews/T217-reviewer-v2.md`, `apps/api/scripts/reset-test-db.js`, `apps/api/prisma/schema.prisma` (generator, datasource) và script trong `package.json` gốc và `apps/api/package.json`. Không đọc `.env.test`. Tôi không sửa file nào trong repo ngoài file review này, và không cài gói vào repo.

### Chạy thử thật các chỉ định của QĐ (thư mục nháp, không đụng repo)
Tôi dựng lại đúng §4.2 và §4.4 bằng gói `embedded-postgres@16.14.0-beta.17` đã có trong `scratchpad/pg-spike`. Script nằm trong `scratchpad/t217v2`, còn dữ liệu nằm ở `scratchpad/t217v2/data`.

- `up.mjs` lấy đường dẫn binary bằng cách import `@embedded-postgres/windows-x64` (`win32` được ánh xạ thành `windows`), rồi chạy `initdb --encoding=UTF8 --locale=en-US --auth=scram-sha-256 --pwfile=<tạm>`. Sau đó gọi `spawnSync(pg_ctl, ['start','-w','-D',DATA,'-l',DATA/server.log,'-o','-p 54329 -c listen_addresses=localhost -c timezone=Asia/Ho_Chi_Minh'], { stdio: 'ignore' })`.
- `check.mjs` chạy trong **một tiến trình khác**, sau khi `up` đã thoát. Nó dùng `new PrismaClient({ datasourceUrl })` 5.22, gọi `$executeRawUnsafe` để chạy `CREATE EXTENSION`/`CREATE DATABASE`, và `$queryRawUnsafe` để chạy K1–K7. Client được generate từ một bản sao schema, có `output = "./gen"` trong thư mục nháp, nên không ghi vào `node_modules` của repo.

```
$ node up.mjs                                   # lần 1, gọi trực tiếp
initdb exit 0                                   # --locale=en-US chạy được
pg_ctl start exit 0 err undefined ms 292        # không treo
UP_EXIT=0                     real 0m5.99s
$ tasklist | grep -ci postgres  -> 6            # server còn sống sau khi node thoát
$ node check.mjs
CREATE DATABASE -> 0                            # $executeRawUnsafe ở template1 chạy được
K4 template1 [{extname:'pg_trgm',extversion:'1.6'},{extname:'unaccent',extversion:'1.1'}]
K1 [{"v":160014}] ['number']
K2 [{"v":"Asia/Ho_Chi_Minh"}]
K3 [{"v":"UTF8"}]
K4 [pg_trgm 1.6, unaccent 1.1]                  # ở nckh_test
K5 [{"v":"De tai Nghien cuu"}]
K6 [{"v":1}] ['number']                         # Number(v) === 1 đúng
K7 -> PrismaClientKnownRequestError P2010: ERROR: unrecognized configuration parameter "lc_ctype"   (vấn đề #1)
CHECK_EXIT=1

# K7 thay bằng truy vấn pg_database:
K7 [{"datcollate":"en-US","datctype":"en-US","low":"đề","up":"ĐỀ"}]
CHECK_EXIT=0                                    # chạy lần 2 in "db exists": các bước lặp lại an toàn

$ pg_ctl stop -w -m fast -D data  -> server stopped, STOP=0, còn 0 tiến trình postgres
$ npm run up                                    # lần 2, qua npm run (cmd.exe), từ Git Bash
pg_ctl start exit 0 ... NPM_UP_EXIT=0
$ tasklist | grep -ci postgres  -> 6
$ node check.mjs  -> CREATE DATABASE -> 0, K1 160014, K2 Asia/Ho_Chi_Minh, K6 1     # V2 đạt qua npm run

# down khi postmaster.pid đã cũ (server bị kill, giống tình huống máy khởi động lại)
$ pg_ctl status -D data  -> server is running, STATUS=0
$ taskkill /F /IM postgres.exe ; postmaster.pid vẫn còn
$ pg_ctl stop -w -m fast -D data
pg_ctl: could not send stop signal (PID: 15668): No such process
STALE_STOP=1                                    (vấn đề #3)
$ pg_ctl status -D data  -> pg_ctl: no server running, STALE_STATUS=3
```
Dọn dẹp: đã xóa `t217v2/data`, `tasklist | grep -ci postgres` cho `0`, cổng 54329 không còn ai nghe.

### Trạng thái Prisma client trong repo và cú pháp lệnh generate
```
$ ls node_modules/.prisma/client   -> chỉ có default.js/index.js 2 KB (bản giả, chưa generate)
$ node check.mjs  (dùng @prisma/client của repo)
Error: @prisma/client did not initialize yet. Please run "prisma generate" ...
$ npx prisma validate -w @nckh/api
! unknown or unexpected option: -w               # -w bị chuyển cho prisma, không phải cho npm
$ npx -w @nckh/api prisma validate
Prisma schema loaded from prisma\schema.prisma   # đặt -w trước tên lệnh thì chạy đúng workspace
```
Đính chính review v1 của tôi (và `reviewer-v2`, mục "Tôi đã tự kiểm tra"): ghi "client đã generate" là **sai**. Lệnh `prisma --version` chỉ cho biết gói đã được cài, không cho biết client đã được generate. `reset-test-db.js` dùng `db push --skip-generate`, nên trên một bản clone mới hay trên CI, không có bước nào tự generate client (vấn đề #2).

### `npm test` (tự chạy, 2026-11-01)
```
$ NO_COLOR=1 npm test
 RUN  v4.1.12 D:/Website_HTWLHD_SV_NCKH_demo3/packages/shared
 Test Files  2 passed (2)
      Tests  21 passed (21)
 RUN  v4.1.12 D:/Website_HTWLHD_SV_NCKH_demo3/apps/api
 Test Files  9 passed (9)
      Tests  87 passed (87)
 RUN  v4.1.12 D:/Website_HTWLHD_SV_NCKH_demo3/apps/web
No test files found, exiting with code 1
EXIT=1
```
`shared` và `api` khớp bằng chứng trong báo cáo. Workspace `apps/web` vẫn chưa được commit (`?? apps/web/`). Đây là việc của task frontend đang làm song song, chưa có file test nào, nên `vitest run` thoát 1. T217 chỉ sửa tài liệu nên không gây ra lỗi này. Lỗi cũng không mâu thuẫn với báo cáo, vì lúc điều phối viên chạy thì `apps/web` chưa có (xem vấn đề #5).

## Đối chiếu đặc tả / vấn đề vòng 1
| # v1 | Mức | Đã sửa đúng? | Kiểm thực tế |
|---|---|---|---|
| 1 | MAJOR | Đúng về hướng | `@prisma/client` + `datasourceUrl` kết nối được `template1`/`nckh_test`. `$executeRawUnsafe('CREATE DATABASE nckh_test')` trả 0 và không bị bọc transaction. `$queryRawUnsafe` trả dòng với kiểu dùng được (K1 và K6 là `number`). Client chạy được khi **không** có `DIRECT_URL`. Riêng K7 sai cú pháp với PG16 (#1). Thiếu bước generate (#2) |
| 2 | MINOR | Đúng | Dòng 51–55 đúng như đã chạy: `pg_ctl start -w -l` + `stdio: 'ignore'` trả về sau 0,27–0,29 s, không treo. Import gói nền chạy được. **V2 đạt**: server sống sau khi tiến trình `node` thoát, kể cả khi chạy qua `npm run` |
| 3 | MINOR | Đúng một phần | Ý dừng theo trạng thái là đúng, nhưng nếu `postmaster.pid` đã cũ thì `pg_ctl stop` thoát 1 (#3) |
| 4 | MINOR | Đúng | §1.2 đã có `docker\|embedded\|external` |
| 5 | MINOR | Đúng | §4.2 bước 6 dùng mỗi lệnh một lần gọi, theo từng URL; `CREATE DATABASE` đứng riêng. Ghi chú T202 có `--health-cmd`. Còn thiếu generate trên CI (#2) |
| 6 | INFO | Đúng | §2, §5.1 V5 đã cập nhật |

Các câu hỏi được giao kiểm:
- `listen_addresses=localhost`: chạy được. Kết nối bằng URL `localhost:54329` thành công, nên đạt phần kết nối của V6.
- `--locale=en-US`: initdb chấp nhận khi dùng UTF8. `lower('ĐỀ')` = `đề`, `upper('đề')` = `ĐỀ`, nghĩa là ctype xử lý đúng chữ tiếng Việt. Không cần rơi về `C`.
- `DB_TEST_DRIVER=external` dùng lại cho CI: được, vì các bước ở §4.2 bước 6 và K1–K6 đều không phụ thuộc Windows. Điều kiện là CI phải generate client trước và K7 phải được sửa (#1, #2). Với service `postgres:16` có `TZ=Asia/Ho_Chi_Minh`, K2 sẽ đạt vì initdb của ảnh Docker đọc `TZ`. Điều này cần xác nhận khi đẩy lên GitHub.

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| 1 | MAJOR | `docs/agents/design/QD_DB_TEST.md:91` (K7), `:69` (§4.3 "`SHOW lc_ctype`") | Từ PostgreSQL 16, `lc_collate`/`lc_ctype` không còn là tham số cấu hình nữa. Chạy thật thì `current_setting('lc_ctype')` báo `42704 unrecognized configuration parameter`. Dòng 93 quy định "lỗi SQL → thoát ≠0", nên nếu làm đúng QĐ thì `db:test:up` sẽ **luôn thất bại**, với cả 3 trình (kể cả CI ở nhánh `external`), vì cả 3 đều là PG16. | Sửa K7 thành `SELECT datcollate, datctype, lower('ĐỀ') AS low FROM pg_database WHERE datname = current_database()` (nckh_test). Đã chạy được: `en-US / en-US / đề`. §4.3 đổi "`SHOW lc_ctype`" thành "`datctype` (K7)". |
| 2 | MINOR | `QD_DB_TEST.md:79`, `:149` (§6 bước 6), `:148` | (a) Repo hiện **chưa generate** client: `node_modules/.prisma/client` là bản giả, và `reset-test-db.js` dùng `--skip-generate`. Vì vậy lần `up` đầu tiên trên máy này, trên một bản clone mới, hay trên CI đều báo "did not initialize yet". (b) Lệnh ghi trong QĐ, `npx prisma generate -w @nckh/api`, là **sai**: `-w` bị chuyển cho prisma (`unknown or unexpected option: -w`). | (a) Ghi rõ: nếu client chưa generate thì `db-test.js` in ra `npx -w @nckh/api prisma generate`. Ghi chú T202 phải thêm bước `npx -w @nckh/api prisma generate` **trước** `DB_TEST_DRIVER=external npm run db:test:up`. README cũng ghi bước này. (b) Sửa cú pháp thành `npx -w @nckh/api prisma generate`. |
| 3 | MINOR | `QD_DB_TEST.md:63-64` (§4.2 bước 7) | Câu "có `postmaster.pid` → `pg_ctl stop`" không an toàn khi pid đã cũ, ví dụ sau khi máy khởi động lại hoặc server bị kill. Chạy thật thì `pg_ctl stop` thoát 1 (`could not send stop signal ... No such process`). Kết quả là `down` báo lỗi và có thể không xóa `DATA_DIR`. | Dùng `pg_ctl status -D <DATA_DIR>` (đã kiểm: thoát 0 nếu đang chạy, 3 nếu không có server). Thoát 0 thì `stop`. Thoát 3 thì bỏ qua bước stop và chỉ xóa `DATA_DIR`. Cách này giữ đúng yêu cầu "gọi lặp lại an toàn". |
| 4 | INFO | `QD_DB_TEST.md:55`, §5.1 V2 | V2 đã chạy thử thành công trên máy này, cả khi gọi trực tiếp lẫn qua `npm run` (Git Bash). Có thể đổi chữ "Giả định" thành "đã chạy thử (DO v2)". T201 vẫn phải nộp bằng chứng theo §6 bước 4, nên thử thêm bằng PowerShell. | Tùy chọn. |
| 5 | INFO | ngoài T217: `apps/web` (chưa commit) | `npm test` ở thư mục gốc hiện thoát 1 vì `apps/web` chưa có file test (`No test files found`). Lỗi này không thuộc T217, nhưng nó sẽ làm đỏ mọi bằng chứng `npm test` của các task khác, kể cả T201 §6 bước 4.3. | Điều phối viên báo cho task tạo `apps/web`: thêm ít nhất một test, hoặc đặt `passWithNoTests` cho tới khi có test (việc này do kien-truc-su/reviewer quyết). |

Kết luận: CHANGES_REQUESTED – BLOCKER 0, MAJOR 1, MINOR 2, INFO 2.
