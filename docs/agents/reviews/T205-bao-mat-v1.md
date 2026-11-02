# Review T205 – bao-mat – vòng 1
Kết luận: APPROVED

## Tôi đã tự kiểm tra
- Đã đọc: `CLAUDE.md`, `docs/agents/QUY_TRINH.md`, `reports/T205.md`, `reviews/BUG-002-bao-mat-v1.md`, `reviews/BUG-002-reviewer-v1.md`, `git diff` của `modules/auth/service.js` và `modules/auth/prismaRepo.js`, `modules/auth/routes.js`, `middlewares/auth.js`, `tests/T205-auth-db.test.js`. Không đọc `.env`.
- `npm run db:test:up` → `Kiểm tra DB test: tất cả OK.`; `npm run db:test:reset` → `Đã reset DB test (migrate reset).`
- `npx vitest run tests/T205-auth-db.test.js` → `Tests 13 passed (13)`.
- `npm run lint` → exit 0.
- `NO_COLOR=1 npm test` → shared 21/21, web 32/32. api: `2 failed | 157 passed | 1 expected fail (160)`. Hai test hỏng là TC-NFR08-04/05 trong `T201-qa-guard-bypass.test.js`, cả hai hết giờ chờ 10 s (DB test dùng chung với reviewer khác). Chạy lại riêng file đó → `4 passed (4)`. Chạy lại `tests/T205-auth-db.test.js tests/security` → `66 passed | 1 expected fail (67)`. "Expected fail" là test mới của tôi (xem mục 1 bên dưới).
- Test tấn công mới: `apps/api/tests/security/T205-bao-mat.test.js`. Khi chạy với `it` thay cho `it.fails`, test đỏ: `expected [ Array(1) ] to deeply equal []`, kèm `tokenHash` = sha256('M') (đã kiểm bằng `node -e`). Nghĩa là token M vẫn sống sau khi logout trả về. Tôi giữ test ở dạng `it.fails` để `npm test` vẫn xanh. Khi lỗ được vá, test sẽ đỏ và buộc phải đổi lại thành `it`.

## Lập luận snapshot (trọng tâm)
Với **một** refresh chen vào, lập luận trong báo cáo đúng ở READ COMMITTED. Refresh gồm INSERT N (autocommit) rồi CAS O (autocommit). UPDATE #1 của logout chỉ có ba khả năng:
- (a) Lấy snapshot sau khi CAS commit, nên thấy N.
- (b) Khóa O trước CAS. Khi đó CAS trả `false`, refresh thu hồi cả họ, và lệnh thu hồi của refresh bắt đầu sau khi #1 commit nên thấy N.
- (c) Có snapshot cũ nhưng gặp O khi O đã bị CAS (phải chờ khóa hoặc gặp phiên bản mới, rồi EvalPlanQual bỏ qua O). Ở trường hợp này #1 chỉ kết thúc sau khi CAS commit. UPDATE #2 bắt đầu sau #1, nên snapshot của #2 thấy N.

Cả ba nhánh đều kín. Test tất định của dev (giữ khóa O, chờ `pg_stat_activity`) và đối chứng "bỏ lệnh thứ hai thì đỏ" chứng minh đúng nhánh (c). Repo giả trong bộ nhớ không bị ảnh hưởng.

Lập luận chỉ hở khi có **hai lần xoay nối tiếp** trong lúc logout chạy (mục 1). Câu trong báo cáo "lệnh thứ hai … chắc chắn thấy N" đúng với N, nhưng #2 cũng có thể bỏ sót M theo đúng cơ chế mà #1 bỏ sót N. Gọi n lần chỉ chặn được n−1 lần xoay. `FOR UPDATE` trên O cũng không chặn được, vì khe ở N chứ không ở O.

## Các điểm khác
- Tái sử dụng token: CAS `updateMany … revokedAt: null` trả `count === 1`. Gọi lần hai trả `false` và không ghi đè `replacedBy` (test DB). Dùng lại token cũ thì thu hồi cả họ (test DB). Đạt.
- Khóa tài khoản: `requireAuth` nạp lại user ở mỗi request và chặn khi `isLocked`. Refresh bị chặn và thu hồi cả họ. Login trả 403 `ACCOUNT_LOCKED`. Cả ba có test DB. Đạt.
- Lộ dữ liệu (`staffScopes`): repo nạp kèm `staffScopes { facultyId }`, nhưng mọi response (`login`/`refresh` qua `issueTokens`, `/me` qua `requireAuth`) đều đi qua `publicUser`. Hàm này liệt kê trường cho phép nên không trả ra `passwordHash`, `staffScopes`, `failedLogins` hay `lockedUntil`. `select` chỉ lấy `facultyId`. Không lộ dữ liệu.
- `logout` thêm `if (!record) return`: cùng hành vi cũ (204, không lộ token có tồn tại hay không).

## Đối chiếu đặc tả
| Điều kiện đạt | Đạt? | Ghi chú |
|---|---|---|
| FR01: access ≤ 15 phút, refresh lưu bản băm, đăng nhập mã/email | Đạt | test DB |
| FR01: tạm khóa sau 5 lần sai, thông báo chung | Đạt | test DB |
| FR01: tài khoản khóa bị từ chối ngay | Đạt | test DB (access, refresh, login) |
| FR01: xoay vòng + phát hiện dùng lại thu hồi họ | Đạt | test DB |
| Reviewer MINOR 1 (BUG-002): `revokeToken` lần hai `false`; logout bằng token đã xoay thu hồi token mới nhất | Đạt | test DB |
| Bao-mat MINOR 1 (BUG-002): khe logout ‖ refresh trên Postgres, có integration test | Đạt (một lần xoay) | còn khe khi có hai lần xoay nối tiếp, xem mục 1 |
| Bao-mat MINOR 2 (BUG-002): logout lặp → 204 rỗng | Đạt | test DB |

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| 1 | MINOR | `apps/api/src/modules/auth/service.js:75-80`; báo cáo mục "Quyết định thiết kế" | Gọi `revokeFamily` hai lần chỉ chặn được một lần xoay chen vào. Kịch bản: #1 có snapshot không thấy N, rồi bỏ qua O vì refresh A đã CAS O. Trong lúc #1 chưa xong, refresh B (đã nhận N) tạo M và giữ khóa N. #2 có snapshot thấy N nhưng không thấy M, chờ khóa N, rồi EvalPlanQual bỏ qua N. Kết quả: M còn sống sau khi logout trả 204. Đã chứng minh tất định trong `tests/security/T205-bao-mat.test.js`. Test dùng một dòng sống X bị khóa để làm chậm #1; ngoài đời, độ chậm này phải đến từ tải DB hoặc lập lịch. Tôi không chặn vì không khai thác được trong thực tế: #2 phải đứng giữa chừng lâu hơn một round-trip INSERT M → CAS N của B, trong khi B chỉ bắt đầu sau khi client nhận được N qua HTTP. Mức rủi ro bằng khe gốc của BUG-002 (MINOR). Task làm đúng phương án đã được đề xuất. | Nếu muốn đóng triệt để: trong một `$transaction`, cả `refresh` (bọc INSERT N + CAS) và `logout` cùng lấy `pg_advisory_xact_lock(hashtext(family))` trước khi thao tác. Như vậy mọi thao tác trên cùng họ chạy tuần tự. Sửa xong thì đổi `it.fails` thành `it` trong `tests/security/T205-bao-mat.test.js`. Ít nhất nên sửa câu "chắc chắn" trong báo cáo thành "đủ cho một lần xoay chen vào". Có thể để task sau (ví dụ T206). |
| 2 | MINOR | `apps/api/tests/T205-auth-db.test.js:172-176` (`lockWaiters`) | `lockWaiters` đếm **mọi** phiên đang chờ khóa trên DB. Khi reviewer hoặc agent khác chạy test trên cùng `nckh_test`, một phiên lạ cũng làm `blocked === true`, nên test không còn chứng minh được thứ tự xen kẽ. `fileParallelism: false` chỉ có tác dụng trong một tiến trình vitest. | Lọc theo câu lệnh, ví dụ `AND query ILIKE 'UPDATE%RefreshToken%' AND query ILIKE '%family%'`, như `waitLogoutBlocked` trong `tests/security/T205-bao-mat.test.js`. |

Kết luận: APPROVED – BLOCKER 0, MAJOR 0, MINOR 2
