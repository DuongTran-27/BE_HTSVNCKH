# Review T202 – reviewer – vòng 1
Kết luận: APPROVED

Phạm vi: vòng 1 của T202 (ESLint + Prettier + GitHub Actions + độ phủ + engines + P1001 trong `reset-test-db.js` + README/VAN_HANH). CI thật **chưa chạy** vì cần con người push. Workflow được đánh giá bằng cách đọc kỹ. Theo yêu cầu, việc này không tính là BLOCKER, nhưng các điều kiện chỉ chứng minh được trên CI vẫn **chưa có bằng chứng** (xem bảng đối chiếu).

## Tôi đã tự kiểm tra
Đã đọc: CLAUDE.md, dòng T202 trong `BANG_CONG_VIEC.md`, `reports/T202.md`, NFR08/NFR09 trong `docs/DAC_TA.md`, `.claude/commands/kiem-tra-cuoi.md`, `eslint.config.js`, `.prettierrc.json`, `.github/workflows/ci.yml`, `vitest.config.js` gốc, `apps/api/vitest.config.js`, `package.json` gốc, `apps/api/scripts/reset-test-db.js`, `apps/api/tests/T202-reset-errors.test.js`, README, `docs/VAN_HANH.md` §2, cùng `git diff` của mọi file đã sửa. Không đọc `.env`. Chỉ dùng `git ls-files` để xác nhận `.env.test` được theo dõi.

Đã soát diff code sản phẩm:
- `db-test.js:58` và `tests/db.js:8`: chỉ thêm `{ cause: e }` (luật `preserve-caught-error`). Thông báo và luồng ném lỗi giữ nguyên, không đổi hành vi.
- `reset-test-db.js:27-31`: thêm nhánh P1001, nhánh còn lại vẫn là "Từ chối reset …", `process.exit(1)` giữ nguyên.
- Không thêm `eslint-disable` nào. Không có `.skip`, `.only`, `.todo`, `skipIf`, `runIf`. Không file `*.test.*` nào bị sửa: `git diff HEAD` trên test rỗng, chỉ có một file test mới.

Lệnh tự chạy (Git Bash, Windows 11, Node 24.12.0). Trước khi chạy đã `unset DATABASE_URL DIRECT_URL DB_TEST_DRIVER`.
```
$ npm run lint                         → eslint .  exit=0 (0 lỗi, 0 cảnh báo)
$ npm run format:check                 → All matched files use Prettier code style!  exit=0
$ npx prettier --check apps/api/tests/T202-reset-errors.test.js eslint.config.js → đạt (file mới của PR qua bước CI)
$ npx eslint apps/web/src -f json      → 16 file được lint, trong đó 7 .jsx (JSX thực sự được kiểm)
# Đối chứng: cấu hình có bắt lỗi thật (stdin)
  apps/web/src/zz.jsx: import thừa → no-unused-vars; hook trong if → react-hooks/rules-of-hooks; <Undef/> → no-undef
  apps/api/src/zz.js: biến thừa, định danh chưa khai báo → báo; `window` trong api → no-undef (globals tách đúng)
$ npm run db:test:up                   → K1–K7 OK, "Kiểm tra DB test: tất cả OK."
$ npm run db:test:reset                → "Đã reset DB test (db push + after_init.sql)."
$ NO_COLOR=1 npm test                  → shared 2 files 21/21; api 15 files 124/124; web 7 files 32/32; exit=0
$ NO_COLOR=1 npm run test:coverage     → exit=0; Stmts 85.75% (271/316), Branch 78.77% (141/179),
                                         Funcs 73.68% (56/76), Lines 88.84% (223/251)
                                         topics 70.58% dòng / 20% hàm; auth 87.05%; similarity 93.39%; shared 100%
$ npm run db:test:down                 → "Embedded: đã dừng server." "đã xóa …\nckh-db-test"; tasklist postgres = 0
$ npm run build -w @nckh/web           → index-GR0p_oSS.js 343.51 kB, ✓ built, exit=0
$ npm audit --audit-level=high         → 6 moderate (minimatch qua eslint / eslint-config-prettier), exit=0
```
Kết quả khớp hoàn toàn với "Bằng chứng chạy lệnh" trong báo cáo (số test, số liệu độ phủ, kích thước bundle, số moderate). Api 124 = 123 (T201) + 1 test mới. Shared và web giữ nguyên 21 và 32.

Thêm: lockfile có đủ 4 binding Linux (`@rolldown/binding-linux-x64-gnu`, `lightningcss-linux-x64-gnu`, `@tailwindcss/oxide-linux-x64-gnu`, `@embedded-postgres/linux-x64`). Các file 0% độ phủ (`prismaRepo.js`, `topics/code.js`) đúng là không được test nào import (chỉ `server.js` dùng), nên số liệu độ phủ không bị báo thiếu do cấu hình. `coverage/` đã nằm trong `.gitignore`.

Đọc kỹ workflow `ci.yml`:
- Service `postgres:16` map cổng `54329:5432`, có healthcheck, `TZ` đặt cho K2. Job chạy trên host, nên kết nối đi qua NAT Docker và `inet_server_addr` sẽ là IP container 172.x, nằm trong dải mà lớp kiểm mức DB chấp nhận.
- `DB_TEST_DRIVER=external` khớp QĐ §1.1/§3. Thứ tự `npm ci` → `prisma generate` → `db:test:up` → `db:test:reset` → `npm test` đúng yêu cầu task.
- Bước `inet_server_addr`: `node -e` chạy ở chế độ CommonJS (không có cú pháp ESM), `process.loadEnvFile` có từ Node 21.7 nên chạy được trên cả 22.22 và 24. `.env.test` được theo dõi trong git nên có trên CI.
- Bước Prettier cho file mới: `fetch-depth: 0` giúp có `origin/<base>`. Diff ba chấm từ merge commit của PR cho đúng phạm vi PR. Pathspec `'*.js'` của git khớp mọi cấp thư mục. `xargs -r` không chạy khi danh sách rỗng.
- `permissions: contents: read`, không dùng secret. Mật khẩu `postgres` là mật khẩu DB test dùng một lần, chấp nhận được.
- Bước độ phủ: shell mặc định của GitHub (`bash -e`) làm job đỏ khi `test:coverage` đỏ. Artifact có `if: always()`.

## Đối chiếu đặc tả
| Điều kiện đạt | Đạt? | Ghi chú |
|---|---|---|
| ESLint + Prettier (NFR09) | Đạt | Lint xanh, không tắt luật để che lỗi. Ngoài recommended chỉ có `no-unused-vars` bỏ qua tiền tố `_` (quy ước sẵn có) và `eslint-config-prettier` (chỉ tắt luật định dạng). Prettier mới áp cho file mới (xem câu hỏi 3). |
| GitHub Actions lint + test mỗi PR, có service Postgres | Đạt (đọc) / chưa chạy thật | `on: pull_request` không lọc nhánh. Chưa có lần chạy CI thật. |
| `@vitest/coverage-v8`, báo độ phủ module nghiệp vụ trên CI | Đạt cục bộ | `test:coverage` xanh. Job Summary + artifact chỉ kiểm được bằng đọc. |
| Ma trận Node 22.22 + 24, `engines >=22.22.0` | Đạt (đọc) | Chưa chứng minh `setup-node` tải được 22.22 (VAN_HANH §2 bước 6 có hướng dẫn). |
| `npm ci` giữ optional deps | Đạt | Không có `--omit=optional`, lockfile đủ binding Linux. |
| CI `db:test:up` → `db:test:reset` trước `npm test` | Đạt (đọc) | |
| Lớp kiểm mức DB qua được IP 172.x | **Chưa có bằng chứng** | Cục bộ chỉ thấy `::1`. Phải xác nhận ở lần chạy CI đầu tiên (VAN_HANH §2 bước 3). |
| `reset-test-db.js` tách P1001 khỏi từ chối | Đạt | `T202-reset-errors.test.js` xanh. Báo cáo ghi test đỏ trên bản cũ, khớp logic diff. Nhánh từ chối vẫn được TC-NFR08 phủ. |
| README chốt chặn vòng 3 + cảnh báo workspace mới | Đạt | Nội dung khớp `test-db-guard.js` (một đoạn tên DB, danh sách trắng tham số, lớp mức DB). |
| Không thêm high/critical | Đạt | 6 moderate trong công cụ dev, lý do chấp nhận hợp lý (`audit fix --force` sẽ hạ eslint). |

## Trả lời câu hỏi của devops
1. **Ngưỡng độ phủ.** Không bắt buộc trong T202 vì task chỉ yêu cầu "báo". Tôi vẫn khuyến nghị bật sớm **một ngưỡng toàn cục** `coverage.thresholds: { lines: 70 }` (không dùng `perFile`, không đặt ngưỡng cho functions/branches). Hiện tại đạt 88.84%, nên ngưỡng chỉ chặn khi độ phủ tụt mạnh, không chặn một module mới đang thiếu test giữa chừng. Nếu bật ngưỡng theo từng module hoặc functions thì để `/kiem-tra-cuoi`, vì `topics` hiện chỉ 20% hàm. Việc này có thể làm trong T202 vòng sau hoặc một task nhỏ riêng. Tôi không coi đây là lỗi.
2. **Phạm vi "module nghiệp vụ"** = `apps/api/src/modules/**` + `packages/shared/src/**` (trừ `*.test.js`): **chấp nhận**. Phạm vi này khớp `kiem-tra-cuoi.md:11`. `lib/` và `middlewares/` là hạ tầng, được phủ qua test integration nhưng không tính vào NFR09.
3. **Prettier chỉ cho file mới**: **chấp nhận**. Format hàng loạt 49 file sẽ làm rối `git blame` và dễ xung đột với các task đang chạy song song. Nếu muốn format toàn repo thì mở task riêng, chạy vào lúc không có task nào ở DOING. Rủi ro đã ghi trong báo cáo: file cũ bị sửa trong PR không được kiểm.

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| 1 | MINOR | `.claude/commands/kiem-tra-cuoi.md:11` | Lệnh độ phủ ở kiểm tra cuối là `npm test -- --coverage`. Lệnh này chạy `vitest --coverage` trong **từng workspace** với config riêng, không dùng `coverage.include` ở `vitest.config.js` gốc. Kết quả là số liệu khác (phủ toàn bộ `apps/api`, ghi ra `apps/api/coverage`) và không khớp với `npm run test:coverage` mà T202 vừa chuẩn hóa. | Đổi thành `npm run test:coverage`. `.claude/` thuộc thẩm quyền người dùng/kiến trúc sư, nên ghi đề xuất này, không tự sửa. |
| 2 | MINOR | `.github/workflows/ci.yml:7`; `docs/VAN_HANH.md:41` | Repo hiện chỉ có nhánh `master` và chưa có remote. Workflow chỉ chạy khi push vào `main`, còn VAN_HANH yêu cầu "mở PR vào `main`". Nếu remote giữ tên `master` thì push sẽ không kích hoạt CI. Nếu `main` được tạo rỗng hoặc từ commit cũ thì bước "Prettier cho file mới" sẽ kiểm cả các file cũ chưa format, và job `lint` đỏ ngay ở PR đầu. | VAN_HANH §2 bước 1 cần ghi rõ: trước tiên đẩy lịch sử hiện có (đến commit trước T202) thành nhánh `main` trên GitHub, rồi mới mở PR chứa T202. Có thể thêm `master` vào `branches` nếu muốn giữ tên cũ. |
| 3 | MINOR | `package.json:15`; `eslint.config.js:20` | `react-hooks/exhaustive-deps` để mức `warn`, nhưng `eslint .` không có `--max-warnings`, nên cảnh báo không bao giờ làm CI đỏ và sẽ tích tụ dần. Hiện tại đang 0 cảnh báo. | Đổi script thành `"lint": "eslint . --max-warnings 0"` để giữ mức 0. |
| 4 | INFO | `apps/api/scripts/reset-test-db.js:29-31` | Chỉ P1001 được tách riêng. Các lỗi kết nối khác như P1000 (sai mật khẩu) hay P1003 (DB chưa tồn tại) vẫn báo "Từ chối reset … (NFR08)". Thông báo gây hiểu nhầm nhưng an toàn vì vẫn thoát ≠0. Phạm vi task chỉ yêu cầu P1001. | Không bắt buộc. Nếu sửa thì tách theo "có `P0001`/RAISE từ chốt chặn" thay vì theo P1001. |
| 5 | INFO | `.github/workflows/ci.yml:76-80` | Leg Node 24 chạy bộ test hai lần (`npm test` rồi `test:coverage`). Chấp nhận được vì hai đường vào khác nhau (workspaces và `projects` gốc) đều được kiểm. | Giữ nguyên. Chỉ cân nhắc lại khi thời gian CI trở thành vấn đề. |
| 6 | INFO | — | CI thật chưa chạy. Chưa có bằng chứng cho: Node 22.22 trên `setup-node`, `npm ci` trên Linux, K2 với `TZ` của service, và lớp kiểm mức DB với IP 172.x. | Con người làm theo VAN_HANH §2. Nếu có job đỏ thì devops mở BUG (QĐ §1.5), không nới chốt chặn. |

Không có BLOCKER hay MAJOR. Lệnh tự chạy đều xanh và khớp báo cáo.

Kết luận: APPROVED – 0 BLOCKER, 0 MAJOR, 3 MINOR (+3 INFO)
