# Lộ trình triển khai

Mỗi giai đoạn kết thúc bằng: code chạy được, test đạt, cập nhật mục "Đã xong" dưới đây.

| GĐ | Nội dung | FR | Trạng thái |
|---|---|---|---|
| 1 | Nền tảng: monorepo, schema CSDL, xác thực, phân quyền, luồng trạng thái, kiểm tra tương tự, CSV | FR01, FR06 (lõi), FR15 (trigger), FR25 (lõi) | **Đã xong** |
| 2 | API nghiệp vụ: danh mục, đợt, tài khoản + nhập CSV, nhóm, hồ sơ, đề nghị GVHD, gửi/xét duyệt + snapshot, kiểm tra tương tự qua DB, seed dữ liệu mẫu | FR02–FR07, FR16, FR17 | Tiếp theo |
| 3 | Frontend: khung React, đăng nhập/refresh, layout theo vai trò, màn đăng ký đề tài + cảnh báo trùng, màn xét duyệt | FR01–FR08 (giao diện) | |
| 4 | Thực hiện: mốc, tiến độ, upload Cloudinary, nhận xét, đóng đề tài, tải tài liệu có ký URL | FR09–FR12, FR24, FR27 | |
| 5 | Thông báo + nhắc hạn (GitHub Actions), thống kê + dashboard Recharts + CSV, tra cứu kho đề tài | FR08, FR13, FR14 | |
| 6 | Luồng ngoại lệ P2/P3: thay GV, hủy, rời nhóm, sửa kết quả, thay đổi sau duyệt, mở lại mốc; sao lưu | FR18–FR23, FR26 | |
| 7 | E2E Playwright, Swagger, deploy Vercel + Render, bộ dữ liệu thực nghiệm FR06, tài liệu báo cáo | NFR01–NFR10 | |

## Giai đoạn 1 – đã xong

- `packages/shared`: 10 trạng thái, 14 thao tác chuyển trạng thái, cấu hình mặc định theo đợt, schema Zod.
- `apps/api/prisma/schema.prisma`: 27 bảng, đã kiểm tra hợp lệ; `prisma/sql/after_init.sql` gồm sequence mã đề tài, index trigram, trigger chỉ-thêm cho lịch sử, bật RLS.
- Xác thực: Argon2id, access token 15 phút, refresh token xoay vòng lưu bản băm, phát hiện dùng lại → thu hồi cả họ phiên, tạm khóa sau 5 lần sai, khóa tài khoản chặn ngay, đổi mật khẩu thu hồi phiên khác.
- Kiểm tra tương tự: chuẩn hóa tiếng Việt, cặp âm tiết, từ đồng nghĩa, TF-IDF + cosine, mô phỏng pg_trgm, top 5, hai ngưỡng, ẩn hồ sơ đang chờ với sinh viên, lỗi → ERROR.
- 44 test tự động (Vitest + Supertest), tất cả đạt.

## Việc bạn cần làm song song

- Tạo tài khoản Supabase, Cloudinary, Vercel, Render, GitHub.
- Xin 100–200 tên + tóm tắt đề tài NCKH CNTT các năm trước cho bộ dữ liệu FR06.
- Xác nhận các giả định ở mục 8 của tài liệu đặc tả.
