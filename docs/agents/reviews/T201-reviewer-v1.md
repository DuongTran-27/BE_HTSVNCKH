# Review T201 – reviewer – vòng 1
Kết luận: APPROVED

Phạm vi: T201 vòng sửa 1, làm lại theo `docs/agents/design/QD_DB_TEST.md` (T217 DONE). Lint thuộc T202 nên chỉ ghi nhận, không tính cho T201.

## Tôi đã tự kiểm tra
Đã đọc: CLAUDE.md, `QD_DB_TEST.md`, `reports/T201.md` (cả mục "Vòng sửa 1"), `apps/api/scripts/db-test.js`, `apps/api/scripts/reset-test-db.js`, `apps/api/tests/T201-db-test.test.js`, `apps/api/vitest.config.js`, `apps/api/.env.test`, `docker-compose.test.yml`, `docker/postgres-test/init.sql`, `package.json` gốc, `apps/api/package.json`, README mục "Database test", `docs/VAN_HANH.md`, và `git diff` của các file đã theo dõi. Không đọc `.env`.

Tôi tự chạy các lệnh sau trong Git Bash (Windows 11, user thường), mỗi lệnh là một tiến trình riêng:
```
(trước khi chạy) tasklist | grep -ic postgres → 0; không có %TEMP%\nckh-db-test

$ npm run db:test:up ; echo exit=$?
DB test: embedded-postgres 16.14 tại localhost:54329
initdb xong (UTF8, locale en-US) tại C:\Users\GIGA\AppData\Local\Temp\nckh-db-test
K1 server_version_num = 160014 OK
K2 TimeZone = Asia/Ho_Chi_Minh OK
K3 server_encoding = UTF8 OK
K4 extension nckh_test = pg_trgm 1.6, unaccent 1.1 OK
K5 unaccent('Đề tài Nghiên cứu') = De tai Nghien cuu OK
K6 similarity = 1 OK
K7 locale (chỉ ghi nhận) = datcollate=en-US datctype=en-US lower('ĐỀ')=đề OK
K4 extension template1 = pg_trgm 1.6, unaccent 1.1 OK
Kiểm tra DB test: tất cả OK.
exit=0

$ npm run db:test:reset          # tiến trình khác, sau khi up đã thoát → V2, V6 (Git Bash)
The PostgreSQL database "nckh_test" schema "public" at "localhost:54329" was successfully reset.
Script executed successfully.
Đã reset DB test (db push + after_init.sql).
exit=0

$ NO_COLOR=1 npm test            # gốc, mọi workspace
@nckh/shared  Test Files 2 passed (2)   Tests 21 passed (21)
@nckh/api     Test Files 11 passed (11) Tests 110 passed (110)
@nckh/web     Test Files 7 passed (7)   Tests 32 passed (32)
exit=0

$ npx vitest run tests/T201-db-test.test.js --reporter=verbose   (apps/api)
18/18 ✓, trong đó 8 test "DB test thật" K1–K7 chạy 46–82 ms/test (có truy vấn thật)

$ npm run db:test:up             # lần hai, server đang chạy
Kiểm tra DB test: tất cả OK.
DB test đã chạy.            exit=0

$ DB_TEST_DRIVER=abc npm run db:test:up
db-test up lỗi: DB_TEST_DRIVER="abc" không hợp lệ, chỉ nhận: docker, embedded, external.   exit=1

$ npm run db:test:down
Embedded: đã dừng server.
Embedded: đã xóa C:\Users\GIGA\AppData\Local\Temp\nckh-db-test.   exit=0
tasklist | grep -ic postgres → 0 ; ls %TEMP%\nckh-db-test → No such file or directory
$ npm run db:test:down           # lần hai
Không có DB test nào đang chạy (không có DATA_DIR, Docker không chạy).   exit=0

$ npx vitest run tests/T201-db-test.test.js   # DB đã tắt
× K1 server_version_num 4142ms  × K2 …  × K3 …  × K4 …   exit=1   (FAIL, không skip)

$ npm run lint
'eslint' is not recognized as an internal or external command   (T202, không tính cho T201)

package-lock.json: embedded-postgres, @embedded-postgres/windows-x64, @embedded-postgres/linux-x64 đều 16.14.0-beta.17 và có integrity (khớp báo cáo).
```
Kết quả tự chạy khớp phần "Bằng chứng chạy lệnh" của báo cáo. Riêng `npm test` gốc giờ xanh 163/163: test `apps/web` từng đỏ trong báo cáo (của frontend-dev) đã được sửa ở phía web, và lỗi đó không thuộc T201.

Không chạy được: (1) `npm run db:test:reset` gọi từ PowerShell, vì hệ thống quyền chặn lệnh `powershell.exe`, giống tình huống devops gặp; (2) `taskkill` cho bước 4.6, tôi không thử. Trạng thái cuối: đã `db:test:down`, không còn tiến trình postgres, `DATA_DIR` đã xóa.

## Đối chiếu đặc tả
| Điều kiện đạt (NFR08 + QĐ_DB_TEST) | Đạt? | Ghi chú |
|---|---|---|
| Postgres 16 + pg_trgm/unaccent cho test | Đạt | K1 160014; K4 có ở cả `nckh_test` và `template1`; K5/K6 bỏ dấu đúng cả `Đ` (tự chạy) |
| Script reset DB test | Đạt | `reset-test-db.js` chạy thật thành công (nhánh `db push` + `after_init.sql`); chặn host không phải localhost (`reset-test-db.js:87`) |
| Tách DB dev/test | Đạt | `vitest.config.js:4` nạp `.env.test` (cổng 54329, `nckh_test`). `db-test.js:54` cũng chặn host không phải localhost |
| QĐ §1.2 chọn trình: biến ép → đúng trình, giá trị sai → lỗi ≠0, không ép → `docker info` (timeout 10 s, ENOENT/≠0 → embedded) | Đạt | `db-test.js:18-25,154`; có unit test cho cả 4 nhánh; tự chạy `abc` → exit 1 |
| QĐ §1.2 đã chọn trình thì không chuyển trình khác | Đạt | `up()` không có nhánh fallback (`db-test.js:160-174`); báo cáo có bằng chứng ép `docker` → exit 1, không tạo DATA_DIR |
| QĐ §1.4 hợp đồng 54329/nckh_test/postgres; `.env.test`, `reset-test-db.js`, `vitest.config.js`, compose, `init.sql` không đổi | Đạt | Nội dung khớp mô tả vòng 0 |
| QĐ §4.1 ghim chính xác + integrity 3 gói | Đạt | `apps/api/package.json` `"16.14.0-beta.17"`; lockfile có integrity của cả 3 gói |
| QĐ §4.2 DATA_DIR ngoài repo; initdb UTF8, en-US → C, scram, pwfile xóa trong finally; `pg_ctl start -w -l` + stdio ignore + timezone + listen localhost | Đạt | `db-test.js:115-137` |
| QĐ §4.2 bước 3 `up` lặp khi đã chạy → kiểm K1–K7, thoát 0; cổng bận mà kiểm không qua → lỗi, không xóa | Đạt | `db-test.js:165-169`; tự chạy `up` lần hai → "DB test đã chạy." |
| QĐ §4.2 bước 6 tạo extension/DB qua Prisma, mỗi lệnh một lần gọi | Đạt | `db-test.js:71-82` |
| QĐ §4.2 bước 7 `down` theo `pg_ctl status` (0/3/khác), không ép thì dừng theo trạng thái thật, gọi lặp an toàn | Đạt | `db-test.js:139-152,176-188`; tự chạy down hai lần → exit 0. Nhánh pid cũ chỉ có bằng chứng giả lập (xem MINOR 2) |
| QĐ §4.4 bảng K1–K7 in OK/SAI, lỗi SQL → SAI, thoát ≠0 | Đạt | `db-test.js:85-100`; xem MINOR 1 về trường hợp lỗi kết nối |
| QĐ §4.4 không tự `prisma generate`, báo đúng lệnh | Đạt | `db-test.js:64` |
| QĐ §4.5 / V5 script cài, người duy trì, `npm audit signatures` | Đạt | Có trong báo cáo; lockfile khớp |
| QĐ §5.1 V1, V3, V4, V6 | Đạt | Tự chạy lại được |
| QĐ §5.1 V2 | Đạt một phần | Git Bash đạt (tự chạy lại). PowerShell bị chặn quyền → việc của con người (MINOR 2) |
| QĐ §6 bước 5 README + VAN_HANH | Đạt | 3 trình, `DB_TEST_DRIVER`, bước `prisma generate`; Docker giờ là tùy chọn |
| QĐ §6 bước 6 ghi chú CI cho T202 | Đạt | Có trong báo cáo (service, TZ, healthcheck, thứ tự bước, `external`) |
| Không có test bị skip, `.only`, hay bị làm yếu | Đạt | Không có cơ chế skip; test DB FAIL khi DB tắt (tự kiểm) |
| Văn bản thông báo bằng tiếng Việt | Đạt | |

## Quyết định cần chốt: `npm test` FAIL khi chưa bật DB test
**Chốt: giữ như devops đã làm. Không tách `test:db`, không thêm cơ chế skip.** Lý do:
- CLAUDE.md:20 định nghĩa `npm test` = "toàn bộ unit + integration". Test integration cần DB, nên một `npm test` xanh mà không chạm DB là `npm test` thiếu.
- Quy tắc #1 và #2 của CLAUDE.md, cùng QUY_TRINH ("test đỏ" là BLOCKER), đều dựa vào `npm test` làm bằng chứng. Nếu skip âm thầm hoặc tách sang `test:db`, lệnh mà mọi agent, `/dieu-phoi` bước hồi quy và `/kiem-tra-cuoi` đang chạy sẽ báo xanh dù chưa kiểm FR06 (pg_trgm/unaccent). Như vậy đi ngược ý của quy tắc #5.
- T203 sẽ thêm integration test đọc `pg_indexes`/`pg_trigger`, nên đằng nào cũng phải có DB. Tách bây giờ chỉ dời vấn đề về sau.
- Chi phí thấp: không có DB thì test FAIL với hướng dẫn rõ ràng (`Chạy "npm run db:test:up" rồi "npm run db:test:reset"`). Cần vòng lặp nhanh thì đã có `npx vitest run <file>`, không cần thêm script.
- Điều kiện kèm theo: tài liệu điều phối phải nói rõ bước bật DB trước `npm test` (MINOR 3). Việc này thuộc điều phối viên, không chặn T201.

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| 1 | MINOR | `apps/api/scripts/db-test.js:85-100` (lỗi ném ra từ `withClient`, dòng 59-68) | Lỗi SQL được tính là `SAI`, đúng QĐ. Còn lỗi **kết nối** (ví dụ `external` khi không có server) thì ném thẳng ra ngoài: không in dòng tổng kết "có mục SAI", chỉ có "db-test up lỗi: …". Script vẫn thoát ≠0 và không nuốt lỗi, nên không sai về hành vi. Chỉ lệch nhẹ chữ của QĐ §4.4 ("in tổng kết") | Có thể bỏ qua. Nếu sửa: bọc vòng `for db` trong try/catch, in `Kiểm tra DB test: lỗi kết nối <db>` rồi ném tiếp |
| 2 | MINOR | `docs/agents/reports/T201.md` mục "Còn lại / rủi ro" | Hai phần QĐ §6 bước 4 chưa có bằng chứng thật: V2 chạy từ PowerShell (bị chặn quyền), và bước 4.6 dùng file pid giả lập thay cho `taskkill`. Rủi ro thấp: `npm run` trên Windows luôn chạy script qua `cmd.exe` bất kể shell gọi; tôi cũng tự chạy lại V2 trên Git Bash và đạt. QĐ §5.3 chỉ loại B khi V2 trượt **cả** cách chính lẫn dự phòng | Giữ trong "Việc con người cần làm" như hiện tại. Người dùng chạy 3 lệnh PowerShell rồi dán kết quả vào báo cáo. Không chặn DONE |
| 3 | MINOR | `CLAUDE.md:24`, `.claude/commands/dieu-phoi.md:12`, `.claude/agents/backend-dev.md:21` | Tài liệu điều phối đã cũ: CLAUDE.md vẫn ghi DB test là `docker compose … up -d`; bước hồi quy của `/dieu-phoi` và hướng dẫn backend-dev chỉ ghi `npm test` / "(docker)". Hệ quả: agent khác chạy `npm test` khi chưa bật DB sẽ thấy 8 FAIL và có thể mở BUG nhầm. Các file này không thuộc quyền devops | Điều phối viên sửa CLAUDE.md:24 thành `npm run db:test:up` → `npm run db:test:reset` (lần đầu `npx -w @nckh/api prisma generate`), xong thì `npm run db:test:down`. Thêm bước này trước `npm test` ở `dieu-phoi.md:12`, `trang-thai.md`, `kiem-tra-cuoi.md`; sửa "(docker)" ở `backend-dev.md:21` |
| 4 | MINOR | `docs/agents/design/QD_DB_TEST.md:4`, `:36` | Dòng 4 vẫn ghi "Trạng thái quyết định: **ĐỀ XUẤT**" dù T217 đã DONE. Dòng 36 (§3) đã được sửa trong working tree (áp INFO 1 của `T217-devops-v3.md`) nhưng không ghi trong bảng "File thay đổi" của báo cáo T201. Nội dung sửa đúng | KTS đổi dòng 4 thành "ĐÃ DUYỆT". Ai sửa §3 thì ghi một dòng vào báo cáo T201 hoặc T217 |
| 5 | MINOR | `package-lock.json`, `package.json` | Diff lockfile trộn thay đổi của `apps/web` (frontend-dev) với 3 gói embedded-postgres. `package.json` gốc có thêm thay đổi định dạng mảng `workspaces` (do npm ghi lại) | Khi commit, tách T201 ra riêng hoặc ghi rõ trong commit message. Không cần sửa mã |
| – | INFO | `package.json:"lint"` | `npm run lint` đỏ vì chưa cài ESLint. Thuộc T202, không tính cho T201 | T202 |

Không có BLOCKER/MAJOR. Kết luận: APPROVED – BLOCKER 0, MAJOR 0, MINOR 5.
