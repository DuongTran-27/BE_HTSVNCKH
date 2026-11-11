# Review bảo mật TASK-USER-DELETE – v2

- Reviewer: bao-mat
- Commit: 0b2a119 (sửa theo v1)
- Phạm vi: `apps/api/src/modules/accounts/{prismaRepo,service,routes}.js`

## Kết luận: CHANGES_REQUESTED (chỉ còn 1 MINOR, sửa nhỏ)

## Bằng chứng chạy lệnh (mỗi file một lệnh, không chạy song song)
```
cd apps/api
npx vitest run tests/security/TASK-USER-DELETE-bao-mat.test.js     -> Tests 3 passed (3)
npx vitest run tests/T207a-accounts.test.js                         -> Tests 29 passed (29)
npx vitest run tests/security/TASK-USER-DELETE-bao-mat-v2.test.js  -> Tests 1 failed (1)
   AssertionError: expected 1 to be +0   (AuditLog mồ côi actorId)
```
Assertion trong test v1 không bị sửa (đã đối chiếu: 409, 409, số ADMIN > 0).

## Mục v1 – đã đóng
- M1: `prismaRepo.js:88` chặn khi user là `actorId` của bất kỳ AuditLog → 409 IN_USE. Đạt.
- m1: `prismaRepo.js:89` kiểm `targetUserId`/`decidedById` tường minh → 409, không còn 500. Đạt.
- m2: `prismaRepo.js:81` khóa mọi dòng ADMIN theo `ORDER BY id FOR UPDATE` trước dòng đích. Thứ tự khóa nhất quán nên không deadlock giữa hai lần xóa. `service.js:167` kiểm lại actor (403) và `adminsLeft` (LAST_ADMIN 409). Đạt. Vì actor là ADMIN nằm trong tập dòng đã khóa và không được tự xóa, nhánh LAST_ADMIN chỉ là lớp phòng thủ thêm.
- m3: `routes.js:64` gắn `writeLimiter` trước `requireRole`, giống tạo/reset. Đạt.

## MINOR

### m4. TOCTOU còn lại: thao tác chỉ ghi AuditLog của người đang bị xóa vẫn commit sau khi xóa → `actorId` mồ côi (FR15)
- Vị trí: kiểm tra ở `prismaRepo.js:88` là đọc rồi mới quyết định. `AuditLog.actorId` (`apps/api/prisma/schema.prisma:564`) không có FK, nên khi INSERT AuditLog không lấy `FOR KEY SHARE` trên dòng User của actor và không bị transaction xóa chặn.
- Kịch bản: cán bộ gửi `POST /api/users` (hoặc khóa tài khoản, sửa đợt, sửa danh mục...) và request đã qua `requireAuth`. Ngay lúc đó ADMIN xóa cán bộ này: transaction xóa không thấy AuditLog nào nên commit 204. Sau đó transaction của cán bộ commit, tạo tài khoản mới kèm AuditLog có `actorId` trỏ tới user đã xóa. Kết quả đúng là trường hợp M1 định chặn. Các bảng có FK (TopicMember, Submission...) không bị lỗi này vì INSERT bị P2003.
- Tái hiện: `apps/api/tests/security/TASK-USER-DELETE-bao-mat-v2.test.js` gọi tầng service với actor đã nạp, tương đương thứ tự xấu nhất của hai request song song. Hiện test đang fail.
- Mức độ: cửa sổ race chỉ vài ms. Danh tính vẫn truy được qua snapshot `USER_DELETE` (entityId = actorId cũ). Không có leo thang quyền. Vì vậy xếp MINOR, không phải BLOCKER.
- Đề xuất sửa tối thiểu: migration thêm FK `AuditLog.actorId → User.id ON DELETE RESTRICT`. Cột này nullable nên các dòng bootstrap/hệ thống có `actorId = null` vẫn hợp lệ. Khi đó INSERT AuditLog lấy `FOR KEY SHARE` trên dòng actor, xung đột với `FOR UPDATE` của transaction xóa:
  - Nếu xóa trước, INSERT bị P2003 và thao tác rollback.
  - Nếu INSERT trước, xóa bị P2003 và trả 409.
  - Kiểm tra `findFirst` ở dòng 88 có thể giữ lại, nhưng không còn bắt buộc.

  Lưu ý cho migration: trước khi thêm FK phải kiểm tra DB thật không có dòng mồ côi (`SELECT ... WHERE "actorId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "User" ...)`), nếu không migration sẽ fail. AuditLog chỉ thêm (trigger) nên RESTRICT không đụng tới quy tắc "không sửa/không xóa".

## Ghi chú ngoài phạm vi (không chặn task này)
- `setLocked` có lớp race tương tự m2 (hai ADMIN khóa nhau cùng lúc → không còn ADMIN đang hoạt động). Lỗi này có từ trước TASK-USER-DELETE; nên mở task riêng.
- Khóa mọi dòng ADMIN sẽ chặn trong chốc lát các thao tác `FOR SHARE` trên dòng ADMIN, ví dụ refresh của ADMIN. Transaction ngắn nên chấp nhận được.
