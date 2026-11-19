# Review bảo mật TASK-DC-12 v1 (bao-mat)

Phạm vi: `git diff` chưa commit trên b2945cc (shared, api auth, web). Kết luận: **APPROVED** (0 BLOCKER, 0 MAJOR, 2 MINOR về tài liệu).

## Lệnh đã chạy
- `npm run lint` → exit 0, không cảnh báo.
- `DB_TEST_DRIVER=embedded npm run db:test:up` → "Kiểm tra DB test: tất cả OK"; `npm run db:test:reset` → "Đã reset DB test (migrate reset)".
- `npm test` → exit 0: shared 115/115, api 84 file 1217/1217, web 33 file 271/271. Không chạy lại E2E (dev báo 74/74).

## Kết quả theo trọng tâm
| Mục | Kết quả |
|---|---|
| Open redirect qua `next` | Đạt. `nextPathSchema` (`packages/shared/src/schemas.js:67-71`): ≤512, bắt đầu `/`, không `//`, không `\`, không U+0000–001F/007F. Từ chối `//evil`, `/\evil`, `/\t/evil`, `/\n/x`, `https://evil`, `javascript:`, chuỗi rỗng, mảng, null (test `schemas.test.js`). `%2F%2F` giữ nguyên dạng mã hóa, là đường dẫn cùng origin theo nghĩa đen, không thành `//`. API `safeNext` (`ssoService.js:18`) và web `nav.js#safeNext` cùng gọi schema, không còn lệch. Server không bao giờ redirect tới `next`; chỉ đưa vào query đã `encodeURIComponent` trên `PUBLIC_APP_URL`. |
| Href nút Google | Đạt. `LoginPage.jsx` chỉ gắn `next` đã qua `safeNext` và `encodeURIComponent`; gốc `/api/auth/google/start` cố định. |
| `ssoLoader`/`afterLoginPath` | Đạt. `next` qua `safeNext` rồi `canVisit(role)`, nên đường lạ về trang chủ vai trò; `redirect()` chỉ nhận đường nội bộ; mật khẩu tạm ưu tiên `/doi-mat-khau`; không có phiên về `/dang-nhap`. |
| m2 middleware lỗi callback | Đạt. `auth/routes.js:87-95`: chỉ gắn ở `/google/callback`, đặt sau route nên bắt cả 429 của limiter lẫn lỗi handler. SSO tắt hoặc `headersSent` → `next(err)`. Đích là `appUrl` (cấu hình) + mã hằng `RATE_LIMITED`/`SERVER_ERROR`, không phản chiếu input hay `err.message`. Luôn `clearCookie(nckh_oauth)` cùng `path`. Không cấp phiên (tx rollback, không set `nckh_rt`); `ssoOk` không đặt nên limiter vẫn đếm thất bại. Log `err` chỉ ở server. |
| `sso_error` → XSS | Đạt. `ssoMessage` tra `SSO_ERROR_LABEL[code]`, mã lạ → chuỗi cố định, hiển thị qua React (thoát HTML). Bảng nhãn là object đóng băng nhưng tra bằng khóa tùy ý như `__proto__`/`constructor` trả về giá trị thừa kế (không phải chuỗi cố định); xem MINOR m2. |
| Hồ sơ chỉ sửa `phone` | Đạt. Form chỉ gửi `{ phone }`; backend `profileUpdateSchema` strict (`accounts/routes.js:85`), limiter 10/15 phút/user, chỉ hồ sơ của người gọi (`req.user`). |
| Liên kết Hồ sơ mọi vai trò | Đạt. `SCREENS` `ho-so` cho 4 vai trò kể cả ADMIN (đúng GD7 §10.1 "mọi vai trò kể cả ADMIN"); ẩn khi `mustChangePassword`; backend vẫn kiểm quyền. |

## Phát hiện
| # | Mức | Vị trí | Mô tả | Đề xuất |
|---|---|---|---|---|
| m1 | MINOR | `docs/agents/design/UI.md` §12.3, `API_GD7.md` §8.2/§607 | Hai mã `RATE_LIMITED`, `SERVER_ERROR` đã ở `labels.js:126-127` nhưng chưa có trong tài liệu | KTS bổ sung vào bảng §12.3 và GD7 §8.2 (đồng ý dùng mã mới thay `GOOGLE_ERROR` vì nhãn đó sai khi lỗi là DB) |
| m2 | MINOR | `apps/web/src/pages/LoginPage.jsx` (`ssoMessage`) | `SSO_ERROR_LABEL[code]` với `code='constructor'`/`toString` trả hàm/đối tượng thừa kế, không phải chuỗi cố định. React không render hàm (chỉ cảnh báo), không XSS, không khai thác được | Dùng `Object.hasOwn(SSO_ERROR_LABEL, code)` trước khi tra |

## Trả lời câu hỏi của dev
- Hai mã mới chưa có trong UI §12.3/GD7 §8.2: chấp nhận, ghi bổ sung (m1).
- Log mức error cho mọi lỗi không phải 429: chấp nhận. Không lộ thông tin cho người dùng, log chỉ ở server.
- Sửa ca "lần 21 bị 429 JSON" thành 302 `RATE_LIMITED`: đúng theo m2 của BM DC-03 (callback là điều hướng trình duyệt). Không vi phạm quy tắc 1 vì ý ca (lần 21 bị chặn, IP khác không bị) giữ nguyên, khẳng định mạnh hơn (302, `ratelimit-remaining: 0`, cookie bị xóa); đã ghi lý do trong báo cáo. Ca "SSO tắt vẫn 404 JSON" được thêm để giữ hành vi cũ.
- m2, m3 của DC-03: đã xử lý (302 về `/dang-nhap`; `nextPathSchema` dùng chung).

Không thêm test tấn công vì các ca open redirect đã được `schemas.test.js` và `dc12.test.jsx` phủ.
