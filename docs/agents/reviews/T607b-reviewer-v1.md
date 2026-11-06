# Review T607b (bước B) – reviewer, vòng 1
- Kết luận: **CHANGES_REQUESTED**
- Tự chạy: `npm run lint` xanh; `npm test` toàn bộ xanh (shared 73, api 732, web 211); `npm run build -w @nckh/web` xanh (chỉ cảnh báo chunk có từ trước). Khớp báo cáo.

## Đối chiếu
- FR23: `ResultSection.jsx` `CorrectionForm` dùng `resultCorrectionSchema`, `POST /topics/:id/result-corrections`, `expectedVersion: current.version` lúc gửi, nút theo `permissions.correctResult`, 409 tải lại, hiện "Lý do sửa". Đạt.
- FR22: `MilestonesPage.jsx` nút theo `permissions.reopenMilestone` + mốc PASSED, `POST /milestones/:id/reopen {reason, version: m.version}`, `GET /reopens`, invalidate cả khi 409. Đạt.
- G5: `SimilarityLevelCell` ERROR → "Chưa kiểm tra được" + cờ, không đường nào in "Không trùng" cho lỗi/unchecked; `GrantBypass` theo `permissions.grantSimilarityBypass`; `SubmitPage` mở nút gửi chỉ khi `unchecked` và có `similarityBypass`. Đạt (quy tắc 5 giữ).
- MINOR T406 (version lúc gửi, 429 khóa nút, phân trang nhận xét tài liệu) và MINOR T607a (tìm GV `q`, hộp Duyệt theo loại): có code + test. Đạt.
- Văn bản UI tiếng Việt. Không thấy test bị skip/làm yếu (file test mới 20 ca; không sửa test cũ).

## MAJOR
1. `MEMBER_LEFT` thiếu trong `NOTIFICATION_TYPES` (`packages/shared/src/enums.js`) dù API gửi thật (`apps/api/src/modules/topics/groupService.js:131`). Enum là nguồn sự thật; nhãn không có enum + ghi chú "làm sau" (`packages/shared/src/labels.js:82-83`) là nợ kỹ thuật. Sửa trong vòng sau: thêm `MEMBER_LEFT` vào `NOTIFICATION_TYPES`, đổi 30 → 31 ở `apps/api/tests/T501-notifications.test.js` (đây là cập nhật đúng đặc tả, không phải làm yếu test; ghi lý do trong báo cáo), xóa dòng ghi chú ở `labels.js:82`, chạy lại T501 + toàn bộ test.

## MINOR (không chặn)
1. `SimilarityPanel.jsx` `SimilarityLevelCell`: khi `unchecked` mà đã có `level` (sau kiểm lại) ô chỉ hiện cờ, ẩn mức. Nên hiện cả mức khi `status` không ERROR. Có thể làm cùng vòng sửa.
2. Chưa kiểm với backend thật (mock): giao E2E T702.

## Đánh giá mục "chưa làm"
- Phân trang nhận xét tiến độ (API giới hạn 20 mới nhất): không phải lỗi, không bắt buộc; ghi vào T702 nếu muốn, hoặc bỏ.
- Cờ "Gửi khi chưa kiểm tra" ở `PastTopicsPage`: API_GD6 §9.5 không yêu cầu; giao T707 (làm rõ hợp đồng) rồi T702 (E2E người đã rời). Không làm ngay.
- `SubmissionPage`/`SubmissionDiffPage` với người đã rời: đã giao T702.
