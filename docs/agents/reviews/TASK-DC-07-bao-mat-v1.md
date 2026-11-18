# Review TASK-DC-07 – bao-mat – vòng 1
Kết luận: APPROVED

Tôi là reviewer duy nhất (chế độ tiết kiệm quota). Tôi không dựa vào báo cáo mà tự đọc `git diff` và các file chưa theo dõi: migration `20261118000400_dc_council`, `defenseService.js`, `defenseRepo.js`, `DC07-defense.test.js`, `defense.test.js`. Tôi đối chiếu với `stateMachine.js` (`checkTransition`, `applyTransitionTx`), `execution/feedbackService.js` + `prismaRepo.js` (`write` → `lockTopicForExecution` + `assertCurrentAdvisor`), `closeService.js`, `closeConditions.js`, `accounts/prismaRepo.js` (xóa user dựa vào FK RESTRICT → P2003), `tests/db.js` (`resetData`). Tài liệu đối chiếu: GD7 §0, §2.2–2.4, §5, §7.4, Vòng sửa 1 (M4, M6), DAC_TA mục 9 (FR34, bảng chuyển trạng thái, tham số đợt), MINOR m1/m2 trong review DC-06. Tôi không đọc `.env` và không sửa code.

## Tôi đã tự kiểm tra
- `npm run lint` → `lint_exit=0`.
- `npm test` (DB test đang bật, chạy tuần tự) → `test_exit=0`: shared `8 files / 100 passed`; api `80 files / 1126 passed`; web `32 files / 245 passed`. Tổng 1471/1471, khớp báo cáo.
- Không viết test tấn công riêng. Các đường quyền đã có ca trong DC07 và xanh ở lần chạy trên: SV, GV khác, cán bộ khác khoa, ADMIN, GVHD gọi RETURN, sai version. Phần khóa và thứ tự khóa tôi kiểm bằng cách đọc code (xem dưới).
- `git diff` + file mới: không có chuỗi kết nối hay khóa bí mật.

## Đối chiếu đặc tả
| Điều kiện | Đạt? | Ghi chú |
|---|---|---|
| Migration khớp GD7 §2.2–2.3 | Đạt | 3 enum, 5 bảng, FK RESTRICT. SQL thô giống từng dòng §2.3 |
| RLS 5 bảng mới (M6) | Đạt | `ENABLE ROW LEVEL SECURITY` ×5, không có policy. T203 "RLS mọi bảng" xanh mà không phải sửa; DC07 kiểm thêm `relrowsecurity` |
| ProcessScore chỉ thêm | Đạt | Trigger `forbid_mutation` chặn UPDATE/DELETE và TRUNCATE; T204 13 trigger dùng danh sách khớp chính xác |
| Guard CouncilAssignment/DefenseScore | Đạt (xem m1) | Đã chốt/hủy thì bất biến, không xóa được. Điểm bị khóa khi phân công đã chốt/hủy. Test chạy SQL thật |
| Partial unique + sequence | Đạt | `council_one_chair/secretary`, `council_assignment_one_open` kiểm qua `pg_indexes` và P2002; có `council_code_seq` (xem m3) |
| Backfill `source = STAFF` | Đạt khi đọc code (xem m2) | `UPDATE … FROM "User" WHERE role='STAFF'`. Chỉ cán bộ tạo ResultVersion qua FR23/CLOSE_EXPIRED; seed không có CLOSE_EXPIRED. Tắt `result_version_guarded` và bật lại trong cùng transaction migration; tên trigger đúng (migrate reset chạy qua) |
| Chỉ GVHD hiện hành, thang 10, ≥ 5,0 | Đạt | `currentAdvisorOnly` + `actors:[LECTURER]` (ADMIN, STAFF bị 403). `scoreSchema` cho 0..10, 2 chữ số, chỉ nhận number. `< 5` → `PROCESS_SCORE_TOO_LOW` trước tx (không lưu). Biên 5,00 đạt |
| REQUEST_DEFENSE kiểm lại dưới khóa | Đạt | Sau `updateMany` (khóa Topic) đọc lại `advisorId`, mốc, báo cáo FINAL READY. Nếu sai thì ném lỗi trong tx, rollback cả StatusHistory. Ca #7 (‖ duyệt thay GV) chạy 4 lượt, khẳng định không có ProcessScore sau `endAt`. Đột biến bỏ kiểm GVHD làm unit đỏ |
| RETURN_FROM_DEFENSE | Đạt | `canView` chạy trước để không lộ trạng thái. Sau đó `actors:[STAFF]`, `inStaffScope`, `reasonRequired` (≥ 5 ký tự). Phân công được hủy bằng `UPDATE … WHERE decidedAt IS NULL AND cancelledAt IS NULL RETURNING` trong tx sau khi khóa Topic. Điểm đã chấm vẫn giữ; phân công đã chốt không đổi. Thông báo chỉ gửi thành viên của hội đồng vừa bị hủy |
| `DEFENSE_REQUIRED` (§5.3) | Đạt | Chỉ áp cho REQUEST_CLOSE, kiểm sớm và kiểm lại dưới khóa (`cond.currentResult` đọc trong tx). Bỏ qua khi kết quả là FAIL hoặc nguồn COUNCIL. Khi `requireDefense` tắt thì `defenseRequired` = false nên luồng cũ giữ nguyên (T405 xanh, mặc định `false`) |
| `COUNCIL_RESULT_LOCKED` (M4) | Đạt | Kiểm trong `writeFeedback` (khóa Topic + GVHD hiện hành), trước `expectedVersion`. GVHD không ghi đè được kết quả hội đồng (#8); FR23 cán bộ đi đường khác (`writeCorrection`, chỉ CLOSED) |
| `source` ở mọi đường ghi ResultVersion | Đạt | GVHD → `ADVISOR`, FR23 → `STAFF`, CLOSE_EXPIRED → `STAFF` (grep `resultVersion.create`: chỉ có 2 repo + seed, seed dùng mặc định ADVISOR với người tạo là GV). Có test §5.5 |
| `hasFinalResult` nhận COUNCIL | Đạt | Nhánh GVHD giữ nguyên `createdById === advisorId` |
| TopicDetail không lộ dữ liệu | Đạt | `processScore` chỉ trả khi `canReadExecution` (thành viên, GVHD, cán bộ trong phạm vi, sau này thêm hội đồng; đúng §5.5 và FR36). Người không có quyền xem đề tài đã bị chặn 403 từ `canView`. `currentResult.source` chỉ là nhãn nguồn, cùng phạm vi với `currentResult` đã có, không chứa ID hay tên người |
| MINOR DC-06 m1 | Đạt | `withdrawOtherPending` (UPDATE … FROM Topic … RETURNING) và `declinePendingApplications` (UPDATE … RETURNING): audit và thông báo chỉ theo các dòng thực sự được cập nhật. Có test chen hook cho FINALIZE/UNPUBLISH/G51; đột biến về kiểu cũ làm test đỏ |
| MINOR DC-06 m2 | Đạt | DC06 #9 thêm 3 body sai cho FINALIZE_GROUP → 400 tại `version`; comment DC05 đã sửa đúng. Trường thừa bị Zod `object` bỏ đi chứ không trả 400, đúng như các nhánh khác của union |

Thứ tự khóa: REQUEST/RETURN khóa Topic trước rồi mới tới Assignment; DC-09 (§7.4) khóa Council FOR SHARE → Topic → Assignment. Hai bên cùng chiều Topic → Assignment nên không có chu trình. DC-08 khi hủy phân công cũng phải khóa Topic trước Assignment.

## Quyết định về các test bị đổi (quy tắc 1)
| Test | Quyết định | Lý do |
|---|---|---|
| `transitions.test.js` ENABLED_ACTIONS | Chấp nhận | Đúng GD7 §0. Vẫn so `toEqual` trên tập đầy đủ; vẫn khẳng định CANCEL/COUNCIL_FINALIZE không có trong tập |
| T405 `['REQUEST_CLOSE','REQUEST_DEFENSE']` | Chấp nhận | DAC_TA mục 9 thêm chuyển IN_PROGRESS → WAITING_DEFENSE cho GVHD. Vẫn so mảng chính xác |
| DC05 bỏ `REQUEST_DEFENSE` khỏi danh sách UNKNOWN_ACTION | Chấp nhận | Action đã được bật. 2 action nội bộ vẫn kiểm; ca 400 của body sai có ở DC07 #3 |
| T204 12 → 13 | Chấp nhận | Thêm `process_score_no_truncate` (§2.3); danh sách so khớp chính xác |
| T501 37 → 39 | Chấp nhận | `DEFENSE_REQUESTED/RETURNED` (§11); ca "mỗi loại có nhãn" giữ nguyên |
| web `admin.test.jsx` DEFAULTS | Chấp nhận | `DEFAULT_ROUND_CONFIG` thêm 2 khóa (§2.4); vẫn `toEqual` |
| T203 bỏ `SEED_PENDING` | Chấp nhận, chặt hơn | Giờ khẳng định đủ 3 đề tài cho mọi trạng thái |

Không test nào bị nới lỏng.

## Đánh giá lệch thiết kế
1. **Upload ở WAITING_DEFENSE trả `TOPIC_NOT_EDITABLE`, không phải `TOPIC_NOT_IN_PROGRESS`**: chấp nhận. Điều kiện FR34 "SV không nộp/sửa được gì" vẫn đạt: 409 và số Document không đổi (test #1). Mã này thống nhất với WAITING_CLOSE/CLOSED đã được T403 khóa hành vi. Đây chỉ là khác câu chữ, không mở thêm quyền. Đề nghị sửa câu chữ §5.6 #1 trong GD7 cho khớp.
2. **`decidedBy` onDelete Restrict**: chấp nhận, đúng hơn SetNull. SetNull sẽ va trigger "đã chốt bất biến" và làm mất thông tin ai chốt. Chọn Restrict cũng khớp cách xóa user hiện có (`accounts/prismaRepo.js` gặp P2003 thì trả 409, NFR05).
3. `availableActions` có REQUEST_DEFENSE cả khi đợt không bắt buộc hội đồng: đúng DAC_TA mục 9 (luồng tùy chọn).

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| m1 | MINOR | `migration.sql` (`defense_score_guard`, `council_assignment_guard`); thiết kế §2.3 giống hệt | `defense_score_guard` chỉ xét `NEW."assignmentId"`. Một câu UPDATE đổi `assignmentId` của điểm thuộc phân công đã chốt sang một phân công mở sẽ lọt. `council_assignment_guard` cho đổi `topicId`/`councilId` của phân công mở. Hiện không có API nào ghi các cột này nên không khai thác được | DC-09: `my-score` chỉ upsert theo `(assignmentId, memberId)` cố định. Nếu muốn chặn ở DB: thêm điều kiện `OLD."assignmentId"` (UPDATE) và cấm đổi `topicId`/`councilId`, kèm 1 test |
| m2 | MINOR | `migration.sql` (backfill) | Backfill `source = STAFF` không có test tự động. DB test luôn được tạo mới nên câu lệnh chạy trên tập rỗng | Trước khi deploy, đếm `ResultVersion` theo vai trò người tạo trên bản sao dữ liệu thật; hoặc thêm 1 test chạy lại đúng câu UPDATE (tắt/bật trigger trong tx) trên dữ liệu có sẵn |
| m3 | MINOR | `apps/api/tests/db.js:20` | `resetData` không restart `council_code_seq` (khác `topic_code_seq`). Hiện chưa ảnh hưởng | DC-08 thêm `ALTER SEQUENCE council_code_seq RESTART` khi có test cần mã hội đồng cố định |
| m4 | MINOR | `DC07-defense.test.js` (#5) | Ca "thành viên HĐ mất quyền xem" hiện luôn trả 403 vì chưa có `isCouncilMember`, nên chưa chứng minh được việc hủy làm mất quyền | Ghi vào dòng DC-08: sau khi thêm quan hệ, ca này phải phân biệt phân công mở (200) với phân công đã hủy (403) |

Ghi chú (không tính là vấn đề):
- `closeService` đọc `cfg.requireDefense` trước khi khóa. Nếu cán bộ bật/tắt đúng lúc GVHD gửi đóng thì chỉ lệch một lần, không khai thác được (giống ghi chú `minMembers` ở DC-06).
- E2E chưa chạy (việc của điều phối viên). Seed đã đổi chỉ số đề tài GV công bố (33–35) và gỡ thành viên được mời ở đề tài 0–2, nên cần chạy E2E trước khi commit.
- `.playwright-mcp/` không thuộc task này, không commit.

Tổng vòng 1: 0 BLOCKER, 0 MAJOR, 4 MINOR. Không chặn DONE; m1, m3, m4 gắn vào DC-08/DC-09, m2 xử lý trước khi deploy.
