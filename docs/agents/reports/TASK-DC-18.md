# TASK-DC-18 – Web: nút "Xuất Excel" ở `/thong-ke` (FR39, UI §12.11)
- Agent: phiên chính · Trạng thái: DONE (reviewer v1 APPROVED) · Ngày: 2026-11-20

## Thay đổi
- `apps/web/src/pages/stats/StatsPage.jsx`: nút "Xuất Excel" cạnh "Xuất CSV"; một hàm `exportFile(ext)` gọi `GET /api/stats/export.{csv|xlsx}` với **cùng chuỗi query** của bảng, tải qua `api(..., { as: 'blob' })` (Bearer). Đang tải: cả hai nút disabled, nút Excel ghi "Đang xuất…". Lỗi Excel (`VALIDATION_ERROR` quá 5.000 đề tài, 429…) → toast thông điệp server; lỗi CSV giữ như cũ (hộp `role=alert`). Tên file `thong-ke-{groupBy}-{YYYYMMDD}.xlsx` (ngày giờ VN).
- `apps/web/src/lib/format.js`: thêm `downloadBlob(blob, filename)` (Blob xlsx giữ MIME server trả); `downloadCsv` thành lớp bọc của nó, hành vi không đổi.
- Không đổi backend (endpoint có từ DC-11).

## Test mới – `apps/web/src/pages/stats/DC18.test.jsx`
1. Gọi `/stats/export.xlsx?groupBy=field&status=CLOSED` (cùng query bảng), nút "Đang xuất…" disabled khi chờ, nút CSV cũng disabled, `downloadBlob` nhận đúng blob và tên `thong-ke-field-YYYYMMDD.xlsx`.
2. `VALIDATION_ERROR` → toast thông điệp server, không có hộp alert.

## Bằng chứng chạy lệnh (2026-11-20)
```
$ npx vitest run src/pages/stats      (apps/web)
      Tests  7 passed (7)            (T504 cũ 5 ca + DC18 2 ca)
$ npm run lint → eslint . --max-warnings 0 (không lỗi)
```
