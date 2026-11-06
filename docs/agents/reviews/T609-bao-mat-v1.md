# Review TASK-T609 – bao-mat – vòng 1
Kết luận: APPROVED

## Tôi đã tự kiểm tra
- `npm run db:test:reset && npm run lint && npm test` → reset áp đủ 8 migration (có `20261108000000_g5_similarity_bypass`); lint exit 0; shared 73/73, api 57 file 732/732, web 168/168; EXIT=0.
- Test tấn công tạm `apps/api/tests/security/T609-bao-mat.test.js` (3 ca, đều xanh, **không phát hiện lỗi** nên đã xóa đúng file này; thư mục `tests/security` còn nguyên 11 file):
  1. Hai cán bộ cùng khoa cấp quyền đồng thời → đúng một 201, một 409, một bản ghi `SimilarityBypass`.
  2. SV gửi ba lần đồng thời bằng một quyền (FR06 lỗi) → đúng một 200, một `Submission`.
  3. SQL trực tiếp: trỏ `Submission.similarityCheckId` sang dòng OK mới hơn cùng đề tài có `contentHash` không khớp payload → trigger **chấp nhận** (xem m1).
- Đã đọc: migration G5, `similarity/{recheck,service,prismaRepo}.js`, `topics/{similarityBypassService,reviewService,reviewRepo,stateMachine,service,listService,listRepo,snapshotService,routes}.js`, `notifications/routes.js` (`requireCronSecret`, `cronRouter`), `.github/workflows/similarity-recheck.yml`, diff 4 test cũ, `API_GD6.md` §9, `after_init.sql` (đầu file), `scripts/reset-test-db.js`.
- Quét bí mật trong file mới/sửa (chuỗi kết nối, khóa): không có.

## Đối chiếu đặc tả
| Điều kiện đạt | Đạt? | Ghi chú |
|---|---|---|
| Quy tắc 5: lỗi FR06 không bao giờ là "không trùng" | Đạt | Không quyền → 409 `SIMILARITY_NOT_CHECKED` như cũ; `stateMachine` chỉ bỏ qua khi `status !== 'OK'`; OK+HIGH vẫn đòi giải trình (ca hàm thuần). Cờ `unchecked` hiện ở snapshot, danh sách snapshot, TopicDetail, item danh sách; `latestSimilarityLevel` vẫn `null` khi ERROR; cron lỗi không ghi gì |
| Trigger chỉ nới cột `similarityCheckId` | Đạt | `to_jsonb(NEW)-col <> to_jsonb(OLD)-col` chặn mọi cột khác (kể cả gán cùng giá trị kèm cột khác); DELETE từ chối; OK→OK, ERROR→ERROR/NULL, đề tài khác, OK cũ hơn, OK của ChangeRequest đều từ chối (test T609 #7 bằng `$executeRaw`) |
| Quyền cán bộ trong khoa; Admin không có quyền nghiệp vụ | Đạt | `requireRole('STAFF')` + `canView && inStaffScope`; test 403 cho cán bộ khoa khác, GV, SV, ADMIN, đề tài Nháp |
| Grant dùng một lần, không dùng lại khi đồng thời | Đạt | Hiệu lực suy ra; kiểm lại dưới khóa Topic trong `extra`; `updateMany` theo `version` chặn gửi đôi; tự thử 3 lần gửi đồng thời → 1 snapshot |
| Cấp quyền kiểm dưới khóa | Đạt | `lockTopicRow` (FOR NO KEY UPDATE) xung đột với `updateMany` của gửi; trạng thái/ERROR/chưa có quyền kiểm sau khóa |
| Cron bảo vệ bằng secret | Đạt | Cùng `cronRouter`: limiter IP + `requireCronSecret` (404 khi chưa cấu hình, so hằng thời gian trên SHA-256), `no-store` |
| Workflow không lộ secret | Đạt | `permissions: {}`; secret qua env, header qua stdin `-K -`; URL không in; chỉ in `response.json` (đếm số) |
| RLS bảng mới | Đạt | `ALTER TABLE "SimilarityBypass" ENABLE ROW LEVEL SECURITY`; trigger chỉ-thêm UPDATE/DELETE + TRUNCATE |
| Lộ dữ liệu | Đạt | Thông báo không chứa lý do; snapshot ẩn `reason` với GV; response chỉ `grantedBy.fullName` |
| Transaction + AuditLog/StatusHistory | Đạt | Grant: bản ghi + AuditLog + thông báo một tx; gửi qua `applyTransition`; cron: chèn + update + AuditLog + thông báo một tx, `count≠1` rollback cả dòng chèn (m5b) |

### Quyết định về 3 lệch thiết kế
- **Không sửa `after_init.sql`**: chấp nhận. File ghi rõ chỉ trùng nguyên văn migration `search_and_security` và không áp riêng ở đâu (`reset-test-db.js` dùng `migrate reset`); thêm SQL vào đó sẽ làm T203 đỏ và tạo hai nguồn sự thật. §9.7 "ghi vào cả hai" là lỗi thiết kế, nên kiến trúc sư sửa câu đó.
- **`>=` thay `>` ở §9.3**: chấp nhận – chặt hơn (thất bại an toàn: trùng mốc coi như đã dùng), không bao giờ cho dùng hai lần.
- **`ORDER BY random()` thay `createdAt` tăng dần**: chấp nhận – SQL tĩnh, `LIMIT` tham số hóa qua tagged template, không có dữ liệu người dùng; tránh một bản lỗi lặp chặn mãi hàng đợi (m5a).

### Quyết định về 4 test cũ đã sửa – không làm yếu
- T203: vẫn so `proname` chính xác (`submission_guard` cho đúng `submission_immutable`, `forbid_mutation` cho các trigger khác) và vẫn kiểm `tgtype & 27`; ca "Submission từ chối UPDATE và DELETE" không sửa, vẫn xanh.
- T204: danh sách bảng có trigger TRUNCATE so bằng `toEqual` cả mảng, thêm `SimilarityBypass` → chặt hơn.
- T209: vẫn so khớp toàn bộ `permissions`, chỉ thêm khóa mới.
- T501: độ dài chính xác 28 → 30 theo 2 loại mới, có kiểm nhãn tiếng Việt cho mọi loại.

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| m1 | MINOR | `prisma/migrations/20261108000000_g5_similarity_bypass/migration.sql` (`submission_guard`) | Trigger nhận **bất kỳ** dòng OK mới hơn của cùng đề tài, kể cả dòng "kiểm tra trước" của SV trên nội dung đã sửa (đã chứng minh bằng SQL trực tiếp). Không khai thác được qua API (chỉ cron UPDATE, và cron tự chèn dòng của mình), nên chỉ là phòng thủ chiều sâu. | Nếu muốn chặt: so `c."contentHash"` với hash của `OLD.payload`, hoặc ghi chú giới hạn trong migration. |
| m2 | MINOR | `topics/service.js` (`similarityBypass` trong TopicDetail) | GVHD thấy `reason` ở TopicDetail nhưng snapshot lại ẩn `reason` với GV – không nhất quán (đúng nguyên văn §9.3/§9.5 nên không lỗi). | Kiến trúc sư thống nhất một quy tắc. |
| m3 | MINOR | `similarity/prismaRepo.js` `findUncheckedSubmissions` | Lấy cả lần gửi của đề tài đã đóng/hủy → chạy FR06 và thông báo cán bộ vô ích. | Lọc theo trạng thái đề tài, hoặc chấp nhận. |
| m4 | MINOR | `notifications/routes.js` `cronRouter` | Limiter 10/15 phút/IP dùng chung cho `/reminders` và `/similarity-rechecks`; `curl --retry 4` khi Render ngủ có thể đốt hạn mức → 429 (chỉ trễ một giờ, không mất dữ liệu). | Theo dõi; tách limiter nếu gặp 429. |

Không có BLOCKER/MAJOR.
