# Review T302 – bao-mat – vòng 1
Kết luận: CHANGES_REQUESTED

## Tôi đã tự kiểm tra
- Đọc: `CLAUDE.md`, `QUY_TRINH.md`, `reports/T302.md`, FR01 (`DAC_TA.md`), UI §1.1, §1.2, §4.1, §4.2; `LoginPage.jsx`, `ChangePasswordPage.jsx`, `lib/nav.js`, `router.jsx` (diff), `lib/api.js`, `lib/forms.js`, `lib/useCooldown.js`, `main.jsx`, `auth-pages.test.jsx`; mã nguồn `react-router` 8.4.0 (`history.js`, `router.js`).
- `npm test -w @nckh/web`: 18 test của T302 và các test cũ đạt (50 đạt, khớp báo cáo); **4 test bảo mật mới của tôi đỏ** (xem #1) → tổng `Tests 4 failed | 50 passed (54)`.
- `npm run lint`: `eslint .` sạch.
- `npm run build -w @nckh/web`: `index-C_L_VeJp.js 473.18 kB (gzip 147.97 kB)`, `✓ built in 205ms`.
- Test tấn công giữ lại: `apps/web/tests/security/T302-next-control-chars.test.jsx`.

## Đối chiếu đặc tả
| Điều kiện đạt | Đạt? | Ghi chú |
|---|---|---|
| R1: `mustChangePassword` → `/doi-mat-khau` (bỏ `next`) | Đạt | Có test |
| R1: `next` chỉ nội bộ; **sai → trang chủ vai trò** (UI §1.2) | Không | `next` có tab/CR/LF lọt qua `safeNext`, xem #1 |
| R1: chỉ điều hướng bằng `navigate()`, không `window.location` | Đạt | |
| R1: 401 giữ thông điệp server (không lộ tài khoản tồn tại), xóa mật khẩu, giữ mã | Đạt | |
| R1: 403 `ACCOUNT_LOCKED`, 429 `TEMP_LOCKED`/`RATE_LIMITED` + cooldown | Đạt | |
| R2: banner + chỉ "Đăng xuất" ở chế độ bắt buộc; nhập lại chỉ client | Đạt | Ẩn menu thuộc T303 |
| R2: 204 → `GET /auth/me` → `setUser` → toast → trang chủ | Đạt | |
| R2: `WRONG_PASSWORD`/`SAME_PASSWORD` vào ô; 429 cooldown | Đạt | |
| Token chỉ trong bộ nhớ; không lưu mật khẩu/token vào storage | Đạt | |

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| 1 | MAJOR | `apps/web/src/lib/nav.js:7-9` | `safeNext('/\t/evil.com')` (cả `\n`, `\r`) trả nguyên chuỗi. Bộ phân tích URL bỏ tab/xuống dòng nên chuỗi đó thành `//evil.com`. Chuyển hướng ra ngoài **không** xảy ra, nhưng chỉ vì `react-router` 8 tự chặn (`Error: External navigation is not allowed` tại `validateNavigationTarget`), không phải nhờ `safeNext`. Hậu quả có thật: link `/dang-nhap?next=%2F%09%2Fevil.com` khiến đăng nhập **thành công ngầm** (đã có phiên) nhưng màn vẫn đứng ở form, không báo lỗi (unhandled rejection vì `navigate` nằm trong `try` nhưng lỗi ném bất đồng bộ). Trái UI §1.2 "Sai → về trang chủ vai trò"; kẻ tấn công dùng được để làm người dùng tưởng đăng nhập hỏng. Chứng minh: `tests/security/T302-next-control-chars.test.jsx` (4 ca đỏ). | Chặn thêm ký tự điều khiển, ví dụ thêm điều kiện `/[\u0000-\u001f\u007f]/.test(next)` → `null`. Thêm các ca này vào test `safeNext`. Test bảo mật kia phải xanh. |
| 2 | MINOR | `apps/web/src/pages/ChangePasswordPage.jsx:36-38` | Nếu `POST /change-password` đã 204 mà `GET /auth/me` lỗi (mất mạng/5xx), catch hiện lỗi chung trên form dù mật khẩu đã đổi. Người dùng thử lại sẽ nhận `WRONG_PASSWORD`, dễ nhầm. | Tách `/auth/me` khỏi try chính; lỗi `/me` thì vẫn toast thành công và tạm `setUser({ ...user, mustChangePassword: false })`, hoặc ghi lại cho T303. |

BLOCKER: 0 · MAJOR: 1 · MINOR: 1

Kết luận: CHANGES_REQUESTED
