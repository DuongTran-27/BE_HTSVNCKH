# Review T607b (bước B) – reviewer, vòng 2
- Kết luận: **APPROVED**
- Tự chạy: `npm run lint` xanh; `npm test` toàn bộ xanh (shared 73, api 732, web 212); `npm run build -w @nckh/web` xanh (chỉ cảnh báo chunk có từ trước). Khớp báo cáo.

## Xác nhận vòng 1
- MAJOR 1: `packages/shared/src/enums.js` có `MEMBER_LEFT`; `labels.js` có nhãn "Thành viên rời nhóm", ghi chú "làm sau" đã xóa; `T501-notifications.test.js` chỉ đổi hằng 30 → 31 (không nới assert khác). Đã sửa đúng.
- MINOR 1: `SimilarityPanel.jsx:27-31` – ERROR hoặc không có level → "Chưa kiểm tra được" (+ cờ); có level hợp lệ → hiện mức + cờ; không đường nào hiện "Không trùng" cho trạng thái chưa kiểm tra (quy tắc 5). Có test trong `gd6-ui-b.test.jsx`.

## Vấn đề còn lại
Không có BLOCKER/MAJOR. Việc E2E với backend thật giao T702.
