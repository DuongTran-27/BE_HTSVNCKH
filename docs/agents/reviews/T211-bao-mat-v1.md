# Review T211 – bao-mat – v1
- Reviewer: bao-mat (reviewer duy nhất, chế độ tiết kiệm quota: MINOR không chặn) · Ngày: 2026-11-03
- Phạm vi: code chưa commit trong `apps/api` (modules/similarity/*, topics/similarityService.js, topics/routes.js, topics/prismaRepo.js, tests/similarity.test.js, tests/T211-similarity.test.js), đối chiếu DAC_TA mục 3 (FR06), API_GD2 §7, §11b.

## Kết luận: APPROVED

Không có BLOCKER hoặc MAJOR.

## Bằng chứng chạy lệnh (DB riêng `nckh_t211rv_test`, localhost:54329, server embedded)
```
CREATE DATABASE nckh_t211rv_test TEMPLATE template1   -> Script executed successfully.
npm run db:test:reset   -> Đã reset DB test (migrate reset).
npm run lint            -> eslint . (không lỗi)
npm test (exit 0)       -> shared 6 files 68/68 · api 33 files 385/385 · web 13 files 107/107
```
(api 385, báo cáo ghi 384: chênh 1 test do `T608-devops-scripts.test.js` chưa commit cùng cây làm việc.)

Test tấn công tạm `apps/api/tests/security/T211-bao-mat.test.js` (supertest, DB thật): 4/4 pass, nên đã xóa (không phát hiện lỗi). Nội dung đã kiểm:
- SV thành viên và GVHD hiện tại gọi GET latest: `JSON.stringify(body)` không chứa tên, chuỗi trong tóm tắt, `id`, `code` hay mã thành viên của hồ sơ UNDER_REVIEW nhóm khác, và vẫn có dòng `hidden: true`.
- IDOR: SV ngoài nhóm, SV trưởng nhóm của hồ sơ khớp, GV không liên quan, STAFF khoa khác gọi GET latest đều nhận 403. SV ngoài nhóm và GVHD gọi POST cũng nhận 403.
- `GET /api/topics/:id` chỉ trả `latestSimilarity` tóm tắt (id/status/level/isStale), không trả `matches`.
- id dạng `' OR 1=1--` cho 400/404, không 500. Truy vấn `loadCorpus` dùng tagged template `$queryRaw` + `Prisma.join`, không ghép chuỗi.

## Đúng đặc tả
- Kho so (`similarity/prismaRepo.js:8-19`): công khai IN_PROGRESS/WAITING_CLOSE/CLOSED ở mọi năm, cộng 4 trạng thái chờ trong cùng đợt, trừ chính đề tài đang kiểm. Không có DRAFT/REJECTED/CANCELLED. Đúng DAC_TA mục 3.
- `matches` lưu dạng đầy đủ đúng §7.2 (`engine.js:72-84`). `matchedKeywords` lấy từ khóa gốc của hồ sơ đang kiểm, so theo dạng chuẩn hóa có quy đồng nghĩa, tối đa 5.
- `presentMatches(matches, viewerRole)` (`similarity/service.js:13-26`) chỉ dựng từ dữ liệu đã lưu. Nó dùng danh sách cho phép (chỉ PUBLIC mới hiện), nên trạng thái thiếu hoặc lạ đều bị ẩn. Ẩn với mọi vai trò trừ STAFF, đúng §7.2 và G4. Bản hiện ra không có summary/objectives/thành viên (FR08).
- Quy tắc 5 (CLAUDE.md): lỗi khi tải kho hoặc tính toán thì lưu ERROR với `level: null`. `similarityView` (`service.js:29-38`) trả `level: null`, `message: "Chưa kiểm tra được"`, không lộ `errorMessage`. Hồ sơ thiếu tên/tóm tắt trả 400 `TOPIC_INCOMPLETE`, không lưu (`similarityService.js:32-35`), nên không có "không trùng" giả. Lỗi DB trước khối try sẽ ra 500, không ra NONE.
- POST: STUDENT + `isMember` + 4 trạng thái cho phép, limiter 10/15 phút theo user, AuditLog ghi cùng `$transaction` với SimilarityCheck, không chuyển trạng thái.
- GET latest: `isStale` so `contentHash` với nội dung hiện tại. Kết quả cũ không đổi khi đề tài khớp bị đổi tên (đã có test).
- Kiểm quyền ở backend: route có `requireRole` (ADMIN 403), quan hệ kiểm ở service bằng `canView` dùng chung với `GET /api/topics/:id`.

## Trả lời câu hỏi của agent
Cho LECTURER gọi GET latest khi `canView` (GVHD hiện tại hoặc GV được đề nghị), chỉ thấy phần ẩn như SV: **đúng §7**. §7.1 ghi "quyền xem như `GET /api/topics/:id`", tức là theo `canView`. §7.2 và G4 ghi GV thấy hồ sơ chờ dưới dạng `hidden: true` + điểm. Test tấn công đã xác nhận GVHD không thấy tên hồ sơ chờ, còn GV không liên quan nhận 403.

## Đổi `tests/similarity.test.js`: không làm yếu
Test cũ chỉ kiểm SV không có `title`/`code`. Test mới:
- dùng `toEqual` đúng dạng ẩn (`{hidden, note, titleScore, contentScore, level}`), nên chặt hơn: mọi trường thừa đều làm test đỏ;
- chạy cho cả STUDENT lẫn LECTURER;
- thêm ca trạng thái thiếu thì ẩn, và ca `matchedKeywords`.

Việc đổi chữ ký là theo §7.2.

## Vấn đề
### BLOCKER
Không có.
### MAJOR
Không có.
### MINOR (không chặn)
1. `apps/api/tests/T211-similarity.test.js:144-180`: integration chưa có ca LECTURER (GVHD) gọi GET latest thấy `hidden`, và chưa có ca STAFF khoa khác nhận 403 / STAFF trong phạm vi nhận 403 với DRAFT. Logic đúng (test tạm của reviewer đã chứng minh), nhưng nên thêm vào để chống hồi quy cho đúng câu hỏi ở §7.
2. `apps/api/tests/T211-similarity.test.js:156,163`: biến `staff` (đọc user rồi `toBeTruthy`) là code thừa, không kiểm gì.
3. `apps/api/src/modules/similarity/engine.js:66`: từ khóa trùng lặp trong hồ sơ (vd. "AI" và "trí tuệ nhân tạo" cùng quy về một dạng) đều được đưa vào `matchedKeywords`. Không sai đặc tả, chỉ hiển thị dư.
4. `docs/agents/reports/T211.md:16`: bảng file thay đổi liệt kê `packages/shared/src/catalog.js`, nhưng file này không có thay đổi chưa commit (đã nằm trong commit c461b94/T306). Cần sửa báo cáo cho khớp diff thật.
5. `apps/api/src/modules/topics/routes.js:40`: POST không `validate` body, vì §7.1 quy định body rỗng và service bỏ qua body nên không có rủi ro. Nếu muốn đồng bộ quy ước "Zod cho mọi body" thì thêm `z.object({}).strict()`.
