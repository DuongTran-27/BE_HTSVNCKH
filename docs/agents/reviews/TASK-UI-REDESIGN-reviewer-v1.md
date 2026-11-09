# Review TASK-UI-REDESIGN – reviewer – vòng 1

Phạm vi: `git diff e83d98e..f583e4e -- apps/web` (3 commit 8b6dd29, ab78b9b, f583e4e).

## Kết luận: APPROVED

Không có BLOCKER/MAJOR. Không thấy thay đổi logic, văn bản nghiệp vụ, phân quyền hay luồng API.

## Lệnh tự chạy
- `npm run lint` – xanh (eslint --max-warnings 0, không lỗi).
- `npm test -w @nckh/web` – 28 file, 230 test pass.
- `npm run build -w @nckh/web` – build OK (chỉ cảnh báo chunk > 500 kB, không phải lỗi).
- E2E: CHƯA chạy được, Docker Desktop không chạy (không kết nối được pipe dockerDesktopLinuxEngine). Không coi là lỗi của task; nên chạy `npm run test:e2e -w @nckh/web` khi có Docker, vì selector theo nhãn/role có thể bị ảnh hưởng bởi layout mới.

## Đối chiếu từng mục
1. Hành vi: Layout.jsx giữ guard `mustChangePassword` (Navigate + menu rỗng), nav `aria-label="Menu chính"`, "Đổi mật khẩu"/"Đăng xuất" vẫn có tên truy cập (sr-only trên màn hình nhỏ). Thông tin người dùng chuyển từ một chuỗi "Tên (Vai trò)" thành hai span: văn bản đổi nhưng không chức năng nào phụ thuộc (230 test xanh). TopicDetailPage: mọi link (Quản lý nhóm, Lần gửi gần nhất, Lịch sử có `canHistory`, Yêu cầu thay đổi, Sửa hồ sơ có `permissions.edit`), các Notice điều kiện, `showReason`, ResultSection, kết quả hiện hành vẫn còn. ReviewPage, UserDetailPage (khóa/mở khóa ẩn khi `isSelf`, TempPasswordBox, phạm vi khoa chỉ Admin+STAFF), StatsPage (bộ lọc, Xóa bộ lọc khi `u.any`, CSV, chuyển kiểu biểu đồ `aria-pressed`) giữ đủ điều kiện.
2. Truy cập: nút/link mới dùng `min-h-11`, icon đều `aria-hidden`, nút chỉ icon có sr-only, role/aria-label giữ nguyên. Tương phản: chữ thường slate-600+ trên nền trắng; slate-400 chỉ dùng cho icon trang trí.
3. StatsChart: `forPie` chỉ áp dụng cho dữ liệu biểu đồ tròn (>8 nhóm gộp "Khác", tổng không đổi); bảng và `aria-label` của biểu đồ vẫn dùng `rows` gốc, nên bảng/CSV đủ dòng và cùng tổng (FR14).
4. CSP: `font-src 'self'`, `style-src 'self'`. Build ra các file `.woff2` riêng trong `/assets/`, không có `data:font` trong CSS, không `@import` URL ngoài → tương thích.

## Phát hiện
- MINOR – `apps/web/src/pages/topics/TopicDetailPage.jsx:124`: link "Quản lý nhóm" không có `min-h-11` (vùng chạm < 44px). Bản cũ cũng không có, nhưng cùng khối đã sửa các link khác; nên dùng class `link` ở dòng 129–132.
- MINOR – `apps/web/src/components/StatsChart.jsx:~35`: `Legend` dùng `wrapperStyle`/`style` inline (màu chữ). React gán qua CSSOM nên không bị CSP `style-src 'self'` chặn, nhưng nếu sau này siết `style-src-attr` thì cần kiểm lại trên bản deploy (recharts vốn đã dùng style inline).
- MINOR – `apps/web/src/pages/stats/StatsPage.jsx:19` và `TopicDetailPage.jsx` định nghĩa lại hằng `card` trùng với `card` đã export ở `ui.jsx`; nên import để tránh lệch.
- MINOR – hàm `initials` trùng ở `Layout.jsx` và `UserDetailPage.jsx` (viết lại inline); nên gom.
- Ghi nhận rủi ro kỹ thuật (không chặn): bundle chính 550 kB (cảnh báo Vite), lucide-react import theo tên nên tree-shake được.
