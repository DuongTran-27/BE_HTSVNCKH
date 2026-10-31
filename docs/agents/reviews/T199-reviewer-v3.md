# Review T199 – reviewer – vòng 3
Kết luận: APPROVED

Task thiết kế, chỉ sửa `docs/agents/design/QD_ZOD.md` và `docs/agents/reports/T199.md`. Vòng này tôi kiểm ba việc. Thứ nhất, 6 MINOR của tôi ở vòng 2 đã được xử lý chưa. Thứ hai, phần mới (multer `^2.5.0` và kiểm nội dung trên buffer, `importLock` 409, `createLimiter`, `express-rate-limit ^8` với `ipv6Subnet`, phạm vi T215 ở §6 và bảng chuyển giao) có đúng và khả thi không. Thứ ba, tôi chạy thử bằng các bản thư viện thật: `express@5.3.0`, `express-rate-limit@8.7.2`, `multer@2.5.0`. Báo cáo ghi KTS chưa kiểm `ipv6Subnet` bằng lệnh, nên phần này tôi tự kiểm.

## Tôi đã tự kiểm tra
File đã đọc: `CLAUDE.md`, `docs/agents/QUY_TRINH.md` (mẫu review), `QD_ZOD.md` (bản vòng 2), `reports/T199.md` (mục "Vòng sửa 2", "Bằng chứng bổ sung vòng 2", "Đã làm", "Quyết định thiết kế"), `reviews/T199-reviewer-v2.md`, `reviews/T199-bao-mat-v2.md`, `apps/api/tests/security/T199-rate-limit.test.js`, `apps/api/tests/security/T199-input-size.test.js`, `apps/api/src/modules/auth/routes.js`, `apps/api/src/middlewares/errorHandler.js`, `apps/api/src/app.js:20`, `BANG_CONG_VIEC.md` (T199, T200, T215, T207, T403, T703).

| Lệnh | Kết quả |
|---|---|
| `npm test` | shared 5/5. api: 40 passed, 7 expected fail (47): 5 `it.fails` ở input-size và 2 `it.fails` ở rate-limit, khớp §6 |
| `npm run lint` | `'eslint' is not recognized`: chưa có ESLint, đang chờ T202. Task không đổi code nên không tính lỗi |
| `npm ls zod express-rate-limit multer` | `zod@3.25.76` (deduped), `express-rate-limit@7.5.1`, chưa có multer. Đúng với trạng thái trước T215 |
| Scratchpad: `npm i express@5 express-rate-limit@8 multer@2.5.0` | Cài được `express-rate-limit@8.7.2` cùng express 5.3.0. `npm audit`: 0 lỗ hổng (multer 2.5.0 sạch) |
| Factory `createLimiter` với `handler: (_q,_r,next) => next(new AppError(429,'RATE_LIMITED',…))`, `trust proxy 1`, 25 lần login với `x-forwarded-for` là `2001:db8:1:2::1..19`, `ipv6Subnet: 56` | 20 lần 401, từ lần 21 là 429, body `{"error":{"code":"RATE_LIMITED",…}}`. IP thuộc /56 khác vẫn 401. Như vậy cả 2 test `it.fails` trong `T199-rate-limit.test.js` sẽ xanh sau T215 |
| Limiter khóa theo `req.user.id`, đặt sau middleware gán `req.user`, `limit: 5` | `204×5, 429`. Khớp test "`/change-password` lần thứ 6 → 429" |
| `dist/index.mjs:5` | `ipKeyGenerator(ip, ipv6Subnet = 56)`. Mặc định 56 đúng như §3, §4.6 |
| `dist/index.mjs:617-635` | Có validation `ERR_ERL_IPV6SUBNET_OR_KEYGENERATOR` và `ERR_ERL_KEY_GEN_IPV6` (vấn đề #1) |
| multer 2.5.0 bọc ở route theo §4.2, `fileSize: 10` | File 100 B → 413 `PAYLOAD_TOO_LARGE`. Hai file → 400 (`LIMIT_FILE_COUNT`). Multipart cụt → 400 ("Unexpected end of form"). Hợp lệ → 200, `req.file.buffer` có dữ liệu. Không có trường hợp nào rơi vào 500 |
| `TextDecoder('utf-8',{fatal:true})` + kiểm `0x00` | CSV UTF-8 có BOM: đạt. Byte Latin-1 `0xE3` lẻ: bị từ chối. Có NUL: bị từ chối. Khả thi như §4.3.6 |

## Xác nhận MINOR vòng 2
| # | Vấn đề cũ | Trạng thái |
|---|---|---|
| 1 | 429 không qua errorHandler; limiter `/change-password` phải đứng sau `requireAuth` | **Đã sửa.** §4.2 bắt dùng factory `createLimiter` có `handler` gọi `next(AppError 429 RATE_LIMITED)`, cấm gọi `rateLimit()` trực tiếp. §4.6 quy định thứ tự `requireAuth` → limiter → `validate`. §6 việc 9 và test. Tôi đã chạy thử và thấy đúng |
| 2 | Bắt lỗi multer theo lớp | **Đã sửa.** §4.2: `instanceof MulterError` và `LIMIT_FILE_SIZE` → 413, mọi lỗi khác của multer/busboy → 400. Đã chạy với 3 loại lỗi |
| 3 | `stringbool` với `''` và các giá trị y/n | **Đã sửa.** §2 liệt kê đủ giá trị và nói rõ chuỗi rỗng sẽ ném lỗi, kèm ghi chú cho `.env.example`. §6 có test `''` |
| 4 | Câu §5.1 chặt quá mức cần | **Đã sửa.** Câu mới: "`.max()` đứng trước mọi regex/refine/superRefine/transform; `.trim()`, `.min()` đứng trước được". Khớp `schemas.js` hiện tại và ví dụ §5.9b |
| 5 | Báo cáo còn `^4.6.6` và lý do 128 cũ | **Đã sửa.** Mục "Đã làm" và "Quyết định thiết kế" ghi `^4.6.7`, mức 128 là vệ sinh đầu vào |
| 6 | Dòng T215 trên bảng việc | **Đã sửa phần lớn.** `BANG_CONG_VIEC.md:19` đã có limiter dùng chung, 429, `/change-password` và "toàn bộ test ở §6". Còn thiếu hai ý nhỏ (vấn đề #3) |

Hai MAJOR của BM (N1 multer, N6 đồng thời băm) thuộc phần BM tự xác nhận. Về kỹ thuật, tôi thấy cả hai đều đã được giải quyết. N1: ghim `^2.5.0`, cấm 1.x, `fileFilter` đồng bộ, kiểm nội dung sau multer, và audit trên 2.5.0 sạch. N6: khóa ở mức module, trả 409 không xếp hàng, nhả trong `finally`, tối đa 2 phép băm, nên tổng ≤ 2 trên toàn tiến trình.

## Đối chiếu đặc tả
| Điều kiện đạt | Đạt? | Ghi chú |
|---|---|---|
| Quyết định rõ ràng, ghi vào `design/QD_ZOD.md` | Đạt | `zod ^4.6.7` một bản. Duyệt luôn `multer ^2.5.0` và `express-rate-limit ^8` theo đúng thẩm quyền KTS (CLAUDE.md, mục "Công nghệ") |
| Xử lý GHSA-mrhx-c7xc-m3w5 | Đạt (thiết kế) | Bằng chứng §6 yêu cầu `npm audit` không còn advisory này. Test 45.000 phần tử < 1 KB chặn việc quay lại bản cũ |
| NFR02: lỗi có mã chuẩn, tiếng Việt, Zod hai phía | Đạt | Đã chặn được cả ba đường 413/429/400 của multer khỏi rơi vào 500. Đã chạy thử. T200 nhận 3 mã lỗi mới |
| FR11: tối đa 10 MB, backend kiểm loại và dung lượng | Đạt | Dung lượng: multer 2.5.0 `fileSize`, `fileFilter` đồng bộ. Loại: whitelist đuôi + chữ ký nội dung trên buffer, không giải nén |
| FR02: nhập CSV có xem trước, lỗi theo dòng, mật khẩu đổi ở lần đầu | Đạt | §4.4 đủ: giới hạn dòng, 100 mục, kiểm lại khi xác nhận, transaction ngắn, `mustChangePassword`, mật khẩu tạm trả một lần |
| FR25 / quy tắc 3: kiểm quyền ở backend trước khi đọc file | Đạt | §4.3.3: `requireAuth` → limiter → kiểm quyền theo URL → multer |
| Khả thi cho BE (T215) | Đạt | 9 việc + 7 test đổi `it.fails` → `it`. Tôi đã dựng lại bằng thư viện thật và cả hai test rate-limit đều xanh với cấu hình QĐ |

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| 1 | MINOR | `QD_ZOD.md` §4.2 (dòng Rate limit), §3 dòng `express-rate-limit` 8 | Trong v8 (`dist/index.mjs:617-635`), nếu truyền **cả** `ipv6Subnet` và `keyGenerator` thì sẽ có `ERR_ERL_IPV6SUBNET_OR_KEYGENERATOR`. Nếu `keyGenerator` có nhắc đến `req.ip` mà không gọi `ipKeyGenerator` thì có `ERR_ERL_KEY_GEN_IPV6`. Cả hai đều ra `console.error` khi khởi tạo. Nếu factory `createLimiter({ keyBy })` truyền mặc định `ipv6Subnet: 56` cho mọi limiter, hoặc viết `req.user?.id ?? req.ip`, thì log sẽ bẩn và dễ che lỗi thật | T215 làm như sau. `keyBy` theo IP: chỉ đặt `ipv6Subnet: 56`, không có `keyGenerator`. `keyBy` theo người dùng: chỉ đặt `keyGenerator: (req) => req.user.id`, không có `ipv6Subnet`. Cần fallback thì dùng `ipKeyGenerator(req.ip)`. Reviewer T215 kiểm rằng chạy test không in `ERR_ERL_` |
| 2 | MINOR | `QD_ZOD.md` §4.4.5 | Hai điểm dễ làm sai khi thực hiện. (a) Bước kiểm cờ và bước đặt cờ phải nằm trong cùng một đoạn đồng bộ, không có `await` ở giữa, nếu không sẽ có race giữa hai request. (b) Test "2 request đồng thời → một bên 409" sẽ xanh giả, hoặc lúc đỏ lúc xanh, nếu request đầu chạy xong trước khi request thứ hai đến | T207 dùng hasher giả chặn bằng một promise do test tự `resolve`. Gửi request thứ nhất, chờ đến khi hasher được gọi, rồi mới gửi request thứ hai và assert 409. Sau khi `resolve`, gửi request thứ ba và assert thành công (chứng minh cờ đã được nhả) |
| 3 | MINOR (điều phối viên) | `BANG_CONG_VIEC.md:19` | Dòng T215 chưa nêu rõ việc nâng `express-rate-limit ^8` (`ipv6Subnet`) và việc đổi 2 `it.fails` trong `T199-rate-limit.test.js`. Đã có cụm "toàn bộ test ở §6" nên không sai, chỉ dễ sót | Thêm "nâng `express-rate-limit ^8` (ipv6Subnet 56); đổi 2 `it.fails` trong `tests/security/T199-rate-limit.test.js`" vào dòng T215 |

Ghi chú, không tính lỗi. Kiểm OOXML bằng `buffer.includes('[Content_Types].xml')` và `'word/'` chỉ để kiểm tính hợp lý của file. Kẻ tấn công vẫn tự tạo được một ZIP thỏa điều kiện này. Mức đó chấp nhận được, vì file lưu ở Cloudinary dạng `raw`/`authenticated` và không bao giờ được hiển thị inline. T703 nên rà lại điểm này.

Không có BLOCKER/MAJOR. Mọi API mà phần mới nhắc đến tôi đều đã chạy trên bản thư viện thật và thấy đúng như QĐ mô tả: handler v8 chuyển lỗi sang errorHandler, `ipv6Subnet` mặc định 56 gộp được /64, limiter theo người dùng chặn đúng ở lần thứ 6, multer 2.5.0 trả 413/400 không rơi vào 500, `TextDecoder` fatal. Ba MINOR trên do T215/T207 và điều phối viên tự áp dụng được, không cần sửa lại QĐ.

**Kết luận: APPROVED**
