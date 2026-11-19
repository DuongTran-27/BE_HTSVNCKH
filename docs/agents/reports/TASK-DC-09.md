# TASK-DC-09 – Chấm điểm và chốt nghiệm thu (FR36, FR37, FR27)
- Agent: backend-dev · Trạng thái: REVIEW · Ngày: 2026-11-19
- FR/NFR: FR36, FR37, FR27, FR25 · Phụ thuộc đã đọc: `reports/TASK-DC-07.md`, `reports/TASK-DC-08.md`, `reviews/TASK-DC-08-bao-mat-v1.md` (m1, m2, ghi chú 2), `design/API_GD7.md` §0, §1.1–1.3, §2.2–2.3, §5.5, §6, §7, §11; `docs/DAC_TA.md` mục 9 (FR36, FR37).

## Đã làm
- **`GET /api/council-assignments`** (LECTURER: hội đồng mình là thành viên; STAFF: khoa trong phạm vi; lọc `status=OPEN|DECIDED|CANCELLED`, `roundId`, phân trang, sắp `assignedAt ASC`) và **`GET /api/council-assignments/:id`** (thành viên hoặc STAFF trong phạm vi, còn lại 403) trả `AssignmentView` §7.1. Điểm là chuỗi 2 chữ số thập phân. Trước khi chốt, ủy viên nhận `scores: []` (chỉ `myScore`, `scoredCount`); chủ tịch, thư ký, cán bộ thấy đủ; sau chốt mọi thành viên thấy đủ. `availableActions`: `SCORE`, `FINALIZE` đúng §7.1.
- **`PUT /api/council-assignments/:id/my-score`** (§7.3): LECTURER, limiter 60/15 phút/user, `defenseScoreSchema`. `withLockTx`: Council `FOR SHARE` → Topic `FOR NO KEY UPDATE` → **đọc tư cách thành viên sau khóa** (403) → phân công mở (409 `ASSIGNMENT_DECIDED`, thông điệp riêng khi đã hủy) → `WAITING_DEFENSE` (409 `NOT_WAITING_DEFENSE`) → upsert `DefenseScore`. AuditLog `DEFENSE_SCORE_SET` `before/after: { score }` (không ghi nhận xét). Không gửi thông báo.
- **`POST /api/council-assignments/:id/finalize`** (§7.4): LECTURER, `defenseFinalizeSchema { version, minutes }`. `withLockTx`: Council `FOR SHARE` → Topic `FOR NO KEY UPDATE` → thành viên (403) → phân công mở (409) → `checkTransition(COUNCIL_FINALIZE, { isCouncilOfficer })` (ủy viên 403, sai trạng thái 409 `INVALID_TRANSITION`) → `version` (409 `CONCURRENT_UPDATE`) → đủ điểm của mọi thành viên hiện tại (409 `SCORES_INCOMPLETE` + `details.missing [{ fullName, role }]`) → `round(avg(score), 2)` bằng SQL → `decision` (≥ 5 → `PASSED`) → kết quả theo `defenseGrades` của đợt (`gradeFromDefenseScore`) → `applyTransitionTx` (StatusHistory `COUNCIL_FINALIZE`) → `updateMany` phân công còn mở → hạ `isCurrent` kết quả cũ rồi tạo `ResultVersion { source: COUNCIL, summary: minutes }` → AuditLog `COUNCIL_FINALIZE` + `RESULT_CREATE` → thông báo `DEFENSE_DECIDED` (nhóm, GVHD, hội đồng) và `CLOSE_REQUESTED` (cán bộ, khóa `CLOSE_REQUESTED:<topicId>:v<version sau>` như FR27). Trả `{ assignment, topic }`.
- **`TopicDetail`**: `defense` (§7.5, chỉ khi `canReadExecution`) với `state` `WAITING_ASSIGNMENT` / `ASSIGNED` / `DECIDED`; `scores` chỉ có khi `DECIDED`, hoặc với cán bộ trong phạm vi và `isCouncilOfficer`. `councilAccess: { assignmentId, role } | null` (chỉ khi `isCouncilMember`). Quan hệ mới `isCouncilOfficer` trong `relations()` (chủ tịch/thư ký trên phân công chưa chốt, đề tài chưa đóng/hủy). `processScore` đã có từ DC-07.
- Shared: `defenseScoreSchema`, `defenseFinalizeSchema`, `assignmentListQuerySchema`; loại thông báo `DEFENSE_DECIDED` + nhãn. `COUNCIL_FINALIZE` **giữ ngoài** `ENABLED_ACTIONS` theo GD7 §0 (chỉ chạy trong `finalize`), không sửa `transitions.js`.
- OpenAPI: thêm 4 route.
- **MINOR m1 (BM DC-07)**: migration `20261119000100_dc_council_scoring` thay thân `defense_score_guard` (UPDATE không được đổi `id`/`assignmentId`/`memberId`, nên không chuyển được điểm từ phân công đã chốt sang phân công mở) và `council_assignment_guard` (phân công mở không được đổi `id`/`topicId`/`councilId`/`assignedById`/`assignedAt`). Tên trigger giữ nguyên.
- **MINOR m1 (BM DC-08)**: `my-score`/`finalize` khóa Council `FOR SHARE` rồi mới đọc `CouncilMember` của me; thêm test đồng thời §6.6 #6 nhánh "đổi thành viên trước → chấm 403" (TC-FR36-09).
- **MINOR m2 (BM DC-08)**: `councilRouters()` tạo **một** limiter ghi 30/15 phút/user dùng chung cho `/api/councils` (ghi) và `/api/council-assignments` (hủy, chốt). `app.js` mount qua hàm này.

## File thay đổi
| File | Thay đổi |
|---|---|
| `apps/api/src/modules/councils/service.js` | `presentDefenseScores`, AssignmentView, `listAssignments`, `getAssignment`, `setMyScore`, `finalize` |
| `apps/api/src/modules/councils/prismaRepo.js` | ops chấm/chốt (`myRole`, `upsertScore`, `missingScores`, `averageScore`, `transition`, `decideAssignment`, kết quả), `findAssignment`, `listAssignments`; `lockTopic` trả thêm `status, version, roundId` |
| `apps/api/src/modules/councils/routes.js` | 4 route mới; `councilRouters` với limiter dùng chung (thay 2 export cũ) |
| `apps/api/src/app.js` | mount qua `councilRouters` |
| `apps/api/src/modules/topics/prismaRepo.js` | `COUNCIL_SEATS` thêm `id, decidedAt, role`, sắp mới nhất trước; `DEFENSE_SEATS` cho chi tiết |
| `apps/api/src/modules/topics/service.js` | `isCouncilOfficer`, `defense`, `councilAccess` |
| `apps/api/src/openapi/spec.js` | 4 route |
| `apps/api/prisma/migrations/20261119000100_dc_council_scoring/migration.sql` | mới – trigger (m1 DC-07) |
| `packages/shared/src/{schemas,enums,labels}.js` | 3 schema, `DEFENSE_DECIDED` |
| `apps/api/tests/DC09-scoring.test.js` | mới – 21 test (1 unit schema + 20 DB thật) |
| `apps/api/tests/T501-notifications.test.js` | 43 → 44 loại thông báo (xem Câu hỏi 1) |
| `docs/agents/BANG_CONG_VIEC.md` | DC-09 → REVIEW |

## Quyết định thiết kế
1. **Khóa Topic bằng `FOR NO KEY UPDATE` trước khi kiểm, rồi mới `applyTransitionTx`** (thay vì để `updateMany` của applyTransitionTx là bước khóa đầu tiên như §7.4 bước 1). Cách này cho đọc `status`/`version` dưới khóa để trả đúng mã (403/409) trước khi ghi. Thứ tự khóa vẫn Council → Topic → Assignment, cùng chiều với hủy phân công (DC-08) và RETURN_FROM_DEFENSE (Topic → Assignment). Chấm điểm cũng khóa Topic, nên chấm ‖ chốt tuần tự hóa: `finalScore` luôn bằng trung bình điểm trong DB lúc chốt (§7.6 #5).
2. **Thứ tự kiểm finalize**: thành viên (403) → phân công mở (409 `ASSIGNMENT_DECIDED`) → `checkTransition` (403 ủy viên / 409 trạng thái) → version → đủ điểm. Hệ quả: ủy viên bấm chốt trên phân công **đã chốt** nhận 409 thay vì 403. Ủy viên vẫn đọc được phân công đó (§7.1) nên không lộ gì thêm.
3. **`averageScore` chỉ tính điểm của thành viên hiện tại** (`memberId IN CouncilMember`). Trên thực tế mọi điểm đều của thành viên hiện tại, vì đã có điểm thì không đổi thành viên được (`COUNCIL_LOCKED`). Điều kiện chỉ để phòng thủ.
4. **`defense.state`**: lấy phân công chưa hủy mới nhất. Mở → `ASSIGNED`. Nếu không có phân công mở mà đề tài đang `WAITING_DEFENSE` → `WAITING_ASSIGNMENT` (kể cả khi đề nghị lại sau một lần chốt). Còn lại, có phân công đã chốt → `DECIDED`. Không có gì → `null`. Đề tài bị trả về (RETURN_FROM_DEFENSE, phân công đã hủy) và đang IN_PROGRESS → `null` (GD7 không quy định ca này, xem Còn lại).
5. **AuditLog `COUNCIL_FINALIZE` ghi trên `CouncilAssignment`** (`entityId` = phân công, `after.topicId`). Lịch sử trạng thái đề tài nằm ở StatusHistory. GD7 §7.4 chỉ nêu `COUNCIL_FINALIZE` + `RESULT_CREATE`, nên tôi không ghi thêm `TOPIC_COUNCIL_FINALIZE`.
6. **Limiter cho `finalize`**: GD7 không quy định. Tôi dùng limiter ghi hội đồng dùng chung (30/15), cùng nhóm với hủy phân công. `my-score` dùng limiter riêng 60/15 theo §7.3.
7. GET `/api/council-assignments/:id` không thêm điều kiện G62. Thành viên vẫn đọc được phân công của đề tài đã CLOSED, cùng quy ước với `GET /api/councils/:id` (ghi chú 2 của review BM DC-08, đúng hình dạng §7.1). Chi tiết đề tài vẫn 403 sau khi đóng.

## Điều kiện đạt ↔ test (`apps/api/tests/DC09-scoring.test.js`)
| Điều kiện (GD7 §7.6 / FR) | Test | Kết quả |
|---|---|---|
| #8 điểm 11 / -1 / 7.333 → 400 tại `score` (schema + API, không lưu) | TC-FR36-01, TC-FR36-03 | Đạt |
| §7.3 chấm + sửa (upsert), AuditLog before/after không nhận xét, không thông báo | TC-FR36-02 | Đạt |
| §7.3 phân công hủy/chốt → `ASSIGNMENT_DECIDED`; không Chờ bảo vệ → `NOT_WAITING_DEFENSE`; 404 | TC-FR36-04 | Đạt |
| #9 SV, GVHD, GV ngoài HĐ, cán bộ, ADMIN gọi `my-score` → 403 | TC-FR36-05 | Đạt |
| Limiter `my-score` 60/15 | TC-FR36-06 | Đạt |
| #7 ủy viên `scores: []`, chủ tịch/cán bộ thấy đủ, sau chốt thấy đủ; `availableActions` | TC-FR36-07 | Đạt |
| §7.2 danh sách theo thành viên/phạm vi, lọc status; SV/ADMIN 403; chi tiết người ngoài 403 | TC-FR36-08 | Đạt |
| #1 8 / 7.5 / 6.75 → 7.42 PASSED, GOOD nguồn COUNCIL, WAITING_CLOSE, StatusHistory, audit, thông báo; SV thấy `defense` DECIDED; #10 CONFIRM_CLOSE → CLOSED, vào kho | TC-FR37-01 | Đạt |
| #2 trung bình 4.99 → FAILED/FAIL; đóng → không vào kho | TC-FR37-02 | Đạt |
| Quy đổi biên 9 / 7 / 5 → EXCELLENT / GOOD / PASS | TC-FR37-03 | Đạt |
| #3 thiếu 1 điểm → `SCORES_INCOMPLETE` + `missing`; ủy viên → 403; sai version; chốt lại → 409 | TC-FR37-04 | Đạt |
| #9 SV, GVHD, GV ngoài HĐ, cán bộ, ADMIN gọi `finalize` → 403 | TC-FR37-05 | Đạt |
| Kết quả cũ bị hạ `isCurrent`, bản COUNCIL là hiện hành | TC-FR37-06 | Đạt |
| #4 đồng thời chủ tịch ‖ thư ký chốt (4 lượt): [200, 409], 1 ResultVersion COUNCIL, 1 StatusHistory | TC-FR37-07 | Đạt |
| #5 đồng thời sửa điểm ‖ chốt (5 lượt): chốt 200; sửa 200 hoặc 409 `ASSIGNMENT_DECIDED`; `finalScore` = trung bình DB | TC-FR37-08 | Đạt |
| #11 đồng thời RETURN_FROM_DEFENSE ‖ chốt (4 lượt): đúng một thành công, trạng thái nhất quán | TC-FR37-09 | Đạt |
| §6.6 #6 nhánh đổi trước → chấm 403 (m1 BM DC-08) | TC-FR36-09 | Đạt |
| §7.5 `defense` WAITING_ASSIGNMENT/ASSIGNED, ẩn điểm với SV/GVHD/ủy viên, chủ tịch/cán bộ thấy; `councilAccess`; null khi chưa ra hội đồng | TC-FR37-10 | Đạt |
| #6 sửa điểm sau chốt bằng SQL → trigger; m1 DC-07: chuyển điểm sang phân công/thành viên khác, đổi đề tài/hội đồng của phân công mở → trigger | TC-FR37-11 | Đạt |
| m2 BM DC-08: hai router chung limiter 30/15 | TC-FR35-20 | Đạt |

Thử đột biến (sao lưu bằng `cp`, khôi phục xong `cmp` xác nhận khớp bản gốc): đọc tư cách thành viên **trước** khóa Council trong `setMyScore` → TC-FR36-09 đỏ (người bị bỏ vẫn chấm được, 200). Các test còn lại vẫn xanh.

## Bằng chứng chạy lệnh
DB test: embedded-postgres (như các task trước).
```
$ DB_TEST_DRIVER=embedded npm run db:test:up
K4 extension template1 = pg_trgm 1.6, unaccent 1.1 OK
Kiểm tra DB test: tất cả OK.
DB test đã chạy.
$ npm run db:test:reset
Đã reset DB test (migrate reset).

$ npx vitest run tests/DC09-scoring.test.js        (trong apps/api)
      Tests  21 passed (21)

$ npm run lint
> lint
> eslint . --max-warnings 0
lint_exit=0

$ npm test
test_exit=0
 Test Files  8 passed (8)
      Tests  100 passed (100)
 Test Files  82 passed (82)
      Tests  1198 passed (1198)
   Duration  154.11s
 Test Files  32 passed (32)
      Tests  245 passed (245)
   Duration  15.01s
```
Tổng 1543/1543 đạt (shared 100, api 1198, web 245). Lint và test chạy tuần tự, không có tiến trình test nào khác dùng DB test.

## Còn lại / rủi ro
- **E2E chưa chạy.** Task không đổi seed hay luồng cũ. `TopicDetail` chỉ thêm khóa `defense`, `councilAccess`. Web/API test hiện có đều xanh.
- `defense` cho đề tài bị trả về rồi đang IN_PROGRESS (chỉ có phân công đã hủy) là `null` (QĐ 4). Nếu FE (DC-15) cần hiện "đã từng ra hội đồng" thì bên thiết kế cần quyết định.
- TC-FR37-08 (#5) chạy đồng thời thật, nên nhánh nào thắng tùy lịch. Test khẳng định bất biến cho cả hai nhánh, nhưng không ép được cả hai nhánh đều xảy ra.
- Web chưa có màn chấm/chốt (DC-15). Liên kết `DEFENSE_DECIDED` trỏ tới `/de-tai/:id` (đã có).

## Câu hỏi cho reviewer
1. Test cũ bị đổi (quy tắc 1): `T501-notifications.test.js` số loại thông báo 43 → 44, vì GD7 §11 thêm `DEFENSE_DECIDED` (§7.4). Ca "mỗi loại có nhãn" giữ nguyên.
2. Đề nghị xác nhận QĐ 1 (khóa Topic tường minh trước `applyTransitionTx`), QĐ 2 (ủy viên trên phân công đã chốt nhận 409) và QĐ 6 (limiter của `finalize`).

## Sửa theo review bao-mat v1
m1 (MINOR): `AssignmentView` đọc dữ liệu sống của đề tài mà không xét phân công đã hủy / đề tài đã đóng. Sửa theo G62 (GD7 §1.1):
- `councils/service.js` `presentAssignmentView`: người không phải cán bộ STAFF trong phạm vi mà phân công đã hủy (`cancelledAt`) thì 403 (chọn 403 để khớp `isCouncilMember` của DC-08, thay vì chỉ che `processScore`). Đề tài CLOSED/CANCELLED thì thành viên vẫn đọc biên bản/điểm đã chốt nhưng `processScore` là `null`; cán bộ trong phạm vi không đổi.
- `listAssignments`: GV không thấy phân công đã hủy trong danh sách (AND với bộ lọc status, nên `status=CANCELLED` của GV trả rỗng); cán bộ vẫn thấy. Cần để danh sách khớp chi tiết (nếu không, phần tử `null` làm hỏng danh sách).
- Test: thêm vào TC-FR36-08 (hủy phân công → lecE/lecC/lecB 403, staff1 200; đề tài CLOSED + đã chốt → thành viên processScore null, cán bộ vẫn thấy 7.25).

Lệnh (tuần tự) và kết quả:
```
$ npm run lint            -> eslint . --max-warnings 0, không lỗi
$ npm test
shared: Test Files 8 passed (8)   Tests 100 passed (100)
api:    Test Files 82 passed (82) Tests 1198 passed (1198)
web:    Test Files 32 passed (32) Tests 245 passed (245)
```
Tổng 1543/1543. (Lần chạy đầu 1 test đỏ vì danh sách chưa lọc; đã sửa ở trên.)
