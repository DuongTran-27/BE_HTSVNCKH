# TASK-DC-06 – Ứng tuyển, duyệt đơn, chốt nhóm (FR32, FR33, FR03)
- Agent: backend-dev · Trạng thái: REVIEW · Ngày: 2026-11-18
- FR/NFR: FR32, FR33, FR03, FR13, FR25 · Phụ thuộc đã đọc: TASK-DC-05 (báo cáo + `reviews/TASK-DC-05-bao-mat-v1.md`, MINOR m1, m2), `design/API_GD7.md` §0, §1.2, §1.3, §4 (4.1–4.6), §11, G48, G51, bảng "Vòng sửa 1" (M3, m9), `docs/DAC_TA.md` mục 9 (FR32, FR33)

## Đã làm
- `POST /api/recruitments/:topicId/applications` (STUDENT, 30/15'): kiểm sớm (RECRUITING cùng khoa – không thì 404; hạn đăng ký; đã là thành viên → `ALREADY_MEMBER`; FR03 `STUDENT_TOPIC_LIMIT`), rồi `withLockTx`: khóa Topic `FOR SHARE` → **kiểm lại** RECRUITING + cùng khoa (409 `NOT_RECRUITING`, M3) → tạo đơn (`P2002` → 409 `APPLICATION_EXISTS`); AuditLog chỉ ghi độ dài lời giới thiệu; thông báo `APPLICATION_RECEIVED` → GVHD.
- `POST /api/applications/:id/withdraw` (chính SV, 403 người khác; `updateMany … PENDING`, 409 `APPLICATION_CLOSED`).
- `POST /api/applications/:id/accept` (LECTURER, 60/15'): 403 sớm + kiểm lại GVHD dưới khóa; khóa Topic `FOR NO KEY UPDATE` → RECRUITING → chỉ tiêu `min(recruitSlots, maxMembers)` (m2) → khóa User SV → khóa tài khoản/khoa → FR03 → `updateMany PENDING→ACCEPTED` → TopicMember (thành viên đầu = LEADER) → tăng `version` → G51 (đơn chờ khác cùng đợt → WITHDRAWN, báo GVHD đề tài đó) → AuditLog `APPLICATION_ACCEPT` + `MEMBER_JOIN` → thông báo `APPLICATION_ACCEPTED`. Trả `{ application, topic }`.
- `POST /api/applications/:id/decline` (lý do bắt buộc qua `reasonSchema`, không cần RECRUITING), AuditLog + `APPLICATION_DECLINED`.
- `GET /api/applications` (SV: đơn của mình; GV: đề tài mình là GVHD hiện hành; STAFF: khoa trong phạm vi, trừ DRAFT; ADMIN 403) và `GET /api/topics/:id/applications` (GVHD hiện hành, cán bộ trong phạm vi; còn lại 403). `ApplicationView` theo §4.1 (sinh viên chỉ id/mã/họ tên/mã lớp).
- `FINALIZE_GROUP` qua `/actions` (`recruitmentService`): `checkTransition` → version → `applyTransition` (khóa Topic) → dưới khóa: thành viên ≥ `minMembers` (409 `GROUP_TOO_SMALL`), đơn PENDING → DECLINED `'Đề tài đã chốt nhóm'`, AuditLog `TOPIC_FINALIZE_GROUP`, thông báo `GROUP_FINALIZED` (thành viên) + `APPLICATION_DECLINED`. Sau đó trưởng nhóm `SUBMIT_FOR_REVIEW` như luồng cũ (test #1 chạy hết tới IN_PROGRESS). Gỡ `FINALIZE_GROUP` khỏi `NOT_YET_IMPLEMENTED`.
- MINOR DC-05: m1 TC-FR03-20 đếm thành viên đề tài hoạt động **trước** nhánh RECRUITING (bỏ chỗ `continue` né đếm), thêm cận `min(recruitSlots, maxMembers)`; m2 chặn nhận theo `min(recruitSlots, maxMembers)` dưới khóa Topic.

## File thay đổi
| File | Thay đổi |
|---|---|
| `apps/api/src/modules/topics/applicationService.js` | mới – apply/withdraw/accept/decline/list/listForTopic, `presentApplication` |
| `apps/api/src/modules/topics/applicationRepo.js` | mới – ops trong tx (khóa Topic FOR SHARE / FOR NO KEY UPDATE, khóa User dùng chung `lockUsers`), truy vấn hộp đơn |
| `apps/api/src/modules/topics/applicationRoutes.js` | mới – `/api/applications` |
| `apps/api/src/modules/topics/recruitmentService.js` | `FINALIZE_GROUP`; export `scopeOf`; `RECRUIT_ACTIONS` + FINALIZE_GROUP |
| `apps/api/src/modules/topics/recruitmentRepo.js` | `liveMembers` thêm `role`; `boardSelect.round` thêm `config` (không trả ra ngoài) |
| `apps/api/src/modules/topics/recruitmentRoutes.js` | `POST /:topicId/applications` |
| `apps/api/src/modules/topics/routes.js` | `GET /:id/applications` |
| `apps/api/src/modules/topics/prismaRepo.js`, `apps/api/src/app.js`, `apps/api/src/openapi/spec.js` | gộp repo, mount, 6 dòng tài liệu |
| `packages/shared/src/{schemas,enums,labels,transitions}.js` | `applicationCreateSchema` (strict, trim 20..2000), `applicationListQuerySchema`, nhánh `FINALIZE_GROUP` của `topicActionSchema`; 4 loại thông báo + nhãn; bỏ FINALIZE_GROUP khỏi `NOT_YET_IMPLEMENTED` |
| `apps/api/tests/DC06-applications.test.js` | mới – 19 test (1 unit + 18 integration DB thật) |
| `packages/shared/src/transitions.test.js`, `apps/api/tests/{DC05-recruitment,T203-qa-seed,T501-notifications}.test.js` | đổi theo đặc tả (xem Câu hỏi cho reviewer) |
| `docs/agents/design/API_GD7.md` | §4.3 ghi `ALREADY_MEMBER` + chỉ tiêu min (m2); §11 thêm `APPLICATION_WITHDRAWN` |

## Quyết định thiết kế
1. **Loại thông báo `APPLICATION_WITHDRAWN`** (thêm ngoài danh sách §11): G51 yêu cầu báo GVHD các đề tài có đơn tự rút nhưng §11 không có loại nào hợp. SV tự rút đơn không thông báo (§4.3 không yêu cầu).
2. **Đã là thành viên** khi ứng tuyển → 409 `ALREADY_MEMBER` (mã có sẵn của lời mời) thay vì để lọt đơn.
3. **Thứ tự lỗi khi duyệt**: giới hạn FR03 kiểm trước trạng thái đơn (đúng §4.4 bước 3 trước 4). Hệ quả: duyệt lại đơn đã bị G51 tự rút trả `STUDENT_TOPIC_LIMIT` (cùng mã bên thua của §4.6 #3, ổn định dù bên thua đọc đơn trước hay sau khi G51 chạy); từ chối đơn đó trả `APPLICATION_CLOSED`.
4. Hộp đơn của STAFF loại đề tài DRAFT (nhất quán `canView`: cán bộ không xem nháp – đơn trên đề tài đã ngừng tuyển).
5. `availableActions` của TopicDetail ở RECRUITING giờ có `FINALIZE_GROUP` ngay cả khi chưa đủ thành viên (theo TRANSITIONS như mọi action khác); server trả `GROUP_TOO_SMALL`. UI (DC-13) nên làm mờ nút theo `acceptedCount`.
6. Thứ tự khóa: Topic → User (GD7 §1.2). Ứng tuyển chỉ khóa Topic `FOR SHARE` (không khóa User). G51 cập nhật đơn của đề tài khác **không** khóa Topic đó: chỉ đụng dòng `TopicApplication` (không ai giữ khóa dòng này lâu), không tạo chu trình.

## Điều kiện đạt ↔ test (`apps/api/tests/DC06-applications.test.js`)
| Điều kiện (FR32/FR33/GD7 §4.6) | Test | Kết quả |
|---|---|---|
| #1 luồng đủ: SV đầu LEADER; HAS_ADVISOR → UNDER_REVIEW → IN_PROGRESS; StatusHistory; đơn còn chờ bị từ chối khi chốt | "§4.6 #1 luồng đủ" | Đạt |
| #2 đồng thời còn 1 chỗ → 1 ACCEPTED, 409 `GROUP_FULL` | "#2 đồng thời" ×3 lượt | Đạt |
| #3 2 GV duyệt cùng SV, giới hạn 1 → 409 `STUDENT_TOPIC_LIMIT` | "#3 đồng thời" ×3 lượt | Đạt |
| #4 rút ‖ duyệt → `APPLICATION_CLOSED`, không TopicMember khi rút thắng | "#4" ×4 lượt | Đạt |
| #5 duyệt ‖ FINALIZE, duyệt ‖ UNPUBLISH | "#5" ×3 lượt mỗi kiểu | Đạt |
| #6 ứng tuyển 2 lần, ngoài hạn, khoa khác, không RECRUITING, lời giới thiệu ngắn/trường thừa, ứng tuyển lại sau rút | "#6 …" | Đạt |
| #7 bảng tin không lộ ứng viên/thành viên/số đơn; ứng viên GET đề tài 403 | "#7 …", "#1" | Đạt |
| #8 GV khác, SV, ADMIN, cán bộ duyệt/từ chối → 403; SV khác rút → 403; đọc đơn theo vai trò | "#8 …" | Đạt |
| #9 chốt dưới min → `GROUP_TOO_SMALL`; 403 vai trò sai; DRAFT 409 `INVALID_TRANSITION`; sai version | "#9 …" | Đạt |
| #10 (M3) ứng tuyển ‖ FINALIZE / UNPUBLISH: không đơn PENDING trên đề tài ≠ RECRUITING, thua → `NOT_RECRUITING` | "#10 (M3 BM) kiểm lại…" (chen chốt/ngừng tuyển đúng giữa bước kiểm sớm và tx – tất định) + "#10 đồng thời" ×3 lượt mỗi kiểu | Đạt |
| #11 (m9) duyệt đơn X ‖ nhóm cũ của X REQUEST_ADVISOR → 409 `STUDENT_TOPIC_LIMIT` | "#11 (m9 BM)" ×3 lượt | Đạt |
| G51 tự rút đơn khác cùng đợt + báo GVHD; đợt khác giữ; giới hạn 2 chưa rút | "G51 …" | Đạt |
| m2 chỉ tiêu `min(recruitSlots, maxMembers)` | "m2 (BM DC-05)" | Đạt |
| Từ chối: lý do bắt buộc, thông báo, xử lý lại 409, từ chối được khi không RECRUITING; duyệt khi không RECRUITING 409 | "từ chối: …" | Đạt |
| SV bị khóa → `APPLICATION_CLOSED`; id lạ 404 | "duyệt: SV bị khóa…" | Đạt |
| `availableActions` của đơn; không email | unit `presentApplication`, "#8" | Đạt |
| TopicDetail có `FINALIZE_GROUP` | "TopicDetail: …" | Đạt |

Thử đột biến (sao lưu `applicationService.js` bằng `cp`, khôi phục, `cmp` xác nhận giống bản gốc):
| Đột biến | Test đỏ |
|---|---|
| Bỏ kiểm lại RECRUITING dưới khóa khi ứng tuyển | "#10 (M3 BM) kiểm lại…" |
| Bỏ khóa User SV khi duyệt | "#3 đồng thời" |
| Chỉ tiêu theo `recruitSlots` (bỏ min) | "m2 (BM DC-05)" |
| Bỏ G51 | "#3", "G51" |

## Bằng chứng chạy lệnh
```
$ npx vitest run tests/DC06-applications.test.js   (3 lần liên tiếp)
      Tests  19 passed (19)
      Tests  19 passed (19)
      Tests  19 passed (19)

$ npm run lint
> lint
> eslint . --max-warnings 0
lint_exit=0

$ npm test
test_exit=0
 Test Files  7 passed (7)
      Tests  91 passed (91)
   Start at  20:35:43
   Duration  502ms (transform 229ms, setup 0ms, import 1.65s, tests 97ms, environment 1ms)
 Test Files  79 passed (79)
      Tests  1106 passed (1106)
   Start at  20:35:44
   Duration  140.21s (transform 1.17s, setup 0ms, import 32.19s, tests 96.98s, environment 5ms)
 Test Files  32 passed (32)
      Tests  245 passed (245)
   Start at  20:38:05
   Duration  15.08s (transform 4.27s, setup 17.10s, import 30.95s, tests 45.96s, environment 99.24s)
```
Tổng 1442/1442 đạt (shared 91, api 1106, web 245). Không có migration mới (bảng `TopicApplication` đã có từ DC-05).

## Còn lại / rủi ro
- E2E chưa chạy (điều phối viên). Web chưa có màn ứng tuyển/hộp đơn (DC-13/14); nút "Chốt nhóm" sẽ hiện trên thanh thao tác chung với nhãn `ACTION_LABEL`.
- Seed không thêm đơn/thành viên cho 3 đề tài RECRUITING (không bắt buộc); TC-FR03-20 đã sẵn sàng đếm khi có.
- `#10 đồng thời` chấp nhận 404 cho bên ứng tuyển khi chốt/ngừng tuyển xong trước cả bước kiểm sớm (đúng §4.3 "không thì 404"); nhánh 409 `NOT_RECRUITING` dưới khóa được phủ tất định bằng test chen hook.

## Câu hỏi cho reviewer
1. `DC05-recruitment.test.js`: (a) ca m1 bỏ `FINALIZE_GROUP` khỏi danh sách phải trả `UNKNOWN_ACTION` – đặc tả đổi (DC-06 bật action này, đúng comment `NOT_YET_IMPLEMENTED`); CANCEL, COUNCIL_FINALIZE, REQUEST_DEFENSE vẫn bị kiểm. (b) #1 `availableActions` sau công bố `['UNPUBLISH_RECRUITMENT']` → `['UNPUBLISH_RECRUITMENT', 'FINALIZE_GROUP']` cùng lý do.
2. `transitions.test.js`: dòng khóa `ENABLED_ACTIONS` thêm `FINALIZE_GROUP`, `pending` còn 2 action – như comment DC-05 yêu cầu; khẳng định tập đầy đủ vẫn chặt.
3. `T501-notifications.test.js` `toHaveLength(33)` → `37` (4 loại mới: 3 trong GD7 §11 + `APPLICATION_WITHDRAWN` – quyết định 1); ca "mỗi loại có nhãn" giữ nguyên và vẫn xanh.
4. `T203-qa-seed.test.js` TC-FR03-20 (m1): đếm suất FR03 chuyển lên trước nhánh RECRUITING – **chặt hơn** (thêm đề tài đang tuyển vào bộ đếm), và cận thành viên RECRUITING đổi `≤ recruitSlots` → `≤ min(recruitSlots, maxMembers)` (chặt hơn).
5. TC-FR16-20 (bảng việc ghi sửa ở DC-06) đã được DC-05 sửa và BM chấp nhận; DC-06 không đổi thêm.
