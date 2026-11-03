# API_GD45 – Hợp đồng API giai đoạn 4–5

- Task: T400 · FR09–FR14, FR24, FR27 (+ phần FR11/FR17 về file trong snapshot, FR16.4 nhắc GV) · NFR02, NFR04, NFR05, NFR06 · Người soạn: kien-truc-su · Ngày: 2026-11-03
- Trạng thái: **ĐỀ XUẤT – vòng 1** (chờ RV, FE, BE duyệt).
- Nguồn: `docs/DAC_TA.md` (mục 2, 4 FR27, 5, 7, 8), `design/API_GD2.md` (toàn bộ quy ước), `design/QD_ZOD.md` §4–§5, `design/UI.md` §2.7, `BANG_CONG_VIEC.md` T401–T406, T501–T505, code: `packages/shared/src/{transitions,schemas,csv,catalog}.js`, `apps/api/src/{app.js, lib/multipart.js, lib/tx.js, config/env.js, modules/topics/{stateMachine,service}.js}`, `apps/api/prisma/{schema.prisma, sql/after_init.sql}`, `reports/T608.md`.
- Hiện thực, theo thứ tự phụ thuộc trên bảng việc:
  - T401: §3 (mốc) + phần schema/migration §11b dùng chung cho GĐ4 (làm một migration duy nhất `gd4_execution`).
  - T402: §4 (tiến độ).
  - T403: §5 (tài liệu, upload, tải về), thư viện §11d, gắn `documentIds` vào snapshot (§5.6), nâng `cleanup-orphans.js` (§5.7).
  - T404: §6 (nhận xét, đánh giá mốc, kết quả cuối).
  - T405: §7 (đóng đề tài) + mở rộng `topicActionSchema`, `availableActions`, `TopicDetail` (§7.4).
  - T501: §8 (thông báo, gắn vào mọi endpoint theo bảng §8.3, endpoint nhắc hạn §8.4).
  - T502: lịch GitHub Actions gọi §8.4.
  - T503: §9 (thống kê + CSV).
  - T406 (UI GĐ4), T504 (UI GĐ5): dùng đúng tên trường ở tài liệu này.

Mọi quy ước của `API_GD2.md` §1 (đường dẫn, middleware, định dạng phản hồi, thời gian, khóa lạc quan, transaction, phân trang, khóa dòng `withLockTx`) và bảng mã lỗi §2 **giữ nguyên**. Tài liệu này chỉ ghi phần bổ sung. Chỗ ghi **"Giả định"** tham chiếu bảng §12 (đánh số tiếp từ G15 để không trùng G1–G14 của API_GD2).

---

## 1. Quy ước bổ sung

### 1.1 Quan hệ và trạng thái dùng trong GĐ4–5
Quan hệ lấy nguyên từ API_GD2 §1.1 (`isMember`, `isLeader`, `isCurrentAdvisor`, `isRequestedLecturer`, `inStaffScope`). Ký hiệu mới:

| Ký hiệu | Định nghĩa |
|---|---|
| `canReadExecution` | `isMember` · `isCurrentAdvisor` · (`inStaffScope` và `status ≠ DRAFT`). Dùng cho mọi endpoint **đọc** mốc, tiến độ, tài liệu, nhận xét, kết quả. Giống quyền đọc snapshot (API_GD2 §8.4). Người đã rời nhóm, GV cũ: GĐ6 (FR19, FR21) |
| `EXEC_OPEN` | `status = IN_PROGRESS`. Mọi thao tác **ghi** của §3–§6 chỉ chạy ở trạng thái này (trừ upload tài liệu đề cương, §5.2). Sai trạng thái → 409 `TOPIC_NOT_IN_PROGRESS` |
| ADMIN | 403 `FORBIDDEN` ở mọi endpoint §3–§7, §9 (FR25). §8.1 (thông báo của chính mình) cho **mọi vai trò kể cả ADMIN** (ADMIN nhận danh sách rỗng, 200 – QA không viết test 403 cho §8.1) |

Thứ tự kiểm ở mọi endpoint có `:id` đề tài (giống API_GD2 §8.1): tải đề tài + quan hệ → **quyền đọc** (403) → quyền ghi theo vai trò/quan hệ (403) → trạng thái (409) → `version` nếu có (409) → điều kiện riêng. Người ngoài luôn nhận 403, không bao giờ biết trạng thái.

Endpoint dạng `/api/milestones/:id`, `/api/progress/:id`, `/api/documents/:id`: tải bản ghi (404 nếu không có) → lấy `topicId` → áp đúng quy tắc trên với đề tài đó.

### 1.2 Khóa và transaction cho thao tác ghi GĐ4
- Mọi thao tác ghi §3–§6 chạy qua `withLockTx` (API_GD2 §1.8). **Câu khóa đầu tiên**: `SELECT id, status, version FROM "Topic" WHERE id = $1 FOR NO KEY UPDATE`, sau đó **kiểm lại `status = IN_PROGRESS` từ kết quả câu khóa** (không dùng trạng thái đã tải trước transaction).
- Lý do: `applyTransition` (REQUEST_CLOSE, CONFIRM_CLOSE, CLOSE_EXPIRED) lấy cùng khóa bằng `updateMany`. Nhờ vậy: không thể thêm mốc bắt buộc, đổi đánh giá, nhập kết quả **xen giữa** lúc kiểm điều kiện đóng và lúc chuyển trạng thái; sau khi đề tài sang WAITING_CLOSE/CLOSED, thao tác ghi đang chờ khóa đọc lại trạng thái và nhận 409.
- Các thao tác này **không tăng `Topic.version`** (không sửa hồ sơ đề tài). Đổi `version` sẽ làm nút chuyển trạng thái trên màn khác nhận 409 vô cớ. Điều kiện đóng luôn đọc lại trong `extra` (§7.2), nên không cần `version` để bảo vệ.
- Tranh chấp khóa → 409 `CONCURRENT_UPDATE`, `P2028` → 503 `SERVICE_BUSY` (đã có ở `errorHandler`).
- Mọi ghi kèm `AuditLog` trong cùng transaction (API_GD2 §1.6); tên `action` ghi ở từng endpoint. Thông báo (§8) cũng ghi **trong cùng transaction**.

### 1.3 Gọi kho lưu trữ ngoài (Cloudinary)
Không bao giờ gọi Cloudinary **bên trong** transaction có khóa (giữ khóa trong lúc chờ mạng). Thứ tự: kiểm quyền/trạng thái rẻ → upload + xác minh ngoài transaction → transaction ngắn ghi DB (kiểm lại trạng thái dưới khóa). Chi tiết §5.2.

### 1.4 Hằng số mới (export từ `packages/shared`, §11)
| Hằng | Giá trị | Dùng ở |
|---|---|---|
| `MILESTONE_MAX_PER_TOPIC` | 20 | §3.2 |
| `DOCUMENT_MAX_VERSIONS` | 50 (mỗi chuỗi phiên bản) | §5.2 |
| `DOCUMENT_STAGES` | `['PROPOSAL', 'MIDTERM', 'FINAL', 'OTHER']` | §5 |
| `DOCUMENT_FILE_TYPES` | `{ pdf: 'application/pdf', docx: '…wordprocessingml.document', pptx: '…presentationml.presentation', xlsx: '…spreadsheetml.sheet' }` | §5.2 (mime do **server** gán theo đuôi) |
| `DOWNLOAD_URL_TTL_SECONDS` | 300 (tham số hệ thống, DAC_TA mục 8) | §5.5 |
| `UPLOAD_HARD_MAX_BYTES` | 10 MB (trần multer, QD §4.3.4) | §5.2 |
| `NOTIFICATION_TYPES` + `NOTIFICATION_TYPE_LABEL` | §8.3 | §8 |
| `STATS_GROUP_BY` | `['lecturer', 'field', 'status', 'result', 'academicYear', 'round']` | §9 |

---

## 2. Mã lỗi mới (bổ sung bảng API_GD2 §2)

| HTTP | `code` | Thông điệp mặc định | Khi nào |
|---|---|---|---|
| 409 | `TOPIC_NOT_IN_PROGRESS` | Chỉ thực hiện được khi đề tài đang thực hiện | Ghi mốc/tiến độ/tài liệu mốc/nhận xét/kết quả khi `status ≠ IN_PROGRESS` (§1.1) |
| 409 | `MILESTONES_NOT_PASSED` | Còn mốc bắt buộc chưa Đạt | **Đã có** trong `stateMachine.js`. REQUEST_CLOSE, CONFIRM_CLOSE (§7). `details: { milestones: [{ id, name }] }` (tối đa 20) |
| 409 | `NO_FINAL_RESULT` | GVHD chưa nhập kết quả cuối và nhận xét tổng kết | **Đã có**. REQUEST_CLOSE, CONFIRM_CLOSE |
| 409 | `NO_REQUIRED_MILESTONE` | Đề tài chưa có mốc bắt buộc nào | REQUEST_CLOSE, CONFIRM_CLOSE khi tập mốc bắt buộc rỗng (G24) – tách khỏi `MILESTONES_NOT_PASSED` để thông điệp không gây hiểu nhầm |
| 409 | `CLOSE_CONDITIONS_MET` | Đề tài đã đủ điều kiện đóng, hãy chờ GVHD gửi đóng | CLOSE_EXPIRED khi điều kiện §7.2 thỏa (FR27.5) |
| 409 | `ROUND_NOT_ENDED` | Đợt chưa hết hạn, chưa thể đóng với kết quả Không đạt | CLOSE_EXPIRED khi `now < round.endAt` |
| 409 | `PROGRESS_LOCKED` | Cập nhật tiến độ đã được GVHD nhận xét, không sửa được nữa | FR10 |
| 409 | `MILESTONE_LIMIT` | Đề tài đã đủ số mốc tối đa (20) | §3.2 |
| 409 | `MILESTONE_ALREADY_PASSED` | Mốc đã Đạt; muốn thay đổi cần mở lại mốc | Nộp thêm bản, đánh giá lại mốc đã PASSED (mở lại: FR22, GĐ6) |
| 409 | `STALE_DOCUMENT` | Chỉ đánh giá mốc trên bản nộp mới nhất | §6.1 |
| 409 | `DOCUMENT_VERSION_LIMIT` | Đã đạt số phiên bản tối đa cho mục này | §5.2 |
| 503 | `STORAGE_UNAVAILABLE` | Kho lưu trữ file đang lỗi, vui lòng thử lại | Cloudinary lỗi/hết giờ/không xác minh được bản tải lên (§5.2), không ký được link (§5.5). `logger.warn`, không lộ thông điệp của Cloudinary |
| 401 | `UNAUTHORIZED` | (đã có) | Endpoint nhắc hạn sai/thiếu `CRON_SECRET` (§8.4) |

Quy ước `details` (API_GD2 §1.3) bổ sung dạng riêng: `MILESTONES_NOT_PASSED` → `{ milestones }`. Mã còn lại không có `details`.

Lỗi upload theo QD §4.2: `LIMIT_FILE_SIZE` → 413 `PAYLOAD_TOO_LARGE`; lỗi multer/busboy khác → 400 `VALIDATION_ERROR`; nội dung sai loại → 400 `VALIDATION_ERROR` `details: { file: 'Loại file không được hỗ trợ' }`.

---

## 3. Mốc thực hiện – FR09 (T401)

### 3.1 `MilestoneView`
```json
{ "id": "m1", "topicId": "t1", "order": 1, "name": "Báo cáo giữa kỳ", "output": "Báo cáo PDF ≤ 20 trang",
  "dueAt": "2027-03-01T16:59:59.000Z", "required": true, "evaluation": "PENDING", "version": 2,
  "isOverdue": false, "latestDocument": { "id": "d7", "version": 3, "uploadedAt": "…", "isLate": false } ,
  "dueChangeCount": 1, "createdAt": "…" }
```
- `evaluation`: `PENDING | PASSED | NEEDS_WORK` (enum `MilestoneEval`; nhãn FE: Chưa đánh giá / Đạt / Cần bổ sung – thêm `MILESTONE_EVAL_LABEL` vào shared).
- `isOverdue` = `evaluation ≠ PASSED && now > dueAt` (giờ server). Chỉ để hiển thị.
- `latestDocument`: bản READY có `version` lớn nhất của mốc, hoặc `null`.
- `version`: khóa lạc quan của **mốc** (cột mới, §11b), không phải của đề tài.

### 3.2 Endpoint
**`GET /api/topics/:id/milestones`** – `canReadExecution`. Không phân trang (≤ 20). Sắp `order` tăng dần. 200 `{ "items": [MilestoneView] }`. Lỗi: 403, 404.

**`POST /api/topics/:id/milestones`** – LECTURER `isCurrentAdvisor` · STAFF `inStaffScope` · `EXEC_OPEN` · khóa §1.2 · Ghi AuditLog `MILESTONE_CREATE` · thông báo §8.3 `MILESTONE_CREATED`.
Body `milestoneCreateSchema`:
- `name`: trim 1..300;
- `output` (đầu ra yêu cầu): trim 1..2000;
- `dueAt`: `isoDateTime` (ISO có offset, API_GD2 §1.4);
- `required`: boolean, mặc định `true`.

Kiểm: `dueAt > now` (400 `VALIDATION_ERROR` tại `dueAt`: "Hạn phải sau thời điểm hiện tại"); số mốc hiện có `< MILESTONE_MAX_PER_TOPIC` (đếm sau câu khóa; 409 `MILESTONE_LIMIT`). **Không** giới hạn `dueAt ≤ round.endAt`, vì FR27.5 cho cán bộ gia hạn mốc sau hạn đợt.
Ghi: `order = max(order) + 1`, `evaluation = PENDING`, `version = 0`, `createdById = me`.
201 `{ "milestone": MilestoneView }`. Lỗi: 400, 403, 404, 409 `TOPIC_NOT_IN_PROGRESS` / `MILESTONE_LIMIT`.

**`PATCH /api/milestones/:id`** – như POST (quyền theo đề tài của mốc) · `EXEC_OPEN` · khóa §1.2 · Ghi AuditLog `MILESTONE_UPDATE` (before/after `name`, `output`, `required`).
Body `milestoneUpdateSchema`: `version` (int ≥ 0) + ít nhất một trong `name`, `output`, `required`. **Không có `dueAt`** (đổi hạn phải qua endpoint riêng để luôn có lịch sử). Trường lạ → 400 (strict object).
Cập nhật `milestone.updateMany({ where: { id, version }, data: { …, version: { increment: 1 } } })`; `count = 0` → 409 `CONCURRENT_UPDATE`.
200 `{ "milestone": MilestoneView }`.

**`POST /api/milestones/:id/due-changes`** – như POST · `EXEC_OPEN` · khóa §1.2 · Ghi AuditLog `MILESTONE_DUE_CHANGE` · thông báo `MILESTONE_DUE_CHANGED`.
Body `milestoneDueChangeSchema`: `version`, `newDueAt` (`isoDateTime`), `reason` (trim 5..2000, dùng `reasonSchema`).
Kiểm: `newDueAt ≠ dueAt hiện tại` (400 tại `newDueAt`: "Hạn mới phải khác hạn cũ"); `newDueAt > now` (400). Cho phép rút ngắn hạn (vẫn có lịch sử) – Giả định G18.
Trong transaction: `updateMany where { id, version }` đặt `dueAt = newDueAt`, tăng `version` (409 nếu lệch) → tạo `MilestoneDueChange { oldDueAt, newDueAt, reason, changedById: me, changedAt: now }`. `oldDueAt` lấy từ dòng đã khóa, không từ client.
201 `{ "milestone": MilestoneView, "dueChange": DueChangeView }`.

**`GET /api/milestones/:id/due-changes`** – `canReadExecution`. 200 `{ "items": [DueChangeView] }`, sắp `changedAt` giảm dần:
```json
{ "id": "dc1", "oldDueAt": "…", "newDueAt": "…", "reason": "Gia hạn do nghỉ lễ", "changedBy": { "id": "l1", "fullName": "TS. …", "role": "LECTURER" }, "changedAt": "…" }
```

- **Không có endpoint xóa mốc** (NFR05). Mốc tạo nhầm: đặt `required = false` (Giả định G17).
- Đánh giá mốc không sửa qua PATCH; chỉ qua nhận xét bản nộp (§6.1). Mở lại mốc đã Đạt: FR22, API_GD6.
- Bảng `MilestoneDueChange` chỉ thêm (trigger §11b).

---

## 4. Cập nhật tiến độ – FR10 (T402)

### 4.1 `ProgressView`
```json
{ "id": "p1", "topicId": "t1", "author": { "id": "u1", "code": "SV001", "fullName": "…" },
  "done": "…", "issues": "…", "nextPlan": "…", "percent": 40, "selfReported": true,
  "lockedAt": null, "createdAt": "…", "updatedAt": "…",
  "feedbacks": [{ "id": "f3", "content": "…", "lecturer": { "fullName": "TS. …" }, "createdAt": "…" }] }
```
- `selfReported: true` luôn có, để UI hiện nhãn "Tự khai" cạnh % (FR10 "hiển thị rõ là tự khai").
- `lockedAt ≠ null` ⇔ đã có nhận xét của GVHD ⇔ không sửa được.

### 4.2 Endpoint
**`GET /api/topics/:id/progress`** – `canReadExecution`. Query `paginationQuery`. Sắp `createdAt` giảm dần. 200 `{ items: [ProgressView], page, pageSize, total }`. Mỗi item kèm nhận xét tiến độ (20 nhận xét **mới nhất**/item, sắp `createdAt` giảm dần).

**`POST /api/topics/:id/progress`** – STUDENT `isMember` · `EXEC_OPEN` · khóa §1.2 · limiter 30/15 phút/`req.user.id` · Ghi AuditLog `PROGRESS_CREATE`.
Body `progressCreateSchema`:
- `done` (việc đã làm): trim 1..3000;
- `issues` (khó khăn): trim 0..3000, mặc định `''`;
- `nextPlan` (kế hoạch tới): trim 1..3000;
- `percent`: `z.int().min(0).max(100)` (FR10).

Ghi `authorId = me`, `createdAt = now` (giờ server). 201 `{ "progress": ProgressView }`.

**`PATCH /api/progress/:id`** – STUDENT, **chính tác giả** (403 nếu khác, kể cả trưởng nhóm) và vẫn `isMember` · `EXEC_OPEN` · khóa §1.2 · Ghi AuditLog `PROGRESS_UPDATE` (before/after 4 trường).
Body `progressUpdateSchema` = partial của create, ít nhất 1 trường, strict.
Cập nhật **có điều kiện** `progressUpdate.updateMany({ where: { id, lockedAt: null }, data })`; `count = 0` → 409 `PROGRESS_LOCKED`. Điều kiện `lockedAt: null` ở cùng câu UPDATE với nhận xét (§6.2) bảo đảm: nhận xét và sửa đồng thời chỉ một bên thắng, không thể có bản sửa sau khi đã nhận xét (FR10).
Không khóa lạc quan theo `version` (chỉ một tác giả sửa); ghi đè giữa hai tab của cùng tác giả là chấp nhận được – Giả định G19.
200 `{ "progress": ProgressView }`.

- Không có endpoint xóa (NFR05).

---

## 5. Tài liệu, upload, tải về – FR11, FR24, FR17 (T403)

### 5.1 Mô hình
- Mỗi lần nộp là **một dòng `Document` mới**, không bao giờ ghi đè (FR11). Bảng `Document` chỉ thêm (trigger §11b).
- **Chuỗi phiên bản** (`version` tăng 1, 2, 3…):
  - tài liệu đề cương: khóa chuỗi `(topicId, stage = PROPOSAL)`, `milestoneId = null`;
  - tài liệu của mốc: khóa chuỗi `(topicId, milestoneId)`; `stage ∈ {MIDTERM, FINAL, OTHER}` chỉ là nhãn.
- Hai loại: `kind = FILE` (file trên Cloudinary, `publicId`) hoặc `kind = LINK` (`externalUrl`, sản phẩm lớn như mã nguồn, video – FR11). Cả hai cùng chuỗi phiên bản.
- `isLate` = `kind` bất kỳ, có mốc, và **thời điểm ghi DB (giờ server) > `milestone.dueAt`** lúc ghi (NFR06). Đề cương: luôn `false`. Gia hạn về sau không đổi nhãn bản cũ (bản ghi bất biến).
- Mọi dòng mới có `status = READY` (dòng chỉ được tạo **sau khi** đã xác minh trên kho, §5.2). Giá trị `UPLOADING` giữ trong enum để tương thích, không dùng cho dòng mới (Giả định G21).
- `publicId` **không bao giờ** trả ra client.

### 5.2 Upload file
**`POST /api/topics/:id/documents`** – multipart, field `file` + field văn bản `stage`, `milestoneId?`.
Quyền: STUDENT `isMember`. Trạng thái:
- `stage = PROPOSAL`: `status ∈ {DRAFT, NEEDS_REVISION}` (cùng điều kiện sửa hồ sơ FR05, G1) – không thì 409 `TOPIC_NOT_EDITABLE`;
- `stage ≠ PROPOSAL`: `EXEC_OPEN` (409 `TOPIC_NOT_IN_PROGRESS`), mốc thuộc đề tài (404 nếu không), `milestone.evaluation ≠ PASSED` (409 `MILESTONE_ALREADY_PASSED`).

Thứ tự middleware (QD §4.3.3, bắt buộc):
1. `requireAuth` → `requirePasswordChanged` (guard của router).
2. Limiter 20/15 phút/`req.user.id` (QD §4.6).
3. **Kiểm vai trò, quan hệ, trạng thái đề tài chỉ từ `:id`** (chưa đọc body): STUDENT `isMember` và `status ∈ {DRAFT, NEEDS_REVISION, IN_PROGRESS}` (không thì 403/409 `TOPIC_NOT_EDITABLE`). Người ngoài nhận 401/403 trước khi file vào RAM. Kiểm trạng thái **theo `stage`** và mốc (đoạn trên) làm ở bước 7, rồi lặp lại dưới khóa. Gắn `req.topicCfg = effectiveRoundConfig(round.config)`.
4. multer `^2.5.0`, `memoryStorage`, bọc `toUploadError` (QD §4.2), `limits`: `fileSize = UPLOAD_HARD_MAX_BYTES` (10 MB), `files: 1`, `fields: 10`, `fieldSize: 10 KB`, `parts: 12`, `fieldNameSize: 100`. `fileFilter` **đồng bộ**, chỉ lọc đuôi ∈ `DOCUMENT_FILE_TYPES`.
5. Kiểm nội dung trên `req.file.buffer` theo QD §4.3.6 (`%PDF-`; ZIP + `[Content_Types].xml` + `word/`/`ppt/`/`xl/`, không giải nén).
6. `validate(documentUploadFieldsSchema)` cho field văn bản: `stage` enum `DOCUMENT_STAGES`, `milestoneId?` idSchema; refine: `PROPOSAL` ⇔ không có `milestoneId` (400 tại `milestoneId`).
7. Handler.

Kiểm theo đợt (sau multer): đuôi ∈ `cfg.allowedFileTypes` (400 `VALIDATION_ERROR` "Loại file không được hỗ trợ"); `size ≤ cfg.maxFileSizeMB × 1 048 576` (413 `PAYLOAD_TOO_LARGE`). `fileName` hiển thị = tên gốc đã làm sạch (bỏ đường dẫn, ký tự điều khiển, `\ / : * ? " < > |`; ≤ 200 ký tự, giữ đuôi); rỗng sau khi làm sạch → `tai-lieu.<đuôi>`. `mimeType` = `DOCUMENT_FILE_TYPES[đuôi]` (không tin client).

Xử lý:
1. **Ngoài transaction**: sinh `publicId = <CLOUDINARY_FOLDER>/topics/<topicId>/<cuid>.<đuôi>`; gọi `storage.upload(buffer, { publicId })` với `resource_type: 'raw'`, `type: 'authenticated'`, `overwrite: false` (QD §4.3.8). Hết giờ 30 s.
2. **Xác minh** (FR11 "được xác minh tồn tại trên kho"): response của Cloudinary phải có `public_id === publicId`, `type === 'authenticated'`, `resource_type === 'raw'`, `bytes === buffer.length`. Sai/lỗi → 503 `STORAGE_UNAVAILABLE`, gọi `storage.destroy(publicId)` cố gắng một lần (lỗi bỏ qua; job dọn §5.7 lo phần còn lại). Không ghi DB.
3. **Transaction** `withLockTx`, khóa Topic (§1.2); kiểm lại trạng thái (và `milestone.evaluation` nếu có mốc) dưới khóa; đếm phiên bản của chuỗi `< DOCUMENT_MAX_VERSIONS` (409 `DOCUMENT_VERSION_LIMIT`); `version = max + 1`; `isLate` tính bằng `now()` lúc này; tạo `Document { kind: FILE, status: READY, … }`; AuditLog `DOCUMENT_UPLOAD` (`after`: `documentId`, `stage`, `milestoneId`, `version`, `sizeBytes`, `isLate`); thông báo `DOCUMENT_SUBMITTED` (chỉ tài liệu mốc).
4. Transaction lỗi (409/503) → `storage.destroy(publicId)` cố gắng một lần rồi ném lỗi gốc.

Unique index `document_chain_version` (§11b) là lưới an toàn cho `version`; vi phạm → 409 `DUPLICATE` (không xảy ra khi khóa Topic đúng).

201 `{ "document": DocumentView }`. Lỗi: 400, 403, 404, 409 (`TOPIC_NOT_EDITABLE`, `TOPIC_NOT_IN_PROGRESS`, `MILESTONE_ALREADY_PASSED`, `DOCUMENT_VERSION_LIMIT`, `CONCURRENT_UPDATE`), 413, 429, 503 `STORAGE_UNAVAILABLE`.

### 5.3 Nộp bằng link
**`POST /api/topics/:id/documents/links`** – JSON · quyền, trạng thái, limiter (chung bộ đếm với §5.2) như §5.2 · khóa §1.2 · Ghi AuditLog `DOCUMENT_LINK` · thông báo như §5.2.
Body `documentLinkSchema`:
- `stage`, `milestoneId?` (như §5.2);
- `title`: trim 1..200 (lưu vào `fileName`);
- `url`: `z.string().trim().max(2000).pipe(z.url({ protocol: /^https$/, error: 'Chỉ nhận đường dẫn https' }))`.

Không xác minh nội dung link (là dịch vụ ngoài) – Giả định G22. `mimeType`, `sizeBytes`, `publicId` = `null`.
201 `{ "document": DocumentView }`.

### 5.4 Danh sách
**`GET /api/topics/:id/documents`** – `canReadExecution`; thêm `isRequestedLecturer` **chỉ với `stage=PROPOSAL`** (GV được đề nghị cần xem đề cương để quyết định, Giả định G23).
Query `documentListQuerySchema`: `milestoneId?`, `stage?` enum, `latestOnly?` enum `'true'|'false'` (mặc định `false`). Không phân trang (≤ 20 mốc × 50 bản; thực tế nhỏ), tối đa 1.000 dòng. Sắp: `milestone.order`, rồi `version` giảm dần.
```json
{ "items": [{ "id": "d7", "topicId": "t1", "milestoneId": "m1", "stage": "MIDTERM", "kind": "FILE", "version": 3,
  "fileName": "bao-cao-giua-ky.pdf", "mimeType": "application/pdf", "sizeBytes": 812345, "externalUrl": null,
  "isLate": true, "isLatest": true, "uploadedBy": { "id": "u1", "fullName": "…" }, "uploadedAt": "…", "feedbackCount": 1 }] }
```
`DocumentView` = một phần tử ở trên. `externalUrl` chỉ có với `kind = LINK`. Không có `publicId`, không có URL tải.

### 5.5 Tải về bằng URL ký – FR24
**`POST /api/documents/:id/download-url`** – quyền như §5.4 với đề tài của tài liệu, **kiểm mỗi lần gọi** · limiter 60/15 phút/`req.user.id` · `Cache-Control: no-store` · Ghi AuditLog `DOCUMENT_DOWNLOAD` (`entityType: 'Document'`, `after: { topicId, version }`, `ip`) – đây là "lịch sử lượt tải" (FR24). Dùng POST vì có ghi và không được cache/prefetch.
Body rỗng (`emptyBodySchema`).
- `kind = LINK` → 400 `VALIDATION_ERROR` "Tài liệu dạng link, mở trực tiếp đường dẫn" (link không cần ký).
- `kind = FILE` → `storage.signedDownloadUrl(publicId, { expiresAt: now + DOWNLOAD_URL_TTL_SECONDS, attachment: true })`, tức `cloudinary.utils.private_download_url(publicId, '', { resource_type: 'raw', type: 'authenticated', expires_at, attachment: true })`. Chế độ `attachment` bắt buộc (M2 review T199: trình duyệt tải về, không hiển thị nội tuyến dưới origin của Cloudinary).
- **Cấm** dùng URL giao hàng `res.cloudinary.com/…/authenticated/s--sig--/…` (chữ ký không hết hạn = URL cố định, trái FR24).

200 `{ "url": "https://api.cloudinary.com/v1_1/…/raw/download?…", "expiresAt": "2026-11-03T02:05:00.000Z" }`. Lỗi: 403, 404, 400, 429, 503 `STORAGE_UNAVAILABLE`.
FE: gọi ngay khi bấm "Tải về", rồi `window.location.assign(url)`; không lưu `url`.

### 5.6 File trong snapshot – FR17 (sửa T212a)
- SUBMIT_FOR_REVIEW, RESUBMIT: trong `extra` của `applyTransition` (dưới khóa Topic), `payload.documentIds = [id của bản PROPOSAL mới nhất]` hoặc `[]` nếu chưa có. Bản ghi `Document` bất biến nên snapshot không đổi theo thời gian.
- Upload đề cương chỉ ở DRAFT/NEEDS_REVISION, còn SUBMIT/RESUBMIT đi từ HAS_ADVISOR/NEEDS_REVISION: tài liệu mới không thể chen vào giữa lúc tạo snapshot vì cùng khóa Topic.
- `GET /api/topics/:id/submissions/:seq` thêm `payload.documents: [{ id, fileName, kind, version, uploadedAt }]` (dựng từ `documentIds`). Tải qua §5.5 (quyền đọc snapshot ⊂ quyền §5.4).
- `submission-diff`: `changes.documents: boolean` (khác tập `documentIds`).

### 5.7 Dọn file mồ côi – FR26 (nâng `cleanup-orphans.js` của T608)
- Liệt kê tài nguyên Cloudinary `resource_type: 'raw'`, `type: 'authenticated'`, `prefix: <CLOUDINARY_FOLDER>/`, phân trang `next_cursor`.
- Mồ côi = `publicId` không có dòng `Document` nào **và** `created_at` cũ hơn 24 giờ. Không bao giờ xóa `publicId` có trong `Document` (tức mọi tài liệu đã nộp).
- Mặc định dry-run; `--apply` mới xóa (`storage.destroy`), mỗi file xóa ghi AuditLog `STORAGE_ORPHAN_DELETE` (`actorId: null`, `entityType: 'StorageObject'`, `entityId: publicId`, `after: { bytes, createdAt }`).
- Không xóa dòng DB nào (trigger §11b chặn).

### 5.8 Bộ chuyển đổi kho (`apps/api/src/lib/storage.js`)
Interface tiêm vào app để test không cần Cloudinary: `upload(buffer, { publicId }) → { public_id, bytes, type, resource_type }`, `destroy(publicId)`, `signedDownloadUrl(publicId, { expiresAt, attachment })`, `list({ prefix, cursor })`. Bản thật dùng SDK `cloudinary` đọc `CLOUDINARY_URL`; test dùng bản giả trong bộ nhớ (đếm lần gọi, giả lỗi). Thiếu `CLOUDINARY_URL` ở production → `loadEnv` báo lỗi khi khởi động; ở dev/test → bản giả.

---

## 6. Nhận xét, đánh giá mốc, kết quả cuối – FR12 (T404)

Chỉ **GVHD hiện hành** (LECTURER `isCurrentAdvisor`) ghi; STAFF chỉ đọc (FR12). `EXEC_OPEN`. Khóa §1.2. Bảng `Feedback` chỉ thêm (trigger §11b) – nhận xét giữ tên người viết kể cả khi thay GV (FR19).

### 6.1 Nhận xét bản nộp + đánh giá mốc
**`POST /api/documents/:id/feedbacks`** – Ghi AuditLog `FEEDBACK_CREATE` (+ `MILESTONE_EVALUATE` nếu có `evaluation`) · thông báo `FEEDBACK_CREATED`.
Body `documentFeedbackSchema`:
- `content`: trim 1..2000;
- `evaluation?`: enum `PASSED | NEEDS_WORK` (FR12 "Đạt hoặc Cần bổ sung"); chỉ hợp lệ khi tài liệu thuộc mốc (đề cương → 400 tại `evaluation`);
- `milestoneVersion?`: int ≥ 0, **bắt buộc khi có `evaluation`** (khóa lạc quan của mốc).

Kiểm (sau câu khóa Topic):
- Tài liệu thuộc đề tài, `status = IN_PROGRESS`.
- Nhận xét không đánh giá: được trên **mọi phiên bản** (gắn đúng `documentId`, FR12 "nhận xét gắn đúng bản nộp").
- Có `evaluation`:
  - tài liệu phải là bản mới nhất của chuỗi mốc (409 `STALE_DOCUMENT`) – đánh giá luôn trên bản hiện hành;
  - `milestone.evaluation ≠ PASSED` (409 `MILESTONE_ALREADY_PASSED`; đổi PASSED → khác là FR22, GĐ6);
  - `milestone.updateMany({ where: { id, version: milestoneVersion }, data: { evaluation, version: { increment: 1 } } })`, `count = 0` → 409 `CONCURRENT_UPDATE`.

Ghi `Feedback { topicId, documentId, milestoneId, lecturerId: me, content, evaluation }`.
201 `{ "feedback": FeedbackView, "milestone": MilestoneView | null }`.

```json
{ "id": "f1", "target": "DOCUMENT", "documentId": "d7", "documentVersion": 3, "milestoneId": "m1", "progressUpdateId": null,
  "content": "…", "evaluation": "NEEDS_WORK", "lecturer": { "id": "l1", "fullName": "TS. …" }, "createdAt": "…" }
```

### 6.2 Nhận xét tiến độ
**`POST /api/progress/:id/feedbacks`** – Ghi AuditLog `FEEDBACK_CREATE` · thông báo `FEEDBACK_CREATED`.
Body `progressFeedbackSchema { content: trim 1..2000 }`.
Trong transaction: `progressUpdate.updateMany({ where: { id, lockedAt: null }, data: { lockedAt: now } })` (đã khóa thì giữ nguyên, không lỗi) → tạo `Feedback { progressUpdateId, … }`. Từ đây tiến độ không sửa được (FR10, §4.2).
201 `{ "feedback": FeedbackView, "progress": ProgressView }`.

### 6.3 Đọc nhận xét
**`GET /api/topics/:id/feedbacks`** – `canReadExecution`. Query: `documentId?`, `milestoneId?`, `progressUpdateId?`, `page`, `pageSize`. Sắp `createdAt` giảm dần. `{ items: [FeedbackView], page, pageSize, total }`.

### 6.4 Kết quả cuối có phiên bản
**`POST /api/topics/:id/results`** – LECTURER `isCurrentAdvisor` · `EXEC_OPEN` · khóa §1.2 · Ghi AuditLog `RESULT_CREATE` (before/after `result`, `version`).
Body `finalResultSchema`:
- `result`: enum `FINAL_RESULT` (4 mức, G12 đã xác nhận);
- `summary` (nhận xét tổng kết, bắt buộc – FR12): trim 20..5000;
- `expectedVersion`: int ≥ 0 – số phiên bản kết quả hiện hành mà GV đang thấy (`0` nếu chưa có). Lệch → 409 `CONCURRENT_UPDATE`.

Trong transaction: đặt bản `isCurrent = true` cũ thành `false` (**trước**), rồi tạo `ResultVersion { version: max + 1, isCurrent: true, createdById: me, reason: null }`. Thứ tự này bắt buộc vì partial unique index `result_one_current` (§11b) không deferrable. GV được nhập lại nhiều lần trước khi gửi đóng; mỗi lần là phiên bản mới, không xóa bản cũ.
201 `{ "result": ResultView }`.

**`GET /api/topics/:id/results`** – `canReadExecution`. 200 `{ "current": ResultView | null, "items": [ResultView] }` (mọi phiên bản, `version` giảm dần).
```json
{ "id": "rv2", "version": 2, "result": "GOOD", "summary": "…", "reason": null, "isCurrent": true,
  "createdBy": { "id": "l1", "fullName": "TS. …", "role": "LECTURER" }, "createdAt": "…" }
```
Sau khi CLOSED: chỉ sửa qua FR23 (STAFF, API_GD6, T604). `POST …/results` trả 409 `TOPIC_NOT_IN_PROGRESS`; `GET …/results` vẫn đọc được ở mọi trạng thái.

---

## 7. Đóng đề tài – FR27 (T405)

### 7.1 Mở rộng `POST /api/topics/:id/actions` (API_GD2 §8.1)
Thêm 4 nhánh vào `topicActionSchema` (không đổi TRANSITIONS):
| `action` | Trường thêm |
|---|---|
| `REQUEST_CLOSE` | `version` |
| `RETURN_TO_ADVISOR` | `version`, `reason` (trim 5..2000) |
| `CONFIRM_CLOSE` | `version` |
| `CLOSE_EXPIRED` | `version`, `reason` (trim 5..2000) |

`CANCEL` vẫn ngoài union (→ 400) cho tới T602/API_GD6. Xử lý chung giữ nguyên 6 bước của API_GD2 §8.1. Response 200 `{ "topic": TopicDetail }`.

### 7.2 Điều kiện đóng – luôn theo đánh giá hiện hành
Định nghĩa (dùng chung, `apps/api/src/modules/topics/closeConditions.js`, đọc bằng `tx` truyền vào):
- `requiredMilestonesPassed` = mọi `Milestone` có `required = true` của đề tài đều `evaluation = PASSED`. **Không có mốc bắt buộc nào → `false`** (Giả định G24: đề tài phải có ít nhất một mốc bắt buộc mới được đóng; tránh đóng "rỗng"), lỗi riêng 409 `NO_REQUIRED_MILESTONE` (sửa nhánh ở `stateMachine.js:41`: ctx thêm `requiredMilestoneCount`).
- `closeConditionsMet` = `requiredMilestonesPassed && hasFinalResult` (dùng cho CLOSE_EXPIRED).
- `hasFinalResult` = có `ResultVersion` `isCurrent = true`, `summary` không rỗng, `createdById` = GVHD hiện hành (Giả định G25).

Áp dụng:
- Bước 5 (trước transaction, rẻ): tính rồi đưa vào `ctx` cho `checkTransition` (đã có nhánh `MILESTONES_NOT_PASSED` / `NO_FINAL_RESULT`) để trả lỗi sớm.
- **Bắt buộc tính lại trong `extra`** (sau `updateMany` đã giữ khóa Topic) cho REQUEST_CLOSE và CONFIRM_CLOSE; sai → ném cùng mã lỗi, transaction rollback. Đây là "kiểm tra lại ngay lúc đóng" (FR27.3). Nhờ khóa §1.2, không thao tác GĐ4/FR22 nào chen giữa được.
- `details` của `MILESTONES_NOT_PASSED` liệt kê mốc chưa Đạt.

### 7.3 Từng action
| Action | Ai | Điều kiện thêm | Ghi thêm trong cùng transaction | Thông báo |
|---|---|---|---|---|
| `REQUEST_CLOSE` (IN_PROGRESS → WAITING_CLOSE) | LECTURER `currentAdvisorOnly` | §7.2 | StatusHistory | `CLOSE_REQUESTED` → cán bộ khoa |
| `RETURN_TO_ADVISOR` (WAITING_CLOSE → IN_PROGRESS) | STAFF `inStaffScope` | `reason` | StatusHistory (reason). Kết quả, mốc giữ nguyên; GV sửa bằng phiên bản kết quả mới | `CLOSE_RETURNED` → GVHD, thành viên |
| `CONFIRM_CLOSE` (WAITING_CLOSE → CLOSED) | STAFF `inStaffScope` | §7.2 kiểm lại | StatusHistory. Không tạo kết quả mới | `TOPIC_CLOSED` → GVHD, thành viên |
| `CLOSE_EXPIRED` (IN_PROGRESS → CLOSED, `forcesFail`) | STAFF `inStaffScope` | `now ≥ round.endAt` (409 `ROUND_NOT_ENDED`); `reason`; **đề tài chưa đủ điều kiện** – `closeConditionsMet` → 409 `CLOSE_CONDITIONS_MET`, kiểm sớm ở bước 5 và **tính lại trong `extra` dưới khóa** | StatusHistory (reason); bản kết quả hiện hành cũ (nếu có) → `isCurrent = false`; tạo `ResultVersion { result: FAIL, summary: 'Đóng do hết hạn đợt: ' + reason, reason, createdById: staff, isCurrent: true }` | `TOPIC_CLOSED` → GVHD, thành viên |

- `CLOSE_EXPIRED` **bị chặn** khi đề tài đã đủ điều kiện (FR27.5 "chưa đủ điều kiện"; G26 đã chốt). Đề tài kẹt vì GVHD không gửi đóng: đi đường thay GV (FR19) hoặc gia hạn mốc.
- **Rủi ro đã biết – bỏ cờ bắt buộc** (m3): GVHD `PATCH required=false` trên mốc chưa PASSED → thông báo `MILESTONE_REQUIRED_REMOVED` cho cán bộ khoa (§8.3); `closeReadiness.requiredRemovedCount` = số mốc chưa PASSED đã bị bỏ cờ (đọc từ AuditLog `MILESTONE_UPDATE`), màn xác nhận đóng của cán bộ hiện số này.
- Gia hạn (lựa chọn thay thế của FR27.5) = đổi hạn mốc §3.2; cán bộ được phép vì `inStaffScope`.
- Sau CLOSED: mọi ghi §3–§6 trả 409 (`EXEC_OPEN`). Đề tài đóng đạt (kết quả hiện hành ∈ EXCELLENT/GOOD/PASS) tự xuất hiện ở `/api/repository` (đã có, T213b); mọi đề tài CLOSED vào kho so FR06 (G14).
- WAITING_CLOSE: mọi ghi §3–§6 bị chặn, nên cán bộ xác nhận đúng dữ liệu GV đã gửi.

### 7.4 Thay đổi `TopicDetail` (API_GD2 §5.1)
- `availableActions`: thay `GD2_ACTIONS` bằng `ENABLED_ACTIONS` = GĐ2 + `REQUEST_CLOSE`, `RETURN_TO_ADVISOR`, `CONFIRM_CLOSE`, `CLOSE_EXPIRED` (vẫn chưa có `CANCEL`). Vẫn **không** xét điều kiện dữ liệu.
- `round` thêm `endAt`, `ended: now ≥ endAt` (FE hiện nút "Đóng – Không đạt" có cảnh báo khi `ended`).
- Thêm `currentResult: { version, result, createdAt } | null` – trả cho mọi người có quyền xem (không có `summary`; xem đủ ở §6.4).
- Thêm `closeReadiness: { requiredMilestonesPassed, hasFinalResult, requiredMilestoneCount, pendingMilestones: number, requiredRemovedCount: number } | null` – chỉ khi `status ∈ {IN_PROGRESS, WAITING_CLOSE}` và người xem là `isCurrentAdvisor` hoặc `inStaffScope`; còn lại `null`.
- `permissions` thêm:
  - `manageMilestones` = (`isCurrentAdvisor` hoặc `inStaffScope`) && `IN_PROGRESS`;
  - `addProgress` = `isMember` && `IN_PROGRESS`;
  - `uploadProposal` = `isMember` && `status ∈ {DRAFT, NEEDS_REVISION}`;
  - `uploadMilestone` = `isMember` && `IN_PROGRESS`;
  - `giveFeedback` = `enterResult` = `isCurrentAdvisor` && `IN_PROGRESS`;
  - `readExecution` = `canReadExecution`.

---

## 8. Thông báo – FR13 (T501, lịch: T502)

### 8.1 Endpoint (mọi vai trò đã đăng nhập, chỉ thông báo của **chính mình**)
**`GET /api/notifications`** – Query `notificationListQuerySchema`: `unread?` enum `'true'|'false'`, `page`, `pageSize`. Sắp `createdAt` giảm dần.
```json
{ "items": [{ "id": "n1", "type": "FEEDBACK_CREATED", "title": "GVHD đã nhận xét bản nộp \"Báo cáo giữa kỳ\" (NCKH-2026-0007)",
  "link": "/de-tai/t1/tai-lieu", "readAt": null, "createdAt": "…" }], "page": 1, "pageSize": 20, "total": 3, "unreadCount": 2 }
```
**`GET /api/notifications/unread-count`** → `{ "count": 2 }` (chuông, FE `refetchInterval` 60 s, dừng khi tab ẩn).
**`POST /api/notifications/:id/read`** → 204. `notification.updateMany({ where: { id, userId: me, readAt: null }, data: { readAt: now } })`. Không phải của mình hoặc không tồn tại → **404** (ngoại lệ có chủ đích so với API_GD2 §2: thông báo là dữ liệu cá nhân, không có quan hệ đề tài; không cho dò id của người khác). Đã đọc → 204 (idempotent).
**`POST /api/notifications/read-all`** → 204.
Không ghi AuditLog (không phải dữ liệu nghiệp vụ). Không có endpoint xóa.

### 8.2 Cách ghi (helper `notify(tx, items)`, `apps/api/src/modules/notifications/notify.js`)
- `items: [{ userId, type, title, link, dedupeKey }]`; gọi `tx.notification.createMany({ data, skipDuplicates: true })` **trong cùng transaction** với sự kiện. Rollback sự kiện thì không có thông báo; không có thông báo "ma".
- Chống trùng: unique `(userId, dedupeKey)` đã có. Gọi lại cùng sự kiện (thử lại, cron chạy hai lần) không tạo thêm (FR13).
- `dedupeKey` ≤ 200 ký tự, dạng `<TYPE>:<id thực thể>[:<phân biệt>]`. Với sự kiện chuyển trạng thái lặp lại được (REQUEST_CLOSE sau khi trả lại…), phân biệt bằng **`topic.version` sau chuyển** (duy nhất mỗi lần chuyển).
- Loại người gửi khỏi danh sách nhận (không tự báo cho mình). Bỏ user `isLocked`.
- `title` tiếng Việt, ≤ 300 ký tự, chỉ chứa mã + tên đề tài/mốc mà **người nhận đã có quyền xem** (không lộ dữ liệu ngoài phạm vi, FR08). Ví dụ: lời mời được phép chứa tên đề tài vì `GET /api/invitations` đã trả `topic.title`. Không đưa lý do từ chối, nội dung nhận xét vào `title` (người nhận mở `link` để xem, quyền kiểm lại ở đó).
- `link`: đường dẫn tương đối của web. Đã có trong `routes.jsx`: `/de-tai/:id`, `/de-tai/:id/nhom`, `/loi-moi`, `/de-nghi-huong-dan`, `/xet-duyet/:id`. **Route cần thêm ở T406**: `/de-tai/:id/moc`, `/de-tai/:id/tien-do`, `/de-tai/:id/tai-lieu`; T504: `/thong-bao`, `/thong-ke`.
- "Cán bộ khoa" của đề tài = user `role STAFF`, không khóa, có `StaffScope.facultyId = topic.facultyId`.

### 8.3 Danh sách sự kiện (bắt buộc cho T501)
| `type` | Endpoint / nguồn (task gốc) | Người nhận | `dedupeKey` | `link` |
|---|---|---|---|---|
| `INVITATION_RECEIVED` | `POST /api/topics/:id/invitations` (T208) | Người được mời | `INVITATION_RECEIVED:<invitationId>` | `/loi-moi` |
| `INVITATION_ACCEPTED` | `POST /api/invitations/:id/accept` (T208) | Trưởng nhóm | `INVITATION_ACCEPTED:<invitationId>` | `/de-tai/:id/nhom` |
| `INVITATION_DECLINED` | `POST /api/invitations/:id/decline` (T208) | Trưởng nhóm | `INVITATION_DECLINED:<invitationId>` | `/de-tai/:id/nhom` |
| `ADVISOR_REQUESTED` | action `REQUEST_ADVISOR` (T210) | GV được đề nghị | `ADVISOR_REQUESTED:<advisorRequestId>` | `/de-nghi-huong-dan` |
| `ADVISOR_ACCEPTED` | action `ACCEPT_ADVISING` (T210) | Thành viên | `ADVISOR_RESPONSE:<advisorRequestId>` | `/de-tai/:id` |
| `ADVISOR_DECLINED` | action `DECLINE_ADVISING` (T210) | Thành viên | `ADVISOR_RESPONSE:<advisorRequestId>` | `/de-tai/:id` |
| `ADVISOR_REQUEST_WITHDRAWN` | action `WITHDRAW_ADVISOR_REQUEST` (T210) | GV được đề nghị | `ADVISOR_REQUEST_WITHDRAWN:<advisorRequestId>` | `/de-nghi-huong-dan` |
| `REVIEW_DECIDED` | action `APPROVE` / `REQUEST_REVISION` / `REJECT` (T212a) – "kết quả xét duyệt" | Thành viên, GVHD hiện hành | `REVIEW_DECIDED:<submissionId>` | `/de-tai/:id` |
| `MILESTONE_CREATED` | `POST /api/topics/:id/milestones` (T401) | Thành viên (+ GVHD nếu cán bộ tạo) | `MILESTONE_CREATED:<milestoneId>` | `/de-tai/:id/moc` |
| `MILESTONE_REQUIRED_REMOVED` | `PATCH /api/milestones/:id` đổi `required` true → false khi `evaluation ≠ PASSED` (T401, §7.3 rủi ro m3) | Cán bộ khoa | `MILESTONE_REQUIRED_REMOVED:<milestoneId>:v<milestone.version>` | `/de-tai/:id/moc` |
| `MILESTONE_DUE_CHANGED` | `POST /api/milestones/:id/due-changes` (T401) | Thành viên, GVHD | `MILESTONE_DUE_CHANGED:<dueChangeId>` | `/de-tai/:id/moc` |
| `DOCUMENT_SUBMITTED` | `POST …/documents`, `…/documents/links` khi có mốc (T403) | GVHD hiện hành | `DOCUMENT_SUBMITTED:<documentId>` | `/de-tai/:id/tai-lieu` |
| `FEEDBACK_CREATED` | `POST /api/documents/:id/feedbacks`, `POST /api/progress/:id/feedbacks` (T404) – "nhận xét mới" | Thành viên | `FEEDBACK_CREATED:<feedbackId>` | `/de-tai/:id/tai-lieu` hoặc `/de-tai/:id/tien-do` |
| `RESULT_ENTERED` | `POST /api/topics/:id/results` (T404) | Thành viên | `RESULT_ENTERED:<resultVersionId>` | `/de-tai/:id` |
| `CLOSE_REQUESTED` | action `REQUEST_CLOSE` (T405) | Cán bộ khoa | `CLOSE_REQUESTED:<topicId>:v<version>` | `/de-tai/:id` |
| `CLOSE_RETURNED` | action `RETURN_TO_ADVISOR` (T405) | GVHD, thành viên | `CLOSE_RETURNED:<topicId>:v<version>` | `/de-tai/:id` |
| `TOPIC_CLOSED` | action `CONFIRM_CLOSE`, `CLOSE_EXPIRED` (T405) | GVHD, thành viên | `TOPIC_CLOSED:<topicId>` | `/de-tai/:id` |
| `MILESTONE_DUE_SOON` | Cron §8.4 – "nhắc trước hạn X ngày" | Thành viên | `MILESTONE_DUE_SOON:<milestoneId>:<dueAt ISO>` | `/de-tai/:id/moc` |
| `MILESTONE_OVERDUE` | Cron §8.4 – "quá hạn" | Thành viên, GVHD | `MILESTONE_OVERDUE:<milestoneId>:<dueAt ISO>` | `/de-tai/:id/moc` |
| `ADVISOR_REQUEST_REMINDER` | Cron §8.4 (FR16.4) | GV được đề nghị, cán bộ khoa | `ADVISOR_REQUEST_REMINDER:<advisorRequestId>` | `/de-nghi-huong-dan` |

Không thông báo: hủy lời mời, gửi/gửi lại xét duyệt (cán bộ xem hàng chờ), sửa nháp, đổi trưởng nhóm, kiểm tra trước, sửa tiến độ, sửa mốc (PATCH), tải về. Lý do: ngoài danh sách FR13, tránh nhiễu. `dueAt` nằm trong khóa nhắc hạn nên đổi hạn sẽ nhắc lại theo hạn mới (đúng ý "nhắc trước hạn"), còn cùng hạn thì không bao giờ nhắc hai lần.

### 8.4 Endpoint nhắc hạn – bộ lập lịch ngoài gọi
**`POST /api/cron/reminders`** – **không** qua `guard` người dùng; mount riêng `/api/cron`.
Thứ tự: limiter 10/15 phút theo IP (`ipKeyGenerator`) → kiểm bí mật → handler.
- `CRON_SECRET` chưa cấu hình → 404 `NOT_FOUND` (endpoint coi như không tồn tại).
- Header `Authorization: Bearer <CRON_SECRET>`. So sánh **thời gian hằng**: `timingSafeEqual(sha256(nhận), sha256(CRON_SECRET))` (băm trước để độ dài bằng nhau). Sai/thiếu → 401 `UNAUTHORIZED`. Không log giá trị header.
- `env.js`: `CRON_SECRET` tùy chọn, nếu có thì `.min(32)`; `NODE_ENV=production` mà thiếu → cảnh báo log khi khởi động (không chặn, vì có thể chưa bật lịch).
- Body rỗng. Thời gian = giờ server (NFR06). Không nhận tham số thời gian từ client.

Xử lý (mỗi phần một transaction ngắn, giới hạn 5.000 dòng mỗi phần; chạm trần → `logger.warn`, lần chạy sau làm tiếp vì đã chống trùng):
1. **Mốc "đang chờ nộp"**: đề tài `IN_PROGRESS`, `milestone.evaluation ≠ PASSED`, và **không** có `Document` của mốc với `uploadedAt` sau lần đánh giá `NEEDS_WORK` gần nhất (chưa có đánh giá thì: không có `Document` nào).
   - `now < dueAt ≤ now + cfg.dueReminderDays × 24 h` → `MILESTONE_DUE_SOON`.
   - `dueAt ≤ now` → `MILESTONE_OVERDUE`.
2. **Đề nghị hướng dẫn chưa phản hồi** (FR16.4 "nhắc một lần"): `AdvisorRequest PENDING`, `remindedAt IS NULL`, `createdAt ≤ now − cfg.advisorReminderDays × 24 h` → `advisorRequest.updateMany({ where: { id, remindedAt: null }, data: { remindedAt: now } })`; chỉ khi `count = 1` mới tạo `ADVISOR_REQUEST_REMINDER`. Hai lần chạy chồng nhau chỉ nhắc một lần.
- `cfg` = `effectiveRoundConfig` của đợt chứa đề tài.

200 + `Cache-Control: no-store`:
```json
{ "ranAt": "2026-11-03T00:00:05.000Z", "dueSoon": 4, "overdue": 1, "advisorReminders": 2, "notificationsCreated": 11 }
```
Lỗi: 401, 404, 429, 503.

T502: `.github/workflows/reminders.yml`, `schedule: '0 0 * * *'` (07:00 giờ Việt Nam) + `workflow_dispatch`; `curl -fsS --retry 3 --retry-delay 30 --max-time 120 -X POST -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" "$API_URL/api/cron/reminders"` (Render ngủ thì lần gọi đầu đánh thức server). Không phụ thuộc tiến trình API chạy liên tục (FR13).

---

## 9. Thống kê và CSV – FR14 (T503)

### 9.1 Phạm vi dữ liệu (áp ở `WHERE`, trước gom nhóm)
| Vai trò | Tập đề tài |
|---|---|
| STAFF | `facultyId` trong phạm vi (lọc `facultyId` ngoài phạm vi → 403) |
| LECTURER | Đề tài mình là GVHD **hiện hành** (`Advising.endAt IS NULL`) – FR14 "chỉ đề tài mình hướng dẫn" |
| STUDENT, ADMIN | 403 |

Luôn **loại DRAFT** (G6). Gồm cả REJECTED, CANCELLED (FR20 "vẫn có trong thống kê"). Bộ lọc chỉ thu hẹp, không mở rộng phạm vi (giống API_GD2 §9.1).

### 9.2 Endpoint
**`GET /api/stats`** – STAFF, LECTURER · limiter 60/15 phút/`req.user.id`.
Query `statsQuerySchema`:
- `groupBy` (bắt buộc): enum `STATS_GROUP_BY`;
- bộ lọc tùy chọn: `roundId`, `academicYear` (regex năm học), `fieldId`, `lecturerId`, `status` enum TOPIC_STATUS (trừ DRAFT), `result` enum FINAL_RESULT, `facultyId` (chỉ STAFF; LECTURER gửi → 400) – mọi ID ≤ 64, trường đơn (khóa lặp → 400).

Định nghĩa từng chiều:
| `groupBy` | `key` | `label` |
|---|---|---|
| `lecturer` | `lecturerId` GVHD hiện hành, `null` nếu chưa có | `fullName`; `null` → "Chưa có GVHD" |
| `field` | `fieldId` / `null` | `Field.name`; "Chưa chọn lĩnh vực" |
| `status` | enum | `TOPIC_STATUS_LABEL` |
| `result` | kết quả **hiện hành của đề tài CLOSED**; đề tài chưa đóng → `null` | `FINAL_RESULT_LABEL`; `null` → "Chưa có kết quả chính thức" (Giả định G27) |
| `academicYear` | `Round.academicYear` | như key |
| `round` | `roundId` | `Round.name` |

Bộ lọc `result` dùng cùng định nghĩa (chỉ CLOSED). **Thống nhất toàn hệ thống (G27 đã chốt):** T503 sửa luôn bộ lọc `result` và trường `item.result` của `GET /api/topics` (T213, `listService.js`) theo cùng định nghĩa – chỉ đề tài `status = CLOSED` mới có kết quả; kèm test.
200:
```json
{ "groupBy": "field", "total": 57,
  "rows": [{ "key": "fd1", "label": "Trí tuệ nhân tạo", "count": 21 }, { "key": null, "label": "Chưa chọn lĩnh vực", "count": 2 }] }
```
- `rows` sắp `count` giảm dần, rồi `label` tăng dần (collation `vi`/so sánh JS ổn định); tối đa 1.000 dòng. `total` = tổng `count` = số đề tài khớp bộ lọc (mỗi đề tài đúng một nhóm).
- `label` **luôn có**, cả với chiều enum (ngoại lệ có chủ đích so với API_GD2 §1.3): biểu đồ, bảng và CSV dùng **cùng chuỗi** từ server, FR14 "cho cùng số với cùng bộ lọc".
- Hiện thực: một hàm service `computeStats(user, query)` duy nhất, một câu SQL `GROUP BY` (`Prisma.sql`, biểu thức chiều lấy từ **bảng trắng** theo `groupBy`, không nội suy chuỗi từ client). NFR04: ≤ 2 s với 2.000 đề tài (index `Topic(facultyId, status)`, `Advising(lecturerId, endAt)`, `result_one_current`).

**`GET /api/stats/export.csv`** – cùng quyền, cùng `statsQuerySchema` · limiter 30/15 phút.
- Gọi **đúng `computeStats`** rồi `toCsv` (shared: BOM UTF-8 + `escapeCell` chống CSV injection – ô bắt đầu bằng `= + - @ \t \r` được thoát). Không có code đếm thứ hai.
- Cột: `[<tên chiều>, "Số đề tài"]`, tên chiều: Giảng viên hướng dẫn / Lĩnh vực / Trạng thái / Kết quả / Năm học / Đợt. Không có dòng tổng (FE tự cộng; test so khớp dễ hơn).
- Header: `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="thong-ke-<groupBy>-<yyyyMMdd theo giờ VN>.csv"`, `Cache-Control: no-store`.
- Lỗi: như `/api/stats`, trả JSON lỗi chuẩn.

Test T505: với cùng query, `rows` của `/api/stats` khớp từng dòng CSV (sau khi bỏ BOM, parse bằng `parseCsv` shared); GV không thấy đề tài của GV khác.

UI T504: `/thong-ke` – bộ lọc lưu trên URL (dùng `urlParams.js` có sẵn), Recharts cột/tròn từ `rows`, bảng từ `rows`, nút "Xuất CSV" gọi export với **cùng chuỗi query**. Tiện ích "Đề tài kẹt sau khi đóng đăng ký" dùng `GET /api/topics` có sẵn (UI.md §2.7), không có endpoint mới.

---

## 10. Chuyển trạng thái GĐ4 ↔ TRANSITIONS

Chỉ dùng action có trong `packages/shared/src/transitions.js`. Không có đường đi nào khác.

| Action | Từ → Sang | Vai trò + quan hệ | Điều kiện thêm | Ghi trong transaction |
|---|---|---|---|---|
| `REQUEST_CLOSE` | IN_PROGRESS → WAITING_CLOSE | LECTURER, `currentAdvisorOnly` | §7.2 (kiểm lại trong `extra`) | StatusHistory, Notification |
| `RETURN_TO_ADVISOR` | WAITING_CLOSE → IN_PROGRESS | STAFF trong phạm vi, `reasonRequired` | – | StatusHistory (reason), Notification |
| `CONFIRM_CLOSE` | WAITING_CLOSE → CLOSED | STAFF trong phạm vi | §7.2 (kiểm lại trong `extra`) | StatusHistory, Notification |
| `CLOSE_EXPIRED` | IN_PROGRESS → CLOSED | STAFF trong phạm vi, `reasonRequired`, `forcesFail` | `now ≥ round.endAt`; chưa đủ điều kiện đóng (kiểm lại trong `extra`) | StatusHistory (reason), ResultVersion FAIL, Notification |

`CANCEL` (IN_PROGRESS → CANCELLED): API_GD6 (T600/T602).

---

## 11. Schema và hằng cần thêm ở `packages/shared`

Tuân QD §5 (`.max()` trước refine, mảng có `.max()`, thông điệp tiếng Việt dạng `{ error }`, không `z.any/record`, strict object ở body sửa).

| Tên | Nội dung | Task |
|---|---|---|
| Hằng §1.4 (trừ thông báo, thống kê) + `MILESTONE_EVAL_LABEL` (Chưa đánh giá / Đạt / Cần bổ sung), `DOCUMENT_STAGE_LABEL` (Đề cương / Giữa kỳ / Cuối kỳ / Khác) | `enums.js`/`labels.js` | T401 |
| `milestoneCreateSchema`, `milestoneUpdateSchema`, `milestoneDueChangeSchema` | §3.2 | T401 |
| `progressCreateSchema`, `progressUpdateSchema` | §4.2 | T402 |
| `documentUploadFieldsSchema`, `documentLinkSchema`, `documentListQuerySchema` | §5.2–5.4 | T403 |
| `documentFeedbackSchema`, `progressFeedbackSchema`, `feedbackListQuerySchema`, `finalResultSchema` | §6 | T404 |
| `topicActionSchema` thêm 4 nhánh; `ENABLED_ACTIONS` (thay `GD2_ACTIONS` ở `service.js`) | §7.1, §7.4 | T405 |
| `NOTIFICATION_TYPES`, `NOTIFICATION_TYPE_LABEL`, `notificationListQuerySchema` | §8 | T501 |
| `STATS_GROUP_BY`, `STATS_DIMENSION_LABEL`, `statsQuerySchema` | §9 | T503 |
| Hàm `formatVnDate(date)` (`yyyyMMdd` theo `Asia/Ho_Chi_Minh`, dùng `Intl.DateTimeFormat`) cho tên file CSV; FE dùng lại (trả lời đề xuất ở cuối `UI.md`: "hàm định dạng thời gian dùng chung… đề xuất ở T400") | §9.2 | T503 |

Không đổi `TRANSITIONS`, `availableActions`.

## 11b. Thay đổi schema/SQL – một migration `gd4_execution` (T401 tạo, các task sau chỉ dùng)

Gom vào một migration để T402–T405 không phải sửa schema song song. Phần Prisma ghi vào `schema.prisma`; phần SQL thô thêm vào cuối `migration.sql` của migration đó **và** `after_init.sql` (giữ hai nơi đồng bộ như hiện tại).

**Cột / bảng (Prisma):**
| Model | Thay đổi | Lý do |
|---|---|---|
| `Milestone` | + `version Int @default(0)`, `createdById String` (FK User), `createdAt @default(now()) timestamptz`; + `@@index([topicId, order])`; + `@@index([dueAt])` | Khóa lạc quan §3; ai tạo; cron §8.4 quét theo hạn |
| `MilestoneDueChange` | `changedById` → quan hệ FK `User` | Hiện tên người đổi (FR09) |
| `ProgressUpdate` | `authorId` → quan hệ FK `User`; + `updatedAt @updatedAt timestamptz`; + `@@index([topicId, createdAt])` | FR10 tác giả |
| `Document` | + `kind String` (`FILE`/`LINK`, mặc định `FILE`); `uploadedById` → FK `User`; + `@@index([milestoneId, version])` | §5.1 |
| `Feedback` | + `milestoneId String?` (FK), `progressUpdateId String?` (FK), `evaluation MilestoneEval?`; `lecturerId` → FK `User`; + `@@index([topicId, createdAt])`, `@@index([progressUpdateId])` | §6; giữ tên người viết (FR19) |
| `ResultVersion` | `createdById` → FK `User`; + `@@index([topicId, isCurrent])` | §6.4, §9 |
| `User` | các quan hệ ngược tương ứng, đặt tên quan hệ rõ ràng | – |

Không cần bảng lịch sử tải riêng: lượt tải ghi `AuditLog` `DOCUMENT_DOWNLOAD` (đã chỉ-thêm). Không đổi `Notification` (đã có `@@unique([userId, dedupeKey])`, `@@index([userId, readAt])`).

**SQL thô:**
```sql
-- Một kết quả hiện hành mỗi đề tài (FR12, FR23)
CREATE UNIQUE INDEX result_one_current ON "ResultVersion"("topicId") WHERE "isCurrent";
-- Phiên bản tài liệu duy nhất trong chuỗi (§5.1)
CREATE UNIQUE INDEX document_chain_version ON "Document"("topicId", COALESCE("milestoneId", ''), (CASE WHEN "milestoneId" IS NULL THEN stage ELSE '' END), version);
-- CHECK miền giá trị
ALTER TABLE "ProgressUpdate" ADD CONSTRAINT progress_percent_range CHECK (percent BETWEEN 0 AND 100);
ALTER TABLE "Document" ADD CONSTRAINT document_kind_ck CHECK ((kind = 'FILE' AND "publicId" IS NOT NULL AND "externalUrl" IS NULL) OR (kind = 'LINK' AND "externalUrl" IS NOT NULL AND "publicId" IS NULL));
ALTER TABLE "Document" ADD CONSTRAINT document_stage_ck CHECK (stage IN ('PROPOSAL','MIDTERM','FINAL','OTHER') AND ((stage = 'PROPOSAL') = ("milestoneId" IS NULL)));
ALTER TABLE "Feedback" ADD CONSTRAINT feedback_target_ck CHECK (num_nonnulls("documentId", "progressUpdateId") = 1);
-- Chỉ thêm (FR11 không ghi đè, FR09 lịch sử đổi hạn, FR12/FR19 nhận xét giữ nguyên) – dùng lại forbid_mutation()
CREATE TRIGGER document_immutable BEFORE UPDATE OR DELETE ON "Document" FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER milestone_due_change_immutable BEFORE UPDATE OR DELETE ON "MilestoneDueChange" FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER feedback_immutable BEFORE UPDATE OR DELETE ON "Feedback" FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER document_no_truncate BEFORE TRUNCATE ON "Document" FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER feedback_no_truncate BEFORE TRUNCATE ON "Feedback" FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER milestone_due_change_no_truncate BEFORE TRUNCATE ON "MilestoneDueChange" FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
-- ResultVersion: chỉ được UPDATE đúng cột isCurrent từ true sang false; không DELETE
CREATE OR REPLACE FUNCTION result_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'ResultVersion chỉ thêm'; END IF;
  IF (to_jsonb(NEW) - 'isCurrent') <> (to_jsonb(OLD) - 'isCurrent') OR NOT (OLD."isCurrent" AND NOT NEW."isCurrent") THEN
    RAISE EXCEPTION 'ResultVersion chỉ được hạ isCurrent';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER result_version_guarded BEFORE UPDATE OR DELETE ON "ResultVersion" FOR EACH ROW EXECUTE FUNCTION result_version_guard();
CREATE TRIGGER result_version_no_truncate BEFORE TRUNCATE ON "ResultVersion" FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
```
- Vi phạm trigger trong code = lỗi logic → 500 là đúng (không che). Vi phạm unique index → 409 `DUPLICATE` (đã có).
- Thêm `Milestone` vào danh sách **không** trigger (cột `evaluation`, `dueAt`, `version` phải sửa được; lịch sử nằm ở `MilestoneDueChange`, `Feedback`, `AuditLog`). Tương tự `ProgressUpdate` (sửa đến khi khóa; khóa giữ bằng `updateMany where lockedAt IS NULL`).
- Script reset DB test (`reset-test-db.js`, `db-test.js`) đang TRUNCATE/xóa dữ liệu giữa các test: T401 kiểm và cập nhật cách dọn (vd. `session_replication_role = replica` hoặc tạo lại schema) cho các trigger mới, theo đúng cách đang làm với `AuditLog`/`StatusHistory`.
- Test `pg_indexes`/`pg_trigger` của T203 (API_GD2 §11b(b)) bổ sung 2 index + 7 trigger mới ở trên.
- Kiểm `prisma migrate dev --create-only` một lần sau migration (index biểu thức có thể bị sinh `DROP INDEX`), ghi vào báo cáo T401.
- Dữ liệu cũ: các bảng GĐ4 đang rỗng, nên cột `NOT NULL` mới không cần giá trị mặc định cho dòng cũ (trừ `Milestone.createdById` – thêm cột trên bảng rỗng là an toàn).

## 11c. Thay đổi ở `apps/api` (ngoài module mới)
| Thay đổi | Task |
|---|---|
| Module mới: `modules/execution/{milestones,progress,documents,feedback,results}` (router qua `businessRouter(guard)`), mount `/api/milestones`, `/api/progress`, `/api/documents`; route con của `/api/topics/:id/…` đặt trong `topicsRouter` | T401–T404 |
| Helper `lockTopicForExecution(tx, topicId)` (câu khóa §1.2 + kiểm `IN_PROGRESS`), dùng chung §3–§6 | T401 |
| `lib/storage.js` (§5.8) + tiêm `storage` vào `createApp`; `env.js` thêm `CLOUDINARY_FOLDER` (mặc định `nckh/<NODE_ENV>`) và bắt buộc `CLOUDINARY_URL` khi production | T403 |
| Upload qua multer `^2.5.0` (QD §4.3). `lib/multipart.js` (parser tự viết của nhập CSV) **giữ nguyên** ở T403; chuyển CSV sang multer là việc tùy chọn, làm nếu rẻ (ghi vào báo cáo) | T403 |
| `cleanup-orphans.js`: liệt kê Cloudinary, `--apply`, AuditLog từng file (§5.7) | T403 |
| SUBMIT/RESUBMIT điền `payload.documentIds`; snapshot/diff trả `documents` (§5.6) | T403 |
| `closeConditions.js` (§7.2); tính lại trong `extra` của REQUEST_CLOSE/CONFIRM_CLOSE; `CLOSE_EXPIRED` tạo ResultVersion FAIL | T405 |
| `service.js`: `ENABLED_ACTIONS`, `round.endAt/ended`, `currentResult`, `closeReadiness`, `permissions` mới (§7.4); repo nạp thêm dữ liệu cần | T405 |
| `notify(tx, items)` + gắn vào **mọi** endpoint bảng §8.3 (sửa code T208, T210, T212a, T401–T405); test mỗi sự kiện: đúng người nhận, gọi lại không trùng | T501 |
| `/api/cron/reminders` (§8.4), `env.js` `CRON_SECRET` `.min(32)` khi có | T501 |
| `/api/stats`, `/api/stats/export.csv` (§9) | T503 |
| `errorHandler`: không cần đổi (mã mới đều qua `AppError`) | – |

Test đồng thời bắt buộc (T401–T405 mỗi task một ca, chạy trên DB thật):
- REQUEST_CLOSE ‖ tạo mốc bắt buộc mới: hoặc mốc tạo được và REQUEST_CLOSE nhận 409 `MILESTONES_NOT_PASSED`, hoặc đóng xong và tạo mốc nhận 409 `TOPIC_NOT_IN_PROGRESS`; không bao giờ cả hai thành công.
- Nhận xét tiến độ ‖ sửa tiến độ: không có bản sửa sau `lockedAt`.
- Hai upload đồng thời cùng chuỗi: `version` 1 và 2, không trùng.
- Hai lần nhập kết quả cùng `expectedVersion`: một bên 409, luôn đúng một bản `isCurrent`.

## 11d. Thư viện cần thêm (đề xuất, chờ duyệt theo CLAUDE.md)
| Gói | Phiên bản | Nơi | Lý do |
|---|---|---|---|
| `multer` | `^2.5.0` | `apps/api` | Đã duyệt ở QD-ZOD §1 (cấm 1.x). Upload báo cáo 10 MB, `memoryStorage` |
| `cloudinary` (Node SDK v2) | `^2` – cài bản 2.x mới nhất tại thời điểm làm, ghi bản cụ thể + kết quả `npm audit --omit=dev` vào báo cáo T403 | `apps/api` | Upload `raw/authenticated`, `utils.private_download_url` có `expires_at` + `attachment`, Admin API liệt kê cho dọn file. Tự ký REST bằng `crypto` cũng làm được nhưng dễ sai chữ ký và phải tự viết phân trang, không đáng |

Không cần thư viện cho thông báo, cron, thống kê, CSV (đã có `toCsv`/`escapeCell`/`parseCsv`). Recharts cho T504 đã có trong danh sách công nghệ.

---

## 12. Giả định (G15 trở đi; G1–G14 ở API_GD2 §12)

| # | Giả định | Lý do / phương án khác |
|---|---|---|
| G15 | Mốc, tiến độ, nhận xét, kết quả, tài liệu mốc chỉ ghi ở `IN_PROGRESS`; WAITING_CLOSE và CLOSED chỉ đọc | FR27.4 "sau khi đóng hồ sơ chỉ đọc"; ở WAITING_CLOSE cán bộ phải xác nhận đúng dữ liệu GV đã gửi. Muốn sửa thì cán bộ trả lại (RETURN_TO_ADVISOR) |
| G16 | Mốc chỉ tạo sau khi duyệt (IN_PROGRESS), không có mốc mẫu theo đợt | FR09 gắn mốc với đề tài, do GVHD/cán bộ tạo. Mốc mẫu theo đợt (cán bộ tạo một lần cho mọi đề tài) có thể thêm sau qua `roundConfig` |
| G17 | Không xóa mốc; mốc tạo nhầm đặt `required = false` | NFR05 không xóa cứng; mốc có thể đã có tài liệu/nhận xét |
| G18 | Đổi hạn được cả lùi và rút ngắn, hạn mới phải ở tương lai; không giới hạn bởi `round.endAt` | FR09 chỉ đòi lịch sử; FR27.5 cần gia hạn sau hạn đợt |
| G19 | Chỉ tác giả sửa bản tiến độ của mình (không có khóa lạc quan) | FR10 "lưu tác giả"; một người sửa nên ghi đè giữa hai tab là rủi ro thấp |
| G20 | Nhận xét tiến độ khóa bản tiến độ đó; nhận xét bản nộp không khóa gì (bản nộp vốn bất biến) | FR10 |
| G21 | Không tạo dòng `Document` trước khi upload; dòng chỉ được tạo sau khi Cloudinary xác nhận (`status = READY`). File lên kho mà ghi DB lỗi trở thành mồ côi, job §5.7 dọn sau 24 h | FR11 "chỉ cho nộp khi đã tải lên hoàn tất và xác minh"; ít bước hơn luồng UPLOADING → READY, không cần cập nhật dòng (cho phép trigger chỉ-thêm trên `Document`). Xác minh dựa trên response upload có chữ ký của Cloudinary, không gọi thêm Admin API (giới hạn 500 lần/giờ ở gói miễn phí) |
| G22 | Link ngoài chỉ nhận `https`, không xác minh nội dung; không giới hạn tên miền | FR11 chỉ nói "nộp bằng link"; whitelist tên miền (GitHub, Drive, YouTube) có thể thêm vào `roundConfig` nếu khoa muốn |
| G23 | Tài liệu đề cương: một chuỗi phiên bản; upload ở DRAFT/NEEDS_REVISION; GV được đề nghị xem/tải được đề cương | Đồng bộ với điều kiện sửa hồ sơ (FR05, G1); snapshot FR17 chỉ cần bản mới nhất. GV cần xem để quyết định nhận (FR16) |
| G24 | Đề tài không có mốc bắt buộc nào thì **chưa** đủ điều kiện đóng (409 `NO_REQUIRED_MILESTONE`) | "Mọi mốc bắt buộc Đạt" trên tập rỗng đúng về logic nhưng cho phép đóng đề tài không có sản phẩm. Giữ phương án, chờ trả lời `CAU_HOI.md` #8 |
| G25 | "Đã có kết quả cuối" = bản kết quả hiện hành do **GVHD hiện hành** tạo | FR27 "của GVHD"; sau khi thay GV (FR19) GV mới phải nhập lại |
| G26 | **Đã chốt (điều phối viên, vòng sửa 1).** `CLOSE_EXPIRED` bị chặn khi đề tài đã đủ điều kiện đóng (409 `CLOSE_CONDITIONS_MET`) | Đúng FR27.5; tránh đánh trượt oan đề tài đã đạt |
| G27 | **Đã chốt (điều phối viên, vòng sửa 1).** Kết quả "chính thức" chỉ tính đề tài CLOSED, áp cho cả thống kê lẫn bộ lọc/trường `result` của `GET /api/topics` (T503 sửa) | Một định nghĩa duy nhất; kết quả trước khi đóng còn có thể đổi |
| G28 | Thành viên thấy kết quả GV vừa nhập (qua `GET …/results`, `currentResult`) và nhận thông báo `RESULT_ENTERED` | Minh bạch; FR12 không cấm. Giữ phương án, chờ `CAU_HOI.md` #9 |
| G29 | Thống kê GV chỉ gồm đề tài đang hướng dẫn (Advising hiện hành), không gồm đề tài đã được thay GV | Khớp phạm vi danh sách GĐ2 (§9.1) và FR19 "GV cũ mất mọi quyền" |
| G30 | Lượt tải ghi vào `AuditLog` (`DOCUMENT_DOWNLOAD`), không có bảng riêng; ghi khi cấp link, không phải khi tải xong | Không biết được trình duyệt tải xong; cấp link là điểm kiểm quyền duy nhất (FR24) |
| G31 | Nhắc hạn chạy một lần/ngày lúc 07:00 giờ VN; "trước X ngày" = cửa sổ `(now, now + X×24 h]` | FR13; mốc nằm trong cửa sổ suốt X ngày nên bị quét nhiều lần – **chỉ `dedupeKey` (có `dueAt`) chặn trùng**, BE không cần thêm logic đánh dấu |
| G32 | Thông báo không gửi email, chỉ trong web | FR13 "thông báo trong web" |

## 13. Câu hỏi đề xuất cho `CAU_HOI.md` (điều phối viên ghi; không chặn – đã áp dụng phương án đề xuất)
1. (G24) Đề tài không có mốc bắt buộc nào có được đóng không? Đề xuất: **không** – phải có ít nhất một mốc bắt buộc Đạt.
2. (G27, G28) Kết quả cuối GV nhập trước khi cán bộ đóng: sinh viên có được thấy ngay không, và thống kê có tính không? Đề xuất: sinh viên thấy; thống kê chỉ tính sau khi đóng.
3. (G16) Khoa có muốn bộ mốc mẫu theo đợt (tự tạo cho mọi đề tài khi được duyệt) không? Đề xuất: không ở GĐ4; GVHD tự tạo.

## 14. Ngoài phạm vi GĐ4–5
Hủy đề tài `CANCEL` (FR20), mở lại mốc (FR22), sửa sai kết quả sau đóng (FR23), thay GV và chuyển bản nộp chờ nhận xét (FR19), quyền đọc của người đã rời nhóm (FR21): API_GD6 (T600). Sao lưu file sang kho thứ hai (FR26, hướng phát triển). Swagger: T701 sinh từ schema §11.
