# TASK-E2E-GD6B – E2E cho FR18, FR19, FR20, FR22, FR23

Trước đây các FR này chỉ có integration + test component (TRUY_VET §4). Thêm `apps/web/e2e/gd6b.spec.js`, chạy với backend thật trên dữ liệu đã dựng sẵn trong `prepare.js` (không đổi prepare), kiểm kết quả cuối bằng `db()` chỉ đọc:
- TC-FR18-E01 SV đổi tên đề tài đang thực hiện → kiểm trùng lại ra nghi trùng cao → bắt buộc giải trình → cán bộ duyệt: tên cập nhật, không tạo lần gửi mới.
- TC-FR19-E01 SV đề nghị thay giảng viên → giảng viên mới đồng ý → cán bộ duyệt: Advising hiện hành là giảng viên mới.
- TC-FR20-E01 trưởng nhóm đề nghị hủy → cán bộ duyệt kèm lý do: CANCELLED, có StatusHistory, trang chi tiết hiện "Đã hủy".
- TC-FR22-E01 giảng viên hướng dẫn mở lại mốc đã Đạt kèm lý do: mốc không còn Đạt, hiện "Đã mở lại 1 lần".
- TC-FR23-E01 cán bộ sửa kết quả đề tài đã đóng: phiên bản 2 EXCELLENT hiện hành, phiên bản 1 GOOD vẫn lưu.

**Lỗi sản phẩm phát hiện khi viết E2E và đã sửa:** form yêu cầu thay đổi hiện "Đã có lỗi xảy ra" thay cho thông điệp thật của server (ví dụ "Hồ sơ nghi trùng cao, cần giải trình tối thiểu 50 từ") với mọi lỗi kèm `details`, vì `mapServerDetails` dùng `{ ...err }` làm mất `message` (thuộc tính không enumerable của Error). Sửa ở `apps/web/src/lib/changeRequests.js`; test mới `src/lib/changeRequests.test.js` (trượt khi gỡ bản sửa, đạt khi có). E2E FR18 kiểm thông điệp này.

## Bằng chứng
```
npm run test:e2e -w @nckh/web -- e2e/gd6b.spec.js → 10 passed (desktop + mobile)
npm run test:e2e -w @nckh/web                     → 68 passed
npx vitest run src/lib/changeRequests.test.js      → 1 passed (trước khi sửa: 1 failed)
npm test                                          → 73 + 966 + 236 passed
```
