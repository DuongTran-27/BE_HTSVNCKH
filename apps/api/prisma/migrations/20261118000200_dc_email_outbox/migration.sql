-- API_GD7 §2.1, §9.2 (TASK-DC-04, FR29): hộp thư đi email trên bảng Notification. Notification đã bật RLS từ init, không cần policy mới.
ALTER TABLE "Notification" ADD COLUMN "emailStatus" TEXT,
  ADD COLUMN "emailAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "emailClaimedAt" TIMESTAMPTZ(6),
  ADD COLUMN "emailedAt" TIMESTAMPTZ(6);

CREATE INDEX "Notification_emailStatus_createdAt_idx" ON "Notification"("emailStatus", "createdAt");
