# TASK-DC-03 – Đăng nhập Google (SSO)
- Agent: backend-dev · Trạng thái: REVIEW · Ngày: 2026-11-18
- FR/NFR: FR28, NFR01 · Đã đọc: DAC_TA mục 9 FR28, `design/API_GD7.md` §8, §11, §12, "Vòng sửa 1" (M1, m1–m5), `reviews/TASK-DC-00-bao-mat-v1.md`, `-v2.md` (n1), báo cáo TASK-DC-01, TASK-DC-02, module auth hiện có.

## Đã làm
- `google-auth-library` **10.9.1** (ghim chính xác, workspace `@nckh/api`; bản 10.x mới nhất lúc cài). `npm audit --omit=dev`: 0 lỗ hổng.
- `config/env.js`: 4 biến tùy chọn `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_ALLOWED_DOMAINS` (danh sách, chữ thường, regex tên miền), `PUBLIC_APP_URL` (`url()` http/https, không `/` cuối, production bắt buộc `https`); chuỗi rỗng = thiếu. `missingGoogleEnv(env)` trả **tên** biến thiếu; `server.js` `logger.warn({ missing })` và chỉ tạo `OAuth2Client` khi đủ.
- `auth/service.js`: tách `issueTokens(r, user, { env, now, family, userAgent })` thành export dùng chung (đăng nhập mật khẩu, refresh, SSO) – không có bản thứ hai.
- `auth/ssoService.js` (mới): `start` (state/nonce/codeVerifier 32 byte base64url, PKCE S256, cookie `nckh_oauth` = JWT HS256 khóa `HMAC-SHA256(JWT_ACCESS_SECRET,'oauth-state')`, 10 phút, `hd` khi đúng 1 tên miền, `prompt=select_account`, `next` ≤ 512 kiểm dạng); `callback` theo đúng thứ tự §8.2, cấp phiên trong `repo.transaction` có `lockUser(SHARE)` + đọc lại `isLocked/lockedUntil/role`, AuditLog `LOGIN_SSO` cùng transaction.
- `auth/routes.js`: `GET /providers`, `GET /google/start` (limiter mức phiên 300/15 phút/IP), `GET /google/callback` (20/15 phút/IP, `skipSuccessfulRequests` + `requestWasSuccessful: res.locals.ssoOk === true`). SSO tắt → 404 chuẩn trước limiter.
- `middlewares/rateLimit.js`: `createLimiter` nhận `requestWasSuccessful` tùy chọn (MINOR n1).
- `packages/shared`: `SSO_ERROR_LABEL` (8 mã, thông điệp theo UI §12.4), `ssoCallbackQuerySchema` (`code` ≤ 2048, `state` ≤ 128, `error` ≤ 64, khóa khác bị bỏ).
- OpenAPI thêm 3 route; `apps/api/.env.example` thêm 4 biến (chú thích, không giá trị thật). Không đụng `.env`.

## File thay đổi
| File | Thay đổi |
|---|---|
| `apps/api/package.json`, `package-lock.json` | `google-auth-library` 10.9.1 |
| `apps/api/src/config/env.js` | 4 biến Google, `GOOGLE_ENV_KEYS`, `missingGoogleEnv` |
| `apps/api/src/server.js` | warn tên biến thiếu; tạo `OAuth2Client` khi bật |
| `apps/api/src/app.js` | nhận `google`, tạo `ssoService`, truyền vào `authRouter` |
| `apps/api/src/middlewares/rateLimit.js` | tham số `requestWasSuccessful` |
| `apps/api/src/modules/auth/service.js` | export `issueTokens` dùng chung |
| `apps/api/src/modules/auth/ssoService.js` | mới |
| `apps/api/src/modules/auth/routes.js` | 3 route SSO + 2 limiter + cookie `nckh_oauth` |
| `apps/api/src/modules/auth/prismaRepo.js` | `findUsersByEmailInsensitive` (take 2), `recordAudit` |
| `apps/api/src/openapi/spec.js` | 3 route |
| `apps/api/.env.example` | 4 biến Google (chú thích) |
| `packages/shared/src/labels.js`, `schemas.js` | `SSO_ERROR_LABEL`, `ssoCallbackQuerySchema` |
| `apps/api/tests/helpers.js` | repo bộ nhớ thêm `findUsersByEmailInsensitive`, `recordAudit` (chỉ thêm) |
| `apps/api/tests/sso-kit.js` | mới: `ssoEnv`, `fakeGoogle()`, `runSso()` |
| `apps/api/tests/DC03-sso.test.js` | mới, 38 ca (bộ nhớ) |
| `apps/api/tests/DC03-sso-db.test.js` | mới, 4 ca (Postgres) |
| `docs/agents/BANG_CONG_VIEC.md` | DC-03 → REVIEW |

## Quyết định thiết kế
- Route SSO luôn mount; tắt thì middleware `ssoOn` trả 404 chuẩn (đặt trước limiter để không lộ header `RateLimit`). Giữ test T701 (route ↔ OpenAPI) xanh mà không cần nhánh mount có điều kiện.
- `verifyIdToken` ném lỗi, `getToken` lỗi, hoặc thiếu `id_token` → `GOOGLE_ERROR` (log `warn` chỉ `errName`, không log thông điệp Google). Thiết kế chỉ nêu `GOOGLE_ERROR` cho `getToken`; tôi gộp lỗi kiểm ID token vào cùng mã vì phần lớn là lỗi tải JWKS và đằng nào cũng từ chối.
- Thiếu `code` khi không có `error` → `STATE_MISMATCH` (thiết kế không nêu).
- `hd` phải thuộc danh sách **và** bằng đúng phần sau `@` cuối của email (chữ thường). Tên miền con (`x@st.vanlanguni.vn`) bị từ chối, theo đúng chữ "bằng đúng".
- Lỗi hạ tầng không lường trước trong callback (DB sập, `lock_timeout`) rơi xuống `errorHandler` (JSON 500/409), không chuyển thành `sso_error`; được tính là lần thất bại cho limiter.
- `redirect_uri` = `${PUBLIC_APP_URL}/api/auth/google/callback`; đi qua rewrite `/api` của Vercel (production) / proxy Vite (dev), nên cookie `nckh_oauth` và `nckh_rt` cùng origin với trang.

## Điều kiện đạt ↔ test
| Điều kiện (FR28, GD7 §8.4) | Test | Kết quả |
|---|---|---|
| Thiếu biến → providers false, start/callback 404, mật khẩu không đổi | DC03 "thiếu biến…" | Đạt |
| Cấu hình: danh sách tên miền, rỗng = thiếu, URL `/` cuối/scheme lạ/http ở production bị từ chối | DC03 "missingGoogleEnv…" | Đạt |
| PKCE S256, state, nonce, redirect_uri, hd, cookie httpOnly/Lax/path/Secure, exp 10 phút | DC03 start (2 ca) | Đạt |
| `next` 5.000 ký tự bị bỏ, cookie < 4 KB; `//evil.com`, `\`, URL tuyệt đối bị bỏ | DC03 "next dài…" | Đạt |
| Thành công: `nckh_rt`, URL không chứa token, refresh trả user đúng, AuditLog `LOGIN_SSO` | DC03 "cookie nckh_rt…"; DB "thành công…" (ip lưu) | Đạt |
| Email khác hoa thường vẫn khớp; `mustChangePassword` giữ | DC03; DB "thành công" | Đạt |
| `next=//evil.com` không làm server chuyển hướng ra ngoài | DC03 | Đạt |
| Cookie `nckh_oauth` không dùng được làm Bearer; access token không dùng được làm cookie | DC03 "không dùng được làm Bearer", "cookie là access token" | Đạt |
| `access_denied` → CANCELLED | DC03 | Đạt |
| state sai/thiếu, code thiếu, cookie thiếu/hết hạn/sai khóa/alg none, query quá dài/lặp khóa → STATE_MISMATCH | DC03 (9 ca) | Đạt |
| nonce sai → STATE_MISMATCH | DC03 | Đạt |
| `email_verified` false hoặc chuỗi → EMAIL_NOT_VERIFIED | DC03 (2 ca) | Đạt |
| hd khác, `@gmail.com`, `x@evil.vanlanguni.vn.attacker.com`, tên miền con → DOMAIN_NOT_ALLOWED | DC03 (4 ca) | Đạt |
| Không có tài khoản; trùng email bẩn → NO_ACCOUNT | DC03 (2 ca) | Đạt |
| ADMIN → PASSWORD_ONLY | DC03; DB | Đạt |
| Khóa / tạm khóa → ACCOUNT_LOCKED; tạm khóa hết hạn được vào | DC03; DB | Đạt |
| Khóa giữa lúc kiểm và cấp (đọc lại sau `lockUser`) | DC03 "bị khóa giữa lúc…" | Đạt |
| Khóa tài khoản ‖ callback → không có refresh token sống (m1) | DB (6 vòng, `setLocked` thật song song) | Đạt |
| Google lỗi (getToken, verify, thiếu id_token) → GOOGLE_ERROR | DC03 | Đạt |
| n1: 21 callback lỗi cùng IP → lần 21 bị 429 `RATE_LIMITED`, IP khác không ảnh hưởng | DC03 | Đạt |
| M1: 25 lần SSO thành công cùng IP không 429 | DC03 | Đạt |

Kiểm đột biến thủ công: bỏ `requestWasSuccessful` → test 21 lần đỏ; bỏ điều kiện `emailDomain !== hd` → 2 test tên miền đỏ (đã hoàn lại code).

## Bằng chứng chạy lệnh
```
$ npm install google-auth-library@10.9.1 --save-exact -w @nckh/api
$ npm ls google-auth-library
└─┬ @nckh/api@0.1.0 -> .\apps\api
  └── google-auth-library@10.9.1
$ npm audit --omit=dev
found 0 vulnerabilities

$ npx vitest run tests/DC03-sso.test.js tests/DC03-sso-db.test.js   (apps/api)
 Test Files  2 passed (2)
      Tests  42 passed (42)

$ npm run lint
> lint
> eslint . --max-warnings 0
(exit 0)

$ npm test   (exit=0)
 Test Files  7 passed (7)
      Tests  91 passed (91)        [shared]
 Test Files  75 passed (75)
      Tests  1038 passed (1038)    [api]
 Test Files  32 passed (32)
      Tests  245 passed (245)      [web]
```

## Còn lại / rủi ro
- Con người phải tạo OAuth client "Web application" ở Google Cloud Console (màn đồng ý **Internal** của Workspace trường) và đăng ký đúng redirect URI: dev `http://localhost:5173/api/auth/google/callback`, production `https://<domain web Vercel>/api/auth/google/callback` (= `PUBLIC_APP_URL` + `/api/auth/google/callback`). Biến trên Render: 4 biến trên (DC-20 cập nhật `render.yaml`, `VAN_HANH.md`).
- Chưa thử với Google thật (theo quy tắc). `hd` chỉ có với tài khoản Workspace; nếu trường dùng Gmail thường thì mọi người bị `DOMAIN_NOT_ALLOWED` – đúng đặc tả.
- pino-http (production) log `req.url` của callback gồm `code` và `state`. `code` dùng một lần, gắn PKCE (cần `codeVerifier` trong cookie httpOnly) nên rủi ro thấp; chưa lọc khỏi log.
- Store limiter trong bộ nhớ (như các limiter khác): chỉ đúng với 1 instance.
- UI (nút Google, `/dang-nhap/google`, hiển thị `sso_error`) thuộc DC-12.

## Câu hỏi cho reviewer
- Gộp lỗi `verifyIdToken` vào `GOOGLE_ERROR` (không phải `STATE_MISMATCH`) có chấp nhận được không?
- Có cần lọc `code`/`state` khỏi `req.url` trong log pino-http của callback không?

## Sau review bao-mat v1 (điều phối viên, 2026-11-18)
- **m1 đã sửa:** `logReq` (`apps/api/src/lib/logger.js`) dùng làm serializer `req` của pino-http (`app.js`): với `/api/auth/google/callback` bỏ query khỏi `url` và xóa `query`. Test mới `apps/api/tests/DC03-log.test.js` (log không chứa `code`/`state`; đường dẫn khác giữ nguyên query).
- Bằng chứng: `npm run lint` sạch; `npm test` → shared 91/91, api 1039/1039, web 245/245.
- **m2 chưa sửa** (429/lỗi DB ở callback trả JSON thay vì 302 về `/dang-nhap?sso_error=`): ghi lại, xử lý khi có trang lỗi SSO ở DC-12.
- **m3 chuyển sang DC-12:** đưa kiểm `next` thành schema Zod dùng chung cho FE và BE.
