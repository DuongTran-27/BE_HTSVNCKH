# TASK-DC-19 – Seed/demo: đề tài GV đang tuyển có đơn, đề tài Chờ bảo vệ có hội đồng

Trạng thái: DONE (reviewer v1 APPROVED) · FR31–FR37

## Đã làm
Mở rộng `apps/api/prisma/seed.js` (không tạo seed song song), thêm hai khối trong cùng transaction, sau vòng dựng lịch sử trạng thái (nên StatusHistory/version/điểm quá trình/tài liệu FINAL của 3 đề tài Chờ bảo vệ và 3 đề tài Đang tuyển đã có sẵn từ DC-05/DC-07):

1. Đơn ứng tuyển (`TopicApplication`):
   - Đề tài GV số 33 (GVHD GV002): 2 đơn PENDING (SV `seedStudentCode(15)` và `(16)`) + 1 đơn DECLINED có lý do, `decidedById` = GVHD.
   - Đề tài GV số 34: 1 đơn PENDING.
   - Người nộp là SV có đề tài không hoạt động (bị từ chối/đã hủy: `seedStudentCode(15|16|17|21)`) nên không vượt hạn mức đề tài hoạt động khi GV duyệt.
2. Hội đồng: `HD-<năm>-001` (mã từ `council_code_seq` như app), tạo bởi CB001; CHAIR = GV002, SECRETARY = GV003, MEMBER = GV004 (cùng khoa, không ai là GVHD của đề tài – GVHD là GV007). Một phân công mở cho đề tài Chờ bảo vệ số 30 (đã có điểm quá trình + báo cáo FINAL), và một điểm bảo vệ (GV004 chấm 8,25) để màn chấm hiện tiến độ 1/3.

Chỉ dùng tên hư cấu của seed. Idempotent như cũ: seed vẫn chỉ chạy trên DB trống (từ chối khi đã có user).

Tài khoản xem (mật khẩu `Nckh@2026-dev`): GV002 (đề tài đang tuyển 33 có 3 đơn; chủ tịch hội đồng), GV003 (thư ký), GV004 (ủy viên, đã chấm), GV007 (GVHD đề tài bảo vệ, thấy khối bảo vệ), CB001 (hội đồng/phân công), SV mã `seedStudentCode(15)`, `(16)`, `(17)`, `(21)` xem đơn của tôi / bảng tin tuyển.

## File
- `apps/api/prisma/seed.js` (sửa)
- `apps/api/tests/DC19-seed.test.js` (mới, 2 test: đơn thuộc đề tài GV RECRUITING + SV không hoạt động + có DECLINED; hội đồng đủ vai, không xung đột lợi ích, phân công mở, 1 điểm, 1 điểm quá trình)

## Bằng chứng
- `npm test` (gốc): shared 115/115; api 85 file, 1219/1219 (gồm DC19 mới); web 39 file, 383/383. Exit 0.
- `npm run lint`: `eslint . --max-warnings 0`, không có lỗi/cảnh báo (exit 0).
- `npm run test:e2e -w @nckh/web`: `74 passed (4.6m)`, không đổi kỳ vọng nào (E2E dùng người dùng/đề tài riêng, seed chỉ thêm đơn + hội đồng, không đổi số đề tài).

## Giới hạn / câu hỏi cho reviewer
- Seed không ghi AuditLog/Notification (đúng như phần seed hiện có); hội đồng/đơn mẫu cũng vậy.
- Số đơn PENDING của đề tài 33 = 2 nên `applicationCounts.pending` = 2 trên R-chi tiết.
