# TASK-DC-04 – Email thông báo (hộp thư đi trên Notification)
- Agent: backend-dev · Trạng thái: REVIEW · Ngày: 2026-11-18
- FR/NFR: FR29, FR13 · Đã đọc: DAC_TA mục 9 FR29, FR13; `design/API_GD7.md` §2.1, §9, §12, "Vòng sửa 1" (B1, m6a–d); `reviews/TASK-DC-00-bao-mat-v1.md`, `-v2.md`; module `notifications`, `config/env.js`, `server.js`; báo cáo TASK-DC-03.

## Đã làm
- `nodemailer` **10.6.0** ghim chính xác ở `@nckh/api`. `npm audit --omit=dev`: 0 lỗ hổng.
- Migration `20261118000200_dc_email_outbox`: `Notification` thêm `emailStatus TEXT`, `emailAttempts INT DEFAULT 0`, `emailClaimedAt`, `emailedAt` (timestamptz), index `(emailStatus, createdAt)`. `Notification` đã bật RLS từ `search_and_security`, nên không cần policy mới (T203 vẫn xanh).
- `config/env.js`: các biến tùy chọn `SMTP_HOST`, `SMTP_PORT` (1–65535), `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (cấm CR/LF), `SMTP_SECURE` (stringbool). Chuỗi rỗng được coi là thiếu. `missingSmtpEnv(env)` chỉ trả **tên** biến thiếu, trong đó có `PUBLIC_APP_URL`.
- `notify.js`: thêm `setEmailOutbox(on)` (cờ của module). Khi bật, mọi dòng do `notify`/`notifyTopic` tạo có `emailStatus='PENDING'`; khi tắt thì `null`. Đây là đường duy nhất tạo Notification (đã grep `notification.create*`).
- `notifications/email.js` (mới):
  - `mailSubject`: thay `\u0000-\u001f`, `\u007f` bằng khoảng trắng, thêm tiền tố, cắt ≤ 200 ký tự.
  - `mailLink`: link null, không bắt đầu bằng `/` hoặc bắt đầu bằng `//` thì dùng `/thong-bao`.
  - `buildMail`: chỉ có title và link; text + HTML (escape `& < > " '`), không CC/BCC.
  - `dispatchEmails({ prisma, transport, from, appUrl, logger, limit=50 })`:
    - (0) dòng `SENDING` treo > 15 phút đã thử ≥ 3 lần thì chuyển `FAILED`;
    - (1) nhận việc bằng một câu `UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED LIMIT) RETURNING`, mỗi câu là một transaction ngắn;
    - (2) gửi ngoài transaction: tài khoản khóa/không có email thì `SKIPPED`; gửi được thì `SENT` + `emailedAt`; lỗi thì về `PENDING` nếu còn lượt, hết lượt thì `FAILED`;
    - `logger.warn` chỉ ghi `notificationId`, `attempt`, `errCode`, không ghi địa chỉ, nội dung hay thông điệp lỗi.
- `server.js`: thiếu biến thì `logger.info({ missing })` một lần. Đủ biến thì tạo `nodemailer.createTransport` (`secure = SMTP_SECURE ?? port===465`), bật outbox, chạy `setInterval(dispatchEmails, 60s)` có `.catch` ghi log. Interval không đặt trong `app.js` nên test không gửi ngầm.
- `apps/api/.env.example`: thêm 6 dòng chú thích SMTP, không có giá trị thật. Không đụng `.env`.

## File thay đổi
| File | Thay đổi |
|---|---|
| `apps/api/package.json`, `package-lock.json` | `nodemailer` 10.6.0 |
| `apps/api/prisma/schema.prisma` | 4 cột + index trên `Notification` |
| `apps/api/prisma/migrations/20261118000200_dc_email_outbox/migration.sql` | mới |
| `apps/api/src/config/env.js` | biến SMTP, `SMTP_ENV_KEYS`, `missingSmtpEnv` |
| `apps/api/src/modules/notifications/notify.js` | `setEmailOutbox`, `emailStatus` khi tạo |
| `apps/api/src/modules/notifications/email.js` | mới |
| `apps/api/src/server.js` | transport + interval khi bật; log tên biến thiếu |
| `apps/api/.env.example` | biến SMTP (chú thích) |
| `apps/api/tests/DC04-email.test.js` | mới, 12 ca (Postgres test + transport giả) |
| `docs/agents/BANG_CONG_VIEC.md` | DC-04 → REVIEW |

## Quyết định thiết kế
- Bật/tắt outbox bằng cờ module (`setEmailOutbox`) thay vì truyền tham số qua ~10 repo đang gọi `notifyTopic`. Cách này có diff nhỏ nhất, và mặc định là tắt, nên test cũ và `app.js` không bị ảnh hưởng.
- Nhận việc bằng một câu UPDATE có subquery `FOR UPDATE SKIP LOCKED` thay vì `$transaction` nhiều bước, vì câu lệnh đơn tự là một transaction ngắn.
- "Khóa tài khoản" hiểu là `isLocked`. Khóa tạm do đăng nhập sai (`lockedUntil`) vẫn được gửi thư, vì người đó vẫn là chủ tài khoản.
- `SMTP_FROM` cấm CR/LF ở Zod (phòng thủ thêm, dù là cấu hình của người vận hành).

## Điều kiện đạt ↔ test (`tests/DC04-email.test.js`)
| Điều kiện (FR29, GD7 §9.4) | Test | Kết quả |
|---|---|---|
| Thiếu biến thì tắt; chỉ trả tên biến; rỗng = thiếu; cổng/`SMTP_FROM` sai bị từ chối | "thiếu một biến…" | Đạt |
| Tắt: `emailStatus` null, không gọi transport | "tắt: …" | Đạt |
| Bật: request nghiệp vụ 200 → PENDING → SENT đúng 1 lần, đúng người nhận, không CC/BCC, chỉ title + link | "bật: …" | Đạt |
| Lỗi 3 lần → FAILED, không thử lần 4; log không chứa địa chỉ/nội dung | "transport lỗi 3 lần…" | Đạt |
| Lỗi 2 lần rồi thành công → SENT | "lỗi 2 lần…" | Đạt |
| SMTP hỏng thì request nghiệp vụ vẫn 2xx | "request nghiệp vụ vẫn 2xx…" | Đạt |
| Tài khoản khóa → SKIPPED | "tài khoản bị khóa…" | Đạt |
| `SENDING` treo, attempts=3 → FAILED; còn lượt → nhận lại (ít nhất một lần); `SENDING` mới không bị lấy | "SENDING treo…" | Đạt |
| Ba bộ gửi song song, 36 thư → mỗi thư đúng 1 lần | "hai bộ gửi chạy song song…" | Đạt |
| Header injection `\r\nBcc: x@evil.com` trong tên đề tài → subject một dòng, thư MIME thật (streamTransport) không có `Bcc:`/`X-Evil:` | "header injection…" | Đạt |
| `link=null`, `//evil`, URL tuyệt đối → `/thong-bao`; escape `<script>`; UTF-8 | "chỉ title + link…", "header injection…" | Đạt |

Kiểm đột biến thủ công: bỏ `FOR UPDATE SKIP LOCKED` thì test song song đỏ 3/3 lần khi chạy riêng (`-t "song song"`). Đã khôi phục từ bản sao bằng `cp`, không dùng git.

## Bằng chứng chạy lệnh
```
$ npm install nodemailer@10.6.0 --save-exact -w @nckh/api
$ npm ls nodemailer
└─┬ @nckh/api@0.1.0 -> .\apps\api
  └── nodemailer@10.6.0
$ npm audit --omit=dev
found 0 vulnerabilities

$ npm run db:test:reset
Đã reset DB test (migrate reset).
$ npx -w @nckh/api prisma generate
EPERM: operation not permitted, rename '...query_engine-windows.dll.node.tmp…'   (DLL đang bị tiến trình khác giữ; client JS đã sinh lại có cột email*, test chạy đúng)

$ npx vitest run tests/DC04-email.test.js   (apps/api)
 Test Files  1 passed (1)
      Tests  12 passed (12)

$ npm run lint
> lint
> eslint . --max-warnings 0
(exit 0)

$ npm test   (exit=0)
 Test Files  7 passed (7)
      Tests  91 passed (91)        [shared]
 Test Files  77 passed (77)
      Tests  1051 passed (1051)    [api]
 Test Files  32 passed (32)
      Tests  245 passed (245)      [web]
```

## Còn lại / rủi ro
- Chưa thử với máy chủ SMTP thật (theo quy tắc). Tài khoản SMTP do con người tạo; DC-20 bổ sung `render.yaml`/`VAN_HANH.md`.
- Bảo đảm là "ít nhất một lần" (m6d): nếu tiến trình sập giữa lúc gửi xong và lúc đánh dấu SENT thì thư có thể được gửi lần hai sau 15 phút.
- Gửi tuần tự tối đa 50 thư/phút/tiến trình. Nếu một lượt chạy quá 60 s, interval chồng lượt, nhưng vẫn an toàn nhờ SKIP LOCKED.
- Thông báo tạo trước khi bật SMTP có `emailStatus=null`, không được gửi bù (đúng thiết kế).
- `prisma generate` báo EPERM vì engine DLL đang bị giữ (có thể do dev server). Cần chạy lại khi không có tiến trình nào giữ DLL.

## Câu hỏi cho reviewer
- Dùng cờ module `setEmailOutbox` (trạng thái toàn cục của tiến trình) có chấp nhận được không, hay cần tiêm qua repo?
- Khóa tạm (`lockedUntil`) có cần cũng `SKIPPED` không?

## Sau review bao-mat v1 (điều phối viên, 2026-11-18)
- **m2 đã sửa:** transport nodemailer trong `apps/api/src/server.js` có `connectionTimeout` 10 s, `greetingTimeout` 10 s, `socketTimeout` 30 s (dưới ngưỡng SENDING treo 15 phút). Cấu hình khởi động, không có test riêng; `npm run lint` sạch, `node --check` đạt.
- **m1** (test tất định giữ khóa một dòng rồi gọi bộ gửi) và **m3** (CHECK `emailStatus`, index một phần): ghi lại, chưa làm; đưa vào DC-20 (vận hành) để làm cùng.
