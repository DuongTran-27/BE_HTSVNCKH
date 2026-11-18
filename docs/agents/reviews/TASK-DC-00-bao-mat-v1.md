# Review TASK-DC-00 – bao-mat – vòng 1
Kết luận: CHANGES_REQUESTED

Chế độ tiết kiệm quota: reviewer duy nhất, kiểm cả bảo mật lẫn tính nhất quán/kiểm thử được. Review tài liệu (chưa có code), không chạy test sản phẩm.

## Tôi đã tự kiểm tra
- Đọc: `docs/DAC_TA.md` mục 9; `docs/agents/design/API_GD7.md` (toàn bộ); `docs/agents/design/UI.md` mục 12; `docs/agents/BANG_CONG_VIEC.md` dòng 143–167; `docs/agents/CAU_HOI.md` #13, #14 (git diff).
- Đối chiếu code: `apps/api/src/modules/auth/{routes,service}.js`, `lib/tokens.js`, `middlewares/auth.js:26` (chặn `mustChangePassword` ở backend), `middlewares/rateLimit.js`, `app.js:34` (`trust proxy` 1), `config/env.js`, `notifications/notify.js`, `topics/{service,groupService,closeConditions,advisorRepo}.js`, `execution/{feedbackService,documentService}.js`, `changeRequests/advisorChange.js`, `packages/shared/src/{transitions,enums,schemas}.js`, `prisma/schema.prisma` (RequestStatus, Notification), các migration có `ENABLE ROW LEVEL SECURITY`.
- Kiểm thư viện bằng npm registry thật (thư mục tạm, `npm install --package-lock-only --ignore-scripts` + `npm audit --omit=dev`):
  ```
  nodemailer 7.0.13 + exceljs 4.4.0 + google-auth-library 10.9.1:
  nodemailer  <=10.1.3   Severity: high   (20 advisory, gồm GHSA-c7w3-x93f-qmm8 SMTP command injection,
     GHSA-268h-hp4c-crq3 CRLF header injection, GHSA-wmmp-3585-3rmp / GHSA-cc9r-2j5m-2m83 gửi tới tên miền kẻ tấn công …)
  fix available … Will install nodemailer@10.6.0, which is a breaking change
  uuid  <11.1.1  Severity: moderate  GHSA-w5hq-g745-h8pq  (qua exceljs >=3.5.0)
  3 vulnerabilities (2 moderate, 1 high)

  nodemailer 10.6.0 + google-auth-library 10.9.1:  found 0 vulnerabilities
  nodemailer@10.6.0 engines: { "node": ">=20.0.0" }
  ```

## Đối chiếu đặc tả
| Điều kiện đạt | Đạt? | Ghi chú |
|---|---|---|
| FR28: Authorization Code + PKCE, `state`, `nonce`, token không trên URL | Đạt | §8.2; cookie `nckh_oauth` ký khóa dẫn xuất, không dùng làm Bearer được (`verifyAccessToken` dùng `JWT_ACCESS_SECRET` gốc) |
| FR28: `email_verified`, `hd` + đuôi email, không tự tạo tài khoản, khóa/tạm khóa bị từ chối | Đạt | §8.2, §8.3 (G54 hợp lý, giữ FR02) |
| FR28: CSRF đăng nhập / open redirect / lộ thông điệp | Đạt | `state` gắn cookie trình duyệt; server luôn về `PUBLIC_APP_URL` cố định; `GOOGLE_ERROR` không lộ lỗi Google; NO_ACCOUNT chỉ lộ cho chính chủ hộp thư đã xác minh |
| FR28 + FR01: phiên sau callback | Đạt một phần | Refresh cookie `nckh_rt`, họ mới, FE gọi `/refresh` – khớp FR01; `mustChangePassword` vẫn bị middleware chặn. Thiếu yêu cầu khóa + đọc lại User trong tx (m1) |
| FR28: rate limit | Chưa đạt | M1 |
| FR29: không lộ dữ liệu, lỗi SMTP không hỏng API, không chặn transaction | Đạt | Outbox trên `Notification`, gửi ngoài tx, SKIP LOCKED |
| FR29: thư viện an toàn | **Không đạt** | B1 |
| FR31–FR33: quyền theo quan hệ, chỉ tiêu, FR03 dưới khóa | Đạt một phần | Khóa Topic → User đúng tiền lệ (`advisorRepo.js:13`); thiếu khóa khi ứng tuyển (M3); trạng thái kẹt (M2) |
| FR34–FR37: xung đột lợi ích, ai chấm/chốt, đóng băng sau chốt, hai người chốt | Đạt một phần | Khóa Council → Topic hợp lý, trigger khóa điểm đúng; quyết định hội đồng bị ghi đè được (M4) |
| FR38: Kanban không có quyền riêng (chỉ là góc nhìn FR12/FR22) | Đạt một phần | Đúng hướng (G56); suy cột sai (M5) |
| FR39: ô chuỗi, phạm vi như FR14 | Đạt | `statsWhere` dùng chung, ô chuỗi; m8 |
| Transaction + StatusHistory mọi chuyển mới; TRANSITIONS chỉ ở shared | Đạt | §0, `applyTransitionTx`; `COUNCIL_FINALIZE` ngoài `ENABLED_ACTIONS` |
| Không phá luồng cũ / 74 E2E | Đạt | `requireDefense` mặc định false; 14 dòng cũ giữ; test 14 → 20 có lý do đặc tả |
| Migration enum tách riêng | Đạt | `dc_status_enum` chỉ `ADD VALUE` |
| NFR03: RLS bảng mới | Chưa đạt | M6 |
| Bảng việc: cột BM, phụ thuộc | Chưa đạt | M7 |

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| B1 | BLOCKER | `docs/agents/design/API_GD7.md:584`; `docs/agents/BANG_CONG_VIEC.md:147` | Chọn `nodemailer` dòng 7.x (≥ 7.0.7). `npm audit` thật với 7.0.13 (bản cuối 7.x): **high**, 20 advisory chỉ vá ở ≥ 10.1.4 – gồm SMTP command injection, CRLF header injection, bỏ qua kiểm tên miền người nhận (gửi thư tới tên miền kẻ tấn công), DoS addressparser. Thiết kế tự đặt điều kiện "không high/critical" nên DC-04 không thể đạt như đang ghi | Đổi sang `nodemailer` **10.6.0** (ghim chính xác; audit 0 lỗ hổng). Ghi yêu cầu Node ≥ 20 (`engines`) và kiểm Node của Render/CI. Giữ `npm audit --omit=dev` là điều kiện đạt DC-04 |
| M1 | MAJOR | `API_GD7.md:491`, `:494` | Limiter `start` và `callback` 20/15 phút/IP, đếm cả lần thành công. Sinh viên cả phòng máy/ký túc xá chung NAT (lý do `routes.js:18` đã tránh điều này cho đăng nhập mật khẩu bằng `skipSuccessfulRequests`) → người thứ 21 trong 15 phút bị chặn SSO; mỗi lần đăng nhập tốn 2 lượt (start + callback). `trust proxy` = 1 (`app.js:34`), số hop sau Vercel chưa chốt (`LOG_PROXY_HOPS`) – nếu sai, khóa theo IP proxy thành chặn toàn hệ thống | `start`: dùng mức session (300/15 phút/IP); `callback`: `skipSuccessfulRequests: true` (chỉ đếm thất bại). Thêm test: 25 lần SSO thành công cùng IP không bị 429 |
| M2 | MAJOR | `API_GD7.md:241`, `:307`, `:18–19`; `groupService.js:15` | Trạng thái kẹt: đề tài RECRUITING có 1..(minMembers−1) thành viên mà không còn ai ứng tuyển → không ngừng tuyển (`GROUP_NOT_EMPTY`), không chốt (`GROUP_TOO_SMALL`), trưởng nhóm không rời được (`LEADER_CANNOT_LEAVE`, không có người nhận chuyển quyền), không có CANCEL/CLOSE_EXPIRED từ RECRUITING. Đề tài chiếm hạn mức GV và suất đề tài của SV vĩnh viễn | Cho `UNPUBLISH_RECRUITMENT` khi có thành viên: bắt buộc lý do, kết thúc thành viên (`leftAt`) dưới khóa, thông báo; hoặc thêm thao tác GV gỡ thành viên trước chốt. Thêm ca test "1 thành viên, min 2 → ngừng tuyển thành công, SV được giải phóng suất" |
| M3 | MAJOR | `API_GD7.md:287`; test `:316` | Ứng tuyển kiểm RECRUITING rồi `create` không khóa Topic. Ứng tuyển ‖ `FINALIZE_GROUP`/`UNPUBLISH`: updateMany từ chối đơn PENDING chạy trước khi đơn mới commit → đơn PENDING mồ côi trên đề tài HAS_ADVISOR/DRAFT (SV thấy "Đang chờ duyệt" mãi; công bố lại thì đơn cũ sống lại) | Tạo đơn trong `withLockTx`: khóa Topic `FOR SHARE` (xung đột với khóa ghi của chốt/ngừng tuyển), kiểm lại RECRUITING + cùng khoa sau khóa. Thêm test bắt buộc "ứng tuyển ‖ chốt nhóm / ngừng tuyển → không còn đơn PENDING trên đề tài không RECRUITING" |
| M4 | MAJOR | `API_GD7.md:336`, `:343`, `:456`; `feedbackService.js:78` | Quyết định hội đồng bị GVHD ghi đè: sau `COUNCIL_FINALIZE`, cán bộ `RETURN_TO_ADVISOR` → IN_PROGRESS; GVHD `POST /results` (chỉ cần IN_PROGRESS) đổi FAILED của hội đồng thành GOOD rồi `REQUEST_CLOSE`; `requireDefense=false` không chặn, `hasFinalResult` chấp nhận (`createdById` = GVHD). Trái G59/FR37 ("điểm cuối do Hội đồng quyết định"). Ngược lại khi `requireDefense=true`, kết quả COUNCIL Đạt bị `DEFENSE_REQUIRED` → buộc bảo vệ lại chỉ vì trả lại để bổ sung | Quy định rõ: khi phân công mới nhất đã chốt và kết quả hiện hành `source = COUNCIL` thì GVHD không tạo kết quả mới (409) và `REQUEST_CLOSE` được dùng kết quả COUNCIL (không `DEFENSE_REQUIRED`); muốn chấm lại thì `REQUEST_DEFENSE` lại. Thêm 2 test vào §5.6/§7.6 |
| M5 | MAJOR | `API_GD7.md:546`; `packages/shared/src/schemas.js:165` | `awaitingFeedback` = "không có Feedback nào trên bản nộp mới nhất", nhưng `evaluation` của Feedback là **tùy chọn**. GV nhận xét không đánh giá → thẻ rời "Chờ đánh giá" sang "Chưa nộp" dù chưa đánh giá, GV không kéo sang Đạt được (FR38 sai cột) | Định nghĩa: không có Feedback **có `evaluation`** trên `latestDocument`. Test: nhận xét không đánh giá → vẫn `awaitingFeedback: true` |
| M6 | MAJOR | `API_GD7.md:181–209` | 6 bảng mới (`TopicApplication`, `ProcessScore`, `Council`, `CouncilMember`, `CouncilAssignment`, `DefenseScore`) không có `ALTER TABLE … ENABLE ROW LEVEL SECURITY` (NFR03; tiền lệ `20261107000000_fr22_milestone_reopen/migration.sql:26`, `20261108000000_g5_similarity_bypass/migration.sql:26`). Supabase để lộ bảng không RLS qua PostgREST | Thêm vào SQL §2.3 của `dc_recruitment`, `dc_council`; nhắc T203 (`tests/T203-schema.test.js:302`) phải xanh |
| M7 | MAJOR | `BANG_CONG_VIEC.md:144`, `:150`, `:154` | (a) DC-01 (cờ quyền `councilOfficerOnly` trong `checkTransition`, `ENABLED_ACTIONS`) và DC-07 (quyền REQUEST_DEFENSE/RETURN_FROM_DEFENSE, đổi `hasFinalResult` = ai được đóng đề tài, trigger khóa điểm) đụng phân quyền nhưng cột Review chỉ `RV`. (b) DC-11 chỉ phụ thuộc DC-00 nhưng sheet 2 cần `Topic.origin` (DC-05) và `CouncilAssignment` (DC-07) | (a) DC-01, DC-07 → `BM`. (b) DC-11 phụ thuộc `TASK-DC-05, TASK-DC-07` |
| m1 | MINOR | `API_GD7.md:502`; `auth/service.js:112–117` | "Hàm phát hành phiên dùng chung" chưa tồn tại (`issueTokens` nội bộ). Đăng nhập mật khẩu cấp token dưới khóa SHARE User và đọc lại `isLocked` | Ghi rõ SSO cấp phiên trong tx: `lockUser` + đọc lại `isLocked`/`lockedUntil`; test khóa tài khoản ‖ callback |
| m2 | MINOR | `API_GD7.md:494` | Google trả `?error=access_denied` khi người dùng hủy: chưa có mã `sso_error`; query callback chưa có schema Zod | Thêm mã (vd. `CANCELLED`) + `ssoCallbackQuerySchema` (giới hạn độ dài `code`, `state`) |
| m3 | MINOR | `API_GD7.md:491`, `:493` | `next` ghi vào cookie không giới hạn độ dài → cookie > 4 KB làm hỏng Set-Cookie | Server cắt/kiểm `next` (≤ 512, bắt đầu `/`, không `//`), sai thì bỏ |
| m4 | MINOR | `API_GD7.md:485`, `:499` | `GOOGLE_ALLOWED_DOMAIN` một giá trị; nếu SV và GV khác tên miền email thì một nhóm không đăng nhập được. `PUBLIC_APP_URL` chưa ràng buộc | Xác nhận với chủ dự án; nếu cần, danh sách tên miền. Zod `url()`, `https` ở production |
| m5 | MINOR | `API_GD7.md:500–502` | ADMIN đăng nhập được bằng SSO: chiếm hộp thư Google = chiếm quyền quản trị, bỏ qua Argon2 + TEMP_LOCKED | Cân nhắc chỉ cho STUDENT/LECTURER/STAFF (ADMIN giữ mật khẩu); hoặc ghi giả định |
| m6 | MINOR | `API_GD7.md:522–530`; `schema.prisma:538` | (a) Tiêu đề thư chứa tên đề tài do SV nhập – yêu cầu loại CR/LF/ký tự điều khiển khỏi subject + test. (b) `Notification.link` nullable → "…null" trong thư. (c) Dòng `SENDING` quá hạn với `emailAttempts = 3` không bao giờ sang `FAILED`. (d) "Không gửi trùng" thực tế là "ít nhất một lần" (sập giữa gửi và đánh dấu SENT → gửi lại sau 15 phút) | Bổ sung 4 điểm vào §9.2–§9.4 |
| m7 | MINOR | `API_GD7.md:585` | `exceljs` 4.4.0 kéo `uuid` < 11.1.1 (GHSA-w5hq-g745-h8pq, moderate; chỉ v3/v5/v6 có `buf`, exceljs dùng v4 – không khai thác được). Gói ít bảo trì | Ghi vào báo cáo DC-11; điều kiện "không high/critical" vẫn đạt |
| m8 | MINOR | `API_GD7.md:552` | Cột "Điểm bảo vệ" điền cho đề tài chưa CLOSED, trong khi cột "Kết quả" chỉ CLOSED (G27) | Chỉ điền khi CLOSED, hoặc ghi giả định |
| m9 | MINOR | `API_GD7.md:249`, `:314`, `:355` | Thiếu test tranh chấp chéo luồng cũ/mới: PUBLISH ‖ ACCEPT_ADVISING/duyệt FR19 (hạn mức GV); duyệt đơn ‖ REQUEST_ADVISOR (FR03); RETURN_FROM_DEFENSE ‖ finalize. Thiết kế khóa User `FOR NO KEY UPDATE` như `advisorRepo.js:13` là đúng, chỉ thiếu test | Thêm 3 ca vào §3.5/§4.6/§7.6 |
| m10 | MINOR | `API_GD7.md:49`, `:410` | `isCouncilMember` gồm cả phân công đã chốt → thành viên hội đồng đọc đề tài, tài liệu vĩnh viễn. Test §6.6 #7 "mọi endpoint ghi khác 403" mơ hồ | Ghi giả định (hoặc giới hạn đến CLOSED); liệt kê endpoint ghi phải 403 (PUT đề tài, actions, upload, feedbacks, milestones, results, change-requests, similarity-checks) |
| m11 | MINOR | `API_GD7.md:36` | RECRUITING ẩn tên với SV trong kho so FR06 nhưng tên/tóm tắt công khai trên bảng tin – không lộ thêm nhưng thiếu nhất quán | Ghi lý do hoặc cho hiện tên đề tài RECRUITING |
| m12 | MINOR | `API_GD7.md:33–39` | Mới: Advising tồn tại ở DRAFT/RECRUITING (trước đây Advising ⇔ ≥ HAS_ADVISOR). Có thể có chỗ giả định cũ (thống kê G29, `listService` GV, `notifyTopic` 'advisor', FR19) | Thêm vào bảng §0.1: grep `advisings`/`endAt: null` và rà |

Tổng: 1 BLOCKER, 7 MAJOR, 12 MINOR.

Đã xác nhận đúng (không cần sửa): PKCE S256 + `state`/`nonce` so hằng thời gian; khóa dẫn xuất cho `nckh_oauth`; cookie SameSite=Lax gửi được ở callback điều hướng cấp trên cùng; không tự tạo tài khoản (G54); `mustChangePassword` vẫn bị `middlewares/auth.js:26` chặn sau SSO; không đổi CSP; outbox gửi ngoài transaction, SKIP LOCKED, chỉ title + link, escape HTML; thứ tự khóa Council → Topic → User; trigger chỉ-thêm/khóa điểm; index `council_assignment_one_open`, `application_one_active` (`WITHDRAWN` đã có trong `RequestStatus`); xung đột lợi ích kiểm ở gán và đổi thành viên, GVHD không đổi được ở WAITING_DEFENSE (`ADVISOR_CHANGE_STATUSES`); ủy viên không thấy điểm người khác trước chốt; Kanban không có endpoint/quyền riêng; xlsx ô chuỗi, `statsWhere` dùng chung, chỉ ghi không đọc xlsx; `requireDefense` mặc định tắt; migration enum tách riêng.
