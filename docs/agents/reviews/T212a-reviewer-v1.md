# Review T212a – reviewer v1
- Kết luận: **APPROVED** (không BLOCKER/MAJOR; MINOR không chặn)
- Chạy lại trên DB riêng `nckh_t212arv_test` (localhost:54329, `db:test:reset` xong): `npm run lint` sạch; `npm test` shared 68/68, api 398/398 (34 file), web 107/107. Khớp báo cáo.

## Đối chiếu đặc tả
- §8.1/8.2 đúng thứ tự: `reviewService.js:65-71` kiểm `canView` (403) trước `checkTransition`; `:17` `skipSimilarity` -> version `:18` -> hạn đăng ký chỉ SUBMIT `:21` -> `assertTopicComplete` `:24` -> `runSimilarityCheck` ngoài tx `:28` -> `checkTransition` lần hai `:35` gắn `details.similarityCheck` `:37` -> `applyTransition`.
- Quy tắc 5/FR06: `stateMachine.js:31` ERROR hoặc thiếu kết quả -> `SIMILARITY_NOT_CHECKED`; `skipSimilarity` chỉ dùng ở lần kiểm sơ bộ, lần hai luôn truyền `ctx.similarity` từ hàng vừa lưu. Không có đường nào coi lỗi là "không trùng".
- Quyền (FR25): `routes.js` thêm STAFF vào `requireRole`, ADMIN vẫn bị chặn; vai trò/phạm vi/leaderOnly vẫn do TRANSITIONS + `checkTransition` (không có bảng chuyển trạng thái thứ hai).
- Transaction + StatusHistory: `reviewRepo.js:13` đi qua `applyTransition` (`withLockTx`, `recordStatus`); Submission/ReviewDecision/AuditLog tạo trong cùng `extra`. `seq` tính trong tx, `@@unique([topicId,seq])` + khóa version chặn gửi đôi.
- STALE_SUBMISSION (`reviewService.js:55-56`): so với snapshot `seq` lớn nhất (`prismaRepo.js:16`) và `decision`; vì mọi gửi/quyết định đều tăng `version` nên check version ngay trước đó làm cho đọc cũ không thể lọt; `ReviewDecision.submissionId @unique` là chốt cuối. Đồng thời an toàn.
- Zod: 5 action mới đúng bảng §8.1 (reason 5..2000 qua `reasonSchema`, justification <= 5000, submissionId <= 64). `emptyBodySchema` đúng yêu cầu MINOR của T211.
- Test cũ: `git diff apps/api/tests` chỉ xóa 2 dòng (biến `staff` thừa và `expect(staff).toBeTruthy()`), không làm yếu assertion nghiệp vụ. Test mới không có `.skip/.only`.

## Rủi ro "SimilarityCheck mồ côi khi applyTransition lỗi"
Chấp nhận được, không cần sửa. Hàng kiểm là bất biến, `Submission.similarityCheckId` là quan hệ tùy chọn nên mồ côi không vi phạm ràng buộc; đúng §8.2 bước 4 (ngoài tx). Lần gửi lại sẽ tạo hàng mới, không dùng lại hàng cũ nên không gắn nhầm. Khối lượng bị chặn bởi `actionLimiter` 30/15 phút/người. Nếu T608 `cleanup-orphans` có dọn hàng này thì chỉ nên dọn hàng cũ không có Submission, không cần làm trong task này.

## MINOR (không chặn)
1. `reviewService.js:49`, `:61`: `getTopic` chạy sau khi tx đã commit; nếu nó ném lỗi thì client nhận lỗi dù việc chuyển trạng thái đã xong (client tải lại sẽ thấy đúng). Rủi ro thấp; có thể bọc để trả 200 tối thiểu ở task sau.
2. `reviewService.js:45`: `payload.keywords`/`fieldName` lấy từ đối tượng đã đọc ở đầu `submit` (trước khi chạy thuật toán). Khóa `version` bảo đảm hồ sơ không đổi giữa chừng, nên đúng; chỉ ghi chú để người sửa sau không bỏ khóa này.
3. Báo cáo tự nhận chưa có test STAFF khoa khác cho RESUBMIT; nhánh 403 chung đã phủ, chấp nhận.
