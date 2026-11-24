-- TASK-DC-20 (m3 từ DC-04): ràng buộc giá trị emailStatus + index một phần cho hàng đợi gửi.
-- Dữ liệu cũ chỉ có NULL/PENDING/SENDING/SENT/FAILED/SKIPPED (email.js, notify.js) nên thêm CHECK không vi phạm.
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_emailStatus_check"
  CHECK ("emailStatus" IS NULL OR "emailStatus" IN ('PENDING', 'SENDING', 'SENT', 'FAILED', 'SKIPPED'));

-- Câu lệnh nhận việc chỉ quét PENDING/SENDING theo createdAt; thư đã SENT/SKIPPED (đa số) không nằm trong index.
-- Thay index đầy đủ (emailStatus, createdAt) của DC-04; Prisma không biểu diễn index một phần nên bỏ @@index khỏi schema.prisma.
DROP INDEX "Notification_emailStatus_createdAt_idx";
CREATE INDEX "Notification_email_queue_idx" ON "Notification"("createdAt") WHERE "emailStatus" IN ('PENDING', 'SENDING');
