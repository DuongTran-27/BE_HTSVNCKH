# Review T203 – reviewer – vòng 2
Kết luận: APPROVED

## Tôi đã tự kiểm tra
Đã đọc: `reviews/T203-reviewer-v1.md`; `reports/T203.md` mục "Vòng sửa 1"; `prisma/seed.js` (toàn bộ); `vitest.config.js` (diff); `tests/T203-schema.test.js` (14 test); `tests/T203-qa-seed.test.js`; `similarity/service.js` (`PUBLIC_CORPUS_STATUSES`, `PENDING_SAME_ROUND_STATUSES`, `runSimilarityCheck`); `DAC_TA.md` mục 3 (kho so, ngưỡng, giải trình ≥ 50 từ); `git diff README.md`; dòng T203, T207a, T502 trong `BANG_CONG_VIEC.md`. Tôi không đọc `.env` hay `.env.test`. Shell không export `DATABASE_URL`/`DIRECT_URL`/`DB_TEST_DRIVER` (đếm được 0).

```
$ npm run db:test:up       → "Kiểm tra DB test: tất cả OK."
$ npm run db:test:reset    → Applying `20261101000000_init`, `20261101000100_search_and_security`; "Đã reset DB test (migrate reset)."
$ NO_COLOR=1 npm test      → shared 2 files 21/21; api 17 files 144/144; web 7 files 32/32; exit 0
$ npm run db:test:down     → "Embedded: đã dừng server." "Embedded: đã xóa …\nckh-db-test."
$ npm run lint             → eslint . không lỗi; npx eslint apps/api → exit 0
$ npm run format:check     → "All matched files use Prettier code style!"
$ grep .skip/.only/it.todo apps/api/tests → 0
```
Kết quả khớp phần bằng chứng của vòng sửa 1 (144 = 135 + 6 QA + 3 test mới). `T203-qa-seed.test.js` vẫn có 6 test và có mtime trước review vòng 1, tức chưa bị sửa. `T203-schema.test.js` tăng từ 11 lên 14 test. Không test cũ nào bị xóa hay làm yếu.

**Đột biến trên `seed.js`.** Mỗi lần tôi chỉ đổi một chỗ, chạy hai file T203, rồi chép lại bản gốc từ scratchpad. Sau cùng `cmp` xác nhận file đã khôi phục y nguyên.
| Đột biến | Kết quả |
|---|---|
| A. Bỏ `await assertConfirmedDb(...)` | Đỏ: `từ chối khi thiếu hoặc sai SEED_CONFIRM_DB …` |
| B. `compare({ corpus: [] })` (giống bản giữ chỗ cũ) | Đỏ: `kết quả FR06 trong seed là kết quả thuật toán thật …` |
| C. `justification: null` kể cả khi HIGH | Đỏ: cùng test trên |
| D. `nowMs` cố định về 01/01/2025 | Đỏ: `đợt đang mở đăng ký tại thời điểm chạy seed` |
| F. Bỏ `j !== i` (đề tài tự so với chính mình) | Đỏ: test FR06 |
| E. Thêm `DRAFT`, `REJECTED`, `CANCELLED` vào `CORPUS_STATUSES` | **Xanh 20/20**: test không bắt được kho so sai phạm vi (xem #5) |

**Tự đối chiếu kho so FR06.** Tôi viết script nháp (gọi `assertTestDbEnv` trước, chỉ chạy trên `nckh_test`, xóa file ngay sau khi chạy) để seed lại. Với mỗi `SimilarityCheck`, script tự tính kho đúng theo mục 3 từ `StatusHistory` và `createdAt` trong DB: đề tài khác, trạng thái ngay trước thời điểm gửi thuộc 7 trạng thái của kho. Kết quả:
```
HIGH words 92 match0 {"code":"NCKH-2026-0005","level":"HIGH",…,"titleScore":0.338,"contentScore":0.552}
checks 25 { NONE: 21, HIGH: 1, REVIEW: 3 } mismatch 0
2026-2027 2026-09-02T13:05:18.437Z 2027-01-30T13:05:18.437Z
```
`corpusSize` của cả 25 lần kiểm khớp với kho tôi tự tính. Không `matches` nào trỏ về chính đề tài, không hồ sơ ngoài mức HIGH nào có giải trình. Hồ sơ HIGH có giải trình 92 từ (≥ 50) và đạt HIGH nhờ `contentScore 0,552 ≥ 0,55`, đúng quy tắc "mức là mức cao hơn trong hai điểm".

**Tính xác định theo `now`.** Mọi mốc đều là `now + hằng số`, và lịch sử bắt đầu từ `regOpenAt + 4 ngày`, mỗi bước cách nhau 1 ngày. Thứ tự tương đối giữa các bước vì vậy không phụ thuộc `now`, nên kho so, mức FR06 và chuỗi trạng thái giống nhau ở mọi lần chạy. Chỉ chuỗi `academicYear` thay đổi theo `now`. `seed(prisma, { now })` cho phép cố định thời điểm khi cần. Test FR04 dùng `new Date()` thật ở bước kiểm `regOpenAt ≤ now ≤ regCloseAt`. Cách này vẫn ổn định vì cửa sổ là −60/+90 ngày.

## Đối chiếu từng vấn đề vòng 1
| # vòng 1 | Mức | Đã sửa? | Bằng chứng |
|---|---|---|---|
| 1 Seed không chặn được production | MAJOR | **Đã đóng** | (a) `seed.js:167-175` đọc `current_database()` trên chính kết nối Prisma và từ chối bằng thông báo tiếng Việt khi `SEED_CONFIRM_DB` thiếu, rỗng hoặc lệch. Bước này chạy trước kiểm "đã có người dùng" (`:197-198`), và hai chốt cũ vẫn giữ. CLI in DB/host đích trước khi kiểm (`:447-448`). (b) README đã bỏ seed khỏi luồng Supabase và có mục riêng "Dữ liệu mẫu (chỉ DB dev/demo)" với cảnh báo, cách xử lý khi lỡ chạy, và giải thích vì sao `mustChangePassword` không bảo vệ được. Việc tạo quản trị viên đầu tiên đã có chủ trong T207a. (c) Lập luận sai trong báo cáo đã được gạch và sửa. (d) Có test mới, và đột biến A làm test này đỏ. `vitest.config.js:8` chỉ đặt `SEED_CONFIRM_DB` sau khi `assertTestDbEnv` đã chấp nhận URL, nên không mở rộng phạm vi ghi. |
| 2 SimilarityCheck chỉ là giá trị giữ chỗ | MINOR | **Đã đóng** | Seed gọi `compare()` thật. Kho so là `PUBLIC_CORPUS_STATUSES ∪ PENDING_SAME_ROUND_STATUSES`, import từ `service.js` nên không chép lại danh sách. Kho loại trừ chính đề tài (`j !== i`) và lấy trạng thái ngay trước lúc gửi. Từ đồng nghĩa và ngưỡng mặc định dùng giống `runSimilarityCheck`. Kết quả HIGH có giải trình ≥ 50 từ. Tôi tự tính lại và không thấy sai lệch nào. Điểm tên tính bằng `trigramSimilarity` JS thay cho pg_trgm, đã ghi chú ở `:348`, chấp nhận được với dữ liệu mẫu. |
| 3 Ngày cố định | MINOR | **Đã đóng** | `seed.js:214-224, 250-252, 390, 397` tính mốc từ `now`. Có test `regOpenAt ≤ now ≤ regCloseAt`, và đột biến D làm test đỏ. TC-FR04-20 của QA vẫn xanh. |
| 4 Nhánh `db push` chết trong `reset-test-db.js` | MINOR | Chuyển task | Đã ghi vào T502 (DO) và dẫn nguồn MINOR 4. Chấp nhận, không chặn T203. |

## Đối chiếu đặc tả (phần thay đổi ở vòng này)
| Điều kiện đạt | Đạt? | Ghi chú |
|---|---|---|
| FR06 mục 3: kho gồm Đang thực hiện/Chờ đóng/Đã đóng và hồ sơ đang chờ của nhóm khác cùng đợt; không so với Nháp, Bị từ chối, Đã hủy và chính đề tài | Đạt | Code đúng, tôi đã tự đối chiếu (mismatch 0). Test chưa khóa được phạm vi kho (#5) |
| FR06: lưu kèm phiên bản thuật toán, ngưỡng, nội dung đã so | Đạt | `algorithmVersion` lấy từ `result`, có `thresholds` và `contentHash(content)` |
| FR06: HIGH bắt buộc giải trình ≥ 50 từ | Đạt | 92 từ. Test kiểm điều kiện này cho mọi bản ghi HIGH |
| FR04: đợt đang mở đăng ký khi dùng dữ liệu mẫu | Đạt | Mốc tính từ `now` |
| Quy tắc 4: transaction và `StatusHistory` qua `TRANSITIONS` | Đạt | Không đổi so với vòng 1. Phần tách vòng lặp vẫn kiểm `tr.from === status` (`:328-330`) |
| Quy tắc 7: văn bản tiếng Việt | Đạt | |

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| 5 | MINOR | `apps/api/tests/T203-schema.test.js:220-233` | Tên test nói "trên kho tại thời điểm gửi", nhưng test không kiểm phạm vi kho. Đột biến E (thêm `DRAFT`/`REJECTED`/`CANCELLED` vào kho) vẫn xanh 20/20. Code hiện tại đúng, tôi đã tự tính lại, nhưng sau này ai sửa `CORPUS_STATUSES` hoặc `statusBefore` sai thì test sẽ không báo. | Trong test, dựng lại trạng thái từng đề tài từ `StatusHistory` (`at < check.createdAt`, loại `createdAt ≥ check.createdAt` và chính đề tài), lọc theo `PUBLIC_CORPUS_STATUSES ∪ PENDING_SAME_ROUND_STATUSES` import từ `service.js`, rồi `expect(check.corpusSize).toBe(expected)`. Thêm assert `matches` không chứa `topicId` của chính đề tài, và mọi bản ghi không phải HIGH có `justification === null`. Có thể làm ở T204 hoặc khi T211 đụng tới seed. |
| 6 | MINOR | `apps/api/prisma/seed.js:167-175, 447-448` | `SEED_CONFIRM_DB` chỉ đối chiếu tên database. Trên Supabase, cả DB production lẫn DB demo đều tên `postgres`, nên xác nhận này không phân biệt được hai môi trường. Ngoài ra, `host(inet_server_addr())` in ra IP nội bộ (hoặc IP của pooler) chứ không phải tên host người vận hành nhận ra được. Chốt này vẫn chặn được việc vô tình chạy seed (đúng mục tiêu MAJOR 1), nhưng chưa chặn được việc chạy nhầm DB. | Để `bao-mat` quyết định (câu hỏi 0 trong báo cáo). Gợi ý: so `SEED_CONFIRM_DB` với `<host trong DATABASE_URL>/<current_database()>` và in host lấy từ URL (không in thông tin xác thực). Không chặn T203. |

Hai MINOR của QA vòng 1 vẫn giữ nguyên chỗ đã chuyển: TRUNCATE chuyển sang T204, các ca biên của seed ghi ở mục "Còn lại".

Không kiểm: driver `docker`/CI (Docker không chạy trên máy này); không chạy lại `migrate dev --create-only` (vòng này không đổi schema hay migration).

Kết luận: APPROVED – BLOCKER 0, MAJOR 0, MINOR 2.
