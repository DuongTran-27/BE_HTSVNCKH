-- API_GD7 §2.1–2.3 (TASK-DC-07, FR34–FR37): điểm quá trình, hội đồng, phân công, điểm bảo vệ; nguồn kết quả cuối.
-- CreateEnum
CREATE TYPE "CouncilRole" AS ENUM ('CHAIR', 'SECRETARY', 'MEMBER');

-- CreateEnum
CREATE TYPE "DefenseDecision" AS ENUM ('PASSED', 'FAILED');

-- CreateEnum
CREATE TYPE "ResultSource" AS ENUM ('ADVISOR', 'COUNCIL', 'STAFF');

-- AlterTable
ALTER TABLE "ResultVersion" ADD COLUMN     "source" "ResultSource" NOT NULL DEFAULT 'ADVISOR';

-- CreateTable
CREATE TABLE "ProcessScore" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "lecturerId" TEXT NOT NULL,
    "score" DECIMAL(4,2) NOT NULL,
    "comment" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Council" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "facultyId" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Council_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CouncilMember" (
    "councilId" TEXT NOT NULL,
    "lecturerId" TEXT NOT NULL,
    "role" "CouncilRole" NOT NULL,

    CONSTRAINT "CouncilMember_pkey" PRIMARY KEY ("councilId","lecturerId")
);

-- CreateTable
CREATE TABLE "CouncilAssignment" (
    "id" TEXT NOT NULL,
    "councilId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "assignedById" TEXT NOT NULL,
    "assignedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMPTZ(6),
    "cancelReason" TEXT,
    "finalScore" DECIMAL(4,2),
    "decision" "DefenseDecision",
    "minutes" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMPTZ(6),

    CONSTRAINT "CouncilAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DefenseScore" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "score" DECIMAL(4,2) NOT NULL,
    "comment" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "DefenseScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProcessScore_topicId_createdAt_idx" ON "ProcessScore"("topicId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Council_code_key" ON "Council"("code");

-- CreateIndex
CREATE INDEX "Council_roundId_idx" ON "Council"("roundId");

-- CreateIndex
CREATE INDEX "CouncilMember_lecturerId_idx" ON "CouncilMember"("lecturerId");

-- CreateIndex
CREATE INDEX "CouncilAssignment_councilId_idx" ON "CouncilAssignment"("councilId");

-- CreateIndex
CREATE INDEX "CouncilAssignment_topicId_idx" ON "CouncilAssignment"("topicId");

-- CreateIndex
CREATE UNIQUE INDEX "DefenseScore_assignmentId_memberId_key" ON "DefenseScore"("assignmentId", "memberId");

-- AddForeignKey
ALTER TABLE "ProcessScore" ADD CONSTRAINT "ProcessScore_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessScore" ADD CONSTRAINT "ProcessScore_lecturerId_fkey" FOREIGN KEY ("lecturerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Council" ADD CONSTRAINT "Council_facultyId_fkey" FOREIGN KEY ("facultyId") REFERENCES "Faculty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Council" ADD CONSTRAINT "Council_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Council" ADD CONSTRAINT "Council_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouncilMember" ADD CONSTRAINT "CouncilMember_councilId_fkey" FOREIGN KEY ("councilId") REFERENCES "Council"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouncilMember" ADD CONSTRAINT "CouncilMember_lecturerId_fkey" FOREIGN KEY ("lecturerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouncilAssignment" ADD CONSTRAINT "CouncilAssignment_councilId_fkey" FOREIGN KEY ("councilId") REFERENCES "Council"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouncilAssignment" ADD CONSTRAINT "CouncilAssignment_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouncilAssignment" ADD CONSTRAINT "CouncilAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouncilAssignment" ADD CONSTRAINT "CouncilAssignment_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefenseScore" ADD CONSTRAINT "DefenseScore_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "CouncilAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefenseScore" ADD CONSTRAINT "DefenseScore_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ===== Nguồn kết quả (API_GD7 §5.5): bản do cán bộ tạo (FR23 sửa sau đóng, CLOSE_EXPIRED) là STAFF =====
-- result_version_guard chỉ cho hạ isCurrent; tắt tạm trong transaction của migration để backfill một lần
ALTER TABLE "ResultVersion" DISABLE TRIGGER result_version_guarded;
UPDATE "ResultVersion" r SET "source" = 'STAFF' FROM "User" u WHERE u.id = r."createdById" AND u.role = 'STAFF';
ALTER TABLE "ResultVersion" ENABLE TRIGGER result_version_guarded;

-- ===== SQL thô (API_GD7 §2.3) =====
-- Bảng mới bật RLS, không policy (NFR03, M6 BM)
ALTER TABLE "ProcessScore"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Council"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CouncilMember"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CouncilAssignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DefenseScore"      ENABLE ROW LEVEL SECURITY;
CREATE SEQUENCE council_code_seq;
CREATE UNIQUE INDEX council_one_chair     ON "CouncilMember" ("councilId") WHERE role = 'CHAIR';
CREATE UNIQUE INDEX council_one_secretary ON "CouncilMember" ("councilId") WHERE role = 'SECRETARY';
CREATE UNIQUE INDEX council_assignment_one_open ON "CouncilAssignment" ("topicId") WHERE "decidedAt" IS NULL AND "cancelledAt" IS NULL;
-- Điểm quá trình chỉ thêm (FR34)
CREATE TRIGGER process_score_append_only BEFORE UPDATE OR DELETE ON "ProcessScore" FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER process_score_no_truncate BEFORE TRUNCATE ON "ProcessScore" FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
-- Phân công đã chốt/hủy thì bất biến; không xóa
CREATE OR REPLACE FUNCTION council_assignment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'CouncilAssignment không được xóa'; END IF;
  IF OLD."decidedAt" IS NOT NULL OR OLD."cancelledAt" IS NOT NULL THEN RAISE EXCEPTION 'Phân công đã chốt hoặc đã hủy'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER council_assignment_guarded BEFORE UPDATE OR DELETE ON "CouncilAssignment" FOR EACH ROW EXECUTE FUNCTION council_assignment_guard();
-- Điểm bảo vệ: không xóa; không thêm/sửa khi phân công đã chốt hoặc đã hủy
CREATE OR REPLACE FUNCTION defense_score_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'DefenseScore không được xóa'; END IF;
  IF EXISTS (SELECT 1 FROM "CouncilAssignment" a WHERE a.id = NEW."assignmentId" AND (a."decidedAt" IS NOT NULL OR a."cancelledAt" IS NOT NULL)) THEN
    RAISE EXCEPTION 'Điểm đã khóa'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER defense_score_guarded BEFORE INSERT OR UPDATE OR DELETE ON "DefenseScore" FOR EACH ROW EXECUTE FUNCTION defense_score_guard();
