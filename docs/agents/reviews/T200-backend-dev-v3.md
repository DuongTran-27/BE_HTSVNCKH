# Review T200 – backend-dev – vòng 3
Kết luận: APPROVED

Góc nhìn: người hiện thực hợp đồng ở T203, T206, T208, T210 và T214, dùng Express 5, Prisma 5.22.0 (đã kiểm `node_modules/@prisma/client` và `prisma` đều 5.22.0) và Supabase pooler ở transaction mode.

## Tôi đã tự kiểm tra
- Đã đọc:
  - `CLAUDE.md` và `docs/agents/QUY_TRINH.md` (mẫu review);
  - `docs/agents/reports/T200.md`, mục "Vòng sửa 2";
  - `docs/agents/design/API_GD2.md`: đầu tài liệu, §1.8, §2, §5.3–5.5, §8.1, §11b (đoạn bảo vệ index/trigger), §11c, §12-G5, §14;
  - review vòng trước của tôi, `reviews/T200-backend-dev-v2.md`;
  - `apps/api/src/modules/topics/stateMachine.js`, `apps/api/src/middlewares/errorHandler.js`;
  - `apps/api/prisma/schema.prisma` (model Topic, dòng 389);
  - `docs/agents/BANG_CONG_VIEC.md`, các dòng T203–T214, T501, T605.
- Lệnh đã chạy:
  - `npm test` (thư mục gốc):
    ```
     Test Files  2 passed (2)
          Tests  21 passed (21)
     Test Files  9 passed (9)
          Tests  87 passed (87)
    ```
    Tổng 108/108 đạt, không có test skip.
  - `npm run lint` → `'eslint' is not recognized as an internal or external command`. ESLint chưa được cài; việc này thuộc T202, không phải lỗi của T200.
  - `docker info` → `open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified`. Docker không chạy. Vì vậy **tôi chưa xác minh trên Postgres thật** các điểm sau: `withLockTx`/`set_config`, dạng lỗi của `updateMany` khi hết `lock_timeout`, và việc Prisma sinh một câu UPDATE duy nhất cho `updateMany`. Tất cả đã được giao cho integration test T210 trên DB thật (§1.8, §11c), nên không chặn task tài liệu này.
  - `grep` chỉ mục unique của Topic: chỉ có `id` (`@id`) và `code` (`@unique`). Cả 5 partial unique index ở §11b đều nằm trên bảng khác.

## Đối chiếu MAJOR vòng 2
| # | Đạt? | Ghi chú |
|---|---|---|
| 1 – `lock_timeout` không đặt được trước khóa Topic; 5 s bằng timeout tx | Đạt | Phần (a): §1.8 đặt `set_config` làm câu **đầu tiên** của `withLockTx`, trước `fn(tx)`. `applyTransition` đổi `prisma.$transaction(fn)` thành `withLockTx(prisma, fn)` (§1.8, §8.1 bước 6, §11c giao T210). Như vậy `lock_timeout` có hiệu lực trước `updateMany` ở `stateMachine.js:51`. Đối chiếu code: chỉ cần thay đúng một dòng, dòng 50. Phần (b): 3 s < 15 s, quy tắc `lock_timeout` < `timeout` đã ghi thành chữ. Thứ tự giao việc T208 (tạo helper) → T210 (đưa `applyTransition` qua helper, viết test DB thật) khớp với thứ tự phụ thuộc T209 → T208 → T210 |

## Đối chiếu 6 MINOR vòng 2
| # | Đạt? | Ghi chú |
|---|---|---|
| 2 – dạng lỗi 55P03 | Đạt | §1.8 và §11c liệt kê đủ: `P2010` + `meta.code`, `P2034`, `P2028`, và dự phòng theo message. Giao T206 viết unit test bằng lỗi giả, T210 viết integration test thật. Xem đánh giá chi tiết ở dưới |
| 3 – Prisma sinh `DROP INDEX` | Đạt | §11b (a)–(c) đã giao T203, có tên cụ thể của 5 index, `topic_title_trgm_idx` và 5 trigger |
| 4 – tên task T207a/b, T212a/b, G5 | Đạt | Đầu tài liệu, §11c, §12-G5 và §14 đã dùng đúng tên mới. G5 ghi T600/T609 |
| 5 – ràng buộc cho T600 | Đạt | §14 có đủ 4 gạch đầu dòng: cờ được suy ra, "cho phép" lưu thành bản ghi mới, job chèn chứ không UPDATE, chỉ nới cột `similarityCheckId`. Có một chỗ chữ lệch nhỏ ở G5 (vấn đề 3) |
| 6 – khóa Topic `FOR UPDATE` | Đạt | §1.8 chuyển hết sang mức NO KEY UPDATE. §5.3: tạo lời mời dùng `SELECT … FOR NO KEY UPDATE`; chấp nhận lời mời dùng `updateMany` với điều kiện DRAFT và tăng `version`, đây là câu khóa đầu tiên. Sau đó lời mời được cập nhật có điều kiện `PENDING` **trước** khi tạo `TopicMember`. `decline`/`cancel` cũng cập nhật có điều kiện. §5.4 dùng `updateMany` theo `version` làm câu đầu |
| 7 – chú thích `matches`; bảng việc | Đạt | (a) Đã giao T203 ở §11b(d). `schema.prisma:389` vẫn là chú thích cũ, điều này đúng vì T200 không sửa code. (b) Trên bảng việc, T501 và T605 đã ghi T212a, T208 đã ghi "kiểm sớm… kiểm chính thức ở T210" |

## Kiểm tính khả thi các điểm được giao
| Điểm | Kết luận |
|---|---|
| `tx.$executeRaw\`SELECT set_config('lock_timeout', ${LOCK_TIMEOUT}, true)\`` trên Prisma 5.22 | Được, theo đọc tài liệu, chưa chạy thật. `$executeRaw` chạy được câu SELECT: driver dùng `execute` và trả số dòng là 1. Tham số bind được suy ra kiểu `text`, khớp `set_config(text, text, bool)`. Đây là template tag nên không phải `$executeRawUnsafe`, không vi phạm quy tắc SQL thô. Với `is_local = true`, giá trị chỉ sống trong transaction mà Prisma đã mở bằng BEGIN trên một kết nối giữ suốt interactive tx, nên không rò sang client khác qua pooler. Trả lời câu hỏi của báo cáo: **chấp nhận** `set_config` thay cho `SET LOCAL` literal |
| `$transaction(fn, { timeout: 15000, maxWait: 5000 })` | Được. Prisma 5.x hỗ trợ đầy đủ tùy chọn interactive tx `maxWait`/`timeout`. Client tx (`tx`) không có `$transaction`, nên `applyTransition` phải tiếp tục nhận client gốc. Đúng như chữ ký hiện tại `applyTransition(prisma, …)`. Không được gọi lồng `withLockTx` trong `extra`; tài liệu cũng không đòi điều đó |
| `topic.updateMany` mức NO KEY UPDATE loại trừ với `applyTransition` | Đúng. Topic chỉ có hai khóa unique là `id` và `code`. Các câu `updateMany` ở §5.3, §5.4 và `applyTransition` chỉ ghi `status`/`version`, không đụng cột khóa, nên Postgres lấy khóa dòng FOR NO KEY UPDATE. Khóa này xung đột với chính nó và với `SELECT … FOR NO KEY UPDATE`, nên các luồng tuần tự hóa với nhau. Ở READ COMMITTED, bên chờ đánh giá lại WHERE trên phiên bản dòng mới (EvalPlanQual). Kết quả: lệch `version`/`status` cho `count = 0` → 409, đúng như tài liệu mô tả. Có một điều chưa xác minh: Prisma 5.22 sinh một câu `UPDATE … WHERE` duy nhất cho `updateMany` không có điều kiện quan hệ (theo tôi nhớ là có, từ 4.x), hay đọc id trước rồi mới UPDATE. Cả hai cách vẫn đúng, vì câu UPDATE cuối vẫn mang điều kiện và vẫn lấy khóa. Test T210 sẽ khẳng định hành vi này |
| P2010/P2034/P2028 → 409 | Hợp lý. `P2010` có `meta.code = '55P03'` đến từ `$queryRaw`/`$executeRaw`. `P2034` là deadlock hoặc serialization. Trường hợp `updateMany` hết `lock_timeout`, hoặc lệnh chèn chờ khóa của unique index, nhiều khả năng ra `PrismaClientUnknownRequestError` có message chứa `55P03` và "canceling statement due to lock timeout". Nhánh dự phòng theo message bắt được cả hai chuỗi. Transaction luôn rollback khi `fn` ném lỗi, nên dữ liệu an toàn. Đồng ý ánh xạ `P2028` → 409, nhưng còn một lưu ý về khả năng quan sát (vấn đề 1) |

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| 1 | MINOR | `API_GD2.md` §1.8 dòng 111; §11c dòng 730 | `P2028` không chỉ là "transaction hết hạn". Prisma cũng trả mã này khi **không lấy được kết nối trong `maxWait`** ("Unable to start a transaction in the given time"), tức là pool hoặc pooler đã cạn. Đây không phải tranh chấp dữ liệu. Nếu map thẳng sang 409 với thông điệp "Đề tài vừa được người khác cập nhật" và không ghi log, sự cố hạ tầng sẽ bị che. `errorHandler.js:22` hiện chỉ log ở nhánh 500 | T206: khi gặp `P2028` thì vẫn trả 409 `CONCURRENT_UPDATE` như đã chốt, nhưng ghi `logger.warn({ reqId, prismaCode: 'P2028' })`. Nên ghi warn cho cả nhánh 55P03/P2034 để theo dõi tần suất tranh chấp. Không cần đổi hợp đồng với FE. Kiến trúc sư có thể sửa một câu ở §11c, hoặc T206 tự làm theo ghi chú này |
| 2 | MINOR | `BANG_CONG_VIEC.md` dòng 20, 23, 25, 16 | Mô tả task trên bảng chưa phản ánh §11c. T206 vẫn ghi "55P03 trong errorHandler". T208 và T210 chưa nhắc `withLockTx`/integration test khóa. T203 chưa nhắc `--create-only`/`pg_indexes`/chú thích `matches`. Báo cáo đã liệt kê đủ 7 đề nghị cho điều phối viên, nên đây không phải lỗi của tài liệu T200. Tuy vậy, người nhận task thường chỉ đọc dòng trên bảng | Điều phối viên cập nhật 4 dòng này theo mục "Câu hỏi cho reviewer" 1–4 của báo cáo **trước** khi chuyển T200 sang DONE |
| 3 | NIT | `API_GD2.md` §12-G5 dòng 756 | G5 ghi "Cần thêm trường DB", trong khi §14 cấm thêm cột cờ trên `Submission`. Hai chỗ không thực sự mâu thuẫn, vì quyết định "cho phép" có thể nằm ở bảng mới, nhưng người đọc dễ hiểu sai | Đổi thành "Cần bản ghi quyết định mới (bảng riêng hoặc AuditLog)…" |

Kết luận: APPROVED – MAJOR lock_timeout và 6 MINOR của vòng 2 đã xử lý đúng. Thiết kế `withLockTx` hiện thực được trên Prisma 5.22. Chưa chạy thử trên DB vì Docker không chạy; việc này đã giao cho test T210. Còn 0 BLOCKER, 0 MAJOR, 2 MINOR, 1 NIT.
