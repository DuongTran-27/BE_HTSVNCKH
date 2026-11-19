# Review TASK-DC-13 – reviewer – vòng 1

Kết luận: **APPROVED** (không BLOCKER, không MAJOR; 2 MINOR không chặn).

## Lệnh tự chạy
| Lệnh | Kết quả |
|---|---|
| `npm run lint` | exit 0 |
| `DB_TEST_DRIVER=embedded npm run db:test:up` + `npm run db:test:reset` | OK |
| `npm test` | exit 0 – shared 115/115, api 1217/1217 (84 file), web 297/297 (34 file) |
| `npm run build -w @nckh/web` | exit 0 (built in 716ms) |
E2E không chạy lại theo yêu cầu. Khớp báo cáo. `dc13.test.jsx` không có `.skip`/`.only`; không test cũ nào bị sửa.

## Đối chiếu UI §12.5 / FR31, FR33
- R5': `TopicCreatePage` dùng chung form, đổi tiêu đề và quy trình 3 bước theo vai trò. Nút "Công bố đề tài tuyển sinh viên" có ở R4. Đạt.
- R7': `TopicEditPage` thêm 2 ô khi `origin === 'LECTURER'`. Danh sách điều kiện chạy `topicPublishSchema` qua `submitProblems(..., publish)` (`topicForm.js`). Schema form là `topicDraftSchema.extend(...)` dùng `REQUIREMENTS_MAX` của shared, không tự định nghĩa lại. Đề tài SV không gửi 2 trường này (có test). Đạt.
- Công bố: tái dùng `SubmitPage`, chỉ thêm action và nhãn. Không trùng lặp. Không có `PUBLISH_RECRUITMENT` thì quay về R6. Đạt.
- R6: khối "Đang tuyển sinh viên", liên kết "Xem ứng viên" chỉ khi `applicationCounts` khác null, khối "Yêu cầu ứng viên". Đạt.
- `RecruitActions.jsx`: nút chỉ theo `availableActions`, không tự suy quyền. Ngừng tuyển dùng `ReasonDialog` (lý do bắt buộc) và cảnh báo đỏ khi `acceptedCount > 0`. Chốt nhóm dùng `ConfirmDialog`, `GROUP_TOO_SMALL` hiện `err.message` trong hộp thoại. Đạt.
- R29 `ApplicantsPage.jsx`: thanh x/y, tab, bảng ở `lg` và thẻ ở dưới `lg`, lời giới thiệu rút gọn 2 dòng. Nút theo `availableActions` của từng đơn. Từ chối bắt buộc lý do. `GROUP_FULL` và `STUDENT_TOPIC_LIMIT` hiện trong hộp thoại. `APPLICATION_CLOSED` và `NOT_RECRUITING` đóng hộp thoại, toast và tải lại (dòng 17, 40-45). "Đồng ý" vẫn hiện khi đủ chỗ, kèm gợi ý, server quyết định (dòng 144). Đạt.
- Luồng SV cũ (R5/R7/R10): các nhánh mới đều có điều kiện `origin`, `publish` hoặc `lecturer`. `TopicActionBar` chỉ thêm một nhánh. `invalidateAfterAction` chỉ thêm key. Không thấy hồi quy; 297 test web xanh.
- Tiếng Việt: nhãn đủ dấu, không viết tắt GVHD/NCKH trong 2 file mới. Comment tiếng Việt có ở đầu file, đầu khối và các điểm quyết định.

## Phát hiện
### MINOR
1. `apps/web/src/pages/topics/SubmitPage.jsx:~130` – tiêu đề bước cuối vẫn là "4. Gửi" khi công bố. Nên dùng "4. Công bố" khi `publish` (nhãn nút đã đúng). Chỉ là câu chữ.
2. `apps/web/src/pages/topics/TopicCreatePage.jsx:30` – `?nguon=gv` trong liên kết ở `TopicListPage.jsx:74` không được đọc; giao diện chỉ phụ thuộc vai trò. Vô hại vì LECTURER chỉ tạo được đề tài kiểu này, nhưng nên bỏ tham số hoặc ghi chú. Cũng không có test cho trường hợp `maxMembers` của đợt đổi sau khi lưu (báo cáo đã nêu; server kiểm lại khi công bố).

## Không kiểm
Không chạy E2E và không kiểm tay 360px hoặc dark mode (theo yêu cầu và theo báo cáo dev).
