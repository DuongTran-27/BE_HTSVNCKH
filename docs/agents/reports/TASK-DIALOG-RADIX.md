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
npm run db:test:up             → embedded-postgres 16.14, K1–K7 OK
npm run test:e2e -w @nckh/web  → 74 passed (4.8m) (desktop + mobile; gd6/gd6b/m1/m4/roles mở các hộp thoại này)
```

## Sửa theo `reviews/TASK-DIALOG-RADIX-reviewer-v1.md`
- **MAJOR 1 (test hành vi mới):** `dialogs.test.jsx` thêm: ReasonDialog bấm ra ngoài không đóng + đã gõ thì Esc không đóng; ConflictDialog (nay `export`) Esc/bấm ra ngoài không đóng, không gọi callback, focus đầu vào nút "Tải bản mới". `tests/change-requests.test.jsx` thêm: Esc đóng form chưa gõ và trả focus về nút mở; đã gõ thì Esc không đóng, không gửi API.
  Kiểm chéo: tạm tắt `keepOpenOnOutside`/`keepOpenOnEscIf` trong `ui.jsx` → 2 test mới đỏ (ReasonDialog, ChangeRequestForm); khôi phục → xanh. ConflictDialog không có `onOpenChange` nên test của nó vẫn xanh khi tắt – đúng ý (hộp chỉ đóng qua hai nút).
- **MINOR 1:** `max-h-[calc(100dvh-2rem)] overflow-y-auto` đưa vào `DialogContent` gốc (`components/ui/dialog.jsx`) – mọi hộp thoại cuộn được, bỏ class riêng ở ChangeRequestForm.
- **MINOR 2:** chọn phương án an toàn: `keepOpenOnEscIf(isDirty)` – ReasonDialog và ChangeRequestForm đã gõ dở thì Esc không đóng (đóng bằng Hủy); chưa gõ thì Esc đóng như thường.
- **MINOR 3:** bỏ `aria-label` thừa ở 4 DialogContent; tên hộp lấy từ DialogTitle (`aria-labelledby`). Tên ConflictDialog nay là tiêu đề hiển thị "Hồ sơ vừa được thành viên khác cập nhật"; không test/E2E nào dùng tên cũ.
- **MINOR 4:** sửa chú thích `keepOpenOnOutside`.

```
npm run lint                   → eslint . --max-warnings 0, không lỗi
npx vitest run (apps/web)      → Test Files 29 passed (29), Tests 239 passed (239)
npm run test:e2e -w @nckh/web  → 74 passed (4.6m)   (embedded-postgres, K1–K7 OK; đã db:test:down)
```
