# API_GD6 – Hợp đồng API giai đoạn 6 (luồng ngoại lệ)

- Task: T600 · FR18–FR23 + G5 (`API_GD2.md` §12, §14 – FR06 mục 3 "cán bộ cho phép gửi với cờ chưa kiểm tra") + INFO 12 `reviews/T300-reviewer-v1.md` · NFR02, NFR05 · Người soạn: kien-truc-su · Ngày: 2026-11-06
- Trạng thái: **ĐỀ XUẤT – vòng 1** (chờ RV, FE, BE duyệt).
- Nguồn: `docs/DAC_TA.md` (mục 2 FR18–FR23, mục 3 "Khi có lỗi", mục 4 FR19, mục 5, mục 8), `design/API_GD2.md` (toàn bộ quy ước, §14), `design/API_GD45.md` (§1.2 khóa, §2 mã lỗi, §6.4 kết quả, §7 đóng, §8 thông báo), code: `packages/shared/src/transitions.js`, `apps/api/prisma/schema.prisma` (`ChangeRequest`, `ChangeType`, `Advising`, `TopicMember`, `ResultVersion`, `Submission`), `apps/api/src/modules/topics/{service,stateMachine,reviewService,listService}.js`, `apps/api/src/modules/notifications/notify.js`, `apps/api/prisma/sql/after_init.sql`.
- Hiện thực, theo thứ tự trên bảng việc:
  - **T601**: §1 (quan hệ mới, kiểm GVHD dưới khóa), §2 (khung `ChangeRequest` chung + migration `gd6_change_requests`), §3 (FR19, quyền đọc GV cũ) + các MINOR đã gom.
  - **T602**: §4 (FR20, loại `CANCEL`).
  - **T603**: §5 (FR21: rời trước duyệt, loại `LEAVE_GROUP`, quyền đọc theo khoảng thành viên).
  - **T604**: §7 (FR23).
  - **T605**: §6 (FR18, loại `TOPIC_CHANGE`) + §10 (INFO 12, chặn đổi tham số đợt làm kẹt đề tài).
  - **T606**: §8 (FR22, migration riêng `fr22_milestone_reopen`).
  - **T609**: §9 (G5, migration riêng `g5_similarity_bypass`, nới trigger `Submission`) + `latestSimilarityStatus` (§9.6).
  - **T607**: UI theo §12, dùng đúng tên trường của tài liệu này.
  - **Đề xuất cho điều phối viên**: T602, T603, T605 dùng khung §2 do T601 tạo → thêm phụ thuộc T601 cho ba task này. T604, T606, T609 không phụ thuộc T601.

Mọi quy ước của `API_GD2.md` §1 (đường dẫn, middleware, định dạng, thời gian, khóa lạc quan, transaction, phân trang, `withLockTx`) và `API_GD45.md` §1 (thứ tự kiểm, khóa §1.2, `EXEC_OPEN`, Cloudinary ngoài transaction) **giữ nguyên**. Giả định đánh số tiếp từ **G33** (§13).

---

## 0. Chuyển trạng thái ↔ `TRANSITIONS`

**Không thêm, không sửa dòng nào trong `TRANSITIONS`.** Lý do: mục 5 đặc tả ghi "FR18, FR19, FR21, FR22, FR23 không đổi trạng thái đề tài; chúng tạo bản ghi yêu cầu riêng và ghi lịch sử". Lần chuyển duy nhất của GĐ6 là `CANCEL` (IN_PROGRESS → CANCELLED, STAFF, `reasonRequired`, FR20) – **đã có** ở `transitions.js:15`.

- `CANCEL` chỉ chạy **bên trong** `POST /api/change-requests/:id/approve` với yêu cầu loại `CANCEL` (mục 5: "Có đề nghị và quyết định hủy kèm lý do"). Dùng đúng `checkTransition` + `applyTransition` với action `'CANCEL'`, nên đường đi vẫn nằm trong bảng.
- `POST /api/topics/:id/actions` **tiếp tục từ chối** `CANCEL` (400), `ENABLED_ACTIONS` **tiếp tục không có** `CANCEL`. Như vậy không có hai đường làm cùng một việc, và các test hiện có (`T405-close.test.js:38-42`, `T212a-review.test.js:83`, `T210-advisor.test.js:108`) giữ nguyên.
- Chỉ sửa **chú thích** (T602): `transitions.js:22` `// Action đã có API (API_GD45 §7.4); CANCEL mở ở T602` → `// Action gọi qua POST /actions; CANCEL chỉ chạy khi cán bộ duyệt đề nghị hủy (API_GD6 §4)`, và `schemas.js:77` tương tự.

---

## 1. Quy ước bổ sung (T601)

### 1.1 Quan hệ mới (tính từ DB, thêm vào `relations()` ở `topics/service.js`)
| Ký hiệu | Định nghĩa | Được |
|---|---|---|
| `isFormerAdvisorReader` | Có `Advising` của đề tài với `lecturerId = me`, `endAt IS NOT NULL`, `readOnlyGranted = true`, và **không** `isCurrentAdvisor` | Mọi endpoint **đọc** mà `isCurrentAdvisor` đọc được (chi tiết, thực hiện, snapshot, lịch sử). Không ghi gì (FR19.4 "trừ khi cán bộ cấp quyền chỉ đọc") |
| `isChangeTarget` | Có `ChangeRequest` `PENDING` của đề tài với `targetUserId = me` và loại `ADVISOR_CHANGE` hoặc `TOPIC_CHANGE` | Chỉ `GET /api/topics/:id` (như `isRequestedLecturer`, để quyết định đồng ý) và yêu cầu của chính mình (§2.4) |
| `formerMemberWindows` | Danh sách `[joinedAt, leftAt)` của các dòng `TopicMember` của me có `leftAt IS NOT NULL` | Chỉ các phiên bản trong khoảng (§5.4) |

- `canView` (= quyền `GET /api/topics/:id`) thêm `isFormerAdvisorReader || isChangeTarget`.
- `canReadExecution` (API_GD45 §1.1) và quyền đọc snapshot (API_GD2 §8.4) thêm `isFormerAdvisorReader`. **Không** thêm `isChangeTarget`.
- GV cũ **không** được cấp quyền: không có quan hệ nào → 403 ở mọi endpoint (FR19.4 "mất mọi quyền, kể cả quyền đọc"). Người đã rời nhóm: 403 ở mọi endpoint trừ §5.4.
- Gom 5 bản sao biểu thức `rel.isMember || rel.isCurrentAdvisor || (rel.inStaffScope && status ≠ DRAFT)` (`feedbackService.js:26`, `progressService.js:21`, `execution/service.js:30`, `snapshotService.js:24`, `service.js:105`) về **một** hàm `canReadExecution(t, rel)` export từ `topics/service.js`, rồi thêm `isFormerAdvisorReader` một lần (T601). Không sửa từng nơi.
- `GET /api/topics` (LECTURER): phạm vi thêm đề tài có `isFormerAdvisorReader` (`advisings: { some: { lecturerId: me, OR: [{ endAt: null }, { readOnlyGranted: true }] } }`) – GV cần lối vào để đọc. Bộ lọc `lecturerId` và thống kê **không đổi** (G29: chỉ GVHD hiện hành).

### 1.2 Kiểm GVHD hiện hành **dưới khóa** (bắt buộc từ T601 – FR19 "từ lúc duyệt quyền GV cũ chấm dứt")
Duyệt thay GV (§3.4) khóa Topic. Mọi thao tác chỉ GVHD hiện hành được làm phải **đọc lại `Advising` hiện hành sau câu khóa Topic** và trả 403 nếu không còn là GVHD. Áp dụng cho: tạo/sửa mốc, đổi hạn mốc (nhánh LECTURER), nhận xét bản nộp/tiến độ, nhập kết quả, mở lại mốc (§8), và `REQUEST_CLOSE` (kiểm lại trong `extra`). Đây chính là MINOR m1 `reviews/T404-reviewer-v1.md` (`feedbackService.js:21-30`) và MINOR m4 `reviews/T405-reviewer-v1.md` ("`rel` dưới khóa"). Gợi ý hiện thực: `lockTopicForExecution(tx, topicId)` (API_GD45 §11c) trả thêm `advisorId` đọc bằng câu riêng sau câu khóa.

Kết quả: GV cũ gửi nhận xét đúng lúc cán bộ duyệt thay GV → hoặc nhận xét commit **trước** (vẫn hợp lệ, giữ tên người viết – FR19.4), hoặc nhận 403 **sau**; không bao giờ có nhận xét của GV cũ ghi sau thời điểm duyệt.

### 1.3 Khóa, transaction, lịch sử
- Mọi thao tác ghi của GĐ6 chạy qua `withLockTx`. Thứ tự khóa **Topic → User (id tăng dần)** (API_GD2 §1.8). Câu khóa Topic: `SELECT id, status, version FROM "Topic" WHERE id = $1 FOR NO KEY UPDATE`, hoặc `topic.updateMany` có điều kiện khi cần tăng `version`.
- Chuyển trạng thái của `ChangeRequest` luôn bằng **cập nhật có điều kiện** `changeRequest.updateMany({ where: { id, status: 'PENDING', … }, data })`; `count = 0` → 409 `CHANGE_REQUEST_CLOSED`. Nhờ vậy hai cán bộ bấm duyệt/từ chối cùng lúc, hoặc người tạo rút đúng lúc cán bộ duyệt, chỉ một bên thắng.
- **StatusHistory**: chỉ `CANCEL` (qua `applyTransition`). Các thao tác còn lại không đổi trạng thái đề tài → ghi **bản ghi riêng** (`ChangeRequest`, `MilestoneReopen`, `ResultVersion`, `SimilarityBypass`) + **AuditLog** trong cùng transaction (mục 5 đặc tả, FR15). Tên `action` của AuditLog ghi ở từng endpoint.
- **Thông báo** (§11) ghi trong cùng transaction bằng `notify`/`notifyTopic` có sẵn.
- Tăng `Topic.version` khi đổi tập thành viên, đổi GVHD, đổi nội dung hồ sơ, hoặc đổi trạng thái (giống API_GD2 §1.5). Các thao tác khác **không** tăng.

---

## 2. Khung yêu cầu thay đổi `ChangeRequest` – dùng chung FR18, FR19, FR20, FR21 (T601)

### 2.1 Mô hình
Một bảng `ChangeRequest` (đã có) cho bốn loại `ChangeType`: `TOPIC_CHANGE` (FR18), `ADVISOR_CHANGE` (FR19), `CANCEL` (FR20), `LEAVE_GROUP` (FR21).

Vòng đời (`status` dùng enum `RequestStatus` có sẵn):
```
PENDING, stage TARGET ──(người đích đồng ý)──► PENDING, stage STAFF ──(cán bộ duyệt)──► ACCEPTED
        │                         │                                  └─(cán bộ từ chối)─► DECLINED
        ├─(người đích từ chối)────┼──────────────────────────────────────────────────────► DECLINED
        ├─(cán bộ từ chối)────────┘
        └─(người tạo rút, bất kỳ stage)──────────────────────────────────────────────────► WITHDRAWN
```
- `stage` **suy ra**, không lưu: `TARGET` nếu `targetUserId ≠ null && targetAcceptedAt = null`; `STAFF` nếu `status = PENDING` còn lại; `null` khi đã kết thúc.
- Có `targetUserId` (phải được người đích đồng ý trước): `ADVISOR_CHANGE` (GV mới – FR19.2), `TOPIC_CHANGE` có thêm thành viên (SV được thêm – FR03 "lời mời được chấp nhận mới thành thành viên"). `LEAVE_GROUP` đặt `targetUserId = người rời` và `targetAcceptedAt = createdAt` (không có bước đích). `CANCEL`: `targetUserId = null`.
- **Không tự đóng** (FR20, G39): không có job hết hạn. Khi trạng thái đề tài đổi, yêu cầu vẫn `PENDING`; lúc duyệt kiểm lại điều kiện và trả 409 nếu không còn hợp lệ; người tạo rút hoặc cán bộ từ chối.
- Mỗi đề tài tối đa **một** yêu cầu `PENDING` mỗi loại; riêng `LEAVE_GROUP` tối đa một mỗi người rời (partial unique index §2.6). Tạo trùng → 409 `CHANGE_REQUEST_PENDING`.
- `payload` (Json) **bất biến** sau khi tạo (trigger §2.6), là "trước, sau" của FR18 và hồ sơ của mỗi loại:

| `type` | `payload` |
|---|---|
| `TOPIC_CHANGE` | `{ before: { <chỉ các trường đổi> }, after: { <chỉ các trường đổi> }, addMember: { userId, code, fullName } \| null }` – trường ∈ `title, summary, objectives, keywords, fieldId`; có `fieldId` thì kèm `fieldName` ở cả hai phía |
| `ADVISOR_CHANGE` | `{ from: { lecturerId, fullName }, to: { lecturerId, fullName }, topicStatus }` |
| `CANCEL` | `{ topicStatus: 'IN_PROGRESS', requesterRole: 'STUDENT' \| 'LECTURER' }` |
| `LEAVE_GROUP` | `{ member: { userId, code, fullName }, memberCountBefore }` |

### 2.2 `ChangeRequestView`
```json
{ "id": "cr1", "type": "ADVISOR_CHANGE", "status": "PENDING", "stage": "STAFF",
  "topic": { "id": "t1", "code": "NCKH-2026-0007", "title": "…" },
  "reason": "GVHD đi công tác dài hạn",
  "payload": { "from": { "lecturerId": "l1", "fullName": "TS. A" }, "to": { "lecturerId": "l2", "fullName": "TS. B" }, "topicStatus": "IN_PROGRESS" },
  "createdBy": { "id": "u1", "fullName": "…", "role": "STUDENT" }, "createdAt": "…",
  "target": { "id": "l2", "fullName": "TS. B", "role": "LECTURER" }, "targetAcceptedAt": "…",
  "decidedBy": null, "decisionReason": null, "decidedAt": null,
  "similarityCheck": null,
  "availableActions": ["APPROVE", "DECLINE"] }
```
- `decisionReason` = cột `decisionNote` (lý do quyết định của cán bộ, lý do từ chối của người đích, hoặc `null` khi rút).
- `similarityCheck`: chỉ `TOPIC_CHANGE` có đổi `title`/`summary` – `SimilarityCheckView` (API_GD2 §7.2, ẩn/hiện theo người xem); còn lại `null`.
- `availableActions` (không xét điều kiện dữ liệu, giống `TopicDetail`):
  - `ACCEPT`, `DECLINE`: người đích, `stage = TARGET`;
  - `APPROVE`: STAFF `inStaffScope`, `stage = STAFF`;
  - `DECLINE`: STAFF `inStaffScope`, mọi `stage` của `PENDING`;
  - `WITHDRAW`: người tạo, `PENDING`.
- `payload.addMember`, `payload.member` chỉ có mã + họ tên (không email, lớp).

### 2.3 Endpoint ghi
Tất cả: limiter 30/15 phút/`req.user.id` (chung bộ đếm), ADMIN 403, thứ tự kiểm theo API_GD45 §1.1 (tải → quyền đọc 403 → quyền ghi 403 → trạng thái 409 → điều kiện riêng).

**`POST /api/topics/:id/change-requests`** – tạo. Body `changeRequestCreateSchema` (union theo `type`, §2.7). Quyền, trạng thái và điều kiện của từng loại: §3.2, §4.1, §5.2, §6.2. Ghi `ChangeRequest` + AuditLog `CHANGE_REQUEST_CREATE` (`after`: `type`, `payload`, `reason`) + thông báo `CHANGE_REQUESTED` (+ `CHANGE_TARGET_INVITED` nếu có người đích). Có `TOPIC_CHANGE` đổi tên/tóm tắt: chạy FR06 **trước** transaction (§6.2).
201 `{ "changeRequest": ChangeRequestView }`.

**`POST /api/change-requests/:id/accept`** – người đích, `stage = TARGET` (403 nếu không phải người đích; 409 `CHANGE_REQUEST_CLOSED` nếu không còn TARGET). Body `emptyBodySchema`. `withLockTx`: khóa User của chính mình → kiểm sớm (hạn mức GV §3.3 / số đề tài hoạt động của SV §6.3) → `updateMany({ where: { id, status: 'PENDING', targetAcceptedAt: null }, data: { targetAcceptedAt: now } })`. AuditLog `CHANGE_REQUEST_ACCEPT`. Thông báo `CHANGE_TARGET_ACCEPTED`.
200 `{ "changeRequest": ChangeRequestView }`.

**`POST /api/change-requests/:id/decline`** – người đích ở `stage = TARGET`, hoặc STAFF `inStaffScope` ở mọi stage. Body `changeRequestDeclineSchema { reason }` (bắt buộc, 5..2000). `updateMany where { id, status: 'PENDING' }` → `DECLINED`, `decidedById = me`, `decidedAt = now`, `decisionNote = reason`. AuditLog `CHANGE_REQUEST_DECLINE`. Thông báo `CHANGE_DECIDED`. Bị từ chối thì **mọi thứ giữ nguyên** (FR18).
200 `{ "changeRequest": ChangeRequestView }`.

**`POST /api/change-requests/:id/withdraw`** – chỉ người tạo, `PENDING`. Body `emptyBodySchema`. `updateMany where { id, status: 'PENDING', createdById: me }` → `WITHDRAWN`, `decidedAt = now`. AuditLog `CHANGE_REQUEST_WITHDRAW`. Thông báo `CHANGE_WITHDRAWN`.
200 `{ "changeRequest": ChangeRequestView }`.

**`POST /api/change-requests/:id/approve`** – STAFF `inStaffScope`. Body `changeRequestApproveSchema { reason? }` (5..2000; **bắt buộc với `CANCEL`** – thiếu thì `checkTransition` trả 400 `REASON_REQUIRED`). `stage = TARGET` → 409 `CHANGE_NOT_READY`.
Xử lý chung trong **một** `withLockTx`:
1. Khóa Topic (§1.3), đọc lại trạng thái.
2. `changeRequest.updateMany({ where: { id, status: 'PENDING', NOT: { targetUserId: { not: null }, targetAcceptedAt: null } }, data: { status: 'ACCEPTED', decidedById, decidedAt, decisionNote: reason ?? null } })`; `count = 0` → 409 `CHANGE_REQUEST_CLOSED`.
3. Kiểm lại điều kiện và áp dụng theo loại: §3.4, §4.2, §5.3, §6.4. Lỗi ở bước này → rollback cả bước 2 (yêu cầu vẫn `PENDING`).
4. AuditLog `CHANGE_REQUEST_APPROVE` + AuditLog hiệu lực theo loại. Thông báo `CHANGE_DECIDED`.

200 `{ "changeRequest": ChangeRequestView, "topic": TopicDetail }` (cán bộ luôn xem được đề tài).
Lỗi chung: 400, 403, 404, 409 `CHANGE_REQUEST_CLOSED` / `CHANGE_NOT_READY` / `STALE_CHANGE_REQUEST` / `CONCURRENT_UPDATE` + mã riêng từng loại, 503 `SERVICE_BUSY`.

### 2.4 Endpoint đọc
**`GET /api/topics/:id/change-requests`** – `canView` (§1.1). Người đích chỉ thấy yêu cầu mà mình là đích; thành viên, GVHD hiện hành, GV cũ có quyền đọc, cán bộ trong phạm vi thấy mọi yêu cầu của đề tài. Query `paginationQuery`. Sắp `createdAt` giảm dần. `{ items: [ChangeRequestView], page, pageSize, total }`.

**`GET /api/change-requests`** – hộp yêu cầu theo vai trò (hàng chờ của cán bộ, lời đề nghị cho GV mới/SV được thêm).
Query `changeRequestListQuerySchema`: `status?` enum RequestStatus, `type?` enum ChangeType, `stage?` enum `TARGET|STAFF`, `roundId?`, `topicId?`, `page`, `pageSize`.
Phạm vi (áp ở `WHERE`, trước phân trang):
| Vai trò | Thấy |
|---|---|
| STAFF | Đề tài có `facultyId` trong phạm vi |
| LECTURER | `targetUserId = me` **hoặc** đề tài mình là GVHD hiện hành |
| STUDENT | `targetUserId = me` **hoặc** `createdById = me` **hoặc** đề tài mình là thành viên hiện hành |
| ADMIN | 403 |

Hàng chờ cán bộ = `?status=PENDING&stage=STAFF`.

**`GET /api/change-requests/:id`** – như danh sách (ngoài phạm vi → 403). `{ "changeRequest": ChangeRequestView }`.

### 2.5 Mở rộng `TopicDetail` (API_GD2 §5.1, API_GD45 §7.4)
- `pendingChangeRequests: [{ id, type, stage, createdAt }]` – cho thành viên, GVHD hiện hành, cán bộ trong phạm vi; người đích chỉ thấy yêu cầu của mình; người khác `[]`.
- `readOnlyAccess: boolean` – `true` khi người xem chỉ có `isFormerAdvisorReader` (FE hiện dải "Bạn chỉ có quyền đọc").
- `formerAdvisors: [{ lecturerId, fullName, startAt, endAt, readOnlyGranted }]` – chỉ cán bộ trong phạm vi; người khác `[]`.
- `permissions` thêm (chỉ xét vai trò, quan hệ, trạng thái – không xét điều kiện dữ liệu):
  - `requestTopicChange` = `isLeader && IN_PROGRESS`;
  - `requestAdvisorChange` = (`isLeader` || `inStaffScope`) && `status ∈ ADVISOR_CHANGE_STATUSES`;
  - `requestCancel` = (`isLeader` || `isCurrentAdvisor`) && `IN_PROGRESS`;
  - `leave` = `isMember && !isLeader && status ∈ PRE_APPROVAL_STATUSES` (rời ngay, §5.1);
  - `requestLeave` = `isMember && !isLeader && IN_PROGRESS`;
  - `reopenMilestone` = `isCurrentAdvisor && IN_PROGRESS`;
  - `correctResult` = `inStaffScope && CLOSED`;
  - `grantSimilarityBypass` (§9.2), `manageFormerAdvisorAccess` = `inStaffScope`.
  - Với `isFormerAdvisorReader`: mọi quyền ghi `false`, `readExecution`, `viewHistory` `true`.

### 2.6 Thay đổi schema/SQL – migration `gd6_change_requests` (T601)
**Prisma:**
| Model | Thay đổi |
|---|---|
| `ChangeRequest` | + `targetUserId String?` (FK `User`, quan hệ `"ChangeRequestTarget"`), + `targetAcceptedAt DateTime? @db.Timestamptz(6)`, + `similarityCheckId String? @unique` (FK `SimilarityCheck`, chỉ `TOPIC_CHANGE`); `createdById` → FK `User` (`"ChangeRequestCreatedBy"`), `decidedById` → FK `User` (`"ChangeRequestDecidedBy"`); + `@@index([topicId, status])`, `@@index([targetUserId, status])`, `@@index([status, type])` |
| `Advising` | + `readOnlyGranted Boolean @default(false)` (FR19.4) |
| `User`, `SimilarityCheck` | quan hệ ngược tương ứng |

**SQL thô** (cuối `migration.sql` **và** `after_init.sql`):
```sql
-- Một yêu cầu đang chờ mỗi loại mỗi đề tài; LEAVE_GROUP: mỗi người rời
CREATE UNIQUE INDEX change_request_one_pending ON "ChangeRequest"
  ("topicId", type, (CASE WHEN type = 'LEAVE_GROUP' THEN "targetUserId" ELSE '' END)) WHERE status = 'PENDING';
-- payload, lý do, người tạo bất biến; chỉ PENDING được đổi, và chỉ các cột quyết định
CREATE OR REPLACE FUNCTION change_request_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'ChangeRequest chỉ thêm'; END IF;
  IF OLD.status <> 'PENDING'
     OR (to_jsonb(NEW) - ARRAY['status','decidedById','decisionNote','decidedAt','targetAcceptedAt'])
        <> (to_jsonb(OLD) - ARRAY['status','decidedById','decisionNote','decidedAt','targetAcceptedAt']) THEN
    RAISE EXCEPTION 'ChangeRequest đã quyết định hoặc sửa cột bất biến';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER change_request_guarded BEFORE UPDATE OR DELETE ON "ChangeRequest" FOR EACH ROW EXECUTE FUNCTION change_request_guard();
CREATE TRIGGER change_request_no_truncate BEFORE TRUNCATE ON "ChangeRequest" FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
```
- Vi phạm `change_request_one_pending` (P2002) → service bắt và trả 409 `CHANGE_REQUEST_PENDING` (không để thành `DUPLICATE` chung).
- Test `pg_indexes`/`pg_trigger` của T203 bổ sung 1 index + 2 trigger. Kiểm `prisma migrate dev --create-only` không sinh `DROP INDEX` (index biểu thức). Script reset DB test xử lý trigger mới như bảng chỉ-thêm khác (API_GD45 §11b).
- `seed.js:416-428` tạo `ChangeRequest CANCEL` với `payload: {}` → T602 sửa theo dạng `payload` §2.1.

### 2.7 Schema ở `packages/shared` (T601 tạo khung; nhánh từng loại do task của loại đó thêm)
| Tên | Nội dung | Task |
|---|---|---|
| `CHANGE_TYPE` (= enum Prisma) + `CHANGE_TYPE_LABEL` (Thay đổi sau duyệt / Thay giảng viên / Hủy đề tài / Rời nhóm), `CHANGE_STAGE` (`TARGET`, `STAFF`) + `CHANGE_STAGE_LABEL` (Chờ người được đề xuất đồng ý / Chờ cán bộ khoa duyệt) | `enums.js`/`labels.js` | T601 |
| `ADVISOR_CHANGE_STATUSES` = `['HAS_ADVISOR', 'UNDER_REVIEW', 'NEEDS_REVISION', 'IN_PROGRESS']`; `PRE_APPROVAL_STATUSES` = `['DRAFT', 'WAITING_ADVISOR', 'HAS_ADVISOR', 'UNDER_REVIEW', 'NEEDS_REVISION']` | `enums.js` | T601 |
| `changeRequestCreateSchema` = `z.discriminatedUnion('type', [...])`, mọi nhánh có `reason` (trim 5..2000): `ADVISOR_CHANGE { newLecturerId: idSchema }` (T601); `CANCEL {}` (T602); `LEAVE_GROUP {}` (T603); `TOPIC_CHANGE` (T605, §6.1) | §2.3 | T601–T605 |
| `changeRequestApproveSchema { reason? }`, `changeRequestDeclineSchema { reason }`, `changeRequestListQuerySchema` | §2.3–2.4 | T601 |
| `formerAdvisorAccessSchema { granted: boolean, reason }` | §3.5 | T601 |
| `leaveTopicSchema { version }` | §5.1 | T603 |
| `resultCorrectionSchema` | §7 | T604 |
| `milestoneReopenSchema { version, reason }` | §8 | T606 |
| `similarityBypassCreateSchema { reason }` | §9 | T609 |
| `NOTIFICATION_TYPES` + `NOTIFICATION_TYPE_LABEL` thêm các loại §11 | §11 | task gắn sự kiện |

Tất cả theo QD §5 (`.max()` trước refine, strict object ở body, thông điệp tiếng Việt).

---

## 3. FR19 – Thay giảng viên (T601)

### 3.1 Tóm tắt luồng (mục 4 FR19)
Trưởng nhóm hoặc cán bộ tạo yêu cầu (lý do + GV mới) → GV mới đồng ý (kiểm hạn mức như FR16) → cán bộ duyệt → trong **một** transaction: kết thúc Advising cũ, tạo Advising mới, bàn giao bản nộp chờ nhận xét. Trong lúc chờ, GVHD hiện hành làm việc bình thường (FR19.5).

### 3.2 Tạo – `type: ADVISOR_CHANGE`
- Quyền: STUDENT `isLeader` hoặc STAFF `inStaffScope` (FR19.1). Khác → 403.
- Trạng thái: `status ∈ ADVISOR_CHANGE_STATUSES` (G35), không thì 409 `INVALID_TRANSITION` với thông điệp "Không thể thay giảng viên ở trạng thái hiện tại" (không đổi trạng thái nhưng cùng ý nghĩa với FE; dùng lại mã để FE không thêm nhánh).
- `newLecturerId`: user `role LECTURER`, không khóa, `facultyId = topic.facultyId`, **khác** GVHD hiện hành → không thì 400 `VALIDATION_ERROR` `{ newLecturerId: "Giảng viên không hợp lệ" }` (một thông điệp chung).
- Hạn mức **không** chặn lúc tạo (giống FR16: kiểm tại thời điểm nhận); FE dùng `GET /api/lecturers?roundId=` để hiện "Đã nhận x/5".
- `targetUserId = newLecturerId`. `payload.from` = GVHD hiện hành đọc từ DB.

### 3.3 GV mới đồng ý – `POST /api/change-requests/:id/accept`
Trong `withLockTx`: khóa User GV (§1.8 API_GD2) → đếm bằng câu riêng số đề tài hoạt động GV đang hướng dẫn trong đợt (Advising `endAt IS NULL`, cùng `roundId`, `isActiveStatus`) `< maxTopicsPerLecturer` → không thì 409 `LECTURER_QUOTA_EXCEEDED`. Đây là kiểm **sớm** để GV biết ngay; kiểm ràng buộc ở §3.4.

### 3.4 Cán bộ duyệt – hiệu lực (bước 3 của §2.3)
Sau khóa Topic và cập nhật có điều kiện yêu cầu:
1. `status ∈ ADVISOR_CHANGE_STATUSES` (đọc dưới khóa) → không thì 409 `INVALID_TRANSITION`.
2. Advising hiện hành của đề tài có `lecturerId = payload.from.lecturerId` → không thì 409 `STALE_CHANGE_REQUEST`.
3. Khóa User GV mới; GV mới không khóa (409 `STALE_CHANGE_REQUEST` "Giảng viên mới không còn hoạt động"); đếm lại hạn mức như §3.3 (409 `LECTURER_QUOTA_EXCEEDED`). Đề tài này chưa có Advising với GV mới nên không bị tính.
4. `advising.updateMany({ where: { topicId, endAt: null }, data: { endAt: now } })` **trước**, rồi `advising.create({ topicId, lecturerId: new, startAt: now })` (thứ tự bắt buộc vì `advising_one_current` không deferrable).
5. `topic.updateMany({ where: { id }, data: { version: { increment: 1 } } })`.
6. **Bàn giao bản nộp chờ nhận xét** (G36): không có cột nào để chuyển, vì người nhận xét được suy ra từ Advising hiện hành; từ bước 4 mọi bản nộp hiện ra ở GV mới và GV cũ mất quyền. Tính danh sách `pendingDocumentIds` = bản **mới nhất** của mỗi chuỗi mốc có `milestone.evaluation ≠ PASSED` và **chưa có** `Feedback` nào sau `uploadedAt` của bản đó. Ghi vào AuditLog và thông báo GV mới (bước 7).
7. AuditLog `ADVISOR_CHANGE_APPLY` (`entityType: 'Topic'`, `before: { lecturerId }`, `after: { lecturerId, pendingDocumentIds }`). Thông báo `CHANGE_DECIDED` (thành viên, GV cũ, GV mới, người tạo) + `ADVISOR_HANDOVER` cho GV mới nếu `pendingDocumentIds.length > 0`.

Giữ nguyên: mọi `Feedback`, `ResultVersion`, `MilestoneDueChange`, `Milestone.createdById` giữ tên người viết (FR19.4; bảng chỉ-thêm). **Kết quả cuối do GV cũ nhập không còn tính** cho điều kiện đóng (G25 – `hasFinalResult` yêu cầu GVHD hiện hành), GV mới phải nhập lại; `closeReadiness.hasFinalResult` phản ánh ngay.
Đề nghị hướng dẫn: không liên quan (đề tài đã qua WAITING_ADVISOR).

### 3.5 Quyền chỉ đọc cho GV cũ
**`PUT /api/topics/:id/former-advisors/:lecturerId/read-access`** – STAFF `inStaffScope` · `withLockTx` (khóa Topic) · AuditLog `FORMER_ADVISOR_ACCESS` (`before/after: { readOnlyGranted }`, `reason`).
Body `formerAdvisorAccessSchema { granted: boolean, reason: trim 5..2000 }`.
Kiểm: `lecturerId` có Advising đã kết thúc của đề tài và không phải GVHD hiện hành → không thì 404. `advising.updateMany({ where: { topicId, lecturerId, endAt: { not: null } }, data: { readOnlyGranted: granted } })`.
Mọi trạng thái đề tài (kể cả CLOSED, CANCELLED). Hiệu lực ngay ở request kế tiếp (quan hệ tính lại mỗi request). Không thông báo.
200 `{ "formerAdvisors": [...] }` (dạng §2.5).

### 3.6 Ảnh hưởng thống kê, kho, FR06
- Thống kê chiều `lecturer` và phạm vi LECTURER chuyển ngay sang GV mới (G29). CSV khớp vì cùng `computeStats`.
- Kho tra cứu, kho so FR06: không đổi (không hiện GVHD).

### 3.7 Ca biên, đồng thời, test bắt buộc (T601)
| # | Ca | Kỳ vọng |
|---|---|---|
| 1 | Luồng đủ: SV tạo → GV mới đồng ý → cán bộ duyệt | Advising cũ có `endAt`, mới `endAt = null`; `GET /api/topics/:id` GV cũ 403, GV mới 200; `GET /api/topics` của GV cũ không còn đề tài |
| 2 | Bản nộp chờ nhận xét | Sau duyệt GV mới nhận xét được bản đó (201), GV cũ 403; AuditLog có `pendingDocumentIds` đúng; nhận xét cũ vẫn hiện tên GV cũ |
| 3 | **Đồng thời**: cán bộ duyệt ‖ GV cũ gửi nhận xét/nhập kết quả/`REQUEST_CLOSE` | Không có bản ghi của GV cũ với `createdAt` sau `Advising.endAt`; bên thua nhận 403 hoặc 409, không 500 |
| 4 | **Đồng thời**: hai lần duyệt thay GV khác đề tài, cùng GV mới còn 1 suất | Đúng một thành công, bên kia 409 `LECTURER_QUOTA_EXCEEDED` |
| 5 | Hai cán bộ duyệt/từ chối cùng một yêu cầu; người tạo rút ‖ cán bộ duyệt | Một bên thắng, bên kia 409 `CHANGE_REQUEST_CLOSED`; không có Advising mới khi rút thắng |
| 6 | Duyệt khi `stage = TARGET` | 409 `CHANGE_NOT_READY` |
| 7 | Tạo trùng (đã có PENDING) | 409 `CHANGE_REQUEST_PENDING` |
| 8 | Quyền: thành viên thường, GV hiện hành, GV khác, SV khác, cán bộ khoa khác, ADMIN tạo/duyệt | 403 |
| 9 | GV cũ được cấp quyền đọc | Đọc chi tiết, mốc, tài liệu, snapshot 200; mọi ghi 403; `permissions` ghi đều `false`; thu hồi → 403 |
| 10 | GV mới từ chối có lý do | `DECLINED`, Advising không đổi; thiếu lý do 400 |
| 11 | Sau thay GV, `REQUEST_CLOSE` của GV mới khi kết quả do GV cũ nhập | 409 `NO_FINAL_RESULT` |

---

## 4. FR20 – Đề nghị và quyết định hủy (T602)

### 4.1 Tạo – `type: CANCEL`
- Quyền: STUDENT `isLeader` hoặc LECTURER `isCurrentAdvisor` (FR20 "Trưởng nhóm hoặc GVHD"). Cán bộ **không** tự tạo (G38).
- Trạng thái: `IN_PROGRESS` (nguồn duy nhất của `CANCEL` trong `TRANSITIONS`) → không thì 409 `INVALID_TRANSITION`.
- `reason` bắt buộc (schema). `payload` theo §2.1.

### 4.2 Cán bộ duyệt – hiệu lực
- Trong cùng transaction của §2.3: `checkTransition({ action: 'CANCEL', actor, reason, ctx: { inStaffScope } })` (trạng thái sai → 409 `INVALID_TRANSITION`, thiếu lý do → 400 `REASON_REQUIRED`) rồi `applyTransition` với `topic.version` đọc dưới khóa. **Cách ghép**: gọi phần thân của `applyTransition` trên `tx` hiện tại (tách hàm `applyTransitionTx(tx, …)` từ `stateMachine.js`, `applyTransition` giữ nguyên chữ ký và gọi lại hàm này) để cập nhật yêu cầu và chuyển trạng thái nằm trong **một** transaction.
- Ghi: `StatusHistory { from: IN_PROGRESS, to: CANCELLED, action: 'CANCEL', reason }` (qua `recordStatus`), AuditLog `CHANGE_REQUEST_APPROVE`. Thông báo `CHANGE_DECIDED` với tiêu đề "Đề tài … đã bị hủy" → thành viên, GVHD, người tạo.
- Không xóa gì (FR20 "không bị xóa"). Các yêu cầu khác đang chờ của đề tài **giữ nguyên** (G39); duyệt chúng sau đó nhận 409 theo điều kiện trạng thái.

### 4.3 Ảnh hưởng
- Thống kê: đề tài CANCELLED vẫn được đếm (API_GD45 §9.1, đã có); chiều `result` → `null` (chưa CLOSED).
- Kho tra cứu: không vào. Kho so FR06: **rời kho** (mục 3 "không so với … Đã hủy").
- Mọi ghi GĐ4 trả 409 `TOPIC_NOT_IN_PROGRESS` (đã có).

### 4.4 Test bắt buộc (T602)
| # | Ca | Kỳ vọng |
|---|---|---|
| 1 | Trưởng nhóm tạo; GVHD tạo; thành viên thường, GV khác, cán bộ tạo | 201, 201, 403 |
| 2 | Duyệt có lý do | CANCELLED, StatusHistory có `reason`, `ChangeRequest.ACCEPTED`; thiếu lý do 400 `REASON_REQUIRED`, yêu cầu vẫn PENDING |
| 3 | Đề nghị không tự đóng: đề tài sang WAITING_CLOSE khi đề nghị đang chờ | Đề nghị vẫn PENDING; duyệt → 409 `INVALID_TRANSITION`; cán bộ từ chối được |
| 4 | **Đồng thời**: duyệt hủy ‖ `REQUEST_CLOSE` | Đúng một thành công |
| 5 | `/actions` với `CANCEL` | Vẫn 400 (test cũ giữ nguyên) |
| 6 | **Chuyển** ca `tests/T505-stats-consistency.test.js:170` (đang đổi thẳng DB) sang API tạo + duyệt đề nghị hủy | Số thống kê khớp CSV như cũ |
| 7 | Đề tài hủy | Vẫn có trong `/api/stats` chiều `status`; không có trong kho so FR06 |

---

## 5. FR21 – Rời nhóm và quyền đọc lịch sử (T603)

### 5.1 Trước duyệt – rời ngay
**`POST /api/topics/:id/leave`** – STUDENT `isMember` · `withLockTx`, câu đầu `topic.updateMany({ where: { id, version, status: { in: PRE_APPROVAL_STATUSES } }, data: { version: { increment: 1 } } })` · AuditLog `MEMBER_LEAVE` (`before: { userId, role }`, `after: { leftAt }`) · thông báo `MEMBER_LEFT`.
Body `leaveTopicSchema { version }`.
Kiểm (trước transaction cho thông điệp rõ, lặp lại dưới khóa):
- Trưởng nhóm → 409 `LEADER_CANNOT_LEAVE` "Trưởng nhóm cần chuyển quyền trưởng nhóm trước khi rời nhóm" (đảm bảo đúng một trưởng nhóm, FR03).
- `IN_PROGRESS`, `WAITING_CLOSE` → 409 `LEAVE_NEEDS_APPROVAL` "Đề tài đã được duyệt, rời nhóm cần cán bộ khoa duyệt" (FE chuyển sang §5.2).
- REJECTED, CANCELLED, CLOSED → 409 `TOPIC_NOT_EDITABLE`.
- `count = 0` ở câu khóa: đọc lại để phân biệt 409 `CONCURRENT_UPDATE` (lệch `version`) với lỗi trạng thái.

Ghi: `topicMember.updateMany({ where: { topicId, userId: me, leftAt: null }, data: { leftAt: now } })`. **Không** kiểm `minMembers` (FR21 "rời tự do"; G40). Mất quyền ngay ở request kế tiếp (quan hệ dùng `leftAt IS NULL`).
200 `{ "left": true, "topicId": "t1" }` (không trả `TopicDetail` vì người gọi đã mất quyền xem).

### 5.2 Sau duyệt – `type: LEAVE_GROUP`
- Quyền: STUDENT `isMember`, **không** trưởng nhóm (409 `LEADER_CANNOT_LEAVE`). Chỉ cho chính mình (không có trường chọn người).
- Trạng thái: `IN_PROGRESS` (G40; WAITING_CLOSE chỉ đọc theo G15) → không thì 409 `TOPIC_NOT_IN_PROGRESS`.
- Kiểm sớm: số thành viên hiện hành − 1 ≥ `minMembers` → không thì 409 `GROUP_TOO_SMALL`.
- `targetUserId = me`, `targetAcceptedAt = now` (vào thẳng stage STAFF).

**Cán bộ duyệt – hiệu lực:** dưới khóa Topic: `IN_PROGRESS` (409 `TOPIC_NOT_IN_PROGRESS`); người rời vẫn là thành viên hiện hành và không phải trưởng nhóm (409 `STALE_CHANGE_REQUEST`); **đếm lại** thành viên hiện hành (câu riêng sau khóa) − 1 ≥ `minMembers` của đợt (409 `GROUP_TOO_SMALL`) → `leftAt = now`, tăng `Topic.version`. AuditLog `MEMBER_LEAVE`. Thông báo `CHANGE_DECIDED` (thành viên còn lại, GVHD, người rời).

### 5.3 Ảnh hưởng
- Người rời: hết tính vào giới hạn đề tài hoạt động/đợt (đếm theo `leftAt IS NULL`); tiến độ của họ giữ nguyên tác giả, không sửa được nữa (chỉ tác giả là thành viên hiện hành, API_GD45 §4.2).
- Thống kê, kho: không đổi.

### 5.4 Quyền đọc của người đã rời
"Phiên bản" (G41) = **snapshot hồ sơ** (`Submission`) và **phiên bản tài liệu** (`Document`) có thời điểm tạo trong một khoảng `[joinedAt, leftAt)` của chính người đó. Không xem chi tiết đề tài hiện tại, mốc, tiến độ, nhận xét, kết quả, thành viên.

**`GET /api/me/past-topics`** – STUDENT. Query `paginationQuery`.
```json
{ "items": [{ "topicId": "t1", "code": "NCKH-2026-0007", "title": "…", "windows": [{ "joinedAt": "…", "leftAt": "…" }],
  "submissionCount": 2, "documentCount": 3 }], "page": 1, "pageSize": 20, "total": 1 }
```
- Chỉ đề tài có ít nhất một dòng `TopicMember` của me với `leftAt` khác `null` **và** me không còn là thành viên hiện hành.
- `title` = `payload.title` của snapshot mới nhất trong khoảng; không có → `null` (không lộ tên đổi sau khi rời, FR18).

Mở rộng endpoint có sẵn cho người đã rời (quyền kiểm theo khoảng, ngoài khoảng → 403 với snapshot cụ thể, bị lọc khỏi danh sách):
| Endpoint | Với người đã rời |
|---|---|
| `GET /api/topics/:id/submissions` | Chỉ item có `createdAt` trong khoảng |
| `GET /api/topics/:id/submissions/:seq` | 200 nếu trong khoảng, không thì 403. `similarityCheck` ẩn/hiện như STUDENT |
| `GET /api/topics/:id/submission-diff` | Cả `from` và `to` trong khoảng, không thì 403 |
| `GET /api/topics/:id/documents` | Chỉ bản có `uploadedAt` trong khoảng; `feedbackCount` không trả (`null`) |
| `POST /api/documents/:id/download-url` | 200 nếu `uploadedAt` trong khoảng (vẫn ghi AuditLog `DOCUMENT_DOWNLOAD`, FR24), không thì 403 |
| Mọi endpoint khác của đề tài | 403 |

Hàm dùng chung `inWindows(at, windows)` (`topics/service.js`); một nơi duy nhất, test đơn vị biên `joinedAt` (được) và `leftAt` (không được).

### 5.5 Test bắt buộc (T603)
| # | Ca | Kỳ vọng |
|---|---|---|
| 1 | Rời ở DRAFT, WAITING_ADVISOR, UNDER_REVIEW | 200; ngay sau đó `GET /api/topics/:id` 403; `GET /api/topics` không còn |
| 2 | Trưởng nhóm rời; rời ở IN_PROGRESS qua `/leave`; rời ở CLOSED | 409 `LEADER_CANNOT_LEAVE`, `LEAVE_NEEDS_APPROVAL`, `TOPIC_NOT_EDITABLE` |
| 3 | Sau duyệt: tạo → cán bộ duyệt; nhóm còn đúng min | Tạo/duyệt 409 `GROUP_TOO_SMALL` |
| 4 | **Đồng thời**: hai thành viên cùng được duyệt rời khi chỉ còn một suất trên min | Đúng một thành công, bên kia 409 `GROUP_TOO_SMALL` |
| 5 | **Đồng thời**: rời trước duyệt ‖ `REQUEST_ADVISOR` | Hoặc rời trước và `REQUEST_ADVISOR` đếm lại đúng (§5.5 API_GD2), hoặc rời nhận 409 `CONCURRENT_UPDATE`; không có trạng thái lệch |
| 6 | Quyền đọc theo khoảng: snapshot seq 1 (khi còn là thành viên) 200, seq 2 (sau khi rời) 403; tài liệu tương tự; diff 1↔2 403 | Đúng |
| 7 | Rời rồi được mời lại (DRAFT) rồi rời lần hai | Hai khoảng, đọc được cả hai, không đọc khoảng giữa |
| 8 | `GET /api/me/past-topics` | `title` lấy từ snapshot trong khoảng, `null` nếu không có |

---

## 6. FR18 – Thay đổi sau duyệt (T605)

### 6.1 Body nhánh `TOPIC_CHANGE` của `changeRequestCreateSchema`
```js
{ type: 'TOPIC_CHANGE', reason,
  changes?: z.strictObject({ title?, summary?, objectives?, keywords?, fieldId? }),  // giới hạn như topicSubmitSchema (tĩnh: title 10..300, summary ≤5000, objectives 20..3000, keywords ≤10 phần tử 1..60, fieldId idSchema)
  addMemberCode?: z.string().trim().min(1).max(64),
  justification?: z.string().trim().max(5000) }
// refine: ít nhất một trường trong changes hoặc có addMemberCode (lỗi ở khóa `_`: "Yêu cầu phải có ít nhất một thay đổi")
```
Phạm vi FR18 (G33): nội dung hồ sơ + **thêm tối đa một** thành viên mỗi yêu cầu. Đổi GV đi FR19; bớt thành viên đi FR21 (tự rời).

### 6.2 Tạo
- Quyền: STUDENT `isLeader` (FR03 "chỉ trưởng nhóm gửi hồ sơ"). Trạng thái `IN_PROGRESS` (409 `TOPIC_NOT_IN_PROGRESS`).
- `changes`: bỏ các trường giống giá trị hiện tại; còn rỗng và không có `addMemberCode` → 400 `VALIDATION_ERROR` `{ _: "Yêu cầu phải có ít nhất một thay đổi" }`.
- Nội dung sau khi gộp (`hiện tại + changes`) phải đạt `topicSubmitSchema(effectiveConfig hiện tại)` → 400 `TOPIC_INCOMPLETE` (details map trường). `fieldId` mới phải `isActive` (400 tại `changes.fieldId`).
- `addMemberCode`: SV tồn tại, không khóa, cùng khoa, chưa là thành viên hiện hành → không thì 400 `VALIDATION_ERROR` `{ addMemberCode: "Không tìm thấy sinh viên phù hợp" }` (thông điệp chung như lời mời). Kiểm sớm: số thành viên hiện hành < `maxMembers` (409 `GROUP_FULL`). Đặt `targetUserId` = SV đó (stage TARGET). Không có thì vào thẳng stage STAFF (`targetUserId = null`).
- **FR06 khi đổi `title` hoặc `summary`** (mục 3 "tự động chạy lại"): chạy `runSimilarityCheck` **ngoài transaction** trên nội dung **sau khi gộp** (cùng `topicId`, nên kho so tự loại chính đề tài), lưu `SimilarityCheck` kèm `justification`, rồi:
  - `status = ERROR` → 409 `SIMILARITY_NOT_CHECKED` `details: { similarityCheck }`, **không** tạo yêu cầu (mục 3: lỗi không coi là không trùng; người dùng thử lại).
  - `level = HIGH` và giải trình < `minJustificationWords` → 400 `JUSTIFICATION_REQUIRED` `details: { similarityCheck }`.
  - Thành công: `ChangeRequest.similarityCheckId` = id dòng kiểm. Cán bộ xem mức, top 5, giải trình trong `ChangeRequestView.similarityCheck` (như FR07).
  - Chỉ đổi `objectives`/`keywords`/`fieldId`: không chạy (đặc tả chỉ nêu tên, tóm tắt).
- Limiter FR06 (10/15 phút) áp thêm khi có chạy thuật toán.

### 6.3 SV được thêm đồng ý
`/accept` (§2.3): khóa User SV → đếm số đề tài hoạt động của SV trong đợt `< maxActiveTopicsPerStudent` (409 `STUDENT_TOPIC_LIMIT` `details: { codes }`) – kiểm sớm.

### 6.4 Cán bộ duyệt – hiệu lực
Dưới khóa Topic:
1. `IN_PROGRESS` (409 `TOPIC_NOT_IN_PROGRESS`).
2. Với mỗi trường trong `payload.before`: giá trị hiện tại phải bằng `before` → không thì 409 `STALE_CHANGE_REQUEST` (chặn ghi đè thay đổi khác).
3. Nội dung gộp vẫn đạt `topicSubmitSchema(cfg hiện tại)` (409 `TOPIC_INCOMPLETE` – tham số đợt có thể đã đổi; thông điệp "Hồ sơ sau thay đổi không còn đạt yêu cầu của đợt, vui lòng tạo yêu cầu mới").
4. Có `addMember` (**FR03 kiểm lại**): khóa User SV (sau Topic); SV không khóa, chưa là thành viên (409 `STALE_CHANGE_REQUEST`); đếm thành viên hiện hành < `maxMembers` (409 `GROUP_FULL`); đếm đề tài hoạt động của SV trong đợt < `maxActiveTopicsPerStudent` (409 `STUDENT_TOPIC_LIMIT`) → tạo `TopicMember { role: MEMBER, joinedAt: now }`.
5. **Hạn mức GV (FR16)**: GVHD không đổi nên số đề tài của GV không đổi – không có gì để kiểm (G33, câu hỏi `CAU_HOI.md` #10).
6. `topic.update` các trường `after`, tăng `version`. **Không** tạo `Submission` mới (G34): "trước/sau" nằm bất biến trong `ChangeRequest.payload`, kết quả FR06 trong `ChangeRequest.similarityCheckId`.
7. AuditLog `TOPIC_CHANGE_APPLY` (before/after như `TOPIC_UPDATE`, `summary` dạng digest) (+ `MEMBER_ADD` nếu có). Thông báo `CHANGE_DECIDED` (thành viên kể cả người mới, GVHD).

Bị từ chối/rút: hồ sơ giữ nguyên (FR18).

### 6.5 Ảnh hưởng
- Kho so FR06: đề tài IN_PROGRESS nên **nội dung mới** được dùng ngay cho lần so của người khác.
- Thống kê chiều `field`: chuyển ngay khi đổi `fieldId`.
- Kho tra cứu: chỉ CLOSED, không ảnh hưởng (FR18 chỉ ở IN_PROGRESS).
- `TopicDetail.latestSimilarity` có thể là dòng kiểm của yêu cầu (nội dung đề xuất) → `isStale = true` cho tới khi duyệt; chấp nhận, vì `isStale` chỉ dùng ở trạng thái trước duyệt.

### 6.6 Test bắt buộc (T605)
| # | Ca | Kỳ vọng |
|---|---|---|
| 1 | Đổi `objectives` → duyệt | Nội dung đổi, `version` +1, không chạy FR06, AuditLog có before/after |
| 2 | Đổi tên → FR06 chạy, dòng kiểm gắn yêu cầu; HIGH không giải trình → 400; FR06 lỗi giả lập → 409, **không** có yêu cầu | Đúng |
| 3 | Từ chối có lý do | Hồ sơ giữ nguyên |
| 4 | Thêm thành viên: SV đồng ý → duyệt; nhóm đã đủ max lúc duyệt → 409 `GROUP_FULL`; SV đã có đề tài hoạt động khác → 409 `STUDENT_TOPIC_LIMIT` | Đúng; khi lỗi yêu cầu vẫn PENDING |
| 5 | **Đồng thời**: duyệt thêm SV X ‖ X chấp nhận lời mời/đề tài khác của X gửi `REQUEST_ADVISOR` (`maxActiveTopicsPerStudent = 1`) | X có tối đa một đề tài hoạt động |
| 6 | Hai cán bộ duyệt cùng lúc | Một 200, một 409 `CHANGE_REQUEST_CLOSED` |
| 7 | Không phải trưởng nhóm; trạng thái khác IN_PROGRESS; cán bộ khoa khác duyệt | 403 / 409 / 403 |

---

## 7. FR23 – Sửa sai kết quả (T604)

**`POST /api/topics/:id/result-corrections`** – STAFF `inStaffScope` · `withLockTx` (khóa Topic) · AuditLog `RESULT_CORRECT` (`before: { version, result }`, `after: { version, result, reason }`) · thông báo `RESULT_CORRECTED`.
Body `resultCorrectionSchema`:
- `result`: enum `FINAL_RESULT`;
- `summary?`: trim 20..5000 (không gửi = giữ nhận xét tổng kết hiện hành);
- `reason`: trim 5..2000 (FR23 "bắt buộc lý do");
- `expectedVersion`: int ≥ 0 (phiên bản hiện hành cán bộ đang thấy).

Kiểm (dưới khóa): `status = CLOSED` → không thì 409 `TOPIC_NOT_CLOSED` (G43; trước khi đóng GV nhập lại qua `POST …/results`, ở WAITING_CLOSE cán bộ trả lại); có bản hiện hành (phòng thủ, 409 `NO_FINAL_RESULT`); `version` hiện hành = `expectedVersion` (409 `CONCURRENT_UPDATE`); `result` hoặc `summary` khác bản hiện hành → không thì 400 `VALIDATION_ERROR` `{ _: "Kết quả mới phải khác kết quả hiện hành" }`.
Ghi: hạ `isCurrent` bản cũ **trước**, rồi tạo `ResultVersion { version: max + 1, result, summary, reason, isCurrent: true, createdById: staff }` (thứ tự bắt buộc như API_GD45 §6.4; trigger `result_version_guard` cho phép). Không xóa bản cũ (FR23).
201 `{ "result": ResultView }` (`reason` có giá trị, `createdBy.role = "STAFF"`). `GET …/results` đã trả mọi phiên bản kèm `reason`.

Ảnh hưởng (không cần code thêm, chỉ test):
- Thống kê, bộ lọc/trường `result` của `GET /api/topics`: dùng `isCurrent` → phiên bản mới ngay (FR23 "thống kê dùng phiên bản hiện hành").
- Kho tra cứu `/api/repository`: GOOD → FAIL thì **rời kho**; FAIL → PASS thì **vào kho**.
- Kho so FR06: không đổi (mọi CLOSED, G14).
- Thông báo `RESULT_CORRECTED` → thành viên + GVHD (FR23 "nhóm và GVHD được thông báo"); tiêu đề không chứa lý do.

Test bắt buộc (T604):
| # | Ca | Kỳ vọng |
|---|---|---|
| 1 | Sửa GOOD → PASS | Hai phiên bản, đúng một `isCurrent`; thống kê chiều `result` và CSV đổi theo |
| 2 | **Kho**: GOOD → FAIL thì không còn trong `/api/repository` lẫn `/api/repository/:code` (404); `q` khớp tên đề tài đó không trả về (MINOR 2 `reviews/T213b-reviewer-v1.md`) | Đúng |
| 3 | Thiếu lý do; kết quả giống hiện hành; `expectedVersion` cũ | 400, 400, 409 |
| 4 | Đề tài IN_PROGRESS / WAITING_CLOSE | 409 `TOPIC_NOT_CLOSED` |
| 5 | GVHD, SV, cán bộ khoa khác, ADMIN | 403 |
| 6 | **Đồng thời**: hai lần sửa cùng `expectedVersion` | Một 201, một 409; luôn đúng một bản `isCurrent` |
| 7 | Thông báo | Thành viên + GVHD nhận đúng một `RESULT_CORRECTED`; gọi lại không trùng |

---

## 8. FR22 – Mở lại mốc đã đạt (T606)

**`POST /api/milestones/:id/reopen`** – LECTURER `isCurrentAdvisor` (**kiểm lại dưới khóa**, §1.2) · `EXEC_OPEN` (409 `TOPIC_NOT_IN_PROGRESS`, G42) · khóa API_GD45 §1.2 · AuditLog `MILESTONE_REOPEN` · thông báo `MILESTONE_REOPENED`.
Body `milestoneReopenSchema { version: int ≥ 0 (của mốc), reason: trim 5..2000 }`.
Ghi: `milestone.updateMany({ where: { id, version, evaluation: 'PASSED' }, data: { evaluation: 'NEEDS_WORK', version: { increment: 1 } } })` – `count = 0` → đọc lại: `evaluation ≠ PASSED` → 409 `MILESTONE_NOT_PASSED` "Chỉ mở lại được mốc đã Đạt", còn lại 409 `CONCURRENT_UPDATE`. Tạo `MilestoneReopen { milestoneId, reason, reopenedById: me, reopenedAt: now }`.
201 `{ "milestone": MilestoneView, "reopen": { "id", "reason", "reopenedBy": { "id", "fullName" }, "reopenedAt" } }`.
STAFF không mở lại được (FR22 "chỉ GVHD") → 403. Ở WAITING_CLOSE: cán bộ trả lại trước (`RETURN_TO_ADVISOR`).

**`GET /api/milestones/:id/reopens`** – `canReadExecution`. `{ "items": [{ id, reason, reopenedBy, reopenedAt }] }`, sắp giảm dần.
`MilestoneView` thêm `reopenCount: number`, `lastReopen: { reason, reopenedAt, reopenedBy: { fullName } } | null`.

Ảnh hưởng:
- **Điều kiện đóng** (FR27) luôn theo đánh giá hiện hành: `closeConditions.js` đọc `evaluation` nên mốc mở lại làm `requiredMilestonesPassed = false` ngay; `REQUEST_CLOSE`/`CONFIRM_CLOSE` tính lại trong `extra` dưới khóa (đã có). Không cần code thêm.
- Chặn `MILESTONE_ALREADY_PASSED` tự hết: SV nộp bản mới, GV đánh giá lại được.
- Nhắc hạn (cron API_GD45 §8.4): "lần đánh giá NEEDS_WORK gần nhất" = `max(Feedback NEEDS_WORK, MilestoneReopen.reopenedAt)`, để mốc mở lại được coi là "đang chờ nộp" (T606 sửa `awaitingSubmission`). Hạn cũ có thể đã qua → GV gia hạn bằng `due-changes` (không gộp vào reopen, G42).

**Migration `fr22_milestone_reopen`** (T606): model `MilestoneReopen { id, milestoneId (FK), reason, reopenedById (FK User), reopenedAt timestamptz default now(), @@index([milestoneId, reopenedAt]) }` + trigger chỉ-thêm `milestone_reopen_immutable` (UPDATE/DELETE) và `milestone_reopen_no_truncate` dùng `forbid_mutation()`; cập nhật test `pg_trigger`.

Test bắt buộc (T606):
| # | Ca | Kỳ vọng |
|---|---|---|
| 1 | Mở lại mốc PASSED | NEEDS_WORK, `version` +1, có `MilestoneReopen`, thông báo thành viên |
| 2 | Mốc PENDING/NEEDS_WORK; thiếu lý do; `version` cũ | 409 `MILESTONE_NOT_PASSED`, 400, 409 `CONCURRENT_UPDATE` |
| 3 | SV, STAFF, GV cũ sau thay GV, ADMIN | 403 |
| 4 | Sau mở lại: `REQUEST_CLOSE` | 409 `MILESTONES_NOT_PASSED` |
| 5 | **Đồng thời**: mở lại ‖ `REQUEST_CLOSE` | Hoặc mở lại thắng và đóng 409, hoặc đóng thắng và mở lại 409 `TOPIC_NOT_IN_PROGRESS`; không bao giờ WAITING_CLOSE với mốc bắt buộc chưa Đạt |
| 6 | Cron sau mở lại (hạn trong cửa sổ) | Nhắc lại `MILESTONE_DUE_SOON` |

---

## 9. G5 – Cán bộ cho phép gửi với cờ "chưa kiểm tra" (T609)

Đặc tả mục 3 "Khi có lỗi": "Nếu lỗi kéo dài, cán bộ có thể cho phép gửi với cờ 'chưa kiểm tra'; hệ thống tự chạy lại khi hết lỗi và cập nhật vào snapshot." Thiết kế theo **đúng ràng buộc** API_GD2 §14.

### 9.1 Cờ "chưa kiểm tra" – suy ra, không có cột
`unchecked(submission)` = `submission.similarityCheckId IS NULL` **hoặc** `similarityCheck.status = 'ERROR'`. Không thêm cột nào vào `Submission`.

### 9.2 Cán bộ cho phép
**`POST /api/topics/:id/similarity-bypasses`** – STAFF `inStaffScope` · `withLockTx` (khóa Topic) · AuditLog `SIMILARITY_BYPASS_GRANT` · thông báo `SIMILARITY_BYPASS_GRANTED`.
Body `similarityBypassCreateSchema { reason: trim 5..2000 }`.
Kiểm:
- `status ∈ { HAS_ADVISOR, NEEDS_REVISION }` (hai trạng thái gửi được) → không thì 409 `INVALID_TRANSITION`.
- `SimilarityCheck` mới nhất của đề tài có `status = ERROR` → không thì 409 `SIMILARITY_CHECK_OK` "Lần kiểm tra gần nhất không lỗi, không cần cho phép" (gồm cả khi chưa kiểm lần nào).
- Chưa có quyền cho phép **còn hiệu lực** (§9.3) → không thì 409 `SIMILARITY_BYPASS_EXISTS`.

Ghi **bản ghi mới** `SimilarityBypass { topicId, reason, grantedById, createdAt }` (không UPDATE `Submission`/`SimilarityCheck`).
201 `{ "similarityBypass": { "id", "reason", "grantedBy": { "fullName" }, "createdAt" } }`.
`TopicDetail.permissions.grantSimilarityBypass` = `inStaffScope && status ∈ {HAS_ADVISOR, NEEDS_REVISION} && latestSimilarity?.status === 'ERROR' && similarityBypass === null`.

### 9.3 Hiệu lực – suy ra
Quyền cho phép **còn hiệu lực** = dòng `SimilarityBypass` mới nhất của đề tài **và** không có `Submission` nào của đề tài với `createdAt > bypass.createdAt`. Tức áp cho **đúng một** lần gửi kế tiếp (G44). Không có cột "đã dùng".
`TopicDetail.similarityBypass: { id, reason, createdAt, grantedBy: { fullName } } | null` – quyền còn hiệu lực; trả cho thành viên, GVHD, cán bộ trong phạm vi.

### 9.4 Gửi khi FR06 lỗi (sửa `reviewService.js` + `stateMachine.js`)
Ở bước 5 API_GD2 §8.2:
- `row.status = ERROR` **và** có quyền còn hiệu lực (đọc trước transaction) → gọi `checkTransition` với `ctx.similarityBypass = true`. Sửa khối `needsSimilarity` (`stateMachine.js:28-38`): khi `sim.status !== 'OK'` và `ctx.similarityBypass` thì **bỏ qua** cả `SIMILARITY_NOT_CHECKED` lẫn `JUSTIFICATION_REQUIRED` (mức chưa biết). Không có quyền → giữ nguyên 409 `SIMILARITY_NOT_CHECKED` như cũ.
- Trong `extra` (dưới khóa Topic): **kiểm lại** quyền còn hiệu lực (`SimilarityBypass` mới nhất có `createdAt` > `createdAt` của `Submission` mới nhất). Mất hiệu lực (gửi đôi) → 409 `SIMILARITY_NOT_CHECKED`, rollback.
- `Submission.similarityCheckId` = id dòng kiểm ERROR vừa lưu; `payload.similarityBypassId = bypass.id` (bất biến, để snapshot hiển thị ai cho phép).
- Response như cũ; `similarityCheck.status = "ERROR"`, `message: "Chưa kiểm tra được"`; `submission` thêm `unchecked: true`.
- FR06 **luôn chạy** khi gửi; nếu lần này thành công thì đi đường thường (vẫn cần giải trình nếu HIGH) và quyền cho phép coi như đã dùng theo §9.3.

### 9.5 Tự chạy lại và cập nhật snapshot
**`POST /api/cron/similarity-rechecks`** – mount trong `cronRouter` có sẵn, cùng limiter IP và `requireCronSecret` như `/api/cron/reminders` (API_GD45 §8.4).
Xử lý:
1. Chọn tối đa 20 `Submission` có `unchecked` (§9.1), sắp `createdAt` tăng dần (mỗi lần FR06 ≤ 3 s, giữ dưới `--max-time` của curl).
2. Với mỗi bản: chạy FR06 **ngoài transaction** trên nội dung `payload` (không phải nội dung hiện tại của đề tài), cùng `topicId`/`roundId`, `cfg` hiện hành của đợt; `justification` sao từ dòng kiểm cũ (nếu có).
3. Kết quả ERROR → không ghi gì, đếm `stillFailing`, `logger.warn` (không chèn dòng ERROR mới mỗi giờ).
4. Kết quả OK → một transaction: **chèn** dòng `SimilarityCheck` mới (status OK) → `submission.updateMany({ where: { id, similarityCheckId: oldId /* hoặc null */ }, data: { similarityCheckId: newId } })` (`count = 0` → bỏ qua, đã có lần chạy khác cập nhật) → AuditLog `SIMILARITY_RECHECK` (`actorId: null`, `entityType: 'Submission'`, `before: { similarityCheckId: oldId }`, `after: { similarityCheckId: newId, level }`) → thông báo `SIMILARITY_RECHECKED` cho cán bộ khoa.
5. Không UPDATE/DELETE `SimilarityCheck` → trigger `similarity_check_immutable` giữ nguyên.

200 + `Cache-Control: no-store`: `{ "ranAt": "…", "checked": 3, "updated": 2, "stillFailing": 1 }`. Lỗi: 401, 404, 429, 503.
Lịch: `.github/workflows/similarity-recheck.yml`, `schedule: '15 * * * *'` (mỗi giờ) + `workflow_dispatch`, `concurrency: { group: similarity-recheck, cancel-in-progress: false }` (không chạy chồng), lệnh curl giống `reminders.yml` (T502).

Hiển thị:
- `SimilarityCheckView` thêm `justificationMissing: boolean` = `status = OK && level = HIGH && countWords(justification) < minJustificationWords` (ca chạy lại ra HIGH khi SV chưa giải trình; cán bộ thấy cảnh báo đỏ kèm nhãn "Chưa có giải trình").
- `GET /api/topics/:id/submissions` item thêm `similarityStatus: 'OK' | 'ERROR' | null`, `unchecked: boolean`; `similarityLevel` = `null` khi `unchecked`.
- `GET /api/topics/:id/submissions/:seq` thêm `submission.unchecked`, `submission.similarityBypass: { reason, grantedBy: { fullName }, createdAt } | null` (từ `payload.similarityBypassId`; chỉ STAFF và thành viên thấy `reason`, GV thấy `null` cho `reason`).
- `TopicDetail.latestSubmission.unchecked: boolean`.

### 9.6 `latestSimilarityStatus` trong item danh sách (`GET /api/topics`)
Thêm `latestSimilarityStatus: 'OK' | 'ERROR' | null` lấy từ **cùng dòng** với `latestSimilarityLevel` (`listService.js:33`, `similarityChecks[0]`), và `latestSubmission.unchecked: boolean`. Quy tắc hiển thị (UI.md R16, MINOR 5 `reviews/T300-reviewer-v1.md`): `status = ERROR` → "Chưa kiểm tra được"; `null` → "—"; **không bao giờ** "Không trùng". Dùng chung `SimilarityBadge`.

### 9.7 Migration `g5_similarity_bypass` (T609)
- Model `SimilarityBypass { id, topicId (FK), reason, grantedById (FK User), createdAt timestamptz default now(), @@index([topicId, createdAt]) }` + trigger chỉ-thêm (UPDATE/DELETE, TRUNCATE) bằng `forbid_mutation()`.
- Nới trigger `Submission` **chỉ cho cột `similarityCheckId`**, giữ nguyên **tên** trigger `submission_immutable` để test `pg_trigger` của T203 không phải đổi:
```sql
CREATE OR REPLACE FUNCTION submission_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE old_ok boolean; new_ok boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Submission chỉ thêm'; END IF;
  IF (to_jsonb(NEW) - 'similarityCheckId') <> (to_jsonb(OLD) - 'similarityCheckId') THEN
    RAISE EXCEPTION 'Submission bất biến';
  END IF;
  SELECT status = 'OK' INTO old_ok FROM "SimilarityCheck" WHERE id = OLD."similarityCheckId";
  SELECT status = 'OK' AND "topicId" = NEW."topicId" INTO new_ok FROM "SimilarityCheck" WHERE id = NEW."similarityCheckId";
  IF coalesce(old_ok, false) OR NOT coalesce(new_ok, false) THEN
    RAISE EXCEPTION 'Chỉ được thay kết quả FR06 lỗi bằng kết quả thành công của cùng đề tài';
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER submission_immutable BEFORE UPDATE OR DELETE ON "Submission"
  FOR EACH ROW EXECUTE FUNCTION submission_guard();
```
(PostgreSQL ≥ 14 có `CREATE OR REPLACE TRIGGER`; test và Supabase đều 16.) Ghi vào cả `migration.sql` và `after_init.sql`.

### 9.8 Test bắt buộc (T609)
| # | Ca | Kỳ vọng |
|---|---|---|
| 1 | FR06 lỗi giả lập, chưa có quyền | 409 `SIMILARITY_NOT_CHECKED` (giữ nguyên) |
| 2 | Cán bộ cho phép → gửi khi FR06 vẫn lỗi | UNDER_REVIEW; `unchecked = true` ở snapshot, danh sách snapshot, `TopicDetail`, item danh sách (`latestSimilarityStatus = 'ERROR'`) |
| 3 | Quyền chỉ dùng một lần: gửi → bị yêu cầu chỉnh sửa → gửi lại khi FR06 vẫn lỗi | 409 `SIMILARITY_NOT_CHECKED` |
| 4 | Cho phép khi lần kiểm mới nhất OK / đã có quyền còn hiệu lực / trạng thái IN_PROGRESS / cán bộ khoa khác / GV / SV | 409 `SIMILARITY_CHECK_OK` / 409 `SIMILARITY_BYPASS_EXISTS` / 409 / 403 / 403 / 403 |
| 5 | Cron chạy lại khi hết lỗi | `similarityCheckId` trỏ dòng OK mới; dòng ERROR cũ còn nguyên; cán bộ nhận `SIMILARITY_RECHECKED`; chạy lại lần hai không đổi gì, không thông báo trùng |
| 6 | Cron khi vẫn lỗi | Không chèn dòng; `stillFailing` đúng |
| 7 | Trigger (SQL trực tiếp): UPDATE cột khác của `Submission`; đổi OK → OK khác; ERROR → ERROR; trỏ dòng OK của đề tài khác; DELETE | Đều bị DB từ chối |
| 8 | **Đồng thời**: hai lần gửi đôi dùng cùng quyền | Một thành công, một 409 |
| 9 | Kết quả chạy lại HIGH, SV chưa giải trình | `justificationMissing = true` trong view của cán bộ |

---

## 10. INFO 12 – Đề tài kẹt khi tăng tham số đợt (T605)

Vấn đề: đề tài ở HAS_ADVISOR không sửa được hồ sơ (FR05, G1) và `SUBMIT_FOR_REVIEW` kiểm `topicSubmitSchema(cfg hiện tại)`. Nếu cán bộ tăng `minSummaryWords`/`minKeywords` hoặc giảm `maxKeywords`, đề tài đó **kẹt vĩnh viễn** (không sửa, không gửi, không có đường về Nháp).

Quyết định (G45): **chặn ở `PATCH /api/rounds/:id`** (API_GD2 §4.3).
- Khi `config` gửi lên làm đổi `minSummaryWords`, `minKeywords` hoặc `maxKeywords` của cấu hình hiệu lực: tìm các đề tài của đợt ở `WAITING_ADVISOR` hoặc `HAS_ADVISOR` (WAITING_ADVISOR gồm vì GV có thể nhận ngay sau đó) **không đạt** `topicSubmitSchema(cấu hình mới)`.
- Có ít nhất một → 409 `ROUND_CONFIG_BLOCKS_TOPICS` "Thay đổi này làm N đề tài đang chờ/đã có GVHD không còn đủ điều kiện gửi xét duyệt mà nhóm không sửa được hồ sơ", `details: { codes: [mã đề tài, tối đa 50], total: N }`. Không ghi gì.
- Các trạng thái khác không bị chặn: DRAFT, NEEDS_REVISION sửa được; UNDER_REVIEW được cán bộ yêu cầu chỉnh sửa hoặc duyệt; IN_PROGRESS dùng FR18 (đã kiểm theo cấu hình hiện tại, §6.2).
- Không có cờ "bỏ qua": muốn tăng tham số thì cán bộ chờ các đề tài đó gửi xong, hoặc chỉ áp cho đợt sau. Đúng nguyên tắc "không hồi tố" của API_GD2 §4.3.
- Race `PATCH round` ‖ `ACCEPT_ADVISING`/gửi: hiếm, chấp nhận (không khóa đợt); hậu quả tệ nhất là một đề tài kẹt và cán bộ hạ tham số lại.
- UI (T607): R24 hiện danh sách `details.codes`; R10 bước 1, khi nhận `TOPIC_INCOMPLETE` ở HAS_ADVISOR, hiện "Hồ sơ không còn đạt yêu cầu của đợt. Liên hệ cán bộ khoa." thay vì chỉ dừng.

Test (T605): tăng `minSummaryWords` khi có đề tài HAS_ADVISOR không đạt → 409 kèm mã, cấu hình không đổi; khi mọi đề tài vẫn đạt → 200; chỉ đổi tham số khác (`maxFileSizeMB`) → 200 không quét.

---

## 11. Mã lỗi mới (bổ sung API_GD2 §2, API_GD45 §2)

| HTTP | `code` | Thông điệp mặc định | Khi nào |
|---|---|---|---|
| 409 | `CHANGE_REQUEST_PENDING` | Đề tài đã có yêu cầu cùng loại đang chờ xử lý | §2.1 (cả P2002 của `change_request_one_pending`) |
| 409 | `CHANGE_REQUEST_CLOSED` | Yêu cầu không còn ở trạng thái chờ xử lý | Cập nhật có điều kiện `count = 0` (§1.3) |
| 409 | `CHANGE_NOT_READY` | Người được đề xuất chưa đồng ý | Duyệt khi `stage = TARGET` |
| 409 | `STALE_CHANGE_REQUEST` | Đề tài đã thay đổi sau khi tạo yêu cầu, vui lòng tạo yêu cầu mới | §3.4, §5.2, §6.4 |
| 409 | `LEADER_CANNOT_LEAVE` | Trưởng nhóm cần chuyển quyền trưởng nhóm trước khi rời nhóm | §5 |
| 409 | `LEAVE_NEEDS_APPROVAL` | Đề tài đã được duyệt, rời nhóm cần cán bộ khoa duyệt | §5.1 |
| 409 | `MILESTONE_NOT_PASSED` | Chỉ mở lại được mốc đã Đạt | §8 |
| 409 | `TOPIC_NOT_CLOSED` | Chỉ sửa kết quả của đề tài đã đóng | §7 |
| 409 | `SIMILARITY_CHECK_OK` | Lần kiểm tra gần nhất không lỗi, không cần cho phép | §9.2 |
| 409 | `SIMILARITY_BYPASS_EXISTS` | Đề tài đã được cho phép gửi khi chưa kiểm tra và chưa dùng | §9.2 |
| 409 | `ROUND_CONFIG_BLOCKS_TOPICS` | Thay đổi làm đề tài đang chờ không còn đủ điều kiện gửi | §10; `details: { codes, total }` |

Dùng lại: `INVALID_TRANSITION`, `REASON_REQUIRED`, `TOPIC_NOT_IN_PROGRESS`, `TOPIC_NOT_EDITABLE`, `TOPIC_INCOMPLETE`, `GROUP_FULL`, `GROUP_TOO_SMALL`, `STUDENT_TOPIC_LIMIT`, `LECTURER_QUOTA_EXCEEDED`, `SIMILARITY_NOT_CHECKED`, `JUSTIFICATION_REQUIRED`, `NO_FINAL_RESULT`, `CONCURRENT_UPDATE`, `SERVICE_BUSY`.
Quy ước `details` thêm dạng riêng: `ROUND_CONFIG_BLOCKS_TOPICS` → `{ codes, total }`.

---

## 11b. Thông báo (bổ sung bảng API_GD45 §8.3)

Mọi sự kiện ghi trong cùng transaction, loại người gây sự kiện, bỏ tài khoản khóa (`notify` có sẵn). Tiêu đề chỉ có mã + tên đề tài (người nhận đều đã có quyền xem tên này: thành viên/GV/cán bộ, người đích qua `isChangeTarget`, GV cũ/người rời đã xem trước đó); **không** chứa lý do.

| `type` | Nguồn | Người nhận | `dedupeKey` | `link` |
|---|---|---|---|---|
| `CHANGE_REQUESTED` | Tạo yêu cầu (mọi loại) | Thành viên, GVHD hiện hành, cán bộ khoa | `CHANGE_REQUESTED:<crId>` | `/de-tai/:id/yeu-cau` |
| `CHANGE_TARGET_INVITED` | Tạo `ADVISOR_CHANGE` / `TOPIC_CHANGE` có thêm SV | Người đích | `CHANGE_TARGET_INVITED:<crId>` | `/yeu-cau` |
| `CHANGE_TARGET_ACCEPTED` | `/accept` | Cán bộ khoa, người tạo | `CHANGE_TARGET_ACCEPTED:<crId>` | `/yeu-cau` (cán bộ), `/de-tai/:id/yeu-cau` |
| `CHANGE_DECIDED` | `/approve`, `/decline` (cán bộ hoặc người đích) | Thành viên hiện hành (sau hiệu lực), GVHD hiện hành (sau hiệu lực), người tạo, người đích; thêm GV cũ (`ADVISOR_CHANGE` duyệt), người rời (`LEAVE_GROUP` duyệt) | `CHANGE_DECIDED:<crId>` | `/de-tai/:id/yeu-cau`; GV cũ, người rời: `/yeu-cau` |
| `CHANGE_WITHDRAWN` | `/withdraw` | Như `CHANGE_REQUESTED` + người đích | `CHANGE_WITHDRAWN:<crId>` | `/de-tai/:id/yeu-cau` |
| `ADVISOR_HANDOVER` | Duyệt thay GV có bản nộp chờ nhận xét (§3.4) | GV mới | `ADVISOR_HANDOVER:<crId>` | `/de-tai/:id/tai-lieu` |
| `MEMBER_LEFT` | `POST /api/topics/:id/leave` | Trưởng nhóm, GVHD hiện hành | `MEMBER_LEFT:<topicMemberId>` | `/de-tai/:id/nhom` |
| `MILESTONE_REOPENED` | `POST /api/milestones/:id/reopen` | Thành viên | `MILESTONE_REOPENED:<reopenId>` | `/de-tai/:id/moc` |
| `RESULT_CORRECTED` | `POST /api/topics/:id/result-corrections` | Thành viên, GVHD hiện hành | `RESULT_CORRECTED:<resultVersionId>` | `/de-tai/:id` |
| `SIMILARITY_BYPASS_GRANTED` | `POST /api/topics/:id/similarity-bypasses` | Thành viên | `SIMILARITY_BYPASS_GRANTED:<bypassId>` | `/de-tai/:id/gui` |
| `SIMILARITY_RECHECKED` | Cron §9.5 | Cán bộ khoa | `SIMILARITY_RECHECKED:<submissionId>` | `/xet-duyet/:id` |

- Mọi khóa chứa id bản ghi mới (duy nhất mỗi sự kiện) → gọi lại không tạo thêm (FR13). `SIMILARITY_RECHECKED` duy nhất vì trigger chỉ cho đổi `similarityCheckId` từ lỗi sang OK **một lần**.
- "Nhóm và GVHD được thông báo" (FR19, FR20, FR21, FR23): `CHANGE_DECIDED` và `RESULT_CORRECTED` gửi thành viên + GVHD.
- Không thông báo: cấp/thu hồi quyền đọc GV cũ, đọc lịch sử của người đã rời.
- Route web mới (T607, khai báo vai trò trong `routes.jsx` như các route hiện có): `/de-tai/:id/yeu-cau` [S, L, F], `/yeu-cau` [S, L, F], `/lich-su-tham-gia` và `/lich-su-tham-gia/:topicId` [S]. Người đã rời xem snapshot qua route có sẵn `/de-tai/:id/lan-gui/:seq`, `/de-tai/:id/so-sanh`. `/de-tai/:id/gui`, `/de-tai/:id/tai-lieu`, `/xet-duyet/:id` đã có (`routes.jsx:74,80,84`).

---

## 12. UI (T607) – tóm tắt cho frontend

| Route / chỗ | Vai trò | Dữ liệu | Hành động (điều kiện hiện nút) | Rỗng / lỗi / đang tải |
|---|---|---|---|---|
| `/de-tai/:id/yeu-cau` (tab "Yêu cầu" ở chi tiết đề tài) | Thành viên, GVHD, cán bộ, người đích | `GET /api/topics/:id`, `GET /api/topics/:id/change-requests` | Nút tạo theo `permissions.requestTopicChange / requestAdvisorChange / requestCancel / requestLeave`; mỗi thẻ yêu cầu hiện nút theo `availableActions` (`ACCEPT`, `DECLINE` (hộp lý do), `APPROVE` (hộp lý do, bắt buộc với CANCEL), `WITHDRAW`). Form `TOPIC_CHANGE` hiện "trước → sau" và kết quả FR06 (`SimilarityBadge`, ô giải trình khi HIGH, như R10) | "Chưa có yêu cầu nào"; 409 `CHANGE_REQUEST_CLOSED`/`STALE_CHANGE_REQUEST` → tải lại + thông điệp; skeleton khi tải |
| `/yeu-cau` | STAFF (hàng chờ `stage=STAFF`), LECTURER/STUDENT (lời đề xuất `stage=TARGET` gửi tới mình + yêu cầu của mình) | `GET /api/change-requests` (lọc trên URL bằng `urlParams.js`) | Như trên | "Không có yêu cầu đang chờ" |
| Chi tiết đề tài – khối nhóm | Thành viên | `permissions.leave` | "Rời nhóm" (xác nhận) → `POST …/leave`; sau 200 điều hướng `/de-tai`; 409 `LEADER_CANNOT_LEAVE` hiện gợi ý chuyển trưởng nhóm; 409 `LEAVE_NEEDS_APPROVAL` mở form yêu cầu rời | – |
| Chi tiết đề tài – khối GVHD | STAFF | `formerAdvisors` | Bật/tắt "Cho phép đọc" (hộp lý do) → `PUT …/read-access` | Ẩn khi `[]` |
| Dải "chỉ đọc" | GV cũ được cấp quyền | `readOnlyAccess` | Không có nút ghi | – |
| `/de-tai/:id/moc` | GVHD | `MilestoneView.reopenCount`, `lastReopen` | "Mở lại" khi `permissions.reopenMilestone && m.evaluation === 'PASSED'` (hộp lý do; gửi `m.version` **lúc bấm**, MINOR T406) | Hiện "Đã mở lại N lần" + lý do gần nhất |
| Khối kết quả ở chi tiết đề tài | STAFF | `GET …/results` | "Sửa kết quả" khi `permissions.correctResult` (form `result`, `summary` điền sẵn, `reason`, `expectedVersion = current.version`) | Lịch sử phiên bản hiện `reason`, người sửa |
| Xét duyệt / gửi hồ sơ | STAFF / SV | `TopicDetail.similarityBypass`, `latestSubmission.unchecked`, `permissions.grantSimilarityBypass` | Cán bộ: "Cho phép gửi khi chưa kiểm tra" (hộp lý do). SV: khi có `similarityBypass`, hiện "Cán bộ đã cho phép gửi dù chưa kiểm tra được trùng lặp" và cho bấm gửi | Ô mức trùng: `ERROR`/`unchecked` → "Chưa kiểm tra được"; `null` → "—"; HIGH + `justificationMissing` → nhãn "Chưa có giải trình" |
| Danh sách đề tài, hàng chờ xét duyệt | Mọi vai trò | `latestSimilarityStatus`, `latestSubmission.unchecked` | – | Như trên |
| `/lich-su-tham-gia`, `/lich-su-tham-gia/:topicId` | SV đã rời | `GET /api/me/past-topics`, rồi `…/submissions`, `…/documents` | Xem snapshot, diff, tải tài liệu trong khoảng | "Bạn chưa rời nhóm nào" |
| R24 (form đợt) | STAFF | 409 `ROUND_CONFIG_BLOCKS_TOPICS` | Hiện danh sách `details.codes` | – |

Kèm các MINOR FE đã gom vào T607 trên bảng việc (không thuộc hợp đồng API).

---

## 13. Giả định (G33 trở đi)

| # | Giả định | Lý do / phương án khác |
|---|---|---|
| G33 | FR18 gồm sửa nội dung (tên, tóm tắt, mục tiêu, từ khóa, lĩnh vực) và **thêm tối đa một** thành viên (SV phải đồng ý). Đổi GV đi FR19; bớt thành viên chỉ qua tự rời FR21. "Kiểm tra lại hạn mức GV" không có gì để kiểm vì FR18 không đổi GV. **Câu hỏi `CAU_HOI.md` #10** | Đặc tả nhắc "giới hạn nhóm (FR03)" nên phải có thay đổi thành viên; FR03 bắt buộc SV đồng ý. Phương án khác: cho FR18 đổi GV (trùng FR19) hoặc cho trưởng nhóm loại thành viên (đặc tả không có) |
| G34 | Duyệt FR18 **không** tạo `Submission` mới; trước/sau bất biến trong `ChangeRequest.payload`; FR06 chạy lúc tạo yêu cầu trên nội dung đề xuất, lỗi thì không tạo được | FR17 gắn snapshot với lần gửi xét duyệt; FR18 có hồ sơ yêu cầu riêng (mục 5). Chạy FR06 lúc tạo để cán bộ thấy kết quả khi quyết định, đúng tinh thần FR07 |
| G35 | Thay GV được ở HAS_ADVISOR, UNDER_REVIEW, NEEDS_REVISION, IN_PROGRESS; không ở WAITING_CLOSE (cán bộ trả lại trước). Hạn mức kiểm sớm khi GV mới đồng ý, kiểm ràng buộc khi cán bộ duyệt | Mọi trạng thái có GVHD mà còn làm việc; WAITING_CLOSE chỉ đọc (G15). Duyệt mới là lúc tạo Advising nên mới là lúc giữ hạn mức (FR16 "tại thời điểm nhận") |
| G36 | "Chuyển bản nộp chờ nhận xét sang GV mới" = không đổi dữ liệu (người nhận xét suy ra từ Advising hiện hành); ghi danh sách vào AuditLog và báo GV mới | Không có cột "người nhận xét" trên `Document`; thêm cột sẽ phải giữ đồng bộ hai nguồn |
| G37 | Quyền chỉ đọc của GV cũ = mọi thứ GVHD đọc được, không ghi; cán bộ cấp/thu hồi kèm lý do; GV cũ thấy đề tài trong danh sách nhưng không trong thống kê. **Câu hỏi `CAU_HOI.md` #11** | FR19.4 không nói phạm vi; cấp "toàn phần chỉ đọc" đơn giản nhất. Thống kê giữ G29 |
| G38 | Cán bộ không tự khởi tạo hủy; chỉ duyệt đề nghị của trưởng nhóm/GVHD; hủy chỉ ở IN_PROGRESS | FR20 "Trưởng nhóm hoặc GVHD đề nghị"; mục 5 "Có đề nghị và quyết định"; `TRANSITIONS` chỉ có CANCEL từ IN_PROGRESS |
| G39 | Mọi yêu cầu đang chờ (cả bốn loại) không tự đóng, kể cả khi đề tài đổi trạng thái; lúc duyệt kiểm lại và trả 409 | FR20 "đề nghị đang chờ không tự đóng"; áp chung cho đơn giản và minh bạch |
| G40 | "Trước duyệt" = DRAFT…NEEDS_REVISION, rời ngay, **không** kiểm min (có thể làm nhóm dưới min ở UNDER_REVIEW). "Sau duyệt" chỉ IN_PROGRESS. Trưởng nhóm phải chuyển quyền trước; thành viên duy nhất không rời được | FR21 "trước duyệt: rời tự do"; giữ đúng một trưởng nhóm (FR03); WAITING_CLOSE chỉ đọc (G15) |
| G41 | "Phiên bản" người đã rời đọc được = snapshot hồ sơ và phiên bản tài liệu tạo trong khoảng còn là thành viên; không đọc chi tiết hiện tại, tiến độ, nhận xét, kết quả. **Câu hỏi `CAU_HOI.md` #11** | Đọc chặt nhất khớp chữ "phiên bản" của FR17/FR11 |
| G42 | Mở lại mốc chỉ ở IN_PROGRESS, không tự đổi hạn; GV gia hạn riêng | FR22 chỉ đòi lý do + về Cần bổ sung; đổi hạn đã có lịch sử riêng (FR09) |
| G43 | FR23 chỉ khi CLOSED; nhận xét tổng kết giữ nguyên nếu không gửi; kết quả mới phải khác | FR27.4 "sau khi đóng, kết quả chỉ sửa qua FR23"; trước đó GV nhập lại phiên bản mới (API_GD45 §6.4) |
| G44 | Quyền "gửi khi chưa kiểm tra" do cán bộ cấp áp cho **đúng một** lần gửi kế tiếp; chỉ cấp khi lần kiểm gần nhất lỗi; tự chạy lại mỗi giờ; kết quả chạy lại HIGH mà chưa có giải trình chỉ hiện cảnh báo cho cán bộ (không chặn vì đã gửi). **Câu hỏi `CAU_HOI.md` #12** | Mục 3 "nếu lỗi kéo dài, cán bộ có thể cho phép"; một lần dùng giới hạn rủi ro bỏ qua FR06 |
| G45 | Chặn `PATCH` đợt khi đổi tham số hồ sơ làm đề tài WAITING_ADVISOR/HAS_ADVISOR không còn đạt; không có cờ bỏ qua | INFO 12; giữ "không hồi tố" (API_GD2 §4.3) mà không mở đường sửa hồ sơ ở HAS_ADVISOR (G1) |

## 14. Ngoài phạm vi GĐ6
Hủy ở trạng thái khác IN_PROGRESS (cần dòng `TRANSITIONS` mới – không làm), cán bộ chủ động chạy lại FR06 cho một snapshot (dùng `workflow_dispatch` của §9.5), thông báo email, Swagger (T701 sinh từ schema §2.7).
