# T707b-be – B1, B11

## Thay đổi
- `topics/service.js`: thêm `canSeeBypassReason(rel)` = `isMember || isCurrentAdvisor || inStaffScope`; `present` dùng lại.
- `topics/snapshotService.js`: `reader()` trả `can` kèm `rel`; `get` ẩn `reason` theo `canSeeBypassReason(can.rel)` (thay cho `role === 'LECTURER'`).
- `app.js`: `helmet()` đặt trước chốt `ORIGIN_SECRET`; cors giữ nguyên sau chốt.
- Test `T609-similarity-bypass.test.js` (ca 2): GVHD hiện tại nay nhận `REASON` (ĐỔI KỲ VỌNG do đặc tả G46, không phải để cho qua); thêm GV cũ có quyền đọc và SV đã rời nhóm → 200, `reason: null`, vẫn có `grantedBy`, `createdAt` (T707a MINOR 1).
- `gd6-ui-b.test.jsx`: chỉ đổi tên mô tả.
- `T706b.test.js`: test B11 so tập header 404 của chốt và 404 thường (CSP/HSTS/nosniff có ở cả hai). Bỏ qua `vary`/`access-control-*` vì cors không đặt trước chốt.

## Bằng chứng
- `npm run db:test:up`, `npm run db:test:reset`: OK.
- `npm run lint`: không lỗi, không cảnh báo.
- `npm test`: web 27 file / 228 test đạt. API 64 file / 943/943 đạt (lần chạy đầu 942/943, lỗi do test B11 của tôi so cả header CORS; đã sửa test, chạy lại đạt).

## Câu hỏi cho reviewer
Không.
