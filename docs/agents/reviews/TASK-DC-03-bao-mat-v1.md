# Review TASK-DC-03 – bao-mat – vòng 1
Kết luận: APPROVED

Reviewer duy nhất (chế độ tiết kiệm quota). Không tin báo cáo: tự đọc `git diff` (15 file), file chưa theo dõi (`auth/ssoService.js`, `tests/DC03-sso.test.js`, `tests/DC03-sso-db.test.js`, `tests/sso-kit.js`), tự chạy lint/test/audit. Không đọc `.env`.

## Tôi đã tự kiểm tra
- `npm run lint` → `eslint . --max-warnings 0`, exit 0.
- `npm test` (DB test đang bật) → exit 0: shared `7 files / 91 passed`; api `75 files / 1038 passed` (gồm DC03 38 ca bộ nhớ + 4 ca Postgres); web `32 files / 245 passed` → 1374/1374, khớp báo cáo.
- `npm audit --omit=dev` → `found 0 vulnerabilities`. `google-auth-library` ghim chính xác `10.9.1` (dòng 10.x, đúng GD7 §12).
- `routes.js` sau sự cố `git checkout`: `git diff` so với HEAD **chỉ có dòng thêm** (import, 2 limiter, `oauthCookieOpts`, `ssoOn`, 3 route); `/login` (loginLimiter + `validate(loginSchema)`), `/refresh` (xóa cookie chỉ khi 401), `/logout`, `/change-password` (requireAuth + limiter theo user + validate), `/me`, `cookieOpts` của `nckh_rt` (httpOnly, Secure prod, Lax, `/api/auth`) giữ nguyên từng dòng. Test FR01 cũ (T1xx/T2xx) xanh.
- Đọc `node_modules/google-auth-library/.../oauth2client.js`: `verifyIdToken` mặc định kiểm `iss ∈ {accounts.google.com, https://accounts.google.com}`, chữ ký JWKS, `aud`, `exp` → đủ yêu cầu §8.2 khi truyền `audience: GOOGLE_CLIENT_ID` (test khẳng định `verifyArgs` đúng bằng `{ idToken, audience }`).
- Đọc `config/env.js` `loadEnv`: thông điệp lỗi chỉ gồm `path: message` của Zod, không chứa giá trị nhập → sai cấu hình Google không in bí mật; `server.js` chỉ log `{ missing: [tên] }`.

## Đối chiếu đặc tả (FR28, GD7 §8, Vòng sửa 1, n1)
| Điều kiện | Đạt? | Ghi chú |
|---|---|---|
| Tắt êm khi thiếu biến (§8.1) | Đạt | 4 biến tùy chọn, `''` = thiếu; `providers` false; `ssoOn` → 404 chuẩn trước limiter; mật khẩu không đổi (test) |
| PKCE S256, state/nonce/verifier 32 byte | Đạt | `randomBytes(32).base64url`; `code_challenge = sha256(verifier)` base64url, `code_challenge_method=S256`; verifier không có trên URL (test) |
| Cookie `nckh_oauth` | Đạt | JWT HS256, khóa `HMAC-SHA256(JWT_ACCESS_SECRET,'oauth-state')`, `expiresIn` 600 s; httpOnly, Secure (prod, có test), Lax, `path=/api/auth/google`, maxAge 10 phút; `algorithms: ['HS256']` (test alg none, sai khóa, hết hạn → STATE_MISMATCH); xóa ở mọi lần callback |
| Cookie trạng thái ≠ access token | Đạt | Khóa dẫn xuất khác; test dùng làm Bearer → 401, và ngược lại |
| `state`/`nonce` so hằng thời gian | Đạt | `timingSafeEqual` sau kiểm độ dài |
| Login CSRF | Đạt | `state` gắn với cookie httpOnly của chính trình duyệt khởi tạo; attacker gửi URL callback chứa `code/state` của mình → nạn nhân không có cookie khớp → STATE_MISMATCH. `start` là GET không đổi trạng thái phiên; `prompt=select_account` buộc người dùng chọn tài khoản |
| `email_verified === true` | Đạt | So sánh nghiêm ngặt; chuỗi `"true"` bị từ chối (test) |
| `hd` ∈ danh sách và = đuôi email | Đạt | Email hạ chữ thường, lấy sau `@` cuối; `x@evil.vanlanguni.vn.attacker.com`, `@gmail.com`, `hd` khác, tên miền con → DOMAIN_NOT_ALLOWED. `hd` so phân biệt hoa thường với danh sách đã hạ chữ thường – fail-closed, Google trả `hd` chữ thường |
| Chỉ tài khoản có sẵn, trùng email bẩn | Đạt | `findMany` insensitive `take: 2`; 0 hoặc >1 → NO_ACCOUNT, >1 log `error` không kèm email |
| ADMIN → PASSWORD_ONLY | Đạt | Trước kiểm khóa; trong tx `blocked()` cũng chặn nếu vai trò đổi thành ADMIN |
| Khóa / tạm khóa / mustChangePassword | Đạt | `isLocked`, `lockedUntil > now` → ACCOUNT_LOCKED; tạm khóa hết hạn vào được; `mustChangePassword` không đổi → `requirePasswordChanged` vẫn chặn nghiệp vụ |
| Cấp phiên trong tx có khóa User + AuditLog (m1) | Đạt | `repo.transaction` → `lockUser(id, true)` (SHARE) → đọc lại → `issueTokens(r, …)` → `r.recordAudit(LOGIN_SSO, after {provider}, ip)` cùng tx. Test Postgres 6 vòng `setLocked` song song: không còn refresh token sống |
| `issueTokens` tách ra không đổi FR01 | Đạt | Thân hàm giữ nguyên; `family = randomUUID()` vẫn tính mỗi lần gọi; login/refresh truyền đúng `r`(tx), `env`, `now`, `family`, `userAgent`. Toàn bộ test auth cũ xanh |
| Open redirect | Đạt | Đích luôn `PUBLIC_APP_URL` + đường cố định; `next` qua `safeNext` (≤512, `/`, không `//`, không `\`, kiểu chuỗi – mảng bị bỏ) và `encodeURIComponent`. FE phải kiểm lại `next` (DC-12, UI §1.2) |
| Không token trên URL | Đạt | Chỉ cookie `nckh_rt`; FE gọi `/refresh` |
| Limiter (M1, n1) | Đạt | `start` 300/15'/IP; `callback` 20/15'/IP, `skipSuccessfulRequests` + `requestWasSuccessful: res.locals.ssoOk === true` (đặt trước `redirect`, express-rate-limit đánh giá lúc `finish`). Test: lần 21 → 429 `RATE_LIMITED`, IP khác không ảnh hưởng; 25 lần thành công không 429. IP qua `trust proxy 1` như mọi limiter khác |
| Query schema (m2) | Đạt | `ssoCallbackQuerySchema` 3 khóa, giới hạn độ dài; lặp khóa (mảng) → STATE_MISMATCH; `error` → CANCELLED |
| Không lộ thông điệp Google | Đạt | Chỉ log `errName`; người dùng nhận mã cố định |
| Log thất bại không có email đầy đủ | Đạt | Chỉ `ssoError` + `emailDomain` |
| `.env.example` | Đạt | 4 biến ở dạng chú thích, giá trị giữ chỗ (`<client-id>`, `<client-secret>`); tên miền ví dụ là công khai. Test dùng `'sec'` giả |
| CSP web không đổi | Đạt | Không tải script Google phía trình duyệt |

## Trả lời câu hỏi / lệch nhỏ agent nêu
- **`verifyIdToken` lỗi → GOOGLE_ERROR:** chấp nhận. ID token nhận trực tiếp từ token endpoint của Google qua TLS bằng client secret, không do trình duyệt cung cấp; lỗi kiểm ở đây là lỗi JWKS/cấu hình, không phải dấu hiệu giả mạo phiên. Cả hai mã đều từ chối; `nonce` sai vẫn ra STATE_MISMATCH đúng thiết kế.
- **Thiếu `code` khi không có `error` → STATE_MISMATCH:** chấp nhận (từ chối, không lộ gì).
- **Từ chối tên miền con:** đúng chữ "bằng đúng" của §8.2 và an toàn hơn. Nếu trường dùng `st.vanlanguni.vn` riêng thì thêm vào `GOOGLE_ALLOWED_DOMAINS` (danh sách) – không cần sửa code.
- **Lỗi DB trong callback trả JSON 500/409 thay vì 302:** chấp nhận về bảo mật (errorHandler không lộ stack, lần đó bị đếm thất bại, không cấp phiên vì tx rollback). Là vấn đề trải nghiệm → m2.
- **Log `req.url` callback chứa `code`/`state`:** rủi ro thấp (code dùng một lần, cần `codeVerifier` trong cookie httpOnly do PKCE, sống vài phút) nhưng nên lọc → m1.
- **Limiter in-memory:** cùng shortcut đã chấp nhận cho mọi limiter (`rateLimit.js` có chú thích `shortcut:`); Render 1 instance. Không chặn.

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| m1 | MINOR | `apps/api/src/app.js:36` (pino-http) | Log production ghi `req.url` của `/api/auth/google/callback` gồm `code` và `state`. PKCE làm `code` vô dụng nếu thiếu verifier, nhưng log không nên chứa thông tin xác thực (nguyên tắc như redact header) | Thêm serializer `req` cắt query khi `url` bắt đầu `/api/auth/google/callback` (hoặc thay bằng `[REDACTED]`) + 1 test log; làm ở DC-20 hoặc task kế tiếp chạm logger |
| m2 | MINOR | `apps/api/src/modules/auth/routes.js` (callback); `middlewares/rateLimit.js:19` | Callback là điều hướng trình duyệt nhưng 429 của limiter và lỗi hạ tầng (500/409) trả JSON → người dùng thấy trang JSON thô thay vì `/dang-nhap?sso_error=` | Ở callback, bọc handler/handler 429 để 302 về `/dang-nhap?sso_error=GOOGLE_ERROR` (hoặc mã mới `RATE_LIMITED` có nhãn ở `SSO_ERROR_LABEL`); làm cùng DC-12 |
| m3 | MINOR | `apps/api/src/modules/auth/routes.js` (`/google/start`) | `next` của `start` kiểm bằng `safeNext` thủ công, không qua Zod như quy ước "Zod cho mọi query"; OpenAPI khai `z.string().max(512)`. Hành vi đúng và chặt (kiểu, độ dài, dạng) nên không khai thác được | Có thể chuyển `safeNext` thành schema dùng chung ở `packages/shared` để FE (DC-12) dùng cùng quy tắc kiểm `next` |

Ghi chú ngoài phạm vi: thư mục chưa theo dõi `.playwright-mcp/` ở gốc repo không thuộc task này – không đưa vào commit DC-03.

Tổng vòng 1: 0 BLOCKER, 0 MAJOR, 3 MINOR (không chặn DONE).
