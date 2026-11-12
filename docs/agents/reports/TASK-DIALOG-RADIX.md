# TASK-DIALOG-RADIX – Ba hộp thoại tự quản focus chuyển sang Dialog Radix

Yêu cầu trực tiếp của người dùng (2026-11-12). Trả nợ kỹ thuật ghi ở `reports/TASK-UI-SHADCN.md` mục 3 và `BAO_CAO_HOAN_THANH.md` §6.

## Thay đổi
- `ReasonDialog`, `ConflictDialog` (`TopicEditPage.jsx`), `ChangeRequestForm` dùng `Dialog`/`DialogContent` của shadcn (Radix): khóa focus, Esc, `aria-modal`, khóa cuộn nền giống `ConfirmDialog`.
- Xóa `useDialogA11y`, `dialogOverlay`, `dialogPanel` khỏi `ui.jsx` (không còn chỗ dùng).
- `keepOpenOnOutside`: bấm ra ngoài không đóng ba hộp có nội dung/lựa chọn quan trọng (giữ hành vi cũ – lớp phủ cũ không đóng).
- `ConflictDialog` vẫn không đóng bằng Esc (`onEscapeKeyDown` preventDefault), giữ đúng chú thích "phải chọn một trong hai".
- `ChangeRequestForm` nay đóng được bằng Esc (trước đây không có Esc, không khóa focus); khung cao tối đa màn hình, cuộn bên trong.
- **Sửa lỗi có sẵn:** `useReturnFocus()` – không có `DialogTrigger` nên Radix (onCloseAutoFocus mặc định focus trigger) làm focus rơi về `body` khi đóng. Áp cho cả `ConfirmDialog` (lỗi này đã có từ TASK-UI-SHADCN, test cũ không kiểm).

## Test
- `dialogs.test.jsx`: phím Tab gửi vào `document.activeElement` thay vì `document` (trình duyệt thật gửi keydown tới phần tử đang focus; FocusScope Radix nghe trên hộp). Các `expect` giữ nguyên; kiểm trả focus dùng `waitFor` vì Radix trả focus trong `setTimeout`. **Thêm** kiểm trả focus cho `ConfirmDialog` (đỏ trước khi có `useReturnFocus`).
- Không xóa/skip test nào.

## Bằng chứng
```
npx vitest run (apps/web)      → Test Files 29 passed (29), Tests 236 passed (236)
npm run lint                   → eslint . --max-warnings 0, không lỗi
npm run build -w @nckh/web     → ✓ built
```
Chưa chạy: E2E Playwright (Docker Desktop tắt, không có DB test). Các spec `gd6*.spec.js`, `m1`, `m4`, `roles` có mở các hộp thoại này – cần chạy lại khi bật Docker.
