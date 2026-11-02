# Review T203 – kiem-thu – vòng 1
Kết luận: APPROVED

Góc nhìn: test có bắt được hồi quy thật không; trigger chỉ-thêm và `resetData` có mâu thuẫn không; partial unique đúng điều kiện; seed khớp bảng mục 5 (cả người thực hiện, không chỉ from/to) và dùng được làm fixture cho T204–T214.

## Tôi đã tự kiểm tra
Đã đọc: CLAUDE.md; `DAC_TA.md` FR03, FR04, FR06, FR07, FR15, FR17, mục 5, mục 8; `design/API_GD2.md` §5.5, §7.2, §11b, §11c; `reports/T203.md`; `schema.prisma` (+ `git diff`); `sql/after_init.sql`; 2 migration + `migration_lock.toml`; `prisma/seed.js`; `tests/T203-schema.test.js`, `tests/db.js`, `scripts/reset-test-db.js`, `packages/shared/src/transitions.js`, README. Không đọc `.env`/`.env.test`; mọi lệnh Prisma ngoài script có sẵn chạy qua script nháp gọi `assertTestDbEnv()` trước.

```
$ npm run db:test:up        → K1–K7 OK, "Kiểm tra DB test: tất cả OK."
$ npm run db:test:reset     → "Đã reset DB test (migrate reset)."  (--skip-seed: DB test trống sau reset)
$ diff after_init.sql migrations/20261101000100_search_and_security/migration.sql → giống hệt
$ prisma migrate diff --from-url <DB test sau migrate reset> --to-schema-datamodel prisma/schema.prisma --script
  → "-- This is an empty migration."   (không DROP INDEX/DROP TRIGGER, không lệch schema ↔ migration)
$ NO_COLOR=1 npm test (lần 1) → shared 21/21; api 17 files 141/141; web 32/32; exit=0
$ NO_COLOR=1 npm test (lần 2) → giống hệt; exit=0   (không chập chờn)
$ npm run lint              → eslint . không lỗi, exit 0;  npm run format:check → All matched files use Prettier code style!
$ npm run db:test:down      → "Embedded: đã dừng server." "đã xóa …\nckh-db-test."
```
(141 = 135 của backend-dev + 6 test QA mới bên dưới.)

**Thử đột biến (test có bắt hồi quy thật?)** – trên DB test: thay `submission_immutable` bằng trigger chỉ `BEFORE UPDATE` (bỏ DELETE) và thay `invitation_one_pending` bằng unique **không** `WHERE`:
```
× đủ 5 partial unique index (có WHERE) và topic_title_trgm_idx
× đủ 5 trigger chỉ-thêm BEFORE UPDATE OR DELETE gọi forbid_mutation()
× Submission, ReviewDecision, SimilarityCheck từ chối UPDATE và DELETE (FR17)
Tests  3 failed | 8 passed (11)
```
→ bắt được cả đột biến "yếu đi" (không chỉ xóa hẳn). Sau đó `db:test:reset` lại.

**TRUNCATE** – script nháp: seed rồi, trong transaction có rollback, `TRUNCATE "<bảng>" CASCADE` cho 5 bảng chỉ-thêm (role `postgres`):
```
Submission / ReviewDecision / SimilarityCheck / StatusHistory / AuditLog -> TRUNCATE ĐƯỢC (trigger không chặn)
```
Đúng như thiết kế §11b (`BEFORE UPDATE OR DELETE … FOR EACH ROW` – trigger dòng không chạy với TRUNCATE). Vì vậy **không mâu thuẫn** với `resetData` (TRUNCATE … CASCADE vẫn chạy, test xác nhận). Đổi lại, TRUNCATE là lỗ ngoài phạm vi bảo vệ – xem vấn đề #1.

**Test QA thêm** – `apps/api/tests/T203-qa-seed.test.js` (6 test, `resetData` ở `beforeAll`, đều xanh): test của backend-dev chỉ so `from/to` của lịch sử; tôi kiểm thêm đúng người thực hiện và bản ghi đi kèm:
- TC-FR15-20 vai trò người thực hiện ∈ `actors`; `leaderOnly` = trưởng nhóm; `requestedLecturerOnly` = GV được đề nghị; `currentAdvisorOnly` = GVHD hiện hành; STAFF có `StaffScope` khoa của đề tài.
- TC-FR16-20 đúng 1 `AdvisorRequest` PENDING khi WAITING_ADVISOR, 0 ở trạng thái khác; có đúng 1 `Advising` hiện hành từ HAS_ADVISOR trở đi, trùng GV đã ACCEPTED.
- TC-FR16-21 hạn mức GV tính theo `isActiveStatus` (không chỉ `endAt IS NULL`).
- TC-FR03-20 đúng 1 trưởng nhóm, số thành viên trong [min, max], SV ≤ `maxActiveTopicsPerStudent` đề tài hoạt động mỗi đợt.
- TC-FR17-20 mỗi quyết định gắn snapshot mới nhất tại thời điểm quyết định, cùng người quyết định; FR06 kiểm trước khi gửi; chỉ đề tài UNDER_REVIEW có đúng 1 snapshot chưa quyết định.
- TC-FR04-20 mốc đợt đúng thứ tự; `REQUEST_ADVISOR` trong thời gian mở đăng ký; mọi mốc lịch sử trước hiện tại.

## Đối chiếu đặc tả
| Điều kiện đạt | Đạt? | Ghi chú |
|---|---|---|
| §11b 5 quan hệ có tên rõ | Đạt | FK ON DELETE RESTRICT (mặc định) – xóa User/Topic không cascade vào bảng chỉ-thêm |
| §11b 5 index Prisma | Đạt | Có trong migration init |
| §11b 5 partial unique, đúng `WHERE` | Đạt | Khớp nguyên văn §11b. "1 SV ≤ N đề tài hoạt động/đợt" và hạn mức GV **không** đặt ở DB (N cấu hình theo đợt, §5.5 giao code + khóa dòng, T210/T214) – đúng thiết kế |
| §11b 3 trigger chỉ-thêm mới + 2 cũ | Đạt | Chặn UPDATE/DELETE; TRUNCATE không chặn (#1) |
| §11b(a) `migrate dev --create-only` không sinh DROP | Đạt | Tôi xác nhận độc lập bằng `migrate diff` DB ↔ schema: rỗng |
| §11b(b) test `pg_indexes`/`pg_trigger` | Đạt | Bắt cả đột biến làm yếu điều kiện |
| §11b(c) dòng README | Đạt | README dòng 82 |
| §11b(d) chú thích `matches` §7.2 | Đạt | Đủ 10 trường |
| Quy tắc 8 timestamptz | Đạt | Test `information_schema` |
| Seed: số lượng, 3 đề tài × 10 trạng thái | Đạt | |
| Seed khớp `transitions.js` + StatusHistory mỗi bước (quy tắc 4) | Đạt | Thêm TC-FR15-20 về người thực hiện |
| FR04 mốc đợt đúng thứ tự | Đạt | TC-FR04-20 |
| FR17 quyết định trỏ đúng snapshot | Đạt | TC-FR17-20 |
| `resetData` ở `beforeAll` mọi file chèn dữ liệu | Đạt | Rà lại như báo cáo |

## Trả lời câu hỏi
1. `T201-qa-guard-bypass.test.js` (và `T201-qa-isolation.test.js`) **chấp nhận nằm ngoài quy ước `resetData`**: chúng không chèn vào `nckh_test`, chỉ tạo/xóa DB nháp `nckh_qa_guard` hoặc chạy tiến trình con; `resetData` từ chối DB không đuôi `_test` là hành vi đúng mà chính file đó kiểm. Quy ước README áp cho file "chèn dữ liệu vào DB test" – đúng phạm vi.
2. `mustChangePassword = true`: đồng ý. Test integration/E2E cần đăng nhập thẳng thì fixture tự hạ cờ (`prisma.user.update`) hoặc tự tạo tài khoản sau `resetData`; không hạ trong seed.

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| 1 | MINOR | `apps/api/prisma/sql/after_init.sql:19-30` | FR15 "chỉ thêm, không xóa": trigger dòng không chặn `TRUNCATE` – đã tái hiện trên 5 bảng (role `postgres`). Không phải lỗi của T203 (đúng §11b; app không bao giờ TRUNCATE) nhưng lớp DB chưa bảo vệ trọn. | Ghi giới hạn vào README/§11b. Nếu `kien-truc-su` muốn bịt: thêm `BEFORE TRUNCATE … FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation()` trong **migration mới**, và `resetData` chạy TRUNCATE trong transaction với `SET LOCAL session_replication_role = replica` (DB test là superuser) – hai điều không mâu thuẫn. Nếu làm, tôi bổ sung test TC-FR15 TRUNCATE đỏ trước. |
| 2 | MINOR | `apps/api/prisma/seed.js` | Seed thiếu dữ liệu cho ca biên T204–T214: chỉ 1 khoa (không có "đề tài khoa khác" cho FR07/FR25/§9.1), 1 đợt (không có đợt cũ/đã đóng), không Invitation PENDING, không đề tài CLOSED Không đạt/`CLOSE_EXPIRED` (phủ định kho chung FR08), không `SimilarityCheck` HIGH/ERROR, không GV chạm hạn mức 5. | Không bắt buộc ở T203 (báo cáo đã ghi một phần). Test T204–T214 tự tạo fixture ca biên sau `resetData`; nếu thêm vào seed thì giữ test TC-FR15-20/TC-FR16-20 xanh. |

Lỗi tìm thấy (BUG mới): không có.

Kết luận: APPROVED – BLOCKER 0, MAJOR 0, MINOR 2.
