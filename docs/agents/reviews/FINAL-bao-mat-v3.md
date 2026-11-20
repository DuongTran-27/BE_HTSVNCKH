# Review bảo mật cuối dự án – v3 (2026-11-20)
Kết luận: **APPROVED** (BLOCKER 0, MAJOR 0, 3 MINOR mới không chặn)

Lần trước: `FINAL-bao-mat.md` (v2, 2026-11-11, APPROVED). Phạm vi lần này là phần mở rộng đề cương TASK-DC-00..DC-24: SSO Google, email SMTP, tuyển SV/đơn ứng tuyển, hội đồng + chấm/chốt bảo vệ, Kanban, xuất xlsx, hồ sơ cá nhân. Mỗi task BM đã có review riêng (`TASK-DC-*-bao-mat-*.md`). Review này xét bề mặt mới như một tổng thể và các vấn đề cắt ngang. Tôi không đọc `.env` và không sửa code sản phẩm.

## 1. Bằng chứng chạy
- Kết quả kiểm tra cuối do phiên chính cung cấp (2026-11-20, chạy hai lần liên tiếp): lint 0; `npm test --coverage` shared 115/115, api 1222/1222, web 384/384, độ phủ ≥ 70%; build ok; E2E 100/100. Lần này không chạy lại E2E.
- `npm run db:test:up` → "Kiểm tra DB test: tất cả OK". Sau đó chạy `npx vitest run tests/security/FINAL-v3-bao-mat.test.js` (apps/api) → **4/4 pass**. Test mới được giữ lại làm hồi quy, gồm:
  - ADMIN gọi 20 route mới (recruitments, applications, `topics/:id/applications`, councils, council-assignments: đọc, chấm, chốt, hủy; `stats/export.xlsx`) → đều 403.
  - G53: ủy viên đọc qua 5 đường (chi tiết phân công, danh sách phân công, chi tiết hội đồng, danh sách hội đồng, chi tiết đề tài) không thấy điểm của chủ tịch. Chủ tịch thấy điểm ủy viên. SV và GVHD không thấy điểm thành viên trước khi chốt.
  - IDOR đơn ứng tuyển: SV khác rút đơn → 403; danh sách đơn của SV khác không chứa đơn này; GV ngoài đề tài duyệt → 403. Danh sách đơn của GVHD không chứa SĐT, email của SV, cũng không có `passwordHash`.
  - G62: đề tài CLOSED thì chủ tịch và ủy viên hội đồng nhận 403 ở `GET /api/topics/:id`; cán bộ trong phạm vi vẫn 200.
- `npx eslint apps/api/tests/security/FINAL-v3-bao-mat.test.js` → sạch. `npm run db:test:down` → đã dừng.
- `npm audit --omit=dev` báo 2 moderate, đều là `uuid` < 11.1.1 qua exceljs. Lỗi chỉ xảy ra khi gọi v3/v5/v6 với `buf`, còn exceljs dùng v4. Mục này đã chấp nhận ở DC-11/DC-20.
- `git grep` chuỗi kết nối, `cloudinary://`, `GOCSPX-`, `AIza…`, khóa riêng, `SMTP_PASS=`:
  - Chỉ thấy placeholder trong `.env.example` và tài khoản localhost của DB test (`.env.test`, README, `db-dev.js`, `e2e/env.js`, các test T201). Những mục này đã biết và được chấp nhận.
  - `git ls-files`: chỉ có `.env.example` (api, web) và `.env.test`.

## 2. Rà danh mục (bề mặt mới)
| Nhóm | Kết quả |
|---|---|
| FR25 / route mới | Đạt. Mọi router mới (`recruitments`, `applications`, `councils`, `council-assignments`, `me/profile`) tạo qua `businessRouter(guard)`, tức là có `requireAuth` + `requirePasswordChanged`. `requireRole` của các router không gồm ADMIN; `me/profile` là dữ liệu của chính người gọi. `r.param('id')` kiểm UUID → 404. Quyền theo quan hệ được kiểm ở service; với chấm và chốt, tư cách thành viên được đọc **sau** khóa Council (`councils/service.js:228,246`). |
| Hội đồng – phạm vi đọc | Đạt. Cán bộ chỉ đọc trong khoa được cấp (`inScope`). GV chỉ thấy hội đồng mà mình là thành viên. Khi phân công bị hủy, thành viên nhận 403 và danh sách bị lọc `cancelledAt: null` (`service.js:37,210`). Với G62: `relations().isCouncilMember` tắt khi đề tài CLOSED/CANCELLED (`topics/service.js:41,54`); `processScore` bị ẩn với thành viên sau khi đóng (`councils/service.js:42`). |
| Chấm độc lập (G53) | Đạt. `scores` chỉ trả khi `decidedAt` có giá trị, hoặc người gọi là cán bộ trong phạm vi, CHAIR hoặc SECRETARY (`councils/service.js:47`, `topics/service.js:90`). `presentAssignment` (chi tiết hội đồng) chỉ có `scoredCount`. `setMyScore` không gửi thông báo. Test v3 đã quét cả 5 đường đọc. |
| Khóa điểm sau chốt | Đạt. Trigger `defense_score_guard` chặn INSERT/UPDATE/DELETE khi phân công đã chốt hoặc đã hủy, đồng thời chặn chuyển điểm sang phân công/thành viên khác. `council_assignment_guard` chặn sửa hoặc xóa sau chốt, và chặn đổi đề tài/hội đồng. `ProcessScore` chỉ được thêm dòng (append-only), có chặn TRUNCATE. Tất cả các bảng mới đều bật RLS. |
| Đơn ứng tuyển – IDOR | Đạt. Rút đơn kiểm `studentId === user.id`. Duyệt/từ chối kiểm GVHD hiện hành hai lần: trước khóa và lại dưới khóa Topic. Danh sách đơn theo vai trò: SV chỉ thấy `studentId` của mình, GV thấy đơn vào đề tài mình đang hướng dẫn, STAFF thấy trong khoa được cấp và không gồm DRAFT. Ứng tuyển chỉ vào đề tài RECRUITING cùng khoa, kiểm lại sau khóa. |
| PII | Đạt. `ApplicationView.student` chỉ có mã, họ tên, mã lớp. Thêm `topic.advisor.fullName` là chấp nhận được: tên GVHD vốn công khai trên bảng tin tuyển (`boardSelect` đã có `advisings.lecturer.fullName`), nên không lộ thêm gì. Bảng tin không có thành viên, ứng viên hay số đơn. AuditLog ứng tuyển chỉ ghi độ dài lời giới thiệu. Xuất thống kê không chọn tên/mã SV, email, SĐT, nhận xét (`stats/prismaRepo.js:42`). |
| SSO Google | Đạt. Dùng Authorization Code + PKCE S256. `state`, `nonce`, `codeVerifier` nằm trong JWT HS256 ký bằng khóa dẫn xuất riêng, TTL 600 s, cookie httpOnly/SameSite=Lax/path `/api/auth/google`, dùng một lần. So `state` và `nonce` bằng `timingSafeEqual`. `audience` = client id. Kiểm `email_verified === true`, `hd` có trong danh sách và đuôi email phải trùng `hd`. Chỉ cho vào tài khoản đã có; email trùng (không phân biệt hoa thường) thì từ chối. ADMIN → `PASSWORD_ONLY`. Phiên được cấp trong tx, khóa SHARE User và đọc lại `isLocked`. Callback có limiter chỉ đếm lần thất bại; lỗi và 429 đều 302 về trang đăng nhập. Log cắt query của callback (`lib/logger.js:7`). |
| Open redirect (`next`) | Đạt. Server luôn chuyển hướng tới đích cố định `PUBLIC_APP_URL/dang-nhap/google`. `next` chỉ là tham số đã `encodeURIComponent`, được kiểm bằng `nextPathSchema` dùng chung cho API và web: ≤ 512 ký tự, bắt đầu bằng `/`, không có `//`, `\` hay ký tự điều khiển. |
| Email | Đạt. Tiêu đề thư: ký tự điều khiển được thay bằng khoảng trắng và cắt ở 200 ký tự (chống chèn header). HTML được escape. Link chỉ nhận đường nội bộ. `to` lấy từ DB; tài khoản khóa hoặc không có email → SKIPPED. Log không ghi địa chỉ hay nội dung. Gửi ngoài tx nghiệp vụ với `FOR UPDATE SKIP LOCKED`. SMTP đặt `requireTLS` khi không dùng `secure`, có timeout. Cột `emailStatus` có CHECK. |
| xlsx | Đạt. Mọi ô chuỗi được ghi dạng string, không bao giờ là `{formula}`. Ký tự XML không hợp lệ bị loại. TC-FR39-03 kiểm không có ô formula. Route chỉ cho STAFF/LECTURER, limiter 30/15 phút/user. Phạm vi: STAFF theo khoa được cấp, LECTURER chỉ đề tài của mình; lọc khoa ngoài phạm vi → 403. CSV giữ nguyên cách chống injection như v2. |
| Rate limit ghi mới | Đạt. Ứng tuyển 30, duyệt/từ chối 60, ghi hội đồng 30 (dùng chung), chấm 60, chốt 30, hồ sơ 10, xuất 30 (mỗi user / 15 phút). Rút đơn không có limiter (xem m2). |
| CSP (`apps/web/vercel.json`) | Đạt. CSP không đổi so với v2 (`script-src 'self'`, `frame-ancestors 'none'`, `form-action 'self'`). SSO được khởi động bằng thẻ `<a>` (điều hướng thường), nên `form-action` không chặn chuyển hướng 302 sang Google. `index.html` không có script inline. `localStorage` chỉ lưu giao diện (theme, trạng thái thu gọn), không lưu token. Không có `dangerouslySetInnerHTML`. |

## 3. MINOR mới (không chặn)
| # | Mức | Vị trí | Mô tả | Đề xuất |
|---|---|---|---|---|
| m1 | MINOR | `apps/api/prisma/migrations/20261118000400_dc_council/migration.sql:72,19,58` | `DefenseScore.score`, `ProcessScore.score`, `finalScore` chỉ là `DECIMAL(4,2)`, không có `CHECK (score BETWEEN 0 AND 10)`. Khoảng 0–10 hiện chỉ do Zod kiểm (`defenseScoreSchema`). Không khai thác được qua API; chỉ thiếu lớp phòng thủ ở DB. | Thêm CHECK khi có migration kế tiếp chạm các bảng này. |
| m2 | MINOR | `apps/api/src/modules/topics/applicationRoutes.js:21` | `POST /api/applications/:id/withdraw` không có limiter, trong khi các route ghi mới khác đều có. Mỗi đơn chỉ rút được một lần (cập nhật có điều kiện PENDING), và ứng tuyển đã có limiter 30, nên tác động rất nhỏ. | Gắn `decideLimiter` (hoặc một limiter 30/15 phút/user) cho đồng bộ. |
| m3 | MINOR | `apps/api/prisma/migrations/20261118000400_dc_council/migration.sql:168,177` | `DefenseScore` và `CouncilAssignment` có trigger cho từng dòng nhưng không có trigger chặn TRUNCATE (khác `ProcessScore:160` và các bảng chỉ-thêm của T204). Phải có quyền DB trực tiếp mới khai thác được. | Thêm `BEFORE TRUNCATE … forbid_mutation()` ở migration kế tiếp. `tests/db.js` đã tắt trigger bằng `session_replication_role`, nên không vỡ reset. |

## 4. Mục còn mở từ review trước (chấp nhận, không chặn)
- v2 MINOR 1: CSP `style-src 'self'` chặn `<style>` do Radix chèn. Sẽ kiểm trên bản preview.
- v2 MINOR 2: audit dev minimatch.
- Các MINOR đã ghi ở các review DC-xx đã được đóng ở task sau, hoặc đã được chấp nhận theo thiết kế. Ví dụ: DC-02 m2 (AuditLog có SĐT, chưa có API đọc), DC-11 MINOR-1/2.
- Việc sau deploy giữ nguyên như v2 §6 (trust proxy, ORIGIN_SECRET, Data API Supabase, `/api/docs` 404…). Thêm cho SSO và SMTP: đăng ký redirect URI chính xác `https://<app>/api/auth/google/callback` trên Google Console; `GOOGLE_ALLOWED_DOMAINS` đúng tên miền trường; nhà cung cấp SMTP hỗ trợ STARTTLS (VAN_HANH §6.6).

## 5. Test bảo mật thêm
`apps/api/tests/security/FINAL-v3-bao-mat.test.js` (4 ca, đều xanh). Test này không phát hiện lỗ hổng nào; tôi giữ lại làm hồi quy cắt ngang cho FR25, G53, G62 và IDOR/PII của đơn ứng tuyển.
