-- TASK-DC-09 (FR36, FR37 – API_GD7 §2.3, §7): siết trigger trước khi có API ghi điểm/chốt (MINOR m1 BM DC-07).
-- Chỉ thay thân hàm; tên trigger giữ nguyên.

-- Phân công: không đổi đề tài/hội đồng/người gán (UPDATE chuyển phân công mở sang đề tài khác là lách index một phân công mở)
CREATE OR REPLACE FUNCTION council_assignment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'CouncilAssignment không được xóa'; END IF;
  IF OLD."decidedAt" IS NOT NULL OR OLD."cancelledAt" IS NOT NULL THEN RAISE EXCEPTION 'Phân công đã chốt hoặc đã hủy'; END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW."topicId" IS DISTINCT FROM OLD."topicId" OR NEW."councilId" IS DISTINCT FROM OLD."councilId"
     OR NEW."assignedById" IS DISTINCT FROM OLD."assignedById" OR NEW."assignedAt" IS DISTINCT FROM OLD."assignedAt" THEN
    RAISE EXCEPTION 'Không được đổi đề tài hoặc hội đồng của phân công'; END IF;
  RETURN NEW;
END $$;

-- Điểm bảo vệ: UPDATE không được chuyển điểm sang phân công/thành viên khác (trước đây chỉ xét NEW."assignmentId":
-- chuyển điểm từ phân công đã chốt sang phân công mở thì lọt)
CREATE OR REPLACE FUNCTION defense_score_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'DefenseScore không được xóa'; END IF;
  IF TG_OP = 'UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW."assignmentId" IS DISTINCT FROM OLD."assignmentId" OR NEW."memberId" IS DISTINCT FROM OLD."memberId") THEN
    RAISE EXCEPTION 'Không được chuyển điểm sang phân công hoặc thành viên khác'; END IF;
  IF EXISTS (SELECT 1 FROM "CouncilAssignment" a WHERE a.id = NEW."assignmentId" AND (a."decidedAt" IS NOT NULL OR a."cancelledAt" IS NOT NULL)) THEN
    RAISE EXCEPTION 'Điểm đã khóa'; END IF;
  RETURN NEW;
END $$;
