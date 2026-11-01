# Review T201 – kiem-thu – vòng 3
Kết luận: APPROVED

Góc nhìn: người viết test integration cho T203–T214; kiểm BUG-005 (a)(b)(c) đã đóng, đánh giá quyết định lệch đề xuất (dải IP riêng ở lớp mức DB), thử đường vòng mới theo kịch bản "vô ý export URL dev rồi chạy `npm test` / `db:test:reset`".

## Tôi đã tự kiểm tra
Đã đọc: dòng T201, BUG-005 trong `BANG_CONG_VIEC.md`; `reports/T201.md` mục "Vòng sửa 3"; `reports/BUG-005.md`; `apps/api/scripts/test-db-guard.js`, `reset-test-db.js`; `apps/api/tests/db.js`, `global-setup.js`; `vitest.config.js` gốc, `apps/api/vitest.config.js`, `packages/shared/vitest.config.js`. Không đọc `.env`/`.env.test`.

Test của QA **không bị sửa**: `T201-qa-guard-bypass.test.js` mtime 18:58:39, `T201-qa-isolation.test.js` mtime 18:44:23 (cả hai trước review v2 lúc 19:02); nội dung TC-NFR08-03 đọc lại khớp bản tôi viết.

Shell không export `DATABASE_URL`/`DIRECT_URL`/`DB_TEST_DRIVER` (`env | grep -cE` → 0). Git Bash, Windows 11.
```
$ npm run db:test:up            → K1–K7 OK, "Kiểm tra DB test: tất cả OK.", real 6.9s
$ npm run db:test:reset         → "Script executed successfully." "Đã reset DB test (db push + after_init.sql).", exit=0
$ NO_COLOR=1 npm test (lần 1)   → shared 2 files 21/21, api 14 files 123/123, web 7 files 32/32, exit=0
$ NO_COLOR=1 npm test (lần 2)   → giống hệt lần 1, exit=0
$ npx vitest run tests/T201-qa-guard-bypass.test.js tests/T201-qa-isolation.test.js --reporter=verbose
  → TC-NFR08-01…06 ✓, Test Files 2 passed, Tests 6 passed
```
Không chập chờn: 2 lần `npm test` cùng kết quả (shared chạy với `RUN …/packages/shared`, không nhặt `projects` gốc).

Đường vòng – kịch bản vô ý (DB nháp `nckh_dev_qa` có bảng `dev_marker` 1 dòng trên server test, đóng vai DB dev local; sau mỗi lệnh đếm lại):
```
S1 DATABASE_URL=DIRECT_URL=…localhost:54329/nckh_dev_qa  npm test (gốc)          → shared chạy, api "Từ chối chạy test … DB "nckh_dev_qa" …", exit=1; dev_marker 1, 1 bảng
S2 (như S1)                                              npm run db:test:reset    → "Từ chối reset …", exit=1; dev_marker 1
S3 chỉ DATABASE_URL dev (DIRECT_URL lấy từ .env.test)   npm run db:test:reset    → "Từ chối reset … DATABASE_URL …", exit=1; dev_marker 1
S4 URL kiểu Supabase pooler (…pooler.supabase.invalid:6543/postgres?pgbouncer=true&connection_limit=1)
                                                         npm test -w @nckh/api    → "host … chỉ cho phép localhost" cả 2 biến, exit=1
S5 dev, npx vitest run (gốc, projects)                                            → "Từ chối chạy test", exit=1; dev_marker 1
S6 dev, cwd apps/api/tests: npx vitest run T201-db-helpers                        → "Từ chối chạy test", exit=1
S7 dev, gốc: npx vitest run --root apps/api T201-db-helpers                       → "Từ chối chạy test", exit=1
S8 dev, cwd apps/web: npx vitest run ../api/tests/T201-db-helpers.test.js         → "No test files found", exit=1 (không chạm DB)
S9 dev, gốc: npx vitest run --project @nckh/api apps/api/tests/T201-db-helpers    → "Từ chối chạy test", exit=1
```
Đường vòng – cố ý (rủi ro devops ghi nhận), kiểm lớp mức DB:
```
cwd apps/api, DATABASE_URL=…/nckh_dev_qa npx vitest run --config <scratchpad>/empty.config.mjs --root . tests/T201-db-helpers.test.js
  → bỏ qua chốt chặn chuỗi + globalSetup; beforeAll resetData ném
    "Từ chối dọn dữ liệu: … ERROR: Từ chối: DB "nckh_dev_qa" tại "::1" không phải DB test cục bộ (NFR08)"
  → Tests 6 passed | 1 skipped; dev_marker còn 1 dòng
```
Phân tích URL (gọi thẳng `checkTestDbEnv`):
```
nhiều host  localhost:54329,db-dev…:5432/nckh_test → "không phải URL hợp lệ"  (chặn)
?%68ost=…   → tham số "host" (chặn) · ?HOST=x → chặn (danh sách trắng phân biệt hoa thường)
/nckh_test%3Fhost=x → DB "nckh_test?host=x" (chặn) · /nckh_test/ → chặn
u:p@db-dev…@localhost:54329/nckh_test → [] (hostname localhost, phần trước là userinfo – Prisma hiểu giống vậy)
#?host=x → [] (fragment, không phải tham số; lớp mức DB vẫn kiểm tên)
/%6eckh_test → [] (giải mã = nckh_test, đúng)
```
DB tắt:
```
$ npm run db:test:down → "Embedded: đã dừng server." "đã xóa …\nckh-db-test"; tasklist postgres = 0
$ time npm run db:test:reset (DB tắt) → "Từ chối reset: DATABASE_URL không trỏ DB test cục bộ ở mức DB (NFR08).\nError: P1001 Can't reach database server at `localhost:54329`", exit≠0, real 5.3s
$ npm run db:test:down (lần 2) → "Không có DB test nào đang chạy …"
```
Dọn: DB nháp `nckh_dev_qa` đã DROP trước khi tắt server; không để lại file tạm trong repo.

## Đối chiếu đặc tả
| Điều kiện đạt | Đạt? | Ghi chú |
|---|---|---|
| NFR08 – DB dev và test tách riêng | Đạt | BUG-003/004/005 đóng; 9 kịch bản vô ý S1–S9 đều chặn, `dev_marker` còn nguyên; đường cố ý `--config` khác vẫn bị lớp mức DB chặn trong `resetData` |
| Postgres 16 + pg_trgm/unaccent | Đạt | K1–K7 OK |
| Script reset DB test xác định | Đạt | reset → `npm test` ×2 cùng kết quả |
| Test file không chạy song song trên DB chung | Đạt | `fileParallelism: false` (đã đối chứng ở v2; devops đối chứng lại khi chạy từ gốc qua `projects`) |
| Dọn dữ liệu giữa test | Đạt | `resetData` + test DB thật xanh |
| Lỗi rõ, nhanh khi DB tắt | Đạt | `npm test` 5 s (devops), `db:test:reset` 5.3 s – xem MINOR #1 về câu chữ |

## Kiểm từng vấn đề vòng 2
| # vòng 2 | Mức | Đóng? | Bằng chứng |
|---|---|---|---|
| 1 BUG-005 (a) `/<db>/x_test`, (b) `?host=` | MAJOR | Đóng | `test-db-guard.js:13,29-32` một đoạn `^\w+_test$` + danh sách trắng; TC-NFR08-03/04/05 xanh 2/2; biến thể `%68ost`, `HOST`, `%3F` bị chặn |
| 2 BUG-005 (c) chạy từ gốc repo | MAJOR | Đóng | `vitest.config.js` gốc `projects`; TC-NFR08-06 xanh; S5, S7, S9 chặn; lớp `resetData` chặn cả khi `--config` khác |
| 3 TC-NFR08-02 khớp lỏng | MINOR | Đóng (chấp nhận) | Test của tôi; TC-NFR08-05 khớp chặt `/Từ chối chạy test/` và S1–S9 xác nhận thông báo đúng. Không siết test cũ để giữ nguyên bằng chứng các vòng trước |
| 4 "Còn lại / rủi ro" thiếu | MINOR | Đóng | `reports/T201.md` "Còn lại / rủi ro (vòng sửa 3)" liệt kê `--url`, `--config/--root`, dải IP riêng, docker/CI chưa kiểm |

## Đánh giá quyết định lệch đề xuất – dải IP riêng ở lớp mức DB
**Chấp nhận.** Lý do:
- Lớp chuỗi buộc host ∈ {localhost, 127.0.0.1, ::1}. Muốn tới server không cục bộ mà host vẫn là localhost chỉ có qua chuyển cổng (SSH tunnel, `kubectl port-forward`, `docker -p`) – không phải thao tác "vô ý export URL dev".
- Khi đi qua chuyển cổng tới DB đám mây, `inet_server_addr()` thường là địa chỉ VPC riêng (10.x/172.x) – tức là kiểm địa chỉ, dù chỉ cho loopback, cũng không đáng tin trong đúng trường hợp nó cần bảo vệ. Lá chắn thật là **tên DB `*_test` ở cả hai lớp** (Supabase dev là `postgres`, Supabase local `supabase start` cũng là `postgres`; DB dev local thường `nckh`/`nckh_dev`) – đã kiểm ở S1–S9.
- Chỉ cho loopback sẽ làm đỏ CI service container (T202) vì lý do không liên quan an toàn. Đổi lại phần hở còn lại (một DB tên `*_test` trên máy khác, được chuyển cổng về localhost) về bản chất cũng là DB test.
- Lưu ý câu trong "Quyết định thiết kế" ("DB dev Supabase có địa chỉ công khai → vẫn bị chặn") chỉ đúng khi kết nối trực tiếp; qua pooler/tunnel thì phải dựa vào tên DB. Không đổi kết luận (INFO).

## Rủi ro devops ghi nhận còn hở – có cần chặn ở T201?
**Không.** `prisma … --url <dev>` gọi tay và vitest `--config <file khác>`/`--root` ra ngoài đều là thao tác có chủ ý, không phải kịch bản NFR08 nhắm tới (vô ý trộn môi trường). Đường `--config` khác vẫn còn lớp `resetData` (đã kiểm: chặn, `dev_marker` còn). Muốn chặn `prisma` gọi tay phải bọc CLI – chi phí cao, lợi ít. Đề xuất cho T203 (không chặn T201): mọi file integration gọi `resetData` ở `beforeAll` **trước** khi chèn dữ liệu – khi đó cả đường `--config` khác cũng không ghi được vào DB dev.

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| 1 | MINOR | `apps/api/scripts/reset-test-db.js:26-28` | DB tắt / sai mật khẩu → `db:test:reset` in "Từ chối reset: DATABASE_URL không trỏ DB test cục bộ ở mức DB (NFR08)" kèm P1001 – câu chính gây hiểu nhầm là bị chốt chặn, không hướng dẫn `npm run db:test:up` như `globalSetup`. An toàn (đóng khi lỗi), chỉ là câu chữ | Phân biệt mã P0001 (từ chối) với lỗi kết nối, in hướng dẫn chạy `db:test:up`. Có thể làm cùng T202/T203 |
| 2 | INFO | `reports/T201.md` "Quyết định thiết kế" | "DB dev Supabase có địa chỉ công khai → vẫn bị chặn" chỉ đúng khi kết nối trực tiếp; lớp mạnh là tên DB (báo cáo đã ghi) | Không bắt buộc |
| 3 | INFO | – | Driver `docker` và CI chưa kiểm trên máy này (Docker không chạy, CAU_HOI #1) – lý luận 172.x chưa có bằng chứng chạy | T202: job test CI xanh lần đầu là bằng chứng `globalSetup` qua kiểm mức DB |

## Lỗi tìm thấy
| ID | Mức | Mô tả ngắn | Test đỏ | Trạng thái |
|---|---|---|---|---|
| BUG-003 | BLOCKER | reset xóa DB qua `DIRECT_URL` đã export | TC-NFR08-01 | Đã sửa – xanh (v2, v3) |
| BUG-004 | MAJOR | vitest chạy trên `DATABASE_URL` dev đã export | TC-NFR08-02 | Đã sửa – xanh (v2, v3) |
| BUG-005 | MAJOR | chốt chặn vượt được: `/<db>/x_test`, `?host=`, chạy vitest từ gốc repo | TC-NFR08-03…06 | Đã sửa – xanh 2/2 (xem `BUG-005-kiem-thu-v1.md`) |

Không mở lỗi mới: S1–S9 và thử phân tích URL không tìm được đường vòng nào cho kịch bản vô ý.

Trạng thái cuối: đã `db:test:down`, không còn tiến trình postgres, DATA_DIR đã xóa, DB nháp đã DROP.

Kết luận: APPROVED – BLOCKER 0, MAJOR 0, MINOR 1
