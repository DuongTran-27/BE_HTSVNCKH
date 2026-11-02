-- Đăng nhập tra mã không phân biệt hoa thường (auth/prismaRepo.js): cấm hai mã chỉ khác hoa/thường, kể cả khi tạo đồng thời. T207a.
CREATE UNIQUE INDEX "User_code_lower_key" ON "User" (lower(code));
