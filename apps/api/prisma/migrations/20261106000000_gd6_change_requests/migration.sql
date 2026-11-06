-- AlterTable
ALTER TABLE "Advising" ADD COLUMN     "readOnlyGranted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ChangeRequest" ADD COLUMN     "similarityCheckId" TEXT,
ADD COLUMN     "targetAcceptedAt" TIMESTAMPTZ(6),
ADD COLUMN     "targetUserId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ChangeRequest_similarityCheckId_key" ON "ChangeRequest"("similarityCheckId");

-- CreateIndex
CREATE INDEX "ChangeRequest_topicId_status_idx" ON "ChangeRequest"("topicId", "status");

-- CreateIndex
CREATE INDEX "ChangeRequest_targetUserId_status_idx" ON "ChangeRequest"("targetUserId", "status");

-- CreateIndex
CREATE INDEX "ChangeRequest_status_type_idx" ON "ChangeRequest"("status", "type");

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_similarityCheckId_fkey" FOREIGN KEY ("similarityCheckId") REFERENCES "SimilarityCheck"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- ===== SQL thô GĐ6 (API_GD6 §2.6) =====
-- Một yêu cầu đang chờ mỗi loại mỗi đề tài; LEAVE_GROUP: mỗi người rời
CREATE UNIQUE INDEX change_request_one_pending ON "ChangeRequest"
  ("topicId", type, (CASE WHEN type = 'LEAVE_GROUP' THEN "targetUserId" ELSE '' END)) WHERE status = 'PENDING';
-- payload, lý do, người tạo bất biến; chỉ PENDING được đổi, và chỉ các cột quyết định
CREATE OR REPLACE FUNCTION change_request_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'ChangeRequest chỉ thêm'; END IF;
  IF OLD.status <> 'PENDING'
     OR (to_jsonb(NEW) - ARRAY['status','decidedById','decisionNote','decidedAt','targetAcceptedAt'])
        <> (to_jsonb(OLD) - ARRAY['status','decidedById','decisionNote','decidedAt','targetAcceptedAt']) THEN
    RAISE EXCEPTION 'ChangeRequest đã quyết định hoặc sửa cột bất biến';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER change_request_guarded BEFORE UPDATE OR DELETE ON "ChangeRequest" FOR EACH ROW EXECUTE FUNCTION change_request_guard();
CREATE TRIGGER change_request_no_truncate BEFORE TRUNCATE ON "ChangeRequest" FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
-- Không tạo bảng mới nên không cần bật RLS thêm (NFR03).
