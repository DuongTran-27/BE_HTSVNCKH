# TASK-DC-07 – Điểm quá trình, đề nghị ra hội đồng, migration `dc_council` (FR34 + nền FR35–FR37)
- Agent: backend-dev · Trạng thái: REVIEW · Ngày: 2026-11-18
- FR/NFR: FR34, FR27, FR35 (trả về), NFR03 · Phụ thuộc đã đọc: TASK-DC-01, DC-05, DC-06 (báo cáo), `reviews/TASK-DC-06-bao-mat-v1.md` (m1, m2), `design/API_GD7.md` §0, §1.3, §2.1–2.4, §5, §7.4, §11, G52, G59, bảng "Vòng sửa 1" (M4, M6), `docs/DAC_TA.md` mục 9, `CAU_HOI.md` #13 (đã chốt)

## Đã làm
- Migration `20261118000400_dc_council`: enum `CouncilRole`, `DefenseDecision`, `ResultSource`; bảng `ProcessScore`, `Council`, `CouncilMember`, `CouncilAssignment`, `DefenseScore` (đúng §2.2, quan hệ ngược ở User/Topic/Faculty/Round); `ResultVersion.source` mặc định `ADVISOR` + backfill `STAFF` cho bản do cán bộ tạo; toàn bộ SQL §2.3 (RLS 5 bảng, `council_code_seq`, 3 partial unique index, trigger chỉ-thêm ProcessScore, `council_assignment_guard`, `defense_score_guard`). SQL Prisma sinh bằng `prisma migrate diff` (không cần DB), phần thô viết tay.
- Shared: `scoreSchema`, `gradeFromDefenseScore`, `DEFAULT_ROUND_CONFIG.requireDefense = false`, `defenseGrades = {9, 7, 5}` (gộp sâu trong `effectiveRoundConfig`; `roundConfigSchema`: boolean, 0..10, `pass = 5`, `pass ≤ good ≤ excellent`), `MIN_PROCESS_SCORE`, `COUNCIL_ROLE`/`DEFENSE_DECISION`/`RESULT_SOURCE` + nhãn, thông báo `DEFENSE_REQUESTED`, `DEFENSE_RETURNED`; nhánh `REQUEST_DEFENSE`, `RETURN_FROM_DEFENSE` của `topicActionSchema`. Gỡ `NOT_YET_IMPLEMENTED` → `ENABLED_ACTIONS` = mọi action trừ `CANCEL`, `COUNCIL_FINALIZE` (đúng GD7 §0).
- `defenseService`/`defenseRepo` (qua `POST /api/topics/:id/actions`): REQUEST_DEFENSE theo thứ tự §5.1 (quyền/trạng thái → version → điểm ≥ 5 → mốc như đóng → FINAL READY), dưới khóa Topic kiểm lại GVHD hiện hành + mốc + báo cáo → ProcessScore → StatusHistory → AuditLog `TOPIC_REQUEST_DEFENSE` → thông báo cán bộ + thành viên. RETURN_FROM_DEFENSE: cán bộ trong phạm vi, lý do bắt buộc (`REASON_REQUIRED`), hủy phân công mở bằng `UPDATE … RETURNING`, thông báo GVHD, thành viên, thành viên hội đồng của phân công vừa hủy.
- `DEFENSE_REQUIRED` (REQUEST_CLOSE, kiểm sớm + dưới khóa, bỏ qua khi kết quả hiện hành FAIL hoặc nguồn COUNCIL); `hasFinalResult` nhận nguồn COUNCIL; `COUNCIL_RESULT_LOCKED` ở `POST /results` (dưới khóa Topic); nguồn ghi đúng: GVHD `ADVISOR`, FR23 và `CLOSE_EXPIRED` `STAFF`. `ResultView.source`, `TopicDetail.currentResult.source`, `TopicDetail.processScore` (chuỗi 2 chữ số, chỉ `canReadExecution`).
- Seed: 3 đề tài WAITING_DEFENSE (một đề tài đi vòng REQUEST → RETURN_FROM_DEFENSE → REQUEST), có báo cáo FINAL dạng link, mốc Đạt, ProcessScore 7.25/8.50/6.75; bỏ `SEED_PENDING` ở T203-schema.
- MINOR DC-06: m1 G51/FINALIZE_GROUP/UNPUBLISH audit + thông báo theo dòng `UPDATE … RETURNING` (thêm test chen hook); m2 thêm ca 400 FINALIZE_GROUP vào DC06 #9 và sửa comment DC05.

## File thay đổi
| File | Thay đổi |
|---|---|
| `apps/api/prisma/schema.prisma` | 3 enum, 5 model, `ResultVersion.source`, quan hệ ngược |
| `apps/api/prisma/migrations/20261118000400_dc_council/migration.sql` | mới (§2.1–2.3 + backfill source) |
| `apps/api/prisma/seed.js` | 3 đề tài WAITING_DEFENSE; đề tài GV công bố dời sang chỉ số 33–35; đề tài 0–2 chỉ còn trưởng nhóm (giải phóng SV 30–32 làm trưởng nhóm mới) |
| `apps/api/src/modules/topics/defenseService.js`, `defenseRepo.js` | mới |
| `apps/api/src/modules/topics/{routes,prismaRepo}.js` | nối `DEFENSE_ACTIONS`; `DETAIL_INCLUDE` + `processScores`, `results.source` |
| `apps/api/src/modules/topics/{closeConditions,closeService,stateMachine}.js` | `hasFinalResult` nguồn COUNCIL, `defenseRequired`, `DEFENSE_REQUIRED`, `CLOSE_EXPIRED` ghi STAFF |
| `apps/api/src/modules/topics/service.js` | `currentResult.source`, `processScore` |
| `apps/api/src/modules/execution/feedbackService.js` | `COUNCIL_RESULT_LOCKED`, `source` ADVISOR/STAFF, `presentResult.source` |
| `apps/api/src/modules/topics/{applicationRepo,applicationService,recruitmentRepo,recruitmentService}.js` | m1: `withdrawOtherPending`, `declinePendingApplications` (`UPDATE … RETURNING`) |
| `packages/shared/src/{enums,labels,catalog,schemas,transitions}.js` | như mục Đã làm |
| `packages/shared/src/defense.test.js` | mới – 9 test unit |
| `apps/api/tests/DC07-defense.test.js` | mới – 20 test (3 unit + 17 DB thật) |
| Test cũ đổi theo đặc tả | `transitions.test.js`, `T405-close`, `DC05-recruitment`, `T203-schema`, `T204-audit`, `T501-notifications`, `apps/web/tests/admin.test.jsx`; `DC06-applications` thêm ca (xem Câu hỏi cho reviewer) |
| `docs/agents/BANG_CONG_VIEC.md` | DC-07 → REVIEW |

## Quyết định thiết kế
1. **Nộp tài liệu ở WAITING_DEFENSE trả `TOPIC_NOT_EDITABLE`, không phải `TOPIC_NOT_IN_PROGRESS`** (lệch câu chữ §5.6 #1): bước kiểm sớm có sẵn của `documentService.precheck` (T403) trả `TOPIC_NOT_EDITABLE` cho mọi trạng thái không nộp được (WAITING_CLOSE, CLOSED, UNDER_REVIEW…) và có test cũ khóa hành vi này. Điều kiện FR34 "SV không nộp/sửa được gì" đạt (409, không có Document mới); cập nhật tiến độ, nhận xét, nhập kết quả trả đúng `TOPIC_NOT_IN_PROGRESS`. Không thêm nhánh riêng cho một trạng thái.
2. Điểm quá trình truyền thẳng số đã qua `scoreSchema` vào cột `Decimal(4,2)`; trả ra `toFixed(2)` của `Decimal` (không qua số thực).
3. `RETURN_FROM_DEFENSE` dùng `reason` tùy chọn ở schema (như UNPUBLISH) để `checkTransition` trả `REASON_REQUIRED` đúng §5.6 #5.
4. Backfill `source = STAFF` trong migration phải tắt tạm `result_version_guarded` (trigger chỉ cho hạ `isCurrent`) – trong cùng transaction migration, bật lại ngay.
5. `CouncilAssignment.decidedBy` đặt `onDelete: Restrict` (Prisma mặc định SetNull cho quan hệ tùy chọn; SetNull sẽ va trigger "đã chốt bất biến" và mất "ai chốt").
6. Thứ tự khóa: REQUEST/RETURN_FROM_DEFENSE khóa Topic (updateMany) rồi mới ghi `CouncilAssignment`; DC-09 chốt khóa Council FOR SHARE → Topic → Assignment – cùng chiều Topic → Assignment, không chu trình.
7. `availableActions` GVHD ở IN_PROGRESS có `REQUEST_DEFENSE` cả khi đợt không bắt buộc hội đồng (luồng tùy chọn theo DAC_TA mục 9); khi `requireDefense` tắt, REQUEST_CLOSE không đổi (T405 xanh).

## Điều kiện đạt ↔ test
| Điều kiện (GD7 §5.6 / bảng việc) | Test | Kết quả |
|---|---|---|
| #1 điểm 7,25 → WAITING_DEFENSE, ProcessScore 7.25, StatusHistory, AuditLog, thông báo; SV không nộp/cập nhật; GVHD không nhập kết quả | DC07 "§5.6 #1 …" | Đạt (mã nộp tài liệu: QĐ 1) |
| #2 4,99 → PROCESS_SCORE_TOO_LOW không lưu; thiếu FINAL (kể cả bản UPLOADING) → NO_FINAL_REPORT; mốc → MILESTONES_NOT_PASSED; không mốc → NO_REQUIRED_MILESTONE; biên 5,00 đạt | DC07 "§5.6 #2 …" | Đạt |
| 403 SV/GV khác/cán bộ/ADMIN; 409 sai trạng thái/version | DC07 "403 vai trò…" | Đạt |
| #3 10,001/5,555/"abc" → 400 tại `processScore` | DC07 "§5.6 #3", shared `defense.test.js` | Đạt |
| #4 requireDefense: GOOD → DEFENSE_REQUIRED, FAIL → 200; tắt → 200; kiểm lại dưới khóa | DC07 "§5.6 #4", unit "REQUEST_CLOSE: …dưới khóa" | Đạt |
| #5 thiếu lý do → REASON_REQUIRED; phân công mở → cancelledAt + lý do, điểm giữ, phân công đã chốt không đổi; thông báo; 403 vai trò | DC07 "§5.6 #5" ×2 | Đạt |
| #6 sửa/xóa/TRUNCATE ProcessScore bị trigger chặn; guard CouncilAssignment/DefenseScore; partial unique; sequence; RLS; index/trigger có trong pg_* | DC07 "§5.6 #6 + §2.3" ×3; T203 RLS mọi bảng; T204 TRUNCATE | Đạt |
| #7 REQUEST_DEFENSE ‖ duyệt thay GV: đúng một thành công, không ProcessScore của GV cũ sau endAt | DC07 "§5.6 #7" ×4 lượt + unit kiểm GVHD dưới khóa | Đạt |
| #8 COUNCIL FAIL → RETURN_TO_ADVISOR → POST /results → COUNCIL_RESULT_LOCKED, vẫn FAIL COUNCIL | DC07 "#8" | Đạt |
| #9 requireDefense, COUNCIL GOOD → trả lại → REQUEST_CLOSE 200 → CONFIRM_CLOSE 200 | DC07 "#9" | Đạt |
| `source` ADVISOR/STAFF (FR23, CLOSE_EXPIRED); `hasFinalResult` nhận COUNCIL | DC07 "§5.5", unit | Đạt |
| `scoreSchema`, `gradeFromDefenseScore` biên 4.99/5/6.99/7/8.99/9, cấu hình đợt | shared `defense.test.js` | Đạt |
| T405 `availableActions` GVHD IN_PROGRESS | T405 "REQUEST_CLOSE …" | Đạt |
| Seed 3 WAITING_DEFENSE, lịch sử hợp lệ, người thực hiện đúng, giới hạn SV/GV | T203-schema, T203-qa-seed | Đạt |
| m1 DC-06: đơn bị rút ngay trước câu cập nhật không bị báo/ghi sai (FINALIZE, UNPUBLISH, G51) | DC07 "MINOR DC-06 m1" ×2 | Đạt |
| m2 DC-06: FINALIZE_GROUP body sai → 400 tại `version` | DC06 "#9" | Đạt |

Thử đột biến (sao lưu bằng `cp`, khôi phục, `cmp` xác nhận giống bản gốc):
| Đột biến | Test đỏ |
|---|---|
| Bỏ `COUNCIL_RESULT_LOCKED` | #8 |
| `defenseRequired` luôn false | #4, 2 unit |
| `hasFinalResult` bỏ nhánh COUNCIL | #8, #9, unit |
| Bỏ kiểm GVHD dưới khóa | unit REQUEST_DEFENSE |
| Bỏ kiểm lại mốc/báo cáo dưới khóa | unit REQUEST_DEFENSE |
| Không hủy phân công khi trả về | #5 |
| Thông báo theo danh sách đọc (kiểu cũ) thay vì RETURNING | m1 FINALIZE/UNPUBLISH |

## Bằng chứng chạy lệnh
```
$ npm run db:test:reset
  └─ 20261118000400_dc_council/
    └─ migration.sql
Running generate... EPERM: operation not permitted, rename '...query_engine-windows.dll.node.tmp20072' -> '...query_engine-windows.dll.node'
Đã reset DB test (migrate reset).
```
(EPERM như DC-01: DLL engine bị tiến trình khác giữ; client JS đã sinh mới – `node_modules/.prisma/client/index.js` có `ResultSource`, `processScore`.)
```
$ npx vitest run tests/DC07-defense.test.js   (3 lần liên tiếp)
      Tests  20 passed (20)
      Tests  20 passed (20)
      Tests  20 passed (20)

$ npm run lint
> lint
> eslint . --max-warnings 0
lint_exit=0

$ npm test
test_exit=0
 Test Files  8 passed (8)
      Tests  100 passed (100)
   Start at  21:06:05
   Duration  553ms (transform 275ms, setup 0ms, import 1.99s, tests 109ms, environment 1ms)
 Test Files  80 passed (80)
      Tests  1126 passed (1126)
   Start at  21:06:06
   Duration  153.18s (transform 1.20s, setup 0ms, import 33.19s, tests 108.56s, environment 5ms)
 Test Files  32 passed (32)
      Tests  245 passed (245)
   Start at  21:08:40
   Duration  14.46s (transform 4.01s, setup 15.50s, import 29.78s, tests 46.08s, environment 94.12s)
```
Tổng 1471/1471 đạt (shared 100, api 1126, web 245). Lần chạy đầy đủ đầu tiên đỏ 3 ca đếm/hình dạng (T204, T501, web admin) – xử lý ở Câu hỏi cho reviewer 4–6.

## Còn lại / rủi ro
- E2E chưa chạy (điều phối viên). Seed đổi: đề tài 0–2 (Nháp) không còn thành viên được mời; đề tài GV công bố sang chỉ số 33–35 (GV hướng dẫn khác). Không test E2E nào dựa vào hai điểm này theo grep `apps/web/e2e`, nhưng chưa chạy để khẳng định.
- `isCouncilMember` (quyền đọc của hội đồng) là DC-08: ca #5 "thành viên HĐ mất quyền xem" hiện chỉ khẳng định 403 (đúng nhưng chưa có quyền để mất); DC-08 phải chạy lại ca này sau khi thêm quan hệ.
- Backfill `source = STAFF` không có test tự động (DB test luôn tạo mới qua migrate reset, không có dữ liệu cũ); câu SQL đơn giản, chạy một lần trên Supabase khi deploy.
- `council_code_seq` không được `resetData` restart (khác `topic_code_seq`); DC-08 nên thêm nếu test cần mã hội đồng cố định.
- Web chưa có UI cho `requireDefense`/`defenseGrades` (form đợt gửi nguyên `effectiveConfig` nên giữ giá trị khi sửa đợt) và nút "Đề nghị ra hội đồng" cần ô nhập điểm/nhận xét – các task web DC-xx.

## Câu hỏi cho reviewer
Các test cũ đổi (quy tắc 1 – đặc tả đổi, không nới):
1. `transitions.test.js`: khẳng định `ENABLED_ACTIONS` đủ 5 action GĐ7 và tập đầy đủ = mọi action trừ `CANCEL`, `COUNCIL_FINALIZE` (đúng GD7 §0; comment cũ yêu cầu DC-07 đổi dòng này).
2. `T405-close.test.js:86`: `['REQUEST_CLOSE']` → `['REQUEST_CLOSE', 'REQUEST_DEFENSE']` – DAC_TA mục 9 thêm lần chuyển IN_PROGRESS → WAITING_DEFENSE cho GVHD (đã báo trước ở DC-01 QĐ 2).
3. `DC05-recruitment.test.js` m1: bỏ `REQUEST_DEFENSE` khỏi danh sách phải trả `UNKNOWN_ACTION` (đã bật; body thiếu trường giờ là 400 `VALIDATION_ERROR`, có ca ở DC07 #3); CANCEL, COUNCIL_FINALIZE vẫn kiểm; comment chỉ đúng nơi có ca 400 (m2).
4. `T204-audit.test.js`: 12 → 13 trigger BEFORE TRUNCATE, thêm `ProcessScore` (GD7 §2.3 `process_score_no_truncate`). Danh sách vẫn so khớp chính xác.
5. `T501-notifications.test.js`: 37 → 39 (`DEFENSE_REQUESTED`, `DEFENSE_RETURNED` – GD7 §11); ca "mỗi loại có nhãn" giữ nguyên.
6. `apps/web/tests/admin.test.jsx`: `DEFAULTS` thêm `requireDefense: false`, `defenseGrades` – form đợt gửi nguyên cấu hình hiệu lực, `DEFAULT_ROUND_CONFIG` có thêm 2 khóa theo GD7 §2.4. Vẫn `toEqual`.
7. `T203-schema.test.js`: bỏ `SEED_PENDING` – giờ khẳng định đúng 3 đề tài cho **mọi** trạng thái (chặt hơn).
8. `DC06-applications.test.js` #9: chỉ thêm ca (m2), không sửa ca cũ.
Lệch thiết kế cần xác nhận: Quyết định 1 (mã lỗi nộp tài liệu ở WAITING_DEFENSE).
