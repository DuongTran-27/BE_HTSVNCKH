-- API_GD7 §0, §2.1 (TASK-DC-01): chỉ ADD VALUE. Postgres không cho dùng giá trị enum mới trong cùng transaction đã thêm nó,
-- nên mọi index/SQL dùng RECRUITING/WAITING_DEFENSE nằm ở migration sau (dc_recruitment, dc_council).
ALTER TYPE "TopicStatus" ADD VALUE 'RECRUITING' AFTER 'DRAFT';
ALTER TYPE "TopicStatus" ADD VALUE 'WAITING_DEFENSE' AFTER 'IN_PROGRESS';
