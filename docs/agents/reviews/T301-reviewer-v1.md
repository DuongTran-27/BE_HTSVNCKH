# Review T301 – reviewer – vòng 1
Kết luận: APPROVED

## Tôi đã tự kiểm tra
File đã đọc: dòng T301 trong `BANG_CONG_VIEC.md`, `reports/T301.md`, `reviews/T301-kien-truc-su-v1.md`, toàn bộ `apps/web` (package.json, vite.config.js, index.html, `src/**`), `design/UI.md` §1.1, §1.2, §6, §7, §9.1, §9.2, `design/API_GD2.md` §1–§2, `apps/api/src/modules/auth/{routes,service}.js`, `apps/api/src/middlewares/auth.js`, `apps/api/src/config/env.js` (PORT mặc định 4000), diff `package.json`/`package-lock.json`.

Lệnh tự chạy (2026-11-01):
```
npm test                       → EXIT=0
  @nckh/shared  Test Files 2 passed (2)  Tests 21 passed (21)
  @nckh/api     Test Files 9 passed (9)  Tests 87 passed (87)
  @nckh/web     Test Files 3 passed (3)  Tests 23 passed (23)
npm run build -w @nckh/web     → EXIT=0
  dist/index.html                   0.39 kB │ gzip:   0.27 kB
  dist/assets/index-CpS53h2s.css   10.34 kB │ gzip:   2.92 kB
  dist/assets/index-DGL-bvD0.js   343.82 kB │ gzip: 108.52 kB
  ✓ built in 155ms
npm audit                      → found 0 vulnerabilities
npm audit --omit=dev           → found 0 vulnerabilities
npm ls vite                    → chỉ vite@8.3.4 (deduped cho vitest, plugin-react, @tailwindcss/vite)
npm ls zod                     → chỉ zod@4.6.7
npm run lint                   → 'eslint' is not recognized … (chưa có ESLint – thuộc T202, đang TODO; khớp báo cáo)
npm view <gói> time            → vite 8.3.4 2026-10-08, 8.3.5 2026-10-21; plugin-react 6.1.2 2026-10-05; react 19.3.1 2026-10-14;
                                 react-router 8.4.0 2026-09-15; react-query 5.104.4 2026-10-17; @hookform/resolvers 5.9.2 2026-10-17;
                                 react-hook-form 7.90.0 2026-10-11; jsdom 29.1.1 2026-04-30; @testing-library/react 16.3.3 2026-08-27
```
Kết quả tự chạy khớp "Bằng chứng chạy lệnh" của báo cáo (số test, kích thước bundle, audit, lint hỏng do T202).

Diff gốc: thay đổi `package.json` gốc (`db:test:*`), `.gitignore`, `README.md` là của T217, không thuộc T301. `package-lock.json`: vite 8.3.5 → 8.3.4 đúng như quyết định 1.

## Đối chiếu đặc tả
| Điều kiện đạt (dòng T301 / UI §1.1, §6, §7, §9.1) | Đạt? | Ghi chú |
|---|---|---|
| Vite + `@vitejs/plugin-react` tương thích vite 8 | Đạt | plugin-react 6.1.2 peer `vite ^8`, build xanh |
| Data router `createBrowserRouter` + `RouterProvider` | Đạt | `router.jsx:22`, `main.jsx:29` |
| Tailwind, TanStack Query | Đạt | `@tailwindcss/vite`, `index.css`; `queryClient.js` |
| Proxy `/api` khi dev | Đạt | `vite.config.js:8` → `localhost:4000` (khớp `env.PORT` mặc định) |
| Chỉ đường dẫn tương đối `/api`, cùng origin, không biến môi trường URL | Đạt | `api.js:71,83`; chặn `//` và đường dẫn không bắt đầu `/`; test "chỉ gọi đường dẫn tương đối" |
| Access token chỉ trong bộ nhớ (NFR01), module auth có `subscribe` | Đạt | `auth.js`; không có `localStorage`; không có khóa `['me']` |
| Refresh tuần tự: promise cấp module + `navigator.locks` | Đạt | `api.js:92–115`; test 401 đồng thời (1 refresh), test locks, test gọi chồng |
| Đúng cả khi StrictMode | Đạt | `bootstrapSession()` gọi cấp module + chốt `bootPromise` (`main.jsx:23`, `api.js:161–171`); mount/unmount đôi của StrictMode không chạm tới refresh; test gọi đôi chỉ 1 request |
| Không refresh với `/auth/login`, `/auth/refresh` | Đạt | `NO_REFRESH`; test login 401 |
| Refresh thất bại → xóa auth + `queryClient.clear()` + toast + `/dang-nhap?next=` (một lần) | Đạt | `expireSession` có chốt; test kiểm `clear` 1 lần, cache rỗng, 1 toast, `onExpired` 1 lần |
| Logout xóa cache kể cả lỗi mạng | Đạt | test logout |
| FormData không đặt `Content-Type` | Đạt | test FormData |
| 403 `PASSWORD_CHANGE_REQUIRED` → `mustChangePassword = true` | Đạt | `api.js:153`, `auth.js:24`; test |
| Chuẩn hóa lỗi `{status, code, message, details, retryAfter, requestId}` + thông điệp dự phòng tiếng Việt | Đạt | `ApiError`, `toApiError`, `parseRetryAfter`; test 429/500/502/204, Retry-After giây và ngày HTTP, mất mạng |
| QueryClient: GET thử lại ≤ 2 lần chỉ mạng/503, mutation không thử lại (UI §6) | Đạt (thiếu test) | `queryClient.js` đúng ngữ nghĩa `failureCount` của TanStack; xem m2 |
| `applyServerErrors` | Đạt | 4 test: đường dẫn chấm, không nhầm tiền tố, focus ô đầu theo thứ tự form, `_`/khóa lạ → cấp form, mã không phải map trường |
| `useCooldown` | Đạt | 4 test với fake timers, gồm khóa lại lần 2 cùng số giây |
| `Toast`, `FormField`, màn tải toàn trang | Đạt | nhãn `htmlFor`, `aria-invalid`, `aria-describedby`, ô ≥ 16 px, vùng chạm 44 px, `break-words`; > 5 s hiện "Máy chủ đang khởi động…" |
| Cài `@hookform/resolvers` (kèm RHF + Zod) | Đạt | zod một bản 4.6.7 |
| Không làm sẵn phần T302/T303 | Đạt | Chỉ có placeholder; không có form đăng nhập, guard, layout, kiểm `next` |
| Văn bản giao diện tiếng Việt | Đạt | Mọi chuỗi hiển thị/thông điệp lỗi đều tiếng Việt; `index.html lang="vi"` |

### Đánh giá các quyết định trong báo cáo
1. Hạ vite 8.3.5 → 8.3.4: đồng ý. Đã tự xác minh ngày phát hành và `npm ls vite` một bản; test api vẫn xanh.
2. jsdom 29.1.1: đồng ý (devDependency; kiến trúc sư đã duyệt).
3. Thêm `@testing-library/react`, `@testing-library/dom`, `jsdom`: `kien-truc-su` đã duyệt (`T301-kien-truc-su-v1.md` #3).
4. `useCooldown()` + `start(retryAfter)`: đồng ý. Lý do đúng (tham số giống nhau không chạy lại effect) và có test cho đúng tình huống đó. `design/UI.md` §7 đã được kiến trúc sư sửa (dòng 424), nên code và thiết kế giờ khớp nhau.
5. Refresh lỗi mạng/5xx/429 không đăng xuất, khởi động lỗi mạng → màn "Không kết nối được" + "Thử lại": đồng ý; phù hợp NFR10, UI §1.1 đã cập nhật. Backend chỉ trả 401 cho mọi lỗi refresh (`service.js:47–64`, tài khoản khóa cũng 401), nên nhánh 401/403 → hết phiên bao đủ các trường hợp mất phiên thật.
6. So token đã gửi với token hiện tại để khỏi refresh lần hai: đồng ý; có test, và giảm số lần xoay token (giảm rủi ro thu hồi cả họ phiên).
7–12: hợp lý. Đã soát luồng tài khoản bị khóa giữa phiên: `requireAuth` trả 401 → refresh trả 401 (thu hồi họ phiên) → `expireSession`, nên không lặp vô hạn. Khi request được gửi lại sau refresh mà vẫn 401 thì chỉ ném lỗi, không refresh lần nữa, nên không có vòng lặp.

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| m1 | MINOR | `apps/web/src/lib/api.js:147–155` | Khi refresh thất bại, `expireSession()` đã hiện toast "Phiên đăng nhập đã hết hạn…", sau đó request gốc vẫn ném `ApiError` 401 `UNAUTHORIZED`. Các màn từ T302 trở đi theo UI §7 sẽ hiện toast cho lỗi mutation, nên người dùng sẽ thấy 2 toast, và màn không có cách nào phân biệt lỗi này với 401 ở R1. | Gắn cờ vào lỗi, ví dụ `err.sessionExpired = true` (hoặc dùng code riêng `SESSION_EXPIRED`) khi đã gọi `expireSession`, và ghi chú trong JSDoc của `api()` rằng màn/handler chung phải bỏ qua lỗi có cờ này. Thêm một assertion vào test "refresh thất bại". |
| m2 | MINOR | `apps/web/src/lib/queryClient.js:4`; `apps/web/src/lib/api.js:154` | Hai nhánh logic chưa có test: `shouldRetryQuery` (đúng 2 lần thử lại, chỉ với status 0/503, không thử lại 4xx/500) và quyết định 9 (403 `ACCOUNT_LOCKED` ở request khác `/auth/login` thì đăng xuất, còn ở `/auth/login` thì không). Code hiện đúng, nhưng chưa có test giữ hành vi. | Thêm 2 test ngắn: `shouldRetryQuery(0,{status:0})`, `(1,{status:503})` → true; `(2,{status:0})`, `(0,{status:500})`, `(0,{status:401})` → false. ACCOUNT_LOCKED ở `/topics` → user null + `onExpired` 1 lần; ở `/auth/login` → `onExpired` không được gọi. |
| m3 | MINOR | `apps/web/src/lib/toast.js:13`, `apps/web/src/components/Toast.jsx` | UI §7 yêu cầu 503 `SERVICE_BUSY` là "Toast + nút Thử lại", nhưng `Toast` chưa hỗ trợ nút hành động. Theo UI §9.1, chỉ T301 là chủ của `Toast`, các task sau không được viết bản thứ hai. | Thêm tùy chọn `toast(message, { action: { label, onClick } })` và hiện một nút cao 44 px trong `ToastViewport`. Nếu không làm ở T301 thì ghi rõ trong báo cáo rằng T303 (task đầu tiên có lỗi GET/mutation thật) được phép mở rộng `Toast`. |
| i1 | INFO | `apps/web/src/lib/api.js:177–186` | Có một cuộc đua hiếm: bấm Đăng xuất khi một refresh đang chạy. Nếu refresh xong sau `clearClientSession()` thì `setSession` sẽ ghi lại user vào module auth. | Không chặn T301. Nếu muốn chặn thì trong `logout` chờ `refreshPromise` (nếu có) trước khi gọi `/auth/logout`. |
| i2 | INFO | `package.json` (gốc) | `npm run lint` hỏng vì chưa có ESLint. Đây là T202 (TODO), không phải lỗi T301. Node ≥ 22.22 do react-router 8.4 đòi hỏi đã được giao cho T202/T706. | Không cần frontend-dev làm gì. |

Không phát hiện test bị xóa, bỏ qua (`.skip`/`.only`) hay viết lỏng đi. Các test đều kiểm hành vi quan sát được (số lần gọi refresh, header, cache, toast, điều hướng), không chỉ kiểm việc hàm có được gọi.

Kết luận: APPROVED – 0 BLOCKER, 0 MAJOR, 3 MINOR, 2 INFO.
