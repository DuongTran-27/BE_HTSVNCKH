# TASK-DC-19 – Reviewer v1

Kết luận: APPROVED

Đã chạy lại `npx vitest run tests/DC19-seed.test.js` (apps/api): 2/2 pass. Không chạy lại lint/toàn bộ test (theo quy trình gọn).

Đối chiếu bất biến:
- Đơn: chỉ đề tài GV RECRUITING (33, 34); SV 15/16/17/21 không có đề tài hoạt động (test kiểm tra) nên không vượt hạn mức; DECLINED có reason, decidedById = GVHD (lecturers[33%8]), respondedAt.
- Hội đồng: 1 CHAIR, 1 SECRETARY, 1 MEMBER (trong 1–5), cùng khoa; không ai là GVHD (GV007 = lecturers[6]); mã lấy từ council_code_seq cùng định dạng `nextCode` của app.
- Phân công mở (decidedAt/cancelledAt null) trên đề tài WAITING_DEFENSE; DefenseScore 8.25 vào Decimal(4,2), comment có, unique (assignment, member) thỏa; thành viên chấm là ủy viên hội đồng.
- locked: có 1 điểm nên app tính locked=true, nhất quán.
- Tên hư cấu; seed vẫn chỉ chạy trên DB trống.

Phát hiện:
- MINOR apps/api/prisma/seed.js:555 `version` hội đồng giữ mặc định 0, không lệch app (app bump khi sửa); không cần sửa.
- MINOR apps/api/tests/DC19-seed.test.js:20 ràng buộc cứng số DECLINED = 1 và hội đồng = 1; chấp nhận được, sẽ phải đổi nếu seed mở rộng.
- MINOR apps/api/prisma/seed.js:520 chỉ số 33/34/30 và SV 15/16/17/21 viết cứng; test kiểm tra bất biến nên lệch sẽ bị bắt.

Không có BLOCKER/MAJOR.
