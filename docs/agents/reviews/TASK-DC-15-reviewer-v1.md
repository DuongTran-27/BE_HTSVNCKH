# Review TASK-DC-15 – reviewer – vòng 1
Kết luận: **APPROVED** (không có BLOCKER/MAJOR).

## Lệnh tự chạy
- `npm run lint`: exit 0.
- `npm test -w @nckh/web`: 36 file, 351 test, xanh (khớp báo cáo).
- `npm run build -w @nckh/web`: xanh (chỉ cảnh báo chunk > 500 kB có sẵn).
- `dc15.test.jsx` không có `.skip`/`.only`; các file test cũ không bị sửa (`git diff` chỉ chạm code sản phẩm).
- Không chạy E2E theo yêu cầu.

## Đối chiếu UI §12.7, §12.8, API_GD7 §5–§7.5
- `REQUEST_DEFENSE`: resolver là `topicActionSchema` dùng chung (không chép luật), cảnh báo khóa tài liệu, gợi ý < 5 đúng chữ đặc tả, vẫn gửi được; `NO_FINAL_REPORT` có liên kết tab Tài liệu; `MILESTONES_NOT_PASSED` liệt kê mốc; mọi lần gửi đều invalidate đề tài/thực hiện/hội đồng, gửi lại dùng `version` mới (closure `send` lấy `t.version` của lần render mới nhất).
- `RETURN_FROM_DEFENSE`: `ReasonDialog`, nhắc hủy phân công chưa chốt. `REQUEST_CLOSE` + `requireDefense`: gợi ý đúng chữ, `DEFENSE_REQUIRED` qua cơ chế có sẵn.
- Khối bảo vệ 3 trạng thái, bảng điểm xếp khối dưới `sm`, khối điểm quá trình, dải `councilAccess` + "Đến màn chấm": đạt.
- R30/R31/R32: cột, lọc trên URL, rỗng đúng chữ đặc tả, làm mờ GV đã chọn, 1–5 ủy viên, lỗi `members` đầu khối, `CONFLICT_OF_INTEREST` liệt kê, `COUNCIL_LOCKED` đóng form + chỉ đọc, gán: xung đột đỏ + khóa ô, lỗi liệt kê `topicCodes`, hộp vẫn mở; "Hủy gán" chỉ dòng chưa chốt và chưa có điểm (API mặc định không trả phân công đã hủy nên không lộ nút trên dòng đã hủy).
- Quyền: nút đều theo `availableActions`/`role` server trả; `SCREENS` chỉ STAFF cho R30/R31, STAFF+LECTURER cho R32 (GV ngoài hội đồng nhận 403 qua `QueryBox`), ADMIN không có route nào mới. Đúng quy tắc 3.
- Văn bản UI tiếng Việt; comment tiếng Việt có cho file/hàm/khối chính.

## Quyết định câu hỏi của báo cáo
1. **`defense = null` → không hiện khối**: chấp nhận. Sau `RETURN_FROM_DEFENSE` đề tài về Đang thực hiện, hiện "đã ra hội đồng" dễ gây hiểu nhầm; lịch sử đã có ở StatusHistory. Không cần backend thêm `state`. Chỉ cần sửa chữ API_GD7 §7.5 dòng 492 ("`null` nếu chưa từng đề nghị…") cho khớp hành vi DC-09: "`null` nếu không có đề nghị/phân công hiệu lực (chưa từng, hoặc đã trả về)" – xem MINOR 3.
2. **`WAITING_DEFENSE` trong `EXEC_STATUSES`**: đồng ý. Đã kiểm: `ExecTabs` vẫn chặn bằng `permissions.readExecution`; mọi nút ghi ở tab Mốc/Tiến độ/Tài liệu/Kết quả theo `permissions.manageMilestones/addProgress/giveFeedback/uploadMilestone/enterResult/reopenMilestone` mà server (`topics/service.js:107,169-183`) chỉ bật khi `IN_PROGRESS` (`correctResult` chỉ `CLOSED`). Không mở quyền ghi nào server sẽ từ chối; SV/GVHD/thành viên HĐ/cán bộ chỉ được thêm tab đọc. Không ảnh hưởng vai trò khác.
3. **Trang tạm `/cham-bao-ve`, `/cham-bao-ve/:assignmentId` [LECTURER]**: chấp nhận (fallback `Placeholder` trong `routes.jsx:170`), để liên kết "Đến màn chấm" có đích. DC-16 phải thay bằng R33/R34 và thêm mục menu.

## MINOR (không chặn)
1. `apps/web/src/pages/councils/CouncilDetailPage.jsx:215` (`EditCouncil` không truyền `facultyId`) và `CouncilMembersFields.jsx:383-386` (R31 truy vấn khi chưa chọn đợt): danh sách GV gồm mọi khoa, chọn GV khoa khác thì server trả 400. Đề xuất: backend thêm `facultyId` vào `round` của council view (`councils/service.js:66`) và truyền `facultyId={c.round.facultyId}`; ở R31 đặt `enabled: !!facultyId` hoặc khóa ô chọn đến khi chọn đợt.
2. `CouncilDetailPage.jsx:195-210`: PATCH tên thành công rồi PUT thành viên lỗi → không báo "đã lưu tên", người dùng có thể tưởng chưa lưu gì. Có thể thêm một dòng "Đã lưu tên; thành viên chưa lưu" khi lỗi sau PATCH.
3. `docs/agents/design/API_GD7.md:492`: chữ "`null` nếu đề tài chưa từng đề nghị ra hội đồng" lệch hành vi thật (null cả sau khi trả về). Sửa tài liệu như quyết định 1.
4. `DefenseSection.jsx:160-168`: UI §12.7 liệt kê "biên bản" trong khối DECIDED; hiện biên bản chỉ nằm ở mục "Kết quả cuối" (summary nguồn COUNCIL). Chấp nhận, nhưng nên thêm một dòng chỉ dẫn "Biên bản: xem mục Kết quả cuối" để người đọc không tìm.
5. `CouncilMembersFields.jsx:393` (`slot`), `CouncilDetailPage.jsx:91` (`CouncilDetail`) chưa có comment riêng; nên thêm một dòng.
6. Thư mục `.playwright-mcp/` (log/ảnh chụp từ 2026-11-18) đang untracked: không commit; xóa hoặc thêm vào `.gitignore`.
7. Chưa kiểm tay 360 px/dark mode, chưa có E2E luồng hội đồng (báo cáo đã nêu).
