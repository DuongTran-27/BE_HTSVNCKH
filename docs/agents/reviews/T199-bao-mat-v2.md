# Review T199 – bao-mat – vòng 2
Kết luận: CHANGES_REQUESTED

Tóm tắt: V1–V9 đều đã xử lý đúng. Tôi đã tự kiểm lại các khẳng định kỹ thuật mới trên zod 4.6.7 và tất cả đều đúng. Nhưng phần mới §4.3 (multipart) và §4.4 (CSV) tạo ra **2 điểm MAJOR**:
- §4.3 dựa vào `limits.fileSize` của multer mà không ghim phiên bản. `multer <=2.4.0` đang có 8 advisory **high**, trong đó có một lỗi **vượt giới hạn `fileSize`** (GHSA-qvfw-j98x-7q72). Còn `multer@1.4.5-lts.2` thì `npm audit` không phát hiện được.
- §4.4 chỉ giới hạn "2 phép băm song song" trong **từng request**. Hai lần nhập chạy cùng lúc sẽ chiếm hết 4 luồng threadpool, làm đăng nhập treo khoảng 20 giây.

Ngoài ra còn 6 điểm MINOR. Có 2 điểm tôi đã chứng minh bằng test: 429 chưa ra mã chuẩn, và limiter đăng nhập bị vượt bằng IPv6.

Không có BLOCKER: chưa route nào dùng multer hay nhập CSV. Các lỗi đã chứng minh nằm ở code có sẵn và được giao T215/T703.

## Tôi đã tự kiểm tra

File đã đọc (không đọc `.env`):
- `docs/agents/reviews/T199-bao-mat-v1.md`, `docs/agents/design/QD_ZOD.md` (bản sửa), `docs/agents/reports/T199.md` (mục "Vòng sửa 1", "Bằng chứng bổ sung");
- `docs/agents/BANG_CONG_VIEC.md` (T200, T206, T207, T215, T216, T403, T703), `docs/DAC_TA.md` (FR02, FR11, FR14, dòng 226–227);
- `apps/api/src/{app.js, middlewares/validate.js, modules/auth/routes.js, modules/auth/service.js}`, `packages/shared/src/schemas.js`, `apps/api/package.json`, `apps/api/tests/helpers.js`, `apps/api/tests/security/T199-input-size.test.js`.

Các khẳng định mới của QD, kiểm trên zod 4.6.7 (cài riêng ở scratchpad, không đụng repo):
```
summary = z.string().trim().max(5000, { error, abort: true }).refine(countWords…)
  6000 ký tự      → 1 issue ['Tóm tắt tối đa 5000 ký tự'], refine calls 0     ← §5.9b, bảng vi phạm ĐÚNG
  'a b'           → ['Tóm tắt tối thiểu 100 từ'], calls 1
  trong z.object cùng title quá dài → 2 issue, refine calls 0
newPassword .min(8).max(128).regex.regex, '!'×200 → 3 issue (regex tuyến tính, không cần abort)
keywords 45.000 phần tử sai kiểu, .max(10) → 1 issue
query { status: ['a','b'] } với z.string().max(30) → success=false   ← §5.10 ĐÚNG
query { pageSize: ['5','6'] } với z.coerce.number().int().min(1).max(100) → false
z.stringbool().default(false): undefined → false; 'abc' → không hợp lệ   ← §2 ĐÚNG
```
Bảng vi phạm §5 đối chiếu với `schemas.js`: đủ mọi chuỗi chưa có `.max()`. Gồm `identifier`, `password`, `currentPassword`, `newPassword`; ở `topicSubmitSchema` là `summary`, `objectives`, phần tử `keywords`, `fieldId`; và `topicDraftSchema.fieldId`. `validate.js` đã gán query vào `req.validated`, không ghi `req.query` (getter chỉ đọc trong Express 5), nên §5.10 làm được ngay.

Kiểm phần mới về multer, rate limit, threadpool:
```
$ npm view multer version → 2.5.0
$ (scratchpad) multer@2.0.1 → npm audit:
  multer <=2.4.0  Severity: high
  GHSA-fjgf-rc76-4x9p, GHSA-xf7r-hgr6-v32p, GHSA-v52c-386h-88mc, GHSA-5528-5vmv-3xc2,
  GHSA-72gw-mp4g-v24j, GHSA-3p4h-7m6x-2hcm, GHSA-wc9g-mqfw-jrwm,
  GHSA-qvfw-j98x-7q72 "file size limit bypass via async fileFilter race condition"
$ (scratchpad) multer@1.4.5-lts.2 → npm audit: found 0 vulnerabilities   ← bản prerelease lọt khỏi audit
$ npm view multer@1.4.5-lts.2 deprecated → "Multer 1.x is impacted by a number of vulnerabilities, ... upgrade to the latest 2.x"
$ npm ls express-rate-limit → 7.5.1
node_modules/express-rate-limit/dist/index.mjs:627-640:
  keyGenerator → return request.ip (IP đầy đủ, không gộp /64)
  handler → response.status(429); response.send("Too many requests, please try again later.")  (không gọi next(err))
```

Test tấn công mới, giữ lại: `apps/api/tests/security/T199-rate-limit.test.js`, gồm 2 test `it.fails`, theo cùng quy ước với vòng 1 để không làm đỏ `npm test`. Khi bỏ `.fails`, cả hai đều đỏ và cho đúng lỗi cần chứng minh:
```
× lần đăng nhập thứ 21 trả 429 với mã chuẩn RATE_LIMITED
    → status 429 nhưng TypeError: Cannot read properties of undefined (reading 'code')  (body là text tiếng Anh)
× đổi địa chỉ IPv6 trong cùng /64 không vượt được giới hạn đăng nhập
    → expected [401, 401, …(25 lần)] to include 429   (25 lần thử mật khẩu, giới hạn 20, không bị chặn)
```
Lưu ý: lần chạy đầu, test IPv6 xanh giả. Lý do là cả 25 lần thử dùng cùng tài khoản SV001, nên chạm khóa theo tài khoản (`service.js:31` cũng trả 429 `TEMP_LOCKED`). Tôi đã sửa thành dò rải nhiều tài khoản, và chính kịch bản này là kiểu tấn công mà limiter theo IP phải chặn.

```
$ cd apps/api && npx vitest run tests/security → Test Files 2 passed, Tests 8 passed
$ npm test → shared: Test Files 1 passed, Tests 5 passed; api: Test Files 6 passed, Tests 47 passed
```

## Kiểm từng vấn đề vòng 1
| # | Đã xử lý? | Ghi chú |
|---|---|---|
| V1 multipart | Đạt, nhưng có thiếu sót mới | §4.3 có bảng `limits` đúng con số FR11 (10 MB) và chỉ gắn multer ở route. Thiếu ghim phiên bản (N1), thiếu rate limit upload và thứ tự middleware (N4). Magic bytes chưa đủ với OOXML (N5) |
| V2 CSV | Đạt, nhưng có thiếu sót mới | Đủ các con số: 1 MB, 2.000 dòng, 100 lỗi, `errorCount`, kiểm lại khi xác nhận, `escapeCell` + BOM. Băm **trước** transaction là đúng: không giữ kết nối/khóa DB trong khoảng 20 giây băm. Nhưng giới hạn song song đặt theo request (N6). Mật khẩu tạm chưa có quy tắc (N7) |
| V3 regex/refine | Đạt | §5.1 + §5.9. Đã đo: `abort` chặn refine (0 lần gọi), kể cả khi nằm trong `z.object` |
| V4 test T215 | Đạt | §6 bắt đổi 5 `it.fails` → `it` và thêm `< 1 KB`. Test 5.000 phần tử và test spy 0 lần là bổ sung tốt |
| V5 query | Đạt | §4.7 + §5.10. Đã đo: mảng bị từ chối |
| V6 slice details | Đạt | §4.5, nằm trong T215 mục 8 |
| V7 lý do Argon2 | Đạt | Đã sửa lý do. §4.6 có bảng rate limit theo user cho `/change-password`. Chi tiết triển khai 429 xem N2 |
| V8 audit dev | Đạt | §1.6 → T216 (đã có trên bảng, dòng 14) |
| V9 dò tài khoản | Đạt (chuyển task) | `BANG_CONG_VIEC.md:88` T703 đã ghi "login tài khoản không tồn tại vẫn chạy verify với hash giả" |

## Đối chiếu đặc tả
| Điều kiện đạt | Đạt? | Ghi chú |
|---|---|---|
| Có quyết định rõ (phiên bản, bước chuyển, ràng buộc), ghi `design/QD_ZOD.md` | Đạt | `^4.6.7`, một bản, có bảng phá vỡ và phạm vi T215 |
| Biện pháp xử lý được GHSA-mrhx-c7xc-m3w5 | Đạt | Test của T215 (đỏ trên zod 3) chặn được việc quay lại bản cũ |
| NFR02 Zod hai phía, lỗi chuẩn | Đạt khi có T215 + N2 | 429 hiện chưa ra mã chuẩn (N2) |
| FR11 "Backend kiểm tra loại và dung lượng file" | **Chưa đủ** | Dung lượng: phụ thuộc multer chưa ghim bản (N1). Loại: magic bytes không phân biệt được DOCX/PPTX/XLSX với ZIP thường, chưa nói kiểm đuôi (N5) |
| FR02 nhập CSV, xem trước, lỗi theo dòng | Đạt về giới hạn | Thiếu giới hạn đồng thời toàn tiến trình (N6) |
| Lớp phòng thủ mới không tạo lỗ hổng mới | **Chưa** | N1, N6 |

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| N1 | MAJOR | docs/agents/design/QD_ZOD.md:158-170 | §4.3 đặt cả giới hạn bộ nhớ (memoryStorage) lên `limits.fileSize` của multer, nhưng không ghim phiên bản. `multer <=2.4.0` có 8 advisory high (DoS khi request multipart dị dạng, dọn dẹp upload hủy giữa chừng, đệ quy/field name lồng sâu…). Đặc biệt GHSA-qvfw-j98x-7q72 cho phép **vượt `fileSize` khi `fileFilter` bất đồng bộ**. Ngoài ra `multer@1.4.5-lts.2` (bản thường gặp trong hướng dẫn cũ) có `npm audit` báo 0 lỗi vì là bản prerelease, nên cổng audit của T202 cũng không bắt được | Thêm vào §4.3: `multer` **`^2.5.0`** (KTS duyệt thư viện luôn trong QD này), cấm 1.x. `fileFilter`, nếu có, phải **đồng bộ** và chỉ lọc sơ bộ theo đuôi. Kiểm magic bytes làm **sau** khi multer xong, trên `req.file.buffer`. Lỗi multer không thuộc `LIMIT_*` (vd "Unexpected end of form") → 400 `VALIDATION_ERROR`, không rơi vào 500 |
| N6 | MAJOR | docs/agents/design/QD_ZOD.md:178, 274 | "Tối đa 2 phép băm song song" chỉ đúng **trong một request**. Rate limit 10 lần/15 phút là **theo người dùng**. Theo FR02/FR25, admin và cán bộ các khoa đều có thể nhập CSV, nên 2 lần xác nhận đồng thời của 2 người = 4 phép băm, chiếm toàn bộ threadpool libuv mặc định (4 luồng: argon2, crypto, fs, dns đều dùng chung). Trong khoảng 20 giây đó, mọi `login`/`change-password` phải xếp hàng. Đây là lỗi tiềm ẩn đồng thời: một tình huống bình thường, không cần kẻ tấn công, cũng làm hệ thống treo | Ghi rõ: bộ giới hạn đồng thời là **một đối tượng dùng chung toàn tiến trình** (tạo một lần ở mức module, không tạo trong handler). Tổng số phép băm của mọi lần nhập ≤ 2, hoặc đơn giản hơn: chỉ một lần xác nhận nhập chạy tại một thời điểm, lần khác trả 429/409 "Đang có lượt nhập khác". T207 có test: 2 request xác nhận đồng thời thì số băm đang chạy không vượt 2. Tùy chọn: đặt `UV_THREADPOOL_SIZE` ≥ 8 trong lệnh start (ghi `shortcut`) |
| N2 | MINOR | apps/api/src/modules/auth/routes.js:18 ; QD_ZOD.md:154 | §4.2 viết "`express-rate-limit` → 429 `RATE_LIMITED`" như thể `errorHandler` sẽ bắt được. Thực tế handler mặc định của 7.5.1 tự `res.send` một chuỗi tiếng Anh và không gọi `next(err)`. Đã chứng minh: lần thứ 21 trả 429 với body là text, `body.error` undefined. Hiện đang sai NFR02 (lỗi chuẩn) và quy tắc 7 (thông báo tiếng Việt) | Ghi trong §4.2/§6: mọi limiter dùng chung một factory có `handler: (_req, _res, next) => next(new AppError(429, 'RATE_LIMITED', '…'))`. T215 đổi test thứ nhất trong `apps/api/tests/security/T199-rate-limit.test.js` từ `it.fails` → `it` |
| N3 | MINOR (code có sẵn, giao T703 hoặc T215) | apps/api/src/modules/auth/routes.js:18 ; app.js:20 ; QD_ZOD.md:192, 273 | §4.6 coi limiter đăng nhập 20/15 phút/IP là "đã có". Nhưng 7.5.1 khóa theo IP đầy đủ: một máy IPv6 (thường được cấp /64) đổi địa chỉ là có bucket mới. Đã chứng minh: 25 lần dò rải tài khoản, không lần nào bị 429. Store trong bộ nhớ (§7) cũng phình theo số địa chỉ. Thêm nữa, `trust proxy 1` với chuỗi Vercel rewrite → Render có thể khiến `req.ip` là IP của Vercel/Render chứ không phải IP client. Khi đó 20 lần/15 phút thành giới hạn **chung cho mọi người dùng**: ai cũng có thể chặn đăng nhập toàn hệ thống. Chưa xác minh được vì cần môi trường deploy. Bản thân store trong tiến trình thì chấp nhận được với 1 instance; §7 đã ghi `shortcut` đúng | Khóa theo /64 bằng `express-rate-limit` 8.x với `ipv6Subnet: 56` hoặc `ipKeyGenerator` (cần KTS duyệt nâng major). T703 xác minh `req.ip` thật trên môi trường staging (log thử) rồi chỉnh `trust proxy` theo số hop. Test thứ hai trong `T199-rate-limit.test.js` đổi sang `it` khi đã sửa |
| N4 | MINOR | docs/agents/design/QD_ZOD.md:168, 190-195 | §4.3 nói "tần suất bị chặn bằng rate limit route (§4.6)", nhưng bảng §4.6 **không có dòng upload báo cáo**. Thứ tự middleware cũng chưa được quy định: nếu multer đứng trước `requireAuth`, người chưa đăng nhập vẫn đẩy được 10 MB vào RAM mỗi request | Thêm dòng "Upload báo cáo (T403): vd 20 / 15 phút / người dùng" vào §4.6. Quy định thứ tự `requireAuth` → limiter → kiểm vai trò/quan hệ đề tài (nếu rẻ, chỉ cần `topicId` trong URL) → multer → `validate`, để người ngoài đề tài bị 403 trước khi file được đọc vào bộ nhớ |
| N5 | MINOR | docs/agents/design/QD_ZOD.md:170 | "Loại file kiểm bằng magic bytes" chưa đủ. DOCX/PPTX/XLSX đều là ZIP (`PK\x03\x04`), nên magic bytes không phân biệt được chúng với nhau hay với một ZIP bất kỳ. CSV không có magic bytes. Danh mục kiểm tra yêu cầu kiểm **nội dung + đuôi** | Ghi rõ: whitelist đuôi `.pdf/.docx/.pptx/.xlsx` **và** khớp chữ ký (PDF `%PDF-`; OOXML: ZIP và đuôi khớp loại). Nếu kiểm sâu hơn, chỉ đọc central directory để tìm `word/`/`ppt/`/`xl/`, không giải nén toàn bộ (chống zip bomb). CSV: đuôi `.csv`, UTF-8 hợp lệ, không chứa byte NUL. Cloudinary `resource_type: 'raw'`, `type: 'authenticated'` (FR24) |
| N7 | MINOR | docs/agents/design/QD_ZOD.md:182 | "CSV xuất ra (… mật khẩu tạm nếu có)" chưa có quy tắc cho mật khẩu tạm, một dữ liệu nhạy cảm | Ghi cho T207: sinh mật khẩu bằng `crypto.randomInt`/`randomBytes`, ≥ 12 ký tự. Chỉ trả **một lần** trong response xác nhận, không lưu bản rõ, không ghi log (pino không log body). Đặt `mustChangePassword: true` (FR02). Response có `Cache-Control: no-store` |
| N8 | MINOR (cho điều phối viên) | docs/agents/BANG_CONG_VIEC.md:19 | Mô tả T215 trên bảng chưa có các mục QD §6.7–6.9: 429 `RATE_LIMITED`, `details.slice(0, 50)`, rate limit `/change-password`. Trong khi đó, BM sẽ duyệt T215 theo QD §6 | Điều phối viên đồng bộ mô tả T215 với QD §6, và thêm "đổi `it.fails` → `it` ở test thứ nhất của `T199-rate-limit.test.js`" (N2). Tôi không sửa bảng |

Kết luận: CHANGES_REQUESTED – V1–V9 đều đã xử lý đúng, nhưng phần mới phải ghim `multer ^2.5.0` với `fileFilter` đồng bộ (N1), và đặt giới hạn băm Argon2 toàn tiến trình cho nhập CSV (N6), trước khi T403/T207 dựa vào QD_ZOD.
