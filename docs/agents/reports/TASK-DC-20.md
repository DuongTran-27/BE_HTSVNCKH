# TASK-DC-20 – Vận hành: Google SSO, SMTP, PUBLIC_APP_URL + MINOR DC-04/DC-07

Trạng thái: DONE (bao-mat v1 APPROVED) · FR28, FR29, NFR08, NFR10

## Đã làm
1. `docs/VAN_HANH.md`: thêm vào bảng §6.1 `PUBLIC_APP_URL`, `GOOGLE_CLIENT_ID/SECRET`, `GOOGLE_ALLOWED_DOMAINS` (danh sách, cách nhau dấu phẩy), `SMTP_*`; thêm §6.5 (con người tạo OAuth client: màn đồng ý **Internal**, redirect URI `https://<domain web>/api/auth/google/callback`) và §6.6 (tạo tài khoản SMTP, SPF/DKIM/DMARC, cổng 465/587, cách xác nhận). Tên biến lấy từ `GOOGLE_ENV_KEYS`, `SMTP_ENV_KEYS`, `SMTP_SECURE` trong `apps/api/src/config/env.js`.
2. `render.yaml`: 10 biến mới, tất cả `sync: false` (không giá trị).
3. `apps/api/.env.example`: các biến đã có từ DC-03/04 (đều để chú thích, không giá trị thật); bổ sung chú thích `PUBLIC_APP_URL` (https ở production, nếu không API không khởi động) và `SMTP_SECURE` cho cổng 587. `apps/web/.env.example` không đổi (web không có biến mới).
4. **CSP `apps/web/vercel.json` không cần đổi** (lý do ghi ở VAN_HANH §6.5): nút Google là `<a href="/api/auth/google/start">` (điều hướng cấp trên cùng, cùng nguồn; LoginPage.jsx dòng 100 đã ghi chú); API 302 sang Google rồi Google 302 về callback. Điều hướng không thuộc `connect-src/script-src/img-src`, `form-action` chỉ áp cho `<form>`; không tải tài nguyên Google nào. SMTP không đi qua trình duyệt. Chỉ khi chuyển sang script Google Identity Services mới phải sửa.
5. MINOR m1, m3 (DC-04), m2 (DC-07): xem dưới.

## Migration mới: `20261120000000_dc20_email_status_check`
- `CHECK ("emailStatus" IS NULL OR IN ('PENDING','SENDING','SENT','FAILED','SKIPPED'))` tên `Notification_emailStatus_check`.
- Index một phần `Notification_email_queue_idx ON ("createdAt") WHERE "emailStatus" IN ('PENDING','SENDING')`, thay index đầy đủ `Notification_emailStatus_createdAt_idx` (đã DROP; bỏ `@@index([emailStatus, createdAt])` khỏi `schema.prisma` vì Prisma không biểu diễn được index một phần, giống các index một phần khác). Tương thích ngược với code cũ (chỉ thêm ràng buộc trên giá trị mà code vốn chỉ ghi 5 giá trị + NULL).

## Test mới: `apps/api/tests/DC20-ops.test.js` (3 test)
- m1: một transaction giữ `FOR UPDATE` một dòng PENDING; `dispatchEmails` chạy trong lúc đó gửi đúng 1 thư (dòng tự do), dòng bị khóa vẫn PENDING; sau mở khóa gửi tiếp được. Thiếu SKIP LOCKED thì lệnh sẽ treo chờ khóa (không bao giờ xong vì khóa chỉ nhả sau khi dispatch trả về) nên test hết hạn.
- m3: giá trị lạ bị CHECK từ chối (`Notification_emailStatus_check`), NULL và 5 trạng thái được nhận; index một phần có `WHERE` đúng.
- m2: lấy đúng câu `UPDATE ... SET "source" = 'STAFF'` từ file migration `20261118000400_dc_council`, chạy (trong transaction, tắt/bật trigger như migration) trên bản do STAFF tạo (mặc định ADVISOR) và bản do GV tạo: STAFF → `STAFF`, GV giữ `ADVISOR`. Kết luận: backfill đúng.

## npm audit (3 gói thêm ở DC-03/04/11: `google-auth-library` 10.9.1, `nodemailer` 10.6.0, `exceljs` 4.4.0)
`npm audit --omit=dev`: 2 moderate, **cả hai là `uuid <11.1.1` (GHSA-w5hq-g745-h8pq) kéo theo `exceljs`**. Không có lỗ hổng ở `google-auth-library` và `nodemailer`. Đánh giá: lỗi chỉ xảy ra khi gọi uuid v3/v5/v6 với tham số `buf`; exceljs chỉ gọi `uuid.v4()` không `buf` (`cf-rule-ext-xform.js`), API không dùng uuid trực tiếp → không khai thác được. Cách "fix" duy nhất là hạ exceljs xuống 3.4.0 (breaking) nên không áp dụng. Toàn repo (kể cả dev) 5 moderate, phần còn lại là chuỗi minimatch của công cụ dev. Đề xuất cho kiến trúc sư: giữ exceljs 4.4.0, theo dõi bản exceljs mới.

## Bằng chứng
- `docker`: `npm run db:test:up` + `npm run db:test:reset` OK (áp 17 migration, gồm dc20).
- `npx prisma migrate status` (DB test `nckh_test` localhost:54329): `17 migrations found ... Database schema is up to date!` (lần đầu chạy nhầm sang DB dev không bật: `P1001`, chỉ đọc, không tác dụng).
- `npx vitest run tests/DC20-ops.test.js`: 3/3 pass.
- `npm test` (gốc): shared 115/115; api 86 file, 1222/1222; web 39 file, 383/383. Exit 0.
- `npm run lint`: `eslint . --max-warnings 0`, exit 0.
- Không chạy E2E (không đổi web); không đổi test cũ.

## Việc con người cần làm
Xem VAN_HANH §6.5 (OAuth client Google Internal + 4 biến Render), §6.6 (tài khoản SMTP + 5 biến Render), `PUBLIC_APP_URL` https. Trước deploy bản này: chạy workflow "Migrate" (migration dc20 + các migration DC trước).

## Giới hạn
- Không kiểm thử thật với Google/SMTP (cần tài khoản ngoài). YAML `render.yaml` chỉ thêm khối `envVars` cùng kiểu có sẵn; chưa có công cụ Render để kiểm Blueprint.


## Sau review (phiên chính)
bao-mat m1: `apps/api/src/server.js` thêm `requireTLS: !secure` cho transport nodemailer – khi không dùng TLS ngầm (cổng 587) bắt buộc STARTTLS, máy chủ không hỗ trợ thì lượt gửi lỗi (ghi `FAILED`/thử lại theo cơ chế có sẵn) thay vì gửi mật khẩu trần. Đây là cấu hình khởi động trong `server.js` (test không nạp file này, giống phần còn lại của khối SMTP); kiểm bằng `node --check` và lint. m2 (biến `sync: false` phải thêm tay trên Render) đã có trong VAN_HANH.
