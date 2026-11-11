# TASK-USER-DELETE – Quản trị viên xóa tài khoản

Yêu cầu người dùng (2026-11-11): quản trị viên thêm, sửa, xóa người dùng. Thêm/sửa đã có (T207a, T304); task này bổ sung **xóa**.

## Thiết kế
- `DELETE /api/users/:id` – chỉ ADMIN (route + service đều kiểm, FR25). Không tự xóa mình (403); id không có 404.
- Theo NFR05 (không xóa cứng dữ liệu nghiệp vụ): chỉ xóa được tài khoản **chưa phát sinh nghiệp vụ**. Một transaction: khóa dòng → ghi AuditLog `USER_DELETE` (before = hồ sơ) → xóa StaffScope, RefreshToken, Notification → xóa User.
  Nếu còn tham chiếu nghiệp vụ (FK RESTRICT, P2003) → rollback toàn bộ (cả AuditLog), trả 409 `IN_USE` gợi ý khóa tài khoản thay thế.
- AuditLog không có FK tới User nên dòng `USER_DELETE` vẫn còn sau khi xóa (FR15).
- Web: nút "Xóa" (chỉ ADMIN, không hiện khi xem chính mình) ở trang chi tiết tài khoản, hộp xác nhận, thành công thì về danh sách; lỗi 409 hiện trong hộp xác nhận.
- OpenAPI: thêm `DELETE /users/:id` quyền `A`.

## File
`apps/api/src/modules/accounts/{routes,service,prismaRepo}.js`, `apps/api/src/openapi/spec.js`, `apps/web/src/pages/admin/UserDetailPage.jsx`, test `apps/api/tests/T207a-accounts.test.js` (3 test mới), `apps/web/tests/admin.test.jsx` (1 test mới).

## Bằng chứng
```
npx vitest run tests/T207a-accounts.test.js   → Tests 29 passed (29)
npx vitest run tests/admin.test.jsx (web)     → Tests 21 passed (21)
npm run lint                                  → không lỗi
npm test                                      → 73 + 960 + 234 passed, 0 failed
```
