# Review TASK-DC-21, DC-22, DC-23 – reviewer v1

Kết luận: APPROVED (0 BLOCKER, 0 MAJOR, 3 MINOR)

Đã làm: đọc báo cáo, diff prepare.js và playwright.config.js, soát 3 spec (không có waitForTimeout/skip/only, test cũ không bị sửa), tự chạy `npm run lint` (exit 0). Không chạy lại E2E 6 phút theo yêu cầu; tin bằng chứng 100/100 hai lần của tác giả.

Phủ hàng bảng việc: DC-21 (tạo, công bố có HIGH, 2 ứng tuyển, duyệt + từ chối, chốt nhóm, gửi, duyệt, 360px), DC-22 (điểm < 5 bị chặn, xung đột GVHD chặn cả UI và API 409, 3 GV chấm, thư ký chốt 2 bước, đóng, kho, SV xem), DC-23 (SĐT, SSO tắt + sso_error, Kanban bàn phím, Excel) đều có assertion theo đặc tả và đối chiếu DB; dữ liệu theo tiền tố project, tài khoản riêng, serial chỉ trong chuỗi nghiệp vụ DC-21/22, DC-23 độc lập.

playwright.config.js: chỉ đổi `extraHTTPHeaders` trong cấu hình test; không đụng code sản phẩm hay `trust proxy 1` (apps/api/src/app.js:38). Không che lỗi thật: hạn mức refresh vẫn nguyên. Chấp nhận.

## Phát hiện
- MINOR apps/web/src/lib/api.js:229: `bootstrapSession` coi mọi lỗi (kể cả 429) là offline, hiện "Không kết nối được máy chủ" thay vì thông điệp 429 + thời gian chờ (UI §7). Theo dõi như BUG FE nhỏ, không chặn.
- MINOR apps/web/playwright.config.js:19-21: XFF giả phụ thuộc `trust proxy 1` và việc proxy Vite không ghi đè; mỗi project ~160/300 refresh nên còn dư địa hẹp. Khi bộ E2E tăng thêm ~40% cần chia thêm IP; nên ghi vào QUY_TRINH/TRUY_VET.
- MINOR báo cáo: hai lệch UI §12 (R26 trỏ `/de-tai/moi` thay vì `?nguon=gv`: chấp nhận, hành vi tương đương, nên sửa UI.md cho khớp; R28 thiếu cột GV theo §12.6: lệch đặc tả thật, ghi thành việc FE nhỏ hoặc sửa UI.md, không chặn).

Chưa kiểm: không tự chạy E2E; không đọc từng dòng của dc22 (200 dòng).
