# Review T201 – reviewer – vòng 2
Kết luận: APPROVED

Phạm vi: vòng sửa 2 (BUG-003, BUG-004, cô lập dữ liệu test) và vòng sửa 3 (BUG-005) của T201, sau khi tôi APPROVED vòng 1. Lint thuộc T202, không tính. MINOR #3 vòng 1 (CLAUDE.md, `.claude/`) đang chờ người dùng, không tính.

## Tôi đã tự kiểm tra
Đã đọc: dòng T201, BUG-003, BUG-004, BUG-005 trong `BANG_CONG_VIEC.md`; `reports/T201.md` mục "Vòng sửa 2" và "Vòng sửa 3"; `reports/BUG-003.md`, `BUG-004.md`, `BUG-005.md`; `design/QD_DB_TEST.md` (kèm `git diff`); `reviews/T201-kiem-thu-v3.md`; code `apps/api/scripts/test-db-guard.js`, `reset-test-db.js`, `db-test.js`, `apps/api/vitest.config.js`, `vitest.config.js` gốc, `packages/shared/vitest.config.js`, `apps/web/vite.config.js`, `apps/api/tests/db.js`, `global-setup.js`, `T201-db-helpers.test.js`, `T201-qa-isolation.test.js`, `T201-qa-guard-bypass.test.js`; README mục "Database test"; `git diff` của `.gitignore`, `package.json`, `apps/api/package.json`. Không đọc `.env`.

`apps/api/.env.test`: chỉ kiểm cấu trúc bằng awk, không in giá trị. File có 2 dòng chú thích và 2 biến `DATABASE_URL`, `DIRECT_URL`. Cả hai trỏ `localhost:54329/nckh_test`, độ dài khớp đúng tài khoản test mặc định của QĐ §1 mục 4. Không có bí mật thật. `git check-ignore -v` xác nhận `.gitignore:5:!.env.test`, tức file được theo dõi có chủ ý.

Vitest 4.1.12, project config: đọc `node_modules/vitest/dist/chunks/coverage.*.js:223`. Khi `fileParallelism === false`, project bị ép `maxWorkers = 1`, và `cli-api.*.js:3833/3884` xếp file của project đó vào nhóm tuần tự. Nghĩa là `fileParallelism: false` của `apps/api` vẫn có hiệu lực khi chạy qua `projects` từ thư mục gốc. Kết quả này khớp với thử nghiệm race mà devops đã làm.

Lệnh tự chạy (Git Bash, Windows 11, Node 24.12.0, user thường). Shell không export `DATABASE_URL`/`DIRECT_URL`/`DB_TEST_DRIVER` (`env | grep -cE` → 0). Trước khi chạy: không có tiến trình postgres, không có `%TEMP%\nckh-db-test`.
```
$ npm run db:test:up            → K1–K7 OK, "Kiểm tra DB test: tất cả OK.", exit=0
$ npm run db:test:reset         → "Đã reset DB test (db push + after_init.sql).", exit=0
$ NO_COLOR=1 npm test (lần 1)   → shared RUN …/packages/shared 2 files 21/21; api RUN …/apps/api 14 files 123/123; web RUN …/apps/web 7 files 32/32; exit=0
$ NO_COLOR=1 npm test (lần 2)   → giống hệt, exit=0
$ (apps/api) npx vitest run T201-qa-guard-bypass T201-qa-isolation T201-db-helpers --reporter=verbose
                                → TC-NFR08-01…06 ✓, 7 test T201-db-helpers ✓; 3 files, 13/13
$ (gốc) NO_COLOR=1 npx vitest run → 23 files, 176 tests passed, exit=0   (= 21 + 123 + 32)
# Tự dò thêm
$ DATABASE_URL='…localhost:54329/nckh_test?options=-c%20search_path%3Dx' npx vitest run tests/csv.test.js
                                → "Từ chối chạy test … tham số không được phép: options", exit=1
$ DATABASE_URL='…localhost:54329/postgres' DIRECT_URL='…/nckh_test' node scripts/reset-test-db.js
                                → "Từ chối reset … DB "postgres" …", exit=1
$ grep .skip/.only/.todo/skipIf/runIf trong apps/api/tests, packages/shared/src, apps/web/src → không có
$ npm run db:test:down          → "Embedded: đã dừng server." "đã xóa …\nckh-db-test", exit=0; tasklist postgres = 0; DATA_DIR không còn
```
Số test khớp báo cáo (21 + 123 + 32). Chênh với vòng 1 (110 test api) là do có thêm test T201/QA. Không test nào bị xóa: shared và web vẫn 21 và 32 như vòng 1.

## Đối chiếu đặc tả
| Điều kiện đạt | Đạt? | Ghi chú |
|---|---|---|
| NFR08: test chỉ chạy trên DB test, tách DB dev | Đạt | Có 2 lớp. Lớp chuỗi (`test-db-guard.js`) kiểm mọi `env("…")` trong schema: host cục bộ, tên DB một đoạn `^\w+_test$`, tham số trong danh sách trắng. Lớp mức DB (`DB_LEVEL_CHECK_SQL`) chạy trên đúng kết nối sẽ phá dữ liệu: reset, `resetData`, `globalSetup` |
| BUG-003: reset không xóa DB do `DIRECT_URL` trỏ tới | Đạt | `reset-test-db.js:13-30`: chặn chuỗi trước mọi lệnh prisma, sau đó kiểm mức DB qua `prisma db execute --url`. TC-NFR08-01 xanh |
| BUG-004: vitest từ chối URL dev đã export | Đạt | `apps/api/vitest.config.js:6-7`: `process.exit(1)` lúc nạp config. TC-NFR08-02, TC-NFR08-05 xanh |
| BUG-005 (a)(b)(c) | Đạt | TC-NFR08-03…06 xanh. Tự dò `?options=` và DB `postgres` đều bị chặn |
| QĐ T217: localhost:54329, `nckh_test`, không bật embedded trong `globalSetup` | Đạt | `global-setup.js` chỉ thử `SELECT 1` và kiểm mức DB. Hợp đồng URL giữ nguyên. QĐ §6 bước 3 cho phép sửa `vitest.config.js`/`reset-test-db.js` khi có lỗi thật kèm lý do; ở đây lý do là BUG-003/004/005 |
| `projects` gốc không đổi hành vi `npm test` từng workspace | Đạt | `npm test` gốc vẫn chạy `--workspaces`, mỗi workspace có dòng `RUN` đúng thư mục của nó. Shared có config rỗng nên không nhặt config gốc (vẫn 21 test). Web dùng `apps/web/vite.config.js` (jsdom), tìm thấy trước config gốc (vẫn 32 test) |
| Test không bị làm yếu | Đạt | Không có skip/only. Test QA không bị sửa (QA v3 xác nhận mtime; nội dung tôi đọc khớp mô tả BUG) |
| `resetData` dọn được bảng chỉ-thêm, sequence về đầu | Đạt | `T201-db-helpers.test.js:40-61` chạy trên DB thật |
| Đơn giản vừa đủ | Đạt | Chốt chặn dùng chung một module cho 3 nơi gọi, `db-test.js` bỏ phần kiểm riêng. Kiểm mức DB ở `globalSetup` trùng một phần với `resetData`, nhưng chỉ có 3 dòng và chặn được trường hợp test chèn dữ liệu trước khi gọi `resetData`. Chấp nhận |

## Vấn đề cũ (vòng 1)
| # vòng 1 | Trạng thái |
|---|---|
| 1 MINOR – lỗi kết nối không in tổng kết | Đã sửa: `db-test.js:90`, `:166-167` |
| 2 MINOR – V2 PowerShell | Vẫn là việc của con người, không chặn |
| 3 MINOR – CLAUDE.md/.claude | Chờ người dùng, không tính |
| 4 MINOR – `QD_DB_TEST.md:4` | Đã sửa thành "ĐÃ DUYỆT". Sửa §3 đã được ghi ở báo cáo vòng sửa 2 #7 |
| 5 MINOR – lockfile trộn | Xử lý lúc commit |

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| 1 | MINOR | `README.md:43` | Mô tả chốt chặn vẫn là của vòng 2 ("tên DB không kết thúc `_test`"). README chưa nói: tên DB phải đúng một đoạn, tham số URL theo danh sách trắng, có kiểm mức DB ở `resetData`/`globalSetup`. Cũng chưa ghi bẫy của vòng 3: `vitest.config.js` gốc dùng `projects`, nên workspace mới không có config vitest riêng sẽ nhặt config gốc và chạy mọi workspace (rủi ro này hiện chỉ nằm trong báo cáo) | Sửa dòng 43 cho khớp `test-db-guard.js`. Thêm 1 dòng: "Workspace mới phải có `vitest.config.js`/`vite.config.js` riêng (xem `packages/shared/vitest.config.js`)" |
| 2 | MINOR | `apps/api/scripts/reset-test-db.js:27` | Khi DB tắt, lỗi P1001 (không kết nối được) bị in thành "Từ chối reset: … không trỏ DB test cục bộ ở mức DB (NFR08)", trong khi nguyên nhân thật là chưa `db:test:up`. Script vẫn thoát ≠0, không nuốt lỗi, nhưng câu dẫn gây hiểu nhầm (QA v3 cũng ghi nhận) | Nếu stderr có `P1001` thì in "Không kết nối được DB test. Chạy \"npm run db:test:up\"" giống `global-setup.js:10`. Ngược lại giữ câu hiện tại |
| 3 | MINOR | `apps/api/tests/T201-qa-isolation.test.js:33` (test của kiem-thu) | Quyết định của reviewer cho câu hỏi QA v2 #3: `/localhost\|DB test/` khớp cả thông báo "Không kết nối được DB test" của `globalSetup`, nên một mình TC-NFR08-02 không chứng minh chốt chặn config. Điều cần chứng minh đã được phủ đủ: unit `checkTestDbEnv` với host ngoài (`T201-db-helpers.test.js:18-22`) và TC-NFR08-05 khớp chặt `/Từ chối chạy test/` qua đường config. Không chặn | Lần sau kiem-thu đụng file này thì siết thành `/Từ chối chạy test/`. Devops không sửa test của QA |

Không có BLOCKER hay MAJOR. Lệnh tự chạy đều xanh và khớp "Bằng chứng chạy lệnh" vòng sửa 3. DB test đã tắt.
