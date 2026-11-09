# TASK-UI-MODERN – Làm mới giao diện theo xu hướng hiện đại

Yêu cầu người dùng (2026-11-09): "sửa lại giao diện của web đẹp hơn … đẹp hiện đại theo xu hướng hiện nay".
Tiếp nối TASK-UI-REDESIGN: giữ phong cách shadcn, bố cục, nhãn, quyền; chỉ đổi lớp trình bày. Không thêm thư viện.

## Thay đổi
- `index.css`: bo góc lớn hơn một bậc (md/lg/xl), bóng nhiều lớp ám màu nhấn, nền có quầng gradient mờ cố định,
  hiệu ứng `animate-fade-up`, tắt chuyển động khi `prefers-reduced-motion`, đầu bảng nhạt hơn, hover dòng ám màu nhấn.
- `ui.jsx`: nút chính/nguy hiểm dạng gradient + nhấn co nhẹ; thẻ/khung bảng viền mảnh, nền trắng mờ, bóng nổi khi hover;
  tiêu đề trang đậm, lớn hơn; trạng thái rỗng có ô biểu tượng gradient; hộp thoại hiện dần.
- `FormField.jsx`: ô nhập bo `rounded-lg`, viền đậm hơn khi hover.
- `Layout.jsx`: sidebar nền kính mờ, mục đang chọn là "viên" trắng có bóng + icon màu nhấn; logo, avatar gradient;
  header kính mờ; nội dung hiện dần khi đổi mục menu (key theo đoạn đường dẫn đầu nên không dựng lại trang khi đổi route con, giữ state tab/form).
- `LoginPage.jsx`: panel trái nền tối với 2 quầng tím/xanh, lưới chấm mờ dần, tiêu đề chữ gradient, tính năng dạng thẻ kính;
  form nằm trong thẻ kính bo `2xl`.
- 29 file trang/thành phần: `border-slate-300 bg-white` của thẻ → `border-slate-200/80 bg-white` cho đồng bộ với `card`.

Không đổi logic, nhãn tiếng Việt, ARIA, vùng chạm ≥ 44 px, ô nhập ≥ 16 px. Thay đổi chỉ là class CSS nên không thêm test mới;
bộ test hiện có vẫn kiểm hành vi các thành phần bị sửa.

## Bằng chứng
```
$ npm run lint
> eslint . --max-warnings 0          (không lỗi, không cảnh báo)

$ npm test -w @nckh/web
 Test Files  28 passed (28)
      Tests  230 passed (230)

$ npm run build -w @nckh/web
✓ built in 611ms                      (cảnh báo chunk > 500 kB đã có từ trước)
```
Ảnh chụp thật (Playwright, 1366×800, DB dev): trang đăng nhập và trang đổi mật khẩu (có khung Layout) hiển thị đúng.

## Chưa làm
- E2E Playwright chưa chạy (cần DB test qua Docker/embedded như phiên trước).
- Chưa chụp các trang có menu đầy đủ (tài khoản mẫu còn mật khẩu gốc đều bắt đổi mật khẩu trước).
