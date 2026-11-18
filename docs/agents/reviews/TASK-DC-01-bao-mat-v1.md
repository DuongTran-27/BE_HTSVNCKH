# Review TASK-DC-01 – bao-mat – vòng 1
Kết luận: APPROVED

Reviewer duy nhất (chế độ tiết kiệm quota). Không tin báo cáo: tự đọc `git diff` + migration mới, tự chạy lint/test.

## Tôi đã tự kiểm tra
- `npm run db:test:up` → "Kiểm tra DB test: tất cả OK. DB test đã chạy."
- `npm run lint` → `eslint . --max-warnings 0`, không lỗi, không cảnh báo.
- `npm test` (exit 0): shared `7 files / 77 passed`; api `72 files / 978 passed`; web `32 files / 245 passed` → 1300/1300, khớp báo cáo.
- Đọc: diff 14 file; `migrations/20261118000000_dc_status_enum/migration.sql`; `migrations/20261101000000_init/migration.sql:11` (thứ tự enum gốc); `API_GD7.md` §0, §0.1; `DAC_TA.md` mục 9; dòng DC-01/05/06/07 bảng việc; `topics/service.js` (`present`, `canView`, `canReadExecution`), `topics/routes.js:67`, `shared/schemas.js:68` (`topicActionSchema`), `similarity/{service,prismaRepo}.js`, `topics/groupService.js`, `rounds/prismaRepo.js:31`, web `TopicActionBar`/`AdvisingActions`.
- Grep mọi literal trạng thái trong `apps/api/src`, `apps/web/src`, `packages/shared/src` và trong các `migration.sql` (không có index/trigger/RLS nào lọc theo giá trị `TopicStatus` → thêm giá trị không làm hở điều kiện SQL cũ).

## Đối chiếu đặc tả
| Điều kiện đạt | Đạt? | Ghi chú |
|---|---|---|
| TRANSITIONS chỉ ở `packages/shared/src/transitions.js`; 6 dòng mới khớp GD7 §0 từng trường (from/to/actors/`currentAdvisorOnly`/`needsSimilarity`/`reasonRequired`/`councilOfficerOnly`/fr) | Đạt | So từng dòng với GD7:17–22; test shared khóa cả 7 thuộc tính |
| `checkTransition` chặn 403 khi thiếu `ctx.isCouncilOfficer` | Đạt | `stateMachine.js:23`, đặt trước kiểm lý do và trong nhóm cờ quan hệ. Test: GVHD (không phải chủ tịch/thư ký), SV, ADMIN → 403; sai trạng thái → 409. Service hiện **không** bao giờ đặt `isCouncilOfficer` → mặc định từ chối |
| StatusHistory vẫn ghi | Đạt | `applyTransition`/`applyTransitionTx` không đổi; 6 action mới chưa có đường gọi nên chưa có chuyển nào bỏ qua StatusHistory |
| Migration riêng, chỉ ADD VALUE, thứ tự khớp `schema.prisma` | Đạt | 2 câu `ALTER TYPE … ADD VALUE … AFTER`; init có `IN_PROGRESS, CANCELLED` → sau migration: `DRAFT, RECRUITING, …, IN_PROGRESS, WAITING_DEFENSE, CANCELLED, …` = schema.prisma |
| ENABLED_ACTIONS loại `CANCEL`, `COUNCIL_FINALIZE` | Đạt | Xem mục "Lệch thiết kế" |
| Kho so FR06 (GD7 §0.1) | Đạt | `RECRUITING` → `PENDING_SAME_ROUND_STATUSES` (chỉ cùng đợt, ẩn tên với SV/GV); `WAITING_DEFENSE` → `PUBLIC_CORPUS_STATUSES`. `presentMatches` dùng "không thuộc công khai → ẩn" nên trạng thái lạ/thiếu luôn ẩn (an toàn mặc định). Không nới ẩn tên: đề tài đang tuyển vẫn ẩn tên trong FR06 (chặt hơn bảng tin, G61 đã chấp nhận ở DC-00) |
| `CLOSING` + `WAITING_DEFENSE` | Đạt | Chỉ ảnh hưởng `closeReadiness` (chỉ đọc), không mở quyền ghi |
| Rời nhóm ở `WAITING_DEFENSE` → `LEAVE_NEEDS_APPROVAL` | Đạt | Trước đây rơi vào nhánh "đã kết thúc" (409 khác mã); giờ đúng như đề tài đã duyệt. `RECRUITING` rời tự do qua `PRE_APPROVAL_STATUSES`; `bumpTopic` vẫn kiểm trạng thái dưới khóa. Test integration DB thật (T603) |
| Quyền xem không bị nới | Đạt | `canView`/`canReadExecution` không đổi: cán bộ trong phạm vi thấy RECRUITING/WAITING_DEFENSE (chỉ loại DRAFT như cũ); SV ngoài nhóm không thấy. Ghi phần thực hiện (`feedbackService`, `documentService`, lock) vẫn đòi `IN_PROGRESS` → từ Chờ bảo vệ SV không nộp/sửa được gì (FR34) |
| Rà giả định "Advising ⇔ ≥ HAS_ADVISOR" | Đạt | Bảng rà trong báo cáo khớp những gì tôi grep; TC-FR16-20 đã ghi nối sang DC-06 |

### Lệch thiết kế có chủ ý: `NOT_YET_IMPLEMENTED` (câu hỏi 3)
Chấp nhận. Lý do bảo mật:
- `POST /:id/actions` được chặn bởi `validate(topicActionSchema)` (discriminatedUnion) → 5 action GĐ7 và `COUNCIL_FINALIZE` hiện trả 400 ở biên, trước service. Bật sớm vào `ENABLED_ACTIONS` chỉ làm UI hiện nút gọi ra 400 và đổi kết quả API cũ (T405).
- Không lộ ra UI/permissions: `TopicDetail.availableActions` lọc theo `ENABLED_ACTIONS` (`service.js:77`); web chỉ dựng nút từ `topic.availableActions` của server; `AdvisingActions` chỉ xét `ACCEPT_ADVISING`/`DECLINE_ADVISING`. `ACTION_LABEL` mới chỉ là nhãn.
- Có comment `shortcut:` ghi task gỡ, test shared khóa trạng thái hiện tại (task sau phải sửa có chủ ý), bảng việc DC-05/06/07 đã ghi việc gỡ. Câu chữ GD7 §0 "mọi action trừ CANCEL, COUNCIL_FINALIZE" vẫn là trạng thái đích sau DC-07.

### Nới test? (câu hỏi 4, quy tắc 1)
Không coi là làm yếu test.
- `transitions.test.js` 14 → 20: đặc tả đổi (DAC_TA mục 9, GD7 §0:29 yêu cầu rõ). Ca mới chặt hơn (kiểm từng cờ của 6 dòng).
- `T203-schema` `SEED_PENDING`: `toEqual` trên kết quả `groupBy` nên 2 trạng thái mới bị khẳng định **đúng 0 đề tài** (không bỏ qua im lặng), mọi trạng thái cũ vẫn đúng 3. Khi DC-05/DC-07 seed thêm mà quên gỡ `SEED_PENDING`, ca sẽ đỏ → buộc sửa có chủ ý. Seed ngay bây giờ đòi model chưa có (`origin`, `TopicApplication`, `ProcessScore`) và sẽ tạo dữ liệu trái bất biến; hoãn có ghi nối là hợp lý.
- Không có ca cũ nào bị xóa/skip/nới (đã đọc toàn bộ diff test).

## Trả lời câu hỏi của agent
- **Câu 1 (SEED_PENDING):** chấp nhận, xem trên.
- **Câu 2 (G45, `rounds/prismaRepo.js:31`):** **Có, thêm `RECRUITING` vào G45 ở DC-05**, kèm test. Lý do: G45 bảo vệ đề tài mà nhóm/GV không sửa hồ sơ được khỏi bị PATCH đợt làm thiếu trường bắt buộc. Đề tài RECRUITING cũng khóa sửa; nếu cán bộ thêm trường bắt buộc, đường duy nhất để sửa là `UNPUBLISH_RECRUITMENT` – gỡ toàn bộ SV đã nhận và từ chối mọi đơn (tác dụng phụ lên SV, FR31). Thêm vào G45 rẻ (một phần tử mảng) và giữ đúng bất biến. Ghi thêm một dòng vào GD7 §0.1 hoặc §3 khi làm DC-05.

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| m1 | MINOR | `apps/api/src/modules/topics/routes.js:67`; `topics/service.js` (handler action) | Chặn action nội bộ (`CANCEL`, `COUNCIL_FINALIZE`) ở `POST /actions` hiện chỉ dựa vào `topicActionSchema` không có nhánh cho chúng; service không kiểm `ENABLED_ACTIONS`. Khi DC-05/06/07 thêm nhánh schema, lỡ thêm `COUNCIL_FINALIZE` thì vẫn bị `councilOfficerOnly` chặn (ctx không đặt cờ) nên **không khai thác được hiện nay**, nhưng chỉ còn một lớp | DC-05: trong handler action, `if (!ENABLED_ACTIONS.includes(action)) throw badRequest(...)` + test `COUNCIL_FINALIZE`/`CANCEL` qua `/actions` → 400 |
| m2 | MINOR | `apps/api/src/modules/rounds/prismaRepo.js:31` | G45 chưa gồm `RECRUITING` (xem trả lời câu 2) | DC-05 thêm `RECRUITING` + test PATCH đợt làm thiếu trường của đề tài đang tuyển → 409 |

Tổng vòng 1: 0 BLOCKER, 0 MAJOR, 2 MINOR (không chặn DONE; chuyển sang DC-05).
