# BUG-015 – Review v1 (reviewer)

Kết luận: **APPROVED**

## Đối chiếu
- NFR09 (`docs/DAC_TA.md:210`): "Độ phủ unit ≥ 70% ở module nghiệp vụ" → `thresholds` 70 cho cả 4 chỉ số, đúng (đặc tả không nêu chỉ số, áp cả 4 là chặt hơn, chấp nhận được).
- Glob `apps/api/src/modules/**` và `packages/shared/src/**` trùng đúng `coverage.include` trong `vitest.config.js`; không lệch đường dẫn. Báo cáo coverage in riêng từng thư mục, chứng tỏ glob khớp.
- CI `.github/workflows/ci.yml:80` chạy `npm run test:coverage` (= `vitest run --coverage`) nên tự đỏ khi dưới ngưỡng.
- Không có test bị xóa/skip; diff chỉ ở `vitest.config.js` (đã đối chiếu `git status`, không còn thay đổi tạm).

## Lệnh tự chạy
- `npm run test:coverage` → exit 0. Tổng: Statements 97.86, Branches 91.33, Functions 98.53, Lines 99.48. `packages/shared/src`: 98.75 / 79.46 / 87.75 / 100 (stmts/branch/func/lines), `apps/api/src/modules` các mục đều >= 83 branches. Khớp báo cáo.
- `npm run lint` → exit 0 (`--max-warnings 0`).

## Ghi chú nhỏ (không chặn)
- Chưa tự chạy thử hạ ngưỡng để thấy đỏ (không giữ thay đổi tạm vào config); tin báo cáo, cơ chế `thresholds` glob của Vitest là chuẩn.
