# Review T600 – reviewer – vòng 1

- Task: T600 (thiết kế) – `design/API_GD6.md` (mới), `API_GD2.md` §8.2/§12-G5/§14, `CAU_HOI.md` #10–#12
- Ngày: 2026-11-06 · Chế độ tiết kiệm quota (reviewer duy nhất, MINOR không chặn)
- **Kết luận: APPROVED**

## Lệnh tự chạy
Task chỉ đổi tài liệu (`git status`: chỉ `docs/`). Chạy lại để xác nhận không có gì hỏng:
```
npm run lint            → eslint . --max-warnings 0, 0 lỗi
npm test -w @nckh/api   → Test Files 50 passed (50) · Tests 632 passed (632)
npm test (web)          → Test Files 22 passed (22) · Tests 168 passed (168)
grep .skip/.only apps/api/tests → không có
```
Báo cáo ghi bằng chứng là kết quả grep (task không có code), khớp với repo: `transitions.js:15` (CANCEL), `:22-23` (ENABLED_ACTIONS bỏ CANCEL), `schema.prisma:468` (ChangeRequest chưa có FK/index), `after_init.sql:24` (submission_immutable), `listService.js:33`, `rounds/service.js:28`.

## Đối chiếu đặc tả
| Yêu cầu | Mục | Nhận xét |
|---|---|---|
| Mục 5: không đổi trạng thái ngoài bảng; FR18/19/21/22/23 không đổi trạng thái | §0 | Đạt. Không thêm dòng `TRANSITIONS`; CANCEL chỉ chạy trong `/change-requests/:id/approve` bằng `checkTransition` + `applyTransitionTx`; `/actions` vẫn 400 với CANCEL, `ENABLED_ACTIONS` giữ nguyên. Không có đường vòng quyền: STAFF không tự tạo CANCEL (G38, khớp "Trưởng nhóm hoặc GVHD đề nghị"), ADMIN 403 mọi endpoint |
| FR18 trước/sau/lý do, FR03, FR16, FR06, từ chối giữ nguyên | §6 | Đạt. Trước/sau bất biến trong `payload` (trigger `change_request_guard`), FR03 kiểm lại dưới khóa khi duyệt (maxMembers, maxActiveTopicsPerStudent, SV đồng ý), FR06 chạy trên nội dung gộp, ERROR → không tạo yêu cầu. "Hạn mức GV" là no-op vì G33 loại đổi GV khỏi FR18 – đã đưa lên `CAU_HOI.md` #10, đúng quy trình |
| FR19 đủ 5 ý mục 4 | §3, §1.2 | Đạt. Hạn mức kiểm sớm khi GV mới đồng ý và kiểm ràng buộc khi duyệt dưới khóa User (khớp FR16 "tại thời điểm nhận"); một transaction kết thúc/tạo Advising; GV cũ mất quyền đúng tại thời điểm duyệt nhờ kiểm GVHD dưới khóa Topic (lock mode `FOR NO KEY UPDATE` khớp `execution/lock.js:6`); nhận xét giữ tên; quyền chỉ đọc do cán bộ cấp/thu hồi kèm lý do + AuditLog |
| FR20 | §4 | Đạt. Lý do bắt buộc ở tạo và quyết định (approve CANCEL → `REASON_REQUIRED`, decline luôn bắt buộc), không tự đóng (G39), StatusHistory qua `recordStatus`, vẫn trong thống kê, rời kho so FR06 |
| FR21 | §5 | Đạt. Trước duyệt rời ngay, mất quyền ngay; sau duyệt qua cán bộ + đếm lại min dưới khóa; đọc snapshot/tài liệu theo khoảng `[joinedAt, leftAt)`, một hàm `inWindows` |
| FR22 | §8 | Đạt. Chỉ GVHD hiện hành (dưới khóa), lý do, về NEEDS_WORK, bản ghi `MilestoneReopen` chỉ-thêm, điều kiện đóng theo hiện hành, cron nhắc hạn được sửa theo |
| FR23 | §7 | Đạt. Chỉ cán bộ, lý do, phiên bản mới (thứ tự hạ `isCurrent` trước hợp `result_version_guard` ở `gd4_execution/migration.sql:91-99`), kho/thống kê theo `isCurrent`, thông báo nhóm + GVHD |
| G5 – 4 ràng buộc API_GD2 §14 | §9 | Đạt cả 4: (1) cờ suy ra, không cột; (2) `SimilarityBypass` là bản ghi mới; (3) job chèn `SimilarityCheck` mới, chỉ đổi `Submission.similarityCheckId`; (4) `submission_guard()` chỉ cho NULL/ERROR → OK cùng đề tài, mọi cột khác bất biến, giữ tên trigger. "Chưa kiểm tra được" không bao giờ thành "Không trùng" (§9.6) |
| INFO 12 | §10 | Đạt. Tham số quét (`minSummaryWords`, `minKeywords`, `maxKeywords`) đúng các tham số `topicSubmitSchema` dùng (`schemas.js:30-36`) |
| FR25, NFR02 | §1, §2.3–2.4 | Đạt. Phạm vi ở `WHERE` trước phân trang, thứ tự kiểm theo API_GD45 §1.1, gom 5 bản sao `canReadExecution` thành một hàm |

Độc lập T601–T609: đủ, với phụ thuộc T601 đã thêm cho T602/T603/T605 trên bảng việc (đã kiểm `BANG_CONG_VIEC.md:78-81`). Ngoại lệ nhỏ ở m6.

## BLOCKER
Không có.

## MAJOR
Không có.

## MINOR (không chặn, task hiện thực xử lý)
- **m1 – Quyền xem `TopicDetail` của SV được đề xuất thêm (`API_GD6.md:37,40`).** `isChangeTarget` gồm cả SV đích của `TOPIC_CHANGE` → SV ngoài nhóm xem toàn bộ `GET /api/topics/:id` của đề tài IN_PROGRESS (thành viên, `latestSubmission`, …), rộng hơn người được mời FR03 hiện nay (`topics/service.js:35` `canView` không có người được mời). Đề xuất (T605/T601): chỉ cho `canView` với đích `ADVISOR_CHANGE` (giống `isRequestedLecturer`); SV đích chỉ xem qua `ChangeRequestView` (đã có mã, tên, before/after).
- **m2 – Link thông báo GV cũ dẫn tới trang trống (`API_GD6.md:618` ↔ `:141`).** `CHANGE_DECIDED` gửi GV cũ link `/yeu-cau`, nhưng phạm vi LECTURER của `GET /api/change-requests` chỉ có `targetUserId = me` hoặc GVHD hiện hành → GV cũ không thấy yêu cầu, `GET /api/change-requests/:id` 403. Đề xuất (T601): thêm "GV là `payload.from.lecturerId`" vào phạm vi LECTURER cho yêu cầu `ADVISOR_CHANGE`, hoặc bỏ link (`null`).
- **m3 – `CHANGE_TARGET_INVITED` mơ hồ với `LEAVE_GROUP` (`API_GD6.md:110` ↔ `:616`).** §2.3 ghi "nếu có người đích", nhưng `LEAVE_GROUP` cũng có `targetUserId`. Ghi rõ "nếu `stage = TARGET` lúc tạo".
- **m4 – `/decline` của người đích không ràng `targetAcceptedAt: null` trong `updateMany` (`API_GD6.md:116`).** Đúng lúc người đích vừa accept, request decline cũ vẫn khớp `status = PENDING`. Đề xuất: nhánh người đích dùng `where { id, status: 'PENDING', targetUserId: me, targetAcceptedAt: null }`.
- **m5 – Cron chạy lại G5 (`API_GD6.md:516-519`).** (a) Lấy 20 bản cũ nhất theo `createdAt` tăng dần: nếu ≥ 20 bản lỗi lặp lại thì bản mới hơn không bao giờ được xử lý – sắp theo lần thử gần nhất hoặc xoay vòng. (b) "`count = 0` → bỏ qua" cần ghi rõ là **rollback** cả dòng `SimilarityCheck` vừa chèn (curl `--retry` của `reminders.yml:33` có thể gọi chồng). (c) Trigger cho trỏ tới **bất kỳ** dòng OK cùng đề tài chưa bị `Submission` khác dùng (kể cả dòng kiểm của `ChangeRequest`); §14 ý 4 nói "lần kiểm OK mới" – có thể thêm điều kiện `new.createdAt > OLD.createdAt` của Submission.
- **m6 – T606 test #3 "GV cũ sau thay GV" (`API_GD6.md:475`) cần FR19 (T601)** trong khi §0 đầu tài liệu nói T606 không phụ thuộc T601. Cho phép test dựng Advising cũ/mới trực tiếp bằng fixture DB, hoặc thêm phụ thuộc.
- **m7 – Tham chiếu mục sai:** `API_GD6.md:55` và `:207` trỏ "§11" cho thông báo, đúng là §11b.
- **m8 – Mã lỗi trạng thái không đồng nhất:** sai trạng thái trả `INVALID_TRANSITION` ở §3.2/§4.1 nhưng `TOPIC_NOT_IN_PROGRESS` ở §5.2/§6.2. Đã định nghĩa rõ từng nơi nên không chặn; T607 lưu ý xử lý cả hai.

## INFO
- G33 (#10), G37/G41 (#11), G44 (#12) chờ người dùng; phương án hiện hành không trái chữ đặc tả. Nếu người dùng trả lời FR18 được đổi GV thì §6.4 bước 5 phải thêm kiểm hạn mức dưới khóa User GV mới như §3.4.
- G40: rời trước duyệt không kiểm min có thể để nhóm dưới min được duyệt ở UNDER_REVIEW – đúng chữ "rời tự do", tác giả đã ghi rủi ro.
- Sau khi tăng tham số đợt, FR18 chỉ đổi `objectives` của đề tài IN_PROGRESS có thể bị 400 `TOPIC_INCOMPLETE` do tóm tắt cũ không còn đủ từ (§6.2 kiểm nội dung gộp theo cfg hiện tại) – chấp nhận được, thông điệp đã rõ.
