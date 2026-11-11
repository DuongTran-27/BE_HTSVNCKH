# Review bảo mật TASK-USER-DELETE – v1

- Reviewer: bao-mat
- Commit: 6ebd0b4 (master)
- Phạm vi: `DELETE /api/users/:id` (apps/api/src/modules/accounts/{routes,service,prismaRepo}.js), nút Xóa (apps/web/src/pages/admin/UserDetailPage.jsx), test T207a.
- Đối chiếu: DAC_TA FR02, FR15 ("ghi ai… chỉ thêm, không sửa, không xóa"), FR25, NFR05 ("có khóa ngoại, không xóa cứng dữ liệu nghiệp vụ"); CLAUDE.md quy tắc 3, 4.

## Kết luận: CHANGES_REQUESTED

## Bằng chứng chạy lệnh
```
cd apps/api
npx vitest run tests/T207a-accounts.test.js
  -> Test Files 1 passed (1), Tests 29 passed (29)
npx vitest run tests/security/TASK-USER-DELETE-bao-mat.test.js
  × cán bộ đã có thao tác nghiệp vụ chỉ ghi AuditLog (tạo tài khoản) không được xóa cứng (FR15, NFR05)
      AssertionError: expected 204 to be 409
  × GV là người đích của yêu cầu thay đổi đang chờ: 409 IN_USE, không phải 500
      AssertionError: expected 500 to be 409
  × hai ADMIN xóa nhau đồng thời: hệ thống không được còn 0 ADMIN
      AssertionError: ["fulfilled","fulfilled"]: expected 0 to be greater than 0
  -> Tests 3 failed (3)
```
Lưu ý: chạy hai file cùng lệnh làm T207a lỗi giả, do cả hai cùng `resetData` trên một DB. Phải chạy riêng từng file.
Test tấn công được giữ lại: `apps/api/tests/security/TASK-USER-DELETE-bao-mat.test.js`. Test này sẽ pass khi sửa xong.

## MAJOR

### M1. Xóa cứng được tài khoản đã có thao tác nghiệp vụ chỉ ghi trong AuditLog, làm `actorId` mồ côi (FR15, NFR05)
- Vị trí: `apps/api/src/modules/accounts/prismaRepo.js:75-93` (`remove`), dựa vào FK để chặn. Nhưng `AuditLog.actorId` (`apps/api/prisma/schema.prisma:564`) **không có FK** tới User.
- Kịch bản: cán bộ khoa có nhiều thao tác chỉ để lại dấu vết trong AuditLog, không có FK tới User: tạo/nhập CSV tài khoản, khóa/mở khóa, reset mật khẩu, tạo/sửa đợt, danh mục. ADMIN xóa cán bộ đó → 204. Mọi dòng AuditLog của người này còn `actorId` trỏ tới user không tồn tại. Phần "ai" của FR15 chỉ còn truy được thủ công qua snapshot trong dòng `USER_DELETE`. Mã và email cũng được giải phóng cho tài khoản mới. Còn một biến thể có chủ đích: ADMIN tạo tài khoản STAFF và nhận mật khẩu tạm, đăng nhập bằng tài khoản đó để thao tác (tạo đợt, tạo/khóa tài khoản), rồi xóa tài khoản đó. Danh tính người thao tác gắn với tài khoản sẽ không còn.
- Đã tái hiện bằng test 1 (204 thay vì 409).
- Đề xuất: trong transaction, sau `FOR UPDATE`, nếu `auditLog.count({ where: { actorId: id } }) > 0` thì trả 409 `IN_USE`. Có thể bỏ qua các dòng sinh ra khi chính người đó đăng nhập hoặc đổi mật khẩu (nếu có), nhưng phải ghi rõ trong báo cáo. Một hướng khác là chỉ cho xóa khi không có dòng AuditLog nào có actorId = id. Cách này đơn giản và an toàn hơn.

## MINOR

### m1. User bị tham chiếu qua FK `ON DELETE SET NULL` của ChangeRequest trả 500 thay vì 409
- Vị trí: `apps/api/src/modules/accounts/prismaRepo.js:87-91`. Code chỉ bắt `P2003`. Trong `prisma/migrations/20261106000000_gd6_change_requests/migration.sql:25,28`, `ChangeRequest.decidedById` và `targetUserId` là `ON DELETE SET NULL`. Trigger `change_request_guard` (dòng 40-50) ném exception khi có thao tác SET NULL nên Prisma không trả mã P2003.
- Kịch bản: GV mới là người đích của yêu cầu đổi GVHD đang PENDING và chưa có dữ liệu nào khác. ADMIN xóa GV này → 500 `INTERNAL`. Transaction đã rollback nên dữ liệu không mất và stack trace không bị lộ, nhưng người dùng nhận lỗi hệ thống thay vì gợi ý khóa tài khoản. Trường hợp cán bộ đã quyết định một yêu cầu (`decidedById`) cũng như vậy. Việc chặn hiện chỉ đúng nhờ tình cờ có trigger: nếu sau này trigger nới lỏng, `SET NULL` sẽ âm thầm xóa dấu vết người quyết định hoặc người đích.
- Đã tái hiện bằng test 2.
- Đề xuất: trước khi xóa, kiểm tra tường minh `changeRequest.count({ where: { OR: [{ targetUserId: id }, { decidedById: id }] } })`, nếu > 0 thì trả 409. Không dựa vào lỗi trigger.

### m2. Race làm hệ thống còn 0 ADMIN
- Vị trí: `apps/api/src/modules/accounts/service.js:164-173` và `prismaRepo.js:78`. `notSelf` chỉ chặn tự xóa. Transaction chỉ khóa dòng bị xóa, không khóa và không kiểm lại dòng actor.
- Kịch bản: hệ thống có đúng 2 ADMIN là A và B, hai người bấm xóa nhau gần như cùng lúc. Cả hai request đều qua `requireAuth` trước khi bên kia commit. Mỗi transaction khóa một dòng khác nhau nên cả hai cùng commit, kết quả còn 0 ADMIN. `createFirstAdmin` và giao diện không cứu được; chỉ còn đường chạy CLI `create-admin` trên server.
- Đã tái hiện bằng test 3, gọi tầng service với actor đã nạp: `["fulfilled","fulfilled"]`, còn 0 ADMIN.
- Đề xuất: khi xóa ADMIN, trong transaction khóa mọi dòng ADMIN (`SELECT id FROM "User" WHERE role='ADMIN' ORDER BY id FOR UPDATE`), kiểm tra actor vẫn còn và số ADMIN chưa khóa sau khi xóa ≥ 1, nếu không thì trả 409. Cách tối thiểu hơn: khóa cả hai dòng actor và target theo thứ tự id, rồi kiểm tra actor còn tồn tại.

### m3. Không có rate limit cho DELETE (ghi chú, rủi ro thấp)
- `apps/api/src/modules/accounts/routes.js:64`. Các thao tác ghi khác (tạo, reset) dùng `writeLimiter`, còn DELETE thì không. Vì route chỉ dành cho ADMIN và chỉ xóa được tài khoản chưa có nghiệp vụ nên rủi ro thấp. Đề xuất gắn `writeLimiter` cho đồng bộ.

## Các mục đã kiểm, đạt
- Phân quyền: route `requireRole('ADMIN')` và service cũng kiểm `actor.role !== ADMIN`. STAFF, GV, SV đều nhận 403 (đã có test T207a). Id sai định dạng hoặc không tồn tại → 404. Việc quản lý tài khoản là quyền nền tảng của ADMIN, không vi phạm nguyên tắc "admin không có quyền nghiệp vụ".
- IDOR: không áp dụng, vì ADMIN quản mọi tài khoản và không có biến thể cho STAFF.
- Access token còn hạn của user đã xóa: `apps/api/src/middlewares/auth.js:12-13` nạp lại user ở mỗi request, `!user` → 401. Refresh token bị xóa trong cùng transaction.
- Race giữa xóa và lúc user đang được thêm vào đề tài: các INSERT có FK lấy `FOR KEY SHARE` trên dòng User, xung đột với `FOR UPDATE` của transaction xóa nên hai bên tuần tự hóa. Bên tới sau nhận P2003: phía xóa trả 409, phía nghiệp vụ nhận lỗi FK, không tạo ra bản ghi mồ côi.
- Các bảng nghiệp vụ còn lại (TopicMember, Invitation, AdvisorRequest, Advising, Submission, ReviewDecision, Milestone*, ProgressUpdate, Document, Feedback, ResultVersion, SimilarityBypass, StatusHistory, ChangeRequest.createdBy) đều có FK RESTRICT. User id trong payload JSON của ChangeRequest luôn kèm FK thật qua TopicMember hoặc Advising.
- Transaction và AuditLog: `USER_DELETE` được ghi trong cùng transaction và rollback khi gặp 409 (đã có test). `before` chỉ gồm code, role, email, fullName, classId, facultyId. `redact` lọc hash và token, không có `passwordHash`. Lưu dữ liệu cá nhân ở mức đủ để truy vết, phù hợp FR15.
- CSRF và cookie: DELETE xác thực bằng header Bearer với access token trong bộ nhớ, không dùng cookie nên không bị CSRF.
- Lỗi 500 trả thông điệp cố định kèm `requestId`, không lộ stack trace hay thông báo của trigger.
- Web: nút Xóa chỉ hiện với ADMIN và không hiện khi xem chính mình. Quyền vẫn được kiểm ở backend.
