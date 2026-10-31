# Review BUG-001 – reviewer – vòng 1
Kết luận: APPROVED

## Tôi đã tự kiểm tra
- Đã đọc: `docs/agents/reports/BUG-001.md`, `reviews/T215-bao-mat-v1.md` (MINOR #1, nguồn của bug), `apps/api/src/middlewares/errorHandler.js` (toàn file), `apps/api/tests/security/BUG-001.test.js` (mới), `apps/api/tests/security/T215-bao-mat.test.js` dòng 50–75, `docs/agents/design/API_GD2.md` §2, `docs/agents/design/QD_ZOD.md` §4.2.
- `git diff HEAD -- apps/api/src/middlewares/errorHandler.js apps/api/tests/security/T215-bao-mat.test.js`: errorHandler chỉ thêm nhánh dòng 14–21. File test T215 chỉ đổi 1 dòng chú thích, `it.fails.each` → `it.each` và bỏ cụm "(hiện 500 INTERNAL)" trong tên test. Thân test **không đổi** (`status >= 400`, `< 500`, `logger.error` không được gọi), nên assertion không bị nới.
- `npm test` (gốc): shared 2 file / 21 test đạt; api 9 file / **87 passed (87)**, không còn expected fail. Khớp bằng chứng trong báo cáo (trước khi sửa là 80 passed + 2 expected fail).
- `npm run lint`: `'eslint' is not recognized…`. Khớp báo cáo. Repo chưa có ESLint (T202), giống T215, nên không tính là lệch bằng chứng.
- `grep -rnE "\.(skip|only|fails|todo)\b" apps/api/tests packages/shared`: không còn `.skip`, `.only`, `.fails`, `.todo` (chỉ khớp một dòng chú thích).
- `grep expose|http-errors|createError apps/api/src`: code ứng dụng không tự ném lỗi http-errors. Lỗi nghiệp vụ đi qua `AppError` (nhánh dòng 5, đứng trước), nên nhánh mới chỉ bắt lỗi của body-parser hoặc thư viện bên thứ ba.

## Đối chiếu đặc tả
| Điều kiện đạt | Đạt? | Ghi chú |
|---|---|---|
| Content-encoding lạ → 4xx, không `logger.error` | Có | `errorHandler.js:16-19`. Test: T215 `it.each` "trả 4xx…", BUG-001 test 1 (415 + body chính xác + `warn` gọi đúng 1 lần) |
| Gzip hỏng → 4xx, không `logger.error` | Có | `errorHandler.js:20`. Test: T215, BUG-001 test 2 |
| Trả `err.status`, thông điệp tiếng Việt cố định, không lộ message thư viện (NFR02) | Có | Không dùng `err.message`. BUG-001 test 2 so `toEqual` toàn bộ body và `not.toMatch(/header\|check\|zlib\|incorrect/i)`. Log `warn` chỉ ghi `reqId`, `type`, `status`, không ghi `err` |
| Giữ nguyên 400 BAD_JSON / 413 PAYLOAD_TOO_LARGE / 400 VALIDATION_ERROR | Có | Hai nhánh dòng 8 và 11 đứng trước nhánh mới, VALIDATION_ERROR là AppError. Có 3 test hồi quy trong BUG-001, cộng các test T199/T215 sẵn có vẫn xanh |
| 500 INTERNAL + `logger.error` cho lỗi không lường trước giữ nguyên | Có | Lỗi 5xx hoặc không có `expose` vẫn rơi xuống dòng 22–23. http-errors đặt `expose=false` cho 5xx, và điều kiện `< 500` chặn thêm một lớp |
| QD_ZOD §4.2: lỗi client không rơi vào 500, không log mức error | Có | Ghi `warn` thay cho `error` |

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| 1 | MINOR | `docs/agents/design/API_GD2.md:63-89` (§2), `QD_ZOD.md:54-59` (§4.2) | Hai mã mới `BAD_REQUEST` (400) và `UNSUPPORTED_MEDIA_TYPE` (415) chưa có trong bảng mã lỗi chuẩn. Chọn mã như vậy là **hợp lý**: `BAD_REQUEST` đúng là mã bao-mat đề xuất ở T215-bao-mat-v1 #1. `VALIDATION_ERROR` mang nghĩa "schema sai", còn `BAD_JSON` sai về ngữ nghĩa với gzip hỏng. 415 có mã riêng giúp frontend phân biệt. Không chặn task này, vì đây là lỗi tầng giao thức mà frontend không sinh ra trong luồng bình thường. Tuy vậy bảng mã phải là nguồn duy nhất | Kiến trúc sư (đang review API_GD2/T200) thêm 2 dòng vào §2: `400 BAD_REQUEST "Yêu cầu không hợp lệ"` (lỗi 4xx của body-parser/http-errors, ví dụ gzip hỏng hoặc client hủy giữa chừng) và `415 UNSUPPORTED_MEDIA_TYPE "Định dạng dữ liệu gửi lên không được hỗ trợ"` (content-encoding/charset lạ). Đồng thời thêm 1 dòng vào bảng QD_ZOD §4.2 với task = BUG-001 |
| 2 | NIT | `apps/api/src/middlewares/errorHandler.js:20` | Lỗi http-errors 4xx khác 400/415 (ví dụ 403/404 do middleware bên thứ ba ném ra) sẽ trả đúng status nhưng `code` lại là `BAD_REQUEST`, lệch với bảng (`FORBIDDEN`/`NOT_FOUND`). Hiện không có nguồn nào sinh ra loại lỗi này, và báo cáo đã ghi rủi ro | Để nguyên. Khi thêm middleware bên thứ ba có khả năng ném 403/404 thì ánh xạ theo status |
| 3 | NIT | `apps/api/tests/security/BUG-001.test.js` | Chưa có test cho trường hợp lỗi 5xx có `expose` hoặc lỗi lạ vẫn ra 500 + `logger.error` sau khi thêm nhánh mới. Các test 500 cũ của T199/T215 đã phủ một phần | Không bắt buộc. Có thể thêm 1 test lỗi `{ status: 503, expose: false }` → 500 INTERNAL nếu sau này errorHandler còn được sửa |
| 4 | NIT | (chung) | Lint chưa chạy được vì chưa có ESLint (T202) | Kiểm lại khi T202 xong |

Không có BLOCKER hoặc MAJOR. Bên bao-mat nên xác nhận việc đổi tên và chú thích trong `T215-bao-mat.test.js` (báo cáo có nêu câu hỏi này). Theo diff, assertion không đổi.
