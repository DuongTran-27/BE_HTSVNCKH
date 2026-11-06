# Review T607 bước A – reviewer – vòng 1
Kết luận: **APPROVED** (không BLOCKER/MAJOR; MINOR không chặn – chế độ tiết kiệm quota).

## Lệnh tự chạy (2026-11-07)
- `npm run lint`: sạch (max-warnings 0).
- `npm test` (api): 57 file / 732 test pass. `npm test -w @nckh/web`: 23 file / 191 test pass.
- `npm run build -w @nckh/web`: OK (chỉ cảnh báo chunk > 500 kB, có từ trước).
Khớp báo cáo. Không phát hiện test bị xóa/skip/làm yếu (file test mới, chỉ thêm).

## Đối chiếu hợp đồng
- Endpoint/shape đúng API_GD6: `POST /topics/:id/change-requests`, `/change-requests/:id/{accept,decline,withdraw,approve}`, `GET /topics/:id/change-requests`, `GET /change-requests` (status/type/stage/page), `POST /topics/:id/leave {version}`, `PUT /topics/:id/former-advisors/:lecturerId/read-access {granted,reason}`, `GET /me/past-topics`. pageSize <= 100 hợp lệ.
- Mã lỗi: `CHANGE_REQUEST_CLOSED`, `STALE_CHANGE_REQUEST`, `INVALID_TRANSITION`/`TOPIC_NOT_IN_PROGRESS`, `JUSTIFICATION_REQUIRED`, `SIMILARITY_NOT_CHECKED`, `LEADER_CANNOT_LEAVE`, `LEAVE_NEEDS_APPROVAL`, 429 đều có xử lý.
- Quy tắc 5: `SIMILARITY_NOT_CHECKED` hiện "Chưa kiểm tra được ... không coi đây là 'không trùng'" (ChangeRequestForm.jsx:62); `SimilarityPanel` coi `status=ERROR`/`level=null` là "Chưa kiểm tra được" và không bao giờ in "Không trùng" cho trường hợp này; có test.
- Ẩn/hiện theo server: nút tạo theo `permissions.*`, nút thẻ theo `availableActions`, "Rời nhóm" theo `permissions.leave`, GV cũ theo `manageFormerAdvisorAccess`, dải chỉ đọc theo `readOnlyAccess`. CANCEL duyệt bắt buộc lý do; DECLINE bắt buộc lý do. ADMIN bị route chặn.
- Tiếng Việt: đạt. Dùng lại `SimilarityPanel`, `ReasonDialog`, `ConfirmDialog`, `QueryBox`, `Pager`, `FormField`, `applyServerErrors`, `useCooldown`: đạt. Validate bằng `changeRequestCreateSchema` của shared (không nhân đôi luật).
- Test 23 ca có nghĩa (kiểm body gửi đi, ẩn/hiện, mã lỗi), không chỉ render.

## Vấn đề
BLOCKER: không.
MAJOR: không.
MINOR (không chặn):
1. `apps/web/src/components/ChangeRequestForm.jsx:24` – `GET /lecturers` chỉ lấy 100 GV đầu, không có ô tìm; khoa > 100 GV sẽ thiếu lựa chọn. Đề xuất: thêm ô `q` (API đã có `q`). Nhận: task dọn UI cuối GĐ6 (T607 bước B hoặc T608 nếu có chỗ), hoặc ghi backlog.
2. `apps/web/src/components/ChangeRequestCard.jsx:99,113` – nhãn "Duyệt" chung cho `LEAVE_GROUP`/`ADVISOR_CHANGE`/`TOPIC_CHANGE`; nên nêu hậu quả theo loại trong ConfirmDialog (vd. "Thành viên sẽ rời nhóm"). Nhận: T607 bước B.
3. `apps/web/src/components/MembershipActions.jsx:50-54` – `submit` của FormerAdvisors để lỗi API nổi lên `ReasonDialog` (đúng) nhưng `GONE`/409 không có thông điệp riêng; ổn vì message server hiển thị.

## Trả lời câu hỏi/rủi ro trong báo cáo
1. Thiếu endpoint chạy FR06 thử cho `TOPIC_CHANGE`: **chấp nhận gửi thử**, không đổi hợp đồng. Server không tạo yêu cầu khi HIGH thiếu giải trình hoặc ERROR, nên "gửi thử" không để lại rác; panel + giải trình xuất hiện sau lần gửi đầu. Thêm preview làm tăng tải FR06 và rủi ro hai bản kiểm khác nhau. Không cần task mới.
2. Người đích `TOPIC_CHANGE` chỉ thấy `payload`: **đủ** (§1.1 người đích không có quyền xem đề tài; `payload` có trước/sau, `addMember`, `similarityCheck`). Không cần thêm dữ liệu.
3. Rủi ro `SubmissionPage`/`SubmissionDiffPage` có thể gọi endpoint khiến người đã rời bị 403: là việc phải làm, **giao cho task E2E GĐ7 (T7xx, kịch bản FR21 người đã rời)**; nếu lộ ra sớm, sửa trong T607 bước B. Ghi lại để không mất.
4. Rủi ro nhãn thông báo mới chưa có trong `labels.js`: kiểm khi làm trang thông báo ở T607 bước B (cùng MINOR 2). Rủi ro pageSize 100: xem MINOR 1.
