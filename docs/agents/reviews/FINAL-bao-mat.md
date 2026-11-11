# Review bảo mật cuối dự án – v2 (chạy lại 2026-11-11)
Kết luận: **APPROVED** (BLOCKER 0, MAJOR 0; 2 MINOR mới không chặn; mục sau deploy ở §6)

Lần trước: v1 T708 ngày 2026-11-08, APPROVED (0 BLOCKER, 0 MAJOR, 4 MINOR – cả 4 đã đóng ở BUG-016, xem §3).
Phạm vi lần này: toàn dự án, chú trọng thay đổi `4bcd6df..HEAD` (xóa tài khoản, FK AuditLog.actorId, race khóa/xóa ADMIN, P2003 → 409, shadcn/ui, đăng nhập nhanh bản dev, script demo).

## 1. Bằng chứng chạy (2026-11-11)
- `npm run db:test:up` → "Kiểm tra DB test: tất cả OK"; `npm run db:test:reset` → "Đã reset DB test (migrate reset)" (áp toàn bộ migration, gồm `20261111000000_audit_actor_fk`, không lỗi).
- `npx vitest run tests/security/<file>` (apps/api), từng file một: 17 file / 247 ca pass (BUG-001 5, BUG-002 5, setLocked-admin-race 3, T199-input-size 6, T199-rate-limit 2, T205-bao-mat 1, T207a-bao-mat 1, T207a-vong1 4, T207b-multipart 11, T215 20, T215-bao-mat 15, T403-cleanup-guard 1, T703a-bao-mat 154, T703c-bao-mat 14, TASK-LOCK-ADMIN-RACE-bao-mat 1, TASK-USER-DELETE-bao-mat 3, TASK-USER-DELETE-bao-mat-v2 1). Lưu ý: chạy trước khi reset thì 6 file lỗi `relation "topic_code_seq" does not exist` – do DB mới dựng chưa migrate, không phải lỗi mã.
- Truy vấn DB test: 29/29 bảng ứng dụng trong `public` có `relrowsecurity = true`; `AuditLog_actorId_fkey` có `confdeltype = 'r'` (RESTRICT).
- `npm run build -w @nckh/web` → "built". `grep -rlE "QT001|Nckh@2026|nckh.example|CB001|GV001|2374801030010|Đăng nhập nhanh" apps/web/dist` → rỗng.
- `npm audit --omit=dev` → `found 0 vulnerabilities`. `npm audit` → 4 moderate (minimatch qua eslint 10, chỉ dev, ReDoS khi lint glob của chính repo; không vào bundle/server).
- `git ls-files`: chỉ `.env.example`, `.env.test`; `.gitignore` chặn `.env`, `.env.*`, `*.local.json` (file `demo-people.local.json` không bị track). `git grep` chuỗi kết nối/`cloudinary://`/khóa riêng: chỉ placeholder `<ref>:<mk>` trong `docs/VAN_HANH.md`.
- `npm run db:test:down` → đã dừng.

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

| Xóa tài khoản (mới) | Đạt. `DELETE /api/users/:id`: `writeLimiter` + `requireRole('ADMIN')` + kiểm lại trong service; `r.param('id')` kiểm UUID. Transaction khóa mọi dòng ADMIN theo thứ tự id rồi dòng đích (`FOR UPDATE`), kiểm người thực hiện còn hoạt động, không tự xóa, còn ≥1 ADMIN hoạt động; có AuditLog/ChangeRequest thì 409 `IN_USE`; FK RESTRICT (P2003) cũng ra 409. AuditLog `USER_DELETE` ghi trước khi xóa (FR15). |
| Race khóa ADMIN (mới) | Đạt. `setLocked` với đích là ADMIN dùng `guardAdmins` (khóa các dòng ADMIN theo thứ tự), chặn khóa chéo làm còn 0 ADMIN; có test `setLocked-admin-race` và `TASK-LOCK-ADMIN-RACE-bao-mat`. |
| errorHandler P2003 (mới) | Đạt. Thông điệp cố định, không lộ tên ràng buộc/bảng. |
| Migration `audit_actor_fk` | Đạt với DB thật. Kiểm dòng mồ côi trước, có thì `RAISE EXCEPTION` (không tự sửa lịch sử); `ADD CONSTRAINT` khóa bảng ngắn, AuditLog nhỏ. Lưu ý vận hành: chạy `prisma migrate deploy` qua `migrate.yml` như các migration khác. |
| Đăng nhập nhanh (mới) | Đạt. `LoginPage.jsx:21-23,91` bọc trong `import.meta.env.DEV`; bản build không chứa mã/mật khẩu mẫu (đã grep dist). |
| Script demo (mới) | Đạt. `demo-people.js:40` và `demo-stats.js:92` từ chối khi `NODE_ENV=production`, rồi `assertSeedAllowedDb` đòi cờ `nckh.seed_allowed` ở mức database (phiên không tự đặt được). Hai lớp chặn độc lập. |
| Dep UI mới | Đạt. radix-ui, cva, clsx, tailwind-merge, tw-animate-css: 0 lỗ hổng ở `--omit=dev`; không có `dangerouslySetInnerHTML`/`innerHTML`/`eval` trong `apps/web/src`. |

## 3. Mục còn mở từ các review trước
- Đã đóng (BUG-016, kiểm lại): v1 MINOR 1 (`env.js:8-9` có `.max(900)` / `.max(30)`), MINOR 2 (`app.js:35` logger mặc định `level: 'silent'` + `LOG_REDACT`), MINOR 3 (`ci.yml` 3 checkout `persist-credentials: false`), MINOR 4 (`auth/routes.js:22-24` limiter 300/15 phút/IP cho refresh/logout).
- Còn mở, chấp nhận như v1: T609 m1, T609 m2 / T601 m1, T601 m4/m5, BUG-013 MINOR 1.
- MAJOR T703c mục 3 (đo hop, đặt `trust proxy`) và gỡ `LOG_PROXY_HOPS`: vẫn là việc sau deploy (§6).

## 4. MINOR mới (không chặn)
1. CSP `style-src 'self'` (`apps/web/vercel.json`) chặn thẻ `<style>` mà Radix Dialog chèn lúc chạy (react-remove-scroll-bar qua react-style-singleton, thấy `createElement("style")` trong `dist/assets/index-*.js`). Hệ quả: khi mở hộp thoại (AdvisingActions, CloseActions, MembershipActions, ChangeRequestCard…), Console báo vi phạm CSP và trang nền vẫn cuộn được. Không phải lỗ hổng, nhưng sẽ làm trượt mục sau deploy §6.8 ("Console không có vi phạm CSP"). Không nên nới thành `'unsafe-inline'` cho cả trang; cân nhắc chấp nhận và ghi vào VAN_HANH, hoặc dùng nonce/hash nếu chuyển sang cấu hình có thể chèn nonce. Cần kiểm trên bản preview.
2. `npm audit` (kể cả dev) báo 4 moderate minimatch qua eslint 10. Chỉ dev, không có bản sửa không phá vỡ; theo dõi khi eslint ra bản vá.

## 5. Ghi chú dữ liệu cá nhân
AuditLog `USER_DELETE` giữ mã, vai trò, họ tên/email của tài khoản bị xóa (`accounts/service.js` hàm `remove`). Đây là chủ đích để truy vết (FR15), không chứa hash/mật khẩu (`redact()` vẫn áp dụng). Không có thay đổi log mới khác.

## 6. Chỉ kiểm được sau deploy (việc của con người, không chặn review mã)
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
