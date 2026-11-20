-- FINAL-bao-mat-v3 m1: điểm 0..10 kiểm cả ở DB (trước đây chỉ Zod) – phòng ghi thẳng bằng SQL sai miền
ALTER TABLE "ProcessScore" ADD CONSTRAINT "ProcessScore_score_range" CHECK ("score" >= 0 AND "score" <= 10);
ALTER TABLE "DefenseScore" ADD CONSTRAINT "DefenseScore_score_range" CHECK ("score" >= 0 AND "score" <= 10);
ALTER TABLE "CouncilAssignment" ADD CONSTRAINT "CouncilAssignment_finalScore_range" CHECK ("finalScore" IS NULL OR ("finalScore" >= 0 AND "finalScore" <= 10));
