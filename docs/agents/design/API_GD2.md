# API_GD2 – Hợp đồng API giai đoạn 2

- Task: T200 · FR02–FR08, FR16, FR17, FR25 · NFR02, NFR05, NFR06 · Người soạn: kien-truc-su · Ngày: 2026-11-01
- Trạng thái: **ĐỀ XUẤT – vòng sửa 2** (chờ RV, FE, BE duyệt lại). G1, G2, G3, G11–G14 đã được người dùng xác nhận ngày 2026-11-01 (`CAU_HOI.md` #2–#6).
- Nguồn: `docs/DAC_TA.md` (mục 2, 3, 4, 5, 8), `design/QD_ZOD.md` (§4, §5 bắt buộc), code hiện có: `packages/shared/src/*`, `apps/api/src/{app.js, lib/errors.js, middlewares/*, modules/auth, modules/topics, modules/similarity}`, `apps/api/prisma/{schema.prisma, sql/after_init.sql}`.
- Hiện thực, theo thứ tự phụ thuộc trên bảng việc:
  - T203: thay đổi schema/SQL (§11b).
  - T206: §4, `requirePasswordChanged`, `staffFacultyIds`, sửa `errors.js`/`errorHandler` (§11c).
  - T207a: §3 trừ nhập CSV. T207b: nhập CSV (§3.2 `import/*`), hằng `USER_IMPORT_*`, chuyển `csv.js` sang shared.
  - T209: §5.1–5.2. Tạo đề tài và dựng `TopicDetail`.
  - T208: §5.3–5.4, helper `withLockTx` (§1.8) và **kiểm sớm** giới hạn đề tài/SV khi chấp nhận lời mời (phụ thuộc T209).
  - T210: §6, **quy trình chính thức** §5.5 cho `REQUEST_ADVISOR`, đưa `applyTransition` qua `withLockTx` (§1.8) (phụ thuộc T208).
  - T211: §7.
  - T212a: §8.1–8.3 (gửi, gửi lại, `skipSimilarity`, quyết định). T212b: §8.4 (đọc snapshot, diff, lịch sử).
  - T213: §9.
  - T214: test theo tài liệu này.

Chỗ nào ghi **"Giả định – chờ khoa xác nhận"** là giá trị/hành vi mặc định, code phải đọc từ cấu hình đợt (nếu là tham số) để đổi không cần sửa code.

---

## 1. Quy ước chung

### 1.1 Đường dẫn, xác thực, vai trò
- Tiền tố `/api`. JSON UTF-8. Endpoint auth (`/api/auth/*`) đã có từ GĐ1, giữ nguyên: `POST login`, `POST refresh`, `POST logout`, `POST change-password`, `GET me`.
- **Bổ sung vào `user` của `login`, `refresh`, `me`** (chỉ thêm trường, không phá GĐ1): `staffFacultyIds: string[]` – danh sách khoa trong `StaffScope` khi role STAFF, `[]` với vai trò khác. Thêm vào `publicUser`. Repo `findUserById`/`findUserByIdentifier` nạp kèm `staffScopes`. T206 làm; T205 giữ repo Prisma trả `staffScopes`. Frontend dùng để chỉ cho chọn khoa trong phạm vi (form đợt, nhập CSV, lọc người dùng).
- **Web gọi API cùng origin** (quyết định kiến trúc, review FE vòng 2): frontend luôn gọi đường dẫn tương đối `/api/*`; Vercel rewrite `/api/*` sang API trên Render (T706, `vercel.json`); dev dùng proxy của Vite. Lý do: `*.vercel.app` và `*.onrender.com` là hai site khác nhau, nên cookie `nckh_rt` (`sameSite: 'lax'`) sẽ không được gửi kèm `POST /api/auth/refresh`, và JS không đọc được `Retry-After`/`RateLimit-*` khi khác origin (`cors` không có `exposedHeaders`). Cùng origin giải quyết cả hai mà không đổi backend. Nếu sau này buộc phải khác origin thì cần `exposedHeaders: ['Retry-After', 'RateLimit-Policy', 'RateLimit']` và cookie `sameSite: 'none'` + `secure` (phải qua review `bao-mat`).
- **Refresh không chịu được gọi đồng thời**: refresh xoay vòng token, nên hai lần refresh song song bằng cùng cookie sẽ bị coi là dùng lại token và cả họ phiên bị thu hồi. Client phải tuần tự hóa: một promise dùng chung trong tab, `navigator.locks` giữa các tab. Backend không đổi.
- Mọi endpoint dưới đây (trừ khi ghi khác) yêu cầu `Authorization: Bearer <accessToken>`.
- Vai trò: `ADMIN`, `STAFF` (cán bộ khoa), `LECTURER`, `STUDENT` (`packages/shared/src/enums.js`).
- **ADMIN chỉ có quyền nền tảng** (tài khoản, danh mục khoa/ngành/lớp/lĩnh vực). Mọi endpoint nghiệp vụ đề tài/nhóm/đợt/xét duyệt trả **403 `FORBIDDEN`** cho ADMIN (FR25).
- **Phạm vi khoa của STAFF** = tập `facultyId` trong `StaffScope` của người đó. Ký hiệu trong tài liệu: `inScope(facultyId)`.
- **Quan hệ với đề tài** (service tính từ DB, không tin client):
  - `isMember`: có `TopicMember` với `leftAt IS NULL`.
  - `isLeader`: `isMember` và `role = LEADER`.
  - `isRequestedLecturer`: có `AdvisorRequest` `PENDING` của đề tài với `lecturerId = me`.
  - `isCurrentAdvisor`: có `Advising` của đề tài với `lecturerId = me` và `endAt IS NULL`.
  - `inStaffScope`: role STAFF và `inScope(topic.facultyId)`.

### 1.2 Thứ tự middleware (bắt buộc)
- JSON: `requireAuth` → `requirePasswordChanged` → [limiter] → `requireRole(...)` → `validate(schema[, 'query'])` → handler (service kiểm quan hệ với đề tài và điều kiện nghiệp vụ).
- Multipart (chỉ nhập CSV ở GĐ2): `requireAuth` → `requirePasswordChanged` → limiter → `requireRole` + kiểm phạm vi **chỉ từ tham số URL/query** → multer (bọc theo QD §4.2) → kiểm nội dung file (QD §4.3.6) → `validate` → handler. Người chưa đăng nhập/ngoài phạm vi bị 401/403 **trước khi** file được đọc.
- **Mới – `requirePasswordChanged`** (FR02 "sau reset phải đổi mật khẩu ở lần đăng nhập đầu"): nếu `req.user.mustChangePassword === true` thì 403 `PASSWORD_CHANGE_REQUIRED`. **T206** hiện thực trong `apps/api/src/middlewares/auth.js`. Mỗi router nghiệp vụ nhận `guard = [requireAuth, requirePasswordChanged]` và tạo qua `businessRouter(guard)` (`lib/router.js`): guard là câu đầu của router nên không thể quên; router mount ở tiền tố riêng `/api/<tiền tố>` nên đường dẫn lạ chưa đăng nhập vẫn 404 (test GĐ1). Test T206 kiểm mọi tiền tố 401/403 và cấm `routes.js` (trừ auth) tự tạo `Router`. Test 403 thuộc T206. Không cần đổi `requireAuth`, vì `publicUser` đã có `mustChangePassword` và user được nạp lại mỗi request. Vì vậy hai bước đầu của chuỗi dưới đây đã chạy sẵn ở mức app.
- Limiter chỉ tạo qua `createLimiter` (QD §4.2), không gọi `rateLimit()` trực tiếp.

### 1.3 Định dạng phản hồi
- Một tài nguyên: bọc theo tên, giống `/api/auth/me` → `{ "topic": {...} }`, `{ "user": {...} }`.
- Danh sách: `{ "items": [...], "page": 1, "pageSize": 20, "total": 57 }`. `page` vượt quá → `items: []`.
- Thời gian trả về dạng ISO 8601 UTC (`"2026-11-01T02:00:00.000Z"`). Frontend hiển thị theo `Asia/Ho_Chi_Minh`.
- Không trả nhãn tiếng Việt của enum; frontend dùng `TOPIC_STATUS_LABEL`, `FINAL_RESULT_LABEL`.
- Thao tác không có nội dung trả về: `204`.
- Lỗi (định dạng hiện có của `errorHandler`): `{ "error": { "code": "…", "message": "…tiếng Việt…", "details": … } }`. Không bao giờ có stack trace.
- **Quy ước `details`** (để frontend viết một bộ ánh xạ lỗi dùng chung):
  - (a) **Map trường** `{ "đường.dẫn": "thông điệp" }`:
    - Khóa là đường dẫn trong **request** nối bằng dấu chấm, ví dụ `keywords.2`, `config.similarity.titleHigh`.
    - Khóa `_` là lỗi cấp form (refine ở gốc).
    - Tối đa 50 mục (QD §4.5).
    - Chỉ dùng cho `VALIDATION_ERROR`, `TOPIC_INCOMPLETE` và `DUPLICATE`. Với `DUPLICATE`, khóa là **tên trường trong request** (`code`, `email`), không phải tên cột hay constraint của Prisma.
  - (b) **Dạng riêng**, ghi ở bảng §2:
    - `STUDENT_TOPIC_LIMIT` → `{ codes }`.
    - `SIMILARITY_NOT_CHECKED`, `JUSTIFICATION_REQUIRED` → `{ similarityCheck }`.
    - `IMPORT_HAS_ERRORS` → dạng response preview CSV.
  - (c) Các mã còn lại không có `details`.

### 1.4 Thời gian và hạn (NFR06)
- Mọi so sánh hạn dùng **giờ server** (`now()` tiêm vào service để test). Không endpoint nào nhận thời điểm "hiện tại" từ client.
- Mốc thời gian client gửi lên (mốc của đợt) phải là chuỗi ISO **có offset** (`2026-12-01T00:00:00+07:00`), lưu `timestamptz`.
- "Trong thời gian mở đăng ký" = `round.regOpenAt <= now < round.regCloseAt`.

### 1.5 Khóa lạc quan
- `Topic.version` có trong mọi response đề tài. Mọi thao tác ghi lên đề tài do người dùng gửi (sửa nháp, chuyển trạng thái, đổi trưởng nhóm) đều kèm `version`. Lệch → 409 `CONCURRENT_UPDATE`.
- Các thao tác **tăng `version`**:
  - chuyển trạng thái (đã có trong `applyTransition`);
  - sửa nháp;
  - đổi trưởng nhóm;
  - **chấp nhận lời mời**, vì đổi tập thành viên. Nhờ vậy màn của trưởng nhóm đang mở bản cũ sẽ nhận 409 và tải lại danh sách thành viên trước khi gửi đề nghị GVHD.
- Từ chối hoặc hủy lời mời không đổi thành viên nên không tăng `version`.
- Bảo đảm về giới hạn không dựa vào `version` mà dựa vào khóa dòng (§5.5).

### 1.6 Transaction và lịch sử (NFR05, FR15)
- Mọi chuyển trạng thái đi qua `checkTransition` + `applyTransition` (`apps/api/src/modules/topics/stateMachine.js`): một transaction, ghi `StatusHistory`. Bảng ở §10.
- Thao tác ghi khác ghi `AuditLog` (`actorId`, `action`, `entityType`, `entityId`, `before`, `after`, `ip`) **trong cùng transaction**. Cột "Ghi" trong từng endpoint liệt kê. `before/after` chỉ gồm trường quan trọng; **không bao giờ** chứa mật khẩu, hash, token.

### 1.7 Phân trang và query (QD §5.10)
- `page`: `z.coerce.number().int().min(1).max(10000).default(1)`; `pageSize`: `z.coerce.number().int().min(1).max(100).default(20)`.
- Trường đơn: `z.string().max(n)` (khóa lặp → 400). Bộ lọc enum: `z.enum`. Tìm kiếm `q`: `.trim().max(200)`.

### 1.8 Khóa dòng (dùng ở §5.3–5.5, §6)
- Khóa User dùng `SELECT id FROM "User" WHERE id IN (…) ORDER BY id FOR NO KEY UPDATE`. Kiểu khóa này vẫn tuần tự hóa các transaction cùng khóa, nhưng **không** chặn các lệnh chèn có FK tới user (đăng nhập tạo `RefreshToken`…). `FOR UPDATE` sẽ chặn thừa những lệnh đó.
- Khóa Topic: cũng ở mức **NO KEY UPDATE**, cùng lý do (không chặn thừa các insert có FK tới Topic như `SimilarityCheck` của "Kiểm tra trước", `StatusHistory`, `Invitation`). Một trong hai cách:
  - `updateMany` có điều kiện trên Topic (ví dụ của `applyTransition`, đổi trưởng nhóm, chấp nhận lời mời). UPDATE không đổi cột khóa lấy khóa NO KEY UPDATE trên dòng;
  - `SELECT id, status FROM "Topic" WHERE id = $1 FOR NO KEY UPDATE` khi không cần ghi Topic (tạo lời mời).
  Hai khóa NO KEY UPDATE loại trừ nhau, nên các luồng trên vẫn tuần tự hóa với nhau.
- Thứ tự khóa luôn là **Topic → User**, và User theo id tăng dần.
- **Đếm và đọc trạng thái bằng câu lệnh riêng, sau câu khóa.** Ở READ COMMITTED, mỗi câu lệnh mới lấy snapshot mới nên thấy được bản ghi vừa commit.
- **Thời gian chờ khóa – helper `withLockTx(prisma, fn)`** (`apps/api/src/lib/tx.js`; T208 tạo vì là task đầu tiên khóa Topic; T210 đưa `applyTransition` qua helper này):
  ```js
  export const LOCK_TIMEOUT = '3s';
  export const LOCK_TX_OPTIONS = { timeout: 15000, maxWait: 5000 };
  export const withLockTx = (prisma, fn) => prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('lock_timeout', ${LOCK_TIMEOUT}, true)`; // câu ĐẦU TIÊN, trước mọi câu lấy khóa
    return fn(tx);
  }, LOCK_TX_OPTIONS);
  ```
  - `set_config(…, true)` tương đương `SET LOCAL` nhưng nhận tham số bind (`SET` thì không). Chỉ có hiệu lực trong transaction nên không rò sang phiên khác của pooler.
  - **Quy tắc: `lock_timeout` < `timeout` của transaction.** Nếu bằng hoặc lớn hơn, bộ đếm của Prisma (tính từ đầu transaction) hết trước, lỗi thành `P2028` thay vì `55P03`. 3 s chờ khóa cho phép vài câu khóa nối tiếp mà vẫn dưới 15 s.
  - Mọi transaction có khóa ở §5.3, §5.4, §5.5, §6 chạy qua `withLockTx`. `applyTransition` đổi `prisma.$transaction(fn)` thành `withLockTx(prisma, fn)`, để `lock_timeout` có hiệu lực **trước** `updateMany` (câu lấy khóa Topic, tranh chấp nhiều nhất ở REQUEST_ADVISOR và ACCEPT_ADVISING). Đặt trong `extra` là quá muộn.
- **Lỗi khi hết thời gian/tranh chấp → 409 `CONCURRENT_UPDATE`**; **`P2028` (transaction hết hạn/hết `maxWait`) → 503 `SERVICE_BUSY`** kèm `logger.warn` (reviewer T200 v3 MINOR 1; errorHandler, T206). Prisma trả các dạng 409 sau, phải nhận đủ:
  - `PrismaClientKnownRequestError` `P2010` với `meta.code === '55P03'` (từ `$queryRaw`/`$executeRaw`);
  - `P2034` (deadlock, xung đột ghi);
  - dự phòng: lỗi Prisma (kể cả `PrismaClientUnknownRequestError`, không có `code`) có `message` chứa `55P03` hoặc `lock timeout` – dạng lỗi của truy vấn thường như `updateMany` khi hết `lock_timeout` chưa xác minh được.
  - Dữ liệu an toàn vì transaction đã rollback; client tải lại rồi thử lại.
  - Test: T206 unit test errorHandler với lỗi giả cho từng dạng trên. T210 integration test **trên DB thật** (không mock được hình dạng lỗi): tx A giữ khóa một Topic, tx B `applyTransition` cùng Topic nhận 409 `CONCURRENT_UPDATE` sau ~3 s, không phải 500.

---

## 2. Mã lỗi chuẩn

Thông điệp là mặc định; service có thể cụ thể hơn nhưng giữ `code`.

| HTTP | `code` | Thông điệp mặc định | Khi nào |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | Dữ liệu không hợp lệ | Schema Zod sai; lỗi multer không phải quá cỡ; nội dung file sai loại ("Loại file không được hỗ trợ") |
| 400 | `BAD_JSON` | JSON không hợp lệ | Đã có |
| 400 | `BAD_REQUEST` | Yêu cầu không hợp lệ | Đã có (BUG-001): lỗi 4xx có `expose` của body-parser/http-errors, ví dụ gzip hỏng, body bị cắt cụt |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Định dạng dữ liệu gửi lên không được hỗ trợ | Đã có (BUG-001): `content-encoding`/`charset` lạ |
| 400 | `TOPIC_INCOMPLETE` | Hồ sơ chưa đủ thông tin bắt buộc | `topicSubmitSchema(cfg)` không đạt khi gọi `/actions` (REQUEST_ADVISOR, SUBMIT_FOR_REVIEW, RESUBMIT). `details` là map trường `title/summary/objectives/keywords/fieldId`. UI hiện nút "Sửa hồ sơ". Tách khỏi `VALIDATION_ERROR` (lỗi body của action, ví dụ `reason`) |
| 400 | `WRONG_PASSWORD` | Mật khẩu hiện tại không đúng | Đã có (`change-password`) → ô `currentPassword` |
| 400 | `SAME_PASSWORD` | Mật khẩu mới phải khác mật khẩu cũ | Đã có (`change-password`) → ô `newPassword` |
| 400 | `UNKNOWN_ACTION` | Thao tác không tồn tại | Đã có trong `checkTransition` (phòng thủ; schema đã chặn trước) |
| 400 | `REASON_REQUIRED` | Thao tác này bắt buộc nhập lý do | Đã có (phòng thủ) |
| 400 | `JUSTIFICATION_REQUIRED` | Hồ sơ nghi trùng cao, cần giải trình tối thiểu N từ | FR06 mức HIGH, giải trình < `similarity.minJustificationWords` |
| 400 | `IMPORT_HAS_ERRORS` | File có dòng lỗi, chưa ghi dữ liệu nào | Xác nhận nhập CSV còn lỗi |
| 401 | `UNAUTHORIZED` | Phiên đăng nhập không hợp lệ | Đã có |
| 403 | `FORBIDDEN` | Bạn không có quyền thực hiện thao tác này | Sai vai trò, ngoài phạm vi khoa, không có quan hệ với đề tài, ADMIN gọi API nghiệp vụ |
| 403 | `ACCOUNT_LOCKED` | Tài khoản đã bị khóa | Đã có (login) |
| 403 | `PASSWORD_CHANGE_REQUIRED` | Bạn cần đổi mật khẩu trước khi tiếp tục | Mới, §1.2 |
| 404 | `NOT_FOUND` | Không tìm thấy | ID không tồn tại |
| 409 | `INVALID_TRANSITION` | Không thể thực hiện thao tác này khi đề tài đang ở trạng thái hiện tại | Đã có |
| 409 | `CONCURRENT_UPDATE` | Dữ liệu vừa được người khác cập nhật, vui lòng tải lại | Đã có; lệch `version`; hết thời gian chờ khóa (`55P03`), deadlock/xung đột ghi (`P2034`) (§1.8) |
| 409 | `SIMILARITY_NOT_CHECKED` | Chưa kiểm tra được trùng lặp, vui lòng thử lại | Đã có; FR06 lỗi |
| 409 | `TOPIC_NOT_EDITABLE` | Chỉ sửa được hồ sơ ở trạng thái Nháp hoặc Cần chỉnh sửa | FR05 |
| 409 | `REGISTRATION_CLOSED` | Ngoài thời gian đăng ký của đợt | FR05, FR16.5 |
| 409 | `GROUP_TOO_SMALL` | Nhóm chưa đủ số thành viên tối thiểu (N) | FR03 |
| 409 | `GROUP_FULL` | Nhóm đã đủ số thành viên tối đa (N) | FR03 |
| 409 | `STUDENT_TOPIC_LIMIT` | Sinh viên đã đạt số đề tài hoạt động tối đa trong đợt | FR03; `details: { codes: [mã SV] }` |
| 409 | `LECTURER_QUOTA_EXCEEDED` | Giảng viên đã đủ hạn mức hướng dẫn trong đợt | FR16 |
| 409 | `ALREADY_MEMBER` | Sinh viên đã là thành viên hoặc đã được mời | FR03 |
| 409 | `INVITATION_CLOSED` | Lời mời không còn hiệu lực | Lời mời không còn `PENDING` hoặc đề tài đã rời Nháp |
| 409 | `STALE_SUBMISSION` | Quyết định phải gắn với lần gửi mới nhất chưa được xử lý | FR07, FR17 |
| 409 | `DUPLICATE` | Dữ liệu đã tồn tại | Trùng unique (mã, email, mã danh mục); `details: { trường: 'Đã tồn tại' }`. Bắt Prisma `P2002` |
| 409 | `IMPORT_IN_PROGRESS` | Đang có lượt nhập khác, vui lòng thử lại sau | QD §4.4.5 |
| 413 | `PAYLOAD_TOO_LARGE` | Dữ liệu gửi lên quá lớn / File vượt quá dung lượng cho phép | QD §4.2 |
| 429 | `RATE_LIMITED` | Thao tác quá nhiều lần, vui lòng thử lại sau | QD §4.2, §4.6. Factory `createLimiter` giữ `standardHeaders`, nên response có header `RateLimit-*` và `Retry-After` (giây). Frontend hiện "thử lại sau N phút"; không có header thì chỉ hiện thông điệp. T215 xác minh header |
| 429 | `TEMP_LOCKED` | Đăng nhập sai quá nhiều lần, vui lòng thử lại sau | Đã có |
| 503 | `SERVICE_BUSY` | Hệ thống đang bận, vui lòng thử lại sau | Prisma `P2028`: transaction hết hạn / hết `maxWait` (quá tải, không phải xung đột dữ liệu; đã rollback). `errorHandler` ghi `logger.warn`. Client thử lại như 409 |
| 500 | `INTERNAL` | Lỗi hệ thống, vui lòng thử lại | Đã có, kèm `requestId` |

Quy ước 403 hay 404: ID không tồn tại → 404; tồn tại nhưng ngoài phạm vi → 403 (khớp ca test "người ngoài nhận 403", NFR02). ID là cuid nên không dò được. Quyền xem được kiểm **trước** mọi điều kiện trạng thái, nên người ngoài luôn nhận 403, không nhận 409 (§8.1).

Lỗi http-errors 4xx khác 400/415 (ví dụ 403/404): **giữ `BAD_REQUEST`** như BUG-001. Lý do: hiện chỉ body-parser sinh loại lỗi này, và mọi 403/404 của ứng dụng đi qua `AppError` với mã `FORBIDDEN`/`NOT_FOUND`. Quy tắc cho sau này: khi thêm middleware bên thứ ba có thể ném 4xx khác, ánh xạ theo status trong `errorHandler`: 401 → `UNAUTHORIZED`, 403 → `FORBIDDEN`, 404 → `NOT_FOUND`, 429 → `RATE_LIMITED`, các status còn lại → `BAD_REQUEST`. Task nào thêm middleware đó thì làm.

---

## 3. Tài khoản – FR02, FR25 (T207a; nhập CSV: T207b)

### 3.1 Ma trận quyền
| Thao tác | ADMIN | STAFF | LECTURER/STUDENT |
|---|---|---|---|
| Xem, tạo, sửa, khóa/mở, reset tài khoản ADMIN/STAFF | Có | Không | Không |
| Như trên với LECTURER/STUDENT | Có (mọi khoa) | Chỉ `inScope(user.facultyId)` | Không |
| Gán phạm vi khoa cho STAFF | Có | Không | Không |
| Nhập CSV | Có | Chỉ khoa trong phạm vi | Không |

- **Không ai tự nâng quyền**: không có endpoint đổi `role`; `role` chỉ đặt lúc tạo. STAFF chỉ tạo được `LECTURER`, `STUDENT`. Không tự khóa, tự reset tài khoản của mình qua các endpoint này (403). Không có tự đăng ký.
- Mật khẩu tạm theo QD §4.4.7: `crypto`, ≥ 12 ký tự có chữ và số, chỉ lưu hash, `mustChangePassword: true`, trả **một lần**, header `Cache-Control: no-store`, không ghi log/AuditLog.

### 3.2 Endpoint

**`GET /api/users`** – ADMIN, STAFF.
Query `userListQuerySchema`: `role?` enum ROLES, `facultyId?` (≤64), `classId?` (≤64), `isLocked?` enum `'true'|'false'`, `q?` (≤200, khớp mã/email/họ tên, không dấu bằng `immutable_unaccent` trong raw SQL; bảng nhỏ nên không cần index), `page`, `pageSize`.
Phạm vi: STAFF chỉ thấy `role ∈ {LECTURER, STUDENT}` và `facultyId` trong phạm vi; lọc `facultyId` ngoài phạm vi → 403.
```json
{ "items": [{ "id": "c1", "code": "SV001", "email": "sv001@st.edu.vn", "fullName": "Nguyễn Văn A",
  "role": "STUDENT", "facultyId": "f1", "classId": "cl1", "isLocked": false, "mustChangePassword": true,
  "staffFacultyIds": [], "createdAt": "2026-11-01T02:00:00.000Z" }], "page": 1, "pageSize": 20, "total": 1 }
```
Không bao giờ trả `passwordHash`, `failedLogins`, `lockedUntil`. `staffFacultyIds` có giá trị với STAFF, `[]` với vai trò khác. Đối tượng này gọi là `UserView`, dùng cho mọi response `{ user }` của §3.

**`GET /api/users/:id`** – ADMIN, STAFF (quyền xem theo §3.1). 200 `{ "user": UserView }`. Form "phạm vi khoa" của ADMIN điền sẵn từ `user.staffFacultyIds`. Bắt buộc phải điền sẵn, vì `PUT staff-scopes` thay toàn bộ phạm vi; gửi form trống sẽ xóa mất phạm vi cũ. Lỗi: 403, 404.

**`POST /api/users`** – ADMIN, STAFF · limiter 30/15 phút/`req.user.id` · transaction · Ghi AuditLog `USER_CREATE` (+ `STAFF_SCOPE_SET` nếu STAFF).
Body `userCreateSchema`: `code` (trim, 1..64, regex `^[A-Za-z0-9._-]+$`), `email` (trim, lowercase, ≤254, email), `fullName` (trim, 1..300), `role` enum ROLES, `facultyId` (≤64; bắt buộc trừ ADMIN), `classId?` (≤64; bắt buộc nếu STUDENT, lớp phải thuộc ngành của khoa `facultyId` và `isActive`), `staffFacultyIds?` (mảng ≤20 ID; bắt buộc ≥1 nếu STAFF).
Kiểm: quyền theo §3.1; danh mục tham chiếu phải `isActive` (nếu không → 400 `VALIDATION_ERROR` tại trường đó).
201:
```json
{ "user": { "id": "c9", "code": "SV101", "...": "..." }, "temporaryPassword": "k3V9qTzr2mWx" }
```
Lỗi: 400 `VALIDATION_ERROR`, 403 `FORBIDDEN`, 409 `DUPLICATE` (`code`/`email`), 429.

**`PATCH /api/users/:id`** – ADMIN, STAFF (theo §3.1) · Ghi AuditLog `USER_UPDATE` (before/after `email`, `fullName`, `classId`, `facultyId`).
Body `userUpdateSchema` (mọi trường tùy chọn, ít nhất 1): `email`, `fullName`, `classId`, `facultyId` (chỉ ADMIN; STAFF gửi → 403). Không có `code`, `role`, `password`.
200 `{ "user": {...} }`. Lỗi: 400, 403, 404, 409 `DUPLICATE`.

**`POST /api/users/:id/lock`**, **`POST /api/users/:id/unlock`** – ADMIN, STAFF (theo §3.1) · transaction · Ghi AuditLog `USER_LOCK`/`USER_UNLOCK`.
Body rỗng. Khóa: `isLocked = true` và thu hồi mọi refresh token (`revokedAt = now`). Mở: `isLocked = false`, `failedLogins = 0`, `lockedUntil = null`. Tự khóa mình → 403.
200 `{ "user": {...} }`.

**`POST /api/users/:id/reset-password`** – ADMIN, STAFF (theo §3.1) · limiter 30/15 phút (chung với tạo) · transaction · Ghi AuditLog `USER_RESET_PASSWORD` (không có mật khẩu).
Body rỗng. Đặt hash mới, `mustChangePassword = true`, `failedLogins = 0`, `lockedUntil = null`, thu hồi mọi refresh token. Băm **trước** transaction.
200 `{ "temporaryPassword": "…" }` + `Cache-Control: no-store`.

**`PUT /api/users/:id/staff-scopes`** – ADMIN · transaction (xóa + tạo `StaffScope`) · Ghi AuditLog `STAFF_SCOPE_SET` (before/after danh sách khoa).
Body `staffScopesSchema`: `{ facultyIds: string(≤64)[] (1..20) }`. User đích phải là STAFF (không thì 400).
200 `{ "user": UserView }` (`staffFacultyIds` là phạm vi mới). Thay đổi phạm vi có hiệu lực ngay ở request kế tiếp của cán bộ đó, vì user được nạp lại mỗi request.

**`POST /api/users/import/preview?facultyId=…`** (T207b) – ADMIN, STAFF (`inScope(facultyId)`, kiểm trước multer) · limiter 10/15 phút · multipart, field `file`, multer giới hạn QD §4.3.4 (1 MB) · không ghi DB.
Định dạng CSV: UTF-8 (BOM tùy chọn), dòng đầu là tiêu đề đúng `USER_IMPORT_HEADERS` = `code,email,fullName,role,classCode`. Tối đa `USER_IMPORT_MAX_ROWS` = 2.000 dòng dữ liệu (vượt → 400 ngay). File tối đa `USER_IMPORT_MAX_BYTES` = 1 MB. Ba hằng này export từ shared (§11); backend và frontend dùng chung để kiểm trước khi upload và tạo file mẫu.
Lỗi cấp file (sai loại, sai tiêu đề, quá số dòng, rỗng) → 400 `VALIDATION_ERROR`, `details: { "file": "…" }`. Mỗi dòng parse bằng `userImportRowSchema` (`role` chỉ `STUDENT|LECTURER`; `classCode` bắt buộc với STUDENT, phải là lớp `isActive` thuộc khoa). Kiểm thêm: trùng mã/email trong file, trùng với DB.
200:
```json
{ "validCount": 38, "errorCount": 2,
  "errors": [{ "row": 5, "field": "email", "message": "Email đã tồn tại" }],
  "preview": [{ "row": 2, "code": "SV101", "email": "sv101@st.edu.vn", "fullName": "Trần B", "role": "STUDENT", "classCode": "CNTT-K20A" }] }
```
`errors`, `preview` mỗi mảng ≤ 100 mục; `errorCount`, `validCount` là tổng thật. `row` tính cả dòng tiêu đề (dòng dữ liệu đầu là 2). `errors[].field: string | null`: `null` là lỗi cả dòng (sai số cột, dòng trùng hoàn toàn trong file).
Lỗi: 400 `VALIDATION_ERROR` (file sai loại, sai tiêu đề, > 2.000 dòng), 403, 413 `PAYLOAD_TOO_LARGE`, 429.

**`POST /api/users/import/confirm?facultyId=…`** – như preview; thêm `importLock` (QD §4.4.5).
Gửi lại **cùng file**. Server kiểm lại toàn bộ từ đầu, không tin kết quả xem trước.
- Còn bất kỳ lỗi nào → 400 `IMPORT_HAS_ERRORS`, `details` giống response preview; **không ghi gì** (tất cả hoặc không – Giả định, lý do: FR02 "chỉ ghi khi người dùng xác nhận" và tránh nhập dở).
- Hợp lệ hết → băm mật khẩu tạm trước transaction (≤ 2 phép song song). Sau đó ghi tất cả user + AuditLog `USER_CREATE` từng user trong **một** transaction:
  - user ghi bằng `createManyAndReturn` (Prisma ≥ 5.14) để có `id` làm `entityId`;
  - AuditLog ghi bằng `createMany`;
  - transaction đặt `{ timeout: 20000, maxWait: 5000 }`, vì mặc định 5 s không đủ cho 2.000 dòng qua pooler.
  
  Va chạm unique do người khác tạo cùng lúc → rollback, 409 `DUPLICATE`.
200 + `Cache-Control: no-store`:
```json
{ "createdCount": 40, "credentials": [{ "code": "SV101", "email": "sv101@st.edu.vn", "fullName": "Trần B", "temporaryPassword": "…" }] }
```
Frontend cho tải `credentials` thành CSV bằng `toCsv` (BOM + `escapeCell`) – chuyển `apps/api/src/lib/csv.js` sang `packages/shared` (§11). Server không lưu `credentials`.
Lỗi thêm: 409 `IMPORT_IN_PROGRESS`.
Rủi ro đã chấp nhận: `credentials` chỉ trả một lần. Nếu mất kết nối sau khi server đã ghi, mật khẩu tạm không lấy lại được; cách xử lý là reset mật khẩu từng người. Frontend tự tải CSV ngay khi nhận response và cảnh báo trước khi rời trang.

---

## 4. Danh mục và đợt – FR04 (T206)

### 4.1 Quy tắc chung
- **Không có endpoint xóa** danh mục/đợt (NFR05: không xóa cứng; FR04: đang tham chiếu chỉ được ngừng dùng). Ngừng dùng bằng `PATCH { isActive: false }`.
- Danh mục `isActive = false`: vẫn hiển thị ở bản ghi cũ; không chọn được cho bản ghi mới (tạo user, tạo/sửa đề tài → 400 `VALIDATION_ERROR` tại trường).
- `code` không đổi sau khi tạo. Trùng `code` → 409 `DUPLICATE`.
- Mọi ghi: AuditLog `CATALOG_CREATE`/`CATALOG_UPDATE` (`entityType` = `Faculty|Major|Class|Field|Synonym`), `ROUND_CREATE`/`ROUND_UPDATE`.

### 4.2 Danh mục
| Endpoint | Đọc | Ghi |
|---|---|---|
| `GET/POST /api/faculties`, `PATCH /api/faculties/:id` | Mọi vai trò đã đăng nhập | ADMIN |
| `GET/POST /api/majors`, `PATCH /api/majors/:id` | Mọi vai trò | ADMIN; STAFF nếu `inScope(major.facultyId)` |
| `GET/POST /api/classes`, `PATCH /api/classes/:id` | Mọi vai trò | ADMIN; STAFF nếu `inScope` khoa của ngành |
| `GET/POST /api/fields`, `PATCH /api/fields/:id` | Mọi vai trò | ADMIN, STAFF (lĩnh vực dùng chung mọi khoa) |
| `GET/POST /api/synonyms`, `DELETE /api/synonyms/:id` | STAFF | STAFF |

- Query đọc `catalogListQuerySchema`: `includeInactive?` enum `'true'|'false'` (mặc định `false`; chỉ ADMIN/STAFF được `true`), `facultyId?` (majors), `majorId?` (classes), `q?`. Danh mục nhỏ nên **không phân trang**: `{ "items": [...] }`, tối đa 1.000 mục.
- Body tạo: `facultyCreateSchema { code, name }`; `majorCreateSchema { facultyId, code, name }`; `classCreateSchema { majorId, code }` (model `Class` không có `name`); `fieldCreateSchema { code, name }`. `code`: trim 1..64, regex `^[A-Za-z0-9._-]+$`; `name`: trim 1..300.
- Body sửa `catalogUpdateSchema { name?, isActive? }` (lớp chỉ có `isActive`). 200 `{ "item": {...} }`.
- Từ đồng nghĩa (FR06 mục 3): `synonymCreateSchema { term (trim, lowercase, 1..60), canonical (trim, lowercase, 1..60) }`, `term ≠ canonical`. `DELETE` là xóa cứng: từ điển là cấu hình thuật toán, không phải dữ liệu nghiệp vụ; vẫn ghi AuditLog `CATALOG_UPDATE` với `before`. Giả định – chờ khoa xác nhận.

### 4.3 Đợt (Round)
Chỉ **STAFF** (đợt là cấu hình nghiệp vụ). ADMIN → 403.

**`GET /api/rounds`** – STAFF (đợt của khoa trong phạm vi), LECTURER, STUDENT (đợt của `user.facultyId`).
Query: `facultyId?`, `academicYear?` (regex năm học), `page`, `pageSize`. Sắp xếp `regOpenAt` giảm dần.
```json
{ "items": [{ "id": "r1", "facultyId": "f1", "name": "Đợt NCKH 2026-2027", "academicYear": "2026-2027",
  "regOpenAt": "2026-11-09T17:00:00.000Z", "regCloseAt": "2026-12-09T17:00:00.000Z",
  "reviewDeadline": "2026-12-31T17:00:00.000Z", "endAt": "2027-06-30T17:00:00.000Z",
  "config": { "maxTopicsPerLecturer": 6 }, "effectiveConfig": { "minMembers": 1, "maxMembers": 5, "...": "..." },
  "registrationOpen": true }], "page": 1, "pageSize": 20, "total": 1 }
```
`effectiveConfig` = `effectiveRoundConfig(config)` (shared, §11). `registrationOpen` tính theo giờ server. LECTURER/STUDENT chỉ nhận `effectiveConfig`, không cần `config`.

**`GET /api/rounds/:id`** – như trên. 200 `{ "round": {...} }`.

**`POST /api/rounds`** – STAFF, `inScope(facultyId)` · Ghi AuditLog `ROUND_CREATE`.
Body `roundCreateSchema`:
- `facultyId` (≤64), `name` (trim 1..300), `academicYear` (`^\d{4}-\d{4}$`, năm sau = năm trước + 1),
- `regOpenAt`, `regCloseAt`, `reviewDeadline`, `endAt`: `isoDateTime` (chuỗi ≤40, ISO có offset),
- `config?`: `roundConfigInputSchema` (partial của `roundConfigSchema`).
Kiểm: `regOpenAt < regCloseAt < reviewDeadline < endAt` → nếu sai, 400 `VALIDATION_ERROR` tại trường sai đầu tiên, thông điệp "Các mốc phải theo thứ tự: mở đăng ký < đóng đăng ký < hạn xét duyệt < hạn kết thúc". Cấu hình hiệu lực (sau khi gộp mặc định) phải qua `roundConfigSchema` đầy đủ (min ≤ max…).
201 `{ "round": {...} }`.

**`PATCH /api/rounds/:id`** – STAFF, `inScope(round.facultyId)` · Ghi AuditLog `ROUND_UPDATE` (before/after mốc và `config`).
Body `roundUpdateSchema`: mọi trường của create trừ `facultyId`, đều tùy chọn. Service gộp với giá trị hiện tại rồi kiểm lại thứ tự mốc và `roundConfigSchema`. `config` gửi lên **thay hẳn** phần ghi đè cũ.
Đổi cấu hình khi đã có đề tài: được phép, áp dụng từ lần kiểm tra kế tiếp, không hồi tố. Giả định – chờ khoa xác nhận.

**`roundConfigSchema`** (khóa = `DEFAULT_ROUND_CONFIG`; mặc định theo DAC_TA mục 8; hạn mức GV và số thành viên **đã xác nhận (người dùng, 2026-11-01)**: giữ mặc định, cấu hình theo đợt):
| Khóa | Kiểu, miền | Mặc định |
|---|---|---|
| `minMembers`, `maxMembers` | int 1..20, min ≤ max | 1, 5 |
| `maxActiveTopicsPerStudent` | int 1..5 | 1 |
| `maxTopicsPerLecturer` | int 1..50 | 5 |
| `advisorReminderDays`, `dueReminderDays` | int 1..30 | 3, 3 |
| `minSummaryWords` | int 1..500 (để vừa giới hạn 5000 ký tự) | 100 |
| `minKeywords`, `maxKeywords` | int 1..10, min ≤ max | 3, 5 |
| `maxFileSizeMB` | int 1..10 (trần multer QD §4.3.4) | 10 |
| `allowedFileTypes` | mảng enum `pdf|docx|pptx|xlsx`, 1..4, không lặp | cả 4 |
| `similarity.titleReview < titleHigh`, `contentReview < contentHigh` | số 0..1 | 0,50 / 0,70 / 0,35 / 0,55 |
| `similarity.minJustificationWords` | int 0..500 | 50 |

---

## 5. Đề tài (hồ sơ) và nhóm – FR03, FR05 (T209: §5.1–5.2; T208: §5.3–5.4 + kiểm sớm ở §5.5; T210: quy trình chính thức §5.5)

Mô hình: **nhóm gắn với đề tài** (Prisma không có bảng Group; thành viên là `TopicMember`). Tạo đề tài nháp = tạo nhóm, người tạo là trưởng nhóm.

### 5.1 Hồ sơ đề tài (T209)

**`POST /api/topics`** – STUDENT · transaction · Ghi AuditLog `TOPIC_CREATE`.
Body `topicCreateSchema` = `topicDraftSchema` + `roundId` (≤64).
Kiểm: đợt tồn tại; `round.facultyId === user.facultyId` (không thì 403); `now < round.regCloseAt` (không thì 409 `REGISTRATION_CLOSED`; được tạo nháp trước khi mở); `fieldId` (nếu có) phải `isActive`.
**Ngoại lệ ở `PUT`:** giữ nguyên `fieldId` hiện có thì không kiểm `isActive` (để hồ sơ vẫn lưu được khi lĩnh vực bị ngừng dùng); đổi sang lĩnh vực ngừng dùng vẫn 400.
Ghi: `Topic` (`status DRAFT`, `facultyId = round.facultyId`, `code = nextTopicCode(tx, round.academicYear)` – sequence, an toàn đồng thời, FR05), `TopicMember { role: LEADER }`.
201 `{ "topic": TopicDetail }`.

**`GET /api/topics/:id`** – được xem nếu: `isMember` · `isCurrentAdvisor` · `isRequestedLecturer` · `inStaffScope` và `status ≠ DRAFT`. ADMIN và người khác → 403.
200 `{ "topic": TopicDetail }`:
```json
{ "id": "t1", "code": "NCKH-2026-0007", "status": "HAS_ADVISOR", "version": 3,
  "title": "…", "summary": "…", "objectives": "…", "keywords": ["học máy", "…"],
  "field": { "id": "fd1", "name": "Trí tuệ nhân tạo" },
  "round": { "id": "r1", "name": "…", "academicYear": "2026-2027", "regOpenAt": "…", "regCloseAt": "…",
             "reviewDeadline": "…", "registrationOpen": true, "effectiveConfig": { "minMembers": 1, "maxMembers": 5, "...": "..." } },
  "members": [{ "userId": "u1", "code": "SV001", "fullName": "…", "role": "LEADER", "joinedAt": "…" }],
  "pendingInvitations": [{ "id": "i1", "invitee": { "code": "SV002", "fullName": "…" }, "createdAt": "…" }],
  "advisor": { "id": "l1", "fullName": "TS. …" },
  "pendingAdvisorRequest": null,
  "latestSubmission": { "id": "s2", "seq": 2, "createdAt": "…",
                        "decision": { "action": "REQUEST_REVISION", "reason": "Bổ sung phương pháp đánh giá", "decidedAt": "…", "decidedBy": { "fullName": "…" } } },
  "latestSimilarity": { "id": "sc5", "status": "OK", "level": "REVIEW", "createdAt": "…", "isStale": false },
  "availableActions": ["SUBMIT_FOR_REVIEW"],
  "permissions": { "edit": false, "invite": false, "transferLeader": true, "checkSimilarity": true },
  "createdAt": "…", "updatedAt": "…" }
```
Định nghĩa các trường có thể `null`:
- `advisor: { id, fullName } | null`: GVHD hiện hành (`Advising.endAt IS NULL`).
- `pendingAdvisorRequest: { id, lecturer: { id, fullName }, createdAt, pendingDays } | null`: đề nghị `PENDING`. `pendingDays` tính như §6.
- `latestSubmission: { id, seq, createdAt, decision } | null`: lần gửi có `seq` lớn nhất. `decision: { action: 'APPROVE'|'REQUEST_REVISION'|'REJECT', reason: string|null, decidedAt, decidedBy: { fullName } } | null`. Sinh viên thấy lý do của cán bộ ngay trên chi tiết (FR07).
- `latestSimilarity: { id, status, level, createdAt, isStale } | null`: lần kiểm gần nhất. `isStale` = `contentHash` của lần kiểm khác `contentHash(nội dung đang lưu)` (dùng `contentHash` của `engine.js`, rẻ). Xem đầy đủ ở `GET …/similarity-checks/latest` (§7.1).
- `round.effectiveConfig`: giống `GET /api/rounds/:id`. Frontend dùng cho `topicSubmitSchema(cfg)` và các bộ đếm ("x/100 từ", "thành viên 2/5").

Quy tắc khác:
- `pendingInvitations` chỉ trả cho `isMember`; với người khác là `[]`.
- `availableActions` = `availableActions(status, role)` (shared) rồi **lọc theo quan hệ** đúng như `checkTransition`: `leaderOnly` → `isLeader`; `requestedLecturerOnly` → `isRequestedLecturer`; `currentAdvisorOnly` → `isCurrentAdvisor`; STAFF → `inStaffScope`. Chỉ gồm hành động GĐ2 (§10). Không xét điều kiện dữ liệu (hạn, số thành viên): nút vẫn hiện, bấm thì nhận lỗi nghiệp vụ có thông điệp rõ.
- `permissions.edit` = `isMember && status ∈ {DRAFT, NEEDS_REVISION}`; `invite` = `isLeader && status = DRAFT`; `transferLeader` = `isLeader && status ∉ {REJECTED, CANCELLED, CLOSED}`; `checkSimilarity` = `isMember && status ∈ {DRAFT, WAITING_ADVISOR, HAS_ADVISOR, NEEDS_REVISION}` (mọi trạng thái trước duyệt, trừ UNDER_REVIEW: lúc đó kết quả đã gắn snapshot, kiểm thêm không có tác dụng).

**`PUT /api/topics/:id`** – STUDENT, `isMember` · transaction · Ghi AuditLog `TOPIC_UPDATE` (before/after `title`, `objectives`, `keywords`, `fieldId`; `summary` ghi dạng hash + số từ để log không phình).
Body `topicUpdateSchema` = `topicDraftSchema` + `version` (`z.int().min(0)`). **Thay toàn bộ** nội dung (PUT, vì `topicDraftSchema` có giá trị mặc định `''`/`[]` – dùng PATCH sẽ xóa nhầm trường không gửi).
Kiểm: `status ∈ {DRAFT, NEEDS_REVISION}` (không thì 409 `TOPIC_NOT_EDITABLE`); `version` khớp (`updateMany where {id, version}`; không thì 409 `CONCURRENT_UPDATE`); `fieldId` `isActive`. Số từ khóa ≤ `effectiveConfig.maxKeywords` (400 tại `keywords`). Nháp được thiếu trường (FR05).
200 `{ "topic": TopicDetail }`.

### 5.2 Kiểm tra trường bắt buộc khi gửi (FR05)
`topicSubmitSchema(effectiveConfig)`: `title` 10..300, `summary` ≥ `minSummaryWords` từ (≤5000 ký tự, `abort`), `objectives` 20..3000, `keywords` `minKeywords..maxKeywords` (mỗi từ 1..60), `fieldId` bắt buộc. Áp dụng ở `REQUEST_ADVISOR`, `SUBMIT_FOR_REVIEW`, `RESUBMIT` (§10). Lỗi → 400 **`TOPIC_INCOMPLETE`** với `details` map trường. Đây là nội dung đã lưu chứ không phải body của request, nên UI hiện "Hồ sơ chưa đủ thông tin" kèm nút "Sửa hồ sơ", rồi đánh dấu trường trong form sửa.

### 5.3 Lời mời thành viên (T208)

**`POST /api/topics/:id/invitations`** – STUDENT, `isLeader` · `withLockTx`, câu khóa đầu tiên `SELECT id, status FROM "Topic" WHERE id = $1 FOR NO KEY UPDATE` (§1.8); kiểm `status` và đếm **sau** câu khóa · Ghi AuditLog `INVITATION_CREATE`.
Body `invitationCreateSchema { inviteeCode: trim 1..64 }`. Mời theo **mã sinh viên** – không có API danh bạ sinh viên cho sinh viên (giảm lộ dữ liệu).
Kiểm: `status = DRAFT` (không thì 409 `TOPIC_NOT_EDITABLE`, thông điệp "Chỉ mời thành viên khi hồ sơ ở trạng thái Nháp"); người được mời tồn tại, `role STUDENT`, không khóa, cùng khoa với đợt (không thì 400 `VALIDATION_ERROR` tại `inviteeCode`: "Không tìm thấy sinh viên phù hợp" – một thông điệp chung, không phân biệt lý do); chưa là thành viên/chưa có lời mời `PENDING` (409 `ALREADY_MEMBER`); `số thành viên + số lời mời PENDING < maxMembers` (409 `GROUP_FULL`).
201 `{ "invitation": { "id", "topic": { "id", "code", "title" }, "invitee": { "code", "fullName" }, "status": "PENDING", "createdAt" } }`.

**`GET /api/invitations`** – STUDENT. Lời mời gửi tới mình. Query `status?` enum RequestStatus, `page`, `pageSize`.
Item: `{ id, status, createdAt, respondedAt, topic: { id, code, title, round: { id, name }, leader: { code, fullName }, memberCount } }`. Không trả tóm tắt/nội dung đề tài khi chưa là thành viên.

**`POST /api/invitations/:id/accept`** – STUDENT, chính người được mời · `withLockTx` (§1.8) · Ghi AuditLog `INVITATION_ACCEPT` · **tăng `Topic.version`** (§1.5).
Trước transaction chỉ tải lời mời để kiểm 404/403 (chính người được mời). Trong transaction, theo thứ tự:
1. `topic.updateMany({ where: { id: topicId, status: 'DRAFT' }, data: { version: { increment: 1 } } })` làm câu khóa đầu tiên. Một câu vừa lấy khóa Topic (NO KEY UPDATE, loại trừ với `updateMany` của `applyTransition`), vừa kiểm DRAFT nguyên tử, vừa tăng `version`. `count = 0` → 409 `INVITATION_CLOSED`.
2. `invitation.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'ACCEPTED', respondedAt: now } })`. `count !== 1` → 409 `INVITATION_CLOSED`. Câu này phải đứng **trước** khi tạo `TopicMember`.
3. Đếm (câu riêng, sau khóa) thành viên hiện có `< maxMembers` (409 `GROUP_FULL`); số đề tài **hoạt động** của sinh viên trong đợt `< maxActiveTopicsPerStudent` (409 `STUDENT_TOPIC_LIMIT`; T208 kiểm sớm để báo lỗi sớm, kiểm chính thức ở `REQUEST_ADVISOR` do T210 làm, §5.5).
4. Tạo `TopicMember { role: MEMBER }`.
Mọi lỗi ở bước 2–3 rollback cả bước 1 (không tăng `version`).
200 `{ "invitation": {...}, "topicId": "t1" }`.

**`POST /api/invitations/:id/decline`** – người được mời · Ghi AuditLog `INVITATION_DECLINE`. `PENDING` → `DECLINED`. 200.
**`POST /api/invitations/:id/cancel`** – `isLeader` của đề tài · Ghi AuditLog `INVITATION_CANCEL`. `PENDING` → `WITHDRAWN`. 200.
Cả hai: transaction thường (không khóa Topic), cập nhật **có điều kiện** `invitation.updateMany({ where: { id, status: 'PENDING' }, data })`; `count !== 1` → 409 `INVITATION_CLOSED`. Nhờ điều kiện `status: 'PENDING'` ở cả ba endpoint, `cancel` ‖ `accept` đồng thời chỉ có một bên thắng (bên sau đánh giá lại WHERE sau khi bên trước commit, nhận `count = 0`); không thể có lời mời `WITHDRAWN` mà `TopicMember` vẫn được tạo, hay `ACCEPTED` ghi đè `WITHDRAWN`. T214 có ca test `cancel` ‖ `accept`.

"Lời mời được chấp nhận mới thành thành viên" (FR03): chỉ `accept` tạo `TopicMember`.

### 5.4 Trưởng nhóm (T208)
**`POST /api/topics/:id/leader`** – STUDENT, `isLeader` · `withLockTx`, câu đầu `topic.updateMany({ where: { id, version }, data: { version: { increment: 1 } } })` (`count = 0` → 409 `CONCURRENT_UPDATE`) · Ghi AuditLog `LEADER_TRANSFER` (before/after userId) · tăng `version`.
Body `leaderTransferSchema { userId (≤64), version }`. Đích phải `isMember` (400 nếu không). Trong một transaction: **trước tiên** đổi LEADER cũ → MEMBER, **sau đó** đổi đích → LEADER. Thứ tự này bắt buộc vì partial unique index "một LEADER hiện hành" (§11b) không deferrable. Nhờ vậy luôn có **đúng một** trưởng nhóm. Ở trạng thái kết thúc (REJECTED, CANCELLED, CLOSED) → 409 `TOPIC_NOT_EDITABLE` "Đề tài đã kết thúc, không đổi được trưởng nhóm". Không dùng `INVALID_TRANSITION`, vì đây không phải chuyển trạng thái.
200 `{ "topic": TopicDetail }`.

Rời nhóm, xóa thành viên: **ngoài GĐ2** (FR21, T603).

### 5.5 Giới hạn nhóm – nơi kiểm (FR03)
| Ràng buộc | Kiểm ở | Cách chống đồng thời |
|---|---|---|
| Thành viên ≤ `maxMembers` | Mời, chấp nhận lời mời | Khóa dòng Topic mức NO KEY UPDATE (§1.8, §5.3) |
| Thành viên ≥ `minMembers` | `REQUEST_ADVISOR` | Lời mời chỉ có ở DRAFT nên số thành viên cố định sau đó |
| Mỗi SV ≤ `maxActiveTopicsPerStudent` đề tài hoạt động/đợt | `REQUEST_ADVISOR` (chính thức, mọi thành viên), chấp nhận lời mời (sớm) | Xem quy trình bắt buộc bên dưới |
| Đúng một trưởng nhóm | Tạo đề tài, đổi trưởng nhóm | Transaction + partial unique index (§11b) |

**Quy trình bắt buộc cho `REQUEST_ADVISOR`** (chạy trong `extra` của `applyTransition`; T210 làm):
1. `updateMany` của `applyTransition` đã giữ khóa dòng Topic. Lệnh chấp nhận lời mời cũng khóa dòng này, nên từ đây tập thành viên của đề tài không đổi được nữa.
2. **Đọc lại** `TopicMember` (`leftAt IS NULL`) ngay trong transaction. Không dùng danh sách đã tải trước transaction.
3. Đếm thành viên ≥ `minMembers` (409 `GROUP_TOO_SMALL`).
4. Khóa User của các thành viên vừa đọc theo §1.8.
5. Với mỗi thành viên, đếm bằng câu lệnh riêng số đề tài hoạt động trong cùng `roundId`, không tính đề tài này. Có ai đạt `maxActiveTopicsPerStudent` thì trả 409 `STUDENT_TOPIC_LIMIT` (`details.codes`) và cả transaction rollback.

Lỗ hổng mà quy trình này bịt (RV vòng 1):
- Kịch bản: X tải thành viên {A}; C chấp nhận lời mời vào X; đề tài Y của C gửi đề nghị GVHD; sau đó X gửi đề nghị GVHD.
- Nếu X dùng danh sách cũ, X chỉ khóa A, nên C lọt và có hai đề tài hoạt động trong đợt.
- Với bước 2, nếu C chấp nhận lời mời trước thì X đọc lại và thấy C. Nếu X giữ khóa Topic trước thì lời mời nhận 409 `INVITATION_CLOSED`, vì X đã rời DRAFT.
- Hai đề tài có chung C cùng gửi đề nghị: cả hai cùng khóa User C, nên bên sau đếm thấy bên trước.

T214 phải có hai ca test đồng thời cho các kịch bản trên.

"Đề tài hoạt động" = `isActiveStatus(status)` (shared): mọi trạng thái trừ DRAFT, REJECTED, CANCELLED, CLOSED. Đếm không tính chính đề tài đang chuyển.

---

## 6. Đề nghị nhận hướng dẫn – FR16 (T210)

Chuyển trạng thái dùng endpoint chung `POST /api/topics/:id/actions` (§8.1). Phần này mô tả điều kiện riêng và các endpoint đọc.

| Action | Ai | Điều kiện (ngoài `checkTransition`) | Ghi thêm trong cùng transaction |
|---|---|---|---|
| `REQUEST_ADVISOR` (DRAFT → WAITING_ADVISOR) | Trưởng nhóm | Trong thời gian mở đăng ký (409 `REGISTRATION_CLOSED`); `topicSubmitSchema` đạt (400 `TOPIC_INCOMPLETE`, §12-G1, đã xác nhận); `lecturerId` là LECTURER không khóa, cùng khoa (400 `VALIDATION_ERROR` tại `lecturerId`); thành viên ≥ `minMembers` và mỗi thành viên < `maxActiveTopicsPerStudent`, theo **quy trình §5.5** | Tạo `AdvisorRequest PENDING`; lời mời `PENDING` còn lại → `WITHDRAWN` |
| `ACCEPT_ADVISING` (→ HAS_ADVISOR) | GV được đề nghị | Hạn mức **tại thời điểm nhận**, trong `extra` của `applyTransition`: khóa User của GV (§1.8) → **đếm bằng câu lệnh riêng** số đề tài hoạt động của GV trong đợt (Advising `endAt IS NULL`, cùng `roundId`, `isActiveStatus`) `< maxTopicsPerLecturer` (không thì 409 `LECTURER_QUOTA_EXCEEDED`) → tạo Advising. Đề tài đang nhận chưa có Advising nên không bị tính. Race thật cần chặn: **một GV nhận hai đề tài khác nhau cùng lúc khi chỉ còn 1 suất** (mỗi đề tài chỉ có một GV được đề nghị). T210/T214 test đúng kịch bản này | `AdvisorRequest → ACCEPTED, respondedAt`; tạo `Advising { startAt: now }` |
| `DECLINE_ADVISING` (→ DRAFT) | GV được đề nghị | `reason` 5..2000 | `AdvisorRequest → DECLINED, reason, respondedAt` |
| `WITHDRAW_ADVISOR_REQUEST` (→ DRAFT) | Trưởng nhóm | Luôn được rút (đề nghị không tự hết hạn, FR16.4) | `AdvisorRequest → WITHDRAWN, respondedAt` |

- Response `DECLINE_ADVISING` là tóm lược (§8.1). Trong `GET /api/advisor-requests`, với GV, đề nghị đã `DECLINED`/`WITHDRAWN` chỉ trả `topic.{id, code, round}` (ẩn `title`, `status`, `version` của đề tài đã về Nháp).
- Mỗi thời điểm chỉ một đề nghị `PENDING`: bảo đảm bởi trạng thái (chỉ gửi được từ DRAFT).
- Hạn mức **không** kiểm lúc gửi đề nghị (đặc tả: kiểm tại thời điểm nhận); danh sách GV (§6.2) cho biết GV đã đầy để nhóm tự chọn.
- ACCEPT sau khi đóng đăng ký: được (đặc tả không cấm), nhưng nhóm sẽ không gửi xét duyệt được (FR16.5). Cán bộ thấy danh sách đề tài kẹt bằng `GET /api/topics?status=WAITING_ADVISOR&roundId=…` (item có `round.regCloseAt`, `round.registrationOpen`).
- Nhắc GV sau X ngày (FR16.4, FR13) thuộc T501; GĐ2 chỉ trả `pendingDays` để hiển thị.

**`GET /api/advisor-requests`** – LECTURER (gửi tới mình), STUDENT (của đề tài mình là thành viên), STAFF (đề tài thuộc khoa trong phạm vi). ADMIN 403.
Query `advisorRequestListQuerySchema`: `status?` enum RequestStatus, `roundId?`, `page`, `pageSize`.
```json
{ "items": [{ "id": "ar1", "status": "PENDING", "createdAt": "…", "respondedAt": null, "reason": null,
  "pendingDays": 4, "topic": { "id": "t1", "code": "NCKH-2026-0007", "title": "…", "status": "WAITING_ADVISOR", "version": 2,
             "round": { "id": "r1", "name": "Đợt NCKH 2026-2027" } },
  "lecturer": { "id": "l1", "fullName": "TS. …" } }], "page": 1, "pageSize": 20, "total": 1 }
```
`pendingDays` = số ngày nguyên từ `createdAt` đến giờ server (chỉ với `PENDING`, còn lại `null`). `topic.round` (cùng dạng item lời mời §5.3) để màn GV gọi `GET /api/lecturers?roundId=` đúng đợt và hiện "Đã nhận 4/5" cạnh từng đề nghị. GV xem chi tiết hồ sơ qua `GET /api/topics/:id` (được phép nhờ `isRequestedLecturer`).

**`GET /api/lecturers?roundId=…`** – STUDENT, LECTURER (khoa của đợt phải là `user.facultyId`), STAFF (khoa của đợt nằm trong phạm vi). Trả danh sách GV không khóa thuộc khoa của đợt. GV dùng chính endpoint này để thấy hạn mức của mình ("Đã nhận 4/5"): lọc `q` theo mã của mình hoặc tìm dòng có `id = user.id`.
Query `lecturerListQuerySchema`: `roundId` (bắt buộc, ≤64), `q?`, `page`, `pageSize`.
Item: `{ "id", "code", "fullName", "activeTopicCount": 3, "maxTopics": 5, "isFull": false }`. Không trả email, số điện thoại.

---

## 7. Kiểm tra tương tự – FR06 (T211)

### 7.1 Endpoint
**`GET /api/topics/:id/similarity-checks/latest`** – quyền xem như `GET /api/topics/:id`. 200 `{ "similarityCheck": SimilarityCheckView | null }`, có thêm trường `isStale` (§5.1). Dùng để tải lại trang mà không phải chạy lại thuật toán.

**`POST /api/topics/:id/similarity-checks`** – STUDENT, `isMember`, `status ∈ {DRAFT, WAITING_ADVISOR, HAS_ADVISOR, NEEDS_REVISION}` ("Kiểm tra trước", tùy chọn) · limiter 10/15 phút/`req.user.id` (thuật toán nặng ≤ 3 s).
Body rỗng. So **nội dung đã lưu** của đề tài (UI phải lưu nháp trước), để `contentHash` khớp dữ liệu DB.
Ghi: một dòng `SimilarityCheck` (không gắn snapshot). Không chuyển trạng thái.
200 `{ "similarityCheck": SimilarityCheckView }`. Kết quả lỗi vẫn trả **200** với `status: "ERROR"` (là kết quả hợp lệ của phép kiểm, không phải lỗi HTTP).

Kiểm tra bắt buộc khi gửi: trong `SUBMIT_FOR_REVIEW`/`RESUBMIT` (§8.2). Chạy lại khi đổi sau duyệt (FR18): GĐ6.

### 7.2 `SimilarityCheckView` – hiển thị theo người xem
```json
{ "id": "sc5", "status": "OK", "level": "HIGH", "createdAt": "…",
  "algorithmVersion": "tfidf-bigram-v1+trgm", "corpusSize": 128,
  "thresholds": { "titleReview": 0.5, "titleHigh": 0.7, "contentReview": 0.35, "contentHigh": 0.55, "minJustificationWords": 50 },
  "justificationRequired": true, "justification": null,
  "matches": [
    { "hidden": false, "code": "NCKH-2025-0012", "title": "…", "academicYear": "2025-2026", "field": "…",
      "status": "CLOSED", "titleScore": 0.74, "contentScore": 0.41, "level": "HIGH", "matchedKeywords": ["học máy"] },
    { "hidden": true, "note": "Có 1 hồ sơ đang chờ duyệt trong đợt có nội dung tương tự",
      "titleScore": 0.52, "contentScore": 0.30, "level": "REVIEW" } ] }
```
- `status: "ERROR"` → `level: null`, `matches: []`, `message: "Chưa kiểm tra được"`. **Không bao giờ** trả `level: "NONE"` hay chữ "Không trùng" khi lỗi. `errorMessage` nội bộ **không** trả ra client.
- `justificationRequired` = `status = OK && level = HIGH` (mức của hồ sơ = mức cao hơn trong hai điểm).
- **Dạng phần tử `SimilarityCheck.matches` lưu trong DB** (bất biến, để kết quả FR06 trong snapshot không đổi theo thời gian, FR17):
  `{ topicId, code, title, academicYear, fieldName, status, titleScore, contentScore, level, matchedKeywords }`.
  - Các trường mô tả và `status` là giá trị **lúc kiểm**.
  - `SimilarityCheckView` chỉ dựng từ dữ liệu đã lưu, không đọc lại đề tài khớp. Vì vậy tên hoặc trạng thái đề tài khớp đổi sau đó thì kết quả cũ vẫn hiển thị như cũ.
  - Tên của hồ sơ chờ có lưu trong DB nhưng không lộ ra, vì view vẫn ẩn theo quy tắc dưới đây.
  - T211 đổi `presentMatches(matches, corpusById, viewerRole)` thành `presentMatches(matches, viewerRole)` và bỏ `corpusById`. `compare`/service ghép các trường mô tả từ `loadCorpus` (đã có `title`, `academicYear`, `fieldName`, `status`, `keywords`) trước khi lưu.
- `matchedKeywords`:
  - Là các từ khóa **gốc của hồ sơ đang kiểm** (giữ nguyên chữ người dùng nhập), lấy những từ có dạng chuẩn hóa trùng với dạng chuẩn hóa của một từ khóa của đề tài khớp. Chuẩn hóa = chữ thường, trim, quy đồng nghĩa.
  - Tối đa 5 phần tử. Không cần truy vấn thêm.
- Ẩn/hiện xét theo **`status` đã lưu lúc kiểm** và vai trò người xem:
  - Đề tài khớp ở trạng thái đã duyệt trở đi (IN_PROGRESS, WAITING_CLOSE, CLOSED): mọi người xem thấy `code, title, academicYear, field, status, titleScore, contentScore, level, matchedKeywords`.
  - Hồ sơ đang chờ của nhóm khác (WAITING_ADVISOR, HAS_ADVISOR, UNDER_REVIEW, NEEDS_REVISION): chỉ **STAFF** thấy đầy đủ (thêm `topicId`); **mọi vai trò khác** (SV, và cả GV – Giả định §12-G4) chỉ thấy dòng `hidden: true` + điểm.
  - Không bao giờ có thành viên, file, nhận xét, tóm tắt của đề tài khác (FR08).
- Thay đổi so với code GĐ1 (T211 làm):
  - `presentMatches` hiện chỉ ẩn khi `viewerRole === 'STUDENT'` → đổi thành ẩn khi `viewerRole !== 'STAFF'`, và chỉ dựng từ dữ liệu đã lưu (như trên).
  - `compare` chưa trả `matchedKeywords` → thêm vào.
  - Lưu phần tử `matches` theo dạng đầy đủ ở trên.

---

## 8. Gửi xét duyệt, snapshot, quyết định – FR05, FR06, FR07, FR17 (T212a: §8.1–8.3, endpoint chung do T210 tạo trước; T212b: §8.4)

### 8.1 Endpoint chuyển trạng thái chung
**`POST /api/topics/:id/actions`** – vai trò theo `TRANSITIONS` (shared) · limiter 30/15 phút/`req.user.id`.
Body `topicActionSchema` – `z.discriminatedUnion('action', …)`, chỉ gồm 9 action GĐ2:
| `action` | Trường thêm |
|---|---|
| `REQUEST_ADVISOR` | `version`, `lecturerId` (≤64) |
| `ACCEPT_ADVISING`, `WITHDRAW_ADVISOR_REQUEST` | `version` |
| `DECLINE_ADVISING` | `version`, `reason` (trim 5..2000) |
| `SUBMIT_FOR_REVIEW`, `RESUBMIT` | `version`, `justification?` (trim, ≤5000, `abort`) |
| `REQUEST_REVISION`, `REJECT` | `version`, `submissionId` (≤64), `reason` (trim 5..2000) |
| `APPROVE` | `version`, `submissionId` (≤64) |

Action ngoài danh sách (CANCEL, REQUEST_CLOSE…) → 400 `VALIDATION_ERROR` cho đến khi T400/T600 mở rộng union.
Xử lý chung, theo thứ tự:
1. Tải đề tài và quan hệ.
2. **Kiểm quyền xem** đúng quy tắc của `GET /api/topics/:id`. Không có quan hệ → 403 `FORBIDDEN`. Bước này phải đứng **trước** `checkTransition`. Lý do: `checkTransition` kiểm trạng thái trước vai trò; nếu bỏ bước này, SV không liên quan hoặc STAFF khoa khác sẽ nhận 409 `INVALID_TRANSITION`, tức biết được trạng thái đề tài, trái quy ước §2.
3. `checkTransition`: sai trạng thái → 409 `INVALID_TRANSITION`; sai vai trò, quan hệ hoặc phạm vi → 403.
4. Kiểm `version` (409 `CONCURRENT_UPDATE`).
5. Điều kiện riêng của action. Kiểm không cần khóa (hạn đăng ký, `topicSubmitSchema`, FR06) chạy ở đây; kiểm cần khóa (giới hạn đề tài/SV, hạn mức GV) chạy trong `extra` của bước 6 (§5.5, §6).
6. `applyTransition` (qua `withLockTx`, §1.8): một transaction, ghi `StatusHistory { from, to, action, actorId, reason }`, tăng `version`.

Response 200:
- Mọi action: `{ "topic": TopicDetail }`, **trừ `DECLINE_ADVISING`**: `{ "topic": { "id", "code", "status", "version" } }` (tóm lược, không có `title/summary`). Lý do: đề tài về Nháp nên GV hết quan hệ và `GET /api/topics/:id` trả 403 cho GV (§5.1); FE không đọc `topic.title` từ response này.
- SUBMIT_FOR_REVIEW, RESUBMIT: `{ "topic": TopicDetail, "submission": { "id", "seq", "createdAt" }, "similarityCheck": SimilarityCheckView }`. Ba khóa nằm **cùng cấp**, không lồng vào `topic`.

### 8.2 SUBMIT_FOR_REVIEW (HAS_ADVISOR → UNDER_REVIEW) và RESUBMIT (NEEDS_REVISION → UNDER_REVIEW)
Thứ tự (rẻ trước, nặng sau):
1. Quyền xem (403), sau đó `checkTransition(…, { skipSimilarity: true })` để kiểm trạng thái, trưởng nhóm, rồi kiểm `version`. Không chạy thuật toán cho người không có quyền. **Thay đổi nhỏ ở `stateMachine.js` (T212a làm, kèm test):** thêm tùy chọn `skipSimilarity` để bỏ qua khối `needsSimilarity`. Không kiểm tay song song, để không lệch với TRANSITIONS.
2. Chỉ `SUBMIT_FOR_REVIEW`: trong thời gian mở đăng ký, theo giờ server (409 `REGISTRATION_CLOSED`, FR05, FR16.5). `RESUBMIT`: không giới hạn thời gian (§12-G2, đã xác nhận).
3. `topicSubmitSchema(effectiveConfig)` (400 `TOPIC_INCOMPLETE`).
4. `runSimilarityCheck` **ngoài** transaction, lưu `SimilarityCheck` kèm `justification`.
5. `checkTransition` lần hai với `ctx.similarity`. Service bắt `AppError` của hai mã dưới đây rồi gắn `details.similarityCheck` trước khi ném tiếp:
   - `status = ERROR` → 409 `SIMILARITY_NOT_CHECKED`, `details: { similarityCheck: SimilarityCheckView }`. Hồ sơ không gửi được; người dùng thử lại.
   - `level = HIGH` và giải trình < `minJustificationWords` từ → 400 `JUSTIFICATION_REQUIRED`, `details: { similarityCheck: SimilarityCheckView }` (UI hiện cảnh báo đỏ + ô giải trình, gửi lại kèm `justification`).
   - `REVIEW` (vàng): gửi bình thường, giải trình không bắt buộc. `NONE`: gửi bình thường.
6. `applyTransition` với `extra`: tạo `Submission { seq = max(seq)+1, payload, createdById, similarityCheckId }`. `@@unique([topicId, seq])` + khóa `version` chống gửi đôi.
   `payload` (bất biến, FR17): `{ title, summary, objectives, keywords, fieldId, fieldName, documentIds: [] }`. `documentIds` rỗng ở GĐ2; T403 gắn tài liệu giai đoạn PROPOSAL.

Cho phép gửi với cờ "chưa kiểm tra" khi lỗi kéo dài (mục 3): **ngoài GĐ2**, hợp đồng ở T600, hiện thực ở T609 (§12-G5, §14).

**Luồng UI gửi hồ sơ khuyến nghị** (T305):
1. Lưu nháp nếu còn thay đổi.
2. Nếu chưa có kết quả, hoặc `latestSimilarity.isStale`, hoặc lần kiểm quá cũ: gọi "Kiểm tra trước".
3. Hiện kết quả:
   - mức vàng (REVIEW): cho nhập giải trình tùy chọn;
   - mức đỏ (HIGH): bắt buộc nhập ≥ `minJustificationWords` từ.
4. Gọi SUBMIT kèm `justification`.
5. Nếu vẫn nhận `JUSTIFICATION_REQUIRED` (kho đã đổi giữa hai lần kiểm), dùng `details.similarityCheck` hiện lại cảnh báo. Nếu nhận `SIMILARITY_NOT_CHECKED`, hiện "Chưa kiểm tra được, vui lòng thử lại".

Lý do cần bước 2: SUBMIT ở mức REVIEW đi thẳng, không dừng lại để người dùng nhập giải trình tùy chọn. Bước 2 chịu limiter 10/15 phút.

### 8.3 Quyết định xét duyệt (FR07)
`REQUEST_REVISION` (→ NEEDS_REVISION), `REJECT` (→ REJECTED, kết thúc), `APPROVE` (→ IN_PROGRESS) – STAFF, `inStaffScope` (cán bộ của khoa chứa đề tài).
- `submissionId` phải là Submission **có `seq` lớn nhất** của đề tài và **chưa có** `ReviewDecision` → không thì 409 `STALE_SUBMISSION` (quyết định gắn đúng snapshot, FR17).
- `extra`: tạo `ReviewDecision { submissionId, action, reason, decidedById, decidedAt: now }` (lưu người xử lý, thời điểm).
- `reason` bắt buộc với REQUEST_REVISION, REJECT (schema + `reasonRequired` trong TRANSITIONS).
- Hạn xét duyệt (`reviewDeadline`) chỉ để hiển thị, không chặn quyết định (§12-G2, đã xác nhận).

### 8.4 Snapshot (FR17)
Quyền đọc (mọi endpoint 8.4): `isMember` · `isCurrentAdvisor` · `inStaffScope`. Người đã rời nhóm (FR21): GĐ6.

**`GET /api/topics/:id/submissions`** → `{ "items": [{ "id", "seq", "createdAt", "createdBy": { "fullName" }, "similarityLevel": "HIGH", "decision": { "action": "REQUEST_REVISION", "decidedAt": "…" } | null }] }` (không phân trang, sắp `seq` giảm dần).

**`GET /api/topics/:id/submissions/:seq`** (`seq` coerce int 1..10000):
```json
{ "submission": { "id": "s2", "seq": 2, "createdAt": "…", "createdBy": { "id": "u1", "fullName": "…" },
  "payload": { "title": "…", "summary": "…", "objectives": "…", "keywords": ["…"], "fieldId": "fd1", "fieldName": "…", "documentIds": [] },
  "similarityCheck": "SimilarityCheckView (ẩn/hiện theo người xem, kèm justification)",
  "decision": { "action": "REQUEST_REVISION", "reason": "…", "decidedBy": { "fullName": "…" }, "decidedAt": "…" } } }
```
Màn xét duyệt (FR07) dùng endpoint này: STAFF thấy mức, top 5 đầy đủ và giải trình.

**`GET /api/topics/:id/submission-diff?from=1&to=2`** – `submissionDiffQuerySchema { from, to }` (coerce int 1..10000, `from ≠ to`). Đặt ở đường dẫn riêng thay vì `submissions/diff`, để không trùng mẫu với `submissions/:seq`.
```json
{ "from": { "seq": 1, "createdAt": "…", "payload": {} }, "to": { "seq": 2, "createdAt": "…", "payload": {} },
  "changes": { "title": false, "summary": true, "objectives": true, "fieldId": false,
               "keywords": { "added": ["thị giác máy tính"], "removed": ["xử lý ảnh"] } } }
```
Hiển thị khác biệt chi tiết trong văn bản do frontend làm từ hai `payload` (không thêm thư viện diff ở backend).

**`GET /api/topics/:id/status-history`** – cùng quyền đọc → `{ "items": [{ "from", "to", "action", "actor": { "fullName", "role" }, "reason", "at" }] }`.

---

## 9. Tra cứu và danh sách – FR08 (T213)

### 9.1 Danh sách theo phạm vi
**`GET /api/topics`** – STUDENT, LECTURER, STAFF. ADMIN 403.
Query `topicListQuerySchema`: `roundId?`, `academicYear?` (regex năm học), `fieldId?`, `lecturerId?` (GVHD hiện hành), `status?` enum TOPIC_STATUS, `result?` enum FINAL_RESULT (theo `ResultVersion.isCurrent`; rỗng ở GĐ2), `q?` (≤200; khớp `code`, `title` không dấu, `keywords`), `sort?` enum `updatedAt_desc` (mặc định) `| updatedAt_asc | code_asc | title_asc`, `page`, `pageSize`. **Phân trang ở server.**
- Với hàng chờ xét duyệt, `updatedAt_asc` cho thứ tự gần đúng "gửi trước làm trước": ở UNDER_REVIEW, lần ghi cuối lên Topic thường là lần chuyển sang UNDER_REVIEW (`@updatedAt`). **Hạn chế đã chấp nhận** (review FE vòng 2): đổi trưởng nhóm được phép ở UNDER_REVIEW và tăng `version` nên đổi `updatedAt`; hồ sơ đó tụt xuống cuối hàng chờ. Trường hợp hiếm; item vẫn hiện đúng `latestSubmission.createdAt` để cán bộ nhận ra. Không thêm `submittedAt_asc` ở GĐ2 vì cần sắp theo bảng con (raw SQL hoặc cột phi chuẩn hóa); T213 có thể thêm nếu T704 hoặc người dùng thấy cần.
- **Cách làm `q`** (T213):
  - Prisma `contains` không có `unaccent` và không dùng được index trigram.
  - Lấy tập `id` khớp bằng `Prisma.sql`/`$queryRaw`, dùng **đúng biểu thức của index**: `lower(immutable_unaccent(title)) LIKE lower(immutable_unaccent($q))` với `%…%`, `OR code ILIKE …`, `OR EXISTS (SELECT 1 FROM unnest(keywords) k WHERE lower(immutable_unaccent(k)) LIKE …)`.
  - Escape `%`, `_`, `\` trong `q`.
  - Ghép tập id vào `where: { id: { in } }` cùng bộ lọc và phạm vi.
  - `q` < 3 ký tự thì trigram không dùng được index; `keywords` không có index. Chấp nhận quét ở quy mô 2.000 đề tài; T704 đo.
Phạm vi (áp ở `WHERE`, trước phân trang và trước `total`):
| Vai trò | Thấy |
|---|---|
| STUDENT | Đề tài mình là thành viên hiện hành (`leftAt IS NULL`) |
| LECTURER | Đề tài mình là GVHD hiện hành (`Advising.endAt IS NULL`). Đề nghị đang chờ xem ở `/api/advisor-requests` |
| STAFF | Đề tài có `facultyId` trong phạm vi, **trừ DRAFT** (Giả định §12-G6) |

Bộ lọc không mở rộng phạm vi (lọc `lecturerId` của GV khác chỉ thu hẹp tập đã giới hạn).
Item:
```json
{ "id": "t1", "code": "NCKH-2026-0007", "title": "…", "status": "UNDER_REVIEW", "version": 4,
  "round": { "id": "r1", "name": "…", "academicYear": "2026-2027", "regCloseAt": "…", "reviewDeadline": "…", "registrationOpen": false },
  "field": { "id": "fd1", "name": "…" }, "advisor": { "id": "l1", "fullName": "…" },
  "leader": { "code": "SV001", "fullName": "…" }, "memberCount": 3,
  "latestSubmission": { "seq": 2, "createdAt": "…" },
  "result": null, "latestSimilarityLevel": "REVIEW", "updatedAt": "…" }
```
Không có `availableActions` trong danh sách (cần quan hệ từng dòng; xem ở chi tiết). Hàng chờ xét duyệt của cán bộ = `?status=UNDER_REVIEW`.

### 9.2 Kho chung
**`GET /api/repository`** – mọi vai trò đã đăng nhập, kể cả ADMIN (không chứa dữ liệu nghiệp vụ riêng tư). Yêu cầu đăng nhập: §12-G3, đã xác nhận.
Chỉ đề tài `status = CLOSED` và kết quả hiện hành `∈ {EXCELLENT, GOOD, PASS}` (đóng **đạt**).
Query `repositoryQuerySchema`: `academicYear?`, `fieldId?`, `result?` enum `EXCELLENT|GOOD|PASS`, `q?`, `page`, `pageSize`.
Item – **chỉ đúng các trường FR08**: `{ "code", "title", "summaryExcerpt" (≤ 300 ký tự đầu), "field": { "name" }, "academicYear", "result" }`. Không `id` nội bộ, không thành viên, GVHD, file, nhận xét, điểm tương tự.

**`GET /api/repository/:code`** → `{ "topic": { "code", "title", "summary", "field": { "name" }, "academicYear", "result" } }`. Không thuộc kho → 404.

---

## 10. Chuyển trạng thái GĐ2 ↔ TRANSITIONS

Chỉ dùng action có trong `packages/shared/src/transitions.js`. Không có đường đi nào khác.

| Action | Từ → Sang | Vai trò + quan hệ | Điều kiện thêm (mục) | Ghi trong transaction |
|---|---|---|---|---|
| `REQUEST_ADVISOR` | DRAFT → WAITING_ADVISOR | STUDENT, `leaderOnly` | §6 | StatusHistory, AdvisorRequest, rút lời mời PENDING |
| `ACCEPT_ADVISING` | WAITING_ADVISOR → HAS_ADVISOR | LECTURER, `requestedLecturerOnly` | Hạn mức GV, khóa User GV (§6) | StatusHistory, AdvisorRequest, Advising |
| `DECLINE_ADVISING` | WAITING_ADVISOR → DRAFT | LECTURER, `requestedLecturerOnly`, lý do | §6 | StatusHistory (reason), AdvisorRequest |
| `WITHDRAW_ADVISOR_REQUEST` | WAITING_ADVISOR → DRAFT | STUDENT, `leaderOnly` | – | StatusHistory, AdvisorRequest |
| `SUBMIT_FOR_REVIEW` | HAS_ADVISOR → UNDER_REVIEW | STUDENT, `leaderOnly`, `needsSimilarity` | Mở đăng ký, đủ trường, FR06 OK, giải trình nếu HIGH (§8.2) | StatusHistory, Submission (+ SimilarityCheck lưu trước) |
| `RESUBMIT` | NEEDS_REVISION → UNDER_REVIEW | STUDENT, `leaderOnly`, `needsSimilarity` | Đủ trường, FR06 OK, giải trình nếu HIGH | StatusHistory, Submission |
| `REQUEST_REVISION` | UNDER_REVIEW → NEEDS_REVISION | STAFF trong phạm vi, lý do | Snapshot mới nhất (§8.3) | StatusHistory, ReviewDecision |
| `REJECT` | UNDER_REVIEW → REJECTED | STAFF trong phạm vi, lý do | Snapshot mới nhất | StatusHistory, ReviewDecision |
| `APPROVE` | UNDER_REVIEW → IN_PROGRESS | STAFF trong phạm vi | Snapshot mới nhất | StatusHistory, ReviewDecision |

Các action còn lại (`CANCEL`, `REQUEST_CLOSE`, `RETURN_TO_ADVISOR`, `CONFIRM_CLOSE`, `CLOSE_EXPIRED`) thuộc API_GD45/API_GD6.

---

## 11. Schema và hàm cần thêm ở `packages/shared`

Tất cả tuân QD §5 (`.max()` trước regex/refine, mảng có `.max()`, thông điệp tiếng Việt dạng `{ error }`, không `z.any/record`). Backend-dev (task tương ứng) tạo, frontend dùng lại.

| Tên | Nội dung | Task |
|---|---|---|
| `idSchema` | `z.string().trim().min(1).max(64)` | T206 (đầu tiên cần) |
| `paginationQuery` | `{ page, pageSize }` theo §1.7 | T206 |
| `isoDateTime` | `z.string().max(40).pipe(z.iso.datetime({ offset: true }))` → chuyển `Date` ở service | T206 |
| `academicYearSchema` | `z.string().max(9).regex(/^\d{4}-\d{4}$/)` + refine năm sau = năm trước + 1 | T206 |
| `catalogCodeSchema`, `catalogNameSchema` | §4.2 | T206 |
| `facultyCreateSchema`, `majorCreateSchema`, `classCreateSchema`, `fieldCreateSchema`, `catalogUpdateSchema`, `synonymCreateSchema`, `catalogListQuerySchema` | §4.2 | T206 |
| `roundConfigSchema` (đầy đủ, refine min ≤ max, review < high), `roundConfigInputSchema` (= partial, `similarity` partial) | §4.3 | T206 |
| `effectiveRoundConfig(config)` | Gộp `DEFAULT_ROUND_CONFIG` + ghi đè, gộp sâu `similarity` | T206 |
| `roundCreateSchema`, `roundUpdateSchema`, `roundListQuerySchema` | §4.3 | T206 |
| `emailSchema` | `z.string().trim().toLowerCase().max(254).pipe(z.email({ error: 'Email không hợp lệ' }))` | T207a |
| `userCreateSchema`, `userUpdateSchema`, `staffScopesSchema`, `userListQuerySchema` | §3.2 | T207a |
| `userImportRowSchema`, `importQuerySchema { facultyId }` | §3.2 (nhập CSV) | T207b |
| `toCsv`, `escapeCell` | **Chuyển** từ `apps/api/src/lib/csv.js` sang `packages/shared/src/csv.js`, API giữ re-export để không vỡ import cũ | T207b |
| `topicCreateSchema`, `topicUpdateSchema` | §5.1 | T209 |
| Sửa `topicDraftSchema.keywords` | Trần cứng `.max(10)` (= trần `maxKeywords` của đợt); kiểm theo đợt ở service và `topicSubmitSchema(cfg)`. Lý do: trần tĩnh 5 hiện tại sẽ chặn sai nếu đợt đặt `maxKeywords` > 5 | T209 |
| `invitationCreateSchema`, `invitationListQuerySchema`, `leaderTransferSchema` | §5.3, §5.4 | T208 |
| `advisorRequestListQuerySchema`, `lecturerListQuerySchema` | §6 | T210 |
| `topicActionSchema` | §8.1, dùng `reasonSchema` có sẵn cho `reason` | T210 (tạo union, nhánh FR16), T212a (thêm nhánh gửi/gửi lại/xét duyệt) |
| `submissionDiffQuerySchema` | §8.4 | T212b |
| `topicListQuerySchema`, `repositoryQuerySchema` | §9 | T213 |
| `REQUEST_STATUS` + `REQUEST_STATUS_LABEL` (Chờ phản hồi / Đã chấp nhận / Đã từ chối / Đã rút), `ROLE_LABEL` (Quản trị / Cán bộ khoa / Giảng viên / Sinh viên), `SIMILARITY_LEVEL_LABEL` (Không cảnh báo / Cần xem xét / Nghi trùng cao), `ACTION_LABEL` (14 action của TRANSITIONS, ví dụ `REQUEST_ADVISOR`: "Gửi đề nghị hướng dẫn") – thêm vào `enums.js`; `ACTION_LABEL` có khóa đúng bằng `TRANSITIONS[].action` (test đơn vị so khớp) | §1.3 | T206 |
| `USER_IMPORT_HEADERS`, `USER_IMPORT_MAX_ROWS` (2000), `USER_IMPORT_MAX_BYTES` (1 MB) | §3.2 | T207b |

Không đổi `TRANSITIONS`, `availableActions`.

## 11b. Thay đổi schema/SQL – giao T203

Migration init chưa có (`apps/api/prisma/migrations/` đang rỗng), nên thêm lúc này là rẻ nhất. Phần Prisma ghi vào `schema.prisma`. Phần SQL thô thêm vào `after_init.sql` (cùng migration `search_and_security`).

**Quan hệ Prisma (có FK), để `include` được và không N+1:**
- `Invitation.inviteeId` → `User`
- `AdvisorRequest.lecturerId` → `User`
- `Submission.createdById` → `User`
- `ReviewDecision.decidedById` → `User`
- `StatusHistory.actorId` → `User`

Đặt tên quan hệ rõ ràng, vì `User` có nhiều quan hệ cùng kiểu.

**Index:**
| Bảng | Index | Dùng ở |
|---|---|---|
| `Invitation` | `@@index([inviteeId, status])`, `@@index([topicId, status])` | `GET /api/invitations`, đếm PENDING khi mời |
| `AdvisorRequest` | `@@index([topicId, status])` | `pendingAdvisorRequest`, `isRequestedLecturer` |
| `SimilarityCheck` | `@@index([topicId, createdAt])` | `latestSimilarity`, `…/latest` |
| `Topic` | `@@index([facultyId, status])` | Phạm vi STAFF (§9.1, §6) |
| `Submission` | đã có `@@unique([topicId, seq])` | – |

**Partial unique index (lưới an toàn ở DB cho bất biến mà code đã giữ):**
```sql
CREATE UNIQUE INDEX topic_one_leader ON "TopicMember"("topicId") WHERE role = 'LEADER' AND "leftAt" IS NULL;
CREATE UNIQUE INDEX topic_member_current ON "TopicMember"("topicId", "userId") WHERE "leftAt" IS NULL;
CREATE UNIQUE INDEX invitation_one_pending ON "Invitation"("topicId", "inviteeId") WHERE status = 'PENDING';
CREATE UNIQUE INDEX advisor_request_one_pending ON "AdvisorRequest"("topicId") WHERE status = 'PENDING';
CREATE UNIQUE INDEX advising_one_current ON "Advising"("topicId") WHERE "endAt" IS NULL;
```
Vi phạm các index này (P2002) nghĩa là lỗi logic hoặc race chưa bị code chặn: map về 409 `DUPLICATE` (§11c), không để thành 500. Đổi trưởng nhóm phải hạ LEADER cũ trước (§5.4).

**Bất biến FR17 – dùng lại `forbid_mutation()` đã có:**
```sql
CREATE TRIGGER submission_immutable BEFORE UPDATE OR DELETE ON "Submission" FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER review_decision_immutable BEFORE UPDATE OR DELETE ON "ReviewDecision" FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER similarity_check_immutable BEFORE UPDATE OR DELETE ON "SimilarityCheck" FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
```
`SimilarityCheck` cũng chỉ thêm: `justification` được ghi ngay lúc tạo (§8.2 bước 4), và mỗi lần kiểm là một dòng mới. G5 (T609) chỉ nới trigger `Submission` cho đúng cột `similarityCheckId` khi đang `NULL`/ERROR; trigger `SimilarityCheck` giữ nguyên. Ràng buộc thiết kế ở §14.

**Bảo vệ index/trigger viết bằng SQL thô** (Prisma 5.22 không biểu diễn được index có `WHERE`/trên biểu thức, nên `migrate dev` về sau có thể sinh `DROP INDEX` cho chúng, kể cả `topic_title_trgm_idx`). T203 làm:
- (a) Sau migration `search_and_security`, chạy `prisma migrate dev --create-only` một lần, ghi vào báo cáo Prisma có sinh `DROP INDEX` hay không.
- (b) Integration test đọc `pg_indexes` và `pg_trigger`, khẳng định có đủ: 5 partial unique index ở trên, `topic_title_trgm_idx`, và 5 trigger chỉ-thêm (`audit_log_append_only`, `status_history_append_only` đã có + 3 trigger mới ở trên). Test này bắt mọi migration về sau lỡ xóa chúng.
- (c) README thêm một dòng: "migration tự sinh có `DROP INDEX`/`DROP TRIGGER` cho các đối tượng trong `after_init.sql` → xóa dòng đó trước khi commit".
- (d) Sửa chú thích `SimilarityCheck.matches` ở `schema.prisma` (hiện `[{topicId, code, titleScore, contentScore, visible}]`) theo dạng lưu §7.2.

## 11c. Thay đổi ở `apps/api` (ngoài module mới)
| Thay đổi | Task |
|---|---|
| `conflict(code, msg, details)` trong `lib/errors.js` (thêm tham số, không phá chỗ gọi cũ) | T206 |
| `errorHandler`: Prisma `P2002` → 409 `DUPLICATE`. `details` lấy từ `err.meta.target`, **đổi tên cột sang tên trường request** qua bảng ánh xạ của từng module; không ánh xạ được thì không trả `details`. Prisma `P2025` (không tìm thấy khi update) → 404 `NOT_FOUND`. Tranh chấp khóa → 409 `CONCURRENT_UPDATE`, nhận đủ các dạng ở §1.8: `P2010` + `meta.code === '55P03'`, `P2034`, dự phòng `message` chứa `55P03`/`lock timeout`. `P2028` → 503 `SERVICE_BUSY` + `logger.warn`. Unit test bằng lỗi giả cho từng dạng. Cơ chế `details` của `DUPLICATE`: route đặt `req.duplicateFields = { cột: trườngRequest }` | T206 |
| Helper `withLockTx` + hằng `LOCK_TIMEOUT`, `LOCK_TX_OPTIONS` (`lib/tx.js`, §1.8); dùng cho lời mời, chấp nhận lời mời, đổi trưởng nhóm | T208 |
| `applyTransition` chạy qua `withLockTx` (đặt `lock_timeout` trước `updateMany`; `timeout` 15 s > `lock_timeout` 3 s). Integration test trên DB thật: hai tx cùng khóa một Topic, tx sau nhận 409 chứ không 500 | T210 |
| `requirePasswordChanged` + gắn ở `app.js` (§1.2) | T206 |
| `publicUser` thêm `staffFacultyIds`; repo nạp `staffScopes` (§1.1) | T206 (repo bộ nhớ/test), T205 (repo Prisma) |
| `checkTransition(…, { skipSimilarity })` (§8.2) | T212a |
| Service bắt lỗi FR06 từ `checkTransition` rồi gắn `details.similarityCheck` (§8.2) | T212a |
| `presentMatches(matches, viewerRole)`, lưu `matches` dạng đầy đủ, `matchedKeywords` (§7.2) | T211 |
| Chuyển `lib/csv.js` sang shared, API re-export | T207b |
| Index/trigger SQL thô: kiểm `migrate dev --create-only`, test `pg_indexes`/`pg_trigger`, dòng README, chú thích `matches` (§11b) | T203 |
| Cùng origin (§1.1): client gọi `/api/*` tương đối + proxy Vite khi dev | Task dựng khung web đầu tiên của GĐ3 (T301) |
| Cùng origin (§1.1): rewrite `/api/*` trong `vercel.json` | T706 |
| Test đồng thời: hai kịch bản §5.5, GV nhận hai đề tài khi còn 1 suất (§6), `cancel` ‖ `accept` lời mời (§5.3) | T214 |

---

## 12. Giả định

G1, G2, G3, G11, G12, G13, G14: **đã xác nhận (người dùng, 2026-11-01)**, `CAU_HOI.md` #2–#6 – không còn là giả định, code vẫn giữ cấu hình theo đợt ở chỗ có tham số. Các mục còn lại vẫn là giả định của kiến trúc sư.

| # | Giả định | Lý do |
|---|---|---|
| G1 | **Đã xác nhận (người dùng, 2026-11-01).** `REQUEST_ADVISOR` yêu cầu hồ sơ đạt `topicSubmitSchema` | FR05 chỉ cho sửa ở Nháp/Cần chỉnh sửa; ở Đã có GVHD không sửa được và không có đường quay về Nháp, nên nếu hồ sơ thiếu thì kẹt. GV cũng cần nội dung đầy đủ để quyết định |
| G2 | **Đã xác nhận (người dùng, 2026-11-01).** `RESUBMIT` không giới hạn thời gian; `reviewDeadline` không chặn quyết định của cán bộ | Lý do chính là tránh kẹt: ở NEEDS_REVISION chỉ có một đường ra là `RESUBMIT` (`transitions.js:12`). Nếu chặn theo thời gian thì đề tài kẹt vĩnh viễn, không hủy được và cũng không đóng được. Tương tự, chặn quyết định sau `reviewDeadline` sẽ làm đề tài kẹt ở UNDER_REVIEW. Câu "chỉ gửi được trong thời gian mở đăng ký" (FR05) được áp cho lần gửi đầu (SUBMIT_FOR_REVIEW, cùng FR16.5) |
| G3 | **Đã xác nhận (người dùng, 2026-11-01).** Kho chung (FR08) cần đăng nhập (mọi vai trò) | An toàn mặc định; nếu khoa muốn công khai Internet chỉ cần bỏ `requireAuth` + thêm limiter theo IP |
| G4 | GV xem kết quả FR06 như sinh viên (hồ sơ chờ của nhóm khác bị ẩn) | Mục 3 chỉ cho cán bộ thấy đầy đủ; GV không có vai trò xét duyệt |
| G5 | Cán bộ cho phép gửi với cờ "chưa kiểm tra" (mục 3) để sang GĐ6 | Cần thêm trường DB, luồng tự chạy lại và nới trigger snapshot (§11b). GĐ2 giữ quy tắc an toàn: lỗi thì không gửi được. Hợp đồng: **T600**; hiện thực: **T609**. Ràng buộc thiết kế ở §14 |
| G6 | Cán bộ không thấy đề tài DRAFT | Nháp chưa gửi tới ai; giảm lộ dữ liệu |
| G7 | Lời mời chỉ ở DRAFT; số thành viên cố định từ khi gửi đề nghị GVHD | Tránh thay đổi nhóm sau khi GV đã nhận; đổi thành viên sau đó đi qua FR21 (GĐ6) |
| G8 | Mọi thành viên hiện hành sửa được nháp; chỉ trưởng nhóm mời, gửi, rút, đổi trưởng nhóm | FR03 chỉ giới hạn "gửi hồ sơ"; khóa lạc quan chống ghi đè |
| G9 | Mã đề tài sinh khi tạo nháp (sequence), chấp nhận khoảng trống mã. Số thứ tự **tăng liên tục qua các năm**, không đánh lại từ 1 mỗi năm (ví dụ năm mới vẫn là `NCKH-2027-0153`) | `Topic.code` bắt buộc trong schema; `topic_code_seq` toàn cục, an toàn đồng thời. Muốn đánh số lại theo năm thì cần sequence riêng từng năm |
| G10 | Xác nhận nhập CSV là tất cả hoặc không | FR02 + QD §4.4 |
| G11 | **Đã xác nhận (người dùng, 2026-11-01).** Không giới hạn năm học của sinh viên; nhóm liên lớp được phép trong cùng khoa | DAC_TA mục 8 chưa chốt; giới hạn chặt hơn có thể thêm vào `roundConfig` sau |
| G12 | **Đã xác nhận (người dùng, 2026-11-01).** Thang kết quả cố định 4 mức (enum `FinalResult`) | DAC_TA mục 8 ghi "theo thang của khoa"; đổi thang cần migration, ảnh hưởng GĐ4 |
| G13 | **Đã xác nhận (người dùng, 2026-11-01).** Xét duyệt một cấp (cán bộ khoa) | DAC_TA mục 8, khớp TRANSITIONS |
| G14 | **Đã xác nhận (người dùng, 2026-11-01).** Kho so FR06 gồm mọi đề tài CLOSED (kể cả Không đạt) | Mục 3 ghi "Đã đóng (mọi năm)"; FR27.4 chỉ nói đề tài đạt "vào kho". Chọn rộng hơn để không bỏ sót trùng. Code GĐ1 đang làm vậy |

## 13. Câu hỏi đề xuất cho `CAU_HOI.md` (điều phối viên ghi)

**Đã trả lời** (người dùng, 2026-11-01, `CAU_HOI.md` #2–#6): đồng ý phương án đề xuất cho cả 5 câu dưới đây. Giữ lại để truy vết.
1. (G1) Có bắt buộc hồ sơ đầy đủ trước khi mời GVHD không? Nếu không, cần cho sửa hồ sơ ở trạng thái Đã có GVHD (lệch FR05) hoặc thêm đường quay về Nháp (lệch mục 5).
2. (G2) Gửi lại sau "Cần chỉnh sửa" có hạn không (ví dụ trước `reviewDeadline`)? Lưu ý: nếu có hạn thì phải có thêm cách xử lý đề tài quá hạn, vì "Cần chỉnh sửa" chỉ có một đường ra là gửi lại; chặn mà không có đường ra thì đề tài kẹt vĩnh viễn. Hệ thống hiện chọn không chặn.
3. (G3) Kho đề tài đã đóng đạt có công khai cho người ngoài trường (không đăng nhập) không?
4. (G14) Đề tài đóng với kết quả Không đạt có nằm trong kho so trùng không?
5. Mục 8 DAC_TA: hạn mức GV (5), số thành viên (1–5), thang kết quả, năm học/liên lớp – xác nhận giá trị (G11–G13).

## 14. Ngoài phạm vi GĐ2
Rời nhóm/xóa thành viên (FR21), thay GV (FR19), hủy (FR20), thay đổi sau duyệt (FR18), file trong snapshot (T403), thông báo (T501), thống kê (T503), OpenAPI (T701 sinh từ các schema ở §11).

Cờ "chưa kiểm tra" (G5, FR06 mục 3): hợp đồng **T600**, hiện thực **T609**. Ràng buộc thiết kế bắt buộc cho T600 (để T609 chỉ nới đúng một cột, khớp mô tả trên bảng việc):
- Cờ "chưa kiểm tra" **suy ra**, không lưu thành cột sửa được trên `Submission`: `similarityCheckId IS NULL` hoặc `similarityCheck.status = 'ERROR'`. Không thêm cột kiểu `Submission.unchecked` để job xóa sau.
- Quyết định "cán bộ cho phép gửi" (kèm lý do, người, thời điểm) lưu thành **bản ghi mới** (bảng riêng hoặc `AuditLog`), không UPDATE `Submission` hay `SimilarityCheck`.
- Job chạy lại FR06 **chèn** một dòng `SimilarityCheck` mới rồi trỏ `Submission.similarityCheckId` sang dòng đó. Không UPDATE/DELETE `SimilarityCheck`, nên trigger `similarity_check_immutable` giữ nguyên.
- Nới trigger `submission_immutable` (§11b) chỉ cho phép cập nhật `similarityCheckId` từ NULL hoặc một lần kiểm ERROR sang một lần kiểm OK mới; mọi cột khác vẫn bất biến.
