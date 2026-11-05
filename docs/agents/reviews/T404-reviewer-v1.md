# Review T404 (FR12) – reviewer v1

Kết luận: **APPROVED**. Không BLOCKER/MAJOR. Tôi tự chạy lại sau `npm run db:test:up` (K1–K7 OK): `npm run lint` không lỗi; `npm test` cho shared 68/68, api 562/562, web 144/144, khớp bằng chứng trong báo cáo. Chạy `T404-feedback` + `T402-progress` 3 lần liên tiếp: 23/23 cả 3 lần. Không có test cũ nào bị sửa, skip hay làm yếu (chỉ thêm `T404-feedback.test.js`). Ngoài phạm vi: 5 script `apps/api/scripts/*` chưa commit.

## Đối chiếu FR12 / API_GD45 §6
- **Quyền.** Ghi chỉ LECTURER là GVHD hiện hành (`feedbackService.js:27`). STAFF trong phạm vi chỉ đọc (`:25`). ADMIN bị 403 ở `requireRole` (`routes.js` `roles`). Thứ tự kiểm 404 → 403 → 409 đúng §1.1. Test 403 phủ SV thành viên, cán bộ, GV khác, GV cũ (`endAt`), SV ngoài, ADMIN.
- **Transaction và khóa §1.2.** Mọi thao tác ghi đi qua `writeFeedback` → `write` → `lockTopicForExecution` (dùng `FOR NO KEY UPDATE`), rồi kiểm lại IN_PROGRESS dưới khóa. AuditLog ghi trong cùng transaction.
- **§6.1 Nhận xét bản nộp.** Nhận xét gắn đúng `documentId`, được trên mọi phiên bản. Khi có `evaluation`, kiểm lần lượt: `STALE_DOCUMENT` (`:41`), rồi `MILESTONE_ALREADY_PASSED` (`:43`), rồi khóa lạc quan `updateVersioned` → `CONCURRENT_UPDATE` (`:44`). Đánh giá đề cương trả 400 tại `evaluation`. Schema `strictObject`, có `refine` bắt buộc `milestoneVersion`. Đã kiểm rằng lỗi 409 không tạo nhận xét (test `:55`).
- **§6.2 Nhận xét tiến độ.** `lockProgress` dùng `$executeRaw` có tham số với `WHERE "lockedAt" IS NULL` (`prismaRepo.js:34`), đúng điều kiện đã dùng ở `updateProgressUnlocked`. Đã khóa thì giữ `lockedAt` cũ (test `:103`). `progress` được đọc trong transaction. Việc thay `updateMany` bằng SQL thô để giữ ngữ nghĩa `updatedAt` hợp lý. Đây là lệch chữ nhỏ so với §6.2 nhưng tương đương về hành vi.
- **§6.3 Đọc nhận xét.** `where` luôn có `topicId`, nên lọc theo `documentId`/`progressUpdateId` của đề tài khác không lộ dữ liệu. Sắp xếp giảm dần, có phân trang.
- **§6.4 Kết quả cuối.** Hạ `isCurrent` của bản cũ trước rồi tạo bản `max+1` (đúng ràng buộc `result_one_current`). `expectedVersion` được so với bản hiện hành. Đọc được ở mọi trạng thái; POST khi đề tài đóng trả 409. `summary` 20..5000, `result` thuộc `FINAL_RESULT`.
- **Test đua "nhận xét ‖ sửa tiến độ"** (`T404-feedback.test.js:120-137`). Đúng ngữ nghĩa và không làm yếu. Hai yêu cầu đi thật qua HTTP. Bất biến kiểm cả hai nhánh: sửa thắng thì GV thấy 99, khóa thắng thì 409 và DB vẫn 40. Bất biến này chặt hơn so `updatedAt`.
- **MINOR m1 của T402** (`progressService.js:55-56`). Đã sửa: không đổi giá trị thì không UPDATE, không audit; nếu đã khóa vẫn trả 409 vì kiểm `lockedAt` trước. Có test `:140-150`.
- **Thông báo `FEEDBACK_CREATED`/`RESULT_ENTERED`.** Để lại cho T501, đúng phân công.

## MINOR (không chặn)
- **m1 `feedbackService.js:21-30`.** `isCurrentAdvisor` được tính trước transaction và không kiểm lại dưới khóa Topic. Khi làm FR19 (thay GV, GĐ6), GV cũ có thể nhận xét hoặc nhập kết quả chen vào lúc duyệt thay GV. Đề xuất: T6xx (FR19) giữ cùng khóa Topic `FOR NO KEY UPDATE`, đồng thời `write` đọc lại `advisings(endAt null)` trong transaction (áp dụng chung cho mọi ghi GĐ4).
- **m2 `feedbackService.js:35-37`.** Code không kiểm `d.status === 'READY'`. Hiện `documentService` chỉ tạo bản READY nên chưa có rủi ro thực tế. Nếu sau này có bản UPLOADING, nên trả 404 cho bản đó.
- **m3 Đặt tên test** (`T404-feedback.test.js:189`). Tên ghi "hai GV gửi cùng lúc" nhưng thực ra là cùng `lecA` gửi hai yêu cầu. Hành vi được kiểm vẫn đúng; chỉ cần đổi tên.

## Câu hỏi của agent: test đua cũ T402 (`T402-progress.test.js:106-119`)
Đánh giá: **test chập chờn và gần như chỉ chạy một nhánh. Nên mở BUG riêng** (đề xuất BUG-010). Không chặn T404. Lý do:
1. Nguyên nhân chính không phải "hai đồng hồ" (Node và query engine cùng đọc đồng hồ hệ thống), mà là **thời điểm lấy giờ**. `new Date()` cho `lockedAt` được tính khi dựng `Promise.all`, tức trước khi PATCH chạy. Trong khi đó `updateMany` của Prisma tự đặt `@updatedAt` bằng giờ lúc thực thi. Ở nhánh 200 (PATCH commit trước rồi mới khóa), `row.updatedAt` là giờ của chính câu khóa, luôn ≥ `lockedAt` đã lấy sớm hơn. Vì vậy `updatedAt <= lockedAt` chỉ đúng khi hai mốc rơi vào cùng một tick đồng hồ. Thêm vào đó, độ phân giải đồng hồ Windows thô, nên đúng hay sai phụ thuộc may rủi.
2. `updateMany` không chờ khóa Topic và không đi qua HTTP, nên hầu như luôn thắng. Test thực tế gần như chỉ chạy nhánh 409.
3. Đề xuất sửa: thay vế khóa bằng `POST /api/progress/:id/feedbacks` thật, rồi dùng bất biến của T404 (`f.body.progress.percent` khớp với nhánh thắng). Nếu không muốn sửa, có thể bỏ test vì nó đã được `T404-feedback.test.js:120` thay thế bằng phiên bản mạnh hơn, nhưng **ghi lý do trong báo cáo BUG** (quy tắc 1: reviewer cho phép thay bằng test chặt hơn, không cho phép xóa trơn).
