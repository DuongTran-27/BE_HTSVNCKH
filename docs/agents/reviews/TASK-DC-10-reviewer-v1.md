# Review TASK-DC-10 – reviewer – v1

**Kết luận: APPROVED** (không BLOCKER/MAJOR).

## Lệnh tự chạy
- `npm run lint`: sạch (0 lỗi, 0 cảnh báo).
- `DB_TEST_DRIVER=embedded npm run db:test:up` rồi `npm run db:test:reset`: OK.
- `npm test`: shared 8 file/100 test; api 83 file/1202 test; web 32 file/245 test, tất cả đạt. Khớp báo cáo.

## Đối chiếu
- Định nghĩa (GD7 §10.2, FR38): `awaitingFeedback = !!doc && !(doc.feedbacks?.length > 0)` (service.js:18). `doc` là bản READY mới nhất. `feedbacks` lồng chỉ lấy `evaluation: { not: null }`, nên khớp "latestDocument khác null và không có nhận xét có đánh giá cho đúng bản đó". Nhận xét không đánh giá vẫn cho true. Nộp bản mới thì bản mới chưa có nhận xét nên về true. Đúng. Test T610 TC-01..03 phủ cả ba ca bắt buộc của GD7, kể cả chưa nộp là false.
- Không N+1: `VIEW_INCLUDE` dùng chung cho `listMilestones` và `viewMilestone`. Prisma `include` lồng chạy theo lô (IN), nên số truy vấn là hằng số. GD7 ghi "một truy vấn gộp (không N+1)", ý chính là không N+1. Cách hiểu "số truy vấn hằng số" của dev chấp nhận được. TC-04 chứng minh bằng cách đếm truy vấn với 1 mốc và 6 mốc, kết quả bằng nhau. Test này không tầm thường vì có log query thật.
- Không lộ dữ liệu: `feedbacks` chỉ `select: { id }` và `presentMilestone` không đưa `doc.feedbacks` ra ngoài, chỉ ra boolean (service.js:18, 19). `presentMilestone` liệt kê trường tường minh, không spread. Chỉ có 2 nơi gọi (service.js:53, 61; feedbackService.js:53), cả hai đi qua presenter. Không lộ nội dung hay tác giả nhận xét. Boolean này cũng chỉ cho người đã xem được danh sách mốc.
- Comment tiếng Việt (prismaRepo.js:10-11, service.js:10-11): giải thích rõ lý do, đủ cho người đọc.
- Không có test bị xóa, skip hay làm yếu. Diff chỉ thêm.

## Phát hiện nhỏ (không chặn)
- m1 (prismaRepo.js:12-16): cách gộp theo lô dựa vào hành vi của Prisma, nên TC-04 là chốt chặn duy nhất. Giữ test, không cần sửa.
- m2 (T610:56): `few` đo với mốc 1 đã có document và feedback, còn các mốc thêm vào chỉ có document. Ca không có feedback ở mốc thêm vẫn kiểm được hằng số truy vấn, nên đủ dùng. Chỉ ghi nhận, không cần sửa.
