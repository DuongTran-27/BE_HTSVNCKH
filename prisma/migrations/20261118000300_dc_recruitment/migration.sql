-- API_GD7 §2.1, §2.3 (TASK-DC-05, FR31–FR33): đề tài GV công bố + đơn ứng tuyển.
-- CreateEnum
CREATE TYPE "TopicOrigin" AS ENUM ('STUDENT', 'LECTURER');

-- AlterTable
ALTER TABLE "Topic" ADD COLUMN     "origin" "TopicOrigin" NOT NULL DEFAULT 'STUDENT',
ADD COLUMN     "recruitSlots" INTEGER,
ADD COLUMN     "requirements" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "TopicApplication" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "coverLetter" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "decidedById" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMPTZ(6),

    CONSTRAINT "TopicApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TopicApplication_topicId_status_idx" ON "TopicApplication"("topicId", "status");

-- CreateIndex
CREATE INDEX "TopicApplication_studentId_status_idx" ON "TopicApplication"("studentId", "status");

-- AddForeignKey
ALTER TABLE "TopicApplication" ADD CONSTRAINT "TopicApplication_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicApplication" ADD CONSTRAINT "TopicApplication_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ===== SQL thô (API_GD7 §2.3) =====
-- n3 (BM v2): chỉ chặn hai đơn ĐANG CHỜ; đơn đã nhận/từ chối/rút không chặn ứng tuyển lại sau khi ngừng tuyển rồi công bố lại.
-- Một SV không vào nhóm hai lần đã do TopicMember + suất đề tài/đợt (FR03) chặn.
CREATE UNIQUE INDEX application_one_active ON "TopicApplication" ("topicId", "studentId") WHERE status = 'PENDING';
-- Bảng mới phải bật RLS, không policy (NFR03, tiền lệ fr22_milestone_reopen)
ALTER TABLE "TopicApplication" ENABLE ROW LEVEL SECURITY;
