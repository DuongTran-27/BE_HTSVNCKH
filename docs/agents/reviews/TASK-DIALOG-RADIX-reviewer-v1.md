# Review TASK-DIALOG-RADIX – reviewer v1

Kết luận: **CHANGES_REQUESTED** (1 MAJOR, 4 MINOR). Không có BLOCKER.

Phạm vi: e90d03b, 9a7315f. Đã đọc báo cáo, `reports/TASK-UI-SHADCN.md` mục 3, diff đầy đủ, `components/ui/dialog.jsx`.

## Tự chạy lại
- `npm run lint` → `eslint . --max-warnings 0`, sạch.
- `npx vitest run` (apps/web) → Test Files 29 passed (29), Tests 236 passed (236). Khớp báo cáo. Không có cảnh báo Radix "Missing `Description` hoặc `aria-describedby`" trong output.
- Không chạy E2E (báo cáo 74/74; không thấy lý do phải chạy lại).

## Sửa test (`dialogs.test.jsx`) đối chiếu quy tắc 1: hợp lệ, không làm yếu
- Gửi Tab vào `document.activeElement` thay vì `document`: hook cũ nghe `keydown` trên `document`. FocusScope của Radix nghe `onKeyDown` trên chính khung hộp thoại. Trình duyệt thật gửi keydown tới phần tử đang focus rồi nổi bọt lên, nên cách gửi mới đúng thực tế hơn. Cả hai `expect` (Shift+Tab từ ô đầu nhảy về "Gửi", Tab từ "Gửi" quay về ô đầu) giữ nguyên và vẫn kiểm hai mép vòng. jsdom không tự chuyển focus khi nhấn Tab, nên nếu focus đổi thì chỉ có thể do bẫy focus của Radix.
- Esc vẫn gửi vào `document`, đúng vì DismissableLayer nghe Esc ở mức document.
- `waitFor` cho kiểm trả focus: Radix trả focus trong `setTimeout` lúc FocusScope unmount. Điều kiện vẫn là so bằng chặt (`toBe(opener)`), chỉ thêm thời gian chờ.
- Thêm kiểm trả focus cho ConfirmDialog, chặt hơn trước. Không có `.skip`/`.only`, không xóa test.

## Đúng
- `useReturnFocus` (ui.jsx:24–27): khi Content có `onCloseAutoFocus`, Radix gọi handler đó rồi mới tự `triggerRef.current?.focus()`. Không có Trigger thì `triggerRef` rỗng, focus rơi về body. Chẩn đoán này đúng. `preventDefault` + focus `opener` sửa đúng chỗ, có kiểm `isConnected`. Đọc `document.activeElement` trong initializer của `useState` chỉ chạy ở lần render đầu và giá trị ổn định khi StrictMode render hai lần. Ba hộp này đều mount đúng lúc mở (`{x && <Dialog…/>}`), nên phần tử đang focus lúc render đầu chính là nút đã mở.
- ConflictDialog (TopicEditPage.jsx:65): không có `onOpenChange`, chặn Esc bằng `onEscapeKeyDown` và chặn bấm ra ngoài, đúng ghi chú "phải chọn một trong hai".
- `aria-describedby: undefined` khi ReasonDialog không có `message` (ReasonDialog.jsx:24) là cách Radix khuyến nghị và không phát cảnh báo.
- Xóa `useDialogA11y`/`dialogOverlay`/`dialogPanel`: grep không còn chỗ nào dùng.
- ChangeRequestForm (ChangeRequestForm.jsx:79–80): `max-h-[calc(100dvh-2rem)] overflow-y-auto` thì form dài TOPIC_CHANGE cuộn được trong khung ở màn hình 360 px. `max-w-[calc(100%-2rem)]` mặc định giữ lề hai bên.
- Văn bản giao diện vẫn là tiếng Việt.

## MAJOR
1. **Thiếu test cho các hành vi mới hoặc được viết lại** (CLAUDE.md: mỗi thay đổi code sản phẩm phải có test). Hiện test đơn vị chỉ phủ ReasonDialog và ConfirmDialog. Các hành vi sau không có test nào giữ:
   - ConflictDialog không đóng bằng Esc hay bấm ra ngoài (TopicEditPage.jsx:65). Đây là hành vi bảo vệ dữ liệu: nếu xóa `onEscapeKeyDown`, Esc sẽ làm biến mất hộp mà không chọn gì, và cũng không test nào báo đỏ. Cả repo không có test nào cho ConflictDialog (grep "Tải bản mới" trong `tests/`, `src/` không ra).
   - ChangeRequestForm nay đóng bằng Esc (gọi `onClose`), có bẫy focus và trả focus về nút mở (ChangeRequestForm.jsx:78–80). E2E gd6b chỉ mở rồi gửi form, không nhấn Esc.
   - `keepOpenOnOutside` (ui.jsx:19): không test nào chứng minh bấm ra ngoài không đóng hộp.

   Đề xuất: trong `dialogs.test.jsx`, thêm (a) ReasonDialog: `fireEvent.pointerDown(document.body)` → dialog vẫn còn; (b) export có tên `ConflictDialog` từ TopicEditPage.jsx, hoặc test qua TopicEditPage với phản hồi 409. Kiểm: Esc → dialog vẫn còn, `onTakeNew`/`onKeepMine` không bị gọi; (c) `tests/change-requests.test.jsx`: mở form, nhấn Esc → `onClose` được gọi / dialog biến mất, focus về nút mở (dùng `waitFor`).

## MINOR
1. **ReasonDialog và ConflictDialog không giới hạn chiều cao** (ReasonDialog.jsx:24, TopicEditPage.jsx:65). Lớp phủ cũ có `overflow-y-auto` nên cuộn được. DialogContent của shadcn dùng `fixed top-1/2 -translate-y-1/2` và không có `max-h`. Trên điện thoại khi bàn phím ảo mở (chiều cao khả dụng khoảng 300 px), ReasonDialog có textarea 4 dòng, lỗi `root` và hai nút có thể bị cắt mép trên hoặc dưới mà không cuộn được. Đề xuất: dùng chung `max-h-[calc(100dvh-2rem)] overflow-y-auto` cho cả ba hộp, ví dụ đưa vào một hằng trong ui.jsx.
2. **Esc ở ChangeRequestForm làm mất nội dung đã gõ** (ChangeRequestForm.jsx:78). Mặt khác, `keepOpenOnOutside` lại được giải thích là "tránh mất nội dung đang gõ" (ui.jsx:18). Form TOPIC_CHANGE có nhiều ô dài (tóm tắt, mục tiêu, giải trình). Esc đóng modal là hành vi được mong đợi (APG) và nhất quán với ReasonDialog, nên tôi chấp nhận. Nhưng cần ghi rõ quyết định này trong báo cáo. Nếu muốn an toàn hơn: khi `isDirty`, chặn Esc hoặc hỏi xác nhận.
3. **`aria-label` thừa** trên cả ba DialogContent và ConfirmDialog (ui.jsx:100, ReasonDialog.jsx:24, TopicEditPage.jsx:65, ChangeRequestForm.jsx:79). Radix tự gắn `aria-labelledby` trỏ tới DialogTitle, và `aria-labelledby` được ưu tiên hơn. Riêng ConflictDialog: `aria-label` ("Hồ sơ vừa được cập nhật") khác tiêu đề hiển thị ("Hồ sơ vừa được thành viên khác cập nhật"), dễ gây hiểu nhầm khi viết test theo tên. Hiện chưa có test nào phụ thuộc vào tên này. Đề xuất: bỏ `aria-label`, hoặc ít nhất sửa cho khớp tiêu đề.
4. Chú thích của `keepOpenOnOutside` (ui.jsx:18) ghi "Hộp thoại có ô nhập", nhưng hằng này cũng được dùng cho ConflictDialog, vốn không có ô nhập. Nên sửa chú thích cho đúng phạm vi dùng.

## Chưa kiểm
Không chạy E2E. Không kiểm thủ công trên trình duyệt di động thật hay trình đọc màn hình. Không dựng lại commit cha để xác nhận test trả focus của ConfirmDialog đỏ trước khi sửa; tôi suy ra điều đó từ mã nguồn Radix (`triggerRef` rỗng).
