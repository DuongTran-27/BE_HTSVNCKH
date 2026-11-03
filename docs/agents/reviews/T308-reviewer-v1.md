# T308 – Review v1 (reviewer) – APPROVED

## Lệnh tự chạy
- `npm run lint`: sạch.
- `npm test -w @nckh/web`: 20 file, 144 test đều qua (khớp báo cáo).
- `npm run build -w @nckh/web`: build thành công.

## Hai test có sẵn bị sửa: chấp nhận
- `tests/guards.test.jsx`: chỉ thêm mock `api` và `QueryClientProvider`, đổi heading SV thành "Đề tài của tôi", đổi tên một test. Mọi khẳng định guard giữ nguyên, không có `.skip`/`.only`, không nới assertion.
- `tests/review.test.jsx`: đổi "Chưa kiểm tra được" thành "Chưa có mức trùng lặp" cho `latestSimilarityLevel: null` ở danh sách. Khớp UI §4.13 dòng 287 (danh sách hiện "—", không đoán). Vẫn khẳng định `queryByText(/Không trùng/)` là null. Đây là sửa đúng đặc tả, không làm yếu test.

## Đối chiếu
- FR06: mức null hiện "—" kèm chữ ẩn "Chưa có mức trùng lặp" (`SimilarityPanel.jsx:22-25`), không hiện như "không trùng".
- Kho (`RepositoryPage.jsx`): chỉ hiện code, title, summaryExcerpt, field, academicYear, result, và summary ở trang chi tiết (§9.2). Không có thành viên, GVHD hay file. Mọi vai trò kể cả ADMIN đều vào được. 404 hiện "Đề tài không có trong kho".
- Bộ lọc và trang nằm trên URL (`useUrlParams`, `pickEnum`, `pickPage`, `pickYear`). Giá trị sai bị bỏ qua, năm học sai có báo lỗi. `keepPreviousData` giữ trang cũ khi đổi trang.
- Văn bản UI bằng tiếng Việt.
- Các MINOR T305/T307 đã sửa đúng như bảng trong báo cáo. T305-3 (hộp thoại xung đột) hoãn có ghi chú.

## BLOCKER / MAJOR
Không có.

## MINOR (không chặn)
1. `RepositoryPage.jsx:62` / `:65`: chỉ 404 có nhánh riêng. Các lỗi khác đi qua `QueryBox` chung, chấp nhận được.
2. Chưa có test render cho SubmitPage (lỗi tải) và TopicEditPage (lỗi mạng), chưa có test riêng cho `RepositoryPage`. Nên bổ sung ở T309 hoặc E2E.
3. Lọc GVHD là `<select>` giới hạn 100 GV, trong khi UI §4.4 yêu cầu ô có tìm kiếm. Báo cáo đã nêu, nên nâng cấp khi khoa có hơn 100 GV.
4. Năm học nhập tay. Chưa chạy với API T213b thật, nên T309 hoặc E2E cần kiểm lại hợp đồng.
