# FINAL-reviewer (T708) – lần 2

Lần 1 (tóm tắt): CHANGES_REQUESTED – `npm ci` EPERM do tiến trình vitest sót khóa DLL Prisma (bước 2 không chạy được) và thiếu mã TC-FR cho FR01/02/09/10/19/20/23/26 (bước 4). Đã xử lý qua BUG-014 (455d753) và BUG-015 (cd08595).

Kết luận lần 2: **APPROVED**

## 1. BANG_CONG_VIEC: ĐẠT
Mọi dòng T/BUG ở DONE, trừ T708 (DOING, chính task này). Không có BLOCKED.

## 2. Chạy lệnh hai lần liên tiếp: ĐẠT
Trình tự mỗi lượt: `npm run db:test:down` → `npm ci` → `npx -w @nckh/api prisma generate` → `npm run db:test:up` → `npm run db:test:reset` → `npm run lint` → `npm run test:coverage` (= `vitest run --coverage` ở gốc, có thresholds 70% theo thư mục) → `npm test` → `npm run build -w @nckh/web` → `npm run test:e2e -w @nckh/web`. Trước mỗi `npm ci` không còn tiến trình node/vitest/playwright chạy nền.

| Bước | Lượt 1 | Lượt 2 (chạy lại) |
|---|---|---|
| `npm ci` | exit 0 | exit 0 |
| `prisma generate` / `db:test:up` / `db:test:reset` | exit 0 / 0 ("Kiểm tra DB test: tất cả OK") / 0 | exit 0 / 0 / 0 |
| `npm run lint` | `eslint . --max-warnings 0`, exit 0 | exit 0 |
| `npm run test:coverage` | `Test Files 99 passed (99)`, `Tests 1248 passed (1248)`, exit 0 | `Test Files 99 passed (99)`, `Tests 1248 passed (1248)`, exit 0 |
| `npm test` | shared 73 passed (7 file), api 945 passed (64 file), web 230 passed (28 file), exit 0 | như lượt 1, exit 0 |
| `npm run build -w @nckh/web` | `✓ built in 351ms`, exit 0 (chỉ cảnh báo kích thước chunk) | `✓ built in 328ms`, exit 0 |
| `npm run test:e2e -w @nckh/web` | `58 passed (2.9m)`, exit 0 | `58 passed (3.0m)`, exit 0 |

Độ phủ (tính từ `coverage/coverage-summary.json`, ngưỡng 70% cả 4 chỉ số, vitest exit 0 nên đã qua thresholds):
- `apps/api/src/modules/**`: lines 99.43, statements 97.71, functions 99.60, branches 92.75 (lượt 1: 99.43 / 97.68 / 99.60 / 92.70).
- `packages/shared/src/**`: lines 100, statements 98.75, functions 87.76, branches 79.46 (hai lượt như nhau).
- All files: 97.86 stmts / 91.33 branch / 98.53 funcs / 99.48 lines.

**Sự cố trong lúc chạy:** lượt 2 đầu tiên bị hỏng vì người dùng chạy `taskkill /IM postgres.exe /F` (6 tiến trình) giữa chừng: `npm ci`, generate, db up/reset, lint đều exit 0 nhưng `test:coverage` exit 1 (`30 failed | 69 passed` file, `31 failed | 930 passed | 287 skipped`, 26 lần "Can't reach database server at localhost:54329"), `npm test` api lỗi "Không kết nối được DB test", e2e exit 1 cùng nguyên nhân. Đây là lỗi môi trường (DB bị tắt từ ngoài), không phải lỗi code. Lượt 2 đã được **chạy lại trọn vẹn từ `db:test:down` + `npm ci`**, toàn bộ xanh như bảng trên; data dir DB test không hỏng (`db:test:up` báo tất cả OK). Không gặp EPERM ở `npm ci` lần này.

## 3. `.only/.skip/it.todo/test.fixme`: ĐẠT
`git grep` chỉ trả về dòng chữ mô tả trong tài liệu (`docs/agents/reports/T203.md:182,241`, `reviews/T203-reviewer-v1.md:14`, `v2.md:14`, và file này). Không có trong test/code. Diff BUG-014 (425ffda..cd08595) ở test chỉ đổi tên `it(...)`, không đổi assertion.

## 4. TRUY_VET (TC-FRxx): ĐẠT
Mọi FR P1/P2 có mã `TC-FRxx` trong `apps`/`packages` (`git grep`), và toàn bộ test đạt ở bước 2:
FR01 `auth.test.js`; FR02 `T207a-accounts`, `T207b-import`; FR03 `T214-*`; FR04 `T206-catalog-rounds`; FR05 `T214-gd2-flow`, e2e `m1`; FR06 `fr06-dataset`, e2e `gd6`/`m1`; FR07 `T214-*`, e2e `m1`/`roles`; FR08 e2e `m1`; FR09 `T401-milestones`; FR10 `T402-progress`, `T404-feedback`; FR11/FR12/FR24/FR27 e2e `m4`; FR13 `T505-notify-dedupe`, e2e `m5`; FR14 `T505-stats-consistency`, e2e `m5`; FR15 `T204-audit`; FR16 `T213`, `T214-*`, e2e `m1`; FR17 `T212b-snapshots`, `T403-documents`; FR19 `T601-change-requests`; FR20 `T602-cancel`; FR21 e2e `gd6`; FR23 `T604-result-correction`; FR25 `T214-*`, e2e `m5`/`roles`; FR26 `T403-documents`, `T608-devops-scripts`. (FR18, FR22 là P3.) `docs/agents/TRUY_VET.md` đã cập nhật tương ứng.

## 5. NFR01–NFR10: ĐẠT (phần sau deploy là việc của người)
`docs/agents/TRUY_VET.md` mục 3 trích đường dẫn cho cả 10 NFR (test `apps/api/tests/security/T703c-bao-mat.test.js`, `T214-gd2-flow.test.js`, `T201-*`, `perf/T704.perf.js`, `apps/web/e2e/gd6.spec.js`, `T706b.test.js`; cấu hình `vitest.config.js`, `.github/workflows/ci.yml`, `apps/web/vercel.json`, `render.yaml`). NFR09 nay có `thresholds` 70% thật (BUG-015). Còn phải đo sau deploy: `docs/VAN_HANH.md` §6.4 mục 1–9 (cookie trên trình duyệt thật, CORS/header trên Vercel, Data API/tách role Supabase, p95 trên Render+Supabase, số hop `trust proxy`).

## 6. Bí mật trong repo: ĐẠT
Mẫu `git grep` sau khi lọc `localhost|127.0.0.1|u:p@|.invalid` chỉ còn dòng mẫu lệnh trong `.claude/commands/kiem-tra-cuoi.md:17`. Không đọc `.env`.

## Hạn chế đã biết (không chặn)
- Job e2e trong CI chưa có lần chạy thật trên GitHub.
- `packages/shared` branches 79.46% (trên ngưỡng, thấp nhất trong các chỉ số).
- Cảnh báo kích thước chunk khi build web (không lỗi).

## Mục không đạt
Không có.
