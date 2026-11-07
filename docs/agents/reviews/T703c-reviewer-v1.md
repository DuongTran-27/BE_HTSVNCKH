# Review T703 bước C – reviewer v1
Kết luận: **APPROVED** (không BLOCKER/MAJOR; MINOR không chặn)

## Bằng chứng tự chạy (2026-11-08)
- `npm run lint`: sạch (`--max-warnings 0`).
- `npm test`: api 61 file / 921 test xanh; web 25 file / 219 test xanh; shared không thấy lỗi (đầu ra bị cắt, khớp báo cáo 73).
- Khớp báo cáo T703c (921 = 907 + 14).

## Kiểm
- Test `apps/api/tests/security/T703c-bao-mat.test.js`: không `.skip/.only/.todo`, 37 `expect`. Ca IDOR có đối chứng 200 trước tấn công, kiểm 403/404 thay vì chỉ "không 2xx", so ảnh chụp DB trước/sau, kiểm không lộ URL ký, và đã được đột biến chứng minh không rỗng. Bao phủ IDOR theo quan hệ, cookie, CORS, helmet, RLS/SECURITY DEFINER, upload ngoài nhóm. CSV đã có ở T703b/T503, báo cáo viện dẫn hợp lý.
- `docs/VAN_HANH.md` §5: quyền tối thiểu (DML, không TRUNCATE/TRIGGER/REFERENCES), REVOKE UPDATE/DELETE trên bảng chỉ-thêm, loại đúng ba bảng có UPDATE hợp lệ, `ALTER DEFAULT PRIVILEGES`, mật khẩu là placeholder, không tạo tài khoản thật, không lộ bí mật. Có kịch bản xác nhận và đã thử trên PG16 test.
- Chuyển MAJOR `trust proxy` / gọi thẳng Render sang T706: hợp lý. Sửa an toàn cần biết số hop thật và Vercel middleware gắn header, đều cần môi trường deploy. Đổi `trust proxy` ngay mà chưa chặn gọi thẳng sẽ mở giả XFF. Phải xong trước khi dùng thật, đã ghi rõ trong báo cáo.

## MINOR (không chặn)
1. `docs/VAN_HANH.md:91` (§4 bước 5) còn câu "Limiter 10 lần/15 phút dùng chung với nhắc hạn", đã cũ sau T703b (limiter riêng). Sửa ở T707 (đã chuyển).
2. `apps/api/src/app.js:37` `CORS_ORIGIN.split(',')` thiếu `trim()` (lỗi theo hướng đóng). Gộp T706.
3. `VAN_HANH.md` §5.1 `GRANT USAGE ON SCHEMA extensions` sẽ lỗi nếu schema không tồn tại (chỉ ở DB ngoài Supabase). Đúng với Supabase, chấp nhận.
4. Mục tiêu "dòng T703" còn có hạng mục T706 (hop, chặn gọi thẳng, tách DIRECT_URL, Data API): bảo đảm T706 nhận đủ, vì đây là điều kiện đưa vào dùng thật.
