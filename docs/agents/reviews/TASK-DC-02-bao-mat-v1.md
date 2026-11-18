# Review TASK-DC-02 – bao-mat – vòng 1
Kết luận: APPROVED

Reviewer duy nhất (chế độ tiết kiệm quota). Không tin báo cáo: tự đọc `git diff`, file chưa theo dõi (migration, `tests/DC02-profile.test.js`), tự chạy lint/test.

## Tôi đã tự kiểm tra
- `npm run lint` → `eslint . --max-warnings 0`, exit 0, không lỗi, không cảnh báo.
- `npm test` → exit 0: shared `7 files / 91 passed`; api `73 files / 996 passed` (gồm `DC02-profile` 18 ca); web `32 files / 245 passed` → 1332/1332, khớp báo cáo.
- Chạy `profileUpdateSchema.safeParse` với đầu vào biên: `{phone:null, role:'ADMIN'}` → lỗi `unrecognized_keys` (path `_`); `{}`, `{phone:1}`, `{phone:{a:1}}` → `phone: "Số điện thoại không hợp lệ"`; ký tự zero-width `​`, chữ số Ả Rập-Ấn `٠٩١...` → bị từ chối (`\d` không cờ `u` chỉ khớp ASCII); `"0912345678\n"` → chấp nhận, chuẩn hóa thành `0912345678` (đúng thiết kế: bỏ khoảng trắng). Body không phải object → 400.
- Đọc: diff 9 file + migration `20261118000100_dc_profile`; `API_GD7.md` §10.1; `DAC_TA.md` FR30 (dòng 255); `lib/router.js` (`businessRouter` = guard đầu tiên), `middlewares/{validate,rateLimit}.js`, `lib/logger.js` (`LOG_REDACT`), `audit/service.js` (`redact`, `listAudit`), `auth/service.js` (`publicUser`), `accounts/{service,prismaRepo}.js`, migration `search_and_security` (vòng lặp bật RLS cho mọi bảng `public`).
- Grep mọi nơi đọc `User` ở `apps/api/src` (`.user.find*`, `include: { user|lecturer|... }`): tất cả dùng `select` tường minh (`person = { id, code, fullName }`, `publicUser`, `userView`), không có `include: { user: true }` → cột `phone` mới không lọt vào `TopicDetail.members`, `ApplicationView`, `/api/lecturers`, `/api/auth/me`, danh sách tài khoản, CSV.

## Đối chiếu đặc tả
| Điều kiện đạt | Đạt? | Ghi chú |
|---|---|---|
| Chỉ xem/sửa hồ sơ của chính mình (không IDOR) | Đạt | Route không có `:id`; service dùng `actor.id` từ `req.user` (JWT + guard); id/userId trong body bị strict chặn; query bị bỏ qua |
| Strict, không mass assignment | Đạt | `z.strictObject`; repo chỉ ghi `data: { phone }` (không spread body) → kể cả schema lỏng sau này cũng không ghi trường khác. Test role/fullName/email/{} → 400, DB không đổi |
| Regex SĐT, chuẩn hóa, null/rỗng = xóa | Đạt | `^(0|\+84)(3|5|7|8|9)\d{8}$` khớp GD7; `.max(40)` trước transform chặn chuỗi dài; thông điệp tiếng Việt |
| Limiter 10/15 phút/user | Đạt | `keyBy: 'user'` đứng sau guard (có `req.user`); đặt trước `validate` nên request sai cũng bị đếm (chặt hơn, chống dò). Test lần 11 → 429 |
| AuditLog cùng transaction | Đạt | `updatePhone`: `$transaction` khóa dòng `FOR NO KEY UPDATE` (SQL tham số hóa qua tagged template), đọc `before` sau khóa, update + `recordAudit` cùng `tx`. Sai định dạng → không audit (test) |
| `phone` ở `GET /api/users/:id` đúng phạm vi | Đạt | Chỉ `get()` thêm `phone`, sau `mustManage` (ADMIN; STAFF qua `canManage` trong khoa). `list/create/update` vẫn `userView` không có `phone`. Test: ADMIN, STAFF trong phạm vi thấy; STAFF khoa khác, SV, GV → 403; danh sách không có `phone` |
| SV/GV không xem SĐT người khác | Đạt | Không đường đọc nào khác trả `phone` (xem grep ở trên) |
| Dữ liệu cá nhân trong log | Đạt | pino không log body; `req.user` (`publicUser`) không có `phone`. AuditLog chứa SĐT theo đúng thiết kế (`before/after: { phone }`); `listAudit` hiện không có route nào → không lộ qua API (xem m2) |
| Migration + RLS | Đạt | Chỉ `ADD COLUMN "phone" TEXT` nullable, không khóa bảng lâu, không mất dữ liệu; `User` đã bật RLS từ `search_and_security` (không có policy cho anon → PostgREST không đọc được) |
| ADMIN chỉ có hồ sơ của mình, không thêm quyền nghiệp vụ | Đạt | FR30 "mọi vai trò"; không mở thêm đường nào cho ADMIN |
| Không lộ `passwordHash` | Đạt | `findProfile` dùng `select` tường minh; test so `toEqual` toàn bộ object |

## Trả lời câu hỏi của agent
- **Câu 1 (mount trong `if (accountRepo)`):** chấp nhận. Hồ sơ chỉ cần `accountRepo`; mount ở tiền tố riêng `/api/me/profile` đặt trước `app.use('/api/me', meRouter)` nên request profile không đi qua router topics, và `/api/me/<khác>` không khớp tiền tố profile → vẫn tới `meRouter` như cũ. Router qua `businessRouter(guard)` → có xác thực, chặn tài khoản khóa và buộc đổi mật khẩu như mọi route nghiệp vụ.
- **Câu 2 (thông điệp cho `phone` thiếu/sai kiểu):** chấp nhận cùng "Số điện thoại không hợp lệ" (đã chạy thử: thiếu, số, object đều ra thông điệp này ở `details.phone`). Không lộ thông tin gì; trường lạ trả lỗi ở khóa `_` theo locale vi chung (`schemas.js:6`), đủ cho 400.

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| m1 | MINOR | `apps/api/tests/DC02-profile.test.js` | Việc `phone` không lộ ở `TopicDetail.members`, `/api/lecturers`, `/api/auth/me` hiện chỉ đúng nhờ `select` tường minh, chưa có test hồi quy khóa lại (GD7 §10.1 liệt kê rõ các chỗ "không thêm phone"). Một `include: { user: true }` sau này sẽ lộ SĐT mà không test nào đỏ | Thêm 1 ca: đặt `phone` cho SV, gọi `/api/auth/me` và chi tiết đề tài có SV đó → `JSON.stringify(body)` không chứa số. Có thể làm ở DC-12 hoặc task kế tiếp chạm module topics |
| m2 | MINOR | `apps/api/src/modules/accounts/prismaRepo.js:24`; `audit/service.js` (`listAudit`) | AuditLog `PROFILE_UPDATE` lưu SĐT dạng rõ (đúng thiết kế). Hiện không route nào đọc AuditLog nên an toàn; nếu sau này có màn xem lịch sử cho STAFF/GV thì phải lọc theo phạm vi hoặc che `phone` | Ghi chú cho task nào mở API đọc AuditLog: áp FR30 "chỉ chính người đó, cán bộ trong phạm vi, quản trị" cho `before/after.phone` |
| m3 | MINOR | `apps/api/src/modules/accounts/prismaRepo.js:106` (`remove`) | Tác dụng phụ: sau khi người dùng tự sửa SĐT, có AuditLog `actorId = chính họ` → xóa cứng tài khoản trả 409 `IN_USE`, chỉ còn khóa. Nhất quán với FR15 ("ghi ai") nên không phải lỗi bảo mật, nhưng cán bộ có thể bất ngờ | Ghi vào tài liệu hướng dẫn quản trị (hoặc thông báo 409 đã gợi ý "khóa thay vì xóa" – đủ) |

Tổng vòng 1: 0 BLOCKER, 0 MAJOR, 3 MINOR (không chặn DONE).
