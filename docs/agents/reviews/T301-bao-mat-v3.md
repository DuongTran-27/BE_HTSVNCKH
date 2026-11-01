# Review T301 – bao-mat – vòng 3
Kết luận: APPROVED

## Tôi đã tự kiểm tra
File đã đọc: `docs/agents/reviews/T301-bao-mat-v2.md`, `docs/agents/reports/T301.md` (mục "Vòng sửa 2"), `apps/web/src/lib/api.js`, `apps/web/src/lib/api.test.js`, `apps/web/src/lib/toast.js`, `apps/web/tests/security/logout-guest-refresh.test.js`. Không đọc `.env`.

Test của tôi không bị sửa: `tests/security/logout-guest-refresh.test.js` có mtime 18:32:11, trước lúc ghi review v2 (18:33:15); nội dung khớp bản v2 (dòng 31 `expect(auth.get().accessToken).toBeNull()`). `logout-race.test.js` (vòng 1) mtime 12:47, không đổi.

```
npm test -w @nckh/web
 Test Files  7 passed (7)
      Tests  32 passed (32)
```

Test thăm dò tạm (`tests/security/tmp-v3-probe.test.js`, đã xóa vì không phát hiện lỗi), dồn mọi đường hồi sinh vào một kịch bản: request có token → 401 → refresh đang treo; `logout()` (nhánh có refresh đang chạy, không await); ngay sau đó request khách `api('/topics/mine')` và `bootstrapSession({ retry: true })`; server trả refresh 200 cho tới khi logout xong; cuối cùng gọi thêm `bootstrapSession({ retry: true })` sau logout.
```
npx -w @nckh/web vitest run tests/security/tmp-v3-probe.test.js
 Test Files  1 passed (1)
      Tests  1 passed (1)
```
Kết quả: token/user luôn null, cache không có dữ liệu, `logout()` và mọi promise đều kết thúc (không deadlock).

## Đối chiếu đặc tả
| Điều kiện đạt | Đạt? | Ghi chú |
|---|---|---|
| v2 #1: request không kèm token không refresh | Đạt | `api()` chỉ gọi `refreshSession()` khi `sentToken`; `expireSession` cũng chỉ khi `sentToken`. Nhánh `fresh` sau logout không kích hoạt vì token là null. `logout-guest-refresh.test.js` xanh. |
| `refreshSession` chờ `serverLogout` | Đạt | `await serverLogout` trước `doRefresh`; `gen` lấy trước khi chờ nên logout xảy ra trong lúc chờ vẫn làm kết quả bị bỏ. Có test mới trong `api.test.js` (đã được frontend-dev xác nhận đỏ khi bỏ dòng chờ). |
| Retry của query sau logout | Đạt | Mỗi lần retry là `api()` mới, không có token, nên không refresh. |
| `bootstrapSession({ retry: true })` trong/sau logout | Đạt | Nếu có refresh đang chạy: dùng chung `refreshPromise` cũ (thế hệ cũ, trả `false`), sau đó `auth.clear()`. Nếu không: chờ `serverLogout` rồi mới gửi, cookie đã bị thu hồi. Probe xác nhận. |
| Refresh bắt đầu trước logout | Đạt | Kiểm tra thế hệ trong `doRefresh` (vòng 1); logout gửi sau refresh để thu hồi cookie mới. |
| Không deadlock logout và refresh | Đạt | Refresh bắt đầu trước logout đọc `serverLogout` cũ tại `await` đồng bộ đầu tiên, trước khi `logout` gán promise mới; `serverLogout` không bao giờ reject. Refresh gọi trong lúc logout đang chạy thì dùng lại `refreshPromise` đang treo hoặc chờ `serverLogout`, không tạo vòng chờ. |
| `login` sau logout | Đạt | Chờ `serverLogout`; đây là phiên mới hợp lệ. |
| `/api` tương đối, token chỉ trong bộ nhớ, xóa cache khi logout | Đạt | Không đổi so với vòng 2. |

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| 1 | INFO | `apps/web/src/lib/api.js` (`clearClientSession`), `api.test.js:204-216` | (v2 #2) Toast của phiên trước còn hiện tối đa 5 giây sau khi đăng xuất. **Tôi đồng ý với đề xuất của frontend-dev**: gọi xóa toast trong `clearClientSession` (toast.js hiện chưa có `clearToasts`, cần thêm một hàm nhỏ) và đổi kiểm tra của test "logout: … không toast hết hạn" từ "số toast không đổi" thành "không có toast nào mang thông điệp hết hạn". Ý định của test (logout không báo hết hạn) vẫn được giữ, nên không coi là sửa test để cho qua. Lưu ý `expireSession` gọi `clearClientSession()` **trước** `toast(...)`, nên toast "hết hạn" vẫn hiện. | Không bắt buộc; có thể làm ở T303 cùng `BroadcastChannel`. |

INFO #3 vòng 2 (tab khác giữ token tối đa 15 phút) đã chuyển sang T303, không xét ở đây.

Kết luận: APPROVED – BLOCKER 0, MAJOR 0, MINOR 0, INFO 1.
