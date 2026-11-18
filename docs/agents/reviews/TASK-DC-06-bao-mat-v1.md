# Review TASK-DC-06 – bao-mat – vòng 1
Kết luận: APPROVED

Reviewer duy nhất (chế độ tiết kiệm quota). Không dựa vào báo cáo: tự đọc `git diff` (`app.js`, `topics/{prismaRepo,recruitmentRepo,recruitmentRoutes,recruitmentService,routes}.js`, `openapi/spec.js`, shared `{enums,labels,schemas,transitions,transitions.test}.js`, 3 test cũ, GD7, bảng việc) và file chưa theo dõi (`applicationService.js`, `applicationRepo.js`, `applicationRoutes.js`, `DC06-applications.test.js`); đối chiếu `stateMachine.js` (`applyTransitionTx` + `recordStatus`), `groupRepo.js` (`countActiveTopics`), `groupService.js` (leave/invite), migration `dc_recruitment` (`application_one_active`, RLS), DAC_TA FR32/FR33, GD7 §0, §4, §11, G51, Vòng sửa 1 (M3, m9). Không đọc `.env`, không sửa code.

## Tôi đã tự kiểm tra
- `npm run lint` → `lint_exit=0`.
- `npm test` (DB test đang bật, tuần tự) → `test_exit=0`: shared `7 files / 91 passed`; api `79 files / 1106 passed`; web `32 files / 245 passed`. Tổng 1442/1442, khớp báo cáo.
- Không viết test tấn công riêng: các đường IDOR/vai trò (GV khác, SV khác, ADMIN, cán bộ khác khoa, GV ứng tuyển, `?topicId=` đề tài người khác) đã có ca trong `DC06-applications.test.js` #8 và xanh ở lần chạy trên; phần khóa/thứ tự khóa kiểm bằng đọc code (dưới).

## Đối chiếu đặc tả (FR32, FR33, FR03, GD7 §4, G51, M3, m9, MINOR DC-05)
| Điều kiện | Đạt? | Ghi chú |
|---|---|---|
| Chỉ SV ứng tuyển, cùng khoa, đề tài RECRUITING, trong hạn | Đạt | `requireRole('STUDENT')` + limiter 30/15'; `findRecruitment({status:'RECRUITING', ...scopeOf(user)})` → 404 (không lộ tồn tại); `scopeOf` không khoa → `in: []`; hạn theo giờ server |
| M3: FOR SHARE + kiểm lại dưới khóa | Đạt | `lockTopicShare` → kiểm lại `status`/`facultyId` → 409 `NOT_RECRUITING`; FINALIZE/UNPUBLISH ghi Topic (khóa ghi) nên xung đột FOR SHARE. Test chen hook tất định + đột biến báo đỏ |
| Một đơn hiệu lực/đề tài | Đạt | partial unique `WHERE status='PENDING'` → `P2002` → `APPLICATION_EXISTS`; ứng tuyển lại sau rút 201 |
| AuditLog không ghi lời giới thiệu | Đạt | chỉ `coverLetterLength` |
| Chỉ GVHD hiện hành duyệt/từ chối | Đạt | 403 sớm theo `advisings where endAt null`, kiểm lại `isCurrentAdvisor` dưới khóa Topic; GV đã bàn giao mất quyền |
| Thứ tự khóa Topic → User, chỉ tiêu `min(recruitSlots, maxMembers)` | Đạt | `FOR NO KEY UPDATE` Topic → đếm thành viên (câu mới sau khóa) → `lockUsers([sv])` → FR03. Không có chu trình: ứng tuyển chỉ khóa Topic; G51 chỉ ghi dòng `TopicApplication` của đề tài khác, không giữ khóa nào mà luồng khác (FINALIZE/decline/accept đề tài kia) cần ngược lại |
| FR03 dưới khóa User SV, chéo luồng cũ (m9) | Đạt | dùng chung `lockUsers` với REQUEST_ADVISOR; `countActiveTopics` tính RECRUITING (không thuộc `INACTIVE_STATUSES`); #11 ×3 lượt |
| G51 cùng transaction | Đạt (xem m1) | `otherPending` + `withdrawApplications` + audit + thông báo trong `appTx` |
| Trưởng nhóm = người được duyệt đầu tiên | Đạt | `members === 0 ? 'LEADER'` dưới khóa Topic; FR21 cấm trưởng nhóm rời; mời thành viên chỉ ở DRAFT nên không có đường vào nhóm RECRUITING ngoài duyệt đơn |
| FINALIZE_GROUP: StatusHistory, GROUP_TOO_SMALL, từ chối đơn chờ | Đạt | `checkTransition` (`currentAdvisorOnly`) → version → `applyTransitionTx` (updateMany theo version+from, `recordStatus`) → `extra` đọc lại `liveMembers` dưới khóa → 409 ném trong tx nên rollback cả StatusHistory (test #9 khẳng định `statusHistory.count = 0`) |
| Đọc đơn theo vai trò | Đạt | SV `studentId = me`; GV `advisings some {me, endAt null}`; STAFF `staffFacultyIds`, trừ DRAFT; ADMIN 403 ở `requireRole`. `GET /topics/:id/applications`: GVHD hiện hành hoặc cán bộ phạm vi, còn lại 403; `topicId` lấy từ path |
| ApplicationView không lộ dữ liệu | Đạt | `student` chỉ id/mã/họ tên/mã lớp (không email/SĐT); `round.config` thêm vào `boardSelect` không được `presentItem` trả ra |
| Thông báo không lộ dữ liệu | Đạt | `APPLICATION_WITHDRAWN` gửi GVHD đề tài kia không nêu tên đề tài nhận SV; `GROUP_FINALIZED` chỉ thành viên; `APPLICATION_DECLINED` chỉ chính SV |
| Zod mọi body/query | Đạt | `applicationCreateSchema` strict trim 20..2000, `emptyBodySchema`, `reasonSchema`, `applicationListQuerySchema` (status enum, id ≤ 64); id sai dạng → 404 |
| MINOR DC-05 m1, m2 | Đạt | m1: đếm FR03 trước nhánh RECRUITING (chặt hơn); m2: chỉ tiêu min dưới khóa + test thông điệp "(2)" |

## Test tranh chấp có đủ chặt?
- #10 có biến thể chen hook tất định (đúng điểm giữa kiểm sớm và tx) – phủ chắc nhánh M3. Các ca song song #2/#3/#4/#5/#11 không ép thứ tự, nhưng mỗi nhánh kết quả đều được khẳng định bất biến (đúng 1 thắng, mã lỗi đúng, số thành viên/đơn trong DB) và lặp 3–4 lượt; báo cáo đột biến (bỏ khóa User → #3 đỏ, bỏ kiểm lại RECRUITING → #10 đỏ, bỏ min → m2 đỏ, bỏ G51 → #3/G51 đỏ) cho thấy test bắt được lỗi thật. Chấp nhận.
- #10 song song chấp nhận 404 cho bên ứng tuyển: đúng §4.3 (kiểm sớm "không thì 404"), bất biến chính (0 đơn PENDING trên đề tài ≠ RECRUITING) vẫn khẳng định mọi lượt.

## Quyết định về các test bị đổi (quy tắc 1)
| Test | Quyết định | Lý do |
|---|---|---|
| DC05 #1 `availableActions` + `FINALIZE_GROUP` | Chấp nhận | Đặc tả đổi đúng (DC-06 bật action, theo TRANSITIONS); vẫn `toMatchObject` mảng chính xác |
| DC05 m1 bỏ `FINALIZE_GROUP` khỏi danh sách `UNKNOWN_ACTION` | Chấp nhận (xem m2) | Bắt buộc vì action đã bật; 3 action còn lại vẫn kiểm. Nhưng comment nói "ca 400 chuyển sang DC06" mà DC06 không có ca đó |
| `transitions.test.js` `ENABLED_ACTIONS` | Chấp nhận | Đúng comment DC-05; khẳng định tập đầy đủ vẫn so bằng `toEqual` sau sort, `pending` còn 2 |
| T501 33 → 37 | Chấp nhận | 3 loại GD7 §11 + `APPLICATION_WITHDRAWN`; ca "mỗi loại có nhãn" giữ nguyên |
| T203 TC-FR03-20 | Chấp nhận, chặt hơn | Thành viên RECRUITING vào bộ đếm FR03; cận `≤ min(recruitSlots, maxMembers)` |

## Đánh giá 4 lệch thiết kế
1. **`APPLICATION_WITHDRAWN`**: chấp nhận. G51 yêu cầu báo GVHD mà §11 thiếu loại; tiêu đề không lộ đề tài nhận SV. Đã ghi GD7 §11.
2. **`ALREADY_MEMBER`**: chấp nhận, chặt hơn thiết kế (không để lọt đơn của chính thành viên). Đã ghi GD7 §4.3.
3. **Duyệt lại đơn đã tự rút → `STUDENT_TOPIC_LIMIT`**: chấp nhận. Đúng thứ tự §4.4 (bước 3 trước 4), không đổi trạng thái gì, mã ổn định cho bên thua #3 dù đọc trước/sau G51. Hệ quả tương tự: duyệt đơn đã đóng trên nhóm đầy trả `GROUP_FULL`. Chỉ là thông điệp, không mở quyền. UI (DC-13) không hiện nút ACCEPT với đơn không PENDING (`availableActions`).
4. **Hộp đơn cán bộ loại DRAFT**: chấp nhận, hẹp hơn thiết kế, nhất quán `canView` (cán bộ không xem nháp).

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| m1 | MINOR | `applicationService.js:119-126`; `recruitmentService.js:99-106` (và UNPUBLISH DC-05 cùng mẫu) | Audit/thông báo lặp theo danh sách đọc trước (`otherPending`/`pendingApplications`), không theo dòng thực sự được cập nhật. Rút đơn (`withdraw`) không khóa Topic, nên SV rút đơn đúng lúc FINALIZE/G51 chạy → `updateMany … PENDING` bỏ qua dòng đó nhưng vẫn ghi AuditLog "WITHDRAWN auto"/thông báo "bị từ chối"/"tự rút" sai sự thật (dữ liệu đơn vẫn đúng, không lộ dữ liệu) | Đọc kèm `FOR UPDATE` (raw) hoặc `UPDATE … WHERE status='PENDING' RETURNING id, "studentId", "topicId"` rồi chỉ audit/thông báo các dòng trả về; thêm 1 test chen hook |
| m2 | MINOR | `apps/api/tests/DC05-recruitment.test.js:372` | Comment nói ca 400 của `FINALIZE_GROUP` "chuyển sang DC06-applications" nhưng DC06 không có ca body sai (thiếu `version`/trường thừa) cho FINALIZE_GROUP | Thêm ca `{ action: 'FINALIZE_GROUP' }` → 400 `VALIDATION_ERROR` (và trường thừa) vào DC06, hoặc sửa comment |

Ghi chú (không tính là vấn đề):
- FINALIZE đọc `minMembers` từ `t.round.config` trước khóa; cán bộ đổi cấu hình đúng lúc chốt chỉ lệch một lần, không khai thác được.
- Agent tự ghi thêm 2 dòng vào `API_GD7.md` (§4.3, §11); nội dung khớp code, chấp nhận theo ủy quyền 2026-11-08.
- E2E chưa chạy (điều phối viên). `.playwright-mcp/` không thuộc task, không commit.

Tổng vòng 1: 0 BLOCKER, 0 MAJOR, 2 MINOR (không chặn DONE; m1 nên làm ở task kế chạm `recruitmentService`/`applicationService`, m2 kèm theo).
