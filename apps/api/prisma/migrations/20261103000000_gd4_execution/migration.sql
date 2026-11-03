-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'FILE';

-- AlterTable
ALTER TABLE "Feedback" ADD COLUMN     "evaluation" "MilestoneEval",
ADD COLUMN     "milestoneId" TEXT,
ADD COLUMN     "progressUpdateId" TEXT;

-- AlterTable
ALTER TABLE "Milestone" ADD COLUMN     "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "requiredRemovedAt" TIMESTAMPTZ(6),
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;
-- Backfill dòng cũ: GVHD hiện hành, không có thì trưởng nhóm, rồi thành viên bất kỳ (mốc cũ không ghi người tạo)
UPDATE "Milestone" m SET "createdById" = COALESCE(
  (SELECT a."lecturerId" FROM "Advising" a WHERE a."topicId" = m."topicId" AND a."endAt" IS NULL LIMIT 1),
  (SELECT tm."userId" FROM "TopicMember" tm WHERE tm."topicId" = m."topicId" ORDER BY (tm.role = 'LEADER') DESC, tm."joinedAt" LIMIT 1));
ALTER TABLE "Milestone" ALTER COLUMN "createdById" SET NOT NULL;

-- AlterTable
ALTER TABLE "ProgressUpdate" ADD COLUMN     "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "ProgressUpdate" ALTER COLUMN "updatedAt" DROP DEFAULT; -- khớp @updatedAt của Prisma (không default ở DB)

-- CreateIndex
CREATE INDEX "Document_milestoneId_version_idx" ON "Document"("milestoneId", "version");

-- CreateIndex
CREATE INDEX "Feedback_topicId_createdAt_idx" ON "Feedback"("topicId", "createdAt");

-- CreateIndex
CREATE INDEX "Feedback_progressUpdateId_idx" ON "Feedback"("progressUpdateId");

-- CreateIndex
CREATE INDEX "Milestone_topicId_order_idx" ON "Milestone"("topicId", "order");

-- CreateIndex
CREATE INDEX "Milestone_dueAt_idx" ON "Milestone"("dueAt");

-- CreateIndex
CREATE INDEX "Milestone_topicId_requiredRemovedAt_idx" ON "Milestone"("topicId", "requiredRemovedAt");

-- CreateIndex
CREATE INDEX "ProgressUpdate_topicId_createdAt_idx" ON "ProgressUpdate"("topicId", "createdAt");

-- CreateIndex
CREATE INDEX "ResultVersion_topicId_isCurrent_idx" ON "ResultVersion"("topicId", "isCurrent");

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MilestoneDueChange" ADD CONSTRAINT "MilestoneDueChange_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressUpdate" ADD CONSTRAINT "ProgressUpdate_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_progressUpdateId_fkey" FOREIGN KEY ("progressUpdateId") REFERENCES "ProgressUpdate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_lecturerId_fkey" FOREIGN KEY ("lecturerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultVersion" ADD CONSTRAINT "ResultVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ===== SQL thô GĐ4 (API_GD45 §11b) =====
-- Một kết quả hiện hành mỗi đề tài (FR12, FR23)
CREATE UNIQUE INDEX result_one_current ON "ResultVersion"("topicId") WHERE "isCurrent";
-- Phiên bản tài liệu duy nhất trong chuỗi (§5.1)
CREATE UNIQUE INDEX document_chain_version ON "Document"("topicId", COALESCE("milestoneId", ''), (CASE WHEN "milestoneId" IS NULL THEN stage ELSE '' END), version);
-- CHECK miền giá trị
ALTER TABLE "ProgressUpdate" ADD CONSTRAINT progress_percent_range CHECK (percent BETWEEN 0 AND 100);
ALTER TABLE "Document" ADD CONSTRAINT document_kind_ck CHECK ((kind = 'FILE' AND "publicId" IS NOT NULL AND "externalUrl" IS NULL) OR (kind = 'LINK' AND "externalUrl" IS NOT NULL AND "publicId" IS NULL));
ALTER TABLE "Document" ADD CONSTRAINT document_stage_ck CHECK (stage IN ('PROPOSAL','MIDTERM','FINAL','OTHER') AND ((stage = 'PROPOSAL') = ("milestoneId" IS NULL)));
ALTER TABLE "Feedback" ADD CONSTRAINT feedback_target_ck CHECK (num_nonnulls("documentId", "progressUpdateId") = 1);
-- Chỉ thêm (FR11, FR09, FR12/FR19) – dùng lại forbid_mutation()
CREATE TRIGGER document_immutable BEFORE UPDATE OR DELETE ON "Document" FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER milestone_due_change_immutable BEFORE UPDATE OR DELETE ON "MilestoneDueChange" FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER feedback_immutable BEFORE UPDATE OR DELETE ON "Feedback" FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER document_no_truncate BEFORE TRUNCATE ON "Document" FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER feedback_no_truncate BEFORE TRUNCATE ON "Feedback" FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER milestone_due_change_no_truncate BEFORE TRUNCATE ON "MilestoneDueChange" FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
-- ResultVersion: chỉ được UPDATE đúng cột isCurrent từ true sang false; không DELETE
CREATE OR REPLACE FUNCTION result_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'ResultVersion chỉ thêm'; END IF;
  IF (to_jsonb(NEW) - 'isCurrent') <> (to_jsonb(OLD) - 'isCurrent') OR NOT (OLD."isCurrent" AND NOT NEW."isCurrent") THEN
    RAISE EXCEPTION 'ResultVersion chỉ được hạ isCurrent';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER result_version_guarded BEFORE UPDATE OR DELETE ON "ResultVersion" FOR EACH ROW EXECUTE FUNCTION result_version_guard();
CREATE TRIGGER result_version_no_truncate BEFORE TRUNCATE ON "ResultVersion" FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();

-- Bảng mới (nếu có) phải bật RLS như migration search_and_security (NFR03): GĐ4 không tạo bảng mới nên không cần.
