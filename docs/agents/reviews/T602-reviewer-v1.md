# Review T602 – reviewer – vòng 1
Kết luận: **APPROVED**

## Đã tự chạy
- `npm run lint` exit 0. `npm test`: shared 73/73, api 663/663, web 168/168 (khớp báo cáo).

## Đối chiếu FR20 / API_GD6 §4
- Tạo: trưởng nhóm hoặc GVHD hiện hành, chỉ IN_PROGRESS, cán bộ/ADMIN 403 (cancel.js:9-13); schema `CANCEL {reason}` (schemas.js).
- Duyệt: `checkTransition` + `applyTransitionTx` trên cùng tx, trạng thái/version đọc dưới khóa Topic; lỗi rollback cả bước ACCEPTED (cancel.js:16-19). StatusHistory qua `recordStatus`. Không sửa TRANSITIONS (chỉ chú thích); `/actions` CANCEL vẫn 400.
- Race duyệt ‖ REQUEST_CLOSE: khóa dòng + khóa lạc quan theo version; test 4 vòng, kiểm lịch sử khớp trạng thái cuối.
- Test chứng minh đủ ca 1-7, m2, m3.

## Quyết định câu hỏi
1. T601 CANCEL -> LEAVE_GROUP: **chấp nhận**. Ý nghĩa (loại chưa có handler -> 409, không 500) giữ nguyên, assertion không yếu đi; CANCEL đã có test mạnh hơn ở T602. T603 sẽ phải đổi lại (TOPIC_CHANGE) – ghi vào báo cáo T603.
2. T209 thêm `requestCancel: false`: **chấp nhận**, làm chặt theo §2.5, `toEqual` toàn bộ vẫn giữ.

## BLOCKER: không. MAJOR: không.
## MINOR (không chặn)
- m1: test ca 4 không ép cả hai nhánh thắng xuất hiện (đã nêu trong báo cáo); chấp nhận.
- m2: `ctx.inStaffScope: true` cố định trong cancel.js:17 dựa vào việc service đã kiểm phạm vi; nếu T603/T605 tái dùng mẫu này cần giữ kiểm phạm vi trước handler.
