# Review TASK-DC-04 – bao-mat – vòng 1
Kết luận: APPROVED

Reviewer duy nhất (chế độ tiết kiệm quota). Không dựa vào báo cáo: tự đọc `git diff` (`.env.example`, `package.json`, `schema.prisma`, `config/env.js`, `notify.js`, `server.js`, `BANG_CONG_VIEC.md`) và các file chưa theo dõi (`notifications/email.js`, migration `20261118000200_dc_email_outbox`, `tests/DC04-email.test.js`), rồi tự chạy lint, test và audit. Không đọc `.env`.

## Tôi đã tự kiểm tra
- `npm run lint` → `eslint . --max-warnings 0`, không lỗi.
- `npm test` (DB test đang bật, chạy tuần tự) → exit 0: shared `7 files / 91 passed`; api `77 files / 1051 passed`; web `32 files / 245 passed`. Tổng 1387/1387, khớp báo cáo.
- `npm audit --omit=dev` → `found 0 vulnerabilities`. `node_modules/nodemailer/package.json` có `"version": "10.6.0"`, `package.json` ghim chính xác `"10.6.0"` (đúng GD7 §12, B1).
- Thử tấn công bằng test tạm `apps/api/tests/security/DC04-probe.test.js` (đã xóa vì không tìm ra lỗi). Kết quả 2/2 đạt:
  1. Subject chứa `\u0085Bcc: x@evil.com X-Evil: 1` (ký tự C1/U+2028 không bị lọc). Dựng thư MIME thật bằng `streamTransport` thì không có header `Bcc:`/`X-Evil:`, vì nodemailer mã hóa subject không phải ASCII thành encoded-word. Link `/\evil.com` cho ra `https://app.vn/\evil.com`, host vẫn là app nên không chuyển hướng ra ngoài.
  2. Một transaction giữ `SELECT … FOR UPDATE` trên một dòng PENDING, rồi gọi `dispatchEmails` ngay trong lúc đó. Bộ gửi trả về ngay, gửi đúng dòng còn lại và bỏ qua dòng đang bị khóa. Như vậy SKIP LOCKED hoạt động và có thể kiểm một cách tất định.
- Đường tạo Notification: grep `notification.create|upsert|INSERT INTO "Notification"` trong `src`, `prisma`, `scripts` chỉ ra `notify.js`. Không có script nào ngoài `server.js` gọi `notify` trong một tiến trình khác.
- `GET /api/notifications` (`notifications/prismaRepo.js:11`) dùng `select` cố định, không trả các cột `email*`.
- Người nhận: `User.email` qua `emailSchema` (trim, lowercase, `z.email`, ≤254). `profileUpdateSchema` là `strictObject` chỉ gồm `phone`, nên người dùng không tự đổi được email để hứng thư của người khác.
- `loadEnv` khi lỗi chỉ in `path: message` của Zod, không in giá trị. `server.js` chỉ log `{ missing: [tên] }`. Lỗi gửi chỉ log `notificationId/attempt/errCode`, lỗi vòng gửi chỉ log `errName`. Nodemailer mặc định `logger: false`, nên `SMTP_PASS` không xuất hiện trong log trên mọi nhánh.
- RLS: `search_and_security` bật RLS bằng vòng lặp trên mọi bảng `public`, nên `Notification` đã có RLS. Thêm cột không cần policy mới.

## Đối chiếu đặc tả (FR29, GD7 §9, §12, Vòng sửa 1 B1/m6)
| Điều kiện | Đạt? | Ghi chú |
|---|---|---|
| Tắt êm khi thiếu biến (§9.1) | Đạt | 6 biến; `''` được coi là thiếu; `logger.info` một lần, chỉ ghi tên biến; `SMTP_SECURE ?? port===465` |
| `notify` đặt `emailStatus`, không gửi trong transaction | Đạt | `PENDING`/`null` đặt trong cùng `createMany` của transaction nghiệp vụ; việc gửi chỉ chạy trong `setInterval` ở `server.js` |
| Lỗi SMTP không làm hỏng API | Đạt | Không có đường gọi nào từ request tới transport. Test: request 200, sau đó FAILED |
| Nhận việc FOR UPDATE SKIP LOCKED, 3 lần thử | Đạt | Một câu `UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED LIMIT)`, `emailAttempts < 3`; tham số đi qua `$queryRaw` tagged template, không ghép chuỗi |
| SENDING treo → FAILED (m6c) | Đạt | Bước 0 xử lý `claimedAt < now-15'` khi `attempts >= 3`. Dòng còn lượt được nhận lại. Có test |
| "Ít nhất một lần" (m6d) | Đạt | Ghi rõ trong code và báo cáo (xem m2 về khả năng gửi trùng khi SMTP chậm) |
| Người nhận đúng, không CC/BCC | Đạt | `to` là email của `notification.userId`; `buildMail` trả đúng 5 khóa (test `toEqual`) |
| Chỉ title + link (§9.3) | Đạt | Không thêm dữ liệu. Title vốn chỉ hiện cho chính người nhận (FR13). Tài khoản `isLocked` được kiểm lại lúc gửi → SKIPPED |
| CRLF/header injection subject (m6a) | Đạt | Lọc `\u0000-\u001f\u007f` và cắt ≤200 ký tự. `SMTP_FROM` bị Zod cấm CR/LF. `to` đến từ email đã qua Zod. Nodemailer 10.6.0 đã vá GHSA-268h-hp4c-crq3. Thêm probe C1/U+2028 |
| Escape HTML | Đạt | Escape `& < > " '` cho cả title và `href` |
| Link null / `//` / tuyệt đối (m6b) | Đạt | Chỉ nhận link bắt đầu `/` và không bắt đầu `//`, luôn đặt sau `PUBLIC_APP_URL` (Zod: http/https, không có `/` ở cuối), nên host luôn cố định. Không thành open redirect hay link lừa đảo |
| Migration | Đạt | 4 cột cộng thêm, có DEFAULT, không khóa bảng lâu; index `(emailStatus, createdAt)` |
| `.env.example` | Đạt | Chỉ có giá trị giữ chỗ dạng chú thích |

## Đánh giá test song song
`hai bộ gửi chạy song song` (3 drain × `limit 4` × 36 thư, transport chậm 3 ms) **đủ chặt ở chiều khẳng định**: nếu có lấy trùng thì `emailAttempts` lên 2 hoặc `Set` nhỏ hơn 36, và test chắc chắn đỏ. Không thể xanh giả khi đã gửi trùng, cũng không đỏ giả. Điểm yếu nằm ở chiều bắt đột biến: việc chồng lấn phụ thuộc lịch chạy và pool kết nối, nên bỏ SKIP LOCKED chỉ *thường* làm test đỏ. Có thể bổ sung một test tất định (m1), không chặn.

## Trả lời câu hỏi agent
- **Cờ toàn tiến trình `setEmailOutbox`:** chấp nhận. Mặc định là tắt (fail-safe: không gửi). Chỉ `server.js` bật, cùng lúc với việc khởi động bộ gửi, nên không xảy ra cảnh "PENDING mà không có ai gửi" trong cùng tiến trình. Mỗi file test vitest chạy trong worker riêng (`isolate` mặc định) và `afterEach` đặt lại `false`, nên cờ không rò sang file khác. Tiêm qua ~10 repo sẽ tạo diff lớn mà không thêm bảo đảm an ninh nào. Ghi chú cho sau này: nếu tách tiến trình worker hoặc chạy script gọi `notify` ngoài `server.js`, cần bật cờ tương ứng.
- **Khóa tạm (`lockedUntil`) vẫn nhận email:** đồng ý, **không nên** SKIPPED. Kẻ tấn công chỉ cần nhập sai mật khẩu vài lần là gây ra khóa tạm. Nếu khóa tạm làm dừng email, kẻ tấn công có thể chặn thông báo của nạn nhân đúng lúc có sự kiện quan trọng (hạn nộp, kết quả). Thư lại đi tới hộp mail của chủ tài khoản thật. Chỉ `isLocked` (quyết định của quản trị, FR) mới là căn cứ để chặn, đúng §9.2.

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| m1 | MINOR | `apps/api/tests/DC04-email.test.js` (test song song) | Test bắt đột biến "bỏ SKIP LOCKED" theo xác suất, phụ thuộc lịch chạy | Thêm một ca tất định: trong `prisma.$transaction` giữ `SELECT id … FOR UPDATE` trên dòng A, gọi `dispatchEmails` và khẳng định nó trả về ngay, chỉ gửi dòng B (nếu thiếu SKIP LOCKED thì bị chặn tới timeout, test đỏ). Reviewer đã chạy thử bản này: xanh, 0,4 s |
| m2 | MINOR | `apps/api/src/server.js` (`createTransport`); `email.js` (update sau gửi) | Không đặt timeout SMTP. Mặc định của nodemailer là connection 2', greeting 30", socket 10'. Một máy chủ mail treo có thể kéo một lượt (50 thư tuần tự) quá 15 phút. Khi đó lượt sau nhận lại các dòng SENDING vẫn đang gửi, gây gửi trùng và tốn lượt thử; ngoài ra lượt cũ có thể ghi đè `PENDING`/`SENT` lên dòng đã được nhận lại (update chỉ theo `id`) | Đặt `connectionTimeout`/`greetingTimeout`/`socketTimeout` khoảng 10–30 s. Tùy chọn: update kết quả kèm điều kiện `emailStatus='SENDING' AND emailClaimedAt = <claimedAt của lượt này>`. Làm ở DC-20 cùng với cấu hình SMTP |
| m3 | MINOR | `migration.sql` | `emailStatus TEXT` không có CHECK nên giá trị gõ sai không bị chặn ở DB. Index `(emailStatus, createdAt)` phủ cả các dòng SENT/null (phần lớn bảng) | `CHECK ("emailStatus" IN ('PENDING','SENDING','SENT','FAILED','SKIPPED'))` và index một phần `WHERE "emailStatus" IN ('PENDING','SENDING')`. Làm khi có migration tiếp theo chạm `Notification` |

Ghi chú ngoài phạm vi: `prisma generate` báo EPERM (DLL bị giữ) nhưng test chạy với client đã có cột `email*`. Nên chạy lại `prisma generate` trước khi commit hoặc build. Thư mục chưa theo dõi `.playwright-mcp/` không thuộc task này, không đưa vào commit DC-04.

Tổng vòng 1: 0 BLOCKER, 0 MAJOR, 3 MINOR (không chặn DONE).
