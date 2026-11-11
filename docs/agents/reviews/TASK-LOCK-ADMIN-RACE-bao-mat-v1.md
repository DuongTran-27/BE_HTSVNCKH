# Review bảo mật TASK-LOCK-ADMIN-RACE – v1

- Reviewer: bao-mat
- Commit: 5eb8401
- Phạm vi: `apps/api/src/modules/accounts/prismaRepo.js` (`updateLocked`, tùy chọn `guardAdmins`), `apps/api/src/modules/accounts/service.js` (`setLocked`), `apps/api/tests/security/setLocked-admin-race.test.js`

## Kết luận: APPROVED

## Bằng chứng chạy lệnh (mỗi file một lệnh, không chạy song song)
```
cd apps/api
npx vitest run tests/security/setLocked-admin-race.test.js          -> Tests 2 passed (2)
npx vitest run tests/security/TASK-LOCK-ADMIN-RACE-bao-mat.test.js  -> Tests 1 passed (1)
npx vitest run tests/T207a-accounts.test.js                          -> Tests 29 passed (29)
```

## Đánh giá
- Hai ADMIN khóa nhau: cả hai transaction khóa mọi dòng ADMIN theo `ORDER BY id FOR UPDATE` trước dòng đích. Thứ tự khóa nhất quán nên không deadlock. Bên chạy sau đọc `isLocked` mới nhất của chính mình và nhận 403. Đạt.
- ADMIN đã bị khóa nhưng token còn hạn (request đã qua `requireAuth`) không khóa được ADMIN khác. Mở khóa không bị chặn, đây là đường khôi phục đúng. Đạt.
- `LAST_ADMIN` yêu cầu còn ít nhất một ADMIN hoạt động khác. Với hai điều kiện trên thì người thực hiện luôn là ADMIN hoạt động, nên nhánh này là lớp phòng thủ thêm. Đạt.
- STAFF không khóa được ADMIN vì `mustManage` chặn. Guard chỉ bật khi ADMIN khóa.
- Race chéo khóa ‖ xóa (B khóa A, đồng thời A xóa B): tôi đã viết test hồi quy `tests/security/TASK-LOCK-ADMIN-RACE-bao-mat.test.js`, test đạt.
  - Cả hai đường đều khóa tập dòng ADMIN nên chạy tuần tự.
  - Nếu khóa chạy trước: B đã ghi AuditLog `USER_LOCK` nên FK `AuditLog.actorId` chặn xóa B (409).
  - Nếu xóa chạy trước: B không còn tồn tại nên lần khóa trả 403.

## Ghi chú (không chặn)
- `remove()` (`prismaRepo.js`, `adminsLeft`) đếm cả ADMIN đã bị khóa và không kiểm `isLocked` của người thực hiện. Race chéo hiện được chặn gián tiếp nhờ FK AuditLog: muốn khóa người khác thì phải ghi AuditLog, mà đã ghi AuditLog thì không xóa được. Nên làm `remove` chặt bằng `setLocked` (actor chưa khóa, đếm ADMIN hoạt động) để không phụ thuộc vào bất biến gián tiếp này. Test hồi quy ở trên sẽ báo nếu bất biến bị phá.
- `guardAdmins` bật cả khi ADMIN khóa SV/GV, vì trước khi khóa dòng chưa biết role đích. Mỗi lần khóa sẽ tạm chặn các thao tác `FOR SHARE` trên dòng ADMIN (ví dụ refresh của ADMIN). Transaction ngắn nên chấp nhận được.
- P2003 → 500: đồng ý giữ nguyên theo `tests/T206-errors.test.js:76-88`. Thông điệp cố định, không lộ chi tiết, dữ liệu đã rollback. P2003 cũng có thể đến từ id đầu vào sai ở nơi khác, nên ánh xạ chung sang 409 sẽ che lỗi kiểm tra đầu vào. Không cần đổi.
