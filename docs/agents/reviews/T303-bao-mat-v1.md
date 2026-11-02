# Review T303 – bao-mat – vòng 1
Kết luận: APPROVED

## Tôi đã tự kiểm tra
- Đọc: `reports/T303.md`, FR25, UI §1.2, §2, §3; `routes.jsx`, `router.jsx`, `main.jsx`, `components/Layout.jsx`, `lib/nav.js`, diff của `lib/api.js`, `lib/toast.js`, `lib/queryClient.js`, `lib/api.test.js`; `tests/guards.test.jsx`.
- `npm test -w @nckh/web`: `Test Files 10 passed (10)`, `Tests 75 passed (75)`.
- `npm run lint`: `eslint .` sạch.
- `npm run build -w @nckh/web`: đạt, `index-CLdISf1X.js 488.40 kB (gzip 152.84 kB)`. Báo cáo ghi 478.22 kB với hash khác. Chênh lệch có thể do cây làm việc thay đổi song song (T206); build vẫn đạt.
- `tests/security/` không bị sửa.

## Đối chiếu đặc tả
| Điều kiện đạt | Đạt? | Ghi chú |
|---|---|---|
| Khách vào mọi route khác → `/dang-nhap?next=…` | Đạt | `authLoader`; `next` vẫn qua `safeNext` ở R1 |
| `mustChangePassword` → mọi route trừ `/doi-mat-khau` về R2, ẩn menu, chỉ còn "Đăng xuất" | Đạt | Kiểm cả ở loader lẫn `Layout`, nên cờ bật giữa phiên (403 `PASSWORD_CHANGE_REQUIRED`) cũng được xử lý |
| Bảng route ↔ vai trò §3 (R4–R25) | Đạt | Đối chiếu từng dòng `SCREENS`, khớp, kể cả R22 theo `:loai` (`khoa` chỉ ADMIN, `dong-nghia` chỉ STAFF). Route tĩnh `moi` được xếp hạng trên `:id` |
| ADMIN không có menu/route nghiệp vụ; gõ URL → 403 tại chỗ | Đạt | Có test |
| Menu theo vai trò §2 | Đạt | |
| Loader `await bootstrapSession()` trước khi đọc auth | Đạt | Cả `authLoader` và `guestLoader`; có test |
| Toast 503: `duration: 0` + "Thử lại" | Đạt | Bỏ qua lỗi có cờ `sessionExpired` |
| `clearToasts()` khi xóa phiên | Đạt | Đổi test từ so số lượng sang "không có toast chứa 'hết hạn'" là **đúng** theo bao-mat-v3. So số lượng không còn đúng vì `clearToasts` làm số toast giảm. Test không bị làm yếu: test mới "xóa toast của phiên trước" kiểm độ dài bằng 0, chặt hơn test cũ |
| BroadcastChannel báo đăng xuất | Đạt | Xem đánh giá bên dưới |
| Guard chỉ để dẫn đường, backend kiểm quyền (FR25) | Đạt | Không có quyết định quyền nào chỉ nằm ở client |

**Tin BroadcastChannel giả mạo:** kênh chỉ nhận tin từ cùng origin (và cùng phân vùng lưu trữ), nên trang ở origin khác không gửi được vào. Nơi duy nhất gửi được tin giả là script cùng origin, tức là đã có XSS, và khi đó kẻ tấn công vốn đã kiểm soát được mọi thứ. Bên nhận chỉ chấp nhận đúng chuỗi `'logout'`. Tác dụng duy nhất là xóa phiên phía client của chính tab đó: không đặt được token hay user, không gọi server, không phát lại tin. Không có hại.

## Vấn đề
Không có vấn đề chặn.

| # | Mức | File | Mô tả | Đề xuất |
|---|---|---|---|---|
| i1 | INFO | `lib/api.js` (có từ T301) | Kịch bản: máy dùng chung, X còn mở tab A, Y đăng nhập ở tab B. Cookie đổi sang của Y, nên lần refresh kế tiếp ở tab A nhận phiên của Y, trong khi cache query của X vẫn còn. Không thuộc phạm vi T303. | Task sau: phát thêm `'login'` qua kênh (tab nhận xóa phiên/cache), hoặc khi refresh trả `user.id` khác thì `clearClientSession()` |

BLOCKER: 0 · MAJOR: 0 · MINOR: 0 (1 INFO)

Kết luận: APPROVED
