# Review T301 – bao-mat – vòng 1
Kết luận: CHANGES_REQUESTED

## Tôi đã tự kiểm tra
File đã đọc: `docs/agents/BANG_CONG_VIEC.md` (dòng T301), `docs/agents/reports/T301.md`, `apps/web/{index.html,vite.config.js,package.json}`, `apps/web/src/{main.jsx,router.jsx}`, `apps/web/src/lib/{api,auth,queryClient,forms,toast}.js`, `apps/web/src/components/Toast.jsx`, `apps/web/src/lib/api.test.js`, `apps/api/src/modules/auth/{routes,service}.js`, `docs/agents/design/UI.md` §1.1–1.2, `docs/agents/design/API_GD2.md` §1.1. Không đọc `.env`.

Tìm mẫu nguy hiểm trong `apps/web/src`, `index.html`:
```
grep -rnE "localStorage|sessionStorage|document\.cookie|console\.|dangerouslySetInnerHTML|https?://|window\.location|innerHTML"
→ chỉ 1 dòng: api.test.js:152 (test từ chối 'https://evil.com')
grep -rnE "onrender|vercel\.app|VITE_|import\.meta\.env|fetch\("
→ chỉ api.js:82  fetch(`/api${path}`, … credentials: 'same-origin')
git check-ignore -v apps/web/.env apps/web/dist → cả hai bị .gitignore bỏ qua
```

Test tấn công tự viết (giữ lại vì phát hiện lỗi): `apps/web/tests/security/logout-race.test.js`
```
npx vitest run tests/security   (trong apps/web)
 × logout khi refresh đang chạy: phiên không được hồi sinh sau logout
AssertionError: expected 'new' to be null
 ❯ tests/security/logout-race.test.js:32:34   expect(auth.get().accessToken).toBeNull();
 Test Files  1 failed (1)
```

`npm test` (gốc) – đỏ chỉ do test bảo mật trên:
```
> @nckh/shared   Test Files 2 passed (2)   Tests 21 passed (21)
> @nckh/api      Test Files 9 passed (9)   Tests 87 passed (87)
> @nckh/web      × logout khi refresh đang chạy: phiên không được hồi sinh sau logout
                 Test Files 1 failed | 3 passed (4)   Tests 1 failed | 23 passed (24)
EXIT=1
```
`npm audit` và `npm audit --omit=dev`:
```
found 0 vulnerabilities
found 0 vulnerabilities
```
`npm ls vite jsdom @testing-library/react @testing-library/dom`: một bản `vite@8.3.4` (deduped cho cả vitest của api), `jsdom@29.1.1`, `@testing-library/react@16.3.3`, `@testing-library/dom@10.4.2` – tất cả chỉ ở devDependencies, không vào bundle.

## Đối chiếu đặc tả
| Điều kiện đạt | Đạt? | Ghi chú |
|---|---|---|
| Access token chỉ trong bộ nhớ (NFR01, UI §1.1) | Đạt | Biến module trong `auth.js`; không có `localStorage`/`sessionStorage`/`document.cookie`. |
| Refresh cookie httpOnly, Secure (prod), SameSite=Lax, path `/api/auth` | Đạt | `apps/api/src/modules/auth/routes.js:11-17`; JS không chạm cookie. |
| Chỉ gọi `/api` tương đối, cùng origin, không gọi domain Render | Đạt | URL luôn là `` `/api${path}` `` nên kể cả `//host`, `\\host`, `https://…` cũng không thể ra ngoài origin; thêm chặn đầu vào không bắt đầu bằng `/` hoặc bắt đầu `//`. `credentials: 'same-origin'`. Không có biến môi trường URL API. |
| `next` không mở open redirect | Đạt (phần T301) | T301 chỉ **tạo** `next` từ `router.state.location` (`pathname + search`, `encodeURIComponent`) và điều hướng bằng `router.navigate` (không `window.location`). Hàm **đọc/kiểm** `next` thuộc T302 (UI §1.2: chặn `//`, `\`) – bảo mật sẽ soát ở T302. |
| Logout / refresh lỗi xóa sạch cache và trạng thái | **Không đạt** | Đúng ở đường thường (`clearClientSession` = `auth.clear()` + `queryClient.clear()`, lỗi mạng khi logout vẫn xóa). Sai khi logout xảy ra lúc refresh đang chạy: phiên hồi sinh sau logout – vấn đề #1. |
| Không log token/mật khẩu | Đạt | Không có `console.*`; toast chỉ hiện `message` từ server/thông điệp cố định; `ApiError` không mang header/body request. |
| 403 `PASSWORD_CHANGE_REQUIRED` → `mustChangePassword = true` | Đạt | `api.js` + `auth.requirePasswordChange()`; có test. Chặn điều hướng thuộc T303 (guard), phía server vẫn chặn (FR25). |
| 403 `ACCOUNT_LOCKED` ngoài login → đăng xuất | Đạt | `expireSession(err.message)`. |
| Proxy dev không mở ra mạng ngoài | Đạt | `server.proxy` chỉ tới `http://localhost:4000`; không đặt `server.host`, Vite mặc định chỉ nghe `localhost`. Không có `changeOrigin`/`secure:false` thừa. |
| Dependency mới không có lỗ hổng | Đạt | `npm audit` 0 lỗ hổng; testing-library/jsdom chỉ devDependencies (vẫn chờ `kien-truc-su` duyệt theo CLAUDE.md). |
| Refresh tuần tự hóa (tránh tự thu hồi họ phiên) | Đạt | Promise cấp module + `navigator.locks`; `/auth/login`, `/auth/refresh` không kích hoạt refresh. |

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| 1 | MAJOR | `apps/web/src/lib/api.js` `logout` (cuối file) + `doRefresh` (`auth.setSession(await res.json())`) | **Phiên hồi sinh sau khi đăng xuất.** Khi một request đang chờ refresh (vd. Render ngủ, refresh mất hàng chục giây) mà người dùng bấm "Đăng xuất": `logout` gửi `POST /auth/logout` ngay (route này không cần access token nên trả 204), xóa client; sau đó refresh trả về → `auth.setSession` ghi lại token + user, request gốc gửi lại với token mới và đổ dữ liệu vào cache. Phía server còn tệ hơn: hai request mang **cùng cookie cũ**; nếu refresh được xử lý trước thì bản ghi cũ đã `revokedAt` → `authService.logout` không thu hồi gì (`if (record && !record.revokedAt)`), họ phiên mới vẫn sống, và nếu phản hồi refresh về sau phản hồi logout thì trình duyệt giữ cookie `nckh_rt` mới → tải lại trang vẫn đăng nhập. Trên máy dùng chung (phòng máy), người sau tiếp quản phiên người trước. Chứng minh: `apps/web/tests/security/logout-race.test.js` (đỏ). | (a) Trong `logout`: chờ refresh đang chạy xong trước khi gọi logout (`await refreshPromise?.catch(() => {})`) để request logout mang cookie mới nhất → server thu hồi đúng họ phiên. (b) Thêm "thế hệ phiên" (số đếm tăng ở `clearClientSession`): `doRefresh`/`api` bỏ kết quả nếu thế hệ đã đổi trong lúc chờ (không `setSession`, không gửi lại request, ném lỗi). (c) `queryClient.cancelQueries()` trước `queryClient.clear()`. Test trên phải xanh, không sửa test. |
| 2 | MINOR | `apps/api/src/modules/auth/service.js:67-71` (ngoài phạm vi T301 – chuyển backend) | `logout` với refresh token **đã xoay vòng** (revokedAt có, `replacedBy` có) không thu hồi họ phiên. Đây là nửa phía server của #1; client sửa theo #1(a) thì giảm mạnh cửa sổ, nhưng server nên tự an toàn. | Mở task backend: logout với token thuộc họ còn hiệu lực thì thu hồi cả họ bất kể bản ghi đó đã xoay vòng (vẫn trả 204, không lộ thông tin). Không chặn T301. |
| 3 | MINOR | `apps/web/src/lib/api.js` `logout` | Access token hết hạn khi bấm Đăng xuất mà refresh thất bại → `expireSession` hiện toast "Phiên đăng nhập đã hết hạn…" và điều hướng `/dang-nhap?next=…` ngay trước `onLogout`. Không lộ dữ liệu nhưng `next` của người vừa đăng xuất được giữ trên URL cho người kế tiếp (máy dùng chung). | Gọi logout bằng `send()` trực tiếp (không qua nhánh refresh/expire) – `/auth/logout` chỉ cần cookie; hoặc thêm `/auth/logout` vào `NO_REFRESH`. |
| 4 | INFO | `apps/web/index.html` | Chưa có CSP/header bảo mật cho trang tĩnh. Ứng dụng giữ token trong bộ nhớ nên XSS là rủi ro chính. | Thêm ở `vercel.json` (T706): `Content-Security-Policy` (`default-src 'self'`, `connect-src 'self'`, `img-src 'self' res.cloudinary.com`, `frame-ancestors 'none'`), `X-Content-Type-Options`, `Referrer-Policy`. Không chặn T301. |
| 5 | INFO | `apps/web/src/lib/api.js` `send` | Chặn `//` đầu vào là thừa (đã luôn có tiền tố `/api`) nhưng vô hại; đường dẫn chứa `..` (vd. `/../x`) vẫn ở cùng origin, chỉ gửi kèm `Authorization` tới trang tĩnh của chính site. | Không cần làm gì; path do code tự dựng, không lấy từ người dùng. Nếu sau này ghép id từ URL thì dùng `encodeURIComponent`. |

Ghi chú: test bảo mật `apps/web/tests/security/logout-race.test.js` được giữ lại theo quy trình bảo mật (lỗ hổng đã chứng minh) nên `npm test` gốc đỏ cho đến khi #1 được sửa. Không được xóa/skip test này để cho qua (CLAUDE.md quy tắc 1).

Kết luận: CHANGES_REQUESTED – BLOCKER 0, MAJOR 1, MINOR 2, INFO 2.
