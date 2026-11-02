# Review T207b – bao-mat – vòng 1
Kết luận: CHANGES_REQUESTED

## Tôi đã tự kiểm tra
- Đã đọc: `reports/T207b.md`, API_GD2 §3.2 (dòng 217–232), QD_ZOD §4.3 (mục 4–6) và §4.4, `git diff`, `lib/multipart.js`, `accounts/{importService,importLock,routes,prismaRepo}.js`, `packages/shared/src/{csv,users}.js`, `auth/routes.js`, `tests/T207b-import.test.js`, `tests/security/T207a-vong1.test.js`.
- `npm run db:test:reset` → `Đã reset DB test (migrate reset).`; `npm run lint` → exit 0.
- `NO_COLOR=1 npm test` → shared `59 passed (59)`; api `28 passed (28)`, `290 passed (290)`; web `75 passed (75)`; EXIT=0. Số này đã gồm 11 test tấn công mới của tôi.
- Test tấn công mới `apps/api/tests/security/T207b-multipart.test.js` (11 test, không cần DB, gửi bằng `http` thô). Các ca đều đúng kỳ vọng:
  - Body chunked không có Content-Length và vượt ngưỡng → 413.
  - File vượt `fileSize` nhưng tổng body vẫn dưới phần dư cho header/biên (slack) → 413.
  - 400 cho: 8 phần, hai file, file ở field khác, field văn bản quá dài, có preamble, thiếu biên kết thúc, không có file, sai Content-Type, thiếu boundary.
- **Đột biến** (MINOR 2 của T207a-v2): tạm comment `await r.lockUser(record.userId, true)` trong `refresh`. Ca "refresh ‖ khóa tài khoản" đỏ với `AssertionError: expected 1 to be +0`, tức đỏ đúng vì **hậu quả** (còn token sống), không phải vì hết giờ chờ. Đã khôi phục file; sha256 trước và sau trùng nhau (`d47bfa348cc8ba48`).

## Đối chiếu
| Điểm | Đạt? | Ghi chú |
|---|---|---|
| (1) `multipart.js` thay multer | Chấp nhận tạm đến T403 | Có chặn theo Content-Length và theo byte nhận (tối đa khoảng 1,03 MB trong RAM). Giới hạn số phần, số file, cỡ field. Mọi dạng hỏng ra 400. Tìm biên bằng `indexOf`, chạy tuyến tính, không có regex nặng trên body. Chỉ chạy sau guard, vai trò và phạm vi; limiter 10/15 phút. Tên file không được dùng để ghi đĩa hay đặt đường dẫn. Thiếu `fieldNameSize` 100 và `fields ≤ 5` (đang dùng `maxParts 7`); không đáng kể khi đã có giới hạn `maxParts` và `fieldSize`. |
| Kiểm loại file theo đuôi + nội dung (QD §4.3.5–6) | **Thiếu đuôi** | Mục 1 |
| (2) `parseCsv` / CSV injection | Đạt | Parser tuyến tính, ngoặc kép không đóng → 400. Giá trị được lưu nguyên; `escapeCell` chặn `= + - @ \t \r` khi xuất. Server không sinh file CSV nào. FE tải `credentials` phải dùng `toCsv` (ghi chú cho task FE). |
| (3) Quyền trước khi đọc file; phạm vi STAFF chỉ lấy từ query | Đạt | Chuỗi middleware: guard → limiter → vai trò → validate query → `importScope` → upload. Service kiểm lại `mustImportInto`. Có test: STAFF ngoài phạm vi gửi file 2 MB vẫn nhận 403. `role` của dòng CSV chỉ nhận STUDENT/LECTURER, nên không nâng quyền qua CSV được. |
| (4) `importLock` + transaction, va chạm unique → 409 | Đạt | Kiểm và đặt cờ đồng bộ (không có `await` ở giữa), nhả trong `finally`, 403 được trả trước khi giữ cờ. Ghi user và AuditLog trong một transaction; P2002 (gồm unique `lower(code)`) → rollback, 409. AuditLog không chứa mật khẩu. Có `no-store`. |
| (5) `errorCount` = số dòng lỗi | Đạt | `validCount + errorCount = số dòng dữ liệu`, khớp ví dụ trong hợp đồng (38/2) và cụm "tổng thật". |
| (6a) Refresh chỉ xóa cookie khi 401 | Đạt | Có test |
| (6b) Ca refresh ‖ lock khẳng định hậu quả | Đạt | Đột biến ở trên |

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| 1 | MAJOR | `apps/api/src/modules/accounts/routes.js` (import), `lib/multipart.js` | QD_ZOD §4.3.5–6 yêu cầu whitelist đuôi file (`.csv`, không phân biệt hoa/thường) **cùng với** kiểm nội dung. Hiện `req.file.originalname` không được kiểm ở đâu cả, nên file `u.exe` có nội dung CSV hợp lệ vẫn được nhận. Rủi ro khai thác thấp vì đã kiểm UTF-8, NUL và tiêu đề, nhưng điều kiện đạt của đặc tả chưa thỏa. | Trong service hoặc route import: `if (!/\.csv$/i.test(req.file.originalname)) → 400 VALIDATION_ERROR details.file "Loại file không được hỗ trợ"`. Thêm một ca vào `it.each` lỗi cấp file (đuôi `.txt` hoặc `.exe`). |
| 2 | MINOR | `importService.js` (`confirm`); báo cáo mục Rủi ro | Với 2.000 dòng, Argon2 thật chạy 2 luồng có thể mất hàng chục giây. Nếu proxy rewrite `/api` của Vercel hoặc client cắt kết nối trước khi có response, transaction vẫn commit nhưng `credentials` (mật khẩu tạm) bị mất. Khi đó phải reset từng tài khoản. | Đo với Argon2 thật trước khi deploy. Nếu vượt timeout của proxy thì giảm `USER_IMPORT_MAX_ROWS` hoặc ghi rõ cách xử lý trong README. Ghi vào task sau cũng được. |

Kết luận: CHANGES_REQUESTED – BLOCKER 0, MAJOR 1, MINOR 1
