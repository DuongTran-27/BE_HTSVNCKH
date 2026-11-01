# Review T301 – bao-mat – vòng 2
Kết luận: CHANGES_REQUESTED

## Tôi đã tự kiểm tra
File đã đọc: `docs/agents/reviews/T301-bao-mat-v1.md`, `docs/agents/reports/T301.md` (mục "Vòng sửa 1"), `apps/web/src/lib/{api,auth,toast,queryClient}.js`, `apps/web/src/components/Toast.jsx`, `apps/web/src/main.jsx`, `apps/web/src/lib/api.test.js`, `apps/web/tests/security/logout-race.test.js`. Không đọc `.env`.

Test tấn công mới (giữ lại vì phát hiện lỗi): `apps/web/tests/security/logout-guest-refresh.test.js`.

```
npm test -w @nckh/web
 ❯ tests/security/logout-guest-refresh.test.js (1 test | 1 failed)
   × request mới trong lúc /auth/logout đang bay: không được refresh hồi sinh phiên
AssertionError: expected 'new' to be null
 ❯ tests/security/logout-guest-refresh.test.js:31:34   expect(auth.get().accessToken).toBeNull();
 Test Files  1 failed | 6 passed (7)
      Tests  1 failed | 30 passed (31)
npm error Lifecycle script `test` failed with error: code 1
```
Các test còn lại (30) xanh, trong đó có `tests/security/logout-race.test.js` (vòng 1) – khớp báo cáo (6 file / 30 test trước khi thêm test mới).

## Đối chiếu đặc tả
| Điều kiện đạt | Đạt? | Ghi chú |
|---|---|---|
| v1 #1: refresh đang chạy khi logout không hồi sinh phiên | Đạt | `generation` tăng ở `clearClientSession`; `doRefresh` bỏ `setSession` khi thế hệ đổi; `api()` không gửi lại và ném `sessionExpired` khi thế hệ đổi; `logout` gửi `/auth/logout` sau khi refresh đang chạy xong (mang cookie mới nhất); `login` chờ `serverLogout`. `logout-race.test.js` xanh, không bị sửa. |
| v1 #1(c): hủy query trước khi xóa cache | Đạt | `cancelQueries()` rồi `clear()`; kết quả về muộn bị chặn bởi kiểm tra thế hệ ở `api()` nên không đổ vào cache. |
| v1 #3: logout không qua refresh/toast hết hạn/giữ `next` | Đạt | `logout` gọi thẳng `send()`; có test. |
| Token cũ không lọt lại vào bộ nhớ | **Không đạt** (đường khác) | Xem #1: request **mới** sinh sau khi xóa client, không mang token, vẫn kích hoạt refresh bằng cookie mà server chưa thu hồi. |
| Request retry sau logout | Đạt (với request cũ) | Request bắt đầu trước logout: kiểm tra `gen` trước lần gửi lại. Request mới sau logout: rơi vào #1. |
| Lộ dữ liệu cache sau logout | Đạt với request cũ; phụ thuộc #1 với request mới | |
| `login` chờ logout | Đạt | `await serverLogout` trước `/auth/login`; `serverLogout` không bao giờ reject (`.catch(() => {})`). |
| Toast có nút hành động | Đạt | `message`/`label` hiển thị dạng text React (tự escape); `onClick` do code đặt, không từ server. |
| Chỉ `/api` tương đối, token chỉ trong bộ nhớ | Đạt | Không đổi so với vòng 1. |

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| 1 | MAJOR | `apps/web/src/lib/api.js:157-160` (`api()`), `:206-215` (`logout`) | **Phiên vẫn hồi sinh được qua một request mới sinh trong lúc `/auth/logout` chưa xong.** `clearClientSession` không tăng thế hệ "cho tương lai": request bắt đầu **sau** khi xóa client mang `gen` mới, không có token → server 401 → `refreshSession()` với `gen` mới → nếu server xử lý refresh trước logout (logout chậm/HTTP/2 song song; hoặc trong nhánh có refresh đang chạy, logout chỉ được gửi sau refresh nên mọi request mới trong khoảng đó cũng refresh bằng cookie mới) thì `doRefresh` thấy `gen === generation` → `auth.setSession` → token + user của người vừa đăng xuất quay lại bộ nhớ, dữ liệu vào cache. Nguồn request mới là có thật: `auth.clear()` làm re-render, `useQuery` còn mount tạo lại query sau `queryClient.clear()` và fetch trước khi `onLogout` điều hướng (nhánh không có refresh chờ `await serverLogout` rồi mới điều hướng); retry của query (status 0/503) cũng vậy. Ngay cả khi BUG-002 sửa phía server, access token đã cấp vẫn dùng được tới 15 phút trên máy dùng chung. Cùng hậu quả với v1 #1, xác suất thấp hơn (cần server xử lý lệch thứ tự). Chứng minh: `apps/web/tests/security/logout-guest-refresh.test.js` (đỏ). | Request không mang token thì không có gì để làm mới: chỉ refresh khi `sentToken` khác null, vd. `if (res.status === 401 && sentToken && !NO_REFRESH.has(path) && gen === generation)`. (Khởi động dùng `bootstrapSession` → `refreshSession` trực tiếp nên không ảnh hưởng.) Tùy chọn thêm: `refreshSession` chờ `serverLogout` trước khi gửi. Test trên phải xanh, không sửa test. |
| 2 | INFO | `apps/web/src/lib/api.js:128-133` | `clearClientSession` không xóa toast; toast của phiên trước (thông điệp lỗi server có thể chứa tên đề tài) còn hiện ≤ 5 giây sau đăng xuất. | Có thể xóa toast lỗi khi logout; không chặn. |
| 3 | INFO | – | Tab khác vẫn giữ access token trong bộ nhớ tới khi hết hạn (≤ 15 phút) sau khi một tab đăng xuất. Ngoài phạm vi vòng sửa; ghi nhận cho T303/thiết kế (vd. `BroadcastChannel` báo đăng xuất). | Không chặn T301. |

Ghi chú: `apps/web/tests/security/logout-guest-refresh.test.js` giữ lại theo quy trình bảo mật; `npm test` đỏ cho đến khi #1 được sửa. Không được xóa/skip/sửa test để cho qua (CLAUDE.md quy tắc 1). v1 #2 (server) theo dõi ở BUG-002, không thuộc T301.

Kết luận: CHANGES_REQUESTED – BLOCKER 0, MAJOR 1, MINOR 0, INFO 2.
