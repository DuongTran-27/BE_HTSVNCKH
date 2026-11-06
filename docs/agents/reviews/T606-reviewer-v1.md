# Review T606 – reviewer – vòng 1
Kết luận: **APPROVED**

## Đã tự chạy
- `npm run db:test:reset`: OK. `npm run lint`: 0 lỗi, 0 cảnh báo.
- `npm test`: shared 73/73, api 713/713 (56 file), web 168/168. Khớp báo cáo.

## Đối chiếu API_GD6 §8
- `POST /milestones/:id/reopen`: chỉ LECTURER là GVHD hiện hành (STAFF/ADMIN/SV → 403), IN_PROGRESS (409), `lockOpts` kiểm lại `assertCurrentAdvisor` sau khóa Topic (execution/prismaRepo.js:61-65), `updateMany({id, version, evaluation:'PASSED'})` một câu (prismaRepo.js:24), phân biệt `MILESTONE_NOT_PASSED` / `CONCURRENT_UPDATE` (service.js:126-130), MilestoneReopen + AuditLog + thông báo cùng transaction. Không đổi TRANSITIONS, không StatusHistory (đúng §0).
- `GET /reopens`, `reopenCount`, `lastReopen`, `permissions.reopenMilestone`: đúng hợp đồng.
- Migration: bảng + index (milestoneId, reopenedAt) + trigger UPDATE/DELETE và TRUNCATE dùng `forbid_mutation()` + RLS bật. Test pg_trigger cập nhật.
- Cron: `awaitingSubmission` lấy max(NEEDS_WORK, reopenedAt); có test ca 6.
- FR27: đọc evaluation hiện hành, có test ca 4/5 (đồng thời).
- m6 T600, m1/m2 T605: đã sửa thật (có test: không thêm SimilarityCheck khi pending; so TYPES với shared và enum Postgres).

## Ba chỗ sửa test cũ
T209 (thêm khóa `reopenMilestone:false`), T501 (27→28), T204 (10→11 + `MilestoneReopen`): đều là cập nhật khớp tính năng mới, assert vẫn so khớp toàn bộ, không skip/nới. Chấp nhận.

## BLOCKER / MAJOR
Không.

## MINOR (không chặn)
- m1: execution/service.js:123-124 `findMilestone` đọc `m` trước `reopenPassed`; trong cùng khóa Topic nên an toàn, nhưng `m.version` trong audit `before` có thể lệch `body.version` nếu stale – chỉ ghi khi thành công nên không ảnh hưởng. Bỏ qua.
- m2: `after_init.sql` không cập nhật – nhất quán với GĐ4/GĐ6, chấp nhận.
- m3: changeRequests/service.js:117 `hasPending` ngoài tx là tối ưu; nhánh kiểm lại dưới khóa/P2002 vẫn giữ nên đúng.
