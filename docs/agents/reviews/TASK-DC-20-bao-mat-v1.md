# Review bảo mật TASK-DC-20 v1 – APPROVED

Phạm vi: render.yaml, VAN_HANH §6.5/6.6, .env.example, schema.prisma, migration dc20, tests/DC20-ops.test.js.

Đã kiểm
- render.yaml: 10 biến mới đều `sync: false`, không giá trị; `git grep` không thấy khóa/secret thật. Tên biến khớp GOOGLE_ENV_KEYS/SMTP_ENV_KEYS/SMTP_SECURE trong config/env.js.
- Hướng dẫn OAuth/SMTP đúng và an toàn: Internal, redirect URI qua domain Vercel, scope tối thiểu, https bắt buộc ở production (env.js:39), SPF/DKIM/DMARC, mật khẩu ứng dụng. Code ssoService.js:78-81 kiểm email_verified + hd ký bởi Google + đuôi email == hd + nằm trong danh sách; `hd` ở URL chỉ là gợi ý (đúng như ghi chú).
- CSP: lập luận đúng (điều hướng cấp trên cùng không thuộc connect/script/img-src; form-action chỉ áp cho form). Không nới CSP là đúng.
- npm audit: xlsx.js chỉ dùng `stream.xlsx.WorkbookWriter` (ghi, không đọc file người dùng); uuid chỉ bị khi gọi v3/v5/v6 với `buf`, exceljs chỉ gọi v4 không buf. Không khai thác được. Chấp nhận.
- Migration: chỉ truy vấn dùng emailStatus là email.js:39-48 (updateMany + UPDATE...SKIP LOCKED, lọc PENDING/SENDING, ORDER BY createdAt), được index một phần phủ. Không nơi nào khác dựa index cũ. CHECK khớp 5 giá trị code ghi; nếu dữ liệu lạ thì migration fail trong transaction, không hỏng dữ liệu. Index một phần đã có tiền lệ (topic_one_leader...) nên drift Prisma cùng kiểu với các index đó.
- Test m1: tất định (khóa giữ bằng promise, không sleep; thiếu SKIP LOCKED thì treo -> fail). Chạy lại `npx vitest run tests/DC20-ops.test.js`: 3/3 pass.

Phát hiện
- MINOR (apps/api/src/server.js:45): cổng 587 với SMTP_SECURE=false, nodemailer STARTTLS chỉ cơ hội, máy chủ không quảng bá STARTTLS thì gửi rõ cả SMTP_PASS. Đề xuất `requireTLS: !secure` (việc sau; hướng dẫn VAN_HANH §6.6 bước 3 nên dặn chọn nhà cung cấp có STARTTLS).
- MINOR (render.yaml:34-54): biến đặt `sync: false` nhưng chưa nhập thì Blueprint hỏi lúc tạo; với service đã có phải tự thêm trên dashboard (đã ghi trong VAN_HANH). Không cần sửa.

Không chạy: `prisma migrate diff` với shadow DB (báo cáo có `migrate status` sạch).
Kết luận: APPROVED, không BLOCKER/MAJOR.
