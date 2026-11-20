# TASK-DC-17 – Reviewer v1
Kết luận: APPROVED

Tự chạy lại: `npx vitest run tests/dc17.test.jsx` (apps/web) 19/19 pass; `npm run lint` sạch. Không chạy lại API/full suite theo quy trình gọn.

Đối chiếu UI §12.10 / GD7 §10.2:
- Quyền kéo: KanbanPage.jsx:45 `IN_PROGRESS && manageMilestones && advisor.id === user.id`; thẻ không có đích thì không `draggable` và không có nút (dòng 133-141, 151).
- Cột đích hợp lệ: dòng 31 (AWAITING → PASSED/NEEDS_WORK, PASSED → NEEDS_WORK). Cột khác `dropEffect='none'` và không gọi onMove (dòng 105-109).
- Không cập nhật lạc quan: thẻ chỉ đổi cột sau `invalidateExec` (dòng 51-67).
- Tên trường khớp backend: feedbacks `{content, evaluation, milestoneVersion}` khớp `documentFeedbackSchema` (shared schemas.js:243); `awaitingFeedback` khớp service.js:18; reopen `{version, reason}`.
- `ReasonDialog`: `schema` và `confirmClassName` có mặc định cũ (`reasonSchema`, `btnDanger`), nên các nơi gọi cũ không đổi.
- a11y: `aria-live="polite"` (dòng 72), `aria-describedby` trên thẻ và link, menu Radix cho bàn phím.
- Hash `#moc-<id>` ở MilestonesPage: có `id` và cuộn sau khi dữ liệu tải xong.

Câu hỏi mở 1 (mất nhận xét khi 409/mạng): chấp nhận được. §12.10 quy định "thẻ ở nguyên cột cũ, toast" và 409 cần tải lại, nên dữ liệu cũ vốn đã không còn đúng. Lỗi nhập liệu vẫn giữ chữ đã gõ. Câu hỏi 2 (chỉ aria-live khi thành công): chấp nhận.

Phát hiện:
- MINOR – KanbanPage.jsx:58-60: lỗi mạng đóng hộp và mất nhận xét dài đã gõ. Nên giữ hộp mở cho `NETWORK_ERROR`, vì thử lại vô hại. Không chặn.
- MINOR – chưa kiểm tra trực quan ở 360px/trình duyệt thật, và chưa có E2E bàn phím. Báo cáo ghi E2E thuộc DC-23, nên chấp nhận.
- MINOR – KanbanPage.jsx:114: nút "Thu gọn" dùng `lg:hidden` nhưng `ul` thu gọn dùng `hidden lg:block`. Đúng ý, chỉ cần nhớ là desktop không thu gọn được.

Không có BLOCKER hoặc MAJOR.
