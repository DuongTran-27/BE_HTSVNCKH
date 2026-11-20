# Review TASK-DC-16 – reviewer v1
Kết luận: **APPROVED** (chế độ tiết kiệm quota).

## Lệnh tự chạy
- `npx vitest run tests/dc16.test.jsx tests/dc15.test.jsx` (apps/web): 2 file, 37 test, pass.
- `npm run lint` (gốc repo): sạch, `--max-warnings 0`.
- Không chạy lại bộ API (cần DB dùng chung). Tin kết quả tác giả: 115/1217/362.

## Đối chiếu UI §12.9 và API_GD7 §6.1, §7
Đạt: R33 (tab OPEN/DECIDED trên URL, lưới và thẻ, rỗng, phân trang), R34 (hồ sơ, tải báo cáo FINAL gọi `download-url` mỗi lần, điểm quá trình, nhận xét GVHD, "Điểm của tôi" với `defenseScoreSchema`, bảng điểm và trung bình tạm tính, chốt 2 bước gửi `{version, minutes}`, `SCORES_INCOMPLETE` liệt kê `details.missing`, G62 không gọi API đề tài), R6 khóa form khi nguồn COUNCIL, menu GV, route. m1, m2, m4 đã xử lý đúng.

## Phát hiện (không chặn)
- MINOR – `apps/web/src/pages/defense/DefenseScorePage.jsx:271`: ngưỡng Đạt/Không đạt xem trước viết cứng `>= 5`, trong khi điểm xếp loại lấy từ `defenseGrades` của đợt. Nếu shared có hằng ngưỡng đạt thì nên dùng. Chỉ ảnh hưởng bản xem trước, server mới quyết định.
- MINOR – `DefenseScorePage.jsx:90`: `t.advisor?.fullName ?? a.topic.advisor?.fullName`. Ổn, nhưng dải cảnh báo "Phân công đã bị hủy" (dòng 72) vẫn cho `MyScoreCard` hiện form nếu server còn trả `SCORE`. Nên xác nhận server không trả `SCORE` khi `cancelledAt` có giá trị. Đây là chuyện của server, FE chỉ tin `availableActions`.
- MINOR – `DefenseScorePage.jsx:29`: `refreshAll` chạy cả khi lưu thành công, lại ghi `setQueryData` rồi invalidate ngay, thừa một lần gọi mạng. Không sai.
- NOTE – working tree còn đổi `apps/web/src/lib/format.js` (`downloadBlob`) và `apps/web/src/pages/stats/StatsPage.jsx`, ngoài phạm vi DC-16 và không có trong báo cáo (có vẻ thuộc DC-18 làm song song). `downloadCsv` vẫn giữ nên các nơi gọi cũ không vỡ. Khi commit nên tách, hoặc ghi vào báo cáo.

Không có BLOCKER hay MAJOR.
