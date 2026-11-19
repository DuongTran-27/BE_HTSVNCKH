# Review TASK-DC-14 – reviewer – vòng 1
Kết luận: **APPROVED** (không có BLOCKER/MAJOR).

## Lệnh tự chạy
- `npm run lint`: exit 0.
- `npm test -w @nckh/web`: 35 file, 325 test, xanh (khớp báo cáo).
- `npm run build -w @nckh/web`: xanh (chỉ cảnh báo chunk > 500 kB có sẵn).
- `dc14.test.jsx` không có `.skip`/`.only`; không có test cũ bị sửa.

## Đối chiếu UI §12.6/§12.12, API_GD7 §4.1–4.3
- R26/R27/R28, menu SV + GV, `SCREENS` (cán bộ đọc R26/R27, quản trị viên không, R28 chỉ SV) đúng. Quyền thật nằm ở backend.
- Nút theo dữ liệu server (`availableActions` ở R28), mã lỗi hiện `err.message`, invalidate sau mọi lần ghi, văn bản UI tiếng Việt: đạt.

## Quyết định câu hỏi của báo cáo
Cột giảng viên ở R28: **chấp nhận bỏ** ở task này. Tên đề tài + mã đủ nhận diện, không chặn FR32. Nếu muốn, ghi một việc nhỏ backend riêng (thêm `topic.lecturer` vào `ApplicationView`), không thuộc DC-14.

## MINOR (không chặn)
1. Comment tiếng Việt còn thưa so với yêu cầu "giải thích từng file/hàm/khối": `RecruitBoardPage.jsx:64` (`RecruitCard`) không có comment; `RecruitDetailPage.jsx:30` (`Detail`), `:63` (`Block`), `:85` (`ApplyForm`) không có comment; `MyApplicationsPage.jsx:22-37` khối danh sách không có comment. Nên thêm một dòng cho mỗi hàm/khối.
2. `RecruitDetailPage.jsx:70`: "Rút đơn" ở R27 dựa vào `status === 'PENDING'` thay vì `availableActions`. Chấp nhận được vì bảng tin không trả `availableActions` (đã nêu trong báo cáo).
3. `RecruitBoardPage.jsx:14` `APPLICATION_LABEL/TONE` export từ file trang và bị trang khác import. Nếu có chỗ thứ tư dùng thì nên chuyển vào `lib/`. Chưa cần.
4. `TopicListPage.jsx:90`: JSX lồng trong prop `empty` đã dài một dòng; nên tách biến cho dễ đọc.
5. Chưa kiểm tay 360 px/dark mode (báo cáo đã nêu); chưa có E2E luồng tuyển (DC-21).

Không chạy E2E theo yêu cầu.
