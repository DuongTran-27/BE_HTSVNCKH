# Review T199 – bao-mat – vòng 1
Kết luận: CHANGES_REQUESTED

Tóm tắt: hướng chính là **nâng lên zod ≥ 4.6.6** cộng thêm giới hạn kích thước. Hướng này đúng, và tôi đã chứng minh bằng thực nghiệm rằng phương án thay thế (ở lại zod 3, chỉ giới hạn body) **không đủ**. Còn 4 điểm MAJOR phải bổ sung vào `QD_ZOD.md` trước khi T215/T200/T207/T403 dựa vào nó:
- chưa có giới hạn cho multipart (T403 dùng multer);
- giới hạn nhập CSV còn để trống;
- trong zod 4, `.max()` không chặn được `regex`/`refine` chạy trên chuỗi dài;
- test đề xuất cho T215 không phát hiện được lỗ hổng.

Không có BLOCKER. Lý do: lỗ hổng hiện **không khai thác được qua route đang mở**, vì `loginSchema` và `changePasswordSchema` không có mảng. Nó chỉ thành khai thác được khi T209 gắn `topicDraftSchema`/`topicSubmitSchema` vào route. Vì vậy T215 phải xong trước T209 (QD đã đề xuất làm trước T206–T211, tôi đồng ý).

## Tôi đã tự kiểm tra

File đã đọc: `CLAUDE.md`, `docs/agents/QUY_TRINH.md`, `docs/DAC_TA.md` (NFR01, NFR02, FR02, FR11), `docs/agents/reports/T199.md`, `docs/agents/design/QD_ZOD.md`, `docs/agents/BANG_CONG_VIEC.md` (T200–T215, T403, T703), `apps/api/src/app.js`, `server.js`, `config/env.js`, `middlewares/{auth,errorHandler,validate}.js`, `modules/auth/{routes,service}.js`, `lib/{password,csv}.js`, `packages/shared/src/schemas.js`, `apps/api/tests/helpers.js`. Không đọc `.env`.

```
$ npm ls zod
├─┬ @nckh/api -> .\apps\api       └── zod@3.25.76
└─┬ @nckh/shared -> .\packages\shared └── zod@3.25.76 deduped

$ npm audit   (trích)
zod  <4.6.6  Severity: high
Zod can exhaust memory while validating oversized constrained collections - GHSA-mrhx-c7xc-m3w5
CWE-770, CVSS 7.5 (AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H), fixAvailable zod@4.6.7 (semver major)
7 vulnerabilities (3 moderate, 2 high, 2 critical)   ← còn vitest/tinypool/vite/esbuild, ngoài phạm vi T199

$ npm ls express body-parser qs → express@5.3.0, body-parser@2.4.0
```

Thực nghiệm so sánh zod 3.25.76 (bản đang cài) với zod 4.6.7 (cài riêng ở thư mục tạm, không đụng repo). Schema dùng là `z.object({ keywords: z.array(z.string().trim().min(1).max(60)).max(10) })`, xử lý giống `validate.js`:
```
v3 array n=50000 (≈100kb):  issues=50001  details JSON=2,588,945 B  93 ms
v3 array n=500000 (≈1mb):   issues=500001 details JSON=26,388,945 B 855 ms
v4 array n=50000:           issues=1      details JSON=57 B         1 ms
v4 array n=500000:          issues=1      details JSON=57 B         0 ms
v3/v4 z.coerce.boolean().parse('false') = true      ← khẳng định ENABLE_SWAGGER ĐÚNG
v4 z.stringbool().parse('false') = false ; 'FALSE' → false
v3 z.string({required_error:'Chọn lĩnh vực'}) thiếu → "Chọn lĩnh vực"
v4 cùng code đó → "Invalid input: expected string, received undefined"  ← phá vỡ đúng như QD §2 nói
v4 z.locales.vi tồn tại; .max(3) → "Quá lớn: mong đợi string có <=3 ký tự"; z.string({error:'Chọn lĩnh vực'}) → "Chọn lĩnh vực"
```

Thực nghiệm qua HTTP (supertest, chạy trên `createApp` thật cùng `validate.js` thật):
```
POST /api/auth/login body 1.1MB  → 500 {"code":"INTERNAL",...}   ← khẳng định "quá cỡ rơi vào 500" ĐÚNG
POST /api/auth/login password 200kb → 401 (lọt qua, chưa có .max, limit vẫn 1mb)
POST (validate(topicDraftSchema), limit 100kb) keywords=[1×45000], request 90,014 B
     → 400, details 45,001 khóa, response 2,328,933 B   ← khuếch đại ~26 lần NGAY CẢ KHI đã hạ limit xuống 100kb
GET ?a[b]=1&c=1&c=2 → {"a[b]":"1","c":["1","2"]}   ← query parser "simple" ĐÚNG; nhưng c có thể là mảng
```

Khẳng định "mật khẩu ≤ 128 chống DoS CPU qua Argon2". Tôi đo `argon2.verify` với tham số của `lib/password.js` (m=19456, t=2, p=1):
```
len=10: 21.0 ms · len=128: 20.9 ms · len=100000: 20.7 ms · len=1000000: 22.9 ms
```
Kết luận: chi phí Argon2 **gần như không phụ thuộc độ dài mật khẩu**, vì mật khẩu chỉ được băm một lần qua BLAKE2b vào H0. Lý do ghi trong QD là sai. Giới hạn 128 vẫn nên giữ như một biện pháp vệ sinh, nhưng đường DoS thật của Argon2 là **tần suất gọi**. Hiện `/change-password` không có rate limit, và trong tương lai còn reset mật khẩu, nhập CSV tạo hàng loạt tài khoản.

Zod 4: `.max()` **không** dừng các check phía sau:
```
z.string().max(3).regex(/a/).refine(fn).safeParse('bbbbbbb') → issues [too_big, invalid_format], refine vẫn chạy 1 lần
z.string().max(3, { abort: true }).regex(/a/)               → issues [too_big]
z.string().max(50).regex(/^(a+)+$/).safeParse('a'×28 + '!')  → 11,025 ms   (ReDoS ngay trong giới hạn max)
```

Test bảo mật đã viết và giữ lại: `apps/api/tests/security/T199-input-size.test.js`, gồm 6 test.
- 5 test dùng `it.fails` để ghi nhận đúng các lỗi hiện tại: 413, limit 100kb, mật khẩu > 128, khuếch đại mảng, `ENABLE_SWAGGER="false"`. Tôi dùng `it.fails` để không làm đỏ `npm test` của các task khác.
- 1 test thường kiểm query parser `simple`.

**T215 phải đổi cả 5 `it.fails` thành `it`** và cả 5 phải xanh. Đây là điều kiện để BM duyệt T215.
```
$ npx vitest run tests/security   → Test Files 1 passed, Tests 6 passed
$ npm test                        → shared: 5 passed; api: Test Files 5 passed, Tests 45 passed
```

## Đối chiếu đặc tả
| Điều kiện đạt | Đạt? | Ghi chú |
|---|---|---|
| Có quyết định rõ (phiên bản, bước chuyển, ràng buộc), ghi trong `design/QD_ZOD.md` | Đạt | Nâng `^4.6.6`, đúng một bản. Tôi đã kiểm bản vá 4.6.6 và bản mới nhất 4.6.7 bằng `npm audit --json` |
| Biện pháp thực sự xử lý được GHSA-mrhx-c7xc-m3w5 | Đạt (phần nâng cấp) | Thực nghiệm: v4 trả 1 issue, v3 trả 50k issues. Ở lại v3 + limit 100kb vẫn khuếch đại 26 lần, nên quyết định loại phương án thay thế là đúng |
| NFR02 "Zod kiểm tra cả hai phía" | Đạt | Locale `vi` và `{ error }` hoạt động trên 4.6.7 |
| NFR02 "không lộ stack trace / lỗi chuẩn" | Đạt khi có T215 | 500 → 413 đã được nêu. Tôi đề xuất thêm giới hạn số mục trong `details` (V6) |
| Phủ mọi đường vào (body, query, multipart, CSV) | **Chưa** | Thiếu multipart (V1) và giới hạn CSV (V2). Quy tắc cho query chưa đủ (V5) |
| Ràng buộc schema tương lai đủ chặt | **Chưa** | `.max()` không chặn regex/refine (V3) |
| Test đề xuất cho T215 chứng minh được bản vá | **Chưa** | Xem V4 |
| Khẳng định trong báo cáo khớp kết quả tự chạy | Đạt | 1mb → 500, `coerce.boolean`, một chỗ `required_error`, Express 5 simple parser: tất cả khớp. Riêng lý do Argon2 thì sai (V7) |

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| V1 | MAJOR | docs/agents/design/QD_ZOD.md:41 | Câu "Tệp đi Cloudinary, không đi qua body JSON" dễ gây hiểu nhầm. T403 tải lên **qua backend bằng multer**. Nếu dùng `memoryStorage` mà không đặt `limits` thì không có giới hạn: một request multipart có thể làm cạn RAM. Field văn bản trong multipart cũng không đi qua `express.json`, nên giới hạn 100kb không áp dụng cho chúng. QD §4 đang bỏ sót hẳn đường vào này | Thêm §4.4 "Multipart". Bắt buộc `multer({ limits: { fileSize: <theo FR11/gói Cloudinary>, files: 1, fields: ≤10, fieldSize: ≤10kb, parts: ≤12, fieldNameSize: 100 } })`. Chỉ gắn multer ở route upload, không gắn toàn cục. Lỗi `LIMIT_*` → 413/400 với mã chuẩn. Field văn bản vẫn qua `validate()` với schema §5. Ghi yêu cầu này vào T200 và T403 |
| V2 | MAJOR | docs/agents/design/QD_ZOD.md:41 | Nhập CSV (T207) chỉ ghi "parser riêng, có giới hạn rõ" mà không có con số. Có ba rủi ro: (a) báo lỗi theo dòng nếu không giới hạn sẽ khuếch đại y như V4 (mỗi dòng sai một mục lỗi); (b) mỗi tài khoản tạo mới phải băm Argon2 khoảng 20 ms, file 5.000 dòng chiếm threadpool libuv khoảng 100 giây; (c) bước xem trước rồi mới xác nhận dễ bị gửi lại nhiều lần | Ghi rõ ở §4 (hoặc buộc T200 ghi): giới hạn byte (vd ≤ 1mb, `express.text`/`raw` chỉ ở route đó), số dòng tối đa (vd 2.000), mỗi dòng parse bằng schema dùng chung theo §5, `errors` trả về tối đa N dòng đầu (vd 100) kèm tổng số, băm mật khẩu với số luồng song song có giới hạn và trong transaction, route có rate limit. Kết quả CSV xuất ra phải dùng `escapeCell` (FR14) |
| V3 | MAJOR | docs/agents/design/QD_ZOD.md:49-50 | §5 ngầm hiểu rằng `.max()` bảo vệ được các check phía sau. Thực nghiệm trên zod 4.6.7 cho thấy `regex` và `refine` **vẫn chạy** sau khi `.max()` báo lỗi. `/^(a+)+$/` với 29 ký tự mất 11 giây, dù vẫn nằm trong `.max(50)`. Hiện tại `topicSubmitSchema.summary` dùng `refine(countWords)`, sau này similarity/TF-IDF có thể chạy trong refine | Thêm quy tắc §5.9: (a) regex phải tuyến tính (không lồng lượng từ, không backreference), reviewer kiểm; (b) khi sau `.max()` có `regex`/`refine`/`transform` tốn kém thì dùng `.max(n, { error, abort: true })`; (c) không chạy truy vấn DB hoặc thuật toán nặng trong `refine`, đưa xuống service |
| V4 | MAJOR | docs/agents/design/QD_ZOD.md:68 | Test T215 "mảng `keywords` vượt max → 400 `VALIDATION_ERROR`" **vẫn xanh trên zod 3** (tôi đã chạy: 400, nhưng 45.001 mục lỗi, 2,3 MB). Nghĩa là test này không chứng minh được bản vá, cũng không chặn được việc quay lại bản cũ | Sửa mô tả test T215: gửi mảng khoảng 45.000 phần tử sai kiểu trong body < 100kb, kiểm tra `400`, `details` có ≤ 2 khóa và response < 1 KB. Đã có sẵn trong `apps/api/tests/security/T199-input-size.test.js` (đang là `it.fails`), T215 chỉ cần đổi sang `it` |
| V5 | MINOR | docs/agents/design/QD_ZOD.md:43 | Query: parser `simple` trả `string \| string[]` khi một khóa lặp lại (`c=1&c=2`), và `z.coerce.number()` không giới hạn sẽ cho `limit=1e9` đi thẳng xuống DB. §5 chưa nhắc tới query | Bổ sung §5: schema query dùng `validate(schema, 'query')`. Trường đơn khai báo `z.string().max(n)`, nên mảng bị 400. Phân trang dùng `z.coerce.number().int().min(1).max(100)`. Bộ lọc enum dùng `z.enum` |
| V6 | MINOR | apps/api/src/middlewares/validate.js:5 | `validate` phản chiếu **mọi** issue vào `details`. Kể cả khi đã lên zod 4, một schema mảng-của-object có `.max()` lớn vẫn tạo response to | T215: giới hạn `details` ở khoảng 50 mục đầu (phòng thủ nhiều lớp, chỉ một dòng `.slice(0, 50)`) |
| V7 | MINOR | docs/agents/design/QD_ZOD.md:49 | Lý do "mật khẩu 128 chặn tấn công CPU qua Argon2id" sai về kỹ thuật. Thời gian đo được: 10 ký tự 21,0 ms, 1.000.000 ký tự 22,9 ms. DoS thật là tần suất: `/api/auth/change-password` (routes.js:44) chỉ cần đăng nhập, không có rate limit, mỗi lần gọi tốn verify + hash khoảng 40 ms CPU | Sửa lý do thành "vệ sinh đầu vào, khớp giới hạn bcrypt/UI". Thêm quy tắc: mọi endpoint gọi Argon2 (change-password, reset, nhập CSV) phải có rate limit theo user/IP. Giao cho T215 hoặc T207 |
| V8 | MINOR | docs/agents/reports/T199.md (Còn lại / rủi ro) | `npm audit` còn 2 critical (tinypool, GHSA-5gmw-xhrv-c9v3 / GHSA-85c8-ppgw-ccpr) và lỗ hổng ở vitest/vite/esbuild. Chúng là devDependency, ngoài phạm vi T199, nhưng sẽ làm đỏ CI nếu T202 chặn high | Ghi vào rủi ro và chuyển cho T202 quyết định: nâng vitest 2 → 5 hoặc `npm audit --omit=dev` cho cổng prod |
| V9 | MINOR (ngoài phạm vi, ghi cho T703) | apps/api/src/modules/auth/service.js:28 | `login` với tài khoản không tồn tại trả lỗi ngay mà không chạy `hasher.verify`. Chênh lệch khoảng 20 ms cho phép dò tài khoản tồn tại qua thời gian phản hồi, trái mục "không lộ tài khoản tồn tại" | Chạy verify với một hash giả khi `!user`. Đưa vào T703 hoặc một task FR01 riêng |

Câu trả lời cho câu hỏi của KTS ("mức `.max()` tham khảo có đủ chặt không"): đủ. Mật khẩu 128, ID 64, tiêu đề 300, lý do 2000, tóm tắt 5000 đều hợp lý với body 100kb. Có hai điều kiện đi kèm: `.max()` phải đứng **trước** và dùng `abort: true` khi phía sau có regex/refine (V3), và mọi mảng phải có `.max()` nhỏ theo nghiệp vụ, vd keywords ≤ `maxKeywords`, thành viên ≤ `maxMembers`.

Kết luận: CHANGES_REQUESTED – quyết định nâng zod ≥ 4.6.6 là đúng và đã được thực nghiệm xác nhận, nhưng QD_ZOD phải bổ sung giới hạn multipart (V1), giới hạn CSV (V2), quy tắc regex/refine sau `.max()` (V3) và sửa test T215 cho chứng minh được bản vá (V4).
