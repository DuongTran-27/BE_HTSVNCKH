# Review TASK-DC-05 – bao-mat – vòng 1
Kết luận: APPROVED

Reviewer duy nhất (chế độ tiết kiệm quota). Không dựa vào báo cáo: tự đọc `git diff` (schema, seed, `app.js`, `rounds/prismaRepo.js`, `topics/{routes,service,prismaRepo,similarityService}.js`, shared `{enums,labels,schemas,transitions}.js`, 5 file test, GD7) và file chưa theo dõi (`recruitmentService.js`, `recruitmentRepo.js`, `recruitmentRoutes.js`, migration `20261118000300_dc_recruitment`, `DC05-recruitment.test.js`); đối chiếu `stateMachine.js`, `advisorRepo.js`, `similarity/service.js`. Không đọc `.env`, không sửa code.

## Tôi đã tự kiểm tra
- `npm run lint` → `eslint . --max-warnings 0`, `lint_exit=0`.
- `npm test` (DB test đang bật, tuần tự) → `test_exit=0`: shared `7 files / 91 passed`; api `78 files / 1073 passed`; web `32 files / 245 passed`. Tổng 1409/1409, khớp báo cáo.
- Không viết test tấn công riêng: các đường cần thử (SV gửi trường GV, GV khác/cán bộ/ADMIN gọi PUBLISH, ADMIN bảng tin, khác khoa, FR06 lỗi, tranh chấp hạn mức 2 kiểu) đã có ca tương ứng trong `DC05-recruitment.test.js` và đều xanh trong lần chạy trên; phần còn lại kiểm bằng đọc code (dưới).

## Đối chiếu đặc tả (FR31, GD7 §0, §0.1, §3, Vòng sửa 1 M2, MINOR m1/m2 DC-01)
| Điều kiện | Đạt? | Ghi chú |
|---|---|---|
| Chỉ LECTURER tạo nháp nguồn GV, đợt cùng khoa, trong hạn | Đạt | `requireRole('STUDENT','LECTURER')`; `origin` suy từ `user.role` ở server (client không chọn được); `round.facultyId !== user.facultyId` → 403; ADMIN/STAFF 403 |
| Chỉ GVHD hiện hành sửa nháp nguồn GV của mình | Đạt | `lecturerEdit = !isMember && isCurrentAdvisor && origin==='LECTURER'`, chỉ `DRAFT`, `repo.update` theo version + `editableStatuses` (nguyên tử). GV là GVHD đề tài SV → 403 |
| SV gửi `requirements`/`recruitSlots` → 400 | Đạt | Mọi `body[k] !== undefined` (kể cả `null`) khi không phải `lecturerEdit` → 400 tại trường; `recruitSlots > cfg.maxMembers` → 400 |
| PUBLISH: quyền/trạng thái → origin → version → đủ trường → hạn → FR06 | Đạt | `checkTransition(skipSimilarity)` (`actors: [LECTURER]`, `currentAdvisorOnly`) chạy trước, `canView` trước nữa (không lộ trạng thái) |
| Lỗi FR06 không bao giờ là "không trùng" | Đạt | `checkTransition` thật với `similarity.status`; `status !== 'OK'` → 409 `SIMILARITY_NOT_CHECKED`. `relations()` không mang `similarityBypass` nên G5 không áp (G50). Test #3 giả lập `loadCorpus` ném lỗi |
| Hạn mức GV dưới khóa, thứ tự Topic → User | Đạt | `applyTransition` khóa Topic (updateMany theo version) → `extra`: `lockUsers([gv])` `FOR NO KEY UPDATE` (cùng hàm với ACCEPT_ADVISING/FR19) → `countLecturerActive` (câu mới sau khóa, READ COMMITTED thấy bản đã commit). Đếm gồm chính đề tài (đã RECRUITING trong tx) với `>` ≡ "đề tài khác ≥ hạn mức". Không có chu trình khóa: mọi luồng chỉ khóa 1 Topic rồi User |
| Test tranh chấp | Đạt | #4 ×3 lượt, #9 PUBLISH ‖ ACCEPT_ADVISING ×2, PUBLISH ‖ FR19; báo cáo đột biến bỏ `lockUsers` → 4 ca đỏ |
| UNPUBLISH bắt buộc lý do | Đạt | `reasonRequired` → 400 `REASON_REQUIRED` (trim, ≥ 5 ký tự); schema chỉ giới hạn ≤ 2000 |
| UNPUBLISH gỡ thành viên + từ chối đơn PENDING dưới khóa, cùng tx | Đạt | Đọc `liveMembers`/`pendingApplications` trong `extra` (sau khóa Topic), `updateMany` có điều kiện `leftAt: null`/`status: 'PENDING'`; StatusHistory (có reason) + AuditLog `MEMBER_REMOVE` từng người + `TOPIC_UNPUBLISH_RECRUITMENT` + thông báo `notifyTopic(tx)` trong cùng transaction |
| Bảng tin: chỉ trong khoa, ADMIN 403, không lộ ứng viên/thành viên | Đạt | `scopeOf`: SV/GV = `facultyId` của mình, STAFF = `staffFacultyIds`, không khoa → `in: []` (rỗng, không "mọi khoa"). `boardSelect` không chọn members/applications của người khác; chỉ `_count.members` (`acceptedCount`, đúng §4.2) và đơn của chính SV. `/:topicId` sai id/không RECRUITING/khác khoa → 404 |
| `applicationCounts` chỉ GVHD/cán bộ phạm vi | Đạt | `service.js` TopicDetail |
| Migration + RLS `TopicApplication` | Đạt | `ENABLE ROW LEVEL SECURITY`, không policy; FK RESTRICT; 2 index; `migrate diff` theo báo cáo "No difference"; `T203-schema` (RLS mọi bảng) xanh |
| `application_one_active … WHERE status = 'PENDING'` | Đạt | Đúng n3 BM v2 |
| m1 `UNKNOWN_ACTION` ở handler | Đạt | `enabledOnly` trước `validate`: action có trong TRANSITIONS mà không trong `ENABLED_ACTIONS` → 400. Giá trị lạ/không phải chuỗi → `findTransition` null → `validate` 400 như cũ |
| m2 G45 + RECRUITING | Đạt | `rounds/prismaRepo.js` + test `ROUND_CONFIG_BLOCKS_TOPICS` |

## Quyết định về các test bị đổi (quy tắc 1)
| Test | Quyết định | Lý do |
|---|---|---|
| T209 `lectReq -> 403` → ca riêng `201` | Chấp nhận, không làm yếu | GD7 §3.1 cho GV tạo nháp. ADMIN/STAFF vẫn 403. Ca mới chặt hơn: kiểm `origin`, `members: []`, đếm `TopicMember = 0` trong DB, GV là GVHD. PUT của `lectReq` lên đề tài SV vẫn 403 |
| T501 `31 → 33` | Chấp nhận | +2 loại đúng GD7 §3.4/§11; ca "mỗi loại có nhãn" giữ nguyên |
| T203-qa-seed TC-FR16-20 | Chấp nhận | Nhánh nguồn GV khẳng định chặt `[0 AdvisorRequest, 1 Advising]`; thêm `=== 3` đề tài nguồn GV; nhánh SV giữ nguyên. Sửa sớm hơn bảng việc (DC-06) là bắt buộc vì seed DC-05 làm khẳng định cũ sai |
| T203-qa-seed TC-FR03-20 | Chấp nhận có điều kiện – xem m1 | Bỏ `[min, max]` với RECRUITING là đúng đặc tả (đang tuyển). Nhưng `continue` cũng bỏ qua việc cộng thành viên vào bộ đếm "SV ≤ N đề tài hoạt động/đợt" (FR03), trong khi RECRUITING là trạng thái hoạt động. Hiện seed 0 thành viên nên không che lỗi nào, nhưng là chỗ yếu khi DC-06 seed thành viên |
| `transitions.test.js` dòng `ENABLED_ACTIONS` | Chấp nhận | Đúng comment DC-01 yêu cầu; khẳng định tập đầy đủ vẫn chặt (danh sách `pending` còn 3 action) |
| T203-schema `SEED_PENDING` | Chấp nhận | Đúng bảng việc; RECRUITING giờ phải có đúng 3 |

## Đánh giá 2 lệch thiết kế
1. **PUT bỏ trường = giữ nguyên** (lệch "PUT thay toàn bộ"): chấp nhận. Không mở thêm quyền: chỉ `lecturerEdit` được gửi 2 trường, người khác gửi (kể cả `null`) → 400. Xóa được bằng gửi tường minh `''`/`null`. Lý do (thành viên ở NEEDS_REVISION không vô tình xóa yêu cầu GV) hợp lý. Đã ghi GD7 §3.2. Web (DC-13) cần biết: muốn xóa phải gửi giá trị rỗng.
2. **UNPUBLISH thiếu lý do → `REASON_REQUIRED` (schema để `reason` tùy chọn)**: chấp nhận, đúng §3.5 #6. Không có đường nào bỏ qua: `checkTransition` luôn chạy trước mọi ghi DB, kiểm `trim().length ≥ 5`; schema vẫn giới hạn ≤ 2000. Đã ghi GD7 §3.4.

## Rủi ro G45 không kiểm `maxMembers < recruitSlots`
Không khai thác được (chỉ cán bộ có quyền PATCH đợt, là thao tác hợp lệ của họ), nhưng có thể làm dữ liệu sai bất biến: cán bộ hạ `maxMembers` xuống dưới `recruitSlots` của đề tài đang tuyển → DC-06 nhận theo `recruitSlots` sẽ tạo nhóm vượt `maxMembers` của đợt. Xử lý ở DC-06 (m2).

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| m1 | MINOR | `apps/api/tests/T203-qa-seed.test.js:92-96` | Nhánh `LECTURER && RECRUITING` `continue` trước khi cộng thành viên vào `active` → khẳng định FR03 "SV ≤ N đề tài hoạt động/đợt" không xét thành viên đề tài đang tuyển (trạng thái hoạt động) | Cộng `active[...]` cho `cur` trước `continue` (hoặc đưa vòng cộng lên trước nhánh). Làm ở DC-06 khi seed có thành viên/đơn |
| m2 | MINOR | `apps/api/src/modules/rounds/prismaRepo.js:31`; DC-06 accept | G45 chỉ kiểm đủ trường, không kiểm `recruitSlots > maxMembers` mới | DC-06: chặn nhận khi `acceptedCount >= min(recruitSlots, cfg.maxMembers)` dưới khóa Topic, **hoặc** G45 trả `ROUND_CONFIG_BLOCKS_TOPICS` khi có đề tài RECRUITING `recruitSlots > maxMembers` mới. Có test |

Ghi chú (không tính là vấn đề):
- `justification` được lưu vào SimilarityCheck lúc chạy FR06 (ngoài tx), không phải "ghi vào trong tx" như §3.3 bước 5: nếu tx bị 409 hạn mức, dòng kiểm tra vẫn mang giải trình. Vô hại (dòng không gắn với chuyển trạng thái nào; nhất quán với SUBMIT_FOR_REVIEW).
- GV nay có thể tự tạo nháp và "Kiểm tra trước" với nội dung tùy ý, thấy tên các hồ sơ đang chờ trùng nhất trong kho so. FR06/FR08 chỉ giới hạn SV, GV vốn thấy kết quả này với đề tài mình hướng dẫn; có rate limit 10/15'. Không đổi.
- `prisma generate` EPERM trên máy (DLL bị giữ) như DC-01; nên chạy lại trước build. `.playwright-mcp/` không thuộc task, không commit.

Tổng vòng 1: 0 BLOCKER, 0 MAJOR, 2 MINOR (không chặn DONE; chuyển DC-06).
