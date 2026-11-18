-- API_GD7 §2.1, §10.1 (TASK-DC-02, FR30): số điện thoại hồ sơ cá nhân. Cột nullable; User đã bật RLS từ init, không cần policy mới.
ALTER TABLE "User" ADD COLUMN "phone" TEXT;
