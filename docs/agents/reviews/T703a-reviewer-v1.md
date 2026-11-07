# T703 bước A – reviewer v1

Kết luận: **APPROVED**

## Lệnh tự chạy (2026-11-08)
- `npm run lint`: sạch.
- `npm test`: api 59 file, 886/886; web 219/219 (shared đã xanh ở báo cáo). Khớp báo cáo.

## Xác nhận các điểm yêu cầu
1. `tests/T701-openapi.test.js`: diff chỉ 2 dòng `build(testEnv)` thành `build({ ...testEnv, ENABLE_SWAGGER: true })`; assert không đổi, không skip. Đúng, chỉ chỉnh cấu hình cho cờ mới.
2. AuditLog: DAC_TA FR15 chỉ yêu cầu ghi lịch sử, chỉ thêm, không sửa/xóa; không yêu cầu route đọc. Đóng mục là đúng. Lịch sử xem được qua status-history có guard.
3. `/notifications*` sang `'U'`: khớp `design/API_GD45.md` §8.1 và comment `notifications/routes.js:10` (mọi vai trò đã đăng nhập, chỉ thấy của mình). Bảng ROUTES trước đó sai, code đúng.
4. Login hash giả: `hasher.hash(newOpaqueToken())` cùng tham số Argon2id, cache promise; cùng thông báo 401 chung, hành vi nhìn ngoài không đổi. DRAIN_MAX_BYTES = 16 MB lớn hơn file hợp lệ tối đa 10 MB (`UPLOAD_HARD_MAX_BYTES`, `USER_IMPORT_MAX_BYTES`), nên không quay lại BUG-008; `req.off('data', onData)` thay `removeAllListeners`; vẫn có timeout.
5. x-request-id `^[\w-]{1,64}$`, Swagger pin 5.34.1 + SRI + ENABLE_SWAGGER (production vẫn luôn tắt), test ROUTES-guard 151 ca xanh: đạt.

## MINOR (không chặn)
- `auth/service.js` `dummyHash ??= hasher.hash(...)`: nếu lần băm đầu bị reject thì promise lỗi bị cache vĩnh viễn, mọi login tài khoản không tồn tại sau đó 500. Nên xóa cache khi lỗi (`.catch`). Xác suất thấp.
- Nhánh khóa tài khoản (403/429) trả trước verify: báo cáo đã ghi nhận, chấp nhận theo FR01.
- Chưa kiểm hash SRI trực tiếp với CDN (không có mạng/không bắt buộc); dựa vào báo cáo.
