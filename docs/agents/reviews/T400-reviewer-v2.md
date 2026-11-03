# Review T400 – reviewer v2
- Kết luận: **APPROVED** (không BLOCKER/MAJOR). Task tài liệu, không chạy lệnh.

## Xác nhận vòng 1
- M1 (G26): đã sửa đúng. §2 dòng 68 mã `CLOSE_CONDITIONS_MET`; §7.3 dòng 341 chặn CLOSE_EXPIRED khi đủ điều kiện; §10 dòng 493 kiểm lại trong `extra` dưới khóa. Không mâu thuẫn với G24: đề tài không có mốc bắt buộc là "chưa đủ điều kiện" nên vẫn đóng được qua CLOSE_EXPIRED sau hạn đợt.
- G27: thống nhất theo CLOSED (§9.2 dòng 462, §12), giao T503 sửa `listService.js` kèm test. Không mâu thuẫn với G28: `currentResult` ở `TopicDetail` vẫn hiện trước khi đóng, còn `item.result` của danh sách và thống kê chỉ có khi CLOSED. T503 cần ghi rõ hai trường khác nghĩa.
- m1, m2 (`NO_REQUIRED_MILESTONE`, dòng 67/324), m3, m5, m6, m8: đã xử lý trong hợp đồng.

## MINOR mới (không chặn)
- n1: `requiredRemovedCount` đọc từ AuditLog `MILESTONE_UPDATE` (dòng 342) là truy vấn JSON chậm và dễ sai. Gợi ý: đếm bằng cờ/cột trên Milestone, hoặc ghi rõ cách lọc `before.required = true, after.required = false` kèm index.
- n2: §8.3 phần "Không thông báo… sửa mốc (PATCH)" (cuối mục) phải bổ sung ngoại lệ `MILESTONE_REQUIRED_REMOVED` cho khớp.
- n3: `stateMachine.js:41` đổi nhánh (ctx thêm `requiredMilestoneCount`): T405 phải cập nhật test hiện có của stateMachine, không được sửa/làm yếu test cũ.

G24/G28 giữ phương án, chờ CAU_HOI #8, #9: chấp nhận.
