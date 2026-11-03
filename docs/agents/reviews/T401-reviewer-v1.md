# Review T401 (FR09) + BUG-009 – reviewer v1

Kết luận: **CHANGES_REQUESTED** (1 MAJOR về migration; phần còn lại đạt).

Tự chạy (DB `nckh_t401rv_test`, embedded 54329, `db:test:reset` ok): `npm run lint` sạch; `npm test` shared 68/68, api 511/511 (41 file), web 144/144 (20 file); `test:e2e -w @nckh/web -- --list` thấy 8 test trong m1.spec.js.

## MAJOR
- M1 `apps/api/prisma/migrations/20261103000000_gd4_execution/migration.sql` dòng "ALTER TABLE Milestone ADD COLUMN createdById TEXT NOT NULL" và "ProgressUpdate ADD COLUMN updatedAt ... NOT NULL": không default/backfill, `migrate deploy` lỗi trên DB đã có dòng Milestone/ProgressUpdate (DB dev đã seed, seed.js tạo Milestone). Đề xuất: thêm cột nullable, `UPDATE "Milestone" SET "createdById" = (người tạo/GVHD của đề tài)`, rồi `SET NOT NULL`; `updatedAt` thêm `DEFAULT CURRENT_TIMESTAMP` (Prisma `@updatedAt` vẫn ghi giá trị khi update). Kèm test migrate trên DB có dữ liệu cũ nếu được.

## MINOR (không chặn)
- m1 service.js `update`: PATCH chỉ đổi `required` true->true vẫn tăng version và ghi audit dù không đổi; chấp nhận được.
- m2 Báo cáo ghi DB `nckh_t401_test`; tôi dùng DB riêng, kết quả khớp.

## 4 điểm lệch
1. Không sửa after_init.sql: CHẤP NHẬN (T203 buộc trùng byte; SQL thô nằm trong migration mới, đúng §11b về chức năng).
2. `requiredRemovedAt` + index: CHẤP NHẬN, logic đặt/xóa dấu đúng, `countRequiredRemoved` loại mốc đã Đạt.
3. T204 5 -> 9 trigger BEFORE TRUNCATE: CHẤP NHẬN. Đây là cập nhật theo đặc tả (§11b thêm 4 trigger no_truncate: Document, Feedback, MilestoneDueChange, ResultVersion); vẫn kiểm đúng tập tên bảng, đúng proname, đúng tgtype; không skip/làm lỏng.
4. `createdById` trong seed.js: CHẤP NHẬN (cột NOT NULL mới).

## Kiểm khác (đạt)
- Quyền ở backend: ADMIN 403 (requireRole), ghi chỉ GVHD hiện hành/cán bộ trong phạm vi, SV chỉ đọc; thứ tự 403 trước 409.
- Transaction + khóa: `writeMilestone` -> withLockTx, `lockTopicForExecution` FOR NO KEY UPDATE kiểm lại IN_PROGRESS; khóa lạc quan theo version (CONCURRENT_UPDATE); `oldDueAt` lấy từ dòng đã khóa; AuditLog cùng transaction; DueChange chỉ-thêm (trigger).
- Migration không DROP dữ liệu cũ (ngoài M1).

## BUG-009: ĐẠT
`apps/web/vite.config.js` `test.exclude: ['**/node_modules/**','e2e/**']`; `npm test -w @nckh/web` xanh 144/144, Playwright dùng config riêng nên vẫn liệt kê 8 test.
