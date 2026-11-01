# Review T301 – reviewer – vòng 2
Kết luận: APPROVED

## Tôi đã tự kiểm tra
File đã đọc: `reports/T301.md` (cả mục "Vòng sửa 1"), `reviews/T301-reviewer-v1.md`, `apps/web/src/lib/{api,queryClient,toast}.js`, `apps/web/src/components/Toast.jsx`, `apps/web/src/main.jsx`, `apps/web/src/router.jsx`, toàn bộ test: `src/lib/api.test.js`, `src/lib/queryClient.test.js`, `src/components/Toast.test.jsx`, `tests/security/logout-race.test.js`.

Lệnh tự chạy (2026-11-01):
```
npm test -w @nckh/web
 RUN  v4.1.12 D:/Website_HTWLHD_SV_NCKH_demo3/apps/web
 Test Files  6 passed (6)
      Tests  30 passed (30)
npm run build -w @nckh/web
✓ 147 modules transformed.
dist/index.html                   0.39 kB │ gzip:   0.27 kB
dist/assets/index-BBkmJBM4.css   10.61 kB │ gzip:   2.98 kB
dist/assets/index-ngaTo6ei.js   343.50 kB │ gzip: 108.39 kB
✓ built in 158ms
grep -rnE "\.(skip|only|todo)\b" apps/web/src apps/web/tests      → không có
grep -rnE "localStorage|sessionStorage|document\.cookie|https?://" apps/web/src (bỏ test) → không có
```
Kết quả khớp "Bằng chứng chạy lệnh (vòng sửa 1)" của báo cáo: cùng 6 file / 30 test, cùng hash và kích thước bundle. `npm run lint` hỏng vì chưa có ESLint (T202). Ghi nhận ở đây, không tính là lỗi của T301. Phần script DB test (devops đang sửa) không thuộc phạm vi review này.

Số test tăng từ 23 lên 30: api 15→19, thêm `queryClient.test.js` (1), `Toast.test.jsx` (1), `tests/security/logout-race.test.js` (1). Các test của vòng 1 vẫn còn đủ và không bị viết lỏng đi. Test "logout xóa auth + cache kể cả lỗi mạng" vẫn giữ nguyên.

## Xác nhận MINOR vòng 1
| # | Đã sửa? | Bằng chứng |
|---|---|---|
| m1 – hai toast khi hết phiên | Đúng | `api.js:135` `sessionEndedError()` gắn `sessionExpired: true`. Nhánh refresh thất bại (`api.js:155–162`) ném lỗi có cờ này; nhánh `ACCOUNT_LOCKED` (`api.js:167–170`) gắn cờ lên lỗi của server, giữ nguyên message để màn R1 hiển thị được. JSDoc `api()` (`api.js:146–150`) đã ghi rõ quy ước. Test `api.test.js:78` kiểm mọi lỗi đều có cờ, và `:83` kiểm chỉ có đúng 1 toast. |
| m2 – thiếu test `shouldRetryQuery`, `ACCOUNT_LOCKED` | Đúng | `queryClient.test.js` kiểm đủ các biên: (0,0)/(1,503) → true; (2,0)/(0,500)/(0,401)/(0,404) → false. `api.test.js:191–202`: ở `/topics` thì user bị xóa, `onExpired` gọi 1 lần, lỗi có cờ; ở `/auth/login` thì `onExpired` không được gọi và lỗi không có cờ. |
| m3 – Toast thiếu nút hành động | Đúng | `toast.js:13` nhận `action: { label, onClick }`. `Toast.jsx:22–25` hiện nút `min-h-11` (44 px); bấm thì đóng toast trước rồi mới gọi `onClick`. `Toast.test.jsx` kiểm qua `getByRole('button', { name: 'Thử lại' })`: `onClick` được gọi 1 lần và toast biến mất khỏi DOM lẫn store. |
| i1 – logout khi refresh đang chạy | Đúng (cùng gốc với bao-mat #1) | Có `generation` (`api.js:93`), `doRefresh` không gọi `setSession` khi thế hệ đã đổi (`:101`), `api()` bỏ kết quả về muộn (`:164`), `logout` gửi `/auth/logout` sau khi refresh kết thúc, `login` chờ logout chạy xong. Các test `api.test.js:218–258` và `tests/security/logout-race.test.js` kiểm thứ tự request và kiểm phiên mới không bị ghi đè. |

## Soát hồi quy của bản sửa
- Không gây vòng lặp: request gửi lại sau refresh mà vẫn 401 thì vẫn chỉ ném lỗi. Khi thế hệ đổi, `api()` dừng ngay và không gửi lại request.
- Tất cả nhánh còn lại của vòng 1 vẫn còn test và vẫn xanh: StrictMode/`bootstrapSession` gọi đôi, nhiều 401 đồng thời, token đã mới, refresh mất mạng không đăng xuất, FormData, đường dẫn tương đối.
- `logout` gọi thẳng `send()` nên bỏ qua refresh/`expireSession`. Không còn toast "hết hạn" và không còn giữ `next` (test `:204–216`). Dùng `keepalive: true` vì request này không có body, hợp lý.
- `queryClient.cancelQueries()` trước `clear()`: TanStack tự nuốt lỗi hủy, không sinh promise bị từ chối mà không ai bắt.
- Văn bản giao diện mới ("Thử lại", "Đóng thông báo") đều là tiếng Việt.
- Không thêm hay đổi dependency.

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| i1 | INFO | `apps/web/src/lib/api.js:186–188` | `login` chờ `serverLogout`. Nếu người dùng đăng xuất đúng lúc một refresh đang chạy trong lúc Render khởi động lạnh, lần đăng nhập ngay sau đó có thể phải đợi lâu (hàng chục giây). Đây là đánh đổi có chủ đích để bảo đảm an toàn phiên. | Không chặn. Ở T302, nút Đăng nhập đã có trạng thái chờ theo UI §6 nên đủ dùng. |
| i2 | INFO | `apps/web/src/lib/toast.js:14` | Toast có nút hành động vẫn tự ẩn sau 5 s mặc định. Với 503 "Thử lại", người dùng có thể không kịp bấm. | Khi màn gọi toast 503 có thể truyền `duration: 0` hoặc tăng thời gian hiển thị. Đây là quyết định của T303, không cần sửa ở T301. |
| i3 | INFO | `package.json` (gốc) | `npm run lint` chưa chạy được (T202). | Không cần frontend-dev làm gì. |

Không phát hiện test bị xóa, bỏ qua (`.skip`/`.only`) hay viết lỏng đi.

Kết luận: APPROVED – 0 BLOCKER, 0 MAJOR, 0 MINOR, 3 INFO.
