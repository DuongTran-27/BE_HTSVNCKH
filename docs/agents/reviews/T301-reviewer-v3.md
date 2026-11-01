# Review T301 – reviewer – vòng 3
Kết luận: APPROVED

## Tôi đã tự kiểm tra
File đã đọc: `reports/T301.md` (mục "Vòng sửa 2"), `reviews/T301-bao-mat-v2.md`, `reviews/T301-reviewer-v2.md`, `apps/web/src/lib/api.js` (toàn bộ), `apps/web/src/lib/auth.js`, `apps/web/src/main.jsx`, `apps/web/src/router.jsx`, `apps/web/src/lib/api.test.js`, `apps/web/tests/security/logout-race.test.js`, `apps/web/tests/security/logout-guest-refresh.test.js`. `apps/web/` vẫn untracked nên không có `git diff`. Tôi đối chiếu với bản đã duyệt ở v2 qua mô tả dòng/nhánh trong review v2 và báo cáo.

Lệnh tự chạy (2026-11-01):
```
npm test -w @nckh/web          (lần 2, lúc 18:37)
 Test Files  7 passed (7)
      Tests  32 passed (32)
npx vitest list                 → 32 test: api 20, forms 4, useCooldown 4, queryClient 1, Toast 1, security 2
npm run build -w @nckh/web
dist/index.html                   0.39 kB │ gzip:   0.27 kB
dist/assets/index-BBkmJBM4.css   10.61 kB │ gzip:   2.98 kB
dist/assets/index-GR0p_oSS.js   343.51 kB │ gzip: 108.38 kB
✓ built in 151ms
grep -rnE "\.(skip|only|todo)\b" apps/web/src apps/web/tests   → không có
```
Kết quả khớp "Bằng chứng chạy lệnh (vòng sửa 2)": 7 file / 32 test, bundle cùng hash `index-GR0p_oSS.js`. Lần chạy đầu của tôi (18:36) ra 8 file / 33 test. Lý do: agent bảo mật đang chạy song song test thăm dò tạm `tests/security/tmp-v3-probe.test.js` (đã nêu trong `T301-bao-mat-v3.md`, sau đó đã xóa). Lần chạy lại cho đúng 7/32, nên không tính là lệch. Lint thuộc T202, không xét.

Danh sách test so với v2: v2 có 30 test, vòng này thêm `logout-guest-refresh.test.js` của bao-mat và một test trong `api.test.js` ("refresh gọi trong lúc /auth/logout đang bay"), thành 32. Tất cả 19 test api của v2 vẫn còn, tên không đổi, không thấy assertion nào bị nới lỏng. Test "logout: … không toast hết hạn" (so số toast trước và sau) giữ nguyên; frontend-dev chủ động không đổi test này ở INFO #2, cách làm này đúng quy tắc 1.

## Đối chiếu đặc tả
| Điều kiện đạt | Đạt? | Ghi chú |
|---|---|---|
| bao-mat v2 #1(a): 401 của request không kèm token thì không refresh | Đạt | `api.js:166` dùng `fresh \|\| (sentToken && await refreshSession())`. `expireSession` cũng chỉ chạy khi có `sentToken` (`:168`). Có test `logout-guest-refresh.test.js` (giữ nguyên bản bao-mat viết) và test này xanh. |
| bao-mat v2 #1(b): `refreshSession` chờ `serverLogout` | Đạt | `api.js:111–114` lấy `gen` trước, rồi `await serverLogout`. Test `api.test.js:245` kiểm thứ tự `['/api/auth/logout', '/api/auth/refresh']`, refresh trả `false` và token null. Báo cáo ghi test này đỏ khi bỏ dòng chờ. |
| NFR01: token chỉ trong bộ nhớ, `/api` tương đối | Đạt | Không đổi so với v2. |
| NFR07: lỗi tiếng Việt, xử lý 401/403/429/503 thống nhất | Đạt | Bảng `FALLBACK_MESSAGES` không đổi. |

## Soát hồi quy của bản sửa
- **m1 `sessionExpired`**: Khi request có token và refresh thất bại, `expireSession()` tăng thế hệ, sau đó `:173` ném `sessionEndedError()`, giống hành vi đã duyệt ở v2. Test `api.test.js:70` (một toast, cờ `sessionExpired`) vẫn xanh.
- **ACCOUNT_LOCKED**: nhánh `:177–180` không đổi và test `:191` xanh.
- **Toast có nút hành động** (`toast.js`, `Toast.jsx`): file không đổi, `Toast.test.jsx` xanh.
- **Retry của query**: `queryClient.js` không đổi. Sau logout, mỗi lần retry là một `api()` mới không có token, nên không refresh và chỉ ném 401 bình thường.
- **Không deadlock**: `refreshSession` đọc `serverLogout` một cách đồng bộ ngay lúc bắt đầu (trước `await` đầu tiên), nên chỉ có thể chờ một logout đã có *trước* nó. `logout` chỉ chờ refresh đã có *trước* nó (`pendingRefresh`). Hai việc vì vậy không bao giờ chờ lẫn nhau. Refresh gọi chồng thì dùng chung `refreshPromise`. Cả `serverLogout` lẫn chuỗi phía trước đều có `.catch(() => {})`, nên `login`/`refreshSession` không bị kẹt vì bị reject. Thời gian chờ chỉ phụ thuộc mạng (cùng đánh đổi INFO i1 ở v2).
- **Vòng lặp**: không có. Request gửi lại vẫn nhận 401 thì chỉ ném lỗi.

## Đánh giá rủi ro "request không kèm token nhận 401 không tự refresh"
- **Khởi động**: không ảnh hưởng. `bootstrapSession()` gọi thẳng `refreshSession()` (`main.jsx:23`), không qua nhánh 401 của `api()`. `App` chỉ render `RouterProvider` khi `status !== 'loading'` (`main.jsx:27–29`), nên không có query nào chạy trước khi khởi động xong. Nút thử lại ở màn offline cũng đi qua `bootstrapSession({ retry: true })`.
- **Khách (chưa đăng nhập) gọi API cần quyền**: ở v2, client vẫn gọi refresh, nhận 401, rồi `expireSession` không làm gì vì user null, cuối cùng ném 401. Giờ client bỏ qua bước refresh và ném 401 luôn. Kết quả cho màn hình như nhau, ít hơn một request, và không có toast "hết hạn".
- **Request khách bắt đầu trước khi đăng nhập xong, 401 về sau khi đã có token**: nhánh `fresh` gửi lại bằng token mới. Hợp lệ, vì đây là phiên của chính người vừa đăng nhập.
- **Route hiện tại**: `router.jsx` chưa có `loader` nào, nên không có đường gọi `api()` trước khi khởi động xong. Rủi ro còn lại nằm ở tương lai (xem i1).

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| i1 | INFO | `apps/web/src/router.jsx:21` (`createBrowserRouter`) | Data router chạy `loader` ngay khi khởi tạo router ở lúc import module, tức là *trước* khi `bootstrapSession` xong và trước khi `RouterProvider` được mount. Nếu T303 thêm loader/guard có gọi `api()`, request đó sẽ không có token. Khi 401 về trong lúc bootstrap còn chạy, nhánh `fresh` không bắt được, nên ném 401 mà không refresh, trong khi ở v2 nó còn được cứu vì dùng chung promise refresh. Hiện chưa có loader nên chưa phải lỗi. | T303: loader cần quyền phải `await bootstrapSession()` trước khi gọi `api()`, hoặc chỉ lấy dữ liệu trong component (đã chặn ở `App`). Nên ghi một dòng vào `design/UI.md` §1.1 hoặc báo cáo T303. |
| i2 | INFO | `apps/web/src/lib/api.js:212–217` | Logout lỗi mạng thì cookie phía server chưa bị thu hồi. Một lần `bootstrapSession({ retry: true })` hoặc tải lại trang sau đó vẫn khôi phục được phiên. Đây là giới hạn vốn có của "xóa client kể cả khi lỗi mạng" (UI §1.1), không do bản sửa này gây ra. | Không chặn. |
| i3 | INFO | – | INFO #2/#3 của bao-mat v2 (toast còn ≤ 5 giây, tab khác giữ token ≤ 15 phút) chưa sửa, có lý do ghi trong báo cáo. Tôi đồng ý giữ test hiện có và chuyển phần đồng bộ nhiều tab sang T303 (`BroadcastChannel`). | Không chặn. |

Không phát hiện test bị xóa, bỏ qua hay viết lỏng đi. Vòng này không thêm hay đổi dependency.

Kết luận: APPROVED – 0 BLOCKER, 0 MAJOR, 0 MINOR, 3 INFO.
