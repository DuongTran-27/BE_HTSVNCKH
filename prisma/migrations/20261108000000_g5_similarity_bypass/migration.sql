-- CreateTable
CREATE TABLE "SimilarityBypass" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "grantedById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SimilarityBypass_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SimilarityBypass_topicId_createdAt_idx" ON "SimilarityBypass"("topicId", "createdAt");

-- AddForeignKey
ALTER TABLE "SimilarityBypass" ADD CONSTRAINT "SimilarityBypass_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimilarityBypass" ADD CONSTRAINT "SimilarityBypass_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ===== SQL thô G5 (API_GD6 §9.7) =====
-- Chỉ thêm, dùng lại forbid_mutation()
CREATE TRIGGER similarity_bypass_immutable BEFORE UPDATE OR DELETE ON "SimilarityBypass" FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER similarity_bypass_no_truncate BEFORE TRUNCATE ON "SimilarityBypass" FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
-- Bảng mới phải bật RLS (NFR03)
ALTER TABLE "SimilarityBypass" ENABLE ROW LEVEL SECURITY;

-- Submission: chỉ nới cột "similarityCheckId", đúng một lần từ NULL/ERROR sang dòng kiểm OK mới hơn của cùng đề tài,
-- chưa thuộc ChangeRequest (MINOR m5c reviews/T600-reviewer-v1.md). Mọi cột khác và DELETE vẫn bị từ chối như cũ.
CREATE OR REPLACE FUNCTION submission_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE old_ok boolean; new_ok boolean;
BEGIN
  IF TG_OP = 'DELETE' OR (to_jsonb(NEW) - 'similarityCheckId') <> (to_jsonb(OLD) - 'similarityCheckId') THEN
    RAISE EXCEPTION 'Bảng % chỉ cho phép thêm mới', TG_TABLE_NAME;
  END IF;
  SELECT status = 'OK' INTO old_ok FROM "SimilarityCheck" WHERE id = OLD."similarityCheckId";
  SELECT c.status = 'OK' AND c."topicId" = NEW."topicId" AND c."createdAt" > OLD."createdAt"
         AND NOT EXISTS (SELECT 1 FROM "ChangeRequest" r WHERE r."similarityCheckId" = c.id)
    INTO new_ok FROM "SimilarityCheck" c WHERE c.id = NEW."similarityCheckId";
  IF coalesce(old_ok, false) OR NOT coalesce(new_ok, false) THEN
    RAISE EXCEPTION 'Chỉ được thay kết quả FR06 lỗi bằng kết quả thành công mới hơn của cùng đề tài';
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER submission_immutable BEFORE UPDATE OR DELETE ON "Submission"
  FOR EACH ROW EXECUTE FUNCTION submission_guard();
