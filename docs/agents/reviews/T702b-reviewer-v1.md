# Review T702 bước B (E2E) – reviewer v1

Kết luận: **APPROVED**

## Bằng chứng tự chạy
- `npm run lint`: sạch (max-warnings 0).
- `npm test`: api 7/73, 58/735, web 25/219 file/test đều passed.
- `npm run test:e2e -w @nckh/web`: 54 passed (2.6m), desktop + mobile 360 px.
- `grep skip|.only|fixme` trong `apps/web/e2e`: không có. Không sửa code sản phẩm (`git diff` apps/api, apps/web/src, packages: rỗng).

## Đối chiếu dòng bảng
- Theo vai trò: roles.spec (ADMIN không nghiệp vụ, TC-FR25-E04). Đạt.
- Cán bộ khoa khác 403: TC-FR25-E05, dữ liệu `CBX` phạm vi khoa KT riêng. Đạt.
- Yêu cầu chỉnh sửa/từ chối qua UI: TC-FR07-E05/E06 (lý do bắt buộc, SV thấy lý do, gửi lại lần 2). Đạt.
- Viewport 360 + desktop: hai project trong `playwright.config.js`, mỗi project dùng bộ dữ liệu riêng (prefix) nên không phụ thuộc thứ tự đợt, không đụng nhau. Đạt.
- Linux/CI: `prepare.js` dùng `fileURLToPath(new URL(...))`, bỏ regex Windows. Đạt (chưa chạy trên Linux thật, chấp nhận; xác nhận ở CI/T707).
- Selector ổn định, bỏ `p.text-sm`: dùng role/label. Đạt.
- /thong-ke, /thong-bao 360 px: TC-NFR07-E01 assert `overflowX <= 0`, thêm /xet-duyet, /yeu-cau. Đạt.
- G5: TC-FR06-E09 (lý do bắt buộc, SV thấy ghi chú, không có nút, không cấp lại). Đạt phần UI.
- FR21 người rời nhóm: TC-FR21-E01 bắt mọi phản hồi `/api/` 403 sau khi rời, mở lịch sử, Lần gửi 1/2, so sánh. Assert thật. Đạt.
- T407 MINOR: TC-FR27-E06 kiểm mã `MILESTONES_NOT_PASSED` + 409. Đạt.

## Vấn đề
Không có BLOCKER/MAJOR.

MINOR (không chặn):
1. `gd6.spec.js` TC-FR21-E01: mảng `statuses` gắn listener 403 sau khi đã `goto /de-tai/:id` (chủ ý, vì ca đó mong 403 hợp lệ), đúng; nhưng ca không tự dựng lại nếu chạy riêng `playwright test` (đã ghi trong báo cáo). Chấp nhận.
2. Tồn đọng đã nêu trong báo cáo, chuyển T707: job chạy lại FR06 `/api/cron/similarity-rechecks`, SV gửi hồ sơ mang cờ G5 ở `SubmitPage`, `PastTopicsPage` (chờ §9.5), phân trang nhận xét tiến độ, chạy trên Linux thật.
3. Cảnh báo console `HydrateFallback` của react-router lặp trong log E2E; nên xử lý khi tiện (không ảnh hưởng kết quả).
