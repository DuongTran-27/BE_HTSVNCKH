# TASK-DC-10 – `MilestoneView.awaitingFeedback` (FR38, GD7 §10.2)

## Thay đổi
- `apps/api/src/modules/execution/prismaRepo.js`: `VIEW_INCLUDE.documents` thêm `feedbacks` lồng (chỉ `evaluation` khác null, `take: 1`). Prisma gộp theo IN cho cả danh sách nên số truy vấn không phụ thuộc số mốc.
- `apps/api/src/modules/execution/service.js`: `presentMilestone` thêm `awaitingFeedback = có latestDocument && bản đó chưa có nhận xét có đánh giá`.
- `apps/api/tests/T610-awaiting-feedback.test.js` (mới): TC-FR38-01 (chưa nộp false / nộp chưa nhận xét true), 02 (nhận xét không đánh giá vẫn true), 03 (NEEDS_WORK false; nộp bản mới true), 04 (đếm truy vấn `listMilestones` 1 mốc = 6 mốc, không N+1).
- OpenAPI: không mô tả MilestoneView nên không cần sửa. `docs/agents/BANG_CONG_VIEC.md`: DC-10 -> REVIEW.

## Lệnh
- `npm run lint`: sạch (0 lỗi, 0 cảnh báo) sau khi bỏ import thừa trong test.
- `npm test`: api 83 file / 1202 test đạt; web 32 file / 245 test đạt (đã gồm T610).

## Câu hỏi cho reviewer
Một truy vấn "gộp" được hiểu là số truy vấn hằng số (Prisma include), không phải đúng 1 câu SQL.
