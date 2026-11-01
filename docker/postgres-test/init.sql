-- Chạy một lần khi container khởi tạo. Tạo extension cả ở template1 để DB tạo lại
-- (prisma migrate reset, shadow DB của migrate dev) cũng có sẵn pg_trgm, unaccent.
\c template1
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
\c nckh_test
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
