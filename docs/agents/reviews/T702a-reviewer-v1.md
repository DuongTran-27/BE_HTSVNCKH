# Review T702 bước A – reviewer – vòng 1

Kết luận: **APPROVED** (không BLOCKER/MAJOR; MINOR không chặn)

## Lệnh tự chạy
- `npm run lint`: xanh, 0 cảnh báo.
- `npm test`: api 58 file / 735 test; web 25 file / 219 test, tất cả pass (khớp báo cáo).
- `npm run build -w @nckh/web`: xanh (chỉ cảnh báo chunk > 500 kB có sẵn).
- Không có test bị xóa/skip/làm yếu (diff test chỉ thêm).

## Đối chiếu MINOR gốc
- Error boundary lazy (`routes.jsx` ChunkErrorBoundary): đóng; có test, thông báo tiếng Việt.
- `ReasonDialog` focus/Esc/bẫy focus/trả focus (`ui.jsx` useDialogA11y): đóng; test `dialogs.test.jsx` kiểm focus đầu, Shift+Tab/Tab xoay vòng, Esc, trả focus về nút mở.
- Test RepositoryPage/SubmitPage/TopicEditPage lỗi tải: đóng.
- Hộp thoại xung đột (`TopicEditPage.jsx` ConflictDialog): đóng; bẫy focus + trả focus, cố ý không Esc (chấp nhận, hợp lý).
- Ô tìm GVHD: đóng, gọi `/users?role=LECTURER&q&pageSize=50`, giữ GV đang lọc từ URL.
- `data-testid="topic-code"` + `m1.spec.js:36`: đóng.
- 360 px: chỉ rà bằng đọc code, chưa đo thật; chuyển sang bước B (đã ghi trong báo cáo, chấp nhận).

## MINOR (không chặn)
1. `TopicListPage.test.jsx` (test "ô tìm giảng viên"): chỉ kiểm có gọi `/users` role=LECTURER, không gõ vào ô rồi kiểm `q=` được gửi, cũng không kiểm GV đang lọc còn trong select. Đề xuất: gõ vào ô, `waitFor` có URL chứa `q=...`; mount với `?lecturerId=x` kiểm option "Giảng viên đang lọc".
2. `dialogs.test.jsx`: ConfirmDialog không test Tab; `ConflictDialog` không có test riêng (focus vào nút đầu, Esc không đóng). Thêm 1 test mỗi cái.
3. `ui.jsx` useDialogA11y: Esc vẫn gọi `onCancel` khi đang `busy`/`isSubmitting`; nên bỏ qua Esc lúc đang gửi. Ngoài ra listener ở `document` sẽ cùng bắt Esc nếu hai hộp mở chồng nhau (hiện chưa có chỗ nào xảy ra).
4. Nhãn dự phòng "Giảng viên đang lọc" mất tên GV; E2E bước B nên kiểm hiển thị hợp lý.
5. Khi E2E bước B chạy, nhớ đo viewport 360 px `/thong-ke`, `/thong-bao` (T504).
