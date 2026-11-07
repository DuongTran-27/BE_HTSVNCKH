# BUG-013 – bao-mat v1

Kết luận: **APPROVED** (1 MINOR, không chặn)

## Lệnh tự chạy (2026-11-08)
- `npm run lint`: `eslint . --max-warnings 0`, sạch.
- `npm test`: shared 7 file 73/73 · api 62 file 928/928 · web 26 file 220/220. Khớp báo cáo.
- Đo thời gian `passwordHasher.verify` (script tạm trong scratchpad, không giữ lại; trung vị 60 lần, 2 lượt, máy dev):

| Ca đăng nhập | Lượt 1 | Lượt 2 |
|---|---|---|
| Tài khoản không tồn tại (hash giả đầy đủ) | 19,86 ms | 19,75 ms |
| Mật khẩu thường, sai | 19,78 ms | 19,85 ms |
| Mật khẩu tạm, sai | 22,04 ms | 22,28 ms |
| Mật khẩu tạm, đúng | 22,09 ms | 22,45 ms |

  Thêm: chuỗi hash nhẹ hỏng (`$argon2id$v=19$m=2048,t=2,p=1$AAAA$BBBB`) trả `false`, không ném lỗi.

## Quyết định theo câu hỏi
1. **Argon2id m=2048 KiB, t=2, p=1 cho mật khẩu tạm: chấp nhận.** `generateTempPassword` dùng `crypto.randomInt`, 14 ký tự trên bảng 56 ký tự, min-entropy ≥ 78 bit. Không có lối tắt từ điển, nên dò offline với hash nhẹ (~2 ms/lần) vẫn ngoài tầm (khoảng 2^77 lần thử). Argon2 chậm chỉ có ý nghĩa với mật khẩu entropy thấp do người chọn, và loại này vẫn băm đầy đủ. Mật khẩu tạm có `mustChangePassword: true` ở cả 4 chỗ sinh, và `requirePasswordChanged` (`middlewares/auth.js:26`) chặn route nghiệp vụ. Test integration BUG-013 xác nhận. **Không hạ m=1024 lúc này.** Mức đó vẫn an toàn về mật mã (cùng lập luận entropy), nhưng chỉ hạ khi T706 đo trên Render thật mà confirm 2.000 dòng sát mốc timeout. Không cần BM duyệt lại cho m=1024, t=2, p=1. Thấp hơn nữa thì vô nghĩa, vì phần còn lại là I/O.
2. **Bù thời gian trong `verify`: đúng, không lỗi cache.** Chỉ còn lệch nhỏ, xem MINOR 1.
   - Cache `pad`: promise bị reject thì `.catch` đặt `pad = undefined` trước khi lan lỗi. Lời gọi hiện tại nuốt lỗi bằng `.catch(() => false)`, nên không 500 và lần sau băm lại. Không lặp lỗi MINOR của T703a. `ok` được tính trước khi bù, nên kết quả bù không ảnh hưởng.
   - `needsRehash` ném lỗi với chuỗi hỏng thì bị bắt; `verify` vẫn trả `false`.
   - Hash giả của tài khoản không tồn tại (`auth/service.js:33`) gọi `hasher.hash` mặc định, tức tham số đầy đủ. Do đó nhánh này không kích hoạt bù và vẫn bằng thời gian mật khẩu thường (bảng trên).
   - Lần đầu tạo `pad` tốn thêm một lần hash đầy đủ, chỉ một lần mỗi tiến trình, không đáng kể.
3. **`bootstrapAdmin` dùng hash nhẹ: chấp nhận.** Cùng loại mật khẩu (`generateTempPassword`), cùng `mustChangePassword: true` (`bootstrapAdmin.js:23`). Admin không có quyền nghiệp vụ, và đổi mật khẩu lần đầu thì hash thành đầy đủ. Để chung một chính sách cho mọi mật khẩu tạm thì đơn giản hơn ngoại lệ.
4. **Không đường nào băm nhẹ mật khẩu do người dùng chọn: xác nhận.** `git grep` cho thấy `hash(…, { temporary: true })` chỉ có ở 4 chỗ, đều lấy từ `genPassword()`: `importService.js:149`, `service.js:92` và `:150`, `bootstrapAdmin.js:14`. `server.js` không truyền `genPassword`, nên production dùng mặc định `generateTempPassword`. `changePassword` (`auth/service.js:114`) gọi `hasher.hash(newPassword)`, mặc định đầy đủ. Test integration kiểm chuỗi `m=19456` sau khi đổi. `prisma/seed.js:214` (mật khẩu seed cố định, entropy thấp) vẫn đầy đủ, đúng như vậy. Ngoài ra không có route nào để người dùng tự đặt mật khẩu.

Timeout transaction `prismaRepo.js:64` (20 s): phần băm nằm ngoài transaction, nên giữ nguyên là hợp lý.

## MINOR (không chặn)
1. **Lệch thời gian còn lại khoảng 2,3 ms (~11 %).** Tài khoản còn mật khẩu tạm tốn verify nhẹ cộng verify đầy đủ (≈22 ms), so với ≈20 ms ở hai ca kia. Về lý thuyết, kẻ dò thấy được "tài khoản tồn tại và chưa đổi mật khẩu tạm".
   - Thực tế khó khai thác: mỗi IP bị limiter 20 lần/15 phút, mỗi tài khoản bị khóa tạm sau 5 lần sai, và 2 ms chìm trong jitter mạng.
   - Việc khóa tạm vốn đã lộ sự tồn tại của tài khoản (MINOR đã chấp nhận ở T703a).
   - Biết tài khoản còn mật khẩu tạm không giúp đoán mật khẩu 78 bit.
   - Cách sửa rẻ nếu muốn khít hơn: hash `pad` dùng `memoryCost = FULL_PARAMS.memoryCost - TEMP_PARAMS.memoryCost` (17408) thay vì đầy đủ. Thời gian Argon2 gần tuyến tính theo m, nên tổng ≈ một verify đầy đủ. Sửa vậy thì nên đổi ngưỡng test thời gian thành hai phía (ví dụ 0,8–1,2).
