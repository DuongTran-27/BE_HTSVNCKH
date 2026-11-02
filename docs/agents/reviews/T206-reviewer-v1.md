# T206 – Review vòng 1 (reviewer)
Phạm vi: FR04, FR25, FR15. Tự chạy: `db:test:up`, `db:test:reset`, `npm test` (shared 32; api 212 pass + 1 expected fail; web 75), `npm run lint` -> xanh, khớp báo cáo. (Lưu ý: reset in cảnh báo EPERM khi generate Prisma Client trên Windows, DB vẫn reset xong, không ảnh hưởng.)

## Trả lời câu hỏi `requirePasswordChanged`
Chấp nhận việc gắn theo tiền tố (không sửa test GĐ1), NHƯNG hiện đang fail-open: xem MAJOR 1.

## Vấn đề
### MAJOR 1 – Không có test bảo vệ việc quên thêm tiền tố vào `BUSINESS_PREFIXES`
`apps/api/src/app.js:15,42-44`. `catalogRouter` gắn ở `/api` (không tự có auth); route mới ở router khác mà quên thêm tiền tố sẽ chạy KHÔNG xác thực và không buộc đổi mật khẩu (lỗi fail-open, FR25/FR02). Test hiện chỉ kiểm `/api/faculties` -> 401 (`tests/T206-catalog-rounds.test.js:84`) và đường dẫn lạ -> 404.
Đề xuất: thêm test duyệt `router.stack` của mọi router nghiệp vụ (hoặc danh sách route khai báo) và khẳng định mỗi đường dẫn gốc nằm trong `BUSINESS_PREFIXES`, hoặc gọi không token mọi route và mong 401. Có thể đơn giản hơn: để cổng chung `/api` đặt SAU các router `auth`/`health` và cho phần 404 mặc định chạy trước cổng bằng cách kiểm "route không khớp" (nhưng cần giữ test GĐ1) – chọn cách nào cũng phải có test.

### MINOR 1 – Kiểm thứ tự mốc ở PATCH đọc ngoài transaction
`apps/api/src/modules/rounds/service.js:82-98` + `prismaRepo.js:23-28`. `before` đọc ngoài `$transaction`; hai PATCH đồng thời cùng gộp từ bản cũ có thể ghi ra thứ tự mốc sai, và `before` trong AuditLog có thể cũ. Đề xuất: đọc + kiểm + ghi trong cùng transaction (hoặc `updateMany` có điều kiện `updatedAt`), ghi vào T210/T703 nếu hoãn.

### MINOR 2 – Thông báo `CONCURRENT_UPDATE` chỉ nói "Đề tài"
`apps/api/src/middlewares/errorHandler.js:34`. Với đợt/danh mục thông báo sai ngữ cảnh. Đề xuất: "Dữ liệu vừa được người khác cập nhật, vui lòng tải lại" (đồng bộ §2 API_GD2).

### MINOR 3 – 404 trước 403 khi STAFF sửa đợt ngoài phạm vi
`rounds/service.js:82-84` (`mustFind` trước kiểm quyền) cho phép dò id tồn tại. Rủi ro thấp (id không đoán được, phạm vi nội bộ); chấp nhận hoặc đổi thứ tự.

## Đã xác nhận đạt
- ADMIN 403 với mọi thao tác đợt (`requireRole('STAFF')`/readers); STAFF ngoài khoa 403 (`service.js:76,82`); GV/SV không thấy `config`.
- Phạm vi khoa STAFF cho ngành/lớp qua `inScope`; Faculty chỉ ADMIN; không có DELETE danh mục.
- Thứ tự mốc kiểm khi PATCH sau khi gộp (`validateRoundFields(merged)`), có test.
- AuditLog cùng `$transaction` (catalog/rounds repo), có test lỗi audit -> rollback; `redact` mở rộng + test.
- errorHandler Prisma theo hình dạng, P2028 -> 503; không rò stack.
- Không có test bị skip/xóa/làm yếu trong diff.

Kết luận: CHANGES_REQUESTED (BLOCKER 0, MAJOR 1, MINOR 3)
