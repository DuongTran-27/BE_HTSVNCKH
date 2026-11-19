# Review TASK-DC-09 – bao-mat – vòng 1
Kết luận: APPROVED

Tôi tự đọc `git diff` (so với f005ad6) và các file chưa theo dõi: `modules/councils/{service,prismaRepo,routes}.js`, `topics/{service,prismaRepo}.js`, `app.js`, `openapi/spec.js`, `packages/shared/src/{schemas,enums,labels}.js`, migration `20261119000100_dc_council_scoring`, `tests/DC09-scoring.test.js`, `tests/T501-notifications.test.js`. Tôi đối chiếu với `topics/stateMachine.js` (`checkTransition`, `applyTransitionTx`), `shared/catalog.js` (`gradeFromDefenseScore`, `roundConfigSchema` ép `pass = 5`), `audit/service.js` (`listAudit` không có route nào gọi, nên điểm trong AuditLog `DEFENSE_SCORE_SET` không bị lộ qua API), và grep toàn `apps/api/src` các câu khóa `FOR UPDATE/SHARE/NO KEY UPDATE`. Tài liệu đối chiếu: DAC_TA mục 9 (FR36, FR37), API_GD7 §0, §1.1–1.3, §2.3, §5.4–5.5, §6, §7, §11; review DC-08 (m1, m2) và DC-07 (m1). Tôi không đọc `.env` và không sửa code.

## Tôi đã tự kiểm tra
```
$ DB_TEST_DRIVER=embedded npm run db:test:up
K4 extension template1 = pg_trgm 1.6, unaccent 1.1 OK
Kiểm tra DB test: tất cả OK.
DB test đã chạy.
$ npm run db:test:reset
Đã reset DB test (migrate reset).
$ npm run lint
lint_exit=0
$ npm test
test_exit=0
 Test Files  8 passed (8)    Tests  100 passed (100)     # shared
 Test Files  82 passed (82)  Tests  1198 passed (1198)   # api
 Test Files  32 passed (32)  Tests  245 passed (245)     # web
```
Tổng 1543/1543, khớp báo cáo. Lint và test chạy tuần tự, không có tiến trình test nào khác.

Tôi quét `git diff`, test và migration mới tìm chuỗi kết nối, khóa: không có (chỉ `testEnv.JWT_ACCESS_SECRET` trong test, lấy từ env test). Tôi không viết test tấn công riêng. Các đường tấn công chính (ủy viên đọc điểm người khác, người ngoài/SV/ADMIN/cán bộ gọi chấm/chốt, người bị bỏ khỏi hội đồng, chốt đồng thời, sửa điểm sau chốt bằng SQL) đều đã có ca trong DC09 và đang xanh. Phát hiện m1 dưới đây đọc ra thẳng từ code (presenter không có nhánh nào xét hủy/đóng), mức MINOR, nên tôi không viết thêm test.

## Đối chiếu đặc tả / danh mục bảo mật
| Điều kiện | Đạt? | Ghi chú |
|---|---|---|
| Ủy viên không thấy điểm người khác trước chốt (FR36, G53) | Đạt | `AssignmentView`: `scores` chỉ khi `decidedAt` / cán bộ trong phạm vi / CHAIR, SECRETARY (`councils/service.js:44`). Danh sách `GET /api/council-assignments` dùng cùng presenter (`:203`). `TopicDetail.defense.scores` chỉ khi DECIDED / `inStaffScope` / `isCouncilOfficer` (`topics/service.js:90`). `isCouncilOfficer` đòi phân công **chưa chốt** với vai trò CHAIR/SECRETARY (`topics/service.js:56`), nên chủ tịch của một hội đồng cũ đã chốt không thấy điểm của phân công mới. `GET /api/councils/:id` (`presentAssignment`) chỉ có `scoredCount` và `finalScore` (null trước chốt), không có điểm từng người. AuditLog có điểm nhưng không có endpoint đọc. Không gửi thông báo khi chấm |
| Chỉ chủ tịch/thư ký chốt | Đạt | `checkTransition` với `councilOfficerOnly` + `ctx.isCouncilOfficer` từ vai trò đọc **sau khóa** (`service.js:242-246`, `stateMachine.js:24`). TC-FR37-04: ủy viên 403 |
| ADMIN, SV, người ngoài HĐ 403 (FR25) | Đạt | Route: đọc `requireRole('STAFF','LECTURER')`, chấm/chốt `requireRole('LECTURER')` (`routes.js:37-38`), `businessRouter` có `requireAuth`. Service: GV ngoài hội đồng và GVHD bị `myRole` null → 403; cán bộ khoa khác → 403 khi đọc. TC-FR36-05, TC-FR37-05, TC-FR36-08 |
| Người bị bỏ khỏi hội đồng sau khóa → 403 (m1 BM DC-08) | Đạt | `lockCouncilShare` → `lockTopic` → `myRole` (`service.js:221-224`, `:240-243`). Đổi thành viên giữ `FOR UPDATE` nên xung đột với `FOR SHARE`. TC-FR36-09 chạy đồng thời thật, dev đã thử đột biến (đọc trước khóa → test đỏ) |
| IDOR `:id` | Đạt | `r.param('id', checkId)`; `findAssignmentBrief` chỉ lấy id, mọi quyết định dựa trên dữ liệu đọc lại dưới khóa. `getAssignment` 403 nếu không phải thành viên và không trong phạm vi |
| Thứ tự khóa, deadlock (§1.2) | Đạt | Chấm, chốt, hủy phân công: Council `FOR SHARE` → Topic `FOR NO KEY UPDATE` → Assignment. Gán: Council `FOR SHARE` → Topic (`ORDER BY id`). Đổi thành viên: chỉ Council `FOR UPDATE`. RETURN_FROM_DEFENSE: Topic → Assignment. Không đường nào khóa Topic rồi mới khóa Council, nên không có chu trình. Các INSERT (`DefenseScore`, `ResultVersion`, `StatusHistory`, `Notification`) lấy `FOR KEY SHARE` qua khóa ngoại, tương thích với `FOR NO KEY UPDATE` đang giữ trên Topic/User |
| Finalize khóa Topic trước `applyTransitionTx` | Đạt | Xem trả lời câu hỏi 3 |
| Trigger chống đổi khóa (m1 BM DC-07) | Đạt | `defense_score_guard`: UPDATE không đổi `id`/`assignmentId`/`memberId`, nên không chuyển được điểm từ phân công đã chốt sang phân công mở. `council_assignment_guard`: phân công mở không đổi `id`/`topicId`/`councilId`/`assignedById`/`assignedAt`. Thân hàm cũ giữ nguyên (DELETE bị chặn, phân công đã chốt/hủy bất biến, điểm khóa khi chốt/hủy). Trigger vẫn `BEFORE INSERT OR UPDATE OR DELETE`, tên giữ nguyên. TC-FR37-11 thử cả bốn đường |
| Trung bình, quyết định, xếp loại (FR37) | Đạt | `round(avg(score), 2)` bằng SQL trên `numeric`, chỉ điểm của thành viên hiện tại (`prismaRepo.js:80-82`), sau khi đã khẳng định mọi thành viên đều có điểm. `decision = finalScore.gte(5)`. Xếp loại theo `effectiveRoundConfig(...).defenseGrades` của đợt. `roundConfigSchema` ép `pass = 5` (`catalog.js:102`), nên `decision` và `result` không lệch nhau (PASSED ⇔ result ≠ FAIL). TC-FR37-01/02/03 kiểm 7.42, 4.99 và các biên 9/7/5 |
| ResultVersion `COUNCIL` + hạ bản cũ | Đạt | Hạ `isCurrent` trước khi tạo (`service.js:259-261`), cùng thứ tự như API_GD45 §6.4 (`result_one_current` không deferrable). `version = max + 1`. TC-FR37-06 |
| StatusHistory, audit (quy tắc 4) | Đạt | `applyTransitionTx` ghi StatusHistory `COUNCIL_FINALIZE` trong cùng tx. AuditLog `COUNCIL_FINALIZE` + `RESULT_CREATE`, `DEFENSE_SCORE_SET` (`before/after: { score }`, không ghi nhận xét), đều có `ip`. Tất cả nằm trong một `withLockTx` |
| Chốt đồng thời: đúng một thành công (FR37) | Đạt | Topic `FOR NO KEY UPDATE` tuần tự hóa; người sau thấy phân công đã chốt → 409. `decideAssignment` có điều kiện còn mở là chốt chặn thứ hai. TC-FR37-07: 4 lượt, 1 ResultVersion, 1 StatusHistory |
| Rate limit | Đạt | `my-score` 60/15 phút/user (TC-FR36-06). Một limiter ghi 30/15 dùng chung cho `/api/councils` ghi, hủy và chốt phân công (`routes.js:46`) – m2 BM DC-08 đã xử lý, TC-FR35-20 |
| Đầu vào (Zod) | Đạt | `defenseScoreSchema`, `defenseFinalizeSchema` là `strictObject`; `scoreSchema` từ DC-07; nhận xét 10..5000, biên bản 20..5000; query `status` là enum, `roundId` `.max(64)`, phân trang qua `pageQuery`. SQL thô dùng tagged template, không ghép chuỗi |
| Rò rỉ dữ liệu | Đạt, trừ m1 | `AssignmentView` không có email, `passwordHash`, token. Thông báo `DEFENSE_DECIDED` chỉ có mã và tên đề tài |

## Trả lời câu hỏi của dev
1. **`defense: null` cho đề tài đã RETURN_FROM_DEFENSE về IN_PROGRESS**: không phải vấn đề bảo mật, vì ẩn bớt chứ không lộ thêm. Có lệch chữ với §7.5 ("`null` nếu chưa từng đề nghị ra hội đồng"). Phân công đã hủy không mang kết quả nào để hiện, nên `null` an toàn. Ghi chú 1 chuyển cho kien-truc-su/DC-15 quyết định có cần trạng thái riêng hay không.
2. **Limiter 30/15 cho finalize**: chấp nhận. Chốt là thao tác ghi hiếm và tốn tài nguyên (khóa, kết quả, thông báo). Dùng chung với nhóm ghi hội đồng khớp tinh thần GD7 §6. Một CHAIR/SECRETARY thật không chạm ngưỡng này.
3. **Finalize khóa Topic `FOR NO KEY UPDATE` trước `applyTransitionTx`**: chấp nhận, và an toàn hơn §7.4 bước 1. Khóa vẫn đúng chiều Council → Topic → Assignment. `updateMany` trong `applyTransitionTx` chạy trên dòng đã giữ khóa cùng mức, nên không nâng khóa và không mở thêm cửa sổ deadlock. Đọc `status`/`version` dưới khóa trả đúng 403/409. Vì chấm cũng khóa Topic, `finalScore` luôn bằng trung bình trong DB lúc chốt.
4. **Ủy viên gọi finalize trên phân công đã chốt nhận 409 thay vì 403**: chấp nhận. Người gọi đã qua kiểm thành viên (403 với người ngoài vẫn đứng trước). Ủy viên vốn đọc được trạng thái đã chốt qua `GET /api/council-assignments/:id`, nên mã 409 không lộ thêm gì.
5. **TC-FR37-08 (§7.6 #5) là race thật, không ép được cả hai nhánh**: chấp nhận. Tính đúng đến từ việc tuần tự hóa trên khóa Topic, mà tôi đã kiểm bằng đọc code. Test khẳng định bất biến (`finalScore` = trung bình DB, sửa nhận 200 hoặc 409 `ASSIGNMENT_DECIDED`) ở cả hai nhánh. Nếu muốn ép từng nhánh thì giữ khóa bằng tx tay như TC-FR36-09; không bắt buộc.
6. **Thành viên vẫn đọc phân công sau khi đề tài CLOSED**: chấp nhận về nguyên tắc (biên bản, điểm là quyết định của chính hội đồng; cùng quy ước với ghi chú 2 review DC-08). Riêng phần `processScore` và trạng thái đề tài **đọc trực tiếp** thì xem m1.

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| m1 | MINOR | `apps/api/src/modules/councils/service.js:32-44`, `prismaRepo.js:42-56` (`ASSIGNMENT_VIEW`) | `AssignmentView` đọc **dữ liệu hiện tại** của đề tài (`topic.status`, GVHD hiện hành, `processScores` mới nhất kèm nhận xét GVHD), nhưng không xét phân công đã hủy hay đề tài đã CLOSED/CANCELLED. Một GV từng ở hội đồng có phân công **bị hủy** (RETURN_FROM_DEFENSE hoặc hủy phân công) vẫn gọi được `GET /api/council-assignments/:id` (và thấy trong `?status=CANCELLED`). Khi GVHD `REQUEST_DEFENSE` lại với điểm quá trình mới, GV đó đọc được điểm và nhận xét mới, dù §1.1 ghi "Phân công bị hủy → mất quyền ở request kế tiếp" và G62 không cho đọc vĩnh viễn. Với chủ tịch/thư ký, phân công bị hủy còn trả `scores` đủ (vì `officer`), trong khi ủy viên nhận `[]`. Mức thấp: chỉ lộ cho GV đã từng được phân công, dữ liệu gồm một điểm và một nhận xét, không có tài liệu | Với người không phải cán bộ trong phạm vi: nếu `cancelledAt` khác null hoặc `topic.status` ∈ {CLOSED, CANCELLED} thì trả `processScore: null` (hoặc 403 cho phân công đã hủy, giống `isCouncilMember`). Thêm 1 ca vào TC-FR36-08. Nếu thiết kế muốn giữ thì ghi rõ vào GD7 §7.2 |

Ghi chú (không tính là vấn đề):
1. `defense.state` cho đề tài bị trả về (chỉ có phân công đã hủy) là `null`, lệch chữ §7.5 nhưng không lộ dữ liệu (câu hỏi 1). Chuyển kien-truc-su/DC-15.
2. Test cũ bị đổi (quy tắc 1): `T501-notifications` 43 → 44. Chấp nhận, vì GD7 §11 thêm đúng `DEFENSE_DECIDED`; ca "mỗi loại có nhãn" giữ nguyên, vẫn so độ dài chính xác.
3. `averageScore` lọc theo thành viên hiện tại. Khi đã có điểm thì không đổi được thành viên (`COUNCIL_LOCKED`), nên tập điểm và tập thành viên trùng nhau. Nếu sau này cho đổi thành viên khi có điểm thì phải xem lại cả `missingScores` lẫn `averageScore`.
4. E2E chưa chạy (việc của điều phối viên). `TopicDetail` chỉ thêm khóa `defense`, `councilAccess`.
5. `.playwright-mcp/` không thuộc task này, không commit.

Tổng vòng 1: 0 BLOCKER, 0 MAJOR, 1 MINOR. Không chặn DONE; m1 sửa ở DC-09 nếu tiện, chậm nhất trước DC-15 (màn chấm).
