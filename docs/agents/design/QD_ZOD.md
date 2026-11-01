# QĐ-ZOD – Nâng `zod` 3 → 4 và giới hạn kích thước đầu vào

- Task: T199 · NFR02 · Người quyết định: kien-truc-su · Ngày: 2026-11-01 (sửa vòng 1 và vòng 2 cùng ngày)
- Trạng thái quyết định: **ĐỀ XUẤT** (chờ RV, BM duyệt vòng 3)
- Lỗ hổng: GHSA-mrhx-c7xc-m3w5 · high · CWE-770 · CVSS 7.5 · "Zod can exhaust memory while validating oversized constrained collections" · ảnh hưởng `zod <4.6.6`, bản sửa `4.6.7` (RV và BM đã xác nhận bằng `npm audit` và `npm view`). Đang cài `zod@3.25.76`, khai báo `^3.23.8` ở `packages/shared` và `apps/api`.
- QĐ này cũng duyệt thư viện (theo CLAUDE.md, mục "Công nghệ"):
  - `zod ^4.6.7`;
  - `multer ^2.5.0` (cấm 1.x);
  - `express-rate-limit ^8` (nâng từ 7.5.1).

## 1. Quyết định

1. **Nâng lên zod 4**: `"zod": "^4.6.7"` (bản mới nhất, cao hơn bản vá tối thiểu 4.6.6). `packages/shared` và `apps/api` (sau này cả `apps/web`) khai báo **cùng một khoảng phiên bản**. `npm ls zod` chỉ được ra một bản (deduped).
2. **Không dùng** đường phụ `zod/v4` có sẵn trong 3.25.x: `npm audit` tính theo version của gói nên vẫn báo lỗi, và bản chụp đó cũ hơn bản vá.
3. **Không ở lại zod 3 + chỉ giới hạn body.** BM đã đo: dù giới hạn body 100kb, một request 90 KB vẫn sinh 45.001 issue và response 2,3 MB. Trên 4.6.7 chỉ còn 1 issue, 57 B.
4. **Vẫn làm thêm các lớp phòng thủ ở §4 và §5.** Bản nâng cấp chỉ vá đúng lỗi đã công bố; giới hạn kích thước, tần suất, đồng thời và độ phức tạp mới chặn được cả nhóm tấn công làm cạn tài nguyên.
5. Frontend (GĐ3) dùng `@hookform/resolvers` **≥ 5.2.0** (nhận diện được schema zod 4).
6. Các lỗ hổng audit còn lại (vitest/tinypool/vite/esbuild, đều là devDependency) giao cho **T216**. T215 chỉ phải chứng minh GHSA-mrhx-c7xc-m3w5 đã hết.

## 2. Đánh giá mức phá vỡ (RV và BM đã kiểm trên 4.6.7)

Có 3 file dùng zod: `packages/shared/src/schemas.js`, `apps/api/src/config/env.js`, `apps/api/src/middlewares/validate.js`.

| Chỗ dùng | zod 4 | Việc cần làm |
|---|---|---|
| `schemas.js:23` `z.string({ required_error: 'Chọn lĩnh vực' })` | Tùy chọn bị **bỏ qua im lặng**, ra "Invalid input: expected string, received undefined" | `z.string({ error: 'Chọn lĩnh vực' })` |
| `.min/.max/.regex/.refine(…, 'msg')` | Vẫn nhận tham số dạng chuỗi | Không đổi. Khi cần truyền đối tượng thì dùng `{ error, abort }`, không dùng `message` |
| `.optional().default('')`, `.default([])` | Trả thẳng giá trị mặc định, không chạy qua schema bên trong | Không ảnh hưởng. Xem §5.7 |
| `z.enum`, `z.array().min().max()`, `.trim()`, `z.object()` (bỏ khóa lạ) | Giữ nguyên. `array.max()` **cắt sớm theo độ dài**, phần tử không bị kiểm | Không đổi |
| `z.coerce.number()` | Giữ nguyên (`''` → 0) | Không đổi. Tham số phân trang xem §5.10 |
| `z.coerce.boolean()` (`ENABLE_SWAGGER`) | Lỗi tiềm ẩn: `"false"` → `true`. Hiện chưa có code đọc biến này | `z.stringbool().default(false)`. Nhận (không phân biệt hoa thường) `true/false/1/0/yes/no/on/off/y/n/enabled/disabled`. Giá trị lạ **và chuỗi rỗng** (`ENABLE_SWAGGER=`) làm `loadEnv` ném lỗi lúc khởi động (fail-fast, chấp nhận). `.env.example` ghi chú: "chỉ `true`/`false`; không dùng thì bỏ hẳn dòng, không để rỗng" |
| `error.issues`, `issue.path`, `issue.message` | Giữ nguyên | Thêm `.slice(0, 50)` trong `validate.js` (§4.5) |
| Thông điệp mặc định | Đổi câu chữ | `z.config(z.locales.vi())` **ở đầu `packages/shared/src/schemas.js`**. Chấp nhận `env.js` có thể ra thông điệp tiếng Anh (log khởi động, không phải giao diện) |

Phá vỡ thật chỉ có 1 dòng. Phần còn lại là cải tiến.

## 3. Khả năng tương thích
- `@hookform/resolvers` ≥ 5.2.0 + `react-hook-form` 7.x chạy được với zod 4.
- Prisma, Express 5, Vitest không phụ thuộc zod.
- `z.toJSONSchema()` có sẵn cho Swagger.
- `express-rate-limit` 8: giữ các tùy chọn `windowMs`, `limit`, `standardHeaders`, `legacyHeaders`, `handler`, `keyGenerator`. Thêm `ipv6Subnet` (mặc định 56). Nếu tự viết `keyGenerator` dựa trên IP thì phải dùng `ipKeyGenerator(req.ip)`.

## 4. Giới hạn ở mọi đường vào (bắt buộc)

Cột "Task" cho biết ai áp dụng. T215 chỉ làm những gì làm được ngay trên code hiện có.

### 4.1 Body JSON (T215)
- `express.json({ limit: '100kb' })`, hạ từ 1mb. Trường dài nhất là `summary` 5000 ký tự, cả hồ sơ dưới 50 KB.
- Route cần lớn hơn thì dùng parser riêng ở route đó (§4.3), không nới giới hạn chung.

### 4.2 Lỗi quá cỡ, lỗi upload, lỗi tần suất
Mọi lỗi dưới đây có mã chuẩn, thông điệp tiếng Việt, **không** rơi vào 500 và **không** ghi log mức error:

| Nguồn lỗi | Cách bắt | HTTP · `code` · `message` | Task |
|---|---|---|---|
| body-parser `err.type === 'entity.too.large'` | Trong `errorHandler` | 413 · `PAYLOAD_TOO_LARGE` · "Dữ liệu gửi lên quá lớn" | T215 |
| Rate limit | `express-rate-limit` mặc định tự `res.send` chuỗi tiếng Anh, không gọi `next`. Vì vậy **mọi limiter phải tạo qua một factory dùng chung** `createLimiter({ windowMs, limit, keyBy })` trong `apps/api/src/middlewares/rateLimit.js`, với `handler: (_req, _res, next) => next(new AppError(429, 'RATE_LIMITED', 'Thao tác quá nhiều lần, vui lòng thử lại sau'))`. Cấm gọi `rateLimit()` trực tiếp | 429 · `RATE_LIMITED` · như trên | T215 (factory + login + change-password) |
| Lỗi multer | Bọc middleware multer **ở route**: `(req, res, next) => upload(req, res, (err) => next(err && toUploadError(err)))`. `toUploadError`: `err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE'` → 413, **mọi lỗi khác** từ multer/busboy (mọi mã `MulterError` khác, "Unexpected end of form", `STREAM_DESTROYED`…) → 400. Bắt theo lớp và theo nguồn, không liệt kê từng mã | 413 · `PAYLOAD_TOO_LARGE` · "File vượt quá dung lượng cho phép" / 400 · `VALIDATION_ERROR` · "Dữ liệu tải lên không hợp lệ" | T403 (lần đầu có multer) |
| Đang có lượt nhập CSV khác (§4.4) | Trong service | 409 · `IMPORT_IN_PROGRESS` · "Đang có lượt nhập khác, vui lòng thử lại sau" | T207 |
| Lỗi 4xx khác của body-parser/http-errors (`err.expose`, gzip hỏng, content-encoding/charset lạ) | Trong `errorHandler`, log mức warn | 415 · `UNSUPPORTED_MEDIA_TYPE` · "Định dạng dữ liệu gửi lên không được hỗ trợ" / status khác · `BAD_REQUEST` · "Yêu cầu không hợp lệ" (quy tắc ánh xạ sau này: API_GD2 §2) | BUG-001 |

T200 ghi `PAYLOAD_TOO_LARGE`, `RATE_LIMITED`, `IMPORT_IN_PROGRESS` vào danh sách mã lỗi chuẩn.

### 4.3 Multipart: upload báo cáo (T403) và file CSV (T207)
1. **Thư viện**: `multer ^2.5.0`. **Cấm 1.x**, kể cả `1.4.5-lts.x`: bản này đã deprecated, có nhiều lỗ hổng và lọt khỏi `npm audit` vì là prerelease. `multer <=2.4.0` có 8 advisory high, trong đó GHSA-qvfw-j98x-7q72 vượt được `fileSize` khi `fileFilter` bất đồng bộ.
2. Chỉ gắn multer ở route upload, không gắn toàn cục.
3. **Thứ tự middleware bắt buộc**: `requireAuth` → limiter (§4.6) → kiểm vai trò và quan hệ với đề tài (chỉ dựa trên tham số URL, chưa đọc body) → multer (bọc như §4.2) → kiểm nội dung file (mục 6) → `validate(schema)` cho field văn bản → handler. Như vậy người chưa đăng nhập hoặc người ngoài đề tài bị 401/403 **trước khi** file được đọc vào RAM.
4. `limits` bắt buộc (`parts` = fields + files):

   | Route | `fileSize` | `files` | `fields` | `fieldSize` | `parts` | `fieldNameSize` |
   |---|---|---|---|---|---|---|
   | Upload báo cáo (T403) | **10 MB** (DAC_TA dòng 226, FR11), lấy mức thấp hơn nếu gói Cloudinary giới hạn thấp hơn (DAC_TA dòng 238) | 1 | ≤ 10 | 10 KB | ≤ 12 | 100 |
   | Nhập CSV (T207) | **1 MB** | 1 | ≤ 5 | 1 KB | ≤ 7 | 100 |

5. `fileFilter`:
   - Nếu có thì phải **đồng bộ**: gọi `cb` ngay trong lượt gọi, không `await`, không I/O.
   - Chỉ lọc sơ bộ theo whitelist đuôi file (mục 6).
   - Không tin `mimetype` do client gửi.
6. Kiểm nội dung **sau khi multer xong**, trên `req.file.buffer` (`memoryStorage`, đã bị chặn bởi `fileSize`). Không khớp thì trả 400 `VALIDATION_ERROR` "Loại file không được hỗ trợ".

   | Đuôi (không phân biệt hoa thường) | Điều kiện nội dung |
   |---|---|
   | `.pdf` | 5 byte đầu là `%PDF-` |
   | `.docx` / `.pptx` / `.xlsx` | 4 byte đầu là `PK\x03\x04`, **và** buffer chứa chuỗi tên mục `[Content_Types].xml`, **và** chứa tiền tố tương ứng `word/` / `ppt/` / `xl/`. Tên mục trong central directory của ZIP lưu không nén, nên chỉ cần `buffer.includes(...)`. **Không giải nén** (chống zip bomb) |
   | `.csv` (T207) | Giải mã được bằng `new TextDecoder('utf-8', { fatal: true })`, không chứa byte `0x00`, bỏ BOM đầu nếu có |

7. Field văn bản trong multipart không đi qua `express.json`, nên vẫn phải qua `validate(schema)` theo §5.
8. Cloudinary: `resource_type: 'raw'`, `type: 'authenticated'` (FR24). Chi tiết thuộc T403.

### 4.4 Nhập CSV tài khoản (T207, FR02)
1. Đầu vào là một file qua multipart (§4.3, 1 MB). **Tối đa 2.000 dòng dữ liệu.** Vượt mức thì trả 400 ngay, chưa parse từng dòng.
2. Mỗi dòng parse bằng schema dùng chung trong `packages/shared` (§5).
3. Response xem trước có dạng `{ validCount, errorCount, errors: [{ row, field, message }], preview: [...] }`. `errors` và `preview` mỗi mảng **tối đa 100 mục**; `errorCount` luôn là tổng thật.
4. Bước xác nhận:
   - kiểm lại toàn bộ nội dung từ đầu, không tin kết quả xem trước;
   - băm Argon2 **trước** transaction, rồi ghi trong **một transaction ngắn**;
   - ràng buộc unique của mã và email bảo đảm gửi lại không tạo trùng; lần gửi lại báo lỗi theo dòng "đã tồn tại".
5. **Giới hạn đồng thời toàn tiến trình** (mọi người dùng, mọi khoa):
   - **Chỉ một lượt xác nhận nhập chạy tại một thời điểm.** Dùng một cờ hoặc mutex khai báo **ở mức module** (`apps/api/src/modules/accounts/importLock.js`), không tạo trong handler. Lượt khác đến trong lúc đang chạy thì trả ngay 409 `IMPORT_IN_PROGRESS`, không xếp hàng. Cờ được nhả trong `finally`.
   - Trong lượt đang chạy: **tối đa 2 phép băm song song**.
   - Hệ quả: tổng số phép băm của nhập CSV ≤ 2 trên toàn tiến trình, luôn chừa ≥ 2 trong 4 luồng threadpool libuv cho `login`/`change-password`.
   - Test bắt buộc của T207: gửi 2 request xác nhận đồng thời thì một request nhận 409, và bộ đếm số băm đang chạy (dùng hasher giả có đếm) không bao giờ vượt 2.
   - Không tăng `UV_THREADPOOL_SIZE`. Lý do: giới hạn trên đã đủ, và biến này phải đặt trước khi tiến trình khởi động, khác nhau giữa Render và Windows. Không đáng thêm cấu hình.
6. Rate limit: xem trước và xác nhận, mỗi loại 10 lần / 15 phút / người dùng (§4.6).
7. **Mật khẩu tạm** cho tài khoản tạo mới hoặc reset (áp dụng cả T207 tạo lẻ và reset):
   - sinh bằng `crypto.randomInt`/`crypto.randomBytes`, ≥ 12 ký tự, có cả chữ và số (để thỏa `changePasswordSchema`);
   - không lưu bản rõ, chỉ lưu hash; đặt `mustChangePassword: true` (FR02);
   - chỉ trả **một lần** trong response xác nhận (JSON hoặc CSV tải về), kèm `Cache-Control: no-store`;
   - không ghi vào log, `AuditLog` hay `StatusHistory` (pino không log body; không đưa mật khẩu vào message lỗi).

   Việc có xuất mật khẩu tạm ra CSV hay không là quyết định nghiệp vụ của T207. Nếu xuất thì phải theo các quy tắc trên.
8. CSV xuất ra dùng `escapeCell` của `lib/csv.js` (FR14) và có BOM UTF-8.

### 4.5 Phản chiếu lỗi (T215)
`validate.js` chỉ đưa tối đa **50 issue đầu** vào `details` (`parsed.error.issues.slice(0, 50)`).

### 4.6 Rate limit
Chi phí Argon2 gần như không phụ thuộc độ dài mật khẩu (BM đo: 21 ms với 10 ký tự, 23 ms với 1.000.000 ký tự). Đường DoS thật là **tần suất** và **đồng thời** (§4.4.5). Mọi limiter tạo qua factory §4.2.

| Endpoint | Giới hạn | Khóa | Thứ tự | Task |
|---|---|---|---|---|
| `POST /api/auth/login` | 20 / 15 phút | IP, gộp IPv6 theo subnet (`ipv6Subnet: 56`, mặc định của v8) | limiter → `validate` | **T215** (chuyển sang factory + v8) |
| `POST /api/auth/change-password` | 5 / 15 phút | `req.user.id` | `requireAuth` → limiter → `validate` | **T215** |
| Reset mật khẩu, tạo tài khoản lẻ | 30 / 15 phút | `req.user.id` | `requireAuth` → limiter → kiểm quyền | T207 |
| Nhập CSV: xem trước / xác nhận | 10 / 15 phút mỗi loại | `req.user.id` | §4.3.3 | T207 |
| Upload báo cáo | 20 / 15 phút | `req.user.id` | §4.3.3 | T403 |

Rủi ro `trust proxy` (chuyển cho T706/T703, ngoài phạm vi T215):
- `app.set('trust proxy', 1)` chỉ đúng khi có đúng 1 proxy trước Render.
- Nếu chuỗi thật là Vercel rewrite → proxy của Render, `req.ip` có thể là IP của hạ tầng. Khi đó limiter đăng nhập thành giới hạn **chung cho mọi người**: ai cũng chặn được đăng nhập toàn hệ thống.
- **T706** ghi số hop thực tế vào hướng dẫn deploy. **T703** xác minh trên staging (log `req.ip` so với IP client) rồi chỉnh `trust proxy`.

### 4.7 Query (T215 áp dụng cho schema mới)
Express 5 dùng bộ phân tích `simple` (`querystring`, tối đa 1000 khóa, không dựng object lồng). Giữ nguyên. Khóa lặp lại thành mảng, nên schema phải theo §5.10.

## 5. Ràng buộc bắt buộc cho mọi schema (hiện tại và tương lai)

RV, BM, KTS coi vi phạm là **MAJOR**.

1. Mọi `z.string()` nhận dữ liệu từ client phải có `.max(n)`. `.max()` phải đứng **trước mọi `regex`/`refine`/`superRefine`/`transform`**; `.trim()` và `.min()` đứng trước nó được. Mức chuẩn:
   - mã/ID 64;
   - tên, tiêu đề 300; email 254;
   - từ khóa 60;
   - lý do, nhận xét 2000;
   - mục tiêu 3000;
   - tóm tắt 5000;
   - mật khẩu 128;
   - tìm kiếm tự do 200.

   Mức 128 cho mật khẩu là vệ sinh đầu vào và khớp UI, không phải chống DoS Argon2 (§4.6).
2. Mọi `z.array()` phải có `.max(n)` nhỏ theo nghiệp vụ (keywords ≤ `maxKeywords`, thành viên ≤ `maxMembers`, …). Phần tử cũng phải tuân quy tắc 1.
3. Không dùng `z.record()`/`z.map()`/`z.set()` với khóa tùy ý từ client. Nếu bắt buộc phải dùng thì giới hạn số khóa bằng `.refine` theo quy tắc 9.
4. Không dùng `z.any()`/`z.unknown()` cho trường từ client, trừ khi có schema con kiểm lại ngay.
5. ID dùng `z.string().max(64)` hoặc một định dạng cụ thể.
6. Thông điệp tự viết bằng tiếng Việt. Tùy chọn dạng đối tượng dùng `error`; không dùng `message`/`required_error`/`invalid_type_error`/`errorMap`.
7. Giá trị `.default()` phải tự hợp lệ với schema.
8. Schema dùng chung chỉ đặt ở `packages/shared/src/schemas.js`. Các trường dùng chung giữa nháp và gửi lấy từ cùng một hằng/biến.
9. **Check tốn kém sau `.max()`.** Trên zod 4, `regex`/`refine` **vẫn chạy** sau khi `.max()` đã báo lỗi.
   - (a) Regex phải tuyến tính: không lồng lượng từ (`(a+)+`, `(a|a)*`), không backreference. Reviewer kiểm từng regex.
   - (b) Nếu phía sau `.max()` có `refine`/`superRefine`/`transform` không phải O(n) đơn giản thì dùng `.max(n, { error: '…', abort: true })`.
   - (c) Không truy vấn DB, gọi mạng hay chạy thuật toán nặng (TF-IDF, similarity) trong `refine`. Những việc đó đưa xuống service.
10. **Schema query** dùng `validate(schema, 'query')`, kết quả nằm ở `req.validated`.
    - Trường đơn khai báo `z.string().max(n)`, nên khóa lặp (thành mảng) bị 400.
    - Phân trang: `pageSize` dùng `z.coerce.number().int().min(1).max(100)`; `page` dùng `.int().min(1).max(10000)`.
    - Bộ lọc dùng `z.enum`.

### Chỗ đang vi phạm, sửa trong T215 (con số cố định)

| Schema.trường | Sửa thành |
|---|---|
| `loginSchema.identifier` | `.max(300)` |
| `loginSchema.password` | `.max(128)` |
| `changePasswordSchema.currentPassword`, `changePasswordSchema.newPassword` | `.max(128)` (`newPassword`: `.min(8).max(128)` rồi mới `.regex`) |
| `topicSubmitSchema.summary` | `.trim().max(5000, { error: 'Tóm tắt tối đa 5000 ký tự', abort: true })` trước `.refine(countWords)` |
| `topicSubmitSchema.objectives` | `.max(3000)` (trùng bản nháp) |
| phần tử `topicSubmitSchema.keywords` | `.max(60)` (trùng bản nháp) |
| `topicDraftSchema.fieldId`, `topicSubmitSchema.fieldId` | `.max(64)` |

## 6. Phạm vi T215 (BE, review RV + BM, phụ thuộc T199; phải xong trước T206/T209)

Chỉ gồm việc làm được ngay trên code hiện có. Phần multer, CSV, upload, trust proxy thuộc T403/T207/T703/T706 như đã ghi ở §4.

Việc:
1. Nâng `zod ^4.6.7` ở `packages/shared` và `apps/api`. Nâng `express-rate-limit ^8` ở `apps/api`.
2. `required_error` → `error`.
3. `ENABLE_SWAGGER` → `z.stringbool().default(false)`, cập nhật ghi chú `.env.example` (§2).
4. `z.config(z.locales.vi())` ở đầu `schemas.js`.
5. Thêm `.max()` theo bảng §5.
6. `express.json` 100kb.
7. `errorHandler`: `entity.too.large` → 413.
8. `validate.js`: `.slice(0, 50)`.
9. Factory `createLimiter` (§4.2), cho `/login` dùng (IP, `ipv6Subnet: 56`). Thêm limiter `/change-password` 5/15 phút theo `req.user.id`, đặt sau `requireAuth`.

Test bắt buộc:
- `apps/api/tests/security/T199-input-size.test.js`: đổi cả **5 `it.fails` → `it`**, tất cả xanh, không làm yếu điều kiện kiểm. Test mảng 45.000 phần tử thêm điều kiện `r.text.length < 1024`.
- `apps/api/tests/security/T199-rate-limit.test.js`: đổi cả **2 `it.fails` → `it`** (429 có `error.code === 'RATE_LIMITED'`; đổi IPv6 trong cùng /64 vẫn bị 429), tất cả xanh.
- `keywords` 5.000 phần tử `"a"` → 400 `VALIDATION_ERROR`. Test đơn vị: `z.array(z.string().refine(spy)).max(2)` với 10.000 phần tử thì spy chạy 0 lần.
- `summary` 5001 ký tự → đúng 1 issue (`countWords` không chạy).
- Thiếu `fieldId` → "Chọn lĩnh vực".
- `loadEnv`: `ENABLE_SWAGGER: 'false'` → `false`; `'abc'` → ném lỗi; `''` → ném lỗi.
- `/change-password` lần thứ 6 trong 15 phút → 429 `RATE_LIMITED`.

Bằng chứng: `npm ls zod` (một bản 4.x), `npm ls express-rate-limit` (8.x), `npm audit` (không còn GHSA-mrhx-c7xc-m3w5), `npm test` xanh.

Yêu cầu chuyển cho task khác (T200 ghi vào hợp đồng):

| Task | Phần QĐ phải áp dụng |
|---|---|
| T200 | Mã lỗi `PAYLOAD_TOO_LARGE`, `RATE_LIMITED`, `IMPORT_IN_PROGRESS`; request theo §5; route upload và CSV ghi thứ tự middleware §4.3.3 |
| T207 | §4.3 (CSV), §4.4 toàn bộ (giới hạn đồng thời toàn tiến trình, mật khẩu tạm), §4.6 (reset, tạo, CSV) |
| T403 | §4.3 toàn bộ (multer `^2.5.0`, `fileFilter` đồng bộ, kiểm nội dung sau multer, thứ tự middleware), bắt lỗi multer theo §4.2, rate limit upload §4.6 |
| T703 | Xác minh `req.ip` thật và `trust proxy` trên staging (§4.6); rà lại các quy tắc §4 trên toàn bộ endpoint |
| T706 | Ghi số hop proxy thực tế (Vercel → Render) vào hướng dẫn deploy |

## 7. Giả định
- Rate limit, cờ nhập CSV và semaphore băm chạy **trong bộ nhớ tiến trình**, vì Render chạy 1 instance. Khi nhân bản instance phải chuyển sang store hoặc khóa dùng chung (vd advisory lock Postgres). Code phải ghi `// shortcut: chỉ đúng với 1 instance, đổi sang store/khóa dùng chung khi scale ngang`.
- Mức 2.000 dòng/CSV và 2 phép băm song song cho một lần nhập kết thúc trong khoảng 21 giây (2.000 × 21 ms / 2), tốn khoảng 38 MiB RAM cho Argon2. Một khoa có vài trăm sinh viên mỗi đợt nên đủ; nhiều hơn thì chia file.
- Nếu nâng `express-rate-limit` 8 gặp xung đột không lường trước, T215 được giữ 7.x và tự viết `keyGenerator` gộp IPv6 theo /56. Bắt buộc vẫn phải qua test IPv6. Ghi lý do vào báo cáo.
