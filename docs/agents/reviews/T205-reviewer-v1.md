# Review T205 – reviewer – vòng 1
Kết luận: APPROVED

## Tôi đã tự kiểm tra
- Đã đọc: `CLAUDE.md`, `docs/agents/QUY_TRINH.md` (mẫu), `reports/T205.md`, FR01 và NFR01 trong `DAC_TA.md`, `reviews/BUG-002-reviewer-v1.md` (MINOR 1), `reviews/BUG-002-bao-mat-v1.md` (MINOR 1–2), `git diff` của `modules/auth/{service,prismaRepo}.js`, toàn bộ `tests/T205-auth-db.test.js`. Không đọc `.env`.
- `npm run db:test:up` → `Kiểm tra DB test: tất cả OK.`; `npm run db:test:reset` → `Đã reset DB test (migrate reset).`
- `npm run lint` → `eslint .`, exit 0.
- `NO_COLOR=1 npm test` (gốc), exit 0. Kết quả khớp phần "Bằng chứng chạy lệnh" của báo cáo:
  ```
  shared  Test Files 2 passed (2)   Tests 21 passed (21)
  api     Test Files 18 passed (18) Tests 159 passed (159)
  web     Test Files 7 passed (7)   Tests 32 passed (32)
  ```
- Chạy riêng `npm test -w @nckh/api -- T205-auth-db` 5 lần liên tiếp, lần nào cũng `13 passed (13)`. Không thấy chập chờn.
- Đối chứng 1 (tự làm lại): sao lưu `service.js`, bỏ lệnh `revokeFamily` thứ hai ở `service.js:80`, chạy file 3 lần. Cả 3 lần đều `1 failed | 12 passed`, test đỏ là "UPDATE thu hồi họ của logout lấy snapshot trước khi token mới N commit…". Đã khôi phục file, md5 trước và sau giống nhau (`d84ddf4e…`). Vậy test race thật sự bắt được khe mà bao-mat nêu.
- Không có `.only`, `.skip` hay `it.fails` trong file test mới. Không test cũ nào bị sửa hay xóa (`git status`: chỉ thêm file mới).
- Lưu ý: sau lượt `npm test` của tôi, trong cây làm việc xuất hiện `tests/security/T205-bao-mat.test.js` (chưa track, có vẻ do bao-mat viết song song). File này không thuộc diff của backend-dev và không nằm trong lượt chạy của tôi.

## Đối chiếu đặc tả
| Điều kiện đạt | Đạt? | Ghi chú |
|---|---|---|
| Repo Prisma auth chạy với DB thật | Đạt | App thật với `createAuthRepo(prisma)` và Argon2id thật. `beforeEach` gọi `resetData`, chặt hơn quy ước `beforeAll` của T203. |
| Access token ≤ 15 phút; refresh token lưu bản băm | Đạt | Test kiểm `exp − iat ≤ 900` và chứng minh DB không chứa chuỗi token thô. |
| Tạm khóa sau 5 lần sai | Đạt | 5 lần 401 với thông báo chung, sau đó 429 `TEMP_LOCKED` dù mật khẩu đúng. |
| Tài khoản bị khóa thì mọi phiên bị từ chối ở lần gọi kế tiếp | Đạt | Cả access và refresh đều 401, không còn token sống, đăng nhập lại ra 403 `ACCOUNT_LOCKED`. |
| Refresh xoay vòng; dùng lại thì thu hồi cả họ | Đạt | Kiểm `replacedBy`, cùng `family`, dùng lại ra 401 và họ còn 0 token sống. |
| `revokeToken` lần hai cùng id trả `false` (BUG-002 reviewer MINOR 1) | Đạt | Thêm kiểm rằng `revokedAt`/`replacedBy` không bị ghi đè. Đối chứng 2 trong báo cáo cho thấy bỏ CAS thì 4 test đỏ. |
| Logout bằng token đã xoay thu hồi token mới nhất (BUG-002 reviewer MINOR 1) | Đạt | Xoay O→N→M, logout bằng O, M bị thu hồi trên DB. |
| Logout thu hồi phiên hiện tại; logout lặp bằng token đã thu hồi → 204 rỗng (bao-mat MINOR 2) | Đạt | Kiểm 204, `text === ''`, phiên khác vẫn refresh được. |
| Đổi mật khẩu thu hồi phiên khác | Đạt | Phiên hiện tại vẫn sống, mật khẩu cũ ra 401. |
| Khe logout ‖ refresh trên Postgres, có integration test (bao-mat MINOR 1) | Đạt cho một lần xoay chen vào | Test tất định (chờ `pg_stat_activity` thấy phiên đang đợi khóa, assert `blocked`), hai điểm chen bằng repo thật, 20 lượt song song. Còn giới hạn khi có hai lần xoay nối tiếp, xem #1. |
| `staffScopes` trong repo (API_GD2 §1.1) | Đạt | `publicUser` chưa lộ trường này. Việc đó để T206, đúng phạm vi. |

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| 1 | MINOR | `apps/api/src/modules/auth/service.js:77-80`; `reports/T205.md:79` | Gọi hai lần chỉ đóng khe khi có **một** lần xoay chen vào. Giả sử trong lúc logout chạy có hai lần xoay nối tiếp O→N rồi N→M. Lệnh thứ hai của logout có thể lấy snapshot trước khi M commit, rồi chờ khóa dòng N (CAS của lần xoay thứ hai) và bỏ qua N. Khi đó M sống sót sau 204. Muốn xảy ra, lệnh thứ hai phải trễ hơn trọn một vòng HTTP cộng vài truy vấn của client, nên rất khó khai thác. Đánh giá này cùng mức với MINOR 1 của BUG-002-bao-mat. Tuy vậy, câu "Điều kiện vẫn đúng" trong báo cáo và chú thích ở `service.js:77-78` đang ngầm khẳng định cách này đóng khe hoàn toàn. Bao-mat có vẻ đang viết đúng ca này thành `it.fails` (`tests/security/T205-bao-mat.test.js`). | Không chặn T205. Có hai cách. Cách 1: ghi rõ giới hạn "một lần xoay chen vào" trong chú thích và báo cáo. Cách 2, nếu bao-mat yêu cầu đóng hẳn: tuần tự hóa theo họ, tức là cả `refresh` và `logout` đều lấy `pg_advisory_xact_lock(hashtext(family))` trong một `$transaction` ngắn. Đặt `FOR UPDATE` trên dòng token cũ thì không đủ vì M là dòng mới. Theo cách nào thì test `it.fails` của bao-mat cũng phải được đổi thành `it`. |
| 2 | NIT | `apps/api/tests/T205-auth-db.test.js:194` | `logout` được khởi chạy bên trong callback `$transaction`. Nếu transaction ném lỗi trước khi tới `await logout` (ví dụ hết timeout), promise này bị bỏ treo và có thể sinh unhandled rejection làm rối kết quả. | Có thể thêm `logout?.catch(() => {})` trong `finally`, hoặc bọc `try/finally` rồi `await logout`. |
| 3 | NIT | `apps/api/src/modules/auth/prismaRepo.js:5-7`; `reports/BUG-002.md` | `include: withScopes` nằm chung dòng với `where`, chưa theo Prettier. Lỗi định dạng này có sẵn từ trước, báo cáo đã nêu. Câu "Không cần `$transaction` hay khóa hàng" trong BUG-002.md vẫn sai, nhưng T205.md đã ghi đính chính. | Format lại khi T206 sửa `modules/auth`. |

Kết luận: APPROVED – BLOCKER 0, MAJOR 0, MINOR 1 (cộng 2 NIT)
