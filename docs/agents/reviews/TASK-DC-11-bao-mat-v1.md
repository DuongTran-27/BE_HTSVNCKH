# Review bảo mật TASK-DC-11 (GET /api/stats/export.xlsx, FR39) – v1

Kết luận: **APPROVED** (0 BLOCKER, 0 MAJOR, 2 MINOR).

## Lệnh đã chạy
- `npm run lint` -> sạch (`--max-warnings 0`).
- `DB_TEST_DRIVER=embedded npm run db:test:up` -> OK; `npm run db:test:reset` -> OK.
- `npm test` -> shared 8 file/100 test, api 84 file/**1212/1212**, web 32 file/**245/245** đạt.
- `npm audit --omit=dev` -> 0 high/critical; 2 moderate (`uuid` < 11.1.1, GHSA-w5hq-g745-h8pq, qua `exceljs`).

## Kết quả kiểm
- Quyền: `routes.js:27` dùng cùng `roles` (STAFF, LECTURER), `query` (statsQuerySchema) và limiter `user` 30/15 phút với CSV. `scopeOf` (service.js:16-27) dùng chung: STAFF ngoài phạm vi 403, GV gửi facultyId 400, SV/ADMIN 403. Test TC-FR39-01/02 phủ.
- Cùng phạm vi dữ liệu: `statsWhere` (prismaRepo.js:16-35) dùng chung cho `groupTopics` và `listTopicsForExport`. Tham số hóa qua `Prisma.sql`, không ghép chuỗi. GV chỉ thấy đề tài có `a.lecturerId` của mình, DRAFT bị loại.
- Không lộ nhiều hơn CSV về mặt thành viên: sheet 2 chỉ chọn mã, tên đề tài, trạng thái, đợt, năm học, lĩnh vực, tên GVHD, số thành viên, nguồn, kết quả, điểm. Không có SV, email, SĐT, nhận xét, `passwordHash`. Tên GVHD đã hiển thị trong thống kê theo lecturer nên không mới. Điểm bảo vệ chỉ là một số (`finalScore`), không có điểm từng thành viên hay thành viên hội đồng.
- Định nghĩa điểm bảo vệ (prismaRepo.js:43-47): `CASE WHEN t.status='CLOSED'` + `decidedAt IS NOT NULL AND cancelledAt IS NULL ORDER BY decidedAt DESC LIMIT 1` = finalScore của phân công chốt mới nhất. Đúng như yêu cầu; kết quả dùng `rv.isCurrent` chỉ khi CLOSED (statsWhere). Điểm chỉ lộ cho STAFF/GV hướng dẫn đề tài đó (đã có quyền xem điểm đã chốt) – chấp nhận.
- Formula injection: `xlsx.js:6-11` chỉ gán chuỗi thuần, `useSharedStrings:false` (inlineStr); không có đường nào sinh `{formula}`. Test TC-FR39-03 đọc lại file: `=1+1`, `+cmd|calc`, `@SUM(1+1)`, `=HYPERLINK(...)` đều là `ValueType.String`, không formula, cả ở sheet 1 và 2. Tab/CR/`-` đầu chuỗi cũng là chuỗi (cùng đường mã), không phải công thức khi mở bằng Excel.
- Trần 5.000: `service.js:~43` kiểm `total` (tính trước khi cắt 1000 dòng) trước khi truy vấn danh sách và trước khi `res.set`/ghi byte nào; `LIMIT` thêm lớp bảo vệ. Test biên 5.000/5.001 đạt.
- Rate limit: dùng chung nhóm giới hạn 30/15 phút theo user (khóa theo user, tạo limiter riêng cho route này nên ngân sách không chung với CSV nhưng cùng mức).
- Mở rộng bộ nhớ: tối đa 5.000 dòng được tải vào bộ nhớ trước khi stream – chấp nhận.
- OpenAPI: `spec.js` đã thêm route, role `SL` đúng.
- npm audit: uuid moderate chỉ tác động khi gọi v3/v5/v6 với tham số `buf`; exceljs dùng v4, ghi file ra, không đọc file người dùng -> không khai thác được, chấp nhận (khớp GD7 §12 m7). Không áp `--force` (hạ exceljs 3.4.0) là đúng. `exceljs` ghim 4.4.0.
- Bí mật: diff không chứa khóa/chuỗi kết nối.

## Phát hiện
### MINOR-1 – errorHandler không bảo vệ khi lỗi xảy ra giữa lúc stream
`apps/api/src/middlewares/errorHandler.js:19-57` luôn gọi `res.status().json()`; nếu `writeXlsx` (`xlsx.js:15-17`) ném lỗi sau khi đã ghi byte, lời gọi này ném `ERR_HTTP_HEADERS_SENT` và rơi vào finalhandler mặc định của Express. Finalhandler khi `headersSent` sẽ hủy socket, nên không treo và không lộ stack (log phía server vẫn ghi ở dòng 56). Rủi ro thực tế thấp vì dữ liệu đã nằm trong bộ nhớ trước khi stream. Đề xuất: thêm `if (res.headersSent) return _next(err)` hoặc `res.destroy()` ở đầu errorHandler, kèm một test. Chưa kiểm bằng test tấn công riêng (suy từ code).

### MINOR-2 – Ký tự điều khiển trong tên đề tài
Tên đề tài có ký tự điều khiển XML không hợp lệ (vd. `\u0001`) có thể làm exceljs sinh XML hỏng/file không mở được (từ chối dịch vụ cục bộ cho chính người xuất; không phải lỗ hổng bảo mật). Đề xuất kiểm hoặc loại ký tự `[\x00-\x08\x0B\x0C\x0E-\x1F]` ở `service.js` khi map `rows`; chưa kiểm thực nghiệm.

## Không kiểm
Chưa đo hiệu năng/bộ nhớ 5.000 dòng ngoài test chức năng; chưa chạy test tấn công riêng cho lỗi giữa stream.
