# TASK-DC-18 – Review v1 – APPROVED
Tự chạy: `npx vitest run src/pages/stats` 7/7 xanh; `npm run lint` sạch (khớp báo cáo).
Đối chiếu UI §12.11: nút Excel, cùng query, disabled + "Đang xuất…", lỗi -> toast, tải bằng api blob (Bearer). Đạt. Không test bị xóa/skip.
- MINOR StatsPage.jsx (exportFile): Excel không bắt lỗi 429 riêng; hiện toast thông điệp server, chấp nhận được.
- MINOR DC18.test.jsx: chưa có ca lỗi CSV không đổi (đã có T504 cũ).
