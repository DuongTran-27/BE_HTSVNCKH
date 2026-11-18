# TASK-DC-01 – Shared + migration `dc_status_enum`: 2 trạng thái, 6 dòng TRANSITIONS, `councilOfficerOnly`
- Agent: backend-dev · Trạng thái: REVIEW · Ngày: 2026-11-18
- FR/NFR: FR15, FR25, FR31–FR37 · Phụ thuộc đã đọc: TASK-DC-00 (`design/API_GD7.md` §0, §0.1, §1.1, §2.1, §3.3–3.4; `reviews/TASK-DC-00-bao-mat-v1.md`, `-v2.md`), `docs/DAC_TA.md` mục 9

## Đã làm
- `TOPIC_STATUS` + `RECRUITING` ("Đang tuyển sinh viên"), `WAITING_DEFENSE` ("Chờ bảo vệ"); `INACTIVE_STATUSES` không đổi → cả hai là đề tài hoạt động. `PRE_APPROVAL_STATUSES` + `RECRUITING`.
- `TRANSITIONS` thêm đúng 6 dòng của GD7 §0 (14 dòng cũ giữ nguyên, chỉ định nghĩa ở `packages/shared/src/transitions.js`); `ACTION_LABEL` 6 nhãn mới. `UNPUBLISH_RECRUITMENT` có `reasonRequired` (M2 BM).
- `checkTransition`: cờ `councilOfficerOnly` đòi `ctx.isCouncilOfficer` (403 nếu thiếu), kiểm cùng nhóm các cờ quan hệ khác, trước kiểm lý do.
- `ENABLED_ACTIONS` luôn loại `CANCEL`, `COUNCIL_FINALIZE`; 5 action GĐ7 còn lại tạm loại qua `NOT_YET_IMPLEMENTED` (xem Quyết định thiết kế).
- Migration `20261118000000_dc_status_enum`: chỉ 2 câu `ALTER TYPE "TopicStatus" ADD VALUE … AFTER …` (không dùng giá trị mới trong cùng transaction). `schema.prisma` enum cùng thứ tự.
- GD7 §0.1: kho so FR06 (`RECRUITING` → nhóm hồ sơ đang chờ cùng đợt, ẩn tên với SV/GV; `WAITING_DEFENSE` → nhóm công khai), `CLOSING` + `WAITING_DEFENSE` (closeReadiness), rời nhóm ở `WAITING_DEFENSE` trả `LEAVE_NEEDS_APPROVAL` như đề tài đã duyệt (trước đó sẽ rơi vào nhánh "Đề tài đã kết thúc").
- Rà giả định "có Advising ⇔ trạng thái ≥ HAS_ADVISOR" (bảng bên dưới).

## File thay đổi
| File | Thay đổi |
|---|---|
| `packages/shared/src/enums.js` | 2 trạng thái + nhãn; `PRE_APPROVAL_STATUSES` + RECRUITING |
| `packages/shared/src/labels.js` | `ACTION_LABEL` 6 action mới |
| `packages/shared/src/transitions.js` | 6 dòng TRANSITIONS; `ENABLED_ACTIONS` loại `CANCEL`, `COUNCIL_FINALIZE` và 5 action chưa có endpoint |
| `packages/shared/src/transitions.test.js` | 14 → 20; test 6 dòng mới, ENABLED_ACTIONS, nhãn/hoạt động/trước duyệt, SV không có thao tác ở 2 trạng thái mới |
| `apps/api/prisma/schema.prisma` | enum `TopicStatus` + RECRUITING (sau DRAFT), WAITING_DEFENSE (sau IN_PROGRESS) |
| `apps/api/prisma/migrations/20261118000000_dc_status_enum/migration.sql` | mới – chỉ ADD VALUE |
| `apps/api/src/modules/topics/stateMachine.js` | cờ `councilOfficerOnly` |
| `apps/api/src/modules/topics/service.js` | `CLOSING` + WAITING_DEFENSE |
| `apps/api/src/modules/similarity/service.js` | `PUBLIC_CORPUS_STATUSES` + WAITING_DEFENSE; `PENDING_SAME_ROUND_STATUSES` + RECRUITING (prismaRepo và seed dùng chung hằng này) |
| `apps/api/src/modules/topics/groupService.js` | rời nhóm ở WAITING_DEFENSE → `LEAVE_NEEDS_APPROVAL` |
| `apps/api/tests/stateMachine.test.js` | 4 test mới (COUNCIL_FINALIZE, PUBLISH, UNPUBLISH/FINALIZE_GROUP, REQUEST/RETURN_FROM_DEFENSE) |
| `apps/api/tests/similarity.test.js` | 1 test kho so 2 trạng thái mới |
| `apps/api/tests/T603-leave.test.js` | 1 test integration: rời ở RECRUITING 200, ở WAITING_DEFENSE 409 |
| `apps/api/tests/T203-schema.test.js` | `SEED_PENDING` cho 2 trạng thái mới (xem Câu hỏi cho reviewer) |
| `docs/agents/BANG_CONG_VIEC.md` | DC-01 → REVIEW; ghi việc nối tiếp vào dòng DC-05, DC-06, DC-07 |

## Quyết định thiết kế
1. **`transitions.test.js` 14 → 20**: đặc tả đổi (DAC_TA mục 9, API_GD7 §0 thêm 6 thao tác), không phải nới test. Thêm các test chặt hơn cho từng dòng mới (nguồn/đích/vai trò/cờ).
2. **ENABLED_ACTIONS chưa bật 5 action GĐ7** (lệch câu chữ GD7 §0 "mọi action trừ CANCEL, COUNCIL_FINALIZE", đúng ý định): `ENABLED_ACTIONS` là danh sách action gọi được qua `POST /actions` và `TopicDetail.availableActions` lọc theo nó. `topicActionSchema` chưa có nhánh cho PUBLISH/UNPUBLISH/FINALIZE_GROUP/REQUEST_DEFENSE/RETURN_FROM_DEFENSE (endpoint thuộc DC-05/06/07) → bật sớm thì GVHD ở IN_PROGRESS thấy `REQUEST_DEFENSE` mà gọi ra 400, và đổi kết quả API của luồng cũ (T405 bắt được: `['REQUEST_CLOSE','REQUEST_DEFENSE']`). Danh sách `NOT_YET_IMPLEMENTED` có comment `shortcut:` chỉ rõ task nào gỡ; test shared khóa trạng thái hiện tại để task sau phải sửa có chủ ý. Khi DC-07 bật REQUEST_DEFENSE, T405 dòng 86 phải đổi theo đặc tả.
3. **`permissions.checkSimilarity` cho GV công bố** (GD7 §0.1) **chưa làm**: cần cột `Topic.origin` (DC-05) và mở `CHECKABLE` của endpoint kiểm tra (DC-05 §3.2 đã ghi). Thêm cờ giờ sẽ luôn `false` và lệch endpoint.
4. Thứ tự giá trị enum dùng `AFTER` để khớp vòng đời (DRAFT → RECRUITING; IN_PROGRESS → WAITING_DEFENSE) và khớp `schema.prisma` (tránh Prisma thấy lệch).
5. Không thêm `councilOfficerOnly` vào bộ lọc `availableActions` của `TopicDetail`: `COUNCIL_FINALIZE` không bao giờ trong `ENABLED_ACTIONS` nên không thể lọt ra.

## Rà giả định "có Advising ⇔ trạng thái ≥ HAS_ADVISOR" (m12 BM, GD7 §0.1)
Đã grep `advisings`, `endAt: null`, `'advisor'`, `isCurrentAdvisor`, `advising.` trong `topics/{service,listService,advisorRepo,prismaRepo,closeConditions}.js`, `stats/*`, `changeRequests/*`, `notifications/notify.js`, `execution/*`.

| Chỗ | Hành vi khi Advising có ở DRAFT/RECRUITING | Kết luận |
|---|---|---|
| `topics/service.js` `relations/canView/canReadExecution` | GV công bố là `isCurrentAdvisor` của nháp của mình → xem/đọc được | Đúng ý (GD7 §3.2) |
| `topics/service.js` `permissions.*` (`manageMilestones`, `giveFeedback`, `enterResult`, `requestCancel`, `reopenMilestone`) | đều kèm `status === 'IN_PROGRESS'` | Không ảnh hưởng |
| `topics/service.js` `requestAdvisorChange` | `ADVISOR_CHANGE_STATUSES` không có DRAFT/RECRUITING | FR19 không chạy ở 2 trạng thái này – đúng |
| `topics/listService.js:16` phạm vi GV | GV thấy đề tài DRAFT/RECRUITING của mình | Đúng ý |
| `topics/listService.js:47` lọc `lecturerId`, `stats/prismaRepo.js:16,32` | cán bộ/thống kê loại DRAFT như cũ; RECRUITING (hoạt động) được tính cho GV | Đúng (RECRUITING chiếm hạn mức GV – GD7 §3.3) |
| `topics/advisorRepo.js:12` `countLecturerActive` | đếm RECRUITING (hoạt động), không đếm DRAFT | Đúng (hạn mức kiểm lúc công bố) |
| `notifications/notify.js:39–45` `to: ['advisor']` | GV nháp nhận thông báo nếu có sự kiện; ở DRAFT/RECRUITING chưa có sự kiện nào gửi `'advisor'` ngoài các luồng GĐ7 mới | Không ảnh hưởng luồng cũ |
| `closeConditions.js:32`, `execution/lock.js:20`, `execution/prismaRepo.js:77` | chỉ dùng ở IN_PROGRESS/WAITING_CLOSE | Không ảnh hưởng |
| `changeRequests/service.js:58,79`, `prismaRepo.js:19,30` | yêu cầu thay đổi chỉ tạo ở IN_PROGRESS/ADVISOR_CHANGE_STATUSES | Không ảnh hưởng |
| `topics/service.js` `present()` `availableActions` với `currentAdvisorOnly` | GV nháp đủ điều kiện PUBLISH; hiện bị `NOT_YET_IMPLEMENTED` chặn | DC-05 bật |
| **`tests/T203-qa-seed.test.js` TC-FR16-20** | khẳng định mọi Advising hiện hành có AdvisorRequest ACCEPTED cùng GV | **Giả định cũ còn trong test.** Seed hiện chưa có đề tài GV công bố nên vẫn xanh; DC-05 seed RECRUITING sẽ phải sửa ca này theo GD7 (đã ghi vào bảng việc) |
| `rounds/prismaRepo.js:31` G45 (PATCH đợt không làm đề tài khóa sửa thành thiếu trường) | chỉ xét WAITING_ADVISOR/HAS_ADVISOR; RECRUITING cũng khóa sửa hồ sơ | Ngoài phạm vi DC-01 – xem Câu hỏi #2 |

## Điều kiện đạt ↔ test
| Điều kiện đạt (trích GD7 §0 / bảng việc) | Test case | Kết quả |
|---|---|---|
| 2 trạng thái mới, có nhãn, là đề tài hoạt động | `transitions.test.js` "2 trạng thái mới…" | Đạt |
| 6 dòng TRANSITIONS đúng nguồn/đích/vai trò/cờ; 20 dòng, mã duy nhất | `transitions.test.js` "có đúng 20…", "6 thao tác GĐ7…" | Đạt |
| `councilOfficerOnly`: chỉ chủ tịch/thư ký; GVHD/SV/ADMIN 403; sai trạng thái 409 | `stateMachine.test.js` "COUNCIL_FINALIZE…" | Đạt |
| `ENABLED_ACTIONS` không có `CANCEL`, `COUNCIL_FINALIZE` | `transitions.test.js` "ENABLED_ACTIONS…"; T405 cũ | Đạt |
| `UNPUBLISH_RECRUITMENT` bắt buộc lý do | `stateMachine.test.js` "UNPUBLISH_RECRUITMENT…" | Đạt |
| PUBLISH: chỉ GVHD hiện hành, FR06 lỗi không coi là không trùng | `stateMachine.test.js` "PUBLISH_RECRUITMENT…" | Đạt |
| RETURN_FROM_DEFENSE: chỉ cán bộ trong phạm vi + lý do; REQUEST_DEFENSE chỉ GVHD | `stateMachine.test.js` "REQUEST_DEFENSE…" | Đạt |
| `PRE_APPROVAL_STATUSES` + RECRUITING (rời tự do) | `T603-leave.test.js` "GĐ7 (TASK-DC-01)…" (DB thật) | Đạt |
| Kho so FR06 đúng nhóm | `similarity.test.js` "GĐ7 §0.1…"; T203 "kho so FR06 đúng phạm vi" (dùng chung hằng) | Đạt |
| Migration riêng chỉ ADD VALUE, áp được | `npm run db:test:reset` (migrate reset áp đủ 11 migration) + T203 `migrate deploy` trên DB phụ | Đạt |
| ADMIN không có thao tác nghiệp vụ (FR25) | `transitions.test.js` "ADMIN không có thao tác…" (lặp mọi trạng thái kể cả 2 mới) | Đạt |
| Luồng cũ giữ nguyên | toàn bộ `npm test` | Đạt |

## Bằng chứng chạy lệnh
```
$ npx -w @nckh/api prisma generate
Error: EPERM: operation not permitted, rename '...\.prisma\client\query_engine-windows.dll.node.tmp20780' -> '...query_engine-windows.dll.node'
```
(DLL engine đang bị tiến trình dev khác giữ; phần JS client vẫn sinh mới – `node_modules/.prisma/client/index.js` có `WAITING_DEFENSE`; engine cùng phiên bản nên không cần thay.)
```
$ npm run db:test:reset
  └─ 20261111000000_audit_actor_fk/
    └─ migration.sql
  └─ 20261118000000_dc_status_enum/
    └─ migration.sql
Running generate... (Use --skip-generate to skip the generators)
EPERM: operation not permitted, rename ... (như trên)
Đã reset DB test (migrate reset).

$ npm run lint
> lint
> eslint . --max-warnings 0
(không lỗi, không cảnh báo)

$ npm test
 Test Files  7 passed (7)
      Tests  77 passed (77)
   Start at  15:33:54
   Duration  549ms (transform 258ms, setup 0ms, import 1.89s, tests 101ms, environment 1ms)

 Test Files  72 passed (72)
      Tests  978 passed (978)
   Start at  15:33:55
   Duration  137.66s (transform 1.45s, setup 0ms, import 29.53s, tests 97.51s, environment 5ms)

 Test Files  32 passed (32)
      Tests  245 passed (245)
   Start at  15:36:13
   Duration  15.12s (transform 5.42s, setup 16.65s, import 31.66s, tests 49.34s, environment 98.32s)
exit=0
```
Tổng: 1300/1300 đạt (shared 77, api 978, web 245). Lần chạy đầu (trước quyết định 2 và `SEED_PENDING`) đỏ 2 ca: T203 seed "3 đề tài mỗi trạng thái" và T405 `availableActions` – cả hai được xử lý như trên, không làm yếu ca cũ nào khác.

## Còn lại / rủi ro
- E2E chưa chạy (điều phối viên chạy). Web chưa có màu `StatusBadge` cho 2 trạng thái (DC-12); badge hiện nhãn đúng nhưng tông mặc định.
- DC-05/06/07 phải gỡ action khỏi `NOT_YET_IMPLEMENTED`, seed 3 đề tài mỗi trạng thái mới và gỡ `SEED_PENDING`, sửa TC-FR16-20 (đã ghi vào dòng bảng việc).
- Migration enum không đảo được (Postgres không DROP VALUE); vô hại vì chỉ thêm giá trị.
- `prisma generate` lỗi EPERM do DLL bị khóa: nơi khác (CI, máy không chạy dev server) `prisma generate`/`migrate reset` sinh client bình thường; ở máy này nên chạy lại `prisma generate` sau khi tắt dev server.

## Câu hỏi cho reviewer
1. `T203-schema.test.js` "3 đề tài mỗi trạng thái": tôi thêm `SEED_PENDING = ['RECRUITING', 'WAITING_DEFENSE']` thay vì seed ngay, vì dữ liệu mẫu hợp lệ cho 2 trạng thái này cần model chưa có (`Topic.origin`, `TopicApplication` – DC-05; `ProcessScore`, báo cáo FINAL – DC-07), và seed RECRUITING sẽ vi phạm bất biến cũ của T203-qa-seed (một trưởng nhóm, Advising có AdvisorRequest ACCEPTED). Ca vẫn kiểm chính xác 2 trạng thái này có **0** đề tài (không bỏ qua im lặng), mọi trạng thái cũ vẫn đúng 3. Nếu reviewer coi đây là làm yếu test, phương án thay: seed ngay 3 WAITING_DEFENSE (cần thêm 3 SV → đổi hằng 51 người dùng/40 SV) và 3 RECRUITING (phải sửa TC-FR16-20).
2. G45 (`rounds/prismaRepo.js:31`) chỉ chặn PATCH đợt làm thiếu trường hồ sơ ở WAITING_ADVISOR/HAS_ADVISOR. Đề tài RECRUITING cũng không sửa được hồ sơ (chỉ ngừng tuyển rồi sửa – gỡ hết thành viên). Có nên thêm RECRUITING vào G45 ở DC-05 không? Tôi không đổi vì thiết kế GD7 không nêu.
