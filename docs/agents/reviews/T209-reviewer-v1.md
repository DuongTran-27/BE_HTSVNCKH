# T209 – Review vòng 1 (reviewer)
Tự chạy sau `db:test:reset`: shared 68/68; web 75/75; lint xanh; api 323/324 – 1 đỏ `T207b-import > preview: STAFF ngoài phạm vi 403 dù file quá cỡ`. Chạy riêng `T207b-import` -> 36/36 xanh; không liên quan T209 (báo cáo đã nêu nhiễu DB dùng chung, T209-topics xanh). Đề nghị điều phối chạy hồi quy sạch một lần trước khi đóng.

## Trả lời câu hỏi
- PUT giữ nguyên `fieldId` thì không kiểm `isActive` (`service.js:99-104`): CHẤP NHẬN. §5.1 chỉ kiểm `isActive` khi chọn; chặn sẽ khiến hồ sơ đang sửa không lưu được vì lỗi ngoài tầm sinh viên. Đổi lĩnh vực sang cái ngừng dùng vẫn 400. Đề nghị ghi một dòng vào §5.1 (MINOR 1).
- Ma trận xem: Admin 403 ở `requireRole` (`routes.js:20`); STAFF chỉ trong khoa và `status != DRAFT` (`service.js:28`); GV chỉ khi GVHD hiện hành hoặc được đề nghị PENDING; người ngoài 403, id lạ 404. Đạt, có test ma trận.
- `availableActions`: lấy từ `availableActions(status, role)` của shared (TRANSITIONS), lọc thêm theo quan hệ qua cờ của `findTransition`; không định nghĩa lại bảng. Đạt.
- Khóa lạc quan: `updateMany {id, version, status in EDITABLE}` + `increment`, đếm 0 -> 409 `CONCURRENT_UPDATE` (cũng bắt đổi trạng thái giữa chừng); `version` lệch trước khi đọc cũng 409. Test 2 PUT đồng thời. Đạt.
- AuditLog: TOPIC_CREATE (cùng transaction với Topic + LEADER + mã sequence) và TOPIC_UPDATE (cùng transaction với updateMany); summary dạng digest, không ghi thô. Đạt.

## Vấn đề
### MINOR 1 – Ghi quyết định `fieldId` cũ vào hợp đồng
`docs/agents/design/API_GD2.md` §5.1 (dòng `fieldId` phải `isActive`) chưa nêu ngoại lệ ở PUT. Đề xuất thêm một câu để QA/FE không hiểu lệch.

### MINOR 2 – `GD2_ACTIONS` là danh sách tên cứng
`apps/api/src/modules/topics/service.js:8`. Thêm action ở giai đoạn sau phải nhớ sửa; nếu `findTransition` đổi tên thì lọc im lặng loại hết. Đề xuất test đối chiếu mọi phần tử của `GD2_ACTIONS` tồn tại trong `TRANSITIONS`.

### MINOR 3 – PUT không kiểm cửa sổ đăng ký
Theo §5.1 chỉ tạo bị chặn khi `now >= regCloseAt`; sửa ở NEEDS_REVISION sau hạn vẫn được (hợp lý, vì chặn nằm ở lúc gửi, T210). Chỉ nhắc để T210 không bỏ sót "Chỉ gửi được trong thời gian mở đăng ký" (FR05).

Không có BLOCKER/MAJOR; không có test bị xóa/skip/làm yếu trong diff (file test mới).

Kết luận: APPROVED (BLOCKER 0, MAJOR 0, MINOR 3)
