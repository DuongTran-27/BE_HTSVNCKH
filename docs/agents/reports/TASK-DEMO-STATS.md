# TASK-DEMO-STATS – Dữ liệu demo cho trang thống kê

Yêu cầu người dùng (2026-11-11): tự tạo thêm dữ liệu để xem thống kê. Seed gốc chỉ có 1 đợt, 30 đề tài nên biểu đồ thưa.

## Làm gì
- `apps/api/scripts/demo-stats.js` (`npm run demo:stats -w @nckh/api`), chạy sau `prisma db seed`, chỉ trên DB đã bật cờ seed (`assertSeedAllowedDb`), cấm production.
- Thêm 3 đợt năm học 2023-2024 / 2024-2025 / 2025-2026 (14 / 20 / 26 đề tài), lớp khóa K26–K28, mỗi đề tài một sinh viên trưởng nhóm mới (MSSV kiểu Văn Lang 20/21/22…), GVHD là 8 giảng viên hiện có, đủ 6 lĩnh vực.
- Đề tài đi đúng bảng chuyển trạng thái (`findTransition`), mỗi bước ghi `StatusHistory`, kèm bản ghi đi kèm như seed (đề nghị GVHD, Advising, SimilarityCheck + Submission, ReviewDecision, Milestone, ChangeRequest hủy, ResultVersion). Trạng thái cuối: Đã đóng (có kết quả Xuất sắc/Tốt/Đạt/Không đạt), Bị từ chối, Đã hủy.
- Một transaction; chạy lại không nhân đôi (đã có đợt 2023-2024 thì bỏ qua).

## Bằng chứng
```
npx vitest run tests/demo-stats.test.js     → Tests 2 passed (2)
npm run demo:stats -w @nckh/api (DB dev)    → Đã thêm 60 đề tài lịch sử (2023-2024, 2024-2025, 2025-2026).
GET /api/stats?groupBy=academicYear (CB001) → 2026-2027: 27, 2025-2026: 26, 2024-2025: 20, 2023-2024: 14
npm run lint                                → không lỗi
npm test                                    → 73 + 962 + 234 passed, 0 failed
```
