# TASK-DC-11 – Xuất Excel thống kê (FR39, FR14) – API_GD7 §10.3

## Thay đổi
- `GET /api/stats/export.xlsx`: cùng quyền (STAFF/LECTURER), `statsQuerySchema`, limiter 30/15 phút với CSV. 2 sheet: "Thống kê" (đúng `computeStats`, cột như CSV) và "Danh sách đề tài" (Mã, Tên đề tài, Trạng thái, Đợt, Năm học, Lĩnh vực, GVHD hiện hành, Số thành viên, Nguồn, Kết quả, Điểm bảo vệ; không có tên/mã SV, email, SĐT, nhận xét).
- `statsWhere(scope, q)` tách trong `stats/prismaRepo.js`, dùng chung cho `groupTopics` (JSON/CSV) và `listTopicsForExport` (sheet 2) – không có bộ lọc thứ hai.
- Kết quả và điểm bảo vệ chỉ điền khi CLOSED (điểm = phân công đã chốt mới nhất).
- Chống formula injection: ô chuỗi luôn gán string thuần, không `{ formula }`; không thêm tiền tố (G57).
- Trần 5.000: `total` > 5.000 → 400 `VALIDATION_ERROR` "Quá nhiều đề tài, hãy thu hẹp bộ lọc" (kiểm trước khi ghi byte nào); dữ liệu không bao giờ bị cắt cụt.
- Ghi bằng `WorkbookWriter` stream thẳng vào response; mọi mã exceljs nằm trong `stats/xlsx.js`.
- OpenAPI: thêm route vào `apps/api/src/openapi/spec.js`.
- Gói mới: `exceljs` 4.4.0 ghim chính xác (`apps/api/package.json`), đã duyệt ở GD7 §12.

## File
`apps/api/src/modules/stats/{prismaRepo.js,service.js,routes.js,xlsx.js}`, `apps/api/src/openapi/spec.js`, `apps/api/package.json`, `package-lock.json`, `apps/api/tests/TC-FR39-xlsx.test.js` (8 test, TC-FR39-01..05), `docs/agents/BANG_CONG_VIEC.md`.

## Lệnh và kết quả
- `DB_TEST_DRIVER=embedded npm run db:test:up` → OK; `npm run db:test:reset` → OK.
- `npm run lint` (eslint . --max-warnings 0) → sạch (không cảnh báo).
- `npm test` (chạy sau sửa cuối): api 84 file, **1212/1212** đạt (gồm 8 test mới); web 32 file, **245/245** đạt.
- `npm audit --omit=dev`: **0 high/critical**; 2 moderate: `uuid` < 11.1.1 (GHSA-w5hq-g745-h8pq) qua `exceljs`. Đã biết ở GD7 §12 (m7): lỗi chỉ ở uuid v3/v5/v6 khi truyền `buf`, exceljs dùng v4 → không khai thác được; không dùng `overrides`. Gợi ý `npm audit fix --force` sẽ hạ exceljs xuống 3.4.0 → không áp dụng.

## Câu hỏi cho reviewer
- Điểm bảo vệ lấy `finalScore` của `CouncilAssignment` có `decidedAt` mới nhất và `cancelledAt` null (trigger đã bất biến sau chốt).
- Chưa đo hiệu năng riêng cho 5.000 dòng ngoài test chức năng (test đạt trong giới hạn thời gian mặc định).

## Sửa theo review bao-mat v1 (điều phối viên, 2026-11-19)
- m1: `middlewares/errorHandler.js` – nếu `res.headersSent` (lỗi giữa lúc stream xlsx) thì ghi log error rồi `next(err)` cho Express hủy kết nối, không gọi `res.json` lần hai. Test: `T206-errors.test.js` "errorHandler – header đã gửi".
- m2: `stats/xlsx.js` – `cleanCell` bỏ ký tự điều khiển không hợp lệ trong XML (giữ tab/LF/CR) để file không hỏng. Test: `TC-FR39-03b` (unit `cleanCell`; đề tài có `\u0001` vẫn ra file đọc được; `-`, tab, CR đầu chuỗi đều là ô chuỗi – trình đọc XML chuẩn hóa CR → LF).
- Lệnh: `npm run lint` → exit 0; `npm run db:test:reset` rồi `npm test` → exit 0: shared 100/100, api 1215/1215 (84 file), web 245/245.
