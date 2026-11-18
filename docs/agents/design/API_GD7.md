# API_GD7 – Hợp đồng API bổ sung theo đề cương (2026-11-18)

- Task: TASK-DC-00 · FR28–FR39 (`docs/DAC_TA.md` mục 9) · NFR01, NFR02, NFR05, NFR07 · Người soạn: kien-truc-su · Ngày: 2026-11-18
- Trạng thái: **ĐỀ XUẤT – vòng sửa 1** (xử lý `reviews/TASK-DC-00-bao-mat-v1.md`, bảng ở cuối tài liệu; chờ BM duyệt lại).
- Nguồn: `docs/DAC_TA.md` (mục 2, 3, 5, 8, 9), quyết định chủ dự án 2026-11-18 (4 nhóm chức năng, giữ luồng cũ, STAFF = "Quản lý Khoa", không thêm vai trò COUNCIL, FR06 giữ 3 mức), đề cương nhóm (mục 4.1, UC01–UC23, bảng API/CSDL – chỉ lấy nghiệp vụ, không chép thông tin cá nhân), `design/API_GD2.md` §1–§2, `design/API_GD45.md` (§1.1–1.2, §3, §6, §7, §8, §9), `design/API_GD6.md` (§1, §2, §8, §9), code: `packages/shared/src/{enums,transitions}.js`, `apps/api/prisma/schema.prisma`, `apps/api/src/modules/{auth/routes.js, topics/{service,closeService}.js}`, `apps/web/vercel.json`.
- Mọi quy ước của API_GD2 §1, API_GD45 §1 và API_GD6 §1 **giữ nguyên** (đường dẫn, thứ tự kiểm 403 → 409, `withLockTx`, khóa lạc quan `version`, AuditLog + thông báo trong cùng transaction, ADMIN 403 ở mọi endpoint nghiệp vụ). Giả định đánh số tiếp từ **G48** (§13).

---

## 0. Chuyển trạng thái ↔ `TRANSITIONS`

Thêm 2 giá trị vào `TOPIC_STATUS` (shared + enum Prisma `TopicStatus`): `RECRUITING` ("Đang tuyển sinh viên"), `WAITING_DEFENSE` ("Chờ bảo vệ"). Không đổi `INACTIVE_STATUSES` → cả hai là đề tài hoạt động (tính hạn mức GV, số đề tài/SV).

Thêm **6 dòng** vào `TRANSITIONS` (không sửa 14 dòng cũ):

```js
{ action: 'PUBLISH_RECRUITMENT',   from: S.DRAFT,           to: S.RECRUITING,      actors: [R.LECTURER], currentAdvisorOnly: true, needsSimilarity: true, fr: ['FR06', 'FR31'] },
{ action: 'UNPUBLISH_RECRUITMENT', from: S.RECRUITING,      to: S.DRAFT,           actors: [R.LECTURER], currentAdvisorOnly: true, reasonRequired: true, fr: ['FR31'] },
{ action: 'FINALIZE_GROUP',        from: S.RECRUITING,      to: S.HAS_ADVISOR,     actors: [R.LECTURER], currentAdvisorOnly: true, fr: ['FR33'] },
{ action: 'REQUEST_DEFENSE',       from: S.IN_PROGRESS,     to: S.WAITING_DEFENSE, actors: [R.LECTURER], currentAdvisorOnly: true, fr: ['FR34'] },
{ action: 'RETURN_FROM_DEFENSE',   from: S.WAITING_DEFENSE, to: S.IN_PROGRESS,     actors: [R.STAFF], reasonRequired: true, fr: ['FR35'] },
{ action: 'COUNCIL_FINALIZE',      from: S.WAITING_DEFENSE, to: S.WAITING_CLOSE,   actors: [R.LECTURER], councilOfficerOnly: true, fr: ['FR37'] },
```

- `currentAdvisorOnly` ở DRAFT/RECRUITING an toàn: đề tài SV đề xuất **không bao giờ** có Advising ở DRAFT (Advising chỉ tạo ở `ACCEPT_ADVISING`), nên GV không thể "công bố" đề tài của SV. Cột `Topic.origin` vẫn được kiểm thêm trong `extra` của PUBLISH (phòng thủ nhiều lớp).
- Cờ mới `councilOfficerOnly`: `checkTransition` đòi `ctx.isCouncilOfficer` (§1.1). `COUNCIL_FINALIZE` **không** có trong `ENABLED_ACTIONS` (giống `CANCEL`): chỉ chạy bên trong `POST /api/council-assignments/:id/finalize` (§7.4), vì cần ngữ cảnh phân công. `ENABLED_ACTIONS` = mọi action trừ `CANCEL`, `COUNCIL_FINALIZE`.
- `PRE_APPROVAL_STATUSES` thêm `RECRUITING` (thành viên rời tự do trước duyệt – FR21, API_GD6 §5.1).
- `ACTION_LABEL` thêm: Công bố tuyển sinh viên / Ngừng tuyển / Chốt nhóm / Đề nghị ra hội đồng / Trả về đang thực hiện / Chốt nghiệm thu. `TOPIC_STATUS_LABEL` thêm 2 nhãn trên.
- Test `packages/shared/src/transitions.test.js:6` `toHaveLength(14)` → `20`: **đổi do đặc tả đổi** (mục 9 DAC_TA), không phải làm yếu test; ghi rõ trong báo cáo TASK-DC-01.
- Mọi chuyển trạng thái qua `checkTransition` + `applyTransition`/`applyTransitionTx` (API_GD6 §4.2) → `StatusHistory` + AuditLog `TOPIC_<ACTION>` trong cùng transaction (quy tắc 4).
- Migration enum **riêng** `dc_status_enum` chỉ gồm `ALTER TYPE "TopicStatus" ADD VALUE …` (Postgres không cho dùng giá trị enum mới trong cùng transaction đã thêm nó; mọi index/SQL dùng giá trị mới nằm ở migration sau).

### 0.1 Chỗ phải cập nhật khi thêm trạng thái (TASK-DC-01, grep `IN_PROGRESS'`/`WAITING_ADVISOR'` để không sót)
| Chỗ | Thay đổi |
|---|---|
| Kho so FR06 (`similarity/*`) | `RECRUITING` vào nhóm "hồ sơ đang chờ của nhóm khác cùng đợt" (ẩn tên với SV, mục 3 DAC_TA); `WAITING_DEFENSE` vào nhóm "Đang thực hiện, Chờ đóng, Đã đóng" |
| `TopicDetail` (`service.js`) | `CLOSING` thêm `WAITING_DEFENSE` cho `closeReadiness`; `permissions.checkSimilarity` thêm `isCurrentAdvisor && origin = LECTURER && DRAFT` |
| `GET /api/topics`, thống kê | Không lọc thêm; chiều `status` tự có 2 nhãn mới. Stuck filter (FR16.5) không đổi |
| Web `StatusBadge` | Màu cho 2 trạng thái (TASK-DC-12) |
| G45 (`rounds/prismaRepo.js`, PATCH đợt) | Thêm `RECRUITING` vào tập đề tài không sửa được hồ sơ (DC-05, m2 review BM DC-01): GV chỉ sửa sau khi ngừng tuyển – gỡ mọi SV đã nhận |
| Giả định cũ "có Advising ⇔ trạng thái ≥ HAS_ADVISOR" (m12 BM) | Từ nay Advising có ở DRAFT/RECRUITING của đề tài GV công bố. DC-01 grep `advisings`, `endAt: null`, `'advisor'` (trong `notifyTopic`), `isCurrentAdvisor` ở `topics/{service,listService,advisorRepo}.js`, `stats/*`, `changeRequests/advisorChange.js`, `notifications/notify.js`; ghi kết quả rà vào báo cáo. Đã biết: thống kê và `GET /api/topics` loại DRAFT với STAFF như cũ, GV thấy đề tài DRAFT của mình (đúng ý); FR19 không chạy ở DRAFT/RECRUITING (`ADVISOR_CHANGE_STATUSES`); hạn mức GV chỉ tính trạng thái hoạt động nên DRAFT không tính |

---

## 1. Quy ước bổ sung

### 1.1 Quan hệ mới (thêm vào `relations()` ở `topics/service.js`)
| Ký hiệu | Định nghĩa | Được |
|---|---|---|
| `isApplicant` | Có `TopicApplication` của me với đề tài, `status ≠ WITHDRAWN` | **Không** xem `GET /api/topics/:id`. Chỉ xem đề tài qua bảng tin §3 và đơn của mình |
| `isCouncilMember` | me là `CouncilMember` của hội đồng có `CouncilAssignment` của đề tài với `cancelledAt IS NULL` (đã chốt hay chưa) **và** đề tài chưa ở `CLOSED`/`CANCELLED` (m10 BM: không đọc vĩnh viễn; sau khi đóng, kết quả công khai qua kho FR08 nếu đạt) | `canView` và `canReadExecution` (đọc chi tiết, mốc, tài liệu + tải qua FR24, nhận xét, kết quả, điểm quá trình, snapshot, lịch sử). **Mọi quyền ghi `false`** trừ §7.3, §7.4 |
| `isCouncilOfficer` | `isCouncilMember` với vai trò `CHAIR` hoặc `SECRETARY`, trên phân công **chưa chốt** | `COUNCIL_FINALIZE` (§7.4), xem đủ điểm trước khi chốt |

- Giống tiền lệ `isFormerAdvisorReader` (API_GD6 §1.1): thêm **một lần** vào `canView`, `canReadExecution` (hàm dùng chung), không sửa từng endpoint. Phân công bị hủy (`cancelledAt`) → mất quyền ở request kế tiếp.
- `TopicDetail.councilAccess: { assignmentId, role } | null` (chỉ người có `isCouncilMember`); FE hiện dải "Bạn xem với tư cách thành viên hội đồng – chỉ đọc".
- `GET /api/topics` **không** thêm đề tài hội đồng vào phạm vi GV (G49): lối vào là §7.2. Thống kê GV giữ G29 (chỉ GVHD hiện hành).

### 1.2 Thứ tự khóa (mở rộng API_GD2 §1.8)
**Council → Topic → User (id tăng dần).** Nhiều Topic trong một thao tác: khóa theo `id` tăng dần.
- `SELECT … FROM "Council" WHERE id = $1 FOR UPDATE` khi đổi thành viên hội đồng; `FOR SHARE` khi gán đề tài, chấm điểm, chốt (chặn đổi thành viên đúng lúc đang chấm/chốt, nhưng các thao tác chấm không chặn nhau).
- Topic: câu khóa chuẩn `FOR NO KEY UPDATE` (API_GD45 §1.2) hoặc `topic.updateMany` có điều kiện `version`.
- Tranh chấp khóa → 409 `CONCURRENT_UPDATE`; `P2028` → 503 `SERVICE_BUSY` (đã có).

### 1.3 Mã lỗi mới (bổ sung API_GD2 §2, API_GD45 §2)
| HTTP | `code` | Thông điệp mặc định | Khi nào |
|---|---|---|---|
| 409 | `NOT_RECRUITING` | Đề tài không còn nhận ứng tuyển | Ứng tuyển / duyệt đơn khi `status ≠ RECRUITING` |
| 409 | `APPLICATION_EXISTS` | Bạn đã ứng tuyển đề tài này | §4.1 (vi phạm `application_one_active`) |
| 409 | `APPLICATION_CLOSED` | Đơn ứng tuyển không còn chờ xử lý | duyệt/từ chối/rút đơn không còn `PENDING` |
| 409 | `PROCESS_SCORE_TOO_LOW` | Điểm quá trình dưới 5,0 – đề tài không đủ điều kiện ra hội đồng | `REQUEST_DEFENSE` |
| 409 | `NO_FINAL_REPORT` | Nhóm chưa nộp báo cáo tổng kết | `REQUEST_DEFENSE` (không có Document `stage = FINAL`, `READY`) |
| 409 | `DEFENSE_REQUIRED` | Đợt này bắt buộc bảo vệ trước hội đồng | `REQUEST_CLOSE` khi `requireDefense` và kết quả hiện hành ≠ `FAIL` và `source ≠ COUNCIL` (§5.3) |
| 409 | `CONFLICT_OF_INTEREST` | Giảng viên hướng dẫn không được ngồi hội đồng chấm đề tài của mình | §6.3, §6.2. `details: { conflicts: [{ topicCode, lecturerName }] }` |
| 409 | `TOPIC_ALREADY_ASSIGNED` | Đề tài đã được phân công cho một hội đồng | §6.3. `details: { topicCodes }` |
| 409 | `NOT_WAITING_DEFENSE` | Chỉ phân công/chấm khi đề tài đang chờ bảo vệ | §6.3, §7.3. `details: { topicCodes }` khi gán nhiều |
| 409 | `COUNCIL_LOCKED` | Hội đồng đã có điểm, không đổi được thành viên | §6.2 |
| 409 | `ASSIGNMENT_HAS_SCORES` | Đề tài đã có điểm, không hủy phân công được | §6.4 |
| 409 | `ASSIGNMENT_DECIDED` | Hội đồng đã chốt kết quả đề tài này | §7.3, §7.4 |
| 409 | `SCORES_INCOMPLETE` | Còn thành viên hội đồng chưa chấm | §7.4. `details: { missing: [{ fullName, role }] }` |
| 409 | `COUNCIL_RESULT_LOCKED` | Kết quả do hội đồng quyết định, giảng viên không nhập lại được | `POST /api/topics/:id/results` khi kết quả hiện hành `source = COUNCIL` (§5.5, M4 BM) |

SSO tắt → endpoint `/api/auth/google/*` trả **404** chuẩn (§8.1), không có mã riêng. Lỗi SSO trả về trang qua query `sso_error` (§8.2), không qua JSON.

Mã dùng lại: `GROUP_FULL`, `GROUP_TOO_SMALL`, `STUDENT_TOPIC_LIMIT`, `LECTURER_QUOTA_EXCEEDED`, `REGISTRATION_CLOSED`, `JUSTIFICATION_REQUIRED`, `SIMILARITY_NOT_CHECKED`, `TOPIC_INCOMPLETE`, `MILESTONES_NOT_PASSED`, `NO_REQUIRED_MILESTONE`, `INVALID_TRANSITION`, `CONCURRENT_UPDATE`, `REASON_REQUIRED`, `VALIDATION_ERROR`, `FORBIDDEN`, `NOT_FOUND`.

---

## 2. Thay đổi Prisma / SQL

### 2.1 Migration (mỗi migration một task chủ, thứ tự theo bảng việc)
| Migration | Nội dung | Task |
|---|---|---|
| `dc_status_enum` | `TopicStatus` + `RECRUITING`, `WAITING_DEFENSE` (chỉ ADD VALUE) | DC-01 |
| `dc_profile` | `User.phone String?` | DC-02 |
| `dc_email_outbox` | `Notification` + `emailStatus String?`, `emailAttempts Int @default(0)`, `emailClaimedAt DateTime? @db.Timestamptz(6)`, `emailedAt DateTime? @db.Timestamptz(6)`; index `@@index([emailStatus, createdAt])` | DC-04 |
| `dc_recruitment` | enum `TopicOrigin { STUDENT LECTURER }`; `Topic` + `origin TopicOrigin @default(STUDENT)`, `requirements String @default("")`, `recruitSlots Int?`; model `TopicApplication`; SQL §2.3 | DC-05 |
| `dc_council` | enum `CouncilRole { CHAIR SECRETARY MEMBER }`, `DefenseDecision { PASSED FAILED }`, `ResultSource { ADVISOR COUNCIL STAFF }`; models `ProcessScore`, `Council`, `CouncilMember`, `CouncilAssignment`, `DefenseScore`; `ResultVersion` + `source ResultSource @default(ADVISOR)` + backfill `STAFF` cho bản do STAFF tạo; SQL §2.3 | DC-07 |

### 2.2 Model mới
```prisma
model TopicApplication {            // FR32, FR33
  id          String        @id @default(cuid())
  topicId     String
  studentId   String
  coverLetter String        // trim 20..2000
  status      RequestStatus @default(PENDING)
  reason      String?       // lý do từ chối (GV hoặc hệ thống khi chốt nhóm/ngừng tuyển)
  decidedById String?
  createdAt   DateTime      @default(now()) @db.Timestamptz(6)
  respondedAt DateTime?     @db.Timestamptz(6)
  topic   Topic @relation(fields: [topicId], references: [id])
  student User  @relation("ApplicationStudent", fields: [studentId], references: [id])
  @@index([topicId, status])
  @@index([studentId, status])
}

model ProcessScore {                // FR34 – chỉ thêm
  id         String   @id @default(cuid())
  topicId    String
  lecturerId String
  score      Decimal  @db.Decimal(4, 2)
  comment    String
  createdAt  DateTime @default(now()) @db.Timestamptz(6)
  topic    Topic @relation(fields: [topicId], references: [id])
  lecturer User  @relation("ProcessScoreBy", fields: [lecturerId], references: [id])
  @@index([topicId, createdAt])
}

model Council {                     // FR35
  id          String   @id @default(cuid())
  code        String   @unique     // HD-<năm học đầu>-<nnn>, sequence council_code_seq
  facultyId   String
  roundId     String
  name        String
  version     Int      @default(0)
  createdById String
  createdAt   DateTime @default(now()) @db.Timestamptz(6)
  members     CouncilMember[]
  assignments CouncilAssignment[]
  // + quan hệ faculty, round, createdBy
  @@index([roundId])
}

model CouncilMember {
  councilId  String
  lecturerId String
  role       CouncilRole
  @@id([councilId, lecturerId])
  @@index([lecturerId])
}

model CouncilAssignment {           // FR35–FR37
  id           String           @id @default(cuid())
  councilId    String
  topicId      String
  assignedById String
  assignedAt   DateTime         @default(now()) @db.Timestamptz(6)
  cancelledAt  DateTime?        @db.Timestamptz(6)
  cancelReason String?
  finalScore   Decimal?         @db.Decimal(4, 2)
  decision     DefenseDecision?
  minutes      String?          // biên bản/nhận xét chung khi chốt
  decidedById  String?
  decidedAt    DateTime?        @db.Timestamptz(6)
  scores       DefenseScore[]
  @@index([councilId])
  @@index([topicId])
}

model DefenseScore {                // FR36
  id           String   @id @default(cuid())
  assignmentId String
  memberId     String   // userId của giảng viên
  score        Decimal  @db.Decimal(4, 2)
  comment      String
  createdAt    DateTime @default(now()) @db.Timestamptz(6)
  updatedAt    DateTime @updatedAt @db.Timestamptz(6)
  @@unique([assignmentId, memberId])
}
```
Quan hệ ngược ở `User`, `Topic`, `Faculty`, `Round` theo tên ở trên. Điểm lưu `Decimal(4,2)`; trung bình tính bằng SQL `round(avg(score), 2)` (không cộng số thực trong JS).

### 2.3 SQL thô (cuối `migration.sql` tương ứng; không ghi vào `after_init.sql` – API_GD6 §2.6)
```sql
-- dc_recruitment
-- n3 (BM v2): chỉ chặn hai đơn ĐANG CHỜ; đơn đã nhận/từ chối/rút không chặn ứng tuyển lại sau khi ngừng tuyển rồi công bố lại.
-- Một SV không vào nhóm hai lần đã do TopicMember + suất đề tài/đợt (FR03) chặn.
CREATE UNIQUE INDEX application_one_active ON "TopicApplication" ("topicId", "studentId") WHERE status = 'PENDING';
ALTER TABLE "TopicApplication" ENABLE ROW LEVEL SECURITY;  -- NFR03, không policy (tiền lệ fr22_milestone_reopen)
-- dc_council
ALTER TABLE "ProcessScore"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Council"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CouncilMember"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CouncilAssignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DefenseScore"      ENABLE ROW LEVEL SECURITY;
CREATE SEQUENCE council_code_seq;
CREATE UNIQUE INDEX council_one_chair     ON "CouncilMember" ("councilId") WHERE role = 'CHAIR';
CREATE UNIQUE INDEX council_one_secretary ON "CouncilMember" ("councilId") WHERE role = 'SECRETARY';
CREATE UNIQUE INDEX council_assignment_one_open ON "CouncilAssignment" ("topicId") WHERE "decidedAt" IS NULL AND "cancelledAt" IS NULL;
CREATE TRIGGER process_score_append_only BEFORE UPDATE OR DELETE ON "ProcessScore" FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER process_score_no_truncate BEFORE TRUNCATE ON "ProcessScore" FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
-- Phân công đã chốt/hủy thì bất biến; không xóa
CREATE OR REPLACE FUNCTION council_assignment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'CouncilAssignment không được xóa'; END IF;
  IF OLD."decidedAt" IS NOT NULL OR OLD."cancelledAt" IS NOT NULL THEN RAISE EXCEPTION 'Phân công đã chốt hoặc đã hủy'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER council_assignment_guarded BEFORE UPDATE OR DELETE ON "CouncilAssignment" FOR EACH ROW EXECUTE FUNCTION council_assignment_guard();
-- Điểm bảo vệ: không xóa; không sửa khi phân công đã chốt
CREATE OR REPLACE FUNCTION defense_score_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'DefenseScore không được xóa'; END IF;
  IF EXISTS (SELECT 1 FROM "CouncilAssignment" a WHERE a.id = NEW."assignmentId" AND (a."decidedAt" IS NOT NULL OR a."cancelledAt" IS NOT NULL)) THEN
    RAISE EXCEPTION 'Điểm đã khóa'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER defense_score_guarded BEFORE INSERT OR UPDATE OR DELETE ON "DefenseScore" FOR EACH ROW EXECUTE FUNCTION defense_score_guard();
```
- Mọi bảng mới bật RLS không policy (M6 BM); test RLS của T203 (`tests/T203-schema.test.js`, kiểm mọi bảng public) phải xanh mà không sửa test.
- Test `pg_indexes`/`pg_trigger` (T203) thêm các index/trigger trên; `migrate dev --create-only` không sinh `DROP INDEX`; script reset DB test xử lý bảng có trigger như các bảng chỉ-thêm khác.
- Vi phạm `application_one_active` → 409 `APPLICATION_EXISTS`; `council_assignment_one_open` → 409 `TOPIC_ALREADY_ASSIGNED`; `council_one_chair/secretary` không xảy ra nếu schema Zod đúng (lỗi → 400).

### 2.4 Cấu hình đợt (Json `Round.config`, không cần migration)
`DEFAULT_ROUND_CONFIG` thêm `requireDefense: false`, `defenseGrades: { excellent: 9, good: 7, pass: 5 }`. `roundConfigSchema`: `requireDefense` boolean; `defenseGrades` 3 số 0..10, `pass ≤ good ≤ excellent`, `pass = 5` (cố định theo đề cương; ô chỉ đọc ở UI). G45 (chặn PATCH đợt làm kẹt đề tài) **không** áp cho 2 khóa này.

---

## 3. Đề tài GV công bố – FR31 (TASK-DC-05)

### 3.1 Tạo nháp – mở rộng `POST /api/topics` (API_GD2 §5.1)
- Thêm vai trò **LECTURER**. Body `topicCreateSchema` giữ nguyên (`roundId`, `title?`). Đợt cùng khoa với GV (403), `REGISTRATION_CLOSED` như SV.
- Trong một transaction: tạo Topic `{ origin: 'LECTURER', status: DRAFT, recruitSlots: null }` + `Advising { lecturerId: me, startAt: now }` + AuditLog `TOPIC_CREATE`. **Không** tạo `TopicMember`. Không kiểm hạn mức lúc tạo (DRAFT không tính hạn mức; kiểm khi công bố §3.3).
- 201 `{ "topic": TopicDetail }`.

### 3.2 Sửa – mở rộng `PUT /api/topics/:id`
- Quyền thêm: `isCurrentAdvisor && origin = LECTURER && status = DRAFT` (SV không có quan hệ nào với đề tài này ở DRAFT).
- Body `topicUpdateSchema` + 2 trường chỉ hợp lệ khi `origin = LECTURER` (đề tài SV gửi → 400 tại trường): `requirements` (trim 0..2000), `recruitSlots` (int 1..`maxMembers` của đợt, `null` khi nháp). PUT thay toàn bộ như cũ.
- `TopicDetail` thêm: `origin`, `requirements`, `recruitSlots`, `acceptedCount` (số thành viên hiện hành), `applicationCounts: { pending } | null` (chỉ GVHD hiện hành và cán bộ trong phạm vi).
- DC-05: `requirements`/`recruitSlots` bỏ trống trong PUT = **giữ nguyên** (thành viên sửa hồ sơ ở NEEDS_REVISION sau chốt nhóm không xóa yêu cầu GV đã nhập); chỉ GVHD hiện hành sửa nháp nguồn GV được gửi 2 trường này, còn lại 400 tại trường.
- `permissions.edit` = (cũ) `|| (isCurrentAdvisor && origin = LECTURER && DRAFT)`. `permissions.checkSimilarity` tương tự (nút "Kiểm tra trước", API_GD2 §7.1 mở cho GV này).

### 3.3 Công bố – `POST /api/topics/:id/actions` `{ action: 'PUBLISH_RECRUITMENT', version, justification? }`
Thứ tự (giống SUBMIT_FOR_REVIEW, API_GD2 §8.2, **không tạo snapshot**):
1. Quyền + trạng thái qua `checkTransition`; `origin = LECTURER` (không thì 409 `INVALID_TRANSITION`); `version` (409).
2. Kiểm đủ trường: `topicSubmitSchema(effectiveConfig)` + `recruitSlots` 1..`maxMembers` → 400 `TOPIC_INCOMPLETE` (`details` theo trường, có `recruitSlots`).
3. `registrationOpen` → 409 `REGISTRATION_CLOSED`.
4. FR06 chạy **ngoài** transaction, lưu `SimilarityCheck` (như §8.2 bước 4). `ERROR` → 409 `SIMILARITY_NOT_CHECKED`; `HIGH` thiếu giải trình đủ `minJustificationWords` → 400 `JUSTIFICATION_REQUIRED` (`details.similarityCheck`). Không áp dụng cờ bỏ qua G5 (G50).
5. `withLockTx`: khóa Topic (updateMany theo `version`) → khóa User GV → đếm đề tài hoạt động GV đang hướng dẫn trong đợt (Advising `endAt IS NULL`, `isActiveStatus`, **không tính đề tài này**) `< maxTopicsPerLecturer` → không thì 409 `LECTURER_QUOTA_EXCEEDED` → `applyTransitionTx` (StatusHistory) → ghi `justification` vào SimilarityCheck vừa chạy → AuditLog `TOPIC_PUBLISH_RECRUITMENT`.
6. 200 `{ "topic": TopicDetail }`. Không gửi thông báo (bảng tin là nơi SV thấy).

### 3.4 Ngừng tuyển – `{ action: 'UNPUBLISH_RECRUITMENT', version, reason }`
Lý do bắt buộc (`reasonRequired`, 400 `REASON_REQUIRED`). Nhánh schema để `reason` tùy chọn (≤ 2000) để `checkTransition` trả đúng mã `REASON_REQUIRED` (DC-05). Được cả khi **đã có thành viên** (M2 BM: tránh đề tài kẹt ở RECRUITING khi có 1..min−1 thành viên mà không ai ứng tuyển thêm – không chốt được, trưởng nhóm không rời được, chiếm hạn mức GV và suất đề tài của SV). Dưới khóa Topic, trong một transaction:
1. Mọi `TopicMember` hiện hành → `leftAt = now` (giải phóng suất đề tài hoạt động của SV, FR03); AuditLog `MEMBER_REMOVE` mỗi người (`after: { leftAt, reason }`). Người bị gỡ giữ quyền đọc phiên bản theo khoảng như FR21 (API_GD6 §5.4).
2. Đơn `PENDING` → `DECLINED`, `reason = 'Giảng viên ngừng tuyển'`, `decidedById = me`; đơn `ACCEPTED` giữ nguyên (lịch sử).
3. `applyTransitionTx` → DRAFT (StatusHistory có `reason`), tăng `version`. AuditLog `TOPIC_UNPUBLISH_RECRUITMENT`.
4. Thông báo `RECRUITMENT_CANCELLED` → thành viên bị gỡ; `APPLICATION_DECLINED` → SV có đơn chờ.
Mã `GROUP_NOT_EMPTY` (§1.3) **bỏ**. Công bố lại sau đó là đề tài mới tuyển từ đầu (không còn thành viên).

### 3.5 Test bắt buộc (DC-05)
| # | Ca | Kỳ vọng |
|---|---|---|
| 1 | GV tạo nháp → sửa → công bố | DRAFT → RECRUITING; Advising của GV; StatusHistory có `PUBLISH_RECRUITMENT` |
| 2 | Công bố thiếu `recruitSlots` / tóm tắt ngắn | 400 `TOPIC_INCOMPLETE` có khóa `recruitSlots` |
| 3 | FR06 HIGH không giải trình; FR06 lỗi giả lập | 400 `JUSTIFICATION_REQUIRED`; 409 `SIMILARITY_NOT_CHECKED` (không bao giờ coi là không trùng) |
| 4 | **Đồng thời**: GV còn 1 suất công bố 2 đề tài cùng lúc | Đúng một RECRUITING, bên kia 409 `LECTURER_QUOTA_EXCEEDED` |
| 5 | SV, GV khác, cán bộ gọi PUBLISH; GV PUBLISH đề tài SV ở DRAFT | 403 / 409, không đổi trạng thái |
| 6 | Ngừng tuyển: thiếu lý do; chưa có thành viên; **có 1 thành viên, `minMembers` = 2** | 400 `REASON_REQUIRED`; 200 + đơn chờ bị từ chối; 200, thành viên có `leftAt`, SV đó ứng tuyển/được mời đề tài khác thành công (suất được giải phóng), GET đề tài 403 |
| 9 | **Đồng thời (m9 BM)**: PUBLISH ‖ `ACCEPT_ADVISING` (luồng cũ) của cùng GV còn 1 suất; PUBLISH ‖ cán bộ duyệt thay GV (FR19) sang GV này | Đúng một thành công, bên kia 409 `LECTURER_QUOTA_EXCEEDED` (cùng khóa User GV `FOR NO KEY UPDATE` như `advisorRepo.js`) |
| 7 | SV gửi `requirements` trong PUT đề tài của mình | 400 |
| 8 | FR06 của hồ sơ SV khác cùng đợt so với đề tài RECRUITING | Có trong top 5, dòng `hidden: true` với SV |

---

## 4. Ứng tuyển và chốt nhóm – FR32, FR33 (TASK-DC-05 đọc, DC-06 ghi)

### 4.1 `ApplicationView`
```json
{ "id": "ap1", "status": "PENDING", "coverLetter": "…", "reason": null, "createdAt": "…", "respondedAt": null,
  "topic": { "id": "t9", "code": "NCKH-2026-0031", "title": "…", "status": "RECRUITING" },
  "student": { "id": "s1", "code": "…", "fullName": "…", "classCode": "…" },
  "availableActions": ["ACCEPT", "DECLINE"] }
```
- `student` chỉ mã, họ tên, mã lớp (không email, SĐT – FR30). Không trả cho SV khác.
- `availableActions`: `ACCEPT`, `DECLINE` cho GVHD hiện hành khi đơn `PENDING` và đề tài RECRUITING; `WITHDRAW` cho chính SV khi `PENDING`.

### 4.2 Bảng tin – đọc
**`GET /api/recruitments`** – STUDENT, LECTURER, STAFF (ADMIN 403). Chỉ đề tài `RECRUITING`, khoa = khoa của người gọi (STAFF: khoa trong phạm vi). Query `recruitmentListQuerySchema`: `roundId?`, `fieldId?`, `lecturerId?`, `q?` (≤ 200, tìm tên/từ khóa), `page`, `pageSize`. Sắp `createdAt` của lần công bố giảm dần (StatusHistory) – đơn giản: `updatedAt desc, id`.
```json
{ "items": [{ "topicId": "t9", "code": "…", "title": "…", "summaryExcerpt": "≤ 300 ký tự", "field": { "id": "f1", "name": "…" },
  "round": { "id": "r1", "name": "…", "registrationOpen": true }, "lecturer": { "id": "l1", "fullName": "…" },
  "recruitSlots": 3, "acceptedCount": 1, "myApplication": { "id": "ap1", "status": "PENDING" } }],
  "page": 1, "pageSize": 20, "total": 4 }
```
- `myApplication` chỉ với STUDENT (đơn không `WITHDRAWN` mới nhất của me), người khác `null`. **Không** trả số đơn, tên ứng viên, thành viên (FR08).

**`GET /api/recruitments/:topicId`** – như trên; đề tài không RECRUITING hoặc khác khoa → 404 (không lộ tồn tại). `{ "recruitment": { …item, "summary", "objectives", "keywords", "requirements" } }`.

**`GET /api/applications`** – hộp đơn. STUDENT: đơn của mình. LECTURER: đơn vào đề tài mình là GVHD hiện hành. STAFF: đề tài trong phạm vi (chỉ đọc). Query `status?`, `topicId?`, `roundId?`, `page`, `pageSize`. Sắp `createdAt ASC, id ASC`. `{ items: [ApplicationView], page, pageSize, total }`.

**`GET /api/topics/:id/applications`** – GVHD hiện hành, cán bộ trong phạm vi; còn lại 403. Query `status?`, phân trang.

### 4.3 Ứng tuyển – `POST /api/recruitments/:topicId/applications`
STUDENT · limiter 30/15 phút/user · Body `applicationCreateSchema { coverLetter: trim 20..2000 }`.
Kiểm sớm (ngoài khóa, cho thông điệp rõ): đề tài RECRUITING cùng khoa (không thì 404 như §4.2); `registrationOpen` (409 `REGISTRATION_CLOSED`); SV chưa là thành viên đề tài này; số đề tài hoạt động của SV trong đợt `< maxActiveTopicsPerStudent` (409 `STUDENT_TOPIC_LIMIT`).
Ghi trong `withLockTx` (M3 BM): khóa Topic `SELECT … FOR SHARE` (xung đột với khóa ghi của `FINALIZE_GROUP`/`UNPUBLISH_RECRUITMENT`, nhưng nhiều SV ứng tuyển cùng lúc không chặn nhau) → **kiểm lại** `status = RECRUITING` (409 `NOT_RECRUITING`) và cùng khoa sau khóa → tạo đơn (`P2002` → 409 `APPLICATION_EXISTS`). Nhờ vậy không có đơn `PENDING` mồ côi trên đề tài đã chốt/ngừng tuyển. AuditLog `APPLICATION_CREATE` (không ghi `coverLetter` – chỉ độ dài). Thông báo `APPLICATION_RECEIVED` → GVHD.
201 `{ "application": ApplicationView }`.

**`POST /api/applications/:id/withdraw`** – chính SV. `updateMany({ where: { id, studentId: me, status: 'PENDING' } })` → `WITHDRAWN`; `count = 0` → 409 `APPLICATION_CLOSED`. AuditLog `APPLICATION_WITHDRAW`. 200 `{ application }`.

### 4.4 Duyệt đơn – `POST /api/applications/:id/accept`
LECTURER GVHD hiện hành của đề tài (kiểm lại dưới khóa – API_GD6 §1.2) · Body `emptyBodySchema` · limiter 60/15 phút.
`withLockTx`:
1. Khóa Topic `FOR NO KEY UPDATE`; `status = RECRUITING` (409 `NOT_RECRUITING`); GVHD hiện hành = me (403).
2. Đếm thành viên hiện hành (câu riêng sau khóa) `< recruitSlots` → không thì 409 `GROUP_FULL` "Nhóm đã đạt số lượng tối đa ({recruitSlots})".
3. Khóa User SV; SV không khóa tài khoản và còn cùng khoa (409 `APPLICATION_CLOSED` "Sinh viên không còn đủ điều kiện"); đếm đề tài hoạt động của SV trong đợt `< maxActiveTopicsPerStudent` → không thì 409 `STUDENT_TOPIC_LIMIT`.
4. `topicApplication.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'ACCEPTED', decidedById: me, respondedAt: now } })`; `count = 0` → 409 `APPLICATION_CLOSED`.
5. Tạo `TopicMember { role: thành viên hiện hành = 0 ? 'LEADER' : 'MEMBER' }`; tăng `Topic.version`.
6. Nếu SV vừa chạm giới hạn đề tài hoạt động: các đơn `PENDING` khác của SV trong cùng đợt → `WITHDRAWN` (hệ thống), thông báo GVHD các đề tài đó (G51).
7. AuditLog `APPLICATION_ACCEPT` + `MEMBER_JOIN`. Thông báo `APPLICATION_ACCEPTED` → SV.
200 `{ "application": ApplicationView, "topic": TopicDetail }`.

**`POST /api/applications/:id/decline`** – như accept bước 1 (không cần RECRUITING: GV vẫn từ chối được đơn còn chờ ở mọi trạng thái), body `reasonSchema { reason }` 5..2000 bắt buộc. `updateMany where PENDING` → `DECLINED`. AuditLog `APPLICATION_DECLINE`. Thông báo `APPLICATION_DECLINED`.

### 4.5 Chốt nhóm – `{ action: 'FINALIZE_GROUP', version }`
Dưới khóa Topic: thành viên hiện hành `≥ minMembers` (409 `GROUP_TOO_SMALL`); đúng một LEADER (luôn đúng nhờ §4.4 bước 5 và FR21 không cho trưởng nhóm rời). Đơn `PENDING` → `DECLINED` `reason = 'Đề tài đã chốt nhóm'`. `applyTransitionTx` → HAS_ADVISOR. Thông báo `GROUP_FINALIZED` → thành viên; `APPLICATION_DECLINED` → SV có đơn bị từ chối. Từ đây luồng cũ: trưởng nhóm `SUBMIT_FOR_REVIEW` (FR05, FR06, FR17) → cán bộ xét duyệt.

### 4.6 Test bắt buộc (DC-06)
| # | Ca | Kỳ vọng |
|---|---|---|
| 1 | Luồng đủ: 2 SV ứng tuyển → GV duyệt cả 2 → chốt → trưởng nhóm gửi xét duyệt → cán bộ duyệt | SV đầu là LEADER; HAS_ADVISOR → UNDER_REVIEW → IN_PROGRESS; StatusHistory đủ |
| 2 | **Đồng thời**: còn 1 chỗ, GV duyệt 2 đơn cùng lúc (2 request song song) | Đúng 1 ACCEPTED, bên kia 409 `GROUP_FULL`; số thành viên = `recruitSlots` |
| 3 | **Đồng thời**: 2 GV duyệt cùng 1 SV ở 2 đề tài, giới hạn 1 | Đúng 1 thành công, bên kia 409 `STUDENT_TOPIC_LIMIT` |
| 4 | SV rút ‖ GV duyệt cùng đơn | Một bên thắng, bên kia 409 `APPLICATION_CLOSED`; không có TopicMember khi rút thắng |
| 5 | Duyệt ‖ FINALIZE_GROUP / UNPUBLISH | Không có thành viên mới sau chốt; bên thua 409 |
| 6 | Ứng tuyển 2 lần; ngoài thời gian đăng ký; SV khoa khác | 409 `APPLICATION_EXISTS`; 409 `REGISTRATION_CLOSED`; 404 |
| 7 | Bảng tin của SV: không có tên ứng viên, thành viên, số đơn; ứng viên gọi `GET /api/topics/:id` | Trường không có; 403 |
| 8 | Quyền: GV khác, SV khác, ADMIN duyệt/xem đơn | 403 |
| 9 | Chốt khi dưới min | 409 `GROUP_TOO_SMALL` |
| 10 | **Đồng thời (M3 BM)**: SV ứng tuyển ‖ `FINALIZE_GROUP`; SV ứng tuyển ‖ `UNPUBLISH_RECRUITMENT` | Sau cả hai request: không còn đơn `PENDING` nào trên đề tài có `status ≠ RECRUITING`; bên ứng tuyển thua nhận 409 `NOT_RECRUITING` |
| 11 | **Đồng thời (m9 BM)**: GV duyệt đơn SV X ‖ nhóm cũ có SV X gửi `REQUEST_ADVISOR` (luồng cũ kiểm FR03 chính thức ở đây, khóa User thành viên), giới hạn 1 đề tài | Đúng một thành công, bên kia 409 `STUDENT_TOPIC_LIMIT` (cùng khóa User SV `FOR NO KEY UPDATE`) |

---

## 5. Điểm quá trình và đề nghị ra hội đồng – FR34 (TASK-DC-07)

### 5.1 `{ action: 'REQUEST_DEFENSE', version, processScore, processComment }`
Mở rộng `topicActionSchema` (union theo `action`): `processScore` số 0..10, tối đa 2 chữ số thập phân (`scoreSchema` dùng chung §11); `processComment` trim 20..5000.
Kiểm theo thứ tự API_GD45 §1.1: quyền/trạng thái (`checkTransition`) → `version` → `processScore ≥ 5` (409 `PROCESS_SCORE_TOO_LOW`, **không lưu** điểm) → điều kiện mốc như đóng (409 `NO_REQUIRED_MILESTONE` / `MILESTONES_NOT_PASSED`, dùng chung `evaluateClose`) → có Document `stage = FINAL`, `status = READY` (409 `NO_FINAL_REPORT`).
Transaction (`applyClose`-style, khóa Topic): kiểm lại GVHD hiện hành + điều kiện mốc + báo cáo dưới khóa → `ProcessScore` → `applyTransitionTx` → AuditLog `TOPIC_REQUEST_DEFENSE` (`after: { processScore }`) → thông báo `DEFENSE_REQUESTED` → cán bộ trong phạm vi + thành viên.
200 `{ "topic": TopicDetail }`.

### 5.2 Điểm < 5,0 (UC12 nhánh 4a)
Không có chuyển tự động. UI gợi ý "Đề tài không đủ điều kiện ra hội đồng; nhập kết quả Không đạt và gửi đóng" → `POST /api/topics/:id/results { result: 'FAIL' }` + `REQUEST_CLOSE` (FR27, có sẵn). Lý do: mọi chuyển trạng thái phải là action có người chịu trách nhiệm (G52).

### 5.3 `requireDefense` (đợt)
`REQUEST_CLOSE` (closeService, nhánh điều kiện): nếu `effectiveConfig.requireDefense` và kết quả hiện hành ≠ `FAIL` và `source ≠ COUNCIL` → 409 `DEFENSE_REQUIRED`. Kiểm sớm và kiểm lại dưới khóa cùng chỗ `closeConditions`. Mặc định `false` → 74 E2E hiện có không đổi.

### 5.4 Trả về – `{ action: 'RETURN_FROM_DEFENSE', version, reason }`
STAFF `inStaffScope`, lý do bắt buộc. Dưới khóa Topic: phân công mở (nếu có) → `cancelledAt = now`, `cancelReason = reason` (điểm đã chấm giữ lại làm lịch sử, trigger cho phép vì chưa chốt). `applyTransitionTx` → IN_PROGRESS. Thông báo `DEFENSE_RETURNED` → GVHD, thành viên, thành viên hội đồng.

### 5.5 Kết quả có nguồn – `ResultVersion.source`
- `POST /api/topics/:id/results` (GVHD) ghi `ADVISOR`; FR23 (cán bộ) ghi `STAFF`; `CLOSE_EXPIRED` ghi `STAFF`; §7.4 ghi `COUNCIL`.
- `closeConditions.hasFinalResult` (G25): kết quả hiện hành **và** (`source = COUNCIL` **hoặc** `createdById` = GVHD hiện hành). Nhờ vậy `CONFIRM_CLOSE` (FR27.3) chấp nhận kết quả hội đồng; luật cũ cho nhánh GVHD không đổi.
- **Kết quả hội đồng không bị GVHD ghi đè (M4 BM, FR37, G59)**: khi kết quả hiện hành có `source = COUNCIL` (sau chốt, kể cả khi cán bộ `RETURN_TO_ADVISOR` về IN_PROGRESS để bổ sung):
  - `POST /api/topics/:id/results` của GVHD → 409 `COUNCIL_RESULT_LOCKED` (kiểm dưới khóa Topic, cùng chỗ kiểm `EXEC_OPEN`);
  - `REQUEST_CLOSE` dùng kết quả COUNCIL và **không** bị `DEFENSE_REQUIRED` (§5.3: điều kiện là "kết quả hiện hành là FAIL **hoặc** có `source = COUNCIL`");
  - muốn chấm lại: GVHD `REQUEST_DEFENSE` lại → phân công mới → chốt mới tạo ResultVersion COUNCIL mới. Chỉ cán bộ sửa sau đóng qua FR23 (`source = STAFF`).
- `ResultView` thêm `source`; `TopicDetail.processScore: { score, comment, createdAt, lecturer: { fullName } } | null` (bản mới nhất; cho `canReadExecution`, gồm hội đồng).

### 5.6 Test bắt buộc (DC-07)
| # | Ca | Kỳ vọng |
|---|---|---|
| 1 | Đủ điều kiện, điểm 7,25 | WAITING_DEFENSE; ProcessScore 7.25; SV upload → 409 `TOPIC_NOT_IN_PROGRESS` |
| 2 | Điểm 4,99; thiếu báo cáo FINAL; còn mốc chưa Đạt | 409 `PROCESS_SCORE_TOO_LOW` (không có ProcessScore); `NO_FINAL_REPORT`; `MILESTONES_NOT_PASSED` |
| 3 | Điểm 10,001 / 5,555 / "abc" | 400 `VALIDATION_ERROR` tại `processScore` |
| 4 | `requireDefense = true`: REQUEST_CLOSE với kết quả GOOD / FAIL | 409 `DEFENSE_REQUIRED` / 200 |
| 5 | RETURN_FROM_DEFENSE thiếu lý do / có phân công mở | 400 `REASON_REQUIRED` / phân công `cancelledAt` khác null, thành viên HĐ mất quyền xem |
| 6 | Sửa/xóa ProcessScore bằng SQL | Trigger từ chối |
| 7 | **Đồng thời**: REQUEST_DEFENSE ‖ thay GV (FR19 duyệt) | Một thành công; không có ProcessScore của GV cũ sau `Advising.endAt` |
| 8 | (M4 BM) Hội đồng chốt FAIL → cán bộ `RETURN_TO_ADVISOR` → GVHD `POST /results { GOOD }` | 409 `COUNCIL_RESULT_LOCKED`; kết quả hiện hành vẫn FAIL nguồn COUNCIL |
| 9 | (M4 BM) `requireDefense = true`, hội đồng chốt PASS → trả lại → GVHD `REQUEST_CLOSE` | 200 (không `DEFENSE_REQUIRED`) |

---

## 6. Hội đồng – FR35 (TASK-DC-08)

Mọi endpoint §6: STAFF `inStaffScope` với `council.facultyId` (ghi); đọc theo §6.5. ADMIN 403. Limiter ghi 30/15 phút/user.

### 6.1 `CouncilView`
```json
{ "id": "c1", "code": "HD-2026-003", "name": "Hội đồng CNPM 1", "version": 2,
  "round": { "id": "r1", "name": "…", "academicYear": "2026-2027" },
  "members": [{ "lecturerId": "l2", "fullName": "…", "role": "CHAIR" }, { "lecturerId": "l3", "fullName": "…", "role": "SECRETARY" }, { "lecturerId": "l4", "fullName": "…", "role": "MEMBER" }],
  "assignments": [{ "id": "as1", "topic": { "id": "t1", "code": "…", "title": "…", "status": "WAITING_DEFENSE" }, "advisor": { "fullName": "…" },
    "scoredCount": 2, "memberCount": 3, "finalScore": null, "decision": null, "decidedAt": null, "cancelledAt": null }],
  "locked": false, "createdAt": "…" }
```
`locked` = có ít nhất một `DefenseScore` trong hội đồng. `assignments` chỉ phân công chưa hủy (query `includeCancelled=true` cho cán bộ).

### 6.2 Tạo, sửa
**`POST /api/councils`** – Body `councilCreateSchema { roundId, name: trim 3..200, members: [{ lecturerId, role }] }`: đúng 1 `CHAIR`, 1 `SECRETARY`, 1–5 `MEMBER`, `lecturerId` không trùng (lỗi theo trường `members`). Kiểm DB: đợt thuộc khoa trong phạm vi (403); mọi `lecturerId` là LECTURER không khóa, cùng khoa (400 `VALIDATION_ERROR` `{ members: "Giảng viên không hợp lệ" }`). Mã từ `council_code_seq`. AuditLog `COUNCIL_CREATE`. Thông báo `COUNCIL_MEMBER_ADDED` → từng thành viên. 201 `{ council }`.

**`PATCH /api/councils/:id`** – `{ name, version }`. 200.

**`PUT /api/councils/:id/members`** – Body `{ members, version }` (thay toàn bộ, cùng ràng buộc). `withLockTx`: khóa Council `FOR UPDATE` + kiểm `version` (409 `CONCURRENT_UPDATE`) → có `DefenseScore` → 409 `COUNCIL_LOCKED` → **kiểm xung đột lợi ích** với mọi phân công mở: thành viên mới không là GVHD hiện hành của đề tài nào đang gán (409 `CONFLICT_OF_INTEREST`) → xóa/thêm `CouncilMember` (bảng liên kết, không phải dữ liệu nghiệp vụ chỉ-thêm; lịch sử nằm ở AuditLog `COUNCIL_MEMBERS_SET` `before/after`) → `version + 1`. Thông báo thành viên thêm/bớt.

### 6.3 Gán đề tài – `POST /api/councils/:id/assignments`
Body `councilAssignSchema { topicIds: idSchema[] 1..50, không trùng }`. **Tất cả hoặc không** (UC16).
`withLockTx`: khóa Council `FOR SHARE` → khóa các Topic theo `id` tăng dần → với mỗi đề tài:
- cùng `facultyId` và `roundId` với hội đồng (không thì 400 `VALIDATION_ERROR` `{ topicIds: "Đề tài không thuộc đợt của hội đồng" }`);
- `status = WAITING_DEFENSE` (gom → 409 `NOT_WAITING_DEFENSE` `details.topicCodes`);
- GVHD hiện hành (đọc sau khóa) **không** nằm trong thành viên hội đồng (gom → 409 `CONFLICT_OF_INTEREST` `details.conflicts: [{ topicCode, lecturerName }]`, thông điệp "Không thể gán. {tên GV} là GVHD của đề tài {mã}");
- chưa có phân công mở (P2002 của `council_assignment_one_open` → 409 `TOPIC_ALREADY_ASSIGNED`).
Tạo `CouncilAssignment` từng đề tài; AuditLog `COUNCIL_ASSIGN` (mỗi đề tài). Thông báo `COUNCIL_ASSIGNED` → thành viên hội đồng, GVHD, thành viên nhóm (tiêu đề chỉ gồm mã + tên đề tài và tên hội đồng).
201 `{ council: CouncilView }`.

Xung đột lợi ích chỉ cần kiểm ở §6.2 và §6.3 vì GVHD **không đổi được** khi đề tài ở WAITING_DEFENSE (`ADVISOR_CHANGE_STATUSES` không có trạng thái này – G35). Test khẳng định điều đó (§6.6 #5).

### 6.4 Hủy phân công – `POST /api/council-assignments/:id/cancel`
Body `reasonSchema`. Dưới khóa Council `FOR SHARE` + Topic: phân công mở (409 `ASSIGNMENT_DECIDED`), chưa có điểm (409 `ASSIGNMENT_HAS_SCORES` – muốn bỏ dù có điểm thì dùng `RETURN_FROM_DEFENSE` §5.4). `updateMany where { id, decidedAt: null, cancelledAt: null }`. AuditLog `COUNCIL_UNASSIGN`. Thông báo thành viên hội đồng.

### 6.5 Đọc
- **`GET /api/councils`** – STAFF (khoa trong phạm vi), LECTURER (hội đồng mình là thành viên). Query `roundId?`, `q?`, phân trang. Item = `CouncilView` không có `assignments` + `assignmentCount`.
- **`GET /api/councils/:id`** – STAFF trong phạm vi hoặc thành viên hội đồng; còn lại 403. `{ council: CouncilView }`.
- **`GET /api/topics?status=WAITING_DEFENSE&councilAssigned=false`** – tham số mới `councilAssigned` (`true|false`, chỉ STAFF; vai trò khác gửi → 400) để chọn đề tài chưa gán (UC16 bước 4). Item danh sách thêm `defenseCouncil: { id, code } | null` (STAFF).

### 6.6 Test bắt buộc (DC-08)
| # | Ca | Kỳ vọng |
|---|---|---|
| 1 | Tạo hội đồng 2 chủ tịch / thiếu thư ký / trùng GV / GV khoa khác / 6 ủy viên | 400 tại `members` |
| 2 | Gán đề tài mà GVHD là ủy viên | 409 `CONFLICT_OF_INTEREST`, `details.conflicts` đúng; **không** đề tài nào được gán (tất cả hoặc không) |
| 3 | Đổi thành viên thêm GVHD của đề tài đã gán | 409 `CONFLICT_OF_INTEREST` |
| 4 | **Đồng thời**: gán cùng đề tài vào 2 hội đồng | Đúng 1 thành công, bên kia 409 `TOPIC_ALREADY_ASSIGNED` |
| 5 | Tạo yêu cầu thay GV (FR19) khi WAITING_DEFENSE | 409 `INVALID_TRANSITION` (không tạo được xung đột sau khi gán) |
| 6 | **Đồng thời**: đổi thành viên ‖ thành viên chấm điểm | Hoặc đổi trước (người bị bỏ nhận 403), hoặc chấm trước (đổi nhận 409 `COUNCIL_LOCKED`) |
| 7 | Thành viên HĐ: `GET /api/topics/:id`, tài liệu, `download-url` | 200, AuditLog `DOCUMENT_DOWNLOAD`. Ghi đều 403 (m10 BM, liệt kê): `PUT /api/topics/:id`, `POST /api/topics/:id/actions`, `POST …/documents`, `POST …/documents/links`, `POST /api/documents/:id/feedbacks`, `POST /api/progress/:id/feedbacks`, `POST …/milestones`, `PATCH /api/milestones/:id`, `POST /api/milestones/:id/reopen`, `POST …/results`, `POST …/change-requests`, `POST …/similarity-checks`. Sau hủy phân công **và** sau khi đề tài CLOSED: đọc 403 |
| 8 | Quyền: GV ngoài hội đồng, SV, cán bộ khoa khác, ADMIN | 403 |

---

## 7. Chấm điểm và chốt – FR36, FR37 (TASK-DC-09)

### 7.1 `AssignmentView`
```json
{ "id": "as1", "council": { "id": "c1", "code": "…", "name": "…" }, "myRole": "SECRETARY",
  "topic": { "id": "t1", "code": "…", "title": "…", "status": "WAITING_DEFENSE", "advisor": { "fullName": "…" } },
  "processScore": { "score": "7.25", "comment": "…" },
  "scores": [{ "member": { "lecturerId": "l2", "fullName": "…", "role": "CHAIR" }, "score": "8.00", "comment": "…", "updatedAt": "…" }],
  "myScore": { "score": "7.50", "comment": "…", "updatedAt": "…" },
  "scoredCount": 2, "memberCount": 3,
  "finalScore": null, "decision": null, "minutes": null, "decidedBy": null, "decidedAt": null, "cancelledAt": null,
  "availableActions": ["SCORE", "FINALIZE"] }
```
- Điểm trả **chuỗi thập phân** 2 chữ số (giữ đúng `Decimal`, không lệch số thực).
- `scores`: trước khi chốt chỉ cho `CHAIR`, `SECRETARY`, cán bộ trong phạm vi; ủy viên nhận `[]` (chỉ `myScore`, `scoredCount`) – chấm độc lập (G53). Sau khi chốt: mọi người đọc được phân công.
- `availableActions`: `SCORE` = thành viên, đề tài WAITING_DEFENSE, phân công mở; `FINALIZE` = `CHAIR`/`SECRETARY`, phân công mở (không xét đủ điểm – nút vẫn hiện, server trả `SCORES_INCOMPLETE`).
- SV, GVHD xem kết quả qua `TopicDetail.defense` (§7.5), không qua endpoint này.

### 7.2 Đọc
- **`GET /api/council-assignments`** – LECTURER: phân công của các hội đồng mình là thành viên ("Đề tài phân công chấm", UC19); STAFF: theo phạm vi. Query `status?` enum `OPEN|DECIDED|CANCELLED`, `roundId?`, phân trang. Sắp `assignedAt ASC`.
- **`GET /api/council-assignments/:id`** – thành viên hội đồng hoặc STAFF trong phạm vi; còn lại 403. `{ assignment: AssignmentView }`.
- Tài liệu, nhận xét GVHD, mốc: dùng endpoint có sẵn (`GET /api/topics/:id/documents?stage=FINAL`, `POST /api/documents/:id/download-url` – FR24, kiểm quyền mỗi lần, ghi lịch sử; `GET /api/topics/:id/feedbacks`) nhờ `isCouncilMember` trong `canReadExecution` (§1.1). Không có cơ chế tải thứ hai.

### 7.3 Chấm – `PUT /api/council-assignments/:id/my-score`
LECTURER thành viên hội đồng · limiter 60/15 phút · Body `defenseScoreSchema { score: scoreSchema, comment: trim 10..5000 }`.
`withLockTx`: khóa Council `FOR SHARE` → khóa Topic → me còn là thành viên (403) → phân công mở (409 `ASSIGNMENT_DECIDED`, bị hủy → 409 `ASSIGNMENT_DECIDED` thông điệp "Phân công đã bị hủy") → `status = WAITING_DEFENSE` (409 `NOT_WAITING_DEFENSE`) → upsert `DefenseScore (assignmentId, memberId = me)`. AuditLog `DEFENSE_SCORE_SET` (`before/after: { score }`, không ghi `comment`). Không thông báo (tránh lộ tiến trình chấm).
200 `{ assignment: AssignmentView }`.

### 7.4 Chốt – `POST /api/council-assignments/:id/finalize`
LECTURER `CHAIR`/`SECRETARY` của hội đồng · Body `defenseFinalizeSchema { version, minutes: trim 20..5000 }` (`version` = `Topic.version` đang thấy; `minutes` = nhận xét tổng kết bắt buộc như FR12).
`withLockTx`:
1. Khóa Council `FOR SHARE`; khóa Topic qua `updateMany({ where: { id, version, status: 'WAITING_DEFENSE' } })` của `applyTransitionTx` (count 0 → đọc lại phân biệt 409 `CONCURRENT_UPDATE` / `INVALID_TRANSITION`).
2. `checkTransition({ action: 'COUNCIL_FINALIZE', ctx: { isCouncilOfficer } })` với vai trò đọc lại dưới khóa.
3. Mọi `CouncilMember` hiện tại có `DefenseScore` → không thì 409 `SCORES_INCOMPLETE` (`details.missing`).
4. `finalScore = round(avg(score), 2)` bằng SQL; `decision = finalScore ≥ 5 ? PASSED : FAILED`; `result` = quy đổi theo `defenseGrades` của đợt (≥ excellent → EXCELLENT, ≥ good → GOOD, ≥ pass → PASS, còn lại FAIL).
5. `councilAssignment.updateMany({ where: { id, decidedAt: null, cancelledAt: null }, data: { finalScore, decision, minutes, decidedById: me, decidedAt: now } })`; `count = 0` → 409 `ASSIGNMENT_DECIDED`.
6. Hạ `isCurrent` của kết quả cũ (nếu có) rồi tạo `ResultVersion { source: 'COUNCIL', result, summary: minutes, createdById: me }` (thứ tự như API_GD45 §6.4).
7. StatusHistory `COUNCIL_FINALIZE` (WAITING_DEFENSE → WAITING_CLOSE). AuditLog `COUNCIL_FINALIZE` (`after: { finalScore, decision, result }`) + `RESULT_CREATE`.
8. Thông báo `DEFENSE_DECIDED` → thành viên nhóm, GVHD, thành viên hội đồng; `CLOSE_REQUESTED` → cán bộ trong phạm vi (dùng lại khóa chống trùng của FR27).
200 `{ assignment: AssignmentView, topic: TopicDetail }`.

Sau đó cán bộ `CONFIRM_CLOSE` / `RETURN_TO_ADVISOR` như FR27 (không đổi). Trả lại → IN_PROGRESS; phân công đã chốt giữ nguyên làm lịch sử; GVHD có thể `REQUEST_DEFENSE` lại → phân công mới (index `council_assignment_one_open` cho phép vì bản cũ đã chốt).

### 7.5 `TopicDetail.defense`
```json
"defense": { "assignmentId": "as1", "council": { "code": "…", "name": "…" }, "state": "ASSIGNED",
  "finalScore": null, "decision": null, "decidedAt": null, "scores": [] }
```
- `state`: `WAITING_ASSIGNMENT` (WAITING_DEFENSE, chưa gán) · `ASSIGNED` · `DECIDED` (phân công mới nhất đã chốt). `null` nếu đề tài chưa từng đề nghị ra hội đồng.
- Cho `canReadExecution`. `scores` (vai trò, họ tên, điểm, nhận xét từng thành viên) chỉ có khi `DECIDED` (UC07: SV xem kết quả bảo vệ); trước đó `[]` với mọi người trừ cán bộ trong phạm vi và `isCouncilOfficer`.

### 7.6 Test bắt buộc (DC-09)
| # | Ca | Kỳ vọng |
|---|---|---|
| 1 | Luồng đủ: 3 thành viên chấm 8, 7.5, 6.75 → thư ký chốt | `finalScore` 7.42, `PASSED`, kết quả GOOD nguồn COUNCIL, WAITING_CLOSE; cán bộ CONFIRM_CLOSE → CLOSED, vào kho tra cứu |
| 2 | Trung bình 4.99 | `FAILED`, kết quả FAIL; đóng → không vào kho |
| 3 | Chốt khi thiếu 1 điểm; ủy viên bấm chốt | 409 `SCORES_INCOMPLETE` có `missing`; 403 |
| 4 | **Đồng thời**: chủ tịch và thư ký chốt cùng lúc | Đúng 1 thành công (200), bên kia 409 (`CONCURRENT_UPDATE` / `ASSIGNMENT_DECIDED` / `INVALID_TRANSITION`); đúng 1 ResultVersion COUNCIL, 1 StatusHistory |
| 5 | **Đồng thời**: ủy viên sửa điểm ‖ thư ký chốt | Hoặc điểm mới vào trung bình, hoặc sửa nhận 409 `ASSIGNMENT_DECIDED`; `finalScore` = trung bình điểm trong DB lúc chốt |
| 6 | Sửa điểm sau chốt bằng SQL | Trigger từ chối |
| 7 | Ủy viên đọc phân công trước chốt | `scores: []`; chủ tịch thấy đủ |
| 8 | Điểm 11 / -1 / 7.333 | 400 tại `score` |
| 9 | SV, GVHD, GV ngoài HĐ, ADMIN gọi `my-score`/`finalize` | 403 |
| 10 | `CONFIRM_CLOSE` sau chốt với kết quả COUNCIL (GVHD chưa nhập kết quả) | 200 (`hasFinalResult` nhận nguồn COUNCIL) |
| 11 | **Đồng thời (m9 BM)**: cán bộ `RETURN_FROM_DEFENSE` ‖ thư ký chốt | Đúng một thành công: hoặc IN_PROGRESS + phân công `cancelledAt`, không có ResultVersion COUNCIL; hoặc WAITING_CLOSE + phân công đã chốt, return nhận 409 |

---

## 8. Đăng nhập Google – FR28 (TASK-DC-03)

### 8.1 Bật/tắt
Bật khi có đủ `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_ALLOWED_DOMAINS`, `PUBLIC_APP_URL` (khai báo tùy chọn trong `config/env.js`, Zod). `GOOGLE_ALLOWED_DOMAINS` = danh sách tên miền cách nhau bằng dấu phẩy, chữ thường (m4 BM: SV và GV có thể khác tên miền email, ví dụ `vanlanguni.vn,vlu.edu.vn`); mỗi phần tử khớp regex tên miền. `PUBLIC_APP_URL`: Zod `url()`, không có `/` cuối, bắt buộc `https:` khi `NODE_ENV=production`. Thiếu một phần → tắt, `logger.warn` liệt kê **tên** biến thiếu (không in giá trị). Tắt: `GET /api/auth/providers` → `{ "google": false }`; `/api/auth/google/*` → 404.

### 8.2 Luồng Authorization Code + PKCE phía server
Không tải script Google trên trang → **CSP `apps/web/vercel.json` giữ nguyên** (không thêm `accounts.google.com` vào `script-src`/`frame-src`/`connect-src`).

1. **`GET /api/auth/providers`** – công khai. `{ "google": true }`.
2. **`GET /api/auth/google/start?next=`** – công khai, limiter **mức phiên 300/15 phút/IP** (như `/refresh`, M1 BM: phòng máy/ký túc xá chung NAT). `next`: chỉ giữ khi ≤ 512 ký tự, bắt đầu `/`, không bắt đầu `//`, không chứa `\`; sai thì bỏ (m3 BM, cookie không vượt 4 KB). Sinh `state`, `nonce`, `codeVerifier` (32 byte ngẫu nhiên, base64url). Ghi cookie `nckh_oauth` = JWT HS256 ký bằng khóa **dẫn xuất riêng** `HMAC-SHA256(JWT_ACCESS_SECRET, 'oauth-state')` (không thể dùng làm access token), `exp` 10 phút, chứa `{ state, nonce, codeVerifier, next }`; cookie httpOnly, Secure (production), SameSite=Lax, `path=/api/auth/google`. 302 tới Google: `response_type=code`, `scope=openid email profile`, `redirect_uri=${PUBLIC_APP_URL}/api/auth/google/callback`, `state`, `nonce`, `code_challenge` (S256), `hd=<tên miền đầu danh sách>` khi danh sách có đúng 1 tên miền (chỉ là gợi ý, không bảo mật), `prompt=select_account`.
   - FE mở bằng **liên kết `<a href>` (GET, điều hướng cấp trên cùng)**, không dùng form: CSP `form-action 'self'` của trang chặn chuỗi chuyển hướng sang Google nếu bắt đầu từ form.
   - `next` chỉ giữ để trả lại; server không chuyển hướng tới `next` (luôn về `PUBLIC_APP_URL` + đường cố định) → không có open redirect phía server; FE kiểm `next` như UI §1.2.
3. **`GET /api/auth/google/callback?code&state`** – limiter 20/15 phút/IP với `skipSuccessfulRequests: true` (chỉ đếm lần thất bại, M1 BM; giống `/login` ở `auth/routes.js`). Luôn xóa cookie `nckh_oauth`. Query kiểm bằng `ssoCallbackQuerySchema` (m2 BM: `code` ≤ 2048, `state` ≤ 128, `error` ≤ 64, mọi khóa khác bỏ qua); sai dạng → `STATE_MISMATCH`. Kiểm, sai bước nào → 302 `${PUBLIC_APP_URL}/dang-nhap?sso_error=<MÃ>` (302 này được đếm là thất bại cho limiter):
   - Google trả `error` (người dùng bấm Hủy, `access_denied`…) → `CANCELLED` "Bạn đã hủy đăng nhập bằng Google" (m2 BM);
   - cookie hợp lệ, chưa hết hạn, `state` khớp (so sánh hằng thời gian) → không thì `STATE_MISMATCH`;
   - đổi `code` lấy token bằng `OAuth2Client.getToken({ code, codeVerifier, redirect_uri })`; lỗi mạng/Google → `GOOGLE_ERROR` (log `warn`, không lộ thông điệp Google);
   - `verifyIdToken({ idToken, audience: GOOGLE_CLIENT_ID })` (chữ ký, `iss`, `exp`); `nonce` khớp → không thì `STATE_MISMATCH`;
   - `email_verified === true` → không thì `EMAIL_NOT_VERIFIED`;
   - `hd` thuộc `GOOGLE_ALLOWED_DOMAINS` **và** phần tên miền của email (sau `@` cuối, chữ thường) **bằng đúng** `hd` → không thì `DOMAIN_NOT_ALLOWED`;
   - tìm User theo email **không phân biệt hoa thường**: 0 bản ghi → `NO_ACCOUNT`; > 1 → `NO_ACCOUNT` + `logger.error` (dữ liệu bẩn, không đoán);
   - `role = ADMIN` → `PASSWORD_ONLY` "Tài khoản quản trị chỉ đăng nhập bằng mật khẩu" (m5 BM, G60: chiếm hộp thư Google không được thành chiếm quyền quản trị, ADMIN giữ Argon2id + TEMP_LOCKED);
   - `isLocked` hoặc `lockedUntil > now` → `ACCOUNT_LOCKED`.
   Thành công: cấp phiên **trong transaction như đăng nhập mật khẩu** (m1 BM): `lockUser` (khóa SHARE dòng User như `auth/service.js` hiện làm khi cấp token) → **đọc lại** `isLocked`, `lockedUntil`, `role` sau khóa (sai → `ACCOUNT_LOCKED`) → cấp refresh token họ mới + access token. DC-03 tách phần cấp token hiện là `issueTokens` nội bộ thành hàm export dùng chung cho cả hai đường đăng nhập (không viết bản thứ hai). Cookie `nckh_rt` như cũ, **không** đổi `mustChangePassword` (mật khẩu tạm do cán bộ cấp vẫn phải thay). 302 `${PUBLIC_APP_URL}/dang-nhap/google?next=<next đã mã hóa>`; FE gọi `POST /api/auth/refresh` như lúc khởi động. Không có token trên URL.
   - AuditLog `LOGIN_SSO` (actor = user, `after: { provider: 'google' }`, ip). Thất bại: log `info` với mã lỗi và **tên miền** của email, không log email đầy đủ.
4. Đăng xuất, refresh, đổi mật khẩu: không đổi.

### 8.3 Quyết định: không tự tạo tài khoản lần đầu (lệch UC01 nhánh 5a – G54)
Chỉ cho đăng nhập vào tài khoản đã có. Lý do: (1) giảng viên, cán bộ, nhân viên dùng **cùng tên miền** với sinh viên – tự tạo "SINH VIÊN mặc định" sẽ cấp vai trò sai cho họ và cho cựu sinh viên còn hộp thư; (2) FR02 "không có tự đăng ký", tài khoản đến từ nhập CSV có khoa/lớp, cần cho phạm vi FR25 và giới hạn FR03; (3) tài khoản tự tạo không có lớp, khoa → rơi ngoài mọi phạm vi. Người chưa có tài khoản nhận thông điệp "Tài khoản chưa được cấp trên hệ thống. Vui lòng liên hệ cán bộ khoa."

### 8.4 Test bắt buộc (DC-03) – Google giả bằng client tiêm vào (không gọi mạng)
Tắt khi thiếu biến (providers false, start 404); **25 lần SSO thành công cùng IP trong 15 phút không bị 429** (M1 BM); Google trả `error=access_denied` → `CANCELLED`; `next` dài 5.000 ký tự bị bỏ, cookie < 4 KB; ADMIN → `PASSWORD_ONLY`; **khóa tài khoản ‖ callback** → không có refresh token sống của người bị khóa (m1 BM); email `x@evil.vanlanguni.vn.attacker.com` với `hd` hợp lệ giả → bị từ chối; `state` sai/thiếu cookie/hết hạn; `nonce` sai; `email_verified` false; `hd` khác; email `@gmail.com`; email hoa thường khác nhau vẫn khớp; không có tài khoản; tài khoản khóa và tạm khóa; thành công → có cookie `nckh_rt`, refresh trả `user` đúng, URL chuyển hướng không chứa token; cookie `nckh_oauth` không dùng được làm Bearer; `next=//evil.com` không làm server chuyển hướng ra ngoài.

---

## 9. Email thông báo – FR29 (TASK-DC-04)

### 9.1 Bật/tắt
Bật khi có `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `PUBLIC_APP_URL` (`SMTP_SECURE` tùy chọn, mặc định `true` khi cổng 465). Thiếu → tắt, `logger.info` một lần lúc khởi động.

### 9.2 Hộp thư đi (outbox) trên bảng `Notification`
- `notify`/`notifyTopic` (có sẵn, chạy trong transaction nghiệp vụ) đặt `emailStatus = 'PENDING'` khi bật, `null` khi tắt. Không gửi mail trong transaction (giống quy tắc Cloudinary, API_GD45 §1.3).
- Bộ gửi `dispatchEmails({ limit: 50 })`:
  0. Dọn trước (m6c BM): `SENDING` có `emailClaimedAt` > 15 phút và `emailAttempts >= 3` → `FAILED` (không treo vĩnh viễn).
  1. Transaction ngắn: chọn `PENDING` (hoặc `SENDING` có `emailClaimedAt` > 15 phút) với `emailAttempts < 3`, `FOR UPDATE SKIP LOCKED LIMIT 50` → đặt `SENDING`, `emailClaimedAt = now`, `emailAttempts + 1`.
  2. Ngoài transaction: với mỗi dòng, đọc người nhận; khóa tài khoản → `SKIPPED`; gửi bằng transport → `SENT` + `emailedAt`; lỗi → `PENDING` (còn lượt) hoặc `FAILED`, `logger.warn` (mã thông báo, không log địa chỉ, không log nội dung).
  3. Nhiều tiến trình chạy cùng lúc không lấy trùng một dòng (SKIP LOCKED + trạng thái `SENDING`). **Bảo đảm là "ít nhất một lần"** (m6d BM): tiến trình sập giữa lúc gửi xong và lúc đánh dấu `SENT` → dòng được nhận lại sau 15 phút và có thể gửi lần hai. Chấp nhận: thư chỉ là bản sao của thông báo trong web, không mang thao tác.
- Kích hoạt: `setInterval(dispatchEmails, 60s)` **chỉ trong `server.js`** khi bật (không trong `app.js` để test không chạy ngầm). Không cần cron: thông báo chỉ sinh khi server đang chạy; Render ngủ sau ≥ 15 phút không có request nên dòng mới đều được gửi trước đó (G55). Cron nhắc hạn có sẵn đánh thức server và sinh thông báo, interval gửi ngay sau đó.
- Lỗi SMTP không bao giờ làm request nghiệp vụ lỗi (gửi tách khỏi request).

### 9.3 Nội dung
- Người nhận: `User.email` của chính người nhận thông báo – không CC/BCC, mỗi người một thư.
- Tiêu đề: `[NCKH Khoa CNTT] ${notification.title}` sau khi **thay mọi ký tự điều khiển (CR, LF, `\u0000-\u001f`, `\u007f`) bằng khoảng trắng** và cắt ≤ 200 ký tự (m6a BM: tên đề tài do SV nhập). Thân văn bản thuần + HTML tối giản: tiêu đề thông báo, đường dẫn `${PUBLIC_APP_URL}${notification.link}` – chỉ khi `link` khác `null` và bắt đầu `/` không phải `//`; ngược lại dùng `${PUBLIC_APP_URL}/thong-bao` (m6b BM), dòng "Đăng nhập để xem chi tiết". **Không** thêm tóm tắt, lý do, điểm, tên người khác ngoài những gì đã có trong `title` (title vốn chỉ hiện cho chính người nhận – FR13). Escape HTML mọi giá trị chèn.
- Ngôn ngữ tiếng Việt; header `Content-Type` UTF-8.

### 9.4 Test bắt buộc (DC-04) – transport giả (`nodemailer` `jsonTransport` hoặc hàm tiêm)
Tắt: `emailStatus` null, không gọi transport. Tiêu đề đề tài chứa `\r\nBcc: x@evil.com` → subject một dòng, không có header Bcc; `link = null` → thư dẫn `/thong-bao`; dòng `SENDING` quá hạn với `emailAttempts = 3` → `FAILED`. Bật: tạo thông báo → PENDING → dispatch → SENT 1 lần; transport ném lỗi 3 lần → FAILED, request nghiệp vụ trước đó vẫn 2xx; hai dispatch song song → mỗi thư gửi đúng 1 lần; tài khoản khóa → SKIPPED; HTML escape `<script>` trong tiêu đề đề tài; thư chỉ chứa title + link.

---

## 10. Hồ sơ cá nhân, Kanban, Excel

### 10.1 Hồ sơ – FR30 (TASK-DC-02)
- **`GET /api/me/profile`** – mọi vai trò kể cả ADMIN. `{ "profile": { id, code, email, fullName, role, faculty: { id, name } | null, class: { id, code, major: { name } } | null, phone } }`.
- **`PATCH /api/me/profile`** – limiter 10/15 phút/user · Body `profileUpdateSchema { phone: string | null }` strict: trim, bỏ khoảng trắng/dấu chấm/gạch, khớp `^(0|\+84)(3|5|7|8|9)\d{8}$` → lỗi "Số điện thoại không hợp lệ"; `null`/rỗng = xóa. Trường khác trong body → 400 (strict). AuditLog `PROFILE_UPDATE` (`before/after: { phone }`). 200 `{ profile }`.
- `GET /api/users/:id` (API_GD2 §3.2, ADMIN/STAFF trong phạm vi) thêm `phone`. **Không** thêm `phone` vào `TopicDetail.members`, `ApplicationView`, danh sách tài khoản, CSV hay Excel.

### 10.2 Kanban – FR38 (TASK-DC-10 backend, DC-17 web)
- `MilestoneView` (API_GD45 §3.1) thêm `awaitingFeedback: boolean` = `latestDocument ≠ null` và **không có** `Feedback` **có `evaluation` khác null** với `documentId = latestDocument.id` (M5 BM: nhận xét không đánh giá không đưa thẻ rời "Chờ đánh giá"). Một truy vấn gộp (không N+1). Test DC-10: nhận xét không đánh giá → vẫn `true`; nhận xét có `NEEDS_WORK` → `false`; nộp bản mới sau đó → `true`.
- Cột suy ra ở web, **không lưu**: `PASSED` → Đạt; `awaitingFeedback` → Chờ đánh giá; `NEEDS_WORK` → Cần bổ sung; còn lại → Chưa nộp.
- Thao tác (chỉ GVHD hiện hành, `IN_PROGRESS`; người khác chỉ xem): Chờ đánh giá → Đạt / Cần bổ sung = `POST /api/documents/{latestDocument.id}/feedbacks { content, evaluation, milestoneVersion }` (API_GD45 §6.1, hộp thoại nhập nhận xét bắt buộc); Đạt → Cần bổ sung = `POST /api/milestones/:id/reopen` (FR22, lý do). Mọi cặp khác: vùng thả bị tắt. **Không có endpoint mới**, không có bảng "thẻ" mới (G56).

### 10.3 Excel – FR39 (TASK-DC-11)
**`GET /api/stats/export.xlsx`** – cùng quyền, cùng `statsQuerySchema`, limiter chung với CSV (30/15 phút).
- Sheet "Thống kê": gọi **đúng `computeStats`**; cột như CSV (API_GD45 §9.2). Sheet "Danh sách đề tài": cùng mệnh đề WHERE của `computeStats` (tách hàm `statsWhere(user, query)` dùng chung, không viết bộ lọc thứ hai); cột: Mã, Tên đề tài, Trạng thái, Đợt, Năm học, Lĩnh vực, GVHD hiện hành, Số thành viên, Nguồn (SV đề xuất / GV công bố), Kết quả (chỉ CLOSED, G27), Điểm bảo vệ (phân công đã chốt mới nhất, **chỉ khi CLOSED** – cùng định nghĩa với cột Kết quả, m8 BM). Không có tên/mã SV, email, SĐT, nhận xét. Số dòng = `total`; `total > 5000` → 400 `VALIDATION_ERROR` "Quá nhiều đề tài, hãy thu hẹp bộ lọc".
- Mọi ô văn bản ghi **kiểu chuỗi** (`cell.value = string`), không bao giờ `{ formula }`; số là kiểu số. Vì Excel không tính ô chuỗi nên không thêm tiền tố như CSV (giữ đúng dữ liệu); test khẳng định ô `=1+1`, `+cmd`, `@SUM(...)` có `type` chuỗi trong file đọc lại (G57).
- Header: `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `Content-Disposition: attachment; filename="thong-ke-<groupBy>-<yyyyMMdd giờ VN>.xlsx"`, `Cache-Control: no-store`. Ghi bằng `WorkbookWriter` dạng stream.
- Test (DC-11): `rows` của `/api/stats` = sheet 1 = CSV; số dòng sheet 2 = `total`; GV chỉ thấy đề tài mình; ô công thức là chuỗi; STUDENT/ADMIN 403.

---

## 11. Schema cần thêm ở `packages/shared`
| Tên | Nội dung | Task |
|---|---|---|
| `TOPIC_STATUS` + nhãn, `ACTION_LABEL` 6 action, `PRE_APPROVAL_STATUSES` + RECRUITING, `ENABLED_ACTIONS` trừ `COUNCIL_FINALIZE` | §0 | DC-01 |
| `scoreSchema` = số hữu hạn 0..10, tối đa 2 chữ số thập phân (kiểm `Math.abs(x*100 - Math.round(x*100)) < 1e-9`), thông điệp "Điểm phải từ 0 đến 10, tối đa 2 chữ số thập phân" | §5, §7 | DC-07 |
| `topicActionSchema` thêm nhánh `PUBLISH_RECRUITMENT { justification? }`, `UNPUBLISH_RECRUITMENT { reason }`, `FINALIZE_GROUP {}`, `REQUEST_DEFENSE { processScore, processComment }`, `RETURN_FROM_DEFENSE { reason }` | §3–§5 | DC-05, DC-06, DC-07 |
| `topicUpdateSchema` thêm `requirements?`, `recruitSlots?`; `topicPublishSchema(config)` = `topicSubmitSchema(config)` + `recruitSlots` 1..maxMembers | §3 | DC-05 |
| `TOPIC_ORIGIN` + nhãn (SV đề xuất / GV công bố) | §3 | DC-05 |
| `applicationCreateSchema`, `recruitmentListQuerySchema`, `applicationListQuerySchema` | §4 | DC-05, DC-06 |
| `COUNCIL_ROLE` + nhãn (Chủ tịch / Thư ký / Ủy viên), `DEFENSE_DECISION` + nhãn (Đạt / Không đạt), `RESULT_SOURCE` + nhãn | §6, §7 | DC-07, DC-08 |
| `councilCreateSchema`, `councilUpdateSchema`, `councilMembersSchema`, `councilAssignSchema`, `councilListQuerySchema`, `assignmentListQuerySchema` | §6 | DC-08 |
| `defenseScoreSchema`, `defenseFinalizeSchema` | §7 | DC-09 |
| `profileUpdateSchema`, `PHONE_REGEX` | §10.1 | DC-02 |
| `DEFAULT_ROUND_CONFIG` + `requireDefense`, `defenseGrades`; `roundConfigSchema` tương ứng; hàm thuần `gradeFromDefenseScore(score, grades)` (unit test biên 4.99/5/6.99/7/8.99/9) | §2.4, §7.4 | DC-07 |
| `NOTIFICATION_TYPES` + nhãn: `APPLICATION_RECEIVED`, `APPLICATION_ACCEPTED`, `APPLICATION_DECLINED`, `GROUP_FINALIZED`, `DEFENSE_REQUESTED`, `DEFENSE_RETURNED`, `COUNCIL_MEMBER_ADDED`, `COUNCIL_MEMBER_REMOVED`, `COUNCIL_ASSIGNED`, `COUNCIL_UNASSIGNED`, `DEFENSE_DECIDED` | §3–§7 | task gắn sự kiện |
| `SSO_ERROR_LABEL` (mã `sso_error` → thông điệp tiếng Việt: `CANCELLED`, `STATE_MISMATCH`, `GOOGLE_ERROR`, `EMAIL_NOT_VERIFIED`, `DOMAIN_NOT_ALLOWED`, `NO_ACCOUNT`, `PASSWORD_ONLY`, `ACCOUNT_LOCKED`); `ssoCallbackQuerySchema` (chỉ dùng ở API) | §8 | DC-03 |
| `NOTIFICATION_TYPES` thêm `RECRUITMENT_CANCELLED` (thành viên bị gỡ khi ngừng tuyển) | §3.4 | DC-05 |

Tất cả theo QD_ZOD §5 (`.max()` trước refine, body strict, thông điệp tiếng Việt).

---

## 12. Thư viện mới (kien-truc-su duyệt)
| Gói | Workspace | Phiên bản | Lý do / điều kiện |
|---|---|---|---|
| `google-auth-library` | `apps/api` | dòng **10.x**, ghim chính xác bản mới nhất lúc cài (ghi số vào báo cáo DC-03) | Thư viện chính thức của Google: `OAuth2Client.generateAuthUrl`, `getToken` (PKCE), `verifyIdToken` (kiểm chữ ký JWKS, `aud`, `iss`, `exp`). Không tự viết kiểm JWT của Google. Không dùng Google Identity Services phía trình duyệt → không đổi CSP |
| `nodemailer` | `apps/api` | **10.6.0** (ghim chính xác; dòng 10.x, tối thiểu 10.1.4) – **sửa vòng 1, B1 BM** | Mọi bản ≤ 10.1.3 (kể cả 7.0.13, bản cuối của 7.x) bị `npm audit` báo **high** (SMTP command injection GHSA-c7w3-x93f-qmm8, CRLF header injection GHSA-268h-hp4c-crq3, gửi tới tên miền ngoài ý muốn GHSA-wmmp-3585-3rmp / GHSA-cc9r-2j5m-2m83, DoS addressparser); BM đo 10.6.0 + google-auth-library 10.9.1 = 0 lỗ hổng. `engines` của 10.6.0 là Node ≥ 20; dự án `engines >=22.22.0`, `.nvmrc` 24, CI và Render Node 24 → tương thích. Điều kiện đạt DC-04: `npm audit --omit=dev` không high/critical. Chuẩn de facto cho SMTP trên Node, đề cương cũng chọn NodeMailer. Test dùng transport giả |
| `exceljs` | `apps/api` | **4.4.0** (ghim chính xác) | Chỉ **ghi** file (stream `WorkbookWriter`), không bao giờ đọc file xlsx từ người dùng (tránh bề mặt tấn công phân tích zip/XML). Không dùng `xlsx` (SheetJS) trên npm vì bản 0.18.5 có lỗ hổng đã biết và không còn phát hành trên npm. Điều kiện: `npm audit --omit=dev` không có high/critical do gói này; nếu có → báo KTS trước khi gộp. **Đã biết (m7 BM)**: kéo `uuid` < 11.1.1 (GHSA-w5hq-g745-h8pq, moderate) – lỗi chỉ ở v3/v5/v6 khi truyền `buf`, exceljs dùng v4 → không khai thác được; DC-11 ghi vào báo cáo, không dùng `overrides` ép `uuid` 11 (đổi API, rủi ro hỏng exceljs). Gói ít bảo trì: chỉ dùng sau hàm `exportXlsx` trong một module để thay được |
| Kéo thả Kanban | `apps/web` | **không thêm thư viện** | HTML5 Drag and Drop cho chuột + nút "Chuyển sang…" (menu Radix đã có) cho bàn phím và cảm ứng (HTML5 DnD không chạy trên cảm ứng); `aria-live` thông báo kết quả |
| `devDependencies` test đọc xlsx | – | dùng chính `exceljs` để đọc lại file trong test | Không thêm gói |

---

## 13. Giả định
| # | Giả định | Lý do |
|---|---|---|
| G48 | Đề tài GV công bố sau khi chốt nhóm về **Đã có GVHD**; trưởng nhóm gửi xét duyệt như luồng cũ. **Câu hỏi `CAU_HOI.md` #14** | Dùng lại nguyên FR05/FR06/FR17/FR07 (snapshot, giải trình, hạn đăng ký) thay vì viết lần gửi thứ hai cho GV; đề cương ghi "chốt nhóm → chờ Khoa duyệt" chỉ khác một nút bấm |
| G49 | Thành viên hội đồng không thấy đề tài trong `GET /api/topics` và thống kê; lối vào là "Chấm bảo vệ" | Giữ G29; tránh làm thống kê GV lệch |
| G50 | Công bố đề tài GV không dùng cờ bỏ qua FR06 (G5) | G5 gắn với lần gửi xét duyệt; GV chỉ cần thử lại; khi gửi xét duyệt sau chốt nhóm, G5 vẫn áp dụng |
| G51 | SV được duyệt và chạm giới hạn đề tài hoạt động → các đơn chờ khác trong đợt tự rút | Đơn đó chắc chắn sẽ bị `STUDENT_TOPIC_LIMIT`; rút sớm để GV khác không phải xử lý đơn chết |
| G52 | Điểm quá trình < 5 không tự chuyển "Không đạt"; GV nhập Không đạt và gửi đóng (FR27) | Mọi chuyển trạng thái là action có người chịu trách nhiệm và ghi StatusHistory; tránh nhánh tự động ngoài `TRANSITIONS` |
| G53 | Ủy viên không thấy điểm người khác trước khi chốt; Chủ tịch, Thư ký thấy | Chấm độc lập; người chốt cần kiểm tra trước khi ký biên bản (UC21 bước 1) |
| G54 | SSO không tự tạo tài khoản (lệch UC01 nhánh 5a) | §8.3 |
| G55 | Gửi email bằng vòng lặp 60 s trong tiến trình, không cron | §9.2; ít hạ tầng nhất, không gửi trùng nhờ SKIP LOCKED |
| G56 | Kanban là **góc nhìn** của mốc (FR09) – không có bảng "thẻ" riêng như đề cương | Mốc đã có đánh giá, bản nộp, lịch sử; bảng thẻ riêng tạo hai nguồn sự thật cho tiến độ |
| G57 | Excel không thêm tiền tố chống injection như CSV; dựa vào kiểu ô chuỗi | Ô chuỗi không được Excel tính; tiền tố làm sai dữ liệu. CSV giữ nguyên `escapeCell` |
| G58 | Hội đồng gắn với một đợt và một khoa; một đề tài tối đa một phân công mở | UC16 lập hội đồng cho đợt; phân công mới chỉ khi bản cũ đã chốt/hủy |
| G59 | Điểm quá trình không cộng vào điểm cuối; điểm cuối = trung bình điểm bảo vệ; GVHD không ghi đè kết quả COUNCIL (§5.5) | Đề cương Rule 5 "điểm cuối cùng là điểm Hội đồng quyết định" |
| G60 | ADMIN không đăng nhập bằng SSO (m5 BM) | ADMIN không cần cho nghiệp vụ; giữ Argon2id + TEMP_LOCKED; chiếm một hộp thư Google không thành chiếm quyền quản trị |
| G61 | Đề tài RECRUITING vẫn ẩn tên với SV trong kết quả FR06 dù tên công khai trên bảng tin (m11 BM – không sửa) | Không lộ thêm gì (bảng tin đã công khai); giữ **một** quy tắc ẩn "hồ sơ chờ của nhóm khác cùng đợt" để không thêm nhánh vào code ẩn/hiện đã qua review bảo mật T214. Có thể nới sau nếu người dùng muốn |
| G62 | Thành viên hội đồng mất quyền đọc khi đề tài CLOSED/CANCELLED hoặc phân công bị hủy (m10 BM) | Quyền đọc chỉ phục vụ chấm và chốt; sau đóng, kết quả công khai qua kho FR08 |
| G63 | Ngừng tuyển gỡ luôn thành viên đã nhận, bắt buộc lý do (M2 BM) | Lối thoát duy nhất cho đề tài thiếu người; thành viên bị gỡ được giải phóng suất (FR03) và giữ quyền đọc phiên bản như FR21 |

---

## Vòng sửa 1 (review `reviews/TASK-DC-00-bao-mat-v1.md`)

| # | Vấn đề | Cách sửa | Chỗ sửa |
|---|---|---|---|
| B1 | `nodemailer` 7.x có lỗ hổng high, không vá ở 7.x | Ghim **10.6.0** (audit 0 lỗ hổng theo BM); ghi engines Node ≥ 20, dự án Node 24 | §12; `BANG_CONG_VIEC.md` DC-04 |
| M1 | Limiter SSO 20/15 phút/IP chặn sinh viên chung NAT | `start`: 300/15 phút/IP (mức phiên); `callback`: `skipSuccessfulRequests`; test 25 lần thành công cùng IP | §8.2, §8.4 |
| M2 | Đề tài RECRUITING kẹt khi có 1..min−1 thành viên | `UNPUBLISH_RECRUITMENT` được cả khi có thành viên, bắt buộc lý do (`reasonRequired` trong TRANSITIONS), gỡ thành viên (`leftAt`) dưới khóa, bỏ `GROUP_NOT_EMPTY`; test giải phóng suất SV | §0, §1.3, §3.4, §3.5 #6, G63; DAC_TA mục 9; UI §12.5 |
| M3 | Ứng tuyển không khóa → đơn PENDING mồ côi | Tạo đơn trong `withLockTx` với khóa Topic `FOR SHARE`, kiểm lại RECRUITING sau khóa; test đồng thời | §4.3, §4.6 #10 |
| M4 | GVHD ghi đè kết quả hội đồng; `requireDefense` buộc bảo vệ lại | `COUNCIL_RESULT_LOCKED` khi kết quả hiện hành nguồn COUNCIL; `DEFENSE_REQUIRED` bỏ qua khi nguồn COUNCIL; chấm lại = `REQUEST_DEFENSE` lại; 2 test | §1.3, §5.3, §5.5, §5.6 #8–9; DAC_TA mục 9 |
| M5 | `awaitingFeedback` sai khi nhận xét không đánh giá | Chỉ tính Feedback có `evaluation`; 3 ca test | §10.2; DAC_TA FR38 |
| M6 | Bảng mới không bật RLS | `ENABLE ROW LEVEL SECURITY` cho 6 bảng; test T203 phải xanh | §2.3 |
| M7 | Cột Review/phụ thuộc | DC-01, DC-07 thêm BM; DC-11 phụ thuộc DC-05, DC-07 | `BANG_CONG_VIEC.md` |
| m1 | Cấp phiên SSO chưa khóa User | Cấp phiên trong tx: `lockUser` + đọc lại khóa/vai trò; tách `issueTokens` dùng chung; test khóa ‖ callback | §8.2, §8.4 |
| m2 | Hủy ở Google, query không có schema | Mã `CANCELLED`, `ssoCallbackQuerySchema` | §8.2, §11 |
| m3 | `next` không giới hạn | ≤ 512 ký tự, kiểm dạng, sai thì bỏ | §8.2 |
| m4 | Một tên miền; `PUBLIC_APP_URL` chưa ràng buộc | `GOOGLE_ALLOWED_DOMAINS` (danh sách), email phải đúng tên miền `hd`; `url()` + `https` ở production | §8.1, §8.2; DC-20 |
| m5 | ADMIN qua SSO | Chặn, mã `PASSWORD_ONLY` (G60) | §8.2, §13 |
| m6 | Subject CRLF, `link` null, `SENDING` treo, "không trùng" | Lọc ký tự điều khiển; link dự phòng `/thong-bao`; bước dọn `FAILED`; ghi rõ "ít nhất một lần"; test | §9.2–§9.4 |
| m7 | `uuid` qua exceljs | Ghi rõ không khai thác được, không ép `overrides` | §12 |
| m8 | Điểm bảo vệ ở Excel cho đề tài chưa đóng | Chỉ điền khi CLOSED | §10.3 |
| m9 | Thiếu test tranh chấp chéo luồng cũ/mới | 3 ca: §3.5 #9, §4.6 #11, §7.6 #11 | §3.5, §4.6, §7.6 |
| m10 | Hội đồng đọc vĩnh viễn; test ghi mơ hồ | Mất quyền khi CLOSED/CANCELLED (G62); liệt kê endpoint ghi phải 403 | §1.1, §6.6 #7 |
| m11 | RECRUITING ẩn tên trong FR06 | **Không sửa**, ghi lý do G61 | §13 |
| m12 | Advising có ở DRAFT/RECRUITING | Thêm dòng rà soát vào §0.1 cho DC-01 | §0.1 |
