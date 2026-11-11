# Review bảo mật TASK-USER-DELETE – v3

- Reviewer: bao-mat
- Commit: f6eb907 (sửa m4 của v2)
- Phạm vi: `apps/api/prisma/migrations/20261111000000_audit_actor_fk/migration.sql`, `apps/api/prisma/schema.prisma` (quan hệ `AuditActor`)

## Kết luận: APPROVED

## Bằng chứng chạy lệnh (mỗi file một lệnh, không chạy song song)
```
cd apps/api
npx vitest run tests/security/TASK-USER-DELETE-bao-mat-v2.test.js  -> Tests 1 passed (1)
npx vitest run tests/security/TASK-USER-DELETE-bao-mat.test.js     -> Tests 3 passed (3)
npx vitest run tests/T207a-accounts.test.js                         -> Tests 29 passed (29)
npx vitest run tests/T204-audit.test.js                             -> Tests 18 passed (18)
```
Assertion của test v2 giữ nguyên (`expect(orphan).toBe(0)`).

## m4 – đã đóng
- FK `AuditLog.actorId → User.id ON DELETE RESTRICT`. Khi INSERT AuditLog, Postgres lấy `FOR KEY SHARE` trên dòng actor. Khóa này xung đột với `FOR UPDATE` của transaction xóa (`prismaRepo.js:82`), nên hai thao tác chạy tuần tự:
  - Nếu xóa chạy trước, việc ghi AuditLog của request đang dở bị P2003 và thao tác rollback.
  - Nếu ghi AuditLog chạy trước, việc xóa bị P2003 và trả 409 `IN_USE`.
- Cột nullable nên các dòng ghi với `actorId: null` (`bootstrapAdmin.js:28`, `similarity/prismaRepo.js:71`) vẫn hợp lệ.
- Migration có khối `DO` dừng rõ ràng khi có dòng mồ côi và không tự sửa lịch sử chỉ-thêm (FR15). Cách này đúng.
- `ON UPDATE CASCADE` không gây xung đột trong thực tế vì `User.id` (cuid) không bao giờ đổi. Nếu có đổi thì trigger chỉ-thêm của AuditLog sẽ chặn, không âm thầm sửa lịch sử.
- Không thêm bảng mới nên RLS không cần bổ sung.

## Ghi chú (không chặn)
- Request đang dở của người vừa bị xóa nhận P2003 từ AuditLog. `errorHandler` không ánh xạ P2003 nên trả 500 `INTERNAL`: thông điệp cố định, không lộ stack trace, dữ liệu đã rollback. Trường hợp rất hiếm nên chấp nhận được. Có thể ánh xạ sang 401 hoặc 409 sau này.
- Mọi thao tác có ghi AuditLog giờ lấy `FOR KEY SHARE` trên dòng actor, nên phải chờ ngắn khi có transaction `FOR UPDATE` trên chính dòng đó (khóa/reset/xóa actor). Transaction ngắn, toàn bộ test (theo báo cáo: `npm test` và E2E 74/74) không ghi nhận deadlock.
- Race `setLocked` (hai ADMIN khóa nhau) đã được ghi vào báo cáo task, đề nghị mở task riêng. Đồng ý.
