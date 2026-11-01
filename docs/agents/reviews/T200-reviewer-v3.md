# Review T200 – reviewer – vòng 3
Kết luận: APPROVED (kèm 1 MINOR, 2 NIT; không còn BLOCKER/MAJOR)

## Tôi đã tự kiểm tra
- Đã đọc: `reports/T200.md` (toàn bộ, đặc biệt "Vòng sửa 2"), `design/API_GD2.md` (§1.1–1.8, §2, §3.2 nhập CSV, §5.1–5.5, §6, §8.1–8.3, §11b, §11c, §12–§14), review vòng 2 của tôi, `CAU_HOI.md` (#2–#6 người dùng đã đồng ý), `QUY_TRINH.md` (mẫu review), dòng T206/T208/T210/T212a trong `BANG_CONG_VIEC.md`.
- Code đối chiếu: `apps/api/src/modules/topics/stateMachine.js` (`applyTransition` hiện gọi `prisma.$transaction(fn)` không tham số; chưa có chỗ nào gọi `applyTransition`, grep `apps/api/src` và `apps/api/tests` → chỉ có định nghĩa, nên đổi sang `withLockTx` không phá test/mock hiện có), `apps/api/src/lib/` (chưa có `tx.js`), `apps/api/package.json` (`@prisma/client`/`prisma` ^5.22.0).
- `git status`: task chỉ thêm/sửa `docs/agents/design/API_GD2.md`, `docs/agents/reports/T200.md`. Không đụng code.
- Grep `API_GD2.md` theo `T207([^ab]|$)|T212([^ab]|$)|Chưa có task nhận|FOR UPDATE|'5s'|SET LOCAL`: chỉ còn dòng 89 (giải thích vì sao không dùng `FOR UPDATE`) và 105 (so sánh với `SET LOCAL`). Khớp bằng chứng trong báo cáo.
- `npm test` (tự chạy, 2026-11-01):
```
> @nckh/shared@0.1.0 test
 RUN  v4.1.12 D:/Website_HTWLHD_SV_NCKH_demo3/packages/shared
 Test Files  2 passed (2)
      Tests  21 passed (21)

> @nckh/api@0.1.0 test
 RUN  v4.1.12 D:/Website_HTWLHD_SV_NCKH_demo3/apps/api
 Test Files  9 passed (9)
      Tests  87 passed (87)
```
  Giống vòng 2 (task tài liệu, không có gì lệch). `npm run lint` không chạy lại: ESLint chưa cài (T202 TODO), như vòng 2.

## Xác nhận vấn đề vòng 2
| # | Vấn đề cũ | Đã sửa? | Ghi chú |
|---|---|---|---|
| 1 MINOR | Tên task cũ T207/T212, G5 chưa có task, ranh giới T208/T210 | **Đã sửa** | Đầu tài liệu `:7-16`, tiêu đề §3 `:165`, §5 `:314`, §8 `:502`, §11c, §12-G5, §14 đều theo T207a/b, T212a/b, T600/T609. `:11-12` và §5.3 bước 3 `:381` ghi rõ T208 kiểm sớm, T210 làm quy trình chính thức. Bảng việc T208 `BANG_CONG_VIEC.md:23` khớp |
| 2 MINOR | `lock_timeout` không đặt được trước `updateMany` của `applyTransition`; chưa nói dạng lỗi `55P03` | **Đã sửa** | §1.8 `:96-115`: `withLockTx` đặt `lock_timeout` ở câu đầu tiên, `applyTransition` chuyển sang helper, §11c `:731-732` giao T208/T210 kèm integration test DB thật. Dạng lỗi liệt kê đủ (`P2010`+`meta.code`, `P2034`, `P2028`, dự phòng theo `message`). Xem đánh giá kỹ thuật bên dưới |
| 3 MINOR | `decline`/`cancel` thiếu cập nhật có điều kiện; `cancel` ‖ `accept` | **Đã sửa** | §5.3 `:377-387`: cả ba endpoint `invitation.updateMany({ where: { id, status: 'PENDING' } })`, `count !== 1` → 409 `INVITATION_CLOSED`; accept cập nhật lời mời trước khi tạo `TopicMember`. T214 có ca test (§11c `:743`) |
| 4 NIT | §8.1 bước 5 / khóa Topic `FOR UPDATE` | **Đã sửa** | §8.1 bước 5–6 `:522-523`; Topic khóa mức NO KEY UPDATE (§1.8 `:90-93`) |

## Đánh giá kỹ thuật các sửa đổi mới
| Mục | Đánh giá |
|---|---|
| `withLockTx` + `set_config('lock_timeout', $1, true)` | Đúng. `set_config(name, value, is_local=true)` có cùng hiệu lực với `SET LOCAL`, chỉ sống trong transaction hiện tại, nên an toàn với pooler ở transaction mode. Prisma gửi `${LOCK_TIMEOUT}` thành tham số `$1`, Postgres suy ra kiểu `text`, khớp chữ ký `set_config(text, text, boolean)`. `lock_timeout` áp dụng cho **mỗi lần chờ khóa**, kể cả khóa dòng do `UPDATE`/`SELECT … FOR NO KEY UPDATE`/KEY SHARE của insert có FK, nên đúng là chặn được lần chờ ở `updateMany` đầu `applyTransition` |
| `timeout: 15000, maxWait: 5000` | Hợp lý. Quy tắc `lock_timeout` (3 s) < `timeout` (15 s) đúng: bộ đếm của Prisma tính từ đầu tx, nếu nhỏ hơn hoặc bằng thì `P2028` đến trước `55P03`. REQUEST_ADVISOR có tối đa khoảng 4–5 lần chờ khóa nối tiếp (Topic, User các thành viên, KEY SHARE khi insert), trường hợp xấu nhất mỗi lần gần 3 s mới chạm 15 s, rất khó xảy ra; lúc đó `P2028` là lưới an toàn |
| Nhận diện lỗi | `$queryRaw`/`$executeRaw` hết `lock_timeout` → `P2010` với `meta.code = '55P03'` (Prisma 5 có `meta.code`/`meta.message` cho P2010). Truy vấn thường (`updateMany`) hết `lock_timeout`: Prisma 5 không có mã P riêng cho `55P03`, lỗi đến dạng `PrismaClientUnknownRequestError` với message chứa `canceling statement due to lock timeout` → nhánh dự phòng theo `message` (`lock timeout`) bắt được. Hợp đồng ghi đúng rằng dạng này chưa xác minh và giao T210 test trên DB thật. Deadlock `40P01`/serialization `40001` → `P2034`, 409 là hợp lý. Transaction đã rollback trong mọi dạng trên |
| Khóa Topic NO KEY UPDATE | Đúng. `applyTransition`, accept, đổi trưởng nhóm không đổi cột "khóa" (id, `code` unique) nên `UPDATE` lấy NO KEY UPDATE. Hai NO KEY UPDATE loại trừ nhau nên các luồng vẫn tuần tự hóa. Insert có FK tới Topic (`SimilarityCheck`, `StatusHistory`, `Invitation`) chỉ lấy KEY SHARE, không bị chặn thừa. Tạo lời mời dùng `$queryRaw … FOR NO KEY UPDATE`, sau đó insert `Invitation` cùng tx lấy KEY SHARE trên Topic: cùng transaction nên không tự chặn |
| Accept: `topic.updateMany({ id, status: 'DRAFT' })` là câu khóa đầu | Đúng và gọn: khóa, kiểm DRAFT và tăng `version` trong một câu. Sau khi chờ khóa, Postgres đánh giá lại WHERE trên phiên bản dòng mới nhất (READ COMMITTED), nên nếu REQUEST_ADVISOR commit trước thì `count = 0` → `INVITATION_CLOSED`. Lỗi ở bước 2–3 rollback cả việc tăng `version` |
| Lời mời có điều kiện `PENDING` | Đúng. `accept` (đang giữ khóa Topic) và `cancel`/`decline` (không khóa Topic) cùng tranh khóa dòng `Invitation`; bên sau đánh giá lại `status = 'PENDING'` và nhận `count = 0`. Không có vòng chờ: `cancel`/`decline` chỉ khóa dòng `Invitation` (+ KEY SHARE User khi ghi AuditLog, tương thích với NO KEY UPDATE), không bao giờ chờ Topic. REQUEST_ADVISOR (giữ Topic) chuyển lời mời còn lại sang `WITHDRAWN` cũng bằng điều kiện `PENDING`, đua với `decline` vẫn chỉ một bên thắng |
| Đổi trưởng nhóm: `updateMany({ id, version })` làm câu đầu | Đúng. Mọi chuyển trạng thái đều tăng `version`, nên khớp `version` nghĩa là trạng thái chưa đổi kể từ lúc client tải; kiểm trạng thái kết thúc dựa trên đề tài đã tải là đủ |
| Đối chiếu đặc tả | Không thêm đường chuyển trạng thái (§10 không đổi). G1/G2/G3/G11–G14 ghi "đã xác nhận" khớp `CAU_HOI.md` #2–#6. Thêm `topic.round` vào item `GET /api/advisor-requests` chỉ là thêm trường. Không có mâu thuẫn mới với FR03, FR05, FR16, FR17 |

## Trả lời câu hỏi mở trong báo cáo
1. **`set_config` hay `SET LOCAL`?** Đồng ý dùng `set_config('lock_timeout', …, true)`. Về ngữ nghĩa nó tương đương `SET LOCAL`, nhận được tham số bind, và nằm gọn trong tagged template nên không cần `$executeRawUnsafe`. Một điểm nhỏ: câu là `SELECT` nên nên gọi bằng `$queryRaw` thay vì `$executeRaw` (NIT #2). Trên Postgres `$executeRaw` với `SELECT` vẫn chạy (trả số dòng theo command tag `SELECT 1`), nhưng `$queryRaw` mới đúng mục đích của API.
2. **`P2028` → 409 hay 503?** Với `P2028`, tôi chọn **503**, giữ 409 cho `55P03`/`P2034`. Lý do ở MINOR #1: `errorHandler` là toàn cục, và `P2028` không chỉ sinh ra trong các tx có khóa Topic. Nó còn xuất hiện khi hết `maxWait` (pool cạn, "Unable to start a transaction in the given time", tức hệ thống quá tải chứ không phải xung đột dữ liệu), và khi tx nhập CSV (§3.2 `:235`, `timeout: 20000`) chạy quá giờ. Nếu trả "Đề tài vừa được người khác cập nhật, vui lòng tải lại" cho lượt nhập CSV thì thông điệp sai hoàn toàn. Client vẫn dùng chung nhánh "thử lại": 503 cũng là mã thử lại được, và dữ liệu đã rollback.

## Đối chiếu đặc tả
| Điều kiện đạt | Đạt? | Ghi chú |
|---|---|---|
| FR02 (mã/email không trùng, CSV xem trước/xác nhận, đổi mật khẩu sau reset) | Đạt | §3, `requirePasswordChanged` §1.2 |
| FR03 (lời mời chấp nhận mới thành viên, min–max, N đề tài/SV, một trưởng nhóm) | Đạt | §5.3–5.5; race accept/cancel và N đề tài/SV đã bịt |
| FR04 | Đạt | §4, không đổi từ vòng 2 |
| FR05 (sửa ở Nháp/Cần chỉnh sửa, trường bắt buộc, mã duy nhất, gửi trong thời gian mở) | Đạt | §5.1–5.2, §8.2; G1/G2 đã xác nhận |
| FR06 (top 5, cảnh báo không chặn, HIGH bắt buộc giải trình, lỗi ≠ không trùng) | Đạt | §7, §8.2 |
| FR07 (cán bộ đúng khoa, gắn snapshot, lý do, lưu người/thời điểm) | Đạt | §8.3, `STALE_SUBMISSION` |
| FR08 | Đạt | §9, G3 đã xác nhận |
| FR16 (hạn mức trong transaction, rút, không gửi xét duyệt sau đóng đăng ký) | Đạt | §6; `lock_timeout` giờ áp dụng được cho khóa Topic |
| FR17 (snapshot bất biến, quyết định trỏ đúng, diff) | Đạt | §8.2–8.4, trigger §11b |
| FR25/NFR02, NFR05, NFR06 | Đạt | §1.1, §1.6, §1.4 |

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| 1 | MINOR | `API_GD2.md:111`, `:142`, `:730` | `P2028` → 409 `CONCURRENT_UPDATE` là ánh xạ toàn cục trong `errorHandler`. Nó áp cả cho hai trường hợp không phải xung đột đề tài: hết `maxWait` (pool cạn) và tx nhập CSV `:235` quá 20 s. Người dùng sẽ nhận "Đề tài vừa được người khác cập nhật, vui lòng tải lại", thông điệp sai | `P2028` → 503 với mã mới `SERVICE_BUSY` ("Hệ thống đang bận, vui lòng thử lại"), thêm một dòng vào bảng §2, ghi log `warn` kèm `requestId`. Giữ 409 cho `55P03`/`P2034`. Sửa `:111`, `:142`, `:730`; T206 test lỗi giả `P2028` → 503. Nếu muốn giữ 409 thì ít nhất phải dùng thông điệp trung tính, không nhắc "đề tài" |
| 2 | NIT | `API_GD2.md:101` | Câu `SELECT set_config(…)` được gọi bằng `$executeRaw`. Chạy được trên Postgres, nhưng `$queryRaw` mới là API dành cho `SELECT` | Đổi thành `tx.$queryRaw`. T208 thêm một integration test: trong `withLockTx`, `SELECT current_setting('lock_timeout')` = `3s`; ở tx sau (cùng pool) giá trị trở về mặc định, chứng minh không rò sang phiên khác |
| 3 | NIT | `BANG_CONG_VIEC.md:20`, `:23`, `:25` (ngoài T200, cho điều phối viên) | Mô tả T206 vẫn ghi "55P03 trong errorHandler". T208/T210 chưa nhắc `withLockTx`, cập nhật lời mời có điều kiện, integration test khóa. Hợp đồng §11c đã ghi đủ nên không chặn | Cập nhật theo mục "Câu hỏi cho reviewer / việc cần điều phối viên" 1–3 trong `reports/T200.md:231-233` |

Không còn BLOCKER/MAJOR. MINOR #1 sửa được bằng một dòng hợp đồng. T206 có thể làm theo đề xuất trên mà không cần review lại T200.

Kết luận: APPROVED – mọi vấn đề vòng 2 đã sửa đúng; `withLockTx`/`set_config`/timeout/khóa NO KEY UPDATE/lời mời có điều kiện đều đúng và khả thi với Prisma 5.22 + Postgres. BLOCKER 0, MAJOR 0, MINOR 1, NIT 2.
