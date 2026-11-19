# TASK-DC-08 – Hội đồng: CRUD, thành viên, gán đề tài, hủy gán, xung đột lợi ích, quyền đọc của hội đồng (FR35)
- Agent: backend-dev · Trạng thái: REVIEW · Ngày: 2026-11-19
- FR/NFR: FR35, FR24, FR25 · Phụ thuộc đã đọc: TASK-DC-07 (báo cáo), `reviews/TASK-DC-07-bao-mat-v1.md` (m3, m4), `design/API_GD7.md` §1.1–1.3, §2.2–2.3, §6, §7 (để giữ thứ tự khóa cho DC-09), §11, G49/G58/G62, `docs/DAC_TA.md` mục 9 (FR35, FR36), `design/UI.md` R30–R32 (đường dẫn `/hoi-dong/:id` cho liên kết thông báo)

## Đã làm
- Module mới `apps/api/src/modules/councils/{service,prismaRepo,routes}.js`. Repo được trộn vào `topicRepo` (giống recruitment/application/defense) nên app không cần thêm phụ thuộc.
  - `POST /api/councils`, `PATCH /api/councils/:id`, `PUT /api/councils/:id/members`, `POST /api/councils/:id/assignments`, `POST /api/council-assignments/:id/cancel`: chỉ STAFF có khoa của hội đồng/đợt trong phạm vi; limiter ghi 30/15 phút/user.
  - `GET /api/councils`, `GET /api/councils/:id`: STAFF trong phạm vi hoặc GV là thành viên hội đồng. ADMIN và SV nhận 403 ở `requireRole`.
- Tạo hội đồng: mã `HD-<năm>-<nnn>` lấy từ `council_code_seq`; kiểm GV là LECTURER, không bị khóa, cùng khoa với đợt (sai thì 400 `members`); ghi AuditLog `COUNCIL_CREATE`; gửi thông báo `COUNCIL_MEMBER_ADDED`.
- Đổi thành viên: chạy trong `withLockTx`, khóa Council `FOR UPDATE`, rồi kiểm lần lượt: version, `COUNCIL_LOCKED` (đã có điểm), `CONFLICT_OF_INTEREST` (với mọi phân công mở). Sau đó thay toàn bộ thành viên, tăng version, ghi AuditLog `COUNCIL_MEMBERS_SET` (before/after) và thông báo người được thêm/bớt.
- Gán đề tài, tất cả hoặc không: khóa Council `FOR SHARE`, rồi khóa các Topic theo id tăng dần (`ORDER BY id FOR NO KEY UPDATE`). Kiểm lần lượt: cùng khoa/đợt (400 `topicIds`), `NOT_WAITING_DEFENSE` (gom `topicCodes`), `CONFLICT_OF_INTEREST` (GVHD đọc sau khóa, gom `conflicts`). Khi tạo phân công, lỗi P2002 của `council_assignment_one_open` được đổi thành `TOPIC_ALREADY_ASSIGNED`. Bất kỳ lỗi nào cũng rollback cả lô. Mỗi đề tài có AuditLog `COUNCIL_ASSIGN` và thông báo `COUNCIL_ASSIGNED` tới hội đồng, GVHD và nhóm.
- Hủy phân công: khóa Council `FOR SHARE`, rồi Topic, rồi đọc lại phân công. Trả `ASSIGNMENT_DECIDED` (đã chốt/đã hủy) hoặc `ASSIGNMENT_HAS_SCORES`; nếu qua thì `updateMany` có điều kiện còn mở. Ghi AuditLog `COUNCIL_UNASSIGN`, thông báo `COUNCIL_UNASSIGNED`.
- Quan hệ `isCouncilMember` (GD7 §1.1, G62) đặt trong `relations()`: me thuộc hội đồng của một phân công `cancelledAt IS NULL`, và đề tài không ở CLOSED/CANCELLED. Quan hệ này được thêm **một lần** vào `canView`, `canReadExecution`, `permissions.viewHistory`. Dữ liệu lấy qua `COUNCIL_SEATS`, dùng chung cho `findDetail` và `findExecTopic`.
- `GET /api/topics`: thêm `councilAssigned=true|false` (chỉ STAFF; vai trò khác nhận 400 `councilAssigned`). Item có `defenseCouncil: {id, code} | null`, chỉ trả cho STAFF.
- Shared: `councilCreateSchema`, `councilUpdateSchema`, `councilMembersSchema`, `councilAssignSchema`, `councilListQuerySchema`, `councilViewQuerySchema`, `topicListQuerySchema.councilAssigned`; 4 loại thông báo `COUNCIL_*` kèm nhãn. Thêm 7 route vào OpenAPI.
- MINOR DC-07: m3 `resetData` restart `council_code_seq` (test khẳng định `HD-2026-001`, `-002`). m4 sửa ca §5.6 #5 của DC07 (xem Câu hỏi cho reviewer 2).

## File thay đổi
| File | Thay đổi |
|---|---|
| `apps/api/src/modules/councils/service.js`, `prismaRepo.js`, `routes.js` | mới |
| `apps/api/src/app.js` | mount `/api/councils`, `/api/council-assignments` |
| `apps/api/src/modules/topics/prismaRepo.js` | trộn `createCouncilRepo`; `COUNCIL_SEATS` trong `DETAIL_INCLUDE` |
| `apps/api/src/modules/execution/prismaRepo.js` | `findExecTopic` thêm `councilAssignments: COUNCIL_SEATS` |
| `apps/api/src/modules/topics/service.js` | `isCouncilMember` trong `relations`, `canView`, `canReadExecution`, `viewHistory` |
| `apps/api/src/modules/topics/{listRepo,listService}.js` | `councilAssigned`, `defenseCouncil` |
| `apps/api/src/openapi/spec.js` | 7 route |
| `packages/shared/src/{schemas,enums,labels}.js` | schema hội đồng, 4 loại thông báo + nhãn |
| `apps/api/tests/DC08-councils.test.js` | mới – 22 test (2 unit schema + 20 DB thật) |
| `apps/api/tests/db.js` | m3: `ALTER SEQUENCE council_code_seq RESTART` |
| `apps/api/tests/DC07-defense.test.js` | m4 (xem Câu hỏi 2) |
| `apps/api/tests/T501-notifications.test.js` | 39 → 43 loại thông báo (Câu hỏi 1) |
| `docs/agents/BANG_CONG_VIEC.md` | DC-08 → REVIEW |

## Quyết định thiết kế
1. **Module riêng `councils/`, repo trộn vào `topicRepo`**: theo cấu trúc `modules/<tên>` trong CLAUDE.md. Trộn repo theo tiền lệ `stats`/`changeRequests` để không phải đổi chữ ký `createApp` và các test đang dựng app.
2. **`TOPIC_ALREADY_ASSIGNED` chỉ dựa vào index `council_assignment_one_open`**. Lúc đầu tôi có thêm một bước đọc kiểm trước khi tạo, nhưng thử đột biến cho thấy bước này thừa: Topic đã bị khóa nên hai lần gán tuần tự hóa, và P2002 rollback cả lô. Vì vậy tôi bỏ bước đọc. Hệ quả: `details.topicCodes` chỉ chứa đề tài đầu tiên bị trùng, không gom đủ.
3. **Kiểm sớm ngoài khóa** (`loadForStaff`, đợt, GV hợp lệ) để trả 403/400 trước khi mở transaction. Mọi điều kiện có thể đổi do người khác (version, điểm, trạng thái đề tài, GVHD, thành viên hội đồng) đều được đọc **sau** khóa.
4. **Thứ tự khóa** đúng §1.2: Council → Topic. Hủy phân công khóa Topic trước khi ghi Assignment, cùng chiều với RETURN_FROM_DEFENSE và chốt của DC-09, nên không tạo chu trình.
5. **`includeCancelled=true`** chỉ có tác dụng với cán bộ trong phạm vi. Thành viên hội đồng gửi tham số này thì bị bỏ qua, không trả 400.
6. Liên kết thông báo: `/hoi-dong/:id` (UI R32) cho thông báo về hội đồng, `/de-tai/:id` cho `COUNCIL_ASSIGNED`. Người bị bỏ khỏi hội đồng nhận `/thong-bao`, vì họ không còn mở được trang hội đồng.
7. **Không làm ở DC-08** (thuộc DC-09 theo bảng việc): `isCouncilOfficer`, `TopicDetail.councilAccess`, `GET /api/council-assignments`, `my-score`, `finalize`.

## Điều kiện đạt ↔ test
| Điều kiện (GD7 §6.6 / FR35) | Test | Kết quả |
|---|---|---|
| Tạo 201, mã từ sequence, AuditLog, thông báo | TC-FR35-02 | Đạt |
| #1 2 CT / thiếu TK / trùng GV / GV khoa khác / 6 UV (+ GV khóa, không phải GV) → 400 `members` | TC-FR35-01 (unit), TC-FR35-03 | Đạt |
| Đổi tên, khóa lạc quan | "PATCH đổi tên…" | Đạt |
| Đổi thành viên, AuditLog before/after, thông báo; `COUNCIL_LOCKED` | "PUT members…" | Đạt |
| Gán 2 đề tài: AuditLog mỗi đề tài, thông báo HĐ + GVHD + nhóm | TC-FR35-04 | Đạt |
| #2 GVHD là ủy viên → `CONFLICT_OF_INTEREST`, `conflicts` đúng, không gán đề tài nào | TC-FR35-05 | Đạt |
| `NOT_WAITING_DEFENSE` (topicCodes), khác đợt → 400, đã gán → `TOPIC_ALREADY_ASSIGNED`, tất cả hoặc không | TC-FR35-06 | Đạt |
| #4 đồng thời gán một đề tài vào 2 HĐ → [201, 409], đúng 1 phân công mở (4 lượt) | TC-FR35-07 | Đạt |
| #3 đổi thành viên thêm GVHD đề tài đã gán → `CONFLICT_OF_INTEREST` | TC-FR35-08 | Đạt |
| #5 FR19 khi WAITING_DEFENSE → 409 `INVALID_TRANSITION` (trưởng nhóm, cán bộ) | TC-FR35-09 | Đạt |
| §6.4 hủy: 200 + lý do + audit + thông báo; có điểm / đã hủy / đã chốt; 403 khoa khác | TC-FR35-10 | Đạt |
| #6 chấm trước (giữ Council FOR SHARE) → đổi chờ khóa rồi 409 `COUNCIL_LOCKED` | TC-FR35-11 | Đạt |
| #6 đổi trước → người bị bỏ 403 (đọc đề tài, đọc hội đồng) | TC-FR35-12 | Đạt (phần chấm: xem Còn lại) |
| #7 thành viên HĐ đọc chi tiết/tài liệu/mốc/nhận xét/kết quả/lịch sử/tiến độ, `download-url` + AuditLog `DOCUMENT_DOWNLOAD`; 12 endpoint ghi → 403, không có AuditLog ghi | TC-FR35-13, TC-FR35-18 | Đạt |
| #7 sau hủy phân công → 403 (cả `download-url`); đã chốt vẫn đọc; CLOSED → 403 (G62) | TC-FR35-14 | Đạt |
| #8 GV ngoài HĐ, SV, cán bộ khoa khác, ADMIN → 403 (đọc + 5 endpoint ghi); thành viên HĐ không ghi hội đồng | TC-FR35-16 | Đạt |
| §6.5 danh sách theo phạm vi/thành viên, `assignmentCount`, tìm theo mã | TC-FR35-15 | Đạt |
| §6.5 `councilAssigned` (STAFF), `defenseCouncil`; vai trò khác → 400; G49 GV hội đồng không thấy đề tài trong `GET /api/topics` | TC-FR35-17 | Đạt |
| Limiter ghi 30/15 phút | TC-FR35-19 | Đạt |
| m3 DC-07 sequence đặt lại | TC-FR35-02 (`HD-2026-001`) | Đạt |
| m4 DC-07 §5.6 #5: phân công mở 200 → hủy → 403; phân công đã chốt của HĐ khác vẫn 200 | DC07 "§5.6 #5 … có phân công mở" | Đạt |

Thử đột biến (sao lưu bằng `cp`, khôi phục xong thì `cmp` xác nhận khớp bản gốc):
| Đột biến | Test đỏ |
|---|---|
| Bỏ `isCouncilMember` khỏi `canView` | TC-12, 13, 14 |
| Bỏ điều kiện CLOSED/CANCELLED (G62) | TC-14 |
| Bỏ kiểm xung đột khi gán | TC-05 |
| Bỏ kiểm xung đột khi đổi thành viên | TC-08 (và TC-15) |
| Bỏ `COUNCIL_LOCKED` | "PUT members", TC-11 |
| Bỏ bước đọc kiểm trùng trước khi tạo | không test nào đỏ, nên tôi xóa bước này (QĐ 2) |

## Bằng chứng chạy lệnh
DB test: Docker Desktop lỗi (`request returned 500 … dockerDesktopLinuxEngine`), nên tôi chạy embedded-postgres như các task trước.
```
$ DB_TEST_DRIVER=embedded npm run db:test:up
K4 extension template1 = pg_trgm 1.6, unaccent 1.1 OK
Kiểm tra DB test: tất cả OK.
$ npm run db:test:reset
Đã reset DB test (migrate reset).

$ npx vitest run tests/DC08-councils.test.js tests/DC07-defense.test.js
      Tests  42 passed (42)

$ npm run lint
> lint
> eslint . --max-warnings 0
lint_exit=0

$ npm test
test_exit=0
 Test Files  8 passed (8)
      Tests  100 passed (100)
   Duration  626ms (transform 386ms, setup 0ms, import 2.30s, tests 125ms, environment 1ms)
 Test Files  81 passed (81)
      Tests  1167 passed (1167)
   Duration  168.75s (transform 1.49s, setup 0ms, import 39.23s, tests 116.87s, environment 6ms)
 Test Files  32 passed (32)
      Tests  245 passed (245)
   Duration  19.96s (transform 7.88s, setup 23.80s, import 49.92s, tests 51.57s, environment 137.14s)
```
Tổng 1512/1512 đạt (shared 100, api 1167, web 245). Lint và test chạy tuần tự, không có tiến trình test nào khác dùng DB test cùng lúc.

## Còn lại / rủi ro
- **§6.6 #6 mới chứng minh được một nửa.** Endpoint chấm `PUT my-score` thuộc DC-09. TC-11 mô phỏng phần khóa của §7.3 (Council `FOR SHARE` rồi ghi DefenseScore). TC-12 chứng minh người bị bỏ mất quyền đọc. Khi có endpoint, DC-09 phải chạy lại ca "đổi trước → chấm nhận 403", và `my-score` phải đọc lại thành viên **sau** khóa Council.
- **E2E chưa chạy.** Task không đổi seed. Luồng cũ chỉ được mở rộng quyền đọc cho thành viên hội đồng, mà seed chưa có hội đồng nào. Riêng `GET /api/topics` thêm khóa `defenseCouncil` vào item cho STAFF; test web/API hiện có đều xanh.
- Web chưa có màn hội đồng (R30–R32, DC-15). Liên kết `/hoi-dong/:id` trong thông báo sẽ dẫn tới trang chưa tồn tại cho tới khi làm DC-15.
- `includeCancelled` của thành viên hội đồng bị bỏ qua (QĐ 5). Nếu muốn trả 400 thì cần quyết định.

## Câu hỏi cho reviewer
Test cũ bị đổi (quy tắc 1: đổi theo đặc tả, không nới lỏng):
1. `T501-notifications.test.js`: số loại thông báo 39 → 43, vì GD7 §11 thêm `COUNCIL_MEMBER_ADDED/REMOVED`, `COUNCIL_ASSIGNED/UNASSIGNED`. Ca "mỗi loại có nhãn" giữ nguyên.
2. `DC07-defense.test.js` §5.6 #5, theo m4 của BM DC-07. Ca cũ dựng phân công **đã chốt** cùng hội đồng (lecB, lecC) với phân công mở, rồi khẳng định lecB/lecC nhận 403 sau khi trả về. Theo GD7 §1.1, phân công đã chốt chưa hủy **vẫn cho đọc**, nên giữ nguyên dữ liệu đó thì ca này đỏ, và đỏ đúng đặc tả. Cách sửa: phân công đã chốt chuyển sang một hội đồng khác (lecF2). Ca giờ khẳng định ba điều: trước khi trả về, lecB/lecC đọc được (200); sau khi hủy thì 403; lecF2 (phân công đã chốt) vẫn 200. Các khẳng định cũ (thông báo, hủy, điểm giữ lại) không đổi. Ca này chặt hơn trước.
Đề nghị xác nhận QĐ 2: `details.topicCodes` của `TOPIC_ALREADY_ASSIGNED` chỉ có đề tài đầu tiên bị trùng.
