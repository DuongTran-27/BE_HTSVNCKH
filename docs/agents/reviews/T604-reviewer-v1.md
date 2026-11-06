# Review T604 – reviewer – vòng 1
Kết luận: **APPROVED**

## Đã tự chạy
- `npm run lint`: sạch (max-warnings 0).
- `npm test`: shared 73/73, api 686/686 (54 file), web 168/168. Khớp báo cáo.

## Đối chiếu FR23 / API_GD6 §7
- Route `POST /:id/result-corrections` dùng `requireRole('STAFF')` (ADMIN, GVHD, SV bị 403 ở backend), sau đó `load(write:false)` kiểm phạm vi khoa. Đạt.
- Dưới khóa Topic (`FOR NO KEY UPDATE`): CLOSED, có bản hiện hành, `expectedVersion`, kết quả/nhận xét phải khác. Đạt.
- Hạ `isCurrent` bản cũ trước rồi tạo bản mới `max+1` có `reason`; không xóa/ghi đè bản cũ. Đạt.
- AuditLog `RESULT_CORRECT` có before/after đúng hợp đồng. Thông báo `RESULT_CORRECTED` có khóa chống trùng, tiêu đề không chứa lý do. Tất cả chạy trong cùng transaction. Đạt.
- Kho và thống kê dùng `isCurrent` nên không rò. Test kho (GOOD -> FAIL rời kho, chi tiết 404, `q` không rò, FAIL -> PASS vào kho) đóng MINOR 2 của T213b.
- 9 test phủ đủ 7 ca bắt buộc, không có `.skip`/`.only`.

## Hai chỗ sửa test cũ
- T209: chỉ thêm `correctResult: false` vào `toEqual` toàn bộ `permissions`. Vẫn so khớp chặt, không làm yếu.
- T501: 26 -> 27 do thêm đúng một loại thông báo mới theo hợp đồng. Kiểm nhãn tiếng Việt cho mọi type vẫn giữ.
- Cả hai chấp nhận được.

## BLOCKER
Không có.

## MAJOR
Không có.

## MINOR (không chặn)
1. `feedbackService.js` `correctResult`: phép so `summary` lẫn `result` đã tốt, nhưng `body.summary` không gửi + cùng `result` trả 400 với thông điệp chung; chấp nhận theo hợp đồng.
2. Web chưa có nút "Sửa kết quả" (theo `permissions.correctResult`); thuộc task FE, đã ghi trong báo cáo.
