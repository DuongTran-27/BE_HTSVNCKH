# Review T200 – backend-dev – vòng 2
Kết luận: CHANGES_REQUESTED

Góc nhìn: người hiện thực hợp đồng ở T203–T213 và T609, dùng Express 5, Prisma 5.22 và PostgreSQL qua Supabase pooler ở transaction mode.

## Tôi đã tự kiểm tra
- Đã đọc:
  - `CLAUDE.md`, `docs/agents/QUY_TRINH.md`;
  - `docs/agents/BANG_CONG_VIEC.md` (bản đã đảo T209 → T208 → T210, tách T207a/b và T212a/b, thêm T609);
  - `docs/agents/design/API_GD2.md` (toàn bộ, 739 dòng);
  - `docs/agents/reports/T200.md` (mục "Vòng sửa 1");
  - `reviews/T200-backend-dev-v1.md`;
  - `apps/api/src/modules/topics/stateMachine.js`, `apps/api/src/app.js`, `middlewares/{auth.js, errorHandler.js}`, `lib/prisma.js`;
  - `apps/api/prisma/schema.prisma` (Topic, TopicMember, Invitation, AdvisorRequest, Advising, Submission, ReviewDecision, SimilarityCheck), `prisma/sql/after_init.sql`;
  - `modules/similarity/{engine.js, service.js, prismaRepo.js}`, `scripts/reset-test-db.js`, `README.md` (các bước migrate).
- Lệnh đã chạy:
  - `npx prisma validate` (trong `apps/api`, URL giả) → `The schema at prisma\schema.prisma is valid 🚀`.
  - `npm test` (thư mục gốc) → `@nckh/shared`: `Test Files 2 passed (2)`, `Tests 21 passed (21)`. `@nckh/api`: `Test Files 9 passed (9)`, `Tests 87 passed (87)`. Không có test skipped hoặc todo.
  - `npm run lint` → `'eslint' is not recognized as an internal or external command`. ESLint chưa được cài; việc này thuộc T202, không phải lỗi của T200.
  - `docker ps` → lỗi 500 từ Docker Desktop, nên không có DB thật. Vì vậy tôi chưa chạy thử `after_init.sql`, partial index và trigger trên Postgres. Các kết luận về SQL bên dưới dựa trên việc đọc tài liệu và code.
  - Tìm chuỗi `55P03` trong `@prisma/engines/query_engine-windows.dll.node`: chỉ thấy trong bảng SQLSTATE đầy đủ của driver. Không suy ra được Prisma ánh xạ lỗi này thế nào (vấn đề 2).

## Đối chiếu 5 MAJOR của vòng 1
| # vòng 1 | Đạt? | Ghi chú |
|---|---|---|
| 1 – schema/SQL giao T203 (§11b) | Đạt | §11b có đủ 5 relation, 4 `@@index`, 5 partial unique index và 3 trigger, và mô tả T203 trên bảng việc đã ghi §11b. SQL đúng với schema: tên cột có ngoặc kép khớp. So sánh `role = 'LEADER'` với enum `MemberRole` và `status = 'PENDING'` với `RequestStatus` hợp lệ trên Postgres. §5.4 bắt hạ LEADER cũ trước rồi mới nâng người mới. Cách này chạy được với index unique không deferrable, vì mỗi câu UPDATE được kiểm riêng. Trigger chỉ chạy cho UPDATE/DELETE, nên `TRUNCATE` và `migrate reset` dùng để reset DB test không bị ảnh hưởng. Còn rủi ro Prisma Migrate sinh lệnh DROP các index mà schema không biểu diễn được (vấn đề 3) |
| 2 – `matches` bất biến | Đạt | §7.2 chốt dạng lưu `{ topicId, code, title, academicYear, fieldName, status, titleScore, contentScore, level, matchedKeywords }`. View chỉ dựng từ dữ liệu đã lưu, ẩn/hiện theo `status` lúc kiểm. `loadCorpus` (`prismaRepo.js:8-9`) đã lấy `status`, `academicYear`, `fieldName`, `keywords`, nên không cần truy vấn thêm. Ẩn với mọi vai trò trừ STAFF đã giao cho T211 |
| 3 – 403 trước `checkTransition`, `skipSimilarity` | Đạt | §8.1 bước 2 và §2 dòng 137 ghi quy ước. §8.2 bước 1 và 5 gọi `checkTransition` hai lần. §11c giao T212, giờ là T212a trên bảng. Tôi đã kiểm `stateMachine.js:23`: khối `needsSimilarity` tách riêng, nên thêm cờ bỏ qua chỉ cần một điều kiện. Trường hợp STAFF trong phạm vi gặp DRAFT nhận 403 ở bước 2 là đúng, vì không có action STAFF nào xuất phát từ DRAFT |
| 4 – `requirePasswordChanged` | Đạt | §1.2 giao T206, gắn một lần bằng `app.use('/api', requireAuth, requirePasswordChanged)`, đặt sau `/api/health` và `/api/auth`. Đối chiếu `app.js:29-34`: chèn được trước `notFound`. `requireAuth` nạp lại user mỗi request (`auth.js:13`), nên `mustChangePassword` luôn mới. Hệ quả chấp nhận được: đường dẫn `/api/*` không tồn tại trả 401 thay vì 404 khi chưa đăng nhập |
| 5 – thứ tự T208/T209 | Đạt | Bảng việc có T209 → T206, T208 → T209, T210 → T208. Đầu tài liệu API_GD2 cũng ghi thứ tự này |

## Đối chiếu 9 MINOR của vòng 1
| # | Đạt? | Ghi chú |
|---|---|---|
| 6 – `FOR NO KEY UPDATE`, đếm sau khóa, `lock_timeout` | Một phần | Phần ý tưởng ở §1.8 đúng. Phần hiện thực chưa khả thi như đang viết: xem vấn đề 1 và 2 |
| 7 – timeout tx nhập CSV, `createManyAndReturn` | Đạt | §3.2: `{ timeout: 20000, maxWait: 5000 }`. Prisma 5.22 có `createManyAndReturn` cho PostgreSQL |
| 8 – `q` không dấu | Đạt | §9.1 dùng raw SQL với đúng biểu thức của index, có escape, rồi ghép tập id vào truy vấn Prisma |
| 9 – relation | Đạt | Đã gộp vào §11b |
| 10 – `conflict(details)`, P2002 | Đạt | §11c giao T206. Bảng ánh xạ cột sang tên trường đặt theo từng module |
| 11 – tách T207, T212 | Đạt | Bảng việc đã tách, nhưng tài liệu API_GD2 chưa cập nhật theo (vấn đề 4) |
| 12 – kịch bản race GV | Đạt | §6 |
| 13 – dạng `matchedKeywords` | Đạt | §7.2 |
| 14 – sequence không đánh lại theo năm | Đạt | §12-G9 |

## Tính khả thi các điểm được giao kiểm
| Điểm | Kết luận |
|---|---|
| `$queryRaw … FOR NO KEY UPDATE` trong interactive tx qua pooler transaction mode | Được. Interactive tx giữ một kết nối server suốt transaction. `pgbouncer=true` tắt prepared statement có tên. `IN (${Prisma.join(ids)})` hoặc `= ANY(${ids})` đều chạy |
| `SET LOCAL lock_timeout` trong interactive tx | Câu lệnh chạy được: `SET LOCAL` chỉ có hiệu lực trong transaction nên không rò sang phiên khác của pooler. Lưu ý `SET` không nhận tham số bind, nên phải viết literal trong `$executeRaw`, hoặc dùng `SELECT set_config('lock_timeout', ${v}, true)`. **Không** đặt được ở đầu transaction của `applyTransition`, và trùng giá trị với timeout mặc định của Prisma (vấn đề 1) |
| Partial unique index bằng SQL thô trong migration | SQL hợp lệ và chạy được. Rủi ro nằm ở việc bảo trì về sau (vấn đề 3) |
| Trigger chỉ-thêm cho `SimilarityCheck` so với việc T609 nới trigger | **Không xung đột.** Theo mô tả T609 và §14, T609 chỉ nới `submission_immutable` cho cột `Submission.similarityCheckId`. Job chạy lại FR06 **chèn** một dòng `SimilarityCheck` mới rồi trỏ `Submission` sang dòng đó, nên không UPDATE `SimilarityCheck`. FK `Submission.similarityCheckId` mặc định `ON UPDATE CASCADE`/`ON DELETE SET NULL`, nhưng id không bao giờ đổi và không có xóa cứng, nên cascade không bao giờ chạm trigger. Đề xuất giữ cho đúng như vậy ở vấn đề 5 |

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| 1 | MAJOR | `API_GD2.md` §1.8 dòng 92; `stateMachine.js:46-58`; §11c | Hành vi "hết thời gian chờ khóa thì trả 409" ở §1.8 không xảy ra được như đang viết. Có hai lỗi. (a) `applyTransition` tự mở `prisma.$transaction(fn)` và câu đầu tiên là `updateMany`, cũng là câu lấy khóa Topic, tức khóa bị tranh chấp nhiều nhất ở REQUEST_ADVISOR và ACCEPT_ADVISING. `extra` chỉ chạy **sau** câu đó, nên `SET LOCAL lock_timeout` đặt trong `extra` không áp được cho khóa Topic. Không task nào được giao sửa `applyTransition` để có chỗ đặt. (b) `lock_timeout = '5s'` bằng đúng timeout mặc định 5000 ms của interactive tx trong Prisma. Bộ đếm của Prisma tính từ lúc bắt đầu tx nên hết trước, và lỗi trả về là `P2028` (transaction đã đóng hoặc hết hạn), thành 500 `INTERNAL`, không phải 409 `CONCURRENT_UPDATE`. Dữ liệu không hỏng vì có rollback, nhưng đây là lỗi tiềm ẩn khi đồng thời, và T214 test ca này sẽ đỏ | Sửa §1.8 và thêm một dòng vào §11c, giao **T210** (task đầu tiên khóa trong `applyTransition`; T204 cũng hợp lý nếu điều phối viên muốn). Nội dung: `applyTransition` (và mọi transaction có khóa ở §5.3, §5.4) chạy `SET LOCAL lock_timeout = '3s'` làm **câu đầu tiên**, trước `updateMany`, và gọi `$transaction(fn, { timeout: 15000, maxWait: 5000 })`. Ghi quy tắc **`lock_timeout` < timeout của tx**. Thêm `P2028` vào errorHandler → 409 `CONCURRENT_UPDATE` (hoặc 503) để không lọt thành 500. Test: hai tx cùng khóa một Topic, tx sau nhận 409 |
| 2 | MINOR | `API_GD2.md` §11c dòng 696 | "Lỗi `55P03` → 409" chưa nói lỗi này đến dưới dạng nào. Với `$queryRaw`/`$executeRaw`, Prisma 5 trả `P2010` và `meta.code = '55P03'`. Với truy vấn thường (`updateMany` ở vấn đề 1), tôi không xác minh được Prisma có ánh xạ 55P03 hay không. Nhiều khả năng là `PrismaClientUnknownRequestError`, không có `code`, chỉ có SQLSTATE trong message. Deadlock và xung đột ghi đến dưới dạng `P2034` | Ghi rõ cho T206: nhận diện `P2010` có `meta.code === '55P03'`, `P2034`, và dự phòng bằng message chứa `55P03`/`lock timeout`. Tất cả trả 409 `CONCURRENT_UPDATE`. Bắt buộc có integration test trên DB thật, vì không mock được hình dạng lỗi này |
| 3 | MINOR | `API_GD2.md` §11b dòng 654, 674–681; `README.md:38-42` | Prisma 5.22 không biểu diễn được index có `WHERE` hoặc index trên biểu thức. Lần `prisma migrate dev` sau so schema với DB của các migration, nên có thể sinh `DROP INDEX` cho `topic_one_leader`… (và cả `topic_title_trgm_idx` đã có). Nếu người làm T400/T600 không đọc kỹ file migration, lưới an toàn ở §11b sẽ mất mà không ai thấy. Tôi chưa xác minh được trên DB, vì Docker hỏng | T203: (a) chạy `migrate dev --create-only` một lần sau migration `search_and_security` để xác nhận Prisma có sinh `DROP INDEX` hay không, rồi ghi kết quả vào báo cáo; (b) thêm integration test đọc `pg_indexes` và `pg_trigger`, khẳng định đủ 5 partial index, index trigram và 5 trigger chỉ-thêm. Test này rẻ và bắt được mọi migration về sau lỡ xóa chúng; (c) ghi một dòng vào README: "migration tự sinh có `DROP INDEX` các index ở `after_init.sql` → xóa dòng đó" |
| 4 | MINOR | `API_GD2.md` dòng 6–16, §11 (cột Task: T207, T212), §11c (T207, T212), §12-G5 dòng 714, §14 dòng 735 | Tài liệu chưa theo bảng việc mới. Danh sách hiện thực và §11/§11c vẫn ghi T207, T212 thay vì T207a/T207b, T212a/T212b (ví dụ `toCsv`, `USER_IMPORT_*`, `importQuerySchema` thuộc T207b; `submissionDiffQuerySchema` thuộc T212b). G5 và §14 vẫn ghi "**Chưa có task nhận**" trong khi T609 đã có | Đổi tên task cho khớp bảng việc. G5 và §14 ghi "T600 (hợp đồng) + T609 (hiện thực)" |
| 5 | MINOR | `API_GD2.md` §14 dòng 735–738; mô tả T609 | Việc chỉ nới trigger cho cột `similarityCheckId` chỉ đủ khi cờ "chưa kiểm tra" **không** phải một cột sửa được trên `Submission`. Nếu T600 thêm cột kiểu `Submission.unchecked` rồi job xóa cờ sau khi chạy lại, T609 sẽ phải nới thêm cột và mô tả trên bảng việc thành sai | Ghi ràng buộc thiết kế cho T600 ngay ở §14: cờ "chưa kiểm tra" **suy ra** từ `similarityCheck.status = ERROR` (hoặc `similarityCheckId IS NULL`); quyết định "cán bộ cho phép" lưu thành bản ghi mới (bảng riêng hoặc AuditLog), không UPDATE `Submission` hay `SimilarityCheck`. Như vậy trigger `SimilarityCheck` giữ nguyên và T609 chỉ nới một cột, khớp mô tả trên bảng việc |
| 6 | MINOR | `API_GD2.md` §5.3 dòng 345, 353; §1.8 dòng 89 | Lời mời và chấp nhận lời mời khóa Topic bằng `FOR UPDATE`. Kiểu khóa này chặn cả các lệnh chèn có FK tới đề tài (SimilarityCheck, StatusHistory, Invitation), đúng loại chặn thừa mà §1.8 đã tránh cho User. Thêm nữa, §1.5 đã yêu cầu chấp nhận lời mời tăng `version` | Đơn giản hơn: chấp nhận lời mời làm `updateMany({ where: { id, status: 'DRAFT' }, data: { version: { increment: 1 } } })` làm câu đầu. Một câu này vừa lấy khóa (mức NO KEY UPDATE, vẫn loại trừ với `updateMany` của `applyTransition`), vừa kiểm DRAFT nguyên tử (`count = 0` → 409 `INVITATION_CLOSED`), vừa tăng `version`. Tạo lời mời dùng `FOR NO KEY UPDATE` |
| 7 | MINOR | `schema.prisma:389`; `BANG_CONG_VIEC.md` T501, T605 | (a) Chú thích của `SimilarityCheck.matches` vẫn là `[{topicId, code, titleScore, contentScore, visible}]`, lệch §7.2. (b) Bảng việc: T605 và T501 còn tham chiếu "T212", task này không còn tồn tại sau khi tách. T208 ghi "giới hạn … đề tài hoạt động/sinh viên", trong khi §5.5 giao lần kiểm chính thức cho T210 (T208 chỉ kiểm sớm khi chấp nhận lời mời) | (a) T203 sửa chú thích theo §7.2. (b) Điều phối viên đổi thành T212a/T212b, và làm rõ T208 chỉ kiểm sớm. Tôi không sửa bảng việc |

Kết luận: CHANGES_REQUESTED – 5 MAJOR của vòng 1 đã xử lý đúng và khả thi. Còn 1 MAJOR mới: `SET LOCAL lock_timeout` không đặt được trước khóa Topic trong `applyTransition`, và 5 s bằng timeout mặc định của tx Prisma nên trả 500 thay vì 409. Cần sửa §1.8/§11c và giao task. 6 MINOR còn lại sửa trong cùng vòng.
