# Review BUG-002 – bao-mat – vòng 1
Kết luận: APPROVED

## Tôi đã tự kiểm tra
- Đọc: `CLAUDE.md`, `reports/BUG-002.md`, `reviews/T301-bao-mat-v1.md` (nguồn lỗi), `apps/api/src/modules/auth/{service,prismaRepo,routes}.js`, diff `apps/api/tests/helpers.js`, `apps/api/tests/security/BUG-002.test.js`, `apps/web/src/lib/api.js` (điều phối refresh giữa các tab). Không đọc `.env`.
- `npm test` (gốc), tự chạy:
  ```
  @nckh/shared  Test Files 2 passed (2)   Tests 21 passed (21)
  @nckh/api     Test Files 11 passed (11) Tests 102 passed (102)
  @nckh/web     Test Files 6 passed (6)   Tests 30 passed (30)
  EXIT=0
  ```
  (Lúc báo cáo viết, web còn 1 test đỏ là `logout-race`. Giờ test đó đã xanh nhờ phía T301. Không thuộc phạm vi BUG-002.)
- Đối chứng: tạm thay `service.js` bằng bản ở HEAD, chạy `npx vitest run tests/security/BUG-002.test.js` → `Tests 4 failed | 1 passed (5)`. Đúng như báo cáo: test bắt được lỗi cũ. Sau đó đã khôi phục `service.js` (diff giữ nguyên 8+/2-).
- Grep người gọi `revokeToken` (hợp đồng mới trả boolean): chỉ có `service.js:65` và repo giả trong `tests/helpers.js`. Không còn chỗ nào dùng giá trị trả về kiểu cũ.

## Đối chiếu đặc tả
| Điều kiện đạt | Đạt? | Ghi chú |
|---|---|---|
| Logout bằng token đã xoay thu hồi cả họ (FR01) | Đạt | `service.js:76` bỏ điều kiện `!record.revokedAt`. Có test HTTP và test service. |
| Token không tồn tại / không có cookie | Đạt | Trả 204 rỗng, không đụng tới phiên khác (có test). |
| Token thuộc họ đã bị thu hồi | Đạt | `revokeFamily` lọc `revokedAt: null` nên không làm gì, vẫn 204. Không có test riêng, nhưng hành vi hiển nhiên đúng. |
| Refresh ‖ logout đồng thời không để lại token sống | Đạt ở mức service | Thứ tự "tạo mới rồi CAS token cũ", CAS thất bại thì thu hồi họ. Có test chen ở 2 điểm (beforeCreate, beforeRotate). Ở mức Postgres còn một khe rất hẹp, xem #1. |
| Logout không làm lộ thông tin | Đạt | Mọi ca đều 204 body rỗng, không đọc user. Chênh thời gian 1 truy vấn không có ý nghĩa vì token ngẫu nhiên và không gắn với định danh đoán được. CSRF vào logout bị SameSite=Lax chặn, mà nếu lọt thì tác động cũng chỉ là đăng xuất. |
| Phát hiện dùng lại, khóa tài khoản, đổi mật khẩu (FR01) không hồi quy | Đạt | `tests/auth.test.js` giữ nguyên và vẫn xanh. |
| Refresh lỗi thì xóa cookie | Đạt | `routes.js` gọi `clearCookie` trong `catch`, áp dụng cả cho nhánh CAS thất bại. |

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| 1 | MINOR | `service.js:76`, `prismaRepo.js:10`; báo cáo mục "Quyết định thiết kế" | Lập luận READ COMMITTED trong báo cáo chưa kín. Trong Postgres, một lệnh `UPDATE ... WHERE family AND revokedAt IS NULL` lấy snapshot lúc lệnh bắt đầu. Có thể xảy ra thứ tự sau: logout bắt đầu lệnh (snapshot S), refresh INSERT token mới N và commit, refresh CAS token cũ O và commit, rồi logout mới quét tới O. Khi đó logout đánh giá lại O, thấy `revokedAt` đã khác null nên bỏ qua. N không nằm trong S nên cũng không bị thu hồi. Kết quả: N còn sống sau khi logout trả 204. Khe này rất hẹp (giữa lúc lấy snapshot và lúc khóa O; nếu Prisma 5 tách `updateMany` thành SELECT id rồi UPDATE thì khe rộng thêm một round-trip). Thực tế khó khai thác: kẻ tấn công phải chính là bên đang giữ phiên và phải canh đúng micro giây lúc nạn nhân đăng xuất. Vì vậy không chặn. | Làm cách rẻ nhất: trong `logout` gọi `revokeFamily` hai lần liên tiếp. Lệnh thứ hai lấy snapshot mới, sau thời điểm CAS commit, nên thấy được N. Cách khác là khóa hàng O (`SELECT ... FOR UPDATE`) trong một transaction trước khi thu hồi họ. Bắt buộc thêm ca này vào integration DB thật ở T205 và sửa câu "Không cần `$transaction` hay khóa hàng" trong báo cáo. |
| 2 | MINOR | `tests/security/BUG-002.test.js` | Chưa có test cho ca "logout bằng token thuộc họ đã bị thu hồi → 204, không lỗi". Ca này hiện đúng nhưng chưa được khóa lại bằng test. | Thêm 1 assertion: sau khi logout xong, logout lại bằng cùng cookie vẫn ra 204 và body rỗng. |

Ghi chú (không tính lỗi). Hai refresh đồng thời cùng cookie giờ bị coi là dùng lại và thu hồi cả họ. Tôi chấp nhận, không cần khoảng ân hạn. Client đã tuần tự hóa refresh giữa các tab bằng `navigator.locks` (`apps/web/src/lib/api.js:113`). Ca còn lại là mạng mất response rồi client gửi lại, khi đó người dùng phải đăng nhập lại. Đây là đánh đổi chấp nhận được và cũng là hành vi đã có với phát hiện dùng lại tuần tự. Trước bản sửa, `update` không điều kiện cho cả hai refresh cùng thành công, sinh ra hai nhánh token sống song song. Bản sửa chặt hơn.

Kết luận APPROVED – BLOCKER 0, MAJOR 0, MINOR 2
