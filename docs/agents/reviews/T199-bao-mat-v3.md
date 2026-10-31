# Review T199 – bao-mat – vòng 3
Kết luận: APPROVED

Tóm tắt: Cả 2 MAJOR của vòng 2 đã được xử lý đúng kỹ thuật:
- N1: ghim `multer ^2.5.0`, cấm 1.x, `fileFilter` đồng bộ, kiểm nội dung sau multer, bắt lỗi theo lớp.
- N6: một lượt xác nhận nhập trên toàn tiến trình, khóa ở mức module, trả 409 thay vì xếp hàng.

N2–N8 cũng đã được xử lý. Tôi đã tự chạy thiết kế factory limiter và cách bọc multer trên `express-rate-limit@8.7.2` + `multer@2.5.0`. Kết quả khớp đúng với QD, và `npm audit` báo 0 lỗ hổng. Phần nội dung mới không tạo lỗ hổng khai thác được. Còn 2 điểm MINOR, giao cho T215/T703/T403.

## Tôi đã tự kiểm tra

File đã đọc (không đọc `.env`):
- `docs/agents/design/QD_ZOD.md` (bản vòng 2);
- `docs/agents/reports/T199.md` (mục "Vòng sửa 2", "Bằng chứng bổ sung vòng 2");
- `docs/agents/reviews/T199-bao-mat-v2.md`;
- `apps/api/src/modules/auth/routes.js`.

Phiên bản và audit (cài riêng ở scratchpad, không đụng repo):
```
$ npm i express@5 express-rate-limit@^8 multer@^2.5.0
$ npm ls → express-rate-limit@8.7.2, multer@2.5.0
$ npm audit → found 0 vulnerabilities
node_modules/express-rate-limit/dist/index.mjs:5   function ipKeyGenerator(ip, ipv6Subnet = 56)
node_modules/express-rate-limit/dist/index.mjs:610 ipv6Subnet hợp lệ trong khoảng 32..64
```
Khẳng định ở §3 ("thêm `ipv6Subnet`, mặc định 56") đúng. Báo cáo ghi KTS chưa kiểm bằng lệnh; nay đã được xác minh.

Chạy thử đúng thiết kế ở §4.2/§4.3/§4.6 (script `scratchpad/v3/t.mjs`). Script gồm:
- `createLimiter` có `handler: next(new AppError(429,'RATE_LIMITED'))`, mặc định `ipv6Subnet: 56`;
- `keyBy` theo `req.user.id`;
- bọc multer bằng `toUploadError`.

```
login: 25 request, mỗi request một địa chỉ khác trong 2001:db8:1:2::/64
  → lần 19–25: 401,401,429:RATE_LIMITED ×5     ← N2 + N3 được giải quyết, body có error.code chuẩn
change-password keyBy user.id, limit 5 → 204×5, 429, 429   ← đúng §4.6
multer fileSize 10 B, file 50 B         → 413 PAYLOAD_TOO_LARGE
multipart cắt cụt ("Unexpected end of form") → 400 VALIDATION_ERROR (không 500)
2 file khi files: 1 (LIMIT_FILE_COUNT/UNEXPECTED_FILE) → 400 VALIDATION_ERROR
```
Repo hiện tại (chưa có T215):
```
$ cd apps/api && npx vitest run tests/security → Test Files 2 passed; Tests 1 passed | 7 expected fail (8)
$ npm ls zod express-rate-limit → zod@3.25.76 (deduped), express-rate-limit@7.5.1
```
Kết quả đúng như dự kiến. 7 `it.fails` (5 + 2) vẫn đang chứng minh lỗi, và T215 phải đổi chúng sang `it` (§6).

## Kiểm từng vấn đề vòng 2
| # | Đã xử lý? | Ghi chú |
|---|---|---|
| N1 multer (MAJOR) | Đạt | Đã duyệt `^2.5.0` ở đầu QD và §4.3.1, cấm cả `1.4.5-lts.x`, có nêu lý do lọt audit. §4.3.5 yêu cầu `fileFilter` đồng bộ, không I/O, không tin `mimetype`. §4.3.6 kiểm nội dung trên `req.file.buffer` sau multer. §4.2 bắt theo lớp (chỉ `LIMIT_FILE_SIZE` → 413, mọi lỗi khác → 400). Đã chạy thử và đúng. 2.5.0 audit sạch |
| N6 Argon2 (MAJOR) | Đạt | §4.4.5 đặt cờ ở mức module (`importLock.js`), nhả trong `finally`, và trả 409 ngay chứ không xếp hàng, nên không tích hàng đợi. Trong một lượt có tối đa 2 phép băm, nên tổng ≤ 2 trên toàn tiến trình. Test T207 (2 request đồng thời → một bên 409, bộ đếm ≤ 2) kiểm được đúng điều kiện. Lý do không đổi `UV_THREADPOOL_SIZE` hợp lý. §7 có ghi `shortcut` 1 instance |
| N2 429 chuẩn | Đạt | §4.2 có factory dùng chung và cấm gọi `rateLimit()` trực tiếp. §6 yêu cầu đổi test 1 sang `it`. Đã chạy thử: body `{ error: { code: 'RATE_LIMITED' } }` |
| N3 IPv6 / trust proxy | Đạt | Dùng v8 với `ipv6Subnet: 56`, đã chạy thử chặn được việc đổi địa chỉ trong /64. Phương án dự phòng ở §7 vẫn bắt buộc qua test. Rủi ro `trust proxy` đã giao T706/T703 |
| N4 thứ tự middleware, limiter upload | Đạt | §4.3.3: thứ tự `requireAuth` → limiter → kiểm quyền theo URL → multer → kiểm nội dung → `validate`. §4.6 đã có dòng upload 20/15 phút |
| N5 loại file | Đạt | Có whitelist đuôi và điều kiện nội dung theo từng đuôi. OOXML kiểm `[Content_Types].xml` + `word/`/`ppt/`/`xl/` bằng `includes`, không giải nén. CSV dùng `TextDecoder` fatal và chặn byte NUL. Đủ yêu cầu "nội dung + đuôi" (FR11) |
| N7 mật khẩu tạm | Đạt | §4.4.7 đủ các ý: dùng `crypto`, ≥ 12 ký tự, chỉ lưu hash, `mustChangePassword`, trả một lần, `no-store`, không log |
| N8 bảng T215 | Đạt (điều phối viên) | QD §6 là danh sách đối chiếu đầy đủ. Tôi không kiểm lại bảng việc |

## Đối chiếu đặc tả
| Điều kiện đạt | Đạt? | Ghi chú |
|---|---|---|
| Có quyết định rõ, ghi `design/QD_ZOD.md` | Đạt | zod `^4.6.7`, multer `^2.5.0`, express-rate-limit `^8`. Có bảng phá vỡ, phạm vi T215 và bảng chuyển giao |
| Xử lý GHSA-mrhx-c7xc-m3w5 | Đạt | Nâng 4.6.7. Test T215 (đỏ trên zod 3) chặn quay lại bản cũ |
| NFR02 Zod hai phía, lỗi chuẩn | Đạt khi T215 xong | 413/429/409 có mã chuẩn và tiếng Việt |
| FR11 backend kiểm loại + dung lượng | Đạt (thiết kế) | Áp dụng ở T403 |
| FR02 nhập CSV | Đạt (thiết kế) | Có giới hạn dòng, lỗi theo dòng, giới hạn đồng thời toàn tiến trình |
| Lớp phòng thủ mới không tạo lỗ hổng mới | Đạt | Không tìm thấy lỗ hổng khai thác được |

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| M1 | MINOR (T215 hoặc T703) | apps/api/src/modules/auth/routes.js:18 ; QD_ZOD.md:121 | Limiter đăng nhập 20/15 phút theo IP đang đếm cả **lần đăng nhập thành công**, vì chưa đặt `skipSuccessfulRequests`. Sinh viên dùng mạng trường thường đi qua NAT IPv4 chung một địa chỉ công khai. Vào giờ cao điểm (sát hạn nộp hồ sơ), người thứ 21 trong 15 phút sẽ bị 429 dù nhập đúng mật khẩu. Khóa theo tài khoản (`service.js`, `TEMP_LOCKED`) đã chặn dò mật khẩu từng tài khoản, nên limiter IP chỉ cần chặn dò rải nhiều tài khoản | Truyền `skipSuccessfulRequests: true` cho limiter `/login` qua factory (cần factory nhận thêm tùy chọn này). Có thể nâng mức, vd 50/15 phút. Thêm test: 25 lần đăng nhập đúng từ cùng một IP không bị 429, và test IPv6 dò sai vẫn phải 429 |
| M2 | MINOR (T403) | QD_ZOD.md:83 | Kiểm OOXML bằng `buffer.includes` chỉ là kiểm sơ bộ. Một ZIP tùy ý có chứa các tên mục đó vẫn lọt qua. Rủi ro thấp vì file lưu `raw`/`authenticated` và chỉ tải qua URL ký. Tuy vậy, khi trả file vẫn phải bảo đảm trình duyệt không render file đó trong origin của ứng dụng | Khi T403 cấp URL ký, dùng `flags: 'attachment'` (hoặc tương đương) để file luôn được tải về, không bao giờ phục vụ trực tiếp từ domain ứng dụng. Ghi vào báo cáo T403, không cần sửa QD |

Kết luận: APPROVED – N1 và N6 (MAJOR) cùng N2–N8 đã xử lý đúng. Thiết kế limiter/multer đã được chạy thử trên express-rate-limit 8.7.2 + multer 2.5.0 (audit 0 lỗ hổng). Chỉ còn MINOR M1 (giao T215/T703) và M2 (giao T403).
