# T309 – Review v1 (reviewer)
Kết luận: **APPROVED** (không BLOCKER/MAJOR; MINOR không chặn).

## Tự chạy
- `npm run test:e2e -w @nckh/web` -> 8 passed (24.0s). `npm run lint` -> sạch. Khớp báo cáo.

## Đối chiếu
- Luồng M1/M5: SV tạo đề tài -> mời SV2, SV2 chấp nhận, nhóm 2 người -> mời GVHD, GV nhận -> kiểm tra trước ra HIGH, nút gửi tắt khi giải trình thiếu/ngắn, bật khi đủ, gửi -> cán bộ thấy snapshot + panel HIGH + giải trình, duyệt, trạng thái "Đang thực hiện" (m1.spec.js:27-110). Khẳng định đủ mạnh (data-level, disabled/enabled, thông báo, trạng thái cuối), không chỉ "trang hiện ra".
- Kho: dữ liệu seed thật qua API T213b; đối chiếu số lượng, FAIL vắng (list, /kho/:code, ?result=FAIL), không lộ tên trưởng nhóm, ADMIN xem được, tìm không dấu (m1.spec.js:114-142).
- 360 px: không tràn ngang (3 lần), nút >= 44 px nằm trong khung, gửi được (m1.spec.js:147-164).
- NFR08: `prepare.js:18` reset qua `npm run db:test:reset` -> reset-test-db.js gọi `assertTestDbEnv` và kiểm mức DB trước khi xóa; env bị ghi đè cứng bằng `API_ENV` (prepare.js:8) nên không lấy DATABASE_URL của shell/.env. Seed chỉ chạy sau reset thành công (execSync ném lỗi nếu thất bại). Bước CREATE DATABASE dùng tên hằng `nckh_t309_test` trên localhost:54329 nên không chạm DB khác.
- `@playwright/test` 1.64.1 ghim phiên bản, hợp lý; `.gitignore` đã thêm `apps/web/e2e/.out/`.
- Không có sleep cứng; chỉ dùng expect có auto-wait. Không skip/only.

## MINOR (không chặn)
1. m1.spec.js:36 – lấy mã đề tài bằng `p.text-sm` đầu tiên: dễ vỡ khi đổi giao diện. Đề xuất data-testid hoặc đọc mã từ API/DB.
2. m1.spec.js:31 – `selectOption({ index: 1 })` phụ thuộc thứ tự đợt trong seed; nên chọn theo nhãn.
3. prepare.js:13-14 – SQL nối chuỗi từ hằng; an toàn hiện tại, nhưng nên ghi chú "hằng, không nhận input ngoài".
4. prepare.js:9 – chuyển pathname URL bằng regex đặc thù Windows; dùng `fileURLToPath` cho gọn và đúng mọi OS.
5. Cảnh báo `HydrateFallback` lặp trong console (đã nêu trong báo cáo) – gợi ý FE.
6. Chưa phủ (đã khai báo): cán bộ khác khoa (403), từ chối/yêu cầu chỉnh sửa qua UI, chỉ chạy Chromium.
