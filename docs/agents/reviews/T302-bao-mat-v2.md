# Review T302 – bao-mat – vòng 2
Kết luận: APPROVED

## Tôi đã tự kiểm tra
- Đọc lại: `apps/web/src/lib/nav.js`, `apps/web/src/pages/ChangePasswordPage.jsx`, mục "Vòng sửa 1" trong `reports/T302.md`.
- `tests/security/T302-next-control-chars.test.jsx`: nội dung giống hệt bản tôi viết ở vòng 1 (4 ca: `\t`, `\n`, `\r` và luồng đăng nhập với `createBrowserRouter`), không bị sửa hay làm yếu.
- `npm test -w @nckh/web`: `Test Files 9 passed (9)`, `Tests 58 passed (58)`, không còn unhandled error.
- `npm run lint`: `eslint .` sạch.
- `npm run build -w @nckh/web`: `index-_WyzmMjz.js 473.27 kB (gzip 148.02 kB)`, `✓ built in 195ms`.

## Đối chiếu vấn đề vòng 1
| # | Mức | Đã sửa? | Ghi chú |
|---|---|---|---|
| 1 | MAJOR | Đạt | `safeNext` trả `null` khi có ký tự U+0000–U+001F hoặc U+007F (so sánh từng ký tự). `params.get` đã giải mã `%09`, nên dạng mã hóa phần trăm cũng bị chặn. Test bảo mật xanh: đăng nhập về `/de-tai`. |
| 2 | MINOR | Đạt | `/auth/me` đã tách khỏi `try` của đổi mật khẩu. Nếu `/me` lỗi: tạm đặt `mustChangePassword: false`, vẫn toast và về trang chủ. Có test riêng. Phía server vẫn chặn bằng `PASSWORD_CHANGE_REQUIRED` nếu cờ thật còn bật, nên không phải lỗ hổng. |

## Vấn đề
Không có.

BLOCKER: 0 · MAJOR: 0 · MINOR: 0

Kết luận: APPROVED
