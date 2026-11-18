# TASK-DC-05 – Đề tài GV công bố tuyển sinh viên (FR31)
- Agent: backend-dev · Trạng thái: REVIEW · Ngày: 2026-11-18
- FR/NFR: FR31, FR06, FR16, FR03, FR25, NFR03 · Phụ thuộc đã đọc: TASK-DC-01 (báo cáo + `reviews/TASK-DC-01-bao-mat-v1.md`), `design/API_GD7.md` §0, §0.1, §1.1, §2.1–2.3, §3, §4.2, §11, bảng "Vòng sửa 1" (M2, M3), `docs/DAC_TA.md` mục 9

## Đã làm
- Migration `20261118000300_dc_recruitment`: enum `TopicOrigin`, `Topic.origin/requirements/recruitSlots`, bảng `TopicApplication` (2 index), `application_one_active … WHERE status = 'PENDING'`, RLS bật cho `TopicApplication` (bảng mới duy nhất). `prisma migrate diff` DB ↔ schema: "No difference detected".
- `POST /api/topics` mở cho LECTURER: nháp `origin = LECTURER` + `Advising` của GV, không `TopicMember`, không kiểm hạn mức (GD7 §3.1). `PUT /api/topics/:id` cho GVHD hiện hành sửa nháp nguồn GV (chỉ DRAFT) + `requirements`/`recruitSlots`; SV gửi 2 trường này → 400 tại trường.
- `PUBLISH_RECRUITMENT` (`recruitmentService.js`): `checkTransition` → `origin` → version → `topicPublishSchema` (400 `TOPIC_INCOMPLETE`) → `REGISTRATION_CLOSED` → FR06 ngoài tx (lỗi → 409, HIGH thiếu giải trình → 400, không áp G5) → `withLockTx`: khóa Topic (updateMany version) → khóa User GV `FOR NO KEY UPDATE` → đếm hạn mức → StatusHistory + AuditLog. Không tạo snapshot.
- `UNPUBLISH_RECRUITMENT`: lý do bắt buộc; dưới khóa Topic gỡ mọi thành viên (`leftAt`, AuditLog `MEMBER_REMOVE` từng người), đơn `PENDING` → `DECLINED` (`'Giảng viên ngừng tuyển'`), StatusHistory có lý do, thông báo `RECRUITMENT_CANCELLED` / `APPLICATION_DECLINED` trong cùng tx.
- Bảng tin `GET /api/recruitments`, `/:topicId` (STUDENT/LECTURER/STAFF, ADMIN 403; phạm vi khoa; không lộ thành viên/ứng viên/số đơn; 404 khi không RECRUITING hoặc khác khoa).
- `TopicDetail` + `origin, requirements, recruitSlots, acceptedCount, applicationCounts`; `permissions.edit`/`checkSimilarity` cho GV công bố ở DRAFT (`isLecturerDraftOwner`); `POST …/similarity-checks` mở cho GV đó.
- MINOR DC-01: m1 middleware `enabledOnly` trên `/actions` (action có trong TRANSITIONS nhưng không trong `ENABLED_ACTIONS` → 400 `UNKNOWN_ACTION`, trước `validate`); m2 G45 thêm `RECRUITING`. `ENABLED_ACTIONS` bật PUBLISH/UNPUBLISH.
- Seed: 3 đề tài GV công bố ở RECRUITING (FR06 chạy thật, không snapshot); `SEED_PENDING` chỉ còn `WAITING_DEFENSE`.

## File thay đổi
| File | Thay đổi |
|---|---|
| `apps/api/prisma/schema.prisma` | enum `TopicOrigin`; `Topic` + 3 cột + `applications`; `User.applications`; model `TopicApplication` |
| `apps/api/prisma/migrations/20261118000300_dc_recruitment/migration.sql` | mới (bảng, cột, index, `application_one_active`, RLS) |
| `apps/api/src/modules/topics/recruitmentService.js` | mới – publish/unpublish, bảng tin, `assertPublishable` |
| `apps/api/src/modules/topics/recruitmentRepo.js` | mới – ops trong tx, truy vấn bảng tin (select không có thành viên/đơn của người khác) |
| `apps/api/src/modules/topics/recruitmentRoutes.js` | mới – `/api/recruitments` |
| `apps/api/src/modules/topics/routes.js` | POST/PUT/similarity-checks cho STUDENT+LECTURER; `enabledOnly` (m1); định tuyến RECRUIT_ACTIONS |
| `apps/api/src/modules/topics/service.js` | `isLecturerDraftOwner`; tạo theo vai trò; sửa nháp GV + 2 trường; TopicDetail thêm 5 trường; `permissions.edit/checkSimilarity` |
| `apps/api/src/modules/topics/prismaRepo.js` | `create` nhận `origin` (Advising thay trưởng nhóm); `_count.applications` PENDING; gộp recruitmentRepo |
| `apps/api/src/modules/topics/similarityService.js` | GV công bố được "Kiểm tra trước" nháp của mình |
| `apps/api/src/modules/rounds/prismaRepo.js` | G45 + `RECRUITING` (m2) |
| `apps/api/src/app.js`, `apps/api/src/openapi/spec.js` | mount + tài liệu `/api/recruitments(/:topicId)`; vai trò `LV` cho POST/PUT topics, similarity-checks |
| `packages/shared/src/{enums,labels,schemas,transitions}.js` | `TOPIC_ORIGIN(+_LABEL)`; 2 loại thông báo + nhãn; `topicUpdateSchema` + 2 trường; `topicPublishSchema`; nhánh PUBLISH/UNPUBLISH của `topicActionSchema`; `recruitmentListQuerySchema`; bỏ 2 action khỏi `NOT_YET_IMPLEMENTED` |
| `apps/api/prisma/seed.js` | 3 đề tài GV công bố RECRUITING (33 đề tài) |
| `apps/api/tests/DC05-recruitment.test.js` | mới – 23 test (2 unit + 21 integration DB thật) |
| `packages/shared/src/transitions.test.js`, `apps/api/tests/{T203-schema,T203-qa-seed,T209-topics,T501-notifications}.test.js` | đổi theo đặc tả (xem Câu hỏi cho reviewer) |
| `docs/agents/design/API_GD7.md` | §0.1 thêm dòng G45; §3.2, §3.4 ghi 2 quyết định dưới đây |

## Quyết định thiết kế
1. **Đếm hạn mức khi công bố**: `applyTransitionTx` đổi trạng thái trước rồi mới chạy `extra` nên đề tài này đã RECRUITING trong tx và được đếm → so `> maxTopicsPerLecturer` (tương đương "đề tài khác ≥ hạn mức" của GD7 §3.3). Dùng lại `countLecturerActive` + `lockUsers` của `advisorRepo.js` (cùng khóa với ACCEPT_ADVISING, FR19).
2. **`requirements`/`recruitSlots` bỏ trống trong PUT = giữ nguyên** (lệch nhẹ "PUT thay toàn bộ"): sau chốt nhóm, thành viên sửa hồ sơ ở NEEDS_REVISION không được xóa yêu cầu GV đã nhập; chỉ GVHD sửa nháp nguồn GV được gửi 2 trường này. Đã ghi vào GD7 §3.2.
3. **Nhánh schema UNPUBLISH để `reason` tùy chọn** (≤ 2000): để thiếu lý do trả `REASON_REQUIRED` (từ `checkTransition`) đúng GD7 §3.5 #6, không phải `VALIDATION_ERROR`.
4. **m1**: chặn trong middleware trước `validate` (chỉ khi action có trong TRANSITIONS mà không bật) → mã riêng `UNKNOWN_ACTION`, test phân biệt được lớp này với lớp schema; chuỗi lạ vẫn `VALIDATION_ERROR` như cũ.
5. Thông báo người bị gỡ/đơn bị từ chối dẫn về `/tuyen-sinh` (họ không còn xem được đề tài). Khóa chống trùng `RECRUITMENT_CANCELLED:<topicId>:<version>` (mỗi lần ngừng tuyển một version khác nhau).
6. `decidedById` không có FK (đúng model GD7 §2.2).

## Điều kiện đạt ↔ test
| Điều kiện đạt (FR31 / GD7 §3.5) | Test case (`DC05-recruitment.test.js` trừ khi ghi khác) | Kết quả |
|---|---|---|
| #1 GV tạo nháp → sửa → công bố: DRAFT → RECRUITING, Advising GV, StatusHistory | "#1 GV tạo nháp → sửa → công bố…" | Đạt |
| #2 thiếu `recruitSlots` / tóm tắt ngắn → 400 `TOPIC_INCOMPLETE` có khóa `recruitSlots` | "#2 …"; unit `assertPublishable` | Đạt |
| #3 HIGH không giải trình 400; FR06 lỗi 409 (không coi là không trùng) | "#3 …" (app `loadCorpus` ném lỗi; dòng ERROR vẫn lưu) | Đạt |
| #4 đồng thời 2 công bố, còn 1 suất | "#4 đồng thời" × 3 lượt | Đạt |
| #5 SV, GV khác, cán bộ, ADMIN → 403; GV PUBLISH đề tài SV DRAFT → 409; trạng thái sai 409 | "#5 …" | Đạt |
| #6 thiếu lý do 400 `REASON_REQUIRED`; không thành viên 200 + đơn chờ DECLINED; 1 thành viên/min 2 → leftAt, SV vào đề tài khác được, GET 403 | "#6 thiếu lý do…", "#6 có 1 thành viên…" | Đạt |
| #7 SV gửi `requirements` trong PUT → 400 | "sửa: … #7 …" | Đạt |
| #8 FR06 hồ sơ SV khác cùng đợt: RECRUITING trong top 5, `hidden: true` | "#8 …" | Đạt |
| #9 PUBLISH ‖ ACCEPT_ADVISING; PUBLISH ‖ duyệt thay GV (FR19) | "#9 đồng thời (lượt 1, 2)…", "#9 … FR19" | Đạt |
| Tạo: chỉ SV/GV, đợt cùng khoa, trong hạn đăng ký | "tạo: STAFF, ADMIN 403…"; T209 "lectReq -> 201…" | Đạt |
| Ngoài hạn đăng ký / sai version / đủ hạn mức (nháp không tính) | "ngoài thời gian đăng ký…" | Đạt |
| Bảng tin: phạm vi khoa, không lộ ứng viên/thành viên/số đơn, `myApplication`, 404, ADMIN 403, lọc | "§4.2 bảng tin" (2 test) | Đạt |
| m1 `/actions` tự kiểm `ENABLED_ACTIONS` | "m1: …" (CANCEL, COUNCIL_FINALIZE, FINALIZE_GROUP, REQUEST_DEFENSE → 400 `UNKNOWN_ACTION`) | Đạt |
| m2 G45 + RECRUITING | "m2: G45 …" | Đạt |
| RLS bảng mới; seed 3 RECRUITING hợp lệ theo TRANSITIONS, FR06 thật | `T203-schema` (RLS mọi bảng, 3 đề tài/trạng thái, kho so), `T203-qa-seed` | Đạt |

Thử đột biến (sao lưu bằng `cp`, khôi phục sau): bỏ gỡ thành viên → 1 test đỏ; bỏ `lockUsers` khi công bố → 4 test đồng thời đỏ; bỏ `enabledOnly` → test m1 đỏ.

## Bằng chứng chạy lệnh
```
$ npm run db:test:reset
EPERM: operation not permitted, rename '...\.prisma\client\query_engine-windows.dll.node.tmp21620' -> '...query_engine-windows.dll.node'
Đã reset DB test (migrate reset).
```
(DLL engine bị tiến trình khác giữ như DC-01; JS client đã sinh mới – có `TopicOrigin`, `recruitSlots`.)
```
$ prisma migrate diff --from-url <DATABASE_URL test> --to-schema-datamodel prisma/schema.prisma
No difference detected.

$ npm run lint
> lint
> eslint . --max-warnings 0
lint_exit=0

$ npm test
 Test Files  7 passed (7)
      Tests  91 passed (91)
   Start at  20:13:43
 Test Files  78 passed (78)
      Tests  1073 passed (1073)
   Start at  20:13:44
   Duration  150.25s (transform 1.20s, setup 0ms, import 33.50s, tests 105.24s, environment 5ms)
 Test Files  32 passed (32)
      Tests  245 passed (245)
   Start at  20:16:15
   Duration  15.46s (transform 5.35s, setup 16.84s, import 34.13s, tests 47.49s, environment 100.16s)
exit=0
```
Tổng 1409/1409 đạt (shared 91, api 1073, web 245). Lần chạy đầu đỏ 2 ca do đặc tả đổi (T209 `lectReq -> 403`, T501 số loại thông báo 31) – xử lý như Câu hỏi 1–2.

## Còn lại / rủi ro
- E2E chưa chạy (điều phối viên). Seed thêm 3 đề tài GV công bố (33 đề tài): E2E nào đếm đúng 30 đề tài hoặc giả định mọi đề tài có trưởng nhóm có thể lệch.
- Web chưa có màn GV công bố/bảng tin (DC-13/14); nút PUBLISH/UNPUBLISH có thể hiện ở thanh thao tác chung với nhãn `ACTION_LABEL` nhưng chưa có ô lý do/giải trình riêng.
- G45 không xét `maxMembers` giảm dưới `recruitSlots` của đề tài đang tuyển (ngoài phạm vi; `GROUP_FULL` ở DC-06 vẫn chặn theo `recruitSlots`).
- `prisma generate` EPERM trên máy này như DC-01; CI sinh client bình thường.

## Câu hỏi cho reviewer
1. `T209-topics.test.js`: `it.each(['admin','staff1','lectReq'])('%s -> 403')` trên `POST /api/topics` mâu thuẫn GD7 §3.1 (GV được tạo nháp). Tôi bỏ `lectReq` khỏi ca 403 và thêm ca chặt hơn: GV → 201, `origin = LECTURER`, không `TopicMember`, GV là GVHD. ADMIN/STAFF vẫn 403. PUT của `lectReq` lên đề tài SV vẫn 403 (không đổi).
2. `T501-notifications.test.js` `toHaveLength(31)` → `33` (GD7 §3.4, §11 thêm `RECRUITMENT_CANCELLED`, `APPLICATION_DECLINED`); ca "mỗi loại có nhãn" giữ nguyên.
3. `T203-qa-seed`: TC-FR16-20 – đề tài nguồn GV khẳng định **0** AdvisorRequest và đúng 1 Advising (thay vì "có AdvisorRequest ACCEPTED"); đề tài SV giữ mọi khẳng định cũ; thêm khẳng định có đúng 3 đề tài nguồn GV. TC-FR03-20 – đề tài GV ở RECRUITING: số trưởng nhóm = (có thành viên ? 1 : 0), số thành viên ≤ `recruitSlots`; mọi đề tài khác giữ "đúng 1 trưởng nhóm, [min, max]". Lý do: đặc tả đổi (FR31/FR33 – đang tuyển chưa ai được duyệt; người được duyệt đầu tiên là trưởng nhóm). Bảng việc ghi phần sửa TC-FR16-20 ở DC-06, nhưng seed của DC-05 làm giả định cũ sai nên phải sửa ngay.
4. `transitions.test.js`: dòng khóa `ENABLED_ACTIONS` đổi `[]` → `['PUBLISH_RECRUITMENT','UNPUBLISH_RECRUITMENT']` như comment DC-01 yêu cầu.
