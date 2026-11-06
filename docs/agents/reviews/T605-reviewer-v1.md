# Review TASK-T605 – reviewer – vòng 1
Kết luận: APPROVED

## Tôi đã tự kiểm tra
- `npm run lint` → `eslint . --max-warnings 0`, exit 0, không lỗi, không cảnh báo.
- `npm test` (DB test docker đang chạy) → shared 73/73 (7 file), api 701/701 (55 file), web 168/168 (22 file), exit 0. Khớp "Bằng chứng chạy lệnh" trong báo cáo.
- Đã đọc: `reports/T605.md`, dòng T605 `BANG_CONG_VIEC.md`, `design/API_GD6.md` §5.4, §6, §10, G45; toàn bộ diff chưa commit (`changeRequests/topicChange.js` mới, `changeRequests/service.js`, `changeRequests/prismaRepo.js`, `changeRequests/routes.js`, `rounds/service.js`, `rounds/prismaRepo.js`, `topics/service.js`, `topics/prismaRepo.js`, `packages/shared/src/schemas.js`, `T209`, `T601`), danh sách ca `T605-topic-change.test.js` và ca m1 (dòng 311–361), `runSimilarityCheck` (bắt lỗi → dòng ERROR).
- Không có `.skip`/`.only`; assert T209 chỉ thêm khóa `requestTopicChange: false` vào so khớp `toEqual` toàn bộ (không nới).

## Đối chiếu đặc tả
| Điều kiện đạt | Đạt? | Ghi chú |
|---|---|---|
| §6.1 schema nhánh `TOPIC_CHANGE` strict, giới hạn tĩnh, refine `_` | Đạt | `schemas.js:482-494` |
| §6.2 quyền trưởng nhóm, IN_PROGRESS, bỏ trường giống hiện tại, gộp đạt `topicSubmitSchema(cfg hiện tại)`, lĩnh vực `isActive`, `addMemberCode` hợp lệ + `GROUP_FULL` sớm | Đạt | `topicChange.js:25-48`; quyền ở backend (`canCreate`), `permissions.requestTopicChange` khớp §2.5 |
| §6.2 FR06 ngoài tx trên nội dung gộp; ERROR → 409 không tạo yêu cầu (quy tắc 5); HIGH thiếu giải trình → 400; `similarityCheckId` gắn yêu cầu; limiter 10/15 phút | Đạt | `topicChange.js:49-63`, `service.js:274`, `routes.js:190-197`. `status !== 'OK'` → 409, nên mọi kết quả không OK đều không được coi là "không trùng". Test xác nhận `changeRequest.count = 0` |
| Kết quả FR06 gắn đúng nội dung đề xuất | Đạt | `prepare` so lại 5 trường dưới khóa Topic (`topicChange.js:72`) → `CONCURRENT_UPDATE` |
| §6.3 SV đích đồng ý: khóa User, `STUDENT_TOPIC_LIMIT` | Đạt | `topicChange.js:76-79` |
| §6.4 duyệt dưới khóa Topic: IN_PROGRESS → `before` khớp (`STALE`) → gộp đạt cfg hiện tại (409 `TOPIC_INCOMPLETE`) → khóa User (Topic→User), kiểm lại SV/`GROUP_FULL`/`STUDENT_TOPIC_LIMIT`, `TopicMember` + `MEMBER_ADD` → ghi + `version`+1 → `TOPIC_CHANGE_APPLY` | Đạt | `topicChange.js:81-105`; không tạo Submission (G34), không đổi trạng thái nên không có StatusHistory – đúng; phạm vi khoa kiểm ở `service.approve` trước handler |
| §6.6 ca 1–7 (gồm 2 ca đồng thời) | Đạt | 16 ca ở `T605-topic-change.test.js`; ca 5 lặp 3 lần, ca 6 một 200/một 409 |
| §10 G45: 409 `ROUND_CONFIG_BLOCKS_TOPICS` `{ codes ≤50, total }`, không ghi; trạng thái khác không chặn; chỉ đổi tham số khác → 200 không quét | Đạt | `rounds/service.js:347-357, 372`, quét trong tx đã khóa Round (`rounds/prismaRepo.js:30`) |
| m1 T603-bao-mat: người không còn quan hệ không thấy tên hiện tại ở `GET /api/change-requests[/:id]` | Đạt | `service.js:251-259`, áp ở mọi đường trả `ChangeRequestView` (`view`, `page`, `get`); grep xác nhận không còn nơi nào gọi `presentChangeRequest` mà bỏ qua `titleFor`. Test: người rời (snapshot trong khoảng / null), GV cũ chưa/được cấp quyền, SV đích PENDING/đã từ chối, cả chi tiết lẫn danh sách |
| Xóa nhánh `if (!h)` | Đạt | `service.js:292` |

### Thử nghĩ ca rò (m1)
- Danh sách/chi tiết, người đã rời rồi được mời lại: có dòng `leftAt = null` → hiện hành, đúng.
- GV đích ADVISOR_CHANGE đã từ chối, GV cũ không quyền đọc: `advisings` lọc theo `endAt null OR readOnlyGranted` → `null`, đúng.
- Người tạo đã rời: thấy `payload` của chính yêu cầu mình tạo. Nếu yêu cầu TOPIC_CHANGE của họ được duyệt sau khi họ rời thì `payload.after.title` trùng tên hiện tại. Đây là nội dung chính họ đề xuất, không phải thông tin mới. Chấp nhận như báo cáo lập luận (INFO, không cần sửa).
- `similarityCheck` hiển thị qua `similarityView(row, role)`, nên SV không thấy chi tiết. Không rò.

## Quyết định 2 câu hỏi
1. **G45 "chỉ chặn đề tài trở nên không đạt"**: **Chấp nhận, không sai đặc tả.** Thông điệp hợp đồng là "làm N đề tài … **không còn** đủ điều kiện", tức đề tài phải đạt trước khi đổi. Mục tiêu của G45 là không *tạo ra* đề tài kẹt. Nếu đọc theo nghĩa đen thì cán bộ không thể **nới** tham số để gỡ kẹt cho đề tài đã kẹt sẵn, trái với chính mục đích đó. Trên luồng thật, đề tài WAITING_ADVISOR/HAS_ADVISOR đều đã qua `assertTopicComplete` khi `REQUEST_ADVISOR`, nên hai cách hiểu chỉ khác nhau ở dữ liệu bất thường. Có test cho ca nới tham số. Kiến trúc sư nên bổ sung một dòng vào G45 khi sửa `API_GD6.md` lần tới.
2. **Xóa ca test CHANGE_NOT_READY "loại chưa có handler"**: **Không phải làm yếu test.** Ca đó khẳng định một trạng thái tạm thời ("TOPIC_CHANGE chưa hiện thực"), và nhánh code tương ứng đã bị xóa đúng theo yêu cầu task. Cột `type` là enum Postgres nên không dựng được dòng có loại ngoài `TYPES`. `CHANGE_NOT_READY` thật (stage TARGET) vẫn được test ở T601 và T605 ca 4. Đề xuất thêm lưới an toàn ở MINOR m2.

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| m1 | MINOR | `apps/api/src/modules/changeRequests/service.js:274` | `precheck` (FR06 + ghi `SimilarityCheck` + AuditLog + tốn lượt limiter) chạy **trước** `hasPending`. Khi đề tài đã có TOPIC_CHANGE đang chờ, mỗi lần bấm gửi vẫn chạy thuật toán, ghi một dòng kiểm mồ côi rồi mới trả 409 `CHANGE_REQUEST_PENDING`. Tính đúng không bị ảnh hưởng, vì `hasPending` dưới khóa vẫn chặn. | Gọi `repo` đếm pending (đọc, ngoài tx) trước `precheck` để trả 409 sớm; giữ nguyên kiểm dưới khóa. |
| m2 | MINOR | `apps/api/src/modules/changeRequests/service.js:221,292` | Đã bỏ nhánh `if (!h)`, nhưng không có gì bảo đảm `TYPES` phủ đủ enum `ChangeType`. Nếu sau này thêm giá trị enum mà quên handler thì `h.apply` sẽ ném TypeError và trả 500. | Thêm một unit test: `Object.keys(TYPES).sort()` bằng danh sách `ChangeType` (từ `@nckh/shared` hoặc Prisma enum). Có thể export `TYPES` hoặc kiểm qua `CHANGE_TYPE_LABEL`. |
| i1 | INFO | `apps/api/src/modules/changeRequests/topicChange.js:81-91` | Lúc duyệt không kiểm lại `fieldId` mới còn `isActive`. §6.4 không yêu cầu, chỉ ghi để biết. | Không bắt buộc. |
| i2 | INFO | `apps/api/src/modules/changeRequests/service.js:258` | `titleFor` tốn thêm một truy vấn `submissionTitles` cho mỗi dòng không còn quan hệ (N+1, tối đa `pageSize`). Báo cáo đã nêu và chấp nhận. | Không bắt buộc. |

Không có BLOCKER/MAJOR. Lệnh tự chạy đều xanh, nên kết luận APPROVED. Hai MINOR không chặn (chế độ tiết kiệm quota) và có thể gộp vào task sau.
