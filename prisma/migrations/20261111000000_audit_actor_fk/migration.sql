-- AuditLog.actorId -> User.id ON DELETE RESTRICT (review TASK-USER-DELETE bao-mat v2, m4): đóng race "xóa tài khoản ‖ thao tác đang ghi AuditLog".
-- Dừng rõ ràng nếu đã có dòng mồ côi (không tự sửa lịch sử chỉ-thêm, FR15) – con người xử lý trước khi chạy lại.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "AuditLog" a WHERE a."actorId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = a."actorId")) THEN
    RAISE EXCEPTION 'AuditLog có actorId không tồn tại trong User; xử lý các dòng này trước khi thêm khóa ngoại';
  END IF;
END $$;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
