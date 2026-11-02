-- FR15: bảng chỉ-thêm cũng không cho TRUNCATE (trigger dòng không chạy với TRUNCATE). T204.
-- Dọn DB test: tests/db.js chạy TRUNCATE với session_replication_role = replica (chỉ superuser, chỉ DB *_test).
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON "AuditLog"
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER status_history_no_truncate BEFORE TRUNCATE ON "StatusHistory"
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER submission_no_truncate BEFORE TRUNCATE ON "Submission"
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER review_decision_no_truncate BEFORE TRUNCATE ON "ReviewDecision"
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER similarity_check_no_truncate BEFORE TRUNCATE ON "SimilarityCheck"
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
