# Review TASK-UI-SHADCN – reviewer v1

Kết luận: **APPROVED** (không có BLOCKER/MAJOR; 3 MINOR ghi để xử lý sau, không chặn).

## Lệnh tự chạy (2026-11-11)
- `npm run lint` → không lỗi, 0 warning.
- `npm test` → 73 + 967 + 236 passed, 0 failed (báo cáo ghi 962/235; số test nhiều hơn, không lệch theo hướng xấu).
  Lưu ý: lần chạy đầu của tôi có 60+ test API đỏ vì tôi chạy hai tiến trình test chung DB; chạy lại một mình thì xanh hết. Không phải lỗi của task.
- `npm run build -w @nckh/web` → built (chỉ cảnh báo chunk > 500 kB, có từ trước).
- E2E không chạy lại (theo yêu cầu); tin báo cáo 74/74.

## Đối chiếu điều kiện
- 5 dependency ghim chính xác (`radix-ui` 1.8.1, `class-variance-authority` 0.7.1, `clsx` 2.1.1, `tailwind-merge` 3.7.0, dev `tw-animate-css` 1.4.0): đạt, `apps/web/package.json`. Gói `cn` đã gỡ.
- Không tải CDN: grep `cdn|googleapis|unpkg` trong `apps/web/src` và `index.html` không có kết quả. Font vẫn là `@fontsource`.
- Chỉ chép component dùng thật: alert, avatar, badge, button, dialog, label, separator đều có chỗ dùng. Còn export thừa trong file chép (AvatarImage, `Button`, DialogTrigger…) – chấp nhận vì là mã gốc shadcn.
- Việt hóa: `dialog.jsx` "Đóng". Không đổi logic/API (diff chỉ chạm lớp trình bày; riêng `key={options.length}` có test R7 riêng).
- `prefers-reduced-motion` (`index.css:118`), `:focus-visible` (`index.css:108`), `min-h-11` trong `btn*` (`ui.jsx:10`), `role="dialog"` (ReasonDialog, ConflictDialog, ChangeRequestForm), `role="alertdialog"` (TempPasswordBox `ui.jsx:150`): đều còn.
- localStorage có try/catch ở cả đọc (`Layout.jsx:37`) lẫn ghi (`Layout.jsx:49`); updater idempotent nên không hỏng khi StrictMode chạy hai lần.
- `key={options.length}` (`TopicEditPage.jsx:~150`): hợp lý. Khi remount, RHF gán lại giá trị hiện hành của form (kể cả lựa chọn người dùng đã đổi), nên không mất dữ liệu.
- Test đổi chuỗi vòng 4 (`advising.test.jsx:86`, `execution.test.jsx:158,173,247`, `TopicListPage.test.jsx:50`, `T503-stats.test.js:108`, `m1.spec.js:61`, `m4.spec.js:105,121,127`): đã đọc diff, chỉ thay chuỗi mong đợi cho khớp chuỗi mới app sinh ra; không `.skip/.only`, không nới assertion. `79a060f` đổi selector E2E thành `.first()` (ô "Tổng số" vẫn được kiểm), có lý do, có sự đồng ý của người dùng; chấp nhận.
- `enums.js`: chỉ đổi 2 nhãn; không động `TRANSITIONS`. Còn "GVHD" chỉ trong comment.
- Tương phản: `--muted-foreground` #475569 trên #fff/#f5f6fc/#f6f7fb ≈ 7:1; nút chính trắng trên #d72134 ≈ 4.9:1; chữ phụ trên nền navy dùng blue-100: đạt AA. Nút chỉ có icon đều có tên (sr-only hoặc aria-label: đổi mật khẩu, đăng xuất, thu gọn menu, xóa từ khóa). Nhãn ô qua `Label htmlFor` + aria-invalid/aria-describedby. Bảng nằm trong `tableFrame overflow-x-auto`, form/lưới dùng `min-w-0` nên không thấy nguy cơ tràn ngang 360 px.

## Vấn đề
1. **MINOR** `apps/web/src/pages/topics/TopicEditPage.jsx` (nút X xóa từ khóa, `size-6` = 24 px): dưới vùng chạm 44 px mà UI §8 và NFR07 (di động) yêu cầu. Hậu quả: khó bấm trên điện thoại, dễ xóa nhầm chip bên cạnh. Đề xuất: vùng bấm `size-11` hoặc đệm `before:absolute before:-inset-2.5` giữ chip nhỏ.
2. **MINOR** `apps/web/src/components/ChangeRequestForm.jsx:76`: `${dialogOverlay} items-start` ghi đè `items-center` bằng hai class cùng thuộc tính; thắng thua phụ thuộc thứ tự CSS sinh ra (hiện `items-start` thắng vì đứng sau, đã kiểm trong bản build). Hậu quả: đổi phiên bản Tailwind có thể làm hộp dài canh giữa và bị cắt mép trên ở màn 360 px. Đề xuất: `dialogOverlay` nhận tham số căn dọc hoặc dùng `cn()`/tailwind-merge (đã có sẵn) để chắc chắn gộp.
3. **MINOR** `apps/web/src/components/ui/label.jsx:1`: lệnh `"use client"` do CLI chép, vô nghĩa với Vite; vô hại. Có thể xóa cho gọn. Ngoài ra `ReasonDialog`, `ConflictDialog`, `ChangeRequestForm` vẫn là khung tự quản (không dùng Dialog Radix) do lý do test đã nêu trong báo cáo; chấp nhận, nhưng thành hai cơ chế hộp thoại song song – nên ghi nợ kỹ thuật.

## Chưa kiểm
Không chụp màn hình thực ở 360 px (chỉ đọc mã và kết quả build); không chạy lại E2E; không rà mọi chữ viết tắt "SV"/"GV" còn lại ngoài các chuỗi vòng 4 đã nêu.
