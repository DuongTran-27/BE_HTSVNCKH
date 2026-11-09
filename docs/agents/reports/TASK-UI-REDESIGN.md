# TASK-UI-REDESIGN – Làm mới giao diện (2026-11-09)

Yêu cầu trực tiếp của chủ dự án: dùng skill/thư viện giao diện hiện đại để giao diện đẹp hơn, phù hợp chức năng từng trang.

## Đề xuất thư viện (chờ `kien-truc-su` duyệt hậu kiểm – chủ dự án đã yêu cầu cài)
- `lucide-react` 1.70.0 – bộ icon chuẩn của shadcn/ui, tree-shake theo icon.
- `@fontsource-variable/inter` 5.3.0 – font Inter tự host (có bộ tiếng Việt). Tự host vì CSP `font-src 'self'` trong `vercel.json`.
- Không chạy `shadcn init`: sẽ thêm Radix/cva/tailwind-merge và thay hộp thoại đã có test a11y (`useDialogA11y`). Áp dụng ngôn ngữ thiết kế shadcn (token, bo góc, viền mảnh, một màu nhấn) trên Tailwind sẵn có.

## Thay đổi
- `index.css`: theme Tailwind v4 – remap `blue-*` sang indigo, viền `slate-300` nhạt hơn, font Inter, style nền cho bảng/focus.
- `Layout.jsx`: sidebar có icon (desktop), thanh menu cuộn ngang (mobile), header có avatar chữ tắt, chuông, đổi mật khẩu, đăng xuất. Nhãn/nav `Menu chính` giữ nguyên.
- `ui.jsx`: nút có hover/focus, Badge dạng pill, trạng thái tải (spinner), lỗi (icon), rỗng (empty state), hộp thoại có blur, Pager có icon.
- `LoginPage.jsx`: bố cục hai cột với panel giới thiệu hệ thống NCKH; `FullPageLoading`, `Toast`, `NotificationBell` làm lại.
- Các trang: thay chuỗi class lặp lại (thẻ, khung form, hộp thông báo, liên kết, tiêu đề h1/h2) bằng kiểu mới.
- Không đổi logic, văn bản, quyền. Chỉ thay class/icon (`aria-hidden`), nên không thêm test mới.

## Bằng chứng
- `npm run lint` → 0 lỗi, 0 cảnh báo.
- `npm test -w @nckh/web` → 28 file, 230/230 test đạt.
- `npm run build -w @nckh/web` → build xong (cảnh báo chunk > 500 kB).
- Ảnh chụp với API giả lập (Playwright, 1366px và 360px): đăng nhập, danh sách đề tài – hiển thị đúng.
- **Chưa chạy** `npm run test:e2e`: Docker Desktop không chạy (`dockerDesktopLinuxEngine` không tìm thấy) nên không có DB test.
