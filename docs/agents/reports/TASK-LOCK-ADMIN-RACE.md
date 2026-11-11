# TASK-LOCK-ADMIN-RACE – Hai ADMIN khóa nhau cùng lúc

Nguồn: `reviews/TASK-USER-DELETE-bao-mat-v2.md` (ngoài phạm vi, đề nghị task riêng): `setLocked` chỉ khóa dòng bị khóa, không kiểm lại người thực hiện → hai ADMIN khóa nhau gần như cùng lúc thì không còn ADMIN hoạt động (chỉ khôi phục bằng CLI `create-admin` trên server).

## Làm gì
- `prismaRepo.updateLocked(id, compute, { guardAdmins })`: khi bật, khóa trước mọi dòng ADMIN theo thứ tự id (`FOR UPDATE`) rồi mới khóa dòng đích; truyền `{ admins: [{ id, isLocked }] }` vào compute. Các lời gọi cũ không đổi (mặc định tắt).
- `service.setLocked`: bật guard khi ADMIN khóa tài khoản; nếu đích là ADMIN: người thực hiện phải còn tồn tại và chưa bị khóa (không → 403), phải còn ít nhất một ADMIN hoạt động khác (không → 409 `LAST_ADMIN`). Mở khóa không bị chặn.
- Test mới `apps/api/tests/security/setLocked-admin-race.test.js`: (1) hai ADMIN khóa nhau đồng thời → còn ≥ 1 ADMIN hoạt động, đúng một bên thành công, bên kia 403; (2) ADMIN đã bị khóa không khóa được ADMIN khác, mở khóa vẫn được. Trượt 2/2 khi gỡ bản sửa, đạt 2/2 khi có.

## Không làm (ghi để reviewer quyết)
Ghi chú không chặn của bao-mat v3: lỗi P2003 (người thực hiện bị xóa khi request đang chạy) đang trả 500 `INTERNAL` (không lộ thông tin, đã rollback). Đổi sang 409 cần sửa `tests/T206-errors.test.js:82`, test này cố ý dùng P2003 làm ví dụ "lỗi Prisma khác → 500" – theo quy tắc 1 không tự đổi test đó; giữ nguyên hành vi.

## Bằng chứng
```
npx vitest run tests/security/setLocked-admin-race.test.js → 2 passed (gỡ bản sửa: 2 failed)
npx vitest run tests/T207a-accounts.test.js                → 29 passed
npm run lint                                               → không lỗi
npm test                                                   → 73 + 969 + 236 passed
```

## Sau review `reviews/TASK-LOCK-ADMIN-RACE-bao-mat-v1.md` (APPROVED)
Làm theo ghi chú 1 (không chặn): `remove()` chặt như `setLocked` – người thực hiện phải còn tồn tại **và chưa bị khóa** (không → 403), `adminsLeft` chỉ đếm ADMIN đang hoạt động khác đích. Trước đây race chéo "B khóa A ‖ A xóa B" chỉ được chặn gián tiếp nhờ FK AuditLog. Test mới trong `setLocked-admin-race.test.js` ("xóa: ADMIN đã bị khóa…") trượt khi gỡ bản sửa, đạt khi có. Giữ test hồi quy của bao-mat `tests/security/TASK-LOCK-ADMIN-RACE-bao-mat.test.js`.
```
setLocked-admin-race 3/3 · TASK-LOCK-ADMIN-RACE-bao-mat 1/1 · TASK-USER-DELETE-bao-mat 3/3 · …-v2 1/1 · T207a 29/29
npm run lint → không lỗi; npm test → 73 + 971 + 236 passed
```
