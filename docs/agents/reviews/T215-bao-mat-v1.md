# Review T215 – bao-mat – vòng 1
Kết luận: APPROVED

## Tôi đã tự kiểm tra
File đã đọc: `reports/T215.md`, `design/QD_ZOD.md` §4.6, `git diff` của `apps/api/src/{app.js,config/env.js,middlewares/errorHandler.js,middlewares/validate.js,modules/auth/routes.js}`, `apps/api/.env.example`, `packages/shared/src/schemas.js`, các file mới `apps/api/src/middlewares/rateLimit.js`, `apps/api/tests/security/T215.test.js`, `lib/errors.js`, `middlewares/auth.js`. Không đọc file `.env`. Không xét các file của T201.

Lệnh đã chạy:
```
$ git diff 92ae897 -- apps/api/tests/security   (trước khi tôi dọn chữ)
→ chỉ đổi 5 + 2 `it.fails(` → `it(`, thêm đúng 1 dòng `expect(r.text.length).toBeLessThan(1024);`.
  Không assertion nào bị xóa hay nới.

$ npm ls zod express-rate-limit
├─┬ @nckh/api  ├── express-rate-limit@8.7.2  └── zod@4.6.7
└─┬ @nckh/shared  └── zod@4.6.7 deduped

$ npm audit
found 0 vulnerabilities

$ grep -rn "express-rate-limit\|rateLimit(" apps/api/src
→ chỉ có trong middlewares/rateLimit.js (factory)

$ git grep chuỗi kết nối postgres có mật khẩu / cloudinary://<số> / khóa riêng  → không có kết quả

$ npx vitest run tests/security/T215-bao-mat.test.js   (test tấn công mới, giữ lại)
Tests  13 passed | 2 expected fail (15)

$ npm test
shared: Test Files 2 passed, Tests 21 passed
api:    Test Files 8 passed, Tests 80 passed | 2 expected fail (82)   exit=0
(không có dòng ERR_ERL)
```

Tấn công đã chạy lại (`tests/security/T215-bao-mat.test.js` cùng các test T199 của tôi):
| Tấn công | Kết quả |
|---|---|
| Body JSON 200kb, 1,1MB | 413 `PAYLOAD_TOO_LARGE`, không gọi `logger.error` |
| Gzip bomb: 5MB giải nén từ khoảng 5KB (gửi bằng `http` thô, vì supertest làm hỏng Buffer nhị phân) | 413. Giới hạn tính sau khi giải nén |
| `keywords` 45.000 phần tử | 400, ≤ 2 khóa `details`, response < 1KB |
| Mật khẩu 129 ký tự | 400 `VALIDATION_ERROR` |
| Response 413 / 400 / BAD_JSON / 429 | Không có stack, đường dẫn file, `node_modules`, tên thư viện. Mỗi response < 1KB |
| Login: 25 IPv6 khác nhau trong cùng /64; 22 IPv6 khác /64 nhưng cùng /56 | Bị 429 |
| Login: đổi đường dẫn `/api/auth/LOGIN`, `/api/auth/login/` sau 20 lần sai | Vẫn 429. Limiter gắn vào route nên mọi biến thể đường dẫn dùng chung bucket |
| `/change-password`: 5 body sai (400) và đổi `X-Forwarded-For` mỗi lần | Lần 6 bị 429. Limiter đứng trước `validate` nên 400 cũng bị đếm. Khóa là `req.user.id` nên đổi IP không thoát |
| `/change-password` chưa đăng nhập ×7 | Đều 401 (`requireAuth` → limiter) |
| `ENABLE_SWAGGER` `'false'` / `'true'` / `''` / `'abc'` / `' '` | false / true / ném lỗi / ném lỗi / ném lỗi |

Thứ tự middleware (`app.js`): pino-http → helmet → cors → `express.json(100kb)` → cookieParser → routes → notFound → errorHandler. Route login: limiter → validate. Route change-password: `requireAuth` → limiter (user) → validate. Thứ tự này khớp QD_ZOD §4.6.

Limiter theo người dùng: khóa là `req.user.id`, lấy từ DB sau khi xác minh JWT. Muốn có bucket khác thì phải có token của tài khoản khác, mà đổi mật khẩu thì chỉ đổi được cho tài khoản của chính token đó. Không tìm được đường vượt.

Trả lời câu hỏi của BE:
- Tên và chú thích test T199: tôi đã tự dọn (chỉ sửa chữ). Bỏ "(hiện đang 500 INTERNAL)", chú thích đổi thành "Hồi quy …". `git diff 92ae897 -- apps/api/tests/security` sau khi dọn vẫn chỉ có một dòng mã thêm vào (`expect(r.text.length)…`). Việc này đóng NIT 2 trong `T215-reviewer-v1.md`.
- Giữ 20 lần / 15 phút kèm `skipSuccessfulRequests` là đủ, không cần nâng lên 50.

## Đối chiếu đặc tả
| Điều kiện đạt | Đạt? | Ghi chú |
|---|---|---|
| NFR02: hết GHSA-mrhx-c7xc-m3w5 (zod ≥ 4.6.6, một bản) | Đạt | 4.6.7 deduped, audit 0 |
| Giới hạn body ở backend 100kb, trả 413 chuẩn | Đạt | Cả body thường lẫn gzip |
| `.max()` cho trường mật khẩu và định danh | Đạt | 128 / 300, đã kiểm qua route thật |
| 429 `RATE_LIMITED` tiếng Việt qua errorHandler | Đạt | |
| Login gộp IPv6 theo subnet, M1 `skipSuccessfulRequests` | Đạt | |
| Limiter `/change-password` theo user, sau `requireAuth` | Đạt | |
| Không lộ stack trace trong 413/429/400 (NFR02) | Đạt | Riêng lỗi body-parser 4xx khác thì xem #1 |
| `ENABLE_SWAGGER` không bật nhầm bằng `'false'`; rỗng hoặc giá trị lạ thì dừng khởi động (NFR08) | Đạt | |
| Không có bí mật trong repo | Đạt | `git grep` sạch |

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| 1 | MINOR | `apps/api/src/middlewares/errorHandler.js:8-14` | Các lỗi 4xx khác của body-parser vẫn rơi về 500 `INTERNAL` và gọi `logger.error`: `content-encoding` lạ (body-parser trả 415) và gzip hỏng (400). Không lộ dữ liệu, vì message chung chung và không có stack. Nhưng mã trả về sai, và ai chưa đăng nhập cũng có thể gửi hàng loạt để làm rác log mức error. Chứng minh: `tests/security/T215-bao-mat.test.js` › `it.fails.each` "trả 4xx và không ghi log error (hiện 500 INTERNAL)" | Thêm nhánh trước `logger.error`: lỗi không phải AppError mà có `err.expose && err.status < 500` (lỗi do body-parser/http-errors đặt) thì trả `err.status` với mã chung `BAD_REQUEST`, message tiếng Việt cố định, không dùng `err.message`. Sau đó đổi 2 `it.fails` → `it`. Không chặn T215. Làm ở T202 hoặc ở task kế tiếp chạm vào errorHandler |
| 2 | MINOR (rủi ro hạ tầng, chuyển T703/T706) | `apps/api/src/app.js:20` | `trust proxy = 1` tin đúng 1 hop. (a) Nếu thực tế có 2 hop (Vercel rewrite → proxy Render), `req.ip` là IP của Vercel, và limiter login thành giới hạn chung: 20 lần sai từ bất kỳ ai sẽ chặn đăng nhập toàn hệ thống. QD §4.6 đã ghi rủi ro này. (b) Bổ sung: nếu chuyển sang `trust proxy = 2` cho trường hợp (a) thì kẻ tấn công gọi thẳng URL `*.onrender.com` (công khai) và tự đặt `X-Forwarded-For` để có bucket mới mỗi request, tức là vượt hẳn limiter login. Test `T215-bao-mat` › "trust proxy 1 + không có proxy: X-Forwarded-For IPv4 giả mạo đổi bucket" cho thấy khi số hop được tin lớn hơn số hop thật thì giả mạo được ngay | T703: trên staging, log `req.ip` và `X-Forwarded-For` thô để xác định số hop, và xác định Render nối thêm hay ghi đè XFF. Không tăng số hop nếu chưa chặn đường gọi thẳng Render (ví dụ header bí mật do Vercel thêm, hoặc `trust proxy` theo danh sách dải IP thay vì theo số hop). T706 ghi vào hướng dẫn deploy |
| 3 | NIT (ngoài phạm vi T215) | `apps/api/src/app.js:21`, `errorHandler.js:15` | `genReqId` lấy nguyên `x-request-id` do client gửi rồi phản chiếu vào response 500 và vào log, không kiểm định dạng hay độ dài. Kẻ tấn công giả được requestId khi đối chiếu log | Ở T202/T703: chỉ nhận `x-request-id` khớp `^[\w-]{1,64}$`, không khớp thì sinh UUID |

File test tấn công giữ lại: `apps/api/tests/security/T215-bao-mat.test.js`. 2 `it.fails` trong file này chứng minh #1.

Kết luận: APPROVED – không có lỗ hổng khai thác được trong phạm vi T215; 2 MINOR (#1 errorHandler, #2 trust proxy cho T703/T706) không chặn.
