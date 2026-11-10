# TASK-UI-SEAL – Giao diện "Hồ sơ và con dấu"

Yêu cầu người dùng (2026-11-10, qua skill frontend-design): bỏ kiểu giao diện "trông như AI làm" (gradient tím, kính mờ,
thẻ giống nhau có bóng, nhãn viết hoa, Inter). Người dùng đã duyệt hướng: chữ màu mực, nền trắng lạnh, phẳng,
một điểm nhấn đỏ son là con dấu trạng thái, font Be Vietnam Pro.

## Thay đổi
- `index.css`: font Be Vietnam Pro (400/500/600/700); thang `blue-*` đổi thành thang màu mực (`blue-700` = `#1C2B4A`);
  `slate-50` = `#F7F8FA`; thêm `--color-seal` `#B3261E`; bo góc nhỏ hơn; `shadow-sm`/`shadow-md` tắt (phẳng toàn trang,
  hộp thoại và toast giữ `shadow-lg/xl`); bỏ quầng gradient nền; đầu bảng chữ thường, kẻ đậm màu mực; thêm `animate-stamp`.
- `ui.jsx`: nút đặc màu mực/đỏ, không gradient, không co khi nhấn; thẻ phẳng viền rõ; trạng thái rỗng bỏ ô gradient;
  thêm `Stamp` (con dấu viền đôi, nghiêng 4°, hiện một lần).
- `Layout.jsx`: sidebar nền mực chữ trắng, mục đang mở có vạch trắng; header trắng đặc; bỏ logo/avatar gradient;
  bỏ hiệu ứng hiện dần khi đổi trang.
- `TopicDetailPage.jsx`: trạng thái ở đầu trang dùng `Stamp` thay `Badge`; tiêu đề khối chữ thường. Danh sách vẫn dùng `Badge` theo `STATUS_TONE`.
- `LoginPage.jsx`: panel trái nền mực phẳng, bỏ quầng, lưới chấm, chữ gradient, thẻ kính; tính năng là danh sách kẻ dòng.
- `Snapshot.jsx`, `ReviewPage.jsx`: nhãn khối bỏ viết hoa.
- Điều chỉnh so với đề xuất ban đầu: nút chính dùng màu mực thay vì đỏ son, vì `btnDanger` đã là đỏ và đỏ son dành riêng cho con dấu.

## Đề xuất thư viện (chờ `kien-truc-su` duyệt)
Thay `@fontsource-variable/inter` 5.3.0 bằng `@fontsource/be-vietnam-pro` 5.3.0 (ghim chính xác, OFL-1.1, tự host nên hợp CSP
`font-src 'self'`). Lý do: font thiết kế cho tiếng Việt, dấu cân hơn Inter. Đã cập nhật UI.md U9.

## Bằng chứng
```
$ npm run lint
> eslint . --max-warnings 0          (không lỗi, không cảnh báo)

$ npm test -w @nckh/web
 Test Files  28 passed (28)
      Tests  230 passed (230)

$ npm run build -w @nckh/web
✓ built in 624ms
```
Chụp màn hình bằng Playwright trên dev server (đăng nhập, danh sách đề tài, chi tiết đề tài 1360 px và 390 px): con dấu hiện đúng,
không tràn ngang ở mobile. Chỉ đổi class CSS và thêm một component trình bày, không đổi logic nên không thêm test.
Chưa chạy E2E (`npm run test:e2e`).
