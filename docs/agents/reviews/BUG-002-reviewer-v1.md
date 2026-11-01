# Review BUG-002 – reviewer – vòng 1
Kết luận: APPROVED

## Tôi đã tự kiểm tra
- File đã đọc: `reports/BUG-002.md`, `reviews/T301-bao-mat-v1.md` (nguồn lỗi), `DAC_TA.md` FR01, `apps/api/src/modules/auth/service.js` (toàn file), `prismaRepo.js`, `tests/helpers.js`, `tests/security/BUG-002.test.js`, `apps/web/src/lib/api.js` (phần refresh, để xét tác động của việc hai refresh đồng thời bị coi là dùng lại token).
- `git diff` phạm vi BUG-002 gồm `service.js` (refresh + logout), `prismaRepo.js` (`revokeToken`), `tests/helpers.js` (repo giả) và test mới. Không có test nào bị xóa, skip hay nới assertion. Phần sửa `helpers.js` chỉ đổi repo giả theo hợp đồng CAS mới.
- `npm test` (gốc): shared `21 passed`, api `Test Files 11 passed (11) / Tests 102 passed (102)`, web `6 passed / 30 passed`, EXIT=0. Kết quả api khớp báo cáo. Ở web, báo cáo ghi 1 test đỏ (`logout-race`, thuộc T301), còn lần tôi chạy thì xanh hết. Lý do là agent khác đang sửa `apps/web`, nằm ngoài phạm vi BUG-002, nên không tính là lệch bằng chứng.
- `npm run lint`: `'eslint' is not recognized…`, EXIT=1, khớp báo cáo. Lỗi này có từ trước vì repo chưa có ESLint (T202 đang TODO). Tôi xử lý giống tiền lệ BUG-001 và T215: không tính cho task này.
- Kiểm tra logic race bằng tay (Postgres READ COMMITTED, Prisma autocommit từng lệnh). Trong refresh, thứ tự là `create T2` → `CAS T1 (revokedAt IS NULL)`. Lệnh `revokeFamily` của logout có thể rơi vào một trong ba vị trí:
  (a) trước khi tạo T2: CAS thất bại, refresh tự `revokeFamily` nên T2 chết;
  (b) giữa lúc tạo T2 và CAS: T2 đã commit nên bị thu hồi luôn, sau đó CAS thất bại;
  (c) sau CAS: T2 đã commit và vẫn thuộc cùng family nên bị thu hồi.
  Không trường hợp nào để lại token sống. Ba trường hợp này lần lượt được phủ bởi `beforeCreate`, `beforeRotate` và test "thứ tự ngược".
- Hai refresh đồng thời cùng một cookie giờ sẽ thu hồi cả họ phiên. Phía client đã tuần tự hóa refresh trong cùng tab (`refreshPromise`) và giữa các tab (`navigator.locks` 'nckh-refresh', `apps/web/src/lib/api.js:107-119`). API_GD2 §1.1 cũng đã ghi hành vi này. Tôi chấp nhận, không cần thêm khoảng ân hạn (trả lời câu hỏi 1 của báo cáo).

## Đối chiếu đặc tả
| Điều kiện đạt | Đạt? | Ghi chú |
|---|---|---|
| FR01 – Logout thu hồi phiên hiện tại, kể cả khi cookie gửi lên đã bị xoay | Đạt | `service.js:76` thu hồi họ bất kể `revokedAt`. Test HTTP "logout bằng cookie cũ (đã xoay)" kiểm cả `live(repo) = 0` và refresh bằng c2 → 401 |
| Refresh chạy song song với logout không hồi sinh phiên | Đạt | `service.js:64-68` dùng CAS sau khi tạo token mới. Test `it.each(beforeCreate, beforeRotate)` kiểm hook thực sự chạy (`fired`), refresh trả 401 và không còn token sống |
| Logout không lộ thông tin, token lạ hoặc thiếu cookie vẫn 204 | Đạt | Body rỗng, không ảnh hưởng phiên khác (có test) |
| FR01 hiện có (xoay vòng, phát hiện dùng lại, đổi mật khẩu) không hỏng | Đạt | `tests/auth.test.js` không đổi và vẫn xanh |
| `revokeToken` thật (Prisma) là CAS | Đạt (đọc code) | `updateMany where {id, revokedAt:null}` rồi so `.count === 1`. Chưa có test chạy trên Prisma/DB (xem MINOR #1) |

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| 1 | MINOR | `apps/api/src/modules/auth/prismaRepo.js:8-9` | Toàn bộ việc chặn race dựa vào việc `revokeToken` trả `false` khi không cập nhật được dòng nào, nhưng bản Prisma thật chưa có test nào. Test hiện có chỉ chạy trên repo giả, nên nếu sau này có người đổi lại thành `update` hoặc bỏ `revokedAt: null` thì không test nào đỏ. | Thêm vào phạm vi T205 hai ca integration: (1) `revokeToken` gọi lần hai trên cùng id trả `false`; (2) logout bằng token đã xoay trên DB thật làm token mới nhất có `revokedAt` khác null. Tôi đề nghị ghi chú việc này vào dòng T205 trong bảng việc. |
| 2 | NIT | (chung) | `npm run lint` chưa chạy được vì repo chưa có ESLint. | T202 sẽ xử lý (trả lời câu hỏi 2 của báo cáo). Khi T202 xong thì chạy lại lint cho `modules/auth`. |
| 3 | NIT | `apps/api/src/modules/auth/service.js:64-68` | Khi CAS thất bại, access token vừa ký không được trả về nên không lộ, và refresh token vừa tạo đã bị thu hồi. Bản ghi T2 vẫn nằm lại trong bảng dưới dạng rác đã thu hồi. Không ảnh hưởng đến tính đúng. | Không cần sửa. Job dọn token hết hạn sau này sẽ gom luôn các bản ghi này. |

Kết luận APPROVED – BLOCKER 0, MAJOR 0, MINOR 1 (cộng 2 NIT).
