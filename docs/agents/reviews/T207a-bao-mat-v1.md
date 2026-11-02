# Review T207a – bao-mat – vòng 1
Kết luận: CHANGES_REQUESTED

## Tôi đã tự kiểm tra
- Đã đọc: `reports/T207a.md`, API_GD2 §3.2 (dòng 188–210), `git diff` (`auth/service.js`, `auth/prismaRepo.js`, `app.js`, `server.js`, `tests/T205-auth-db.test.js`, `tests/security/T205-bao-mat.test.js`, `tests/helpers.js`), `modules/accounts/{service,prismaRepo,routes,bootstrapAdmin}.js`, `scripts/create-admin.js`, `lib/tempPassword.js`, `packages/shared/src/users.js`, `lib/router.js`, `middlewares/auth.js`. Không đọc `.env`.
- `npm run db:test:up` → `DB test đã chạy.`; `npm run db:test:reset` → `Đã reset DB test (migrate reset).`
- `npm run lint` → exit 0.
- `NO_COLOR=1 npm test` → shared `47 passed (47)`; api `25 passed (25)`, `244 passed | 1 expected fail (245)`; web `75 passed (75)`; EXIT=0. "Expected fail" là test mới của tôi ở mục 1.
- Test tấn công mới `apps/api/tests/security/T207a-bao-mat.test.js`. Test chạy code thật, chỉ chèn một điểm dừng ngay sau thân hàm trong `withFamilyLock` (sau CAS, trước COMMIT). Khi chạy ở dạng `it`, test đỏ với `AssertionError: expected 1 to be +0`. Kiểm tra `blocked === true` trước đó vẫn đạt, nghĩa là UPDATE thu hồi của reset đúng là đã đứng chờ khóa dòng O. Tôi giữ test ở dạng `it.fails`.

## Bốn test T205 bị sửa (quy tắc 1)
Kết luận: **hợp lệ, không làm yếu.**
- `tests/security/T205-bao-mat.test.js`: refresh B trước đây là transaction thô, nay đi qua `svc.refresh` thật. Transaction thô vượt qua khóa họ, mà khóa họ chính là cơ chế đang được kiểm, nên giữ transaction thô thì test không còn mô phỏng ứng dụng. Khẳng định cuối `live == []` vẫn giữ. Test thêm `refreshB === 401` và hai điểm chờ lọc theo câu lệnh. Chạy với code T205 cũ (không có khóa tư vấn), test đỏ ngay ở `waitBlocked(ADVISORY)`, nên test vẫn bắt được hồi quy. Ca O→N→M vẫn được phủ: B đến khi logout đang giữ khóa và nhận 401.
- `T205-auth-db` "logout chờ khóa họ…": transaction giữ chỗ nay lấy khóa tư vấn như refresh thật, `lockWaiters` lọc theo câu `pg_advisory_xact_lock`. Đúng với MINOR 2 của tôi; vẫn khẳng định `liveCount == 0`.
- `it.each(beforeCreate/beforeRotate)`: đổi kỳ vọng từ 401 sang `'ok'` là đúng. Dưới khóa họ, logout chỉ chạy sau khi refresh đã xong, nên refresh thành công là hành vi đúng. Khẳng định "không còn token sống" vẫn giữ.
- `tests/helpers.js`: `withFamilyLock` của repo bộ nhớ chạy thẳng `fn(repo)`. Repo này chạy một luồng nên cách làm đúng; giữ như vậy để service không có nhánh chỉ phục vụ test.

## Đối chiếu đặc tả
| Điều kiện đạt | Đạt? | Ghi chú |
|---|---|---|
| §3.2 reset/lock "thu hồi mọi refresh token" | **Không đủ khi có refresh đồng thời** | Mục 1 |
| Khe O→N→M (MINOR T205) | Đạt | Khóa họ tuần tự hóa refresh và logout; lập luận đúng |
| Mật khẩu tạm | Đạt | `randomInt`, 14 ký tự trên bảng 56 ký tự ≈ 81 bit; chỉ lưu hash; `no-store`; không có trong AuditLog (`after` chỉ có `mustChangePassword`); pino-http không log body |
| Phạm vi cán bộ | Đạt | STAFF chỉ thao tác LECTURER/STUDENT trong `staffFacultyIds`; không đổi được `facultyId`; `staff-scopes` chỉ ADMIN; lọc `facultyId` ngoài phạm vi trả 403; trả 404 trước 403 |
| Admin không quyền nghiệp vụ | Đạt | `/api/users` là quyền nền tảng; không có endpoint đổi role |
| CLI admin | Đạt | Không nhận mật khẩu qua tham số/env; in một lần ra stdout; khóa tư vấn + kiểm `count(ADMIN)` trong cùng transaction; `--force` chỉ người có `DATABASE_URL` dùng được |
| Đầu vào | Đạt | Zod cho body/query; `$queryRaw` dùng tham số ràng buộc và escape `%_\`; `idSchema` cho `:id` |

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| 1 | MAJOR | `apps/api/src/modules/accounts/prismaRepo.js` (`updateLocked`, `revokeTokens`); báo cáo "Quyết định thiết kế" mục 8 | Câu "refresh xen vào vẫn an toàn nhờ CAS" sai ở READ COMMITTED. Refresh chạy trong khóa họ: INSERT N và CAS O cùng commit ở cuối transaction. Reset lấy khóa dòng User (`FOR NO KEY UPDATE`), nhưng refresh chỉ giữ `FOR KEY SHARE` (khóa của khóa ngoại khi INSERT N), hai khóa này không xung đột nên không bên nào phải chờ. Thứ tự lỗi: UPDATE `refreshToken … userId` của reset lấy snapshot (chưa thấy N), chờ khóa dòng O, refresh commit, EvalPlanQual bỏ qua O, N không nằm trong snapshot. Kết quả: N sống sót và reset vi phạm §3.2. Đã chứng minh trong `tests/security/T207a-bao-mat.test.js`. Kẻ giữ phiên chỉ cần gọi refresh liên tục, mỗi lần O bị khóa trong khoảng CAS→COMMIT. Thiệt hại có giới hạn: `mustChangePassword` chặn route nghiệp vụ, còn lock thì `isLocked` chặn refresh và `requireAuth`. Nhưng phiên vẫn sống, và nếu kẻ giữ phiên thắng thêm cuộc đua ở `changePassword` (cùng mẫu: `updateUser` + `revokeAllForUser` không có transaction, code T205) thì lấy lại toàn quyền khi người dùng đổi mật khẩu. Login bằng mật khẩu cũ chạy đồng thời với reset cũng có khe tương tự: đọc user, băm Argon2 khoảng 100 ms, rồi tạo token sau khi reset commit. `loginLimiter` không đếm lần đăng nhập thành công. | Khóa dòng User ở phía cấp token: trong `withFamilyLock` của refresh, đọc user bằng `SELECT … FOR SHARE` (xung đột với `FOR NO KEY UPDATE` của reset/lock). Login cũng tạo token trong transaction có `FOR SHARE`, và kiểm lại `passwordHash`/`isLocked` không đổi so với lúc verify. `changePassword` cập nhật + thu hồi trong một transaction có khóa dòng User. Xong thì đổi `it.fails` thành `it` trong `tests/security/T207a-bao-mat.test.js` và sửa mục 8 của báo cáo. |
| 2 | MINOR | `accounts/prismaRepo.js` (`create`), `bootstrapAdmin.js` | Kiểm trùng mã không phân biệt hoa/thường chỉ là `findFirst` trong transaction, nên hai lệnh tạo đồng thời `sv1`/`SV1` đều lọt (báo cáo đã nêu). CLI thì không kiểm mục này. Hậu quả: `login` `findFirst` trả về một trong hai bản ghi, người còn lại không đăng nhập được bằng mã (DoS, không chiếm được tài khoản vì vẫn phải đúng mật khẩu). T207b (nhập CSV hàng loạt) sẽ làm rủi ro tăng. | Thêm unique index trên `lower(code)` (SQL thô, migration) trước hoặc trong T207b. |
| 3 | MINOR | `auth/service.js` (`refresh`) | Mỗi refresh mở một interactive transaction và giữ một connection trong lúc chờ khóa họ. Ai có một token bất kỳ còn trong DB (kể cả token đã thu hồi, vì bước tra đầu tiên nằm ngoài khóa) có thể bắn nhiều refresh đồng thời vào cùng một họ để chiếm pool, làm cả API phải chờ. Refresh chưa có limiter. | Thêm limiter theo IP cho `/api/auth/refresh`, hoặc đặt `lock_timeout` ngắn (theo `withLockTx` §1.8) trước khi gọi `pg_advisory_xact_lock`. |

Kết luận: CHANGES_REQUESTED – BLOCKER 0, MAJOR 1, MINOR 2
