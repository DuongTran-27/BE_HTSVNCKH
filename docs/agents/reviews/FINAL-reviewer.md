# FINAL-reviewer – kiểm tra cuối (chạy lại 2026-11-11)

Lần trước: T708 lần 2 (2026-11-08) APPROVED – 1248 test, 58 E2E; lần 1 CHANGES_REQUESTED (EPERM `npm ci`, thiếu TC-FR) đã xử lý qua BUG-014/015.

Kết luận lần này: **APPROVED**

| Mục | Kết quả |
|---|---|
| 1. BANG_CONG_VIEC | ĐẠT – 3 task REVIEW được duyệt trong lần này (dưới) |
| 2. Lệnh chạy hai lần | ĐẠT – hai lượt giống hệt nhau, đều xanh |
| 3. `.only/.skip/todo/fixme` | ĐẠT |
| 4. TRUY_VET TC-FRxx | ĐẠT |
| 5. NFR01–NFR10 | ĐẠT (phần sau deploy là việc của người) |
| 6. Bí mật | ĐẠT |

## 1. BANG_CONG_VIEC: ĐẠT
Mọi dòng T/BUG/TASK ở DONE, trừ 3 task "Sau hoàn thành" ở REVIEW (duyệt dưới đây). Không có BLOCKED (`grep -c BLOCKED` = 0). Sau khi ghi file này, điều phối viên chuyển 3 task sang DONE.

### TASK-DEMO-STATS: APPROVED
- `apps/api/scripts/demo-stats.js`: chặn `NODE_ENV=production` (dòng 92) và gọi `assertSeedAllowedDb` (dòng 93, cờ `nckh.seed_allowed` ở mức database, phiên không ghi đè được). Một transaction; mỗi bước đi qua `findTransition` từ `@nckh/shared` (không tự định nghĩa chuyển trạng thái), sai thì ném lỗi; mỗi bước ghi `StatusHistory`. Idempotent (có đợt 2023-2024 thì trả 0). Không nằm trong lệnh start của Render.
- `apps/api/tests/demo-stats.test.js` (2 test): số đề tài từng năm, chỉ trạng thái kết thúc, chạy lại không nhân đôi, lịch sử nối liền DRAFT → trạng thái hiện tại, đúng vai trò actor, đúng một kết quả hiện hành khi CLOSED, từ khóa đúng bộ chủ đề. Tự chạy: `Tests 3 passed` (cùng fr06-pgtrgm).
- MINOR (không chặn): không có test cho hai nhánh từ chối (production / DB chưa bật cờ) của `demoStats`; `assertSeedAllowedDb` đã có test riêng ở seed. Đề xuất thêm 1 test `NODE_ENV=production` → reject nếu sửa script sau này.

### TASK-FR06-PGTRGM: APPROVED
- `apps/api/tests/fr06-pgtrgm.test.js`: dùng đúng biểu thức của `apps/api/src/modules/similarity/prismaRepo.js:22` (`similarity(lower(immutable_unaccent(...)))`), tham số hóa bằng `$queryRaw` (không SQL injection), chỉ gọi hàm, không đọc/ghi bảng. `tests/fr06-eval/lib.js` truyền `titleScore` vào phần tử kho; `engine.js:69` dùng `d.titleScore ?? trigramSimilarity(...)` nên điểm pg thật được dùng.
- Tự chạy (verbose): chênh |pg − JS| trung bình 0.000, lớn nhất 0.000, 0 cặp đổi mức; pg REVIEW+ P=92.9% R=92.9%, HIGH P=100% R=92.9% – khớp báo cáo.
- MINOR: test không assert điểm pg thực sự đi vào engine (ví dụ `expect(real[i].titleScore).toBe(pg[p.id])`); kết quả trùng khít JS khiến lỗi "bỏ qua titleScore" sẽ không bị phát hiện. Đã đối chiếu bằng đọc code nên không chặn.

### TASK-E2E-GD6B: APPROVED
- `apps/web/e2e/gd6b.spec.js` (TC-FR18/19/20/22/23-E01) và `gd45b.spec.js` (TC-FR04/09/10-E01): đi qua UI với backend thật, kiểm kết quả cuối bằng DB chỉ đọc (tên mới + không tạo Submission mới; Advising hiện hành là GV mới; CANCELLED + đúng 1 StatusHistory; mốc không còn PASSED; ResultVersion 1 GOOD giữ, 2 EXCELLENT hiện hành; đúng 1 MilestoneDueChange có lý do; percent 40; mốc đợt sai thứ tự không ghi DB). Mỗi project Playwright dùng bộ dữ liệu riêng nên desktop/mobile không đạp nhau; `workers: 1`, `retries: 0`.
- `apps/web/src/lib/changeRequests.js:62`: `{ ...err, message: err.message, details }` – sửa đúng gốc (message của Error không enumerable). Có test `src/lib/changeRequests.test.js`. Văn bản UI tiếng Việt.
- Không có MINOR đáng ghi.

## 2. Chạy lệnh hai lần liên tiếp: ĐẠT
Trình tự mỗi lượt (tuần tự, không chạy song song): `npm run db:test:down` → `npm ci` → `npx -w @nckh/api prisma generate` → `npm run db:test:up` → `npm run db:test:reset` → `npm run lint` → `npm run test:coverage` (= `vitest run --coverage` ở gốc, có thresholds 70% theo thư mục; đây là dạng chạy được của `npm test -- --coverage`) → `npm test` → `npm run build -w @nckh/web` → `npm run test:e2e -w @nckh/web`. Trước lượt 1 không có tiến trình node/postgres; không gặp EPERM.

| Bước | Lượt 1 (19:52–20:03) | Lượt 2 (20:04–20:15) |
|---|---|---|
| `npm ci` | `added 530 packages, and audited 534 packages in 21s` / `4 moderate severity vulnerabilities`, exit 0 | như lượt 1, exit 0 |
| generate / db up / reset | exit 0 / `Kiểm tra DB test: tất cả OK.` / `Đã reset DB test (migrate reset).` | như lượt 1 |
| `npm run lint` | `> eslint . --max-warnings 0`, exit 0 | exit 0 |
| `npm run test:coverage` | `Test Files 108 passed (108)` / `Tests 1281 passed (1281)`, exit 0 | `Test Files 108 passed (108)` / `Tests 1281 passed (1281)`, exit 0 |
| `npm test` | shared `Tests 73 passed (73)` (7 file), api `Tests 972 passed (972)` (72 file), web `Tests 236 passed (236)` (29 file), exit 0 | như lượt 1, exit 0 |
| build web | `✓ built in 672ms`, exit 0 (chỉ cảnh báo kích thước chunk) | `✓ built in 674ms`, exit 0 |
| e2e | `74 passed (4.6m)`, exit 0 | `74 passed (4.6m)`, exit 0 |

Phần cuối coverage (cả hai lượt giống nhau):
```
Statements   : 97.83% ( 3758/3841 )
Branches     : 91.37% ( 1950/2134 )
Functions    : 98.55% ( 1088/1104 )
Lines        : 99.48% ( 2728/2742 )
```
Theo thư mục (tính từ `coverage/coverage-summary.json`, hai lượt như nhau):
- `apps/api/src/modules/**`: lines 99.44, statements 97.68, functions 99.60, branches 92.77.
- `packages/shared/src/**`: lines 100, statements 98.75, functions 87.76, branches 79.46.

Thêm: chạy riêng verbose `tests/fr06-pgtrgm.test.js` + `tests/demo-stats.test.js` → `Tests 3 passed (3)`; `src/lib/changeRequests.test.js` → `Tests 1 passed (1)`. E2E có đủ gd45b/gd6b ở cả `[desktop]` và `[mobile]`. Cuối cùng đã `npm run db:test:down`, không còn tiến trình node/postgres; `git status` sạch.

`npm audit`: 4 moderate đều là `minimatch` qua `eslint` (devDependency); `npm audit --omit=dev` → `found 0 vulnerabilities`. Không chặn.

## 3. `.only/.skip/it.todo/test.fixme`: ĐẠT
`git grep` chỉ trả về dòng chữ trong tài liệu (`docs/agents/reports/T203.md:182,241`, `docs/agents/reviews/T203-reviewer-v1.md:14`, `v2.md:14`, bản cũ của file này). Không có trong test/code.

## 4. TRUY_VET (TC-FRxx): ĐẠT
`git grep -hoE "TC-FRxx-…" -- apps packages`: mọi FR01–FR27 có ít nhất 1 mã (FR18, FR21, FR22, FR24 có 1; các FR khác 2–14). FR18, FR22 là P3 (`docs/DAC_TA.md:56,60`) nhưng nay cũng có E2E. Tất cả test mang mã đều nằm trong 1281 test + 74 E2E đạt ở bước 2. `docs/agents/TRUY_VET.md` đã ghi gd6b/gd45b (dòng 76) và TC-FR06-95 (dòng 78, 83).

## 5. NFR01–NFR10: ĐẠT
`docs/agents/TRUY_VET.md` mục 3 (dòng 61–70) trích đường dẫn cho cả 10 NFR; các file đã kiểm tồn tại: `apps/api/tests/security/T703c-bao-mat.test.js`, `apps/api/tests/T214-gd2-flow.test.js`, `apps/api/tests/T201-db-test.test.js`, `apps/api/tests/T201-qa-isolation.test.js`, `apps/api/tests/perf/T704.perf.js`, `apps/api/tests/T706b.test.js`, `apps/web/e2e/gd6.spec.js`, `apps/web/tests/middleware.test.js`, `vitest.config.js` (thresholds), `.github/workflows/ci.yml`, `apps/web/vercel.json`, `render.yaml`. Còn đo sau deploy: `docs/VAN_HANH.md` §6.4.
- MINOR (tài liệu): `docs/agents/TRUY_VET.md:69` (NFR09) vẫn ghi "Ngưỡng ≥ 70% **chưa gắn `thresholds`**" – đã sai từ BUG-015; `vitest.config.js` có thresholds 70% cho cả hai thư mục. Đề xuất sửa câu này và cập nhật số đo (99.44/97.68/99.60/92.77 và 100/98.75/87.76/79.46).

## 6. Bí mật trong repo: ĐẠT
Kết quả `git grep` chỉ gồm:
- Chuỗi DB test/dev cục bộ cố định `postgres:postgres@localhost:5432x` (`apps/api/.env.test:3-4`, `apps/web/e2e/env.js:8-9`, `apps/api/scripts/db-dev.js:12`, `README.md:25`, `apps/api/tests/T201-db-helpers.test.js:9`): mật khẩu mặc định của embedded-postgres/Docker test, chỉ nghe localhost, không phải bí mật – chấp nhận như T708. `apps/api/.env.test` chỉ chứa `DATABASE_URL`, `DIRECT_URL`.
- Giá trị giả `u:p@…`, `postgres.ref:secret@db-dev.example.invalid` trong test và báo cáo; dòng mẫu lệnh `.claude/commands/kiem-tra-cuoi.md:17`.
Quét thêm `PRIVATE KEY|eyJhbGciOi|sk_live|AKIA…` ngoài `docs`: không có. File env được track: chỉ `.env.example` (2) và `.env.test`. Không đọc `.env`.

## Hạn chế đã biết (không chặn)
- Job e2e trong CI chưa có lần chạy thật trên GitHub.
- `packages/shared` branches 79.46%, functions 87.76% (trên ngưỡng, thấp nhất).
- Cảnh báo kích thước chunk khi build web; 4 moderate `minimatch` chỉ ở devDependency.
- 3 MINOR ở trên (2 test bổ sung, 1 dòng tài liệu) – có thể làm sau, không ảnh hưởng kết luận.

## Mục không đạt
Không có.
