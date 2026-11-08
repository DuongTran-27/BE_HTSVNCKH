# Review bảo mật cuối dự án (T708) – v1
Kết luận: **APPROVED** (BLOCKER 0, MAJOR mã nguồn 0; 4 MINOR không chặn; các mục chỉ kiểm được sau deploy thuộc việc của con người, liệt kê ở mục 4)

Trước bản này chưa có `FINAL-bao-mat.md`. Mục 3 đối chiếu các mục còn mở của những review bảo mật trước.

## 1. Bằng chứng chạy (2026-11-08, DB test đang chạy)
- `npm audit --omit=dev`: `found 0 vulnerabilities`.
- `npx vitest run tests/security` (apps/api): 13 file / 236 ca pass.
- `npx vitest run tests/T706b.test.js tests/auth.test.js tests/T205-auth-db.test.js tests/T703b.test.js tests/T206-errors.test.js`: 5 file / 70 ca pass.
- `npx vitest run tests` (apps/web, gồm `middleware.test.js` và `tests/security`): 14 file / 165 ca pass.
- Probe tạm (đã xóa): chạy app thật với `createLogger` + pino-http, đăng nhập rồi gọi `/api/auth/me` kèm Bearer và cookie. Log không chứa refresh token hay access token. Đạt.
- Truy vấn DB test: 30/30 bảng `public` có `relrowsecurity = true`.
- `git ls-files`: chỉ có `.env.example` và `.env.test` (DB test cục bộ `postgres:postgres@localhost`). `.gitignore` chặn `.env` và `.env.*`.
- `git grep` chuỗi kết nối và `cloudinary://`: chỉ thấy URL localhost/test và giá trị giả trong test.
- `git log --all -p`: không có host Supabase/Cloudinary thật. Lịch sử chưa từng xóa file `.env`.

## 2. Rà danh mục
| Nhóm | Kết quả |
|---|---|
| Argon2id | Đạt. Tham số OWASP (19 MiB, t=2, p=1). Mật khẩu tạm dùng hash nhẹ và có verify bù thời gian. Tài khoản không tồn tại vẫn tốn một lần verify bằng hash giả. |
| JWT / refresh | Đạt. HS256 với `algorithms` cố định, mặc định TTL 900 s. Access token chỉ nằm trong bộ nhớ: web không dùng `localStorage`/`sessionStorage`. Cookie `nckh_rt` có httpOnly, Secure (prod), SameSite=Lax, path `/api/auth`. Refresh xoay vòng dưới khóa họ phiên; token bị dùng lại thì thu hồi cả họ. |
| Khóa tài khoản | Đạt. `requireAuth` nạp lại user ở mỗi request. Refresh thu hồi họ phiên của tài khoản bị khóa. Login có rate limit 20/15 phút/IP và khóa tạm sau 5 lần sai. 403 `ACCOUNT_LOCKED` và 429 `TEMP_LOCKED` có lộ việc tài khoản tồn tại; điểm này đã được chấp nhận theo thiết kế (T703a, BUG-013). |
| Đổi mật khẩu lần đầu | Đạt. `requirePasswordChanged` gắn vào mọi router nghiệp vụ qua `businessRouter`. `/change-password` có limiter 5/15 phút/user, kiểm mật khẩu hiện tại và thu hồi các phiên khác trong transaction. |
| FR25 / admin | Đạt. Chỉ `auth/routes.js` không đi qua `businessRouter`. Mọi route nghiệp vụ có `requireRole` không gồm ADMIN. ADMIN chỉ có tài khoản, danh mục, thông báo của mình và kho chung (G3). Quyền theo quan hệ đề tài nằm ở service, có test IDOR ở T209/T601… Lời mời kiểm `inviteeId === user.id`. |
| File | Đạt. multer 2.5 lọc đuôi, giới hạn cứng 10 MB, 1 file. `contentMatches` kiểm magic bytes PDF/OOXML mà không giải nén. Cloudinary dùng `raw` + `authenticated`, `overwrite:false`. Link tải dùng `private_download_url` có `expires_at` 300 s và chỉ được cấp sau `readerOf`, có ghi audit `DOCUMENT_DOWNLOAD` và `no-store`. Link ngoài chỉ nhận `https`, không có userinfo; web thêm `rel="noopener noreferrer"`. |
| CSV | Đạt. Xuất có BOM và thêm `'` trước ô bắt đầu bằng `= + - @`, tab/CR, khoảng trắng đứng trước, hoặc dạng toàn chiều rộng. Nhập dùng UTF-8 fatal, bỏ BOM, multipart giới hạn kích thước/số phần và có limiter. |
| SQL | Đạt. Chỉ dùng `Prisma.sql` có tham số; không dùng `$queryRawUnsafe` trong `src`. |
| Audit / log | Đạt. `redact()` lọc khóa password/token/secret/hash/key… ở mọi độ sâu. pino redact `authorization`, `cookie`, `x-nckh-origin`, `set-cookie`, đã kiểm qua pino-http thật. |
| Header / CORS / CSP | Đạt. helmet đứng trước chốt origin. CORS chỉ nhận danh sách `CORS_ORIGIN` (đã trim). `vercel.json` có CSP chặt (`script-src 'self'`, `frame-ancestors 'none'`), nosniff, Referrer-Policy, XFO. errorHandler không lộ stack (test T215). Swagger chỉ bật khi `NODE_ENV !== 'production' && ENABLE_SWAGGER`. |
| Cron | Đạt. Bearer `CRON_SECRET` (≥32) so bằng `timingSafeEqual` trên sha256; thiếu cấu hình thì 404. Mỗi tác vụ có limiter riêng. Workflow truyền header qua `curl -K -`. |
| ORIGIN_SECRET | Đạt ở mã. Production bắt buộc có (≥32). So sánh thời gian hằng; chỉ miễn `GET /api/health`. `middleware.js` bỏ `x-middleware-*` và `x-nckh-origin` do client gửi; thiếu cấu hình thì trả 503 (đóng). |
| `render.yaml` | Đạt. Bí mật dùng `sync: false`, JWT dùng `generateValue`. `autoDeploy: false`. Không có `DIRECT_URL`. |
| Workflow GitHub | Đạt. `permissions` tối thiểu (`{}` hoặc `contents: read`; backup có thêm `actions: write`). `persist-credentials: false` ở các job dùng secret. Backup từ chối chạy trên repo public và mã hóa gpg AES256. Migrate chỉ chạy tay, qua environment `production`. CI không dùng secret. |
| RLS Supabase | Đạt. Mọi bảng bật RLS không có policy. Role app/backup dùng `BYPASSRLS` theo VAN_HANH §5. |
| Phụ thuộc | Đạt. `npm audit --omit=dev` báo 0 lỗ hổng. |

## 3. Mục còn mở từ các review trước
Mọi review `*bao-mat*` đều kết thúc APPROVED; không còn BLOCKER/MAJOR mã nguồn. Đã kiểm lại các MINOR được giao sửa:
- Đã đóng: T601 m2 (kiểm lại khoa của GV mới, `advisorChange.js`), T609 m3 (lọc đề tài đã kết thúc), T609 m4 (tách limiter cron), T706b MINOR 1 (helmet trước chốt), T215 #1/#2.
- Còn mở, chấp nhận (không khai thác được): T609 m1 (trigger `submission_guard` nhận dòng OK mới hơn bất kỳ; chỉ là phòng thủ chiều sâu), T609 m2 / T601 m1 (khác biệt hiển thị cho GV, đúng đặc tả), T601 m4/m5 (cạnh tranh hiếm, không leo quyền), BUG-013 MINOR 1 (lệch thời gian ~2 ms với mật khẩu tạm).
- **MAJOR T703c mục 3** (đo số hop rồi đặt `trust proxy`) vẫn mở, nhưng là việc sau deploy (mục 4). T706b MINOR 3: mã tạm `LOG_PROXY_HOPS` phải gỡ sau khi đo.

## 4. MINOR mới (không chặn)
1. `ACCESS_TOKEN_TTL_SECONDS` và `REFRESH_TOKEN_TTL_DAYS` (`config/env.js`) không có cận trên, nên cấu hình sai có thể vượt mức 15 phút của FR01. Nên thêm `.max(900)`. Hiện `render.yaml` không đặt biến này, nên dùng mặc định 900.
2. Test dùng `logger: undefined` tạo logger pino-http mặc định, không redact, nên in cookie test ra stdout của vitest. Không ảnh hưởng production (`server.js` dùng `createLogger`), chỉ làm log CI ồn.
3. Checkout trong `ci.yml` không đặt `persist-credentials: false`. Token chỉ có `contents: read`, workflow không chạy `pull_request_target`, nên rủi ro thấp.
4. `/api/auth/refresh` và `/logout` không có limiter. Token là 256 bit ngẫu nhiên, nên không dò được; chỉ là tải DB.

## 5. Chỉ kiểm được sau deploy (việc của con người, không chặn review mã)
Theo `docs/VAN_HANH.md` §6.4 (9 mục). Ghi số đo vào `reports/T706a.md` mục "Kết quả đo thật":
1. `curl -sI https://<app>/api/health | grep -i '^x-middleware'` phải rỗng. Nếu không rỗng thì xoay `ORIGIN_SECRET`.
2. Gọi thẳng `*.onrender.com/api/auth/me` phải nhận 404.
3. **Đo hop và đặt `trust proxy` đúng** (đóng MAJOR T703c mục 3). Nếu đặt sai, `req.ip` sẽ là IP của Vercel và limiter login 20/15 phút/IP thành giới hạn chung cho mọi người dùng (DoS đăng nhập), hoặc XFF bị giả mạo được. Sau đó gỡ `LOG_PROXY_HOPS`.
4. Tắt Data API Supabase, hoặc kiểm anon key nhận `[]`.
5. Cron qua domain Vercel trả 200.
6. Nhập CSV 2.000 dòng không bị proxy cắt.
7. Tách role `nckh_app` / `backup_ro` (§5.3).
8. Header bảo mật trang tĩnh; Console không có vi phạm CSP.
9. `/api/docs` trả 404.
Ngoài ra: environment `production` của GitHub bật Required reviewers và giới hạn nhánh `main`; repo phải private để chạy backup.
