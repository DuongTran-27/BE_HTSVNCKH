-- Nội dung y hệt migration `*_search_and_security/migration.sql` (test T203 so khớp). Đã áp thì không sửa file này:
-- index/trigger SQL thô mới viết vào một migration mới (`prisma migrate dev --create-only`).

-- 1) Sequence sinh mã đề tài (FR05)
CREATE SEQUENCE IF NOT EXISTS topic_code_seq START 1;

-- 2) unaccent bản IMMUTABLE để dùng trong index (FR06)
CREATE OR REPLACE FUNCTION immutable_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent', $1) $$;

-- 3) Index trigram cho tên đề tài
CREATE INDEX IF NOT EXISTS topic_title_trgm_idx
  ON "Topic" USING GIN (lower(immutable_unaccent(title)) gin_trgm_ops);

-- 4) Lịch sử chỉ thêm, không sửa, không xóa (FR15)
CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Bảng % chỉ cho phép thêm mới', TG_TABLE_NAME; END $$;
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER status_history_append_only BEFORE UPDATE OR DELETE ON "StatusHistory"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
-- Snapshot, quyết định và kết quả kiểm tra tương tự bất biến (FR17, API_GD2 §11b)
CREATE TRIGGER submission_immutable BEFORE UPDATE OR DELETE ON "Submission"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER review_decision_immutable BEFORE UPDATE OR DELETE ON "ReviewDecision"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER similarity_check_immutable BEFORE UPDATE OR DELETE ON "SimilarityCheck"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- 4b) Partial unique index – lưới an toàn ở DB cho bất biến code đã giữ (API_GD2 §11b); vi phạm = P2002 → 409
CREATE UNIQUE INDEX topic_one_leader ON "TopicMember"("topicId") WHERE role = 'LEADER' AND "leftAt" IS NULL;
CREATE UNIQUE INDEX topic_member_current ON "TopicMember"("topicId", "userId") WHERE "leftAt" IS NULL;
CREATE UNIQUE INDEX invitation_one_pending ON "Invitation"("topicId", "inviteeId") WHERE status = 'PENDING';
CREATE UNIQUE INDEX advisor_request_one_pending ON "AdvisorRequest"("topicId") WHERE status = 'PENDING';
CREATE UNIQUE INDEX advising_one_current ON "Advising"("topicId") WHERE "endAt" IS NULL;

-- 5) Chặn Data API của Supabase truy cập bảng (NFR03): bật RLS, không tạo policy.
--    Prisma kết nối bằng role postgres (bypass RLS) nên không bị ảnh hưởng.
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;
