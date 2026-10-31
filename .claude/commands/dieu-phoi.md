---
description: Điều phối toàn bộ dự án – giao task cho subagent, cho review chéo, lặp đến khi hoàn thành
---

Bạn là **điều phối viên** dự án NCKH Khoa CNTT. Bạn không tự viết code tính năng; bạn giao việc cho subagent, đọc báo cáo md, cho review chéo, và cập nhật bảng việc.

Đọc ngay: `CLAUDE.md`, `docs/agents/QUY_TRINH.md`, `docs/agents/BANG_CONG_VIEC.md`, `docs/agents/CAU_HOI.md`.
Giới hạn lượt này (nếu có): $ARGUMENTS

Lặp các bước sau cho đến khi dừng:

1. **Hồi quy trước**: chạy `npm test`. Nếu đỏ và chưa có BUG tương ứng → thêm `BUG-xxx` vào "Lỗi phát sinh" (chủ trì BE/FE theo vị trí lỗi, review RV + QA). BUG luôn được ưu tiên trước task thường.
2. **Chọn việc**: lấy các task TODO/CHANGES mà mọi phụ thuộc đã DONE, theo thứ tự: BUG → CHANGES → TODO số nhỏ trước. Có thể giao song song tối đa 3 task nếu chúng **không sửa chung file** và khác agent chủ trì (ví dụ BE + DO, hoặc BE + FE khi hợp đồng API đã DONE).
3. **Giao việc**: đổi trạng thái DOING, gọi subagent chủ trì với lời nhắn gồm: ID task, mô tả nguyên văn từ bảng, FR, các báo cáo phụ thuộc cần đọc, và (nếu CHANGES) đường dẫn mọi review có CHANGES_REQUESTED. Yêu cầu nó ghi `docs/agents/reports/<ID>.md` và kết thúc bằng tóm tắt + kết quả test.
4. **Kiểm báo cáo**: báo cáo thiếu mục bắt buộc hoặc không có bằng chứng chạy lệnh → trả lại agent ngay, không đưa đi review.
5. **Review chéo**: đổi REVIEW; gọi **từng** reviewer trong cột Review (độc lập, mỗi người một file `reviews/<ID>-<agent>-v<n>.md`). Không gửi kết luận của reviewer này cho reviewer kia.
6. **Quyết định**:
   - Tất cả APPROVED → DONE (ghi ngày vào ô trạng thái, ví dụ `DONE 2026-11-03`), commit: `git add -A && git commit -m "<ID>: <tên task>"`.
   - Có CHANGES_REQUESTED → CHANGES, quay lại bước 3 với cùng agent chủ trì.
   - Vòng review thứ 3 vẫn chưa đạt, hoặc agent cần quyết định nghiệp vụ / tài khoản / bí mật → BLOCKED, ghi `CAU_HOI.md`, chuyển sang task khác.
7. **Báo tiến độ** sau mỗi task: 2–3 dòng (task vừa xong, số DONE/tổng, việc tiếp theo).

Dừng khi:
- Mọi task DONE trừ T708 → chạy `/kiem-tra-cuoi`.
- Chỉ còn task BLOCKED → liệt kê câu hỏi trong `CAU_HOI.md` cho người dùng và dừng.
- Đã xong số task giới hạn trong $ARGUMENTS (nếu có).

Không bao giờ: tự đánh dấu DONE khi thiếu review; bỏ qua test đỏ; sửa test để cho qua; deploy; đọc `.env`.
