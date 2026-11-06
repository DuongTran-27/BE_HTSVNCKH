-- CreateTable
CREATE TABLE "MilestoneReopen" (
    "id" TEXT NOT NULL,
    "milestoneId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "reopenedById" TEXT NOT NULL,
    "reopenedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MilestoneReopen_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MilestoneReopen_milestoneId_reopenedAt_idx" ON "MilestoneReopen"("milestoneId", "reopenedAt");

-- AddForeignKey
ALTER TABLE "MilestoneReopen" ADD CONSTRAINT "MilestoneReopen_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MilestoneReopen" ADD CONSTRAINT "MilestoneReopen_reopenedById_fkey" FOREIGN KEY ("reopenedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ===== SQL thô FR22 (API_GD6 §8) =====
-- Chỉ thêm, dùng lại forbid_mutation()
CREATE TRIGGER milestone_reopen_immutable BEFORE UPDATE OR DELETE ON "MilestoneReopen" FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER milestone_reopen_no_truncate BEFORE TRUNCATE ON "MilestoneReopen" FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
-- Bảng mới phải bật RLS (NFR03)
ALTER TABLE "MilestoneReopen" ENABLE ROW LEVEL SECURITY;
