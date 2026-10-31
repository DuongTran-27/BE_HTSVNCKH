# Review T199 – reviewer – vòng 2
Kết luận: APPROVED

Vẫn là task thiết kế: chỉ sửa `docs/agents/design/QD_ZOD.md` và báo cáo. Vòng này tôi kiểm ba việc: 5 MINOR của vòng 1 đã được xử lý chưa, nội dung mới (§4.2–§4.7, §5.9–§5.10, §6) có đúng kỹ thuật và khớp đặc tả không, và có con số nào sai không. Mọi khẳng định đều được tôi chạy thử lại trên `zod@4.6.7`, `multer@2.5.0`, `express@5.3.0` và `express-rate-limit@7`, không dựa vào báo cáo.

## Tôi đã tự kiểm tra
File đã đọc: `CLAUDE.md`, `docs/agents/QUY_TRINH.md`, `QD_ZOD.md` (bản vòng sửa 1), `reports/T199.md` (mục "Vòng sửa 1" và "Bằng chứng bổ sung"), `reviews/T199-reviewer-v1.md`, `DAC_TA.md` (FR02 dòng 40, FR11 dòng 49, FR14 dòng 52, bảng tham số dòng 226–227, câu hỏi mở dòng 238), `BANG_CONG_VIEC.md` (T199–T216, T403, T703), `apps/api/tests/security/T199-input-size.test.js`, `packages/shared/src/schemas.js`, `apps/api/src/middlewares/errorHandler.js`, `apps/api/src/modules/auth/routes.js`, `apps/api/src/lib/password.js`, `apps/api/src/lib/csv.js`, `apps/api/.env.example`, `node_modules/express/lib/utils.js`.

| Lệnh | Kết quả |
|---|---|
| `npm test` | shared 5/5, api 45/45 passed (có 5 `it.fails` của BM, hiện vẫn "đạt" vì đang chạy zod 3) |
| `npm run lint` | `'eslint' is not recognized`: chưa có ESLint, đang chờ T202. Task không đổi code nên không tính lỗi |
| `npm ls zod` | `zod@3.25.76`, một bản deduped |
| Scratchpad zod 4.6.7: `z.string().trim().max(5000,{error,abort:true}).refine(countWords)` với chuỗi 5001 ký tự | 1 issue, refine được gọi **0** lần. Khớp §5.9b và test ở §6 |
| Cùng schema nhưng bỏ `abort` | 2 issue, refine được gọi 1 lần. Regex sau `.max()` cũng vẫn chạy. Khớp khẳng định "vẫn chạy" ở §5.9 |
| `z.array(z.string().refine(spy)).max(2)` với 10 000 phần tử | spy 0 lần. Khớp §6 |
| `keywords` (đúng schema nháp) với 45 000 số | 1 issue, JSON issues 97 B (< 1 KB). Khớp điều kiện mới `r.text.length < 1024` |
| `keywords` với 5 000 phần tử `"a"` | 1 issue `"Tối đa 5"` → 400. Test khả thi |
| `z.string({ error: 'Chọn lĩnh vực' })` với `undefined` | `"Chọn lĩnh vực"` |
| `z.stringbool().default(false)` | `true/false/1/0/yes/no/on/off/y/n/enabled/disabled` (không phân biệt hoa thường) đều được nhận. `'abc'` → lỗi. **`''` → lỗi**. `undefined` → false |
| `z.coerce.number().int().min(1).max(100)` | `['1','2']` → lỗi, `''` → lỗi, `['5']` → 5 (querystring không bao giờ sinh mảng 1 phần tử nên không sao) |
| `z.string().max(5)` với mảng | lỗi → khóa lặp bị 400, khớp §5.10 |
| `z.config(z.locales.vi())` | `"Quá lớn: mong đợi string có <=3 ký tự"` |
| `express/lib/utils.js:171-172` | `'simple'` → `querystring.parse` (mặc định `maxKeys` 1000, không dựng object lồng). Khớp §4.7 |
| `multer/lib/multer-error.js` (2.5.0) | Có đủ 7 mã mà §4.2 liệt kê, nhưng còn thêm `MISSING_FIELD_NAME`, `LIMIT_FIELD_NESTING`, `LIMIT_FIELD_ARRAY_INDEX`, `INVALID_FIELD_NAME`, `STREAM_DESTROYED` (vấn đề #2). README ghi `parts` = fields + files, `fieldSize` tính bằng byte. Bảng §4.3 tự nhất quán: 10+1 ≤ 12 và 5+1 ≤ 7 |
| `express-rate-limit` dist, dòng 633 | Mặc định trả `429` với văn bản `"Too many requests, please try again later."` và **không** gọi `next(err)` (vấn đề #1) |
| `password.js:5` | `memoryCost 19456, timeCost 2, parallelism 1`. Băm 2 luồng song song tốn khoảng 38 MiB, 2 000 dòng × ~21 ms / 2 ≈ 21 s. Khớp giả định §7 |
| `.env.example:12` | `ENABLE_SWAGGER=true`, hợp lệ với `stringbool` |

## Xác nhận MINOR vòng 1
| # | Vấn đề cũ | Trạng thái |
|---|---|---|
| 1 | Thiếu con số `.max()` cho schema gửi đề tài | **Đã sửa.** Bảng "Chỗ đang vi phạm" ghi số cố định, trùng đúng với `topicDraftSchema` (`schemas.js:10-13`: 300/5000/3000/60). §5.8 bắt dùng chung hằng giữa nháp và gửi |
| 2 | `stringbool` fail-fast, phóng đại về Swagger | **Đã sửa.** §2 hạ xuống "lỗi tiềm ẩn", nêu fail-fast. §6 có test `'abc'`. Danh sách giá trị hợp lệ chưa đủ và chưa nhắc `''` (vấn đề #3) |
| 3 | Vị trí `z.config(z.locales.vi())` | **Đã sửa.** §2 chỉ rõ đặt ở đầu `schemas.js` và chấp nhận `env.js` ra tiếng Anh. Cấu hình có hiệu lực cho cả api vì §1.1 bắt buộc chỉ có một bản zod (deduped) |
| 4 | Test hồi quy mảng nhiều phần tử | **Đã sửa.** §6 có test 5 000 `"a"` → 400 và test đơn vị spy 0 lần. Tôi đã chạy cả hai trên 4.6.7 và thấy khả thi |
| 5 | Audit vitest/vite | **Đã sửa.** T216 có trên bảng (dòng 14), T202 phụ thuộc T216. §1.6 tham chiếu đúng |

## Đối chiếu đặc tả
| Điều kiện đạt | Đạt? | Ghi chú |
|---|---|---|
| Quyết định rõ ràng, ghi vào `design/QD_ZOD.md` | Đạt | `^4.6.7`, một bản dùng chung, nêu lý do bác hai phương án còn lại |
| FR11: tối đa 10 MB, backend kiểm loại và dung lượng | Đạt | §4.3 `fileSize` 10 MB, lấy mức thấp hơn nếu gói Cloudinary giới hạn thấp hơn (DAC_TA dòng 238). Kiểm magic bytes, không tin `mimetype` |
| FR02: nhập CSV có xem trước, báo lỗi theo dòng, chỉ ghi khi xác nhận | Đạt | §4.4: xem trước, `errors[{row, field, message}]`, bước xác nhận kiểm lại từ đầu và ghi trong một transaction. Ràng buộc unique khớp yêu cầu "mã và email không trùng" |
| FR14: CSV có BOM UTF-8, chống CSV injection | Đạt | §4.4 dùng `escapeCell` (có ở `lib/csv.js:5`) và BOM |
| NFR02: lỗi có mã và thông điệp chuẩn, Zod ở cả hai phía | Đạt (thiết kế), còn hở nhánh 429 | Có 413/400 tiếng Việt. Nhánh 429 chưa nói cách nối vào errorHandler (vấn đề #1) |
| Khả thi cho BE | Đạt | Phạm vi T215 có 9 việc, 6 test, bằng chứng cụ thể. Tôi đã thử mọi API được nhắc đến và đều chạy được |

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| 1 | MINOR | `QD_ZOD.md` §4.2 dòng `express-rate-limit`, §4.6 dòng login "(đã có)", §6 việc 9 | `express-rate-limit` không ném lỗi: mặc định nó tự trả 429 kèm văn bản tiếng Anh, nên `errorHandler` không bao giờ thấy lỗi này. Limiter đăng nhập hiện tại (`routes.js:18`) đang trả đúng câu tiếng Anh đó, vi phạm quy tắc 7 và NFR02. QĐ ghi "(đã có)" nên T215 dễ bỏ qua. Ngoài ra, nếu khóa theo `req.user.id` thì limiter phải đứng **sau** `requireAuth` (`routes.js:44`) | T215 tạo một hàm dựng limiter dùng chung, có `handler: (req, res, next) => next(new AppError(429, 'RATE_LIMITED', 'Thao tác quá nhiều lần, vui lòng thử lại sau'))`, rồi áp cho cả `/login` và `/change-password` (thứ tự `requireAuth, changePwLimiter, validate`). Thêm assert `body.error.code === 'RATE_LIMITED'` cho login. T215 tự áp dụng được, không cần sửa lại QĐ |
| 2 | MINOR | `QD_ZOD.md` §4.2 dòng multer | Liệt kê từng mã sẽ sót các mã có trong multer 2.x (`MISSING_FIELD_NAME`, `LIMIT_FIELD_NESTING`, `LIMIT_FIELD_ARRAY_INDEX`, `INVALID_FIELD_NAME`, `STREAM_DESTROYED`). Các mã này sẽ rơi vào 500 | Bắt theo lớp: `err instanceof multer.MulterError` → `LIMIT_FILE_SIZE` trả 413, mọi mã còn lại trả 400 `VALIDATION_ERROR`. T403 hoặc T215 áp dụng |
| 3 | MINOR | `QD_ZOD.md` §2 dòng `z.coerce.boolean()` | Danh sách giá trị hợp lệ thiếu `y/n/enabled/disabled`. Quan trọng hơn: chưa nói `ENABLE_SWAGGER=` (chuỗi rỗng) cũng làm `loadEnv` ném lỗi. Tôi đã thử: `''` → lỗi | Trong `.env.example` ghi rõ "bỏ hẳn dòng nếu không dùng, không để rỗng". Tùy chọn: thêm test `''` → ném lỗi |
| 4 | MINOR | `QD_ZOD.md` §5.1 "`.max()` phải **đứng trước** các check khác" | Viết như vậy thì chặt hơn mức cần, mâu thuẫn với chính ví dụ ở §5.9b (`.trim().max(…)`) và với code hiện có (`schemas.js:6` `.min(1).max(60)`, `:19` `.min(10…).max(300)`). Vì vi phạm §5 tính là MAJOR, câu này có thể khiến reviewer báo MAJOR nhầm. Thực nghiệm cho thấy khi không có `abort` thì thứ tự không quan trọng, mọi check đều chạy. Thứ tự chỉ quan trọng với check tốn kém | Sửa câu thành: "`.max()` phải đứng trước mọi regex/refine/superRefine/transform; `.trim()`, `.min()` đứng trước được". Khi T215 sửa bảng §5 thì sửa luôn câu này |
| 5 | MINOR | `reports/T199.md` mục "Đã làm" và "Quyết định thiết kế" | Hai mục này vẫn ghi `^4.6.6` và "mật khẩu ≤ 128 để chặn tấn công CPU qua Argon2". Cả hai đã bị QĐ vòng 2 thay (`^4.6.7`; lý do 128 là vệ sinh đầu vào). Người đọc báo cáo sẽ thấy mâu thuẫn | Gạch hoặc ghi chú "đã thay bởi Vòng sửa 1" ở hai mục đó |
| 6 | MINOR | `BANG_CONG_VIEC.md:19` (T215) | Mô tả T215 trên bảng chưa có phần việc mới của §6: `validate.js` `.slice(0,50)`, rate limit `/change-password`, 429 `RATE_LIMITED`, đổi 5 `it.fails` → `it` | Điều phối viên cập nhật dòng T215 thành "làm theo QD_ZOD §6", để reviewer T215 đối chiếu đủ |

Ghi chú, không tính lỗi: §4.4 có xuất "mật khẩu tạm nếu có" ra CSV. Đây là chọn lựa nghiệp vụ của T207 (FR02 yêu cầu đổi mật khẩu ở lần đăng nhập đầu), BM nên xem lại khi review T207.

Không có BLOCKER/MAJOR. Mọi con số và khẳng định kỹ thuật mới tôi đều kiểm lại và thấy đúng: 10 MB khớp FR11, `abort` chặn refine, refine và regex vẫn chạy khi không có `abort`, mảng vượt `.max()` bị cắt sớm, response dưới 1 KB, Express 5 dùng `querystring` với 1000 khóa, `parts` = fields + files, tham số Argon2 khớp giả định khoảng 20 s cho 2 000 dòng. Các MINOR #1–#4 là chỗ T215/T403 tự áp dụng được, chưa đến mức buộc phải sửa lại QĐ.

**Kết luận: APPROVED**
