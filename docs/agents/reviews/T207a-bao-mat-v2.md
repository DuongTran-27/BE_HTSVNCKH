# Review T207a – bao-mat – vòng 2
Kết luận: APPROVED

## Tôi đã tự kiểm tra
- Đã đọc: mục "Vòng sửa 1" trong `reports/T207a.md`, `auth/{service,prismaRepo}.js`, `accounts/prismaRepo.js` (`updateLocked`), `tests/security/T207a-bao-mat.test.js`, `tests/security/T207a-vong1.test.js`, migration `20261102000100_user_code_lower_unique`.
- `npm run db:test:reset` → `Đã reset DB test (migrate reset).`; `npm run lint` → exit 0.
- `NO_COLOR=1 npm test` → shared `47 passed (47)`; api `26 passed (26)`, `249 passed (249)`; web `75 passed (75)`; EXIT=0.
- **Đột biến:** tạm comment `await r.lockUser(record.userId, true)` trong `refresh`, rồi chạy `tests/security/T207a-bao-mat.test.js` và `T207a-vong1.test.js`:
  ```
  × đổi mật khẩu ‖ refresh đang commit: token N cũng bị thu hồi 5133ms
  × refresh ‖ khóa tài khoản: không còn token sống 4968ms
  × reset mật khẩu ‖ refresh đang commit: không được còn refresh token sống sau reset 336ms
  Tests  3 failed | 2 passed (5)
  ```
  Sau khi chạy, tôi đã khôi phục file. sha256 trước và sau trùng nhau (`d47bfa348cc8ba48`) và không còn dấu đột biến trong file.

## Đối chiếu
| Điểm | Đạt? | Ghi chú |
|---|---|---|
| MAJOR 1: reset/lock/đổi mật khẩu không bỏ sót token đang cấp | Đạt | Refresh lấy `FOR SHARE` trên User trong khóa họ, trước bước đọc user, INSERT N và CAS. Khóa này xung đột với `FOR NO KEY UPDATE` của reset/lock/changePassword. Vì vậy hoặc refresh commit trước rồi `updateMany` của bên kia mới lấy snapshot (thấy N), hoặc refresh phải chờ và đọc thấy trạng thái mới. Login cấp token trong transaction có `FOR SHARE`, đồng thời kiểm lại `isLocked`/`passwordHash`. ChangePassword kiểm lại hash dưới khóa. |
| Thứ tự khóa / deadlock | Đạt | Refresh: advisory → SHARE User → dòng token. Reset/lock/changePassword: User → dòng token. Logout: advisory → dòng token. Lúc refresh chờ khóa User, nó chưa giữ khóa dòng token nào, nên không có vòng chờ. |
| Bộ lọc waiter mở rộng trong `T207a-bao-mat.test.js` | Không làm yếu | Điều kiện cũ (`UPDATE…RefreshToken…userId`) vẫn còn trong `OR`; phần thêm vào chỉ phản ánh điểm chờ mới. Khẳng định quyết định của test là `live == 0` và không đổi. Đột biến ở trên chứng minh test vẫn đỏ khi bỏ khóa. |
| MINOR 2: unique `lower(code)` | Đạt | Index ở DB; test 5 lượt tạo đồng thời luôn ra `[201, 409]`; INSERT thô trùng mã bị DB từ chối. |
| MINOR 3: giữ connection | Đạt | `SET LOCAL lock_timeout = '3s'` là câu đầu tiên trong `withFamilyLock`, nhỏ hơn timeout transaction mặc định 5 s. |

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| 1 | MINOR | `apps/api/src/modules/auth/routes.js` (`/refresh` catch) | Khi hết `lock_timeout`, refresh trả 409 `CONCURRENT_UPDATE`, nhưng route xóa cookie với **mọi** lỗi. Vì vậy người dùng bị đăng xuất dù token vẫn hợp lệ. Lỗi này an toàn (không mở lỗ), chỉ ảnh hưởng trải nghiệm khi có tranh chấp. | Chỉ xóa cookie khi lỗi là 401, hoặc ghi lại để xử lý ở task sau. |
| 2 | MINOR | `tests/security/T207a-vong1.test.js` (ca "refresh ‖ khóa tài khoản") | Khi bỏ `FOR SHARE`, test đỏ vì `waitBlocked` hết giờ chờ (bộ lọc chỉ khớp `FOR NO KEY UPDATE`), không phải vì còn token sống. Ở ca khóa tài khoản, `isLocked` vẫn chặn phiên, nên test này chỉ kiểm điểm chờ chứ không kiểm hậu quả. | Không bắt buộc sửa. Nếu sửa: thêm `UPDATE%RefreshToken%userId%` vào bộ lọc như `T207a-bao-mat.test.js`. |

Kết luận: APPROVED – BLOCKER 0, MAJOR 0, MINOR 2
