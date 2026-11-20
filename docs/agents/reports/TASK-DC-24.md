# TASK-DC-24 – Truy vết FR28–FR39 và /kiem-tra-cuoi bước 2–4

Trạng thái: **DONE (chưa hoàn tất bước 2: bị chặn, xem mục 3)**

## 1. Truy vết (làm xong)
- `docs/agents/TRUY_VET.md`: thêm mục 2b (bảng FR28–FR39 ↔ test, mỗi dòng từ grep thật `TC-FR(2[89]|3[0-9])` và tên khối `describe`) và mục 4b (FR thiếu test). Tiêu đề cập nhật tới FR39.
- `docs/DAC_TA.md` §9: ma trận khớp thực tế; chỉ sửa con trỏ tới TRUY_VET mục 2b.
- FR chưa đủ test:
  - FR29: không có mã `TC-FR29-*` nào, không E2E (cần SMTP thật). Test thật có ở `apps/api/tests/DC04-email.test.js`.
  - FR28, FR30–FR34: test thật có nhưng integration/web chưa gắn mã `TC-FRxx`; chỉ E2E có mã (`TC-FR28-E02`, `TC-FR30-E01`, `TC-FR31-E01`, `TC-FR32-E02`, `TC-FR33-E03/E04`, `TC-FR34-E01`).
  - FR35–FR39 có mã `TC-FRxx` ở integration và E2E.
  - Không FR nào hoàn toàn không có test.

## 2. Bước 3 (đã chạy)
`git grep -nE "\.only\(|\.skip\(|it\.todo|test\.fixme" -- 'apps/*/tests' 'apps/web/e2e' 'apps/web/src' 'packages'` → không kết quả (exit 1). ĐẠT.

## 3. Bước 2 (npm ci, lint, test --coverage, build, e2e): CHƯA CHẠY ĐƯỢC
- `npm run db:test:up` + `db:test:reset` chạy OK (DB nhúng, `@embedded-postgres`).
- `npm ci` lần 1 và 2 lỗi `EPERM unlink ...node_modules\@embedded-postgres\windows-x64\native\bin\icudt67.dll`: tiến trình `postgres.exe` của DB test (do `db:test:up` khởi động, dữ liệu ở `%TEMP%\nckh-db-test`) đang giữ file. `npm ci` đã xóa dở `node_modules` nên **`node_modules` hiện hỏng** (không có `.bin`, `eslint` không chạy được, `db:test:down` cũng lỗi vì mất `@embedded-postgres/windows-x64/index.js`, `pg_ctl.exe` đã bị xóa).
- Tôi định dừng tiến trình postgres đó bằng PowerShell `Stop-Process`, nhưng hệ thống phân quyền từ chối; không tìm cách vòng.
- Lỗi của quy trình: nên chạy `npm run db:test:down` TRƯỚC `npm ci` trên Windows. Cần ghi chú vào `/kiem-tra-cuoi`.

Việc con người/agent có quyền cần làm: dừng tiến trình `postgres.exe` thuộc `node_modules\@embedded-postgres` (Task Manager hoặc `taskkill /IM postgres.exe /F` nếu chắc đó là DB test), rồi `npm ci`, `npm run db:test:up`, `npm run db:test:reset`, và chạy lại bước 2 (mỗi lệnh 2 lần, E2E ~6 phút) và bước 4 (xác nhận các test ở TRUY_VET mục 2b đạt).

## 4. Bằng chứng trước đó
E2E 100/100 tại a6ffc2d (báo cáo DC-21..23); sau đó chỉ cột GV của R28 đổi (unit web + API đạt theo báo cáo giao). Chưa tái xác nhận trong task này.


## 5. Phiên chính hoàn tất (2026-11-20)
- Người dùng + phiên chính dừng `postgres.exe` (taskkill), `npm ci` thành công, prisma 5.22.0 theo lockfile, `prisma generate`.
- Bước 2, hai lượt liên tiếp: lint exit 0; `npm test -- --coverage` shared 115, api 1222, web 384 đạt, độ phủ api 94,01/89,05/97,07/95,25 (stmts/branch/func/lines), shared 93,69/79,37/77,77/95,95; build ✓; E2E `100 passed (6.3m)`, `100 passed (6.4m)`.
- Bước 3: không `.only/.skip/todo/fixme`. Bước 6: grep bí mật chỉ ra mật khẩu mặc định localhost của DB test/dev và chuỗi giả trong test (đã chấp nhận từ trước).
- Bước 4: gắn `TC-FR29-01…07` vào `a/DC04-email.test.js` (chỉ đổi tên; 12/12 đạt), TRUY_VET cập nhật.
- `/kiem-tra-cuoi` thêm ghi chú Windows trước `npm ci`.
- FINAL-bao-mat-v3 APPROVED; sửa m2 (limiter `POST /api/applications/:id/withdraw`), m1 (migration `20261120010000_final_score_range_check`: CHECK điểm 0..10 cho ProcessScore, DefenseScore, CouncilAssignment.finalScore + test trong `tests/security/FINAL-v3-bao-mat.test.js`). Sau sửa: `npm test` 115/1227/384 đạt, lint 0, E2E `100 passed (6.3m)`.
