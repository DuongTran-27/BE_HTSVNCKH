# T210 – Review vòng 1 (reviewer)
Tự chạy sau `db:test:reset`: shared 68/68; api 31 file 370/370; web 98/98; `npm run lint` xanh. Khớp báo cáo. Không có test bị xóa/skip/làm yếu (file test mới; thay đổi `stateMachine.js` chỉ đổi `$transaction` -> `withLockTx`).

## Đối chiếu
- Hạn mức GV: `lockUsers([GV])` rồi đếm `Advising` hiện hành trong đợt (đề tài hoạt động) trong cùng tx, sau câu khóa Topic (`advisorService.js:49-52`); test đua 1 suất 200/409. Đạt.
- `STUDENT_TOPIC_LIMIT`: đọc lại thành viên trong tx, `GROUP_TOO_SMALL`, khóa User mọi thành viên tăng dần theo id, đếm từng SV bằng câu riêng, trả `codes` (`:35-43`). Thứ tự khóa Topic -> User nhất quán, không thấy nguy cơ deadlock (tập User của REQUEST_ADVISOR và ACCEPT khác nhau). Đạt; đóng MINOR 1 T208, gồm cả chuyển lời mời PENDING -> WITHDRAWN.
- `applyTransition` qua `withLockTx` (`stateMachine.js`), có test tx giữ khóa >3s -> 409. Chuyển trạng thái chỉ qua `checkTransition` + `applyTransition` (TRANSITIONS), StatusHistory + AuditLog cùng tx. Quyền xem kiểm trước trạng thái. Đạt.
- Hạn đăng ký chặn ở REQUEST_ADVISOR (đóng MINOR 3 T209). Đạt.
- Hồ sơ đọc ngoài tx rồi `applyTransition` dùng `updateMany {version}`: đổi nội dung giữa chừng làm version lệch -> 409, nên kiểm `TOPIC_INCOMPLETE` không bị vượt.

## Vấn đề
### MAJOR 1 – Lệch hợp đồng §8.1 chưa được ghi
`git diff docs/agents/design/API_GD2.md` rỗng, trong khi `advisorService.js:84-85` trả `{ topic: { id, code, status, version } }` cho `DECLINE_ADVISING` thay TopicDetail. Quyết định (thay kiến trúc sư theo chế độ tiết kiệm): CHẤP NHẬN lệch – sau decline GV hết quan hệ nên trả TopicDetail sẽ lộ hồ sơ Nháp hoặc tự mâu thuẫn với 403 của §5.1; FE cần biết trước để không đọc `topic.title`. Yêu cầu: sửa §8.1 (và §6 nếu có) ghi rõ response tóm lược này cho `DECLINE_ADVISING`, kèm một test khẳng định hình dạng (đã có test decline; thêm assert không có `title/summary`). Chỉ sửa tài liệu/test, không cần đổi code.

### MINOR 1 – `lecturerId` kiểm ngoài transaction (xếp mức thấp)
`advisorService.js:18-21`. GV bị khóa/đổi khoa giữa lúc kiểm và lúc ghi vẫn nhận đề nghị; hậu quả hạn chế (GV khóa không đăng nhập được để nhận; cửa sổ ms; đề nghị rút/từ chối được). Chấp nhận; nếu muốn kín, kiểm lại trong `extras.REQUEST_ADVISOR` bằng `lockUsers([lecturerId])`.

### MINOR 2 – Danh sách của GV lộ tiêu đề đề tài về Nháp
`advisorService.js:90-103`: `listRequests` phạm vi GV theo `lecturerId` nên sau DECLINE GV vẫn thấy `title/status` của đề tài đã về Nháp. Mức thấp (GV đã được xem hồ sơ lúc nhận đề nghị); cân nhắc bỏ `title` khi request không PENDING hoặc ghi chú vào §6.

Kết luận: CHANGES_REQUESTED (BLOCKER 0, MAJOR 1, MINOR 2) – MAJOR chỉ là sửa tài liệu §8.1 + một assert; sửa xong có thể duyệt không cần vòng code mới.
