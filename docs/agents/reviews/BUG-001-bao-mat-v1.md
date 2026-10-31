# Review BUG-001 – bao-mat – vòng 1
Kết luận: APPROVED

## Tôi đã tự kiểm tra
File đã đọc: `docs/agents/reports/BUG-001.md`, `apps/api/src/middlewares/errorHandler.js` (cả file và `git diff`), `apps/api/src/app.js`, `apps/api/tests/security/BUG-001.test.js`, `git diff apps/api/tests/security/T215-bao-mat.test.js`, `docs/agents/reviews/T215-bao-mat-v1.md` (MINOR #1).

**Test T215-bao-mat.test.js do tôi viết, backend-dev đã sửa (`git diff`):** chỉ đổi `it.fails.each` → `it.each`, bỏ cụm "(hiện 500 INTERNAL)" trong tên test, và sửa 1 dòng chú thích. Thân test không đổi: vẫn `status >= 400`, `status < 500`, `logger.error` không được gọi. Assertion không bị nới, tôi đồng ý với thay đổi.

**Tấn công lại.** Tôi viết file probe tạm `apps/api/tests/security/tmp-bug001/probe.test.js` (supertest, http thô, `NODE_ENV=production`), rồi xóa sau khi chạy vì không tìm thấy lỗi. Kết quả:

| Tấn công | Status | Body | log error | log warn |
|---|---|---|---|---|
| `content-encoding: br-fake` | 415 | UNSUPPORTED_MEDIA_TYPE, tiếng Việt cố định | 0 | 1 (reqId, type, status) |
| `content-encoding: gzip, gzip` | 415 | như trên | 0 | 1 |
| gzip hỏng / deflate hỏng | 400 | BAD_REQUEST "Yêu cầu không hợp lệ" | 0 | 1 (không có `type`) |
| gzip bị cắt cụt (http thô) | 400 | BAD_REQUEST | 0 | 1 |
| `charset=koi9-fake` | 415 | UNSUPPORTED_MEDIA_TYPE | 0 | 1 |
| `charset=utf-16` | 400 | BAD_JSON | 0 | 0 |
| JSON hỏng / JSON strict (`"abc"`) | 400 | BAD_JSON | 0 | 0 |
| body 200KB | 413 | PAYLOAD_TOO_LARGE | 0 | 0 |
| gzip bomb 5MB giải nén (http thô) | 413 | PAYLOAD_TOO_LARGE | 0 | 0 |
| encoding lạ gửi vào route cần đăng nhập `/api/auth/change-password` và route không tồn tại | 415 | UNSUPPORTED_MEDIA_TYPE (body-parser chạy trước auth/404, nên không lộ route nào tồn tại) | 0 | 1 |

Mọi response được kiểm bằng regex: không có stack, `node_modules`, `.js:N`, `zlib`, `incorrect`, message gốc tiếng Anh, giá trị header do kẻ tấn công gửi (`br-fake`, `koi9`). Body dưới 1KB. Log warn chỉ có `reqId/type/status`, không có `err.message` và không phản chiếu header của client.

**Kiểm nhánh mới (mọi http-errors 4xx có `expose`).** Tôi dựng app express riêng, chỉ gắn `errorHandler`:
- `createError(403, 'bí mật nội bộ…')` → 403 BAD_REQUEST, message cố định, không lộ message gốc.
- `createError(502, 'upstream secret')`, tức `expose=false` → 500 INTERNAL + log error, như cũ.
- `Error` có `status: 404` nhưng không có `expose` → 500 INTERNAL, không lộ.
- Nhánh không bao giờ đọc `err.message`/`err.stack`/`err.headers`, nên kể cả khi `expose=true` cũng không có đường lộ thông tin. Trong `src/` không có chỗ nào tự ném http-errors (`grep expose|createError|http-errors` chỉ ra errorHandler). Nhánh `AppError`, BAD_JSON, 413 vẫn đứng trước, nên lỗi nghiệp vụ không bị nuốt.

**Log rác do người chưa đăng nhập:** họ không còn ghi được log mức error. Mỗi request lỗi vẫn sinh 1 dòng warn, nhưng ở prod pino-http `autoLogging` đã ghi 1 dòng info cho mỗi request, nên dòng warn không làm tăng bậc khuếch đại. Đường này cũng đã bị giới hạn bởi body limit 100kb. Chấp nhận được.

**Lệnh:**
```
$ npm test   (gốc repo)
 RUN  v4.1.12 .../packages/shared
 Test Files  2 passed (2)
      Tests  21 passed (21)
 RUN  v4.1.12 .../apps/api
 Test Files  9 passed (9)
      Tests  87 passed (87)

$ npx vitest run tests/security --reporter=verbose   (apps/api)
 ✓ BUG-001 … 5/5 test đạt
 ✓ T215-bao-mat … "content-encoding lạ: trả 4xx và không ghi log error", "gzip hỏng: trả 4xx và không ghi log error" (trước đây là it.fails) đạt

$ npx vitest run tests/security/tmp-bug001   (probe tạm, đã xóa)
 Tests  3 passed (3)
```
Kết quả khớp số liệu trong báo cáo (87/87, 21/21). Lint chưa chạy được (T202), báo cáo đã ghi.

## Đối chiếu đặc tả
| Điều kiện đạt | Đạt? | Ghi chú |
|---|---|---|
| Lỗi body-parser 4xx (encoding lạ, gzip hỏng, charset lạ) trả `err.status`, không trả 500 | Đạt | 415 / 400 / 415 |
| Thông điệp tiếng Việt cố định, không dùng `err.message` (NFR02, CLAUDE.md #7) | Đạt | Đã probe, không thấy message zlib/thư viện |
| Không ghi `logger.error` cho lỗi phía client | Đạt | Chuyển sang warn, chỉ có trường an toàn |
| 2 `it.fails` → `it`, assertion giữ nguyên | Đạt | Đã đối chiếu `git diff` |
| Không hồi quy BAD_JSON 400 / 413 / VALIDATION_ERROR / gzip bomb 413 | Đạt | Test BUG-001, T215 và probe |
| 5xx / lỗi không có `expose` vẫn 500 INTERNAL + log error | Đạt | Probe `/b`, `/c` |

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| 1 | NIT | `apps/api/src/middlewares/errorHandler.js:18-20` | http-errors 4xx khác 400/415 (ví dụ 403/404 nếu sau này có middleware bên thứ ba ném ra) trả mã `BAD_REQUEST` với status khác 400. Không có rủi ro bảo mật, chỉ là mã lệch nghĩa. Hiện chỉ body-parser sinh loại lỗi này | Kiến trúc sư quyết khi bổ sung `BAD_REQUEST`/`UNSUPPORTED_MEDIA_TYPE` vào API_GD2 §2 (câu hỏi đã có trong báo cáo) |
| 2 | NIT | `errorHandler.js:17` | Log warn cho gzip hỏng không có `type`, vì lỗi zlib không mang `err.type`. Đối chiếu log sẽ khó hơn một chút. Không cần ghi `err.message` | Có thể thêm `code: err.code` (ví dụ `Z_DATA_ERROR`, không phải dữ liệu của client). Không bắt buộc |

Không giữ file test tấn công mới, vì probe không phát hiện lỗi và `BUG-001.test.js` cùng `T215-bao-mat.test.js` đã phủ các đường chính.

Kết luận: APPROVED – MINOR #1 của T215-bao-mat-v1 đã được sửa đúng, không có lỗ hổng khai thác được, nhánh mới không lộ thông tin; 2 NIT không chặn.
