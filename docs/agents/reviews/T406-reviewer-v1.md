# T406 – Review v1 (reviewer)

Kết luận: APPROVED

## Lệnh tự chạy
- `npm run lint`: sạch.
- `npm run build -w @nckh/web`: thành công.
- `npm test`: api 578/578, web 163/163 (khớp báo cáo). Phần shared không đọc kỹ trong lần chạy này; báo cáo ghi 69/69.
- Không có `.skip`/`.only` trong `apps/web/tests/execution.test.jsx`.

## Đối chiếu
- Nút đóng đề tài (`CloseActions.jsx`) chỉ hiện theo `availableActions`. Body gửi `{action, version, reason?}`.
  `CONCURRENT_UPDATE` và `INVALID_TRANSITION` đóng hộp, hiện toast và tải lại. Lỗi điều kiện hiện trong hộp, `MILESTONES_NOT_PASSED` kèm tên mốc.
- `expectedVersion` (kết quả cuối) và `milestoneVersion` (đánh giá mốc) gửi đúng khóa lạc quan theo API_GD45 §6 và §7.
- Tải file gọi `POST /documents/:id/download-url` mỗi lần, không lưu URL (FR24). Link ngoài chỉ mở khi là `https://`.
- Giờ hiển thị qua `fmtDateTime`, nhập `datetime-local` gửi `+07:00`. Văn bản UI là tiếng Việt. Bố cục dùng `flex-wrap`, `break-all`/`break-words`, form 1 cột.
- Tệp 5 script `apps/api/scripts/*` không bị chạm trong phạm vi task, đúng như báo cáo.

## Quyết định cho câu hỏi của agent
1. Sửa `documentLinkSchema` (bọc `new URL` bằng try/catch): GIỮ trong T406. Đây là sửa một dòng, có test, không đổi hợp đồng, và cần để form link không bị unhandled rejection.
   Thiệt hại ở backend (trả 500 thay vì 400 cho URL sai dạng) là thật.
   Yêu cầu: backend-dev ghi chú trong BUG/báo cáo T403 để thêm một test API 400 cho `POST …/documents/links` với URL sai. Không chặn T406.
2. Không thêm cờ "có thể đánh giá" vào `DocumentView`. Suy từ `isLatest` + `evaluation` đủ dùng, và backend vẫn kiểm `STALE_DOCUMENT` / `MILESTONE_ALREADY_PASSED`. Nếu cần thì xét lại ở GĐ5.

## Vấn đề (đều MINOR, không chặn)
- MINOR: Form sửa mốc/đổi hạn lấy `version` từ `defaultValues` (`MilestonesPage.jsx:76,102`). Sau khi 409 tải lại, nếu form không remount thì gửi lại vẫn mang phiên bản cũ và lại 409.
  Đề xuất: lấy `m.version` tại thời điểm gửi, giống cách `ResultForm` làm với `expectedVersion`.
- MINOR: 429 chỉ khóa nút ở form nộp tài liệu, form tiến độ chỉ hiện thông điệp (agent đã tự nêu).
- MINOR: Nhận xét lấy tối đa 100 mục, không phân trang (agent đã tự nêu).
- MINOR: Chưa có Playwright hoặc ảnh chụp 360 px cho các tab mới. Dồn vào T702 (E2E GĐ4).
