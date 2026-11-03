# Review T402 (FR10) – reviewer v1

Kết luận: **APPROVED**. Không BLOCKER/MAJOR. Tự chạy trên `nckh_t402rv_test` sau reset: lint sạch; shared 68/68, api 522/522, web 144/144. Không có test cũ bị sửa (chỉ thêm `T402-progress.test.js`).

Đối chiếu API_GD45 §4 / FR10: đạt.
- Khóa an toàn đồng thời: `prismaRepo.js:25` `updateMany where {id, lockedAt: null}`, count 0 -> 409 `PROGRESS_LOCKED` (`progressService.js:56`); chạy sau `lockTopicForExecution` trong transaction; `lockedAt` đọc lại trong khóa (`:54`).
- Quyền: ADMIN 403 ở `requireRole` (`routes.js:11`); ghi chỉ STUDENT thành viên (`progressService.js:23`), sửa chỉ đúng tác giả kể cả trưởng nhóm (`:24`); đọc theo quan hệ; thứ tự 404 -> 403 -> 409 đúng §1.1.
- Percent số nguyên 0..100, strict update, ít nhất một trường (`schemas.js` progress*); `selfReported: true`; AuditLog trong transaction; không có endpoint xóa; limiter 30/15 phút theo user.

MINOR (không chặn)
- m1 `progressService.js:55-57`: PATCH không đổi giá trị vẫn ghi audit (khác T401 đã sửa); nên bỏ qua khi `data` trùng bản cũ.
- m2 Điểm "nhận xét thắng sửa" mới được chứng minh một phía; T404 phải dùng cùng điều kiện `lockedAt IS NULL` ở UPDATE khóa và test đua thật.
