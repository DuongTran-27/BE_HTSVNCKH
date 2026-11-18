# TASK-UI-NAVY – Làm mới giao diện (người dùng yêu cầu 2026-11-18)

Người dùng chọn hướng "thanh bên navy đậm", sau đó yêu cầu làm hết các đề xuất. Áp dụng cho mọi vai trò (một `Layout` chung).

## Thay đổi
| # | Nội dung | File |
|---|---|---|
| 1 | Thanh bên nền navy Văn Lang, mục đang mở vạch vàng; thẻ/khung bảng `rounded-2xl` (commit d031c2b) | `components/Layout.jsx`, `components/ui.jsx` |
| 2 | Trang **Tổng quan** `/tong-quan` (mục đầu menu mọi vai trò): ô số liệu lấy `total` từ API danh sách sẵn có (`pageSize=1`), không thêm API; phạm vi dữ liệu do backend lọc (FR25). Trang chủ sau đăng nhập **không đổi** (vẫn theo vai trò, UI §2) | `pages/DashboardPage.jsx`, `lib/nav.js`, `routes.jsx` |
| 3 | Điện thoại/máy tính bảng (< lg): thanh ngang cuộn thay bằng nút ☰ mở menu trượt (Radix Dialog: khóa focus, Esc, trả focus) | `components/Layout.jsx` |
| 4 | Header: đường dẫn trang (từ `SCREENS`), thông tin người dùng chuyển sang phải; "Xin chào" ở Tổng quan | `components/Layout.jsx` |
| 5 | `QueryBox` đang tải: khung xám nhấp nháy; vẫn giữ `role=status` + chữ "Đang tải…" (ẩn) cho trình đọc màn hình và `settled()` của E2E | `components/ui.jsx` |
| 6 | Chế độ tối: nút ☾/☀ ở header, mặc định theo hệ điều hành, nhớ trong localStorage. Cách làm: đảo các thang màu blue/slate/red/amber/emerald/green trong khối `.dark` (index.css) nên không phải sửa từng trang; `bg-white` → `bg-card`, nền navy cố định → `bg-navy`; biểu đồ Recharts đổi mã màu theo chế độ. Không dùng script inline (CSP) | `index.css`, `lib/theme.js`, `main.jsx`, `StatsChart.jsx`, 10 trang đổi `bg-white`/`bg-blue-700` |
| 7 | Trang đăng nhập: logo ô đỏ như thanh bên (bố cục chia đôi đã có từ trước) | `pages/LoginPage.jsx` |

Ghi chú: đường dẫn trang dùng `span` thay vì `ol/li` vì test `gd6-ui-b` "G5 cờ chưa kiểm tra" tìm `listitem` đầu tiên của danh sách đề tài; không sửa test.

## Test mới
- `src/pages/DashboardPage.test.jsx`: số liệu theo `total`, đích của ô, ADMIN chỉ gọi `/users` và `/repository`, lỗi API hiện "Không tải được".
- `tests/layout-extras.test.js`: `crumbsOf` (tiền tố, `/de-tai/moi` không nhầm `:id`), `resolveTheme`.

## Bằng chứng chạy lệnh
```
npm run lint                     → eslint . --max-warnings 0 (sạch)
npx vitest run (apps/web)        → Tests 244 passed (244)
npm run build -w @nckh/web       → ✓ built
npm run db:test:up && npm run test:e2e -w @nckh/web → 74 passed (4.7m)
```
Kiểm tra bằng mắt (Playwright MCP, dev server): Tổng quan SV, chế độ tối ở danh sách + chi tiết đề tài, đường dẫn "Đề tài › Chi tiết đề tài", menu trượt 360 px tự đóng khi chọn mục; thanh bên ở QT001/CB001/GV001/SV.

## Chưa làm / rủi ro
- Chế độ tối mới kiểm bằng mắt ở trang Tổng quan, danh sách và chi tiết đề tài; các trang khác dựa vào việc đảo thang màu, có thể còn chỗ tương phản kém.
- Fallback Suspense khi tải trang lazy (`routes.jsx`) vẫn là chữ "Đang tải…".

## Đợt 2 – ưu tiên máy tính (người dùng: "dự án này chính là giao diện desktop")
| # | Nội dung | File |
|---|---|---|
| 8 | Tổng quan: danh sách 5 đề tài dưới ô số liệu – SV/GV "cập nhật gần đây" (`sort=updatedAt_desc`), cán bộ "hồ sơ chờ xét duyệt lâu nhất" (`status=UNDER_REVIEW&sort=updatedAt_asc`, dẫn tới `/xet-duyet/:id`); ADMIN không có | `pages/DashboardPage.jsx` |
| 9 | Bảng: từ xl đầu bảng dính dưới header khi cuộn (khung bảng bỏ overflow ở xl), dòng `py-2.5`; vùng nội dung rộng tối đa 100rem thay vì 80rem | `index.css`, `components/ui.jsx`, `Layout.jsx`, 4 trang có `<td>` |
| 10 | Chi tiết đề tài: cột phải dính khi cuộn (lg), quá cao thì cuộn trong cột | `pages/topics/TopicDetailPage.jsx` |

Test thêm: `DashboardPage.test.jsx` – STAFF: danh sách dẫn tới `/xet-duyet/t9`, gọi đúng API.

Bằng chứng: `npm run lint` sạch · web `Tests 245 passed (245)` · build ✓ · `test:e2e` `74 passed (4.7m)`.
Một lần chạy cả bộ web có 6 test khác lỗi (admin, advising, change-requests, execution, gd6-ui-b, review); chạy riêng và chạy lại cả bộ đều đạt → do máy tải nặng (dev server + vitest song song), không do thay đổi này.
Rủi ro: bảng rộng hơn khung ở màn xl sẽ tràn ra ngoài thay vì cuộn ngang (khung không còn overflow ở xl).
