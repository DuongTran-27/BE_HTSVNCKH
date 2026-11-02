# Review T203 – reviewer – vòng 1
Kết luận: CHANGES_REQUESTED

## Tôi đã tự kiểm tra
Đã đọc: CLAUDE.md; dòng T203 trong `BANG_CONG_VIEC.md`; `DAC_TA.md` FR04, FR06 (mục 2 và mục 3), FR07, FR15, FR17, mục 5; `design/API_GD2.md` §7.2, §11b, §11c; `reports/T203.md`; `reviews/T203-kiem-thu-v1.md`; `git diff` của `schema.prisma`, `sql/after_init.sql`, `apps/api/package.json`, README; 2 migration và `migration_lock.toml`; `prisma/seed.js`; `tests/T203-schema.test.js`, `tests/T203-qa-seed.test.js`; `scripts/reset-test-db.js`; `similarity/engine.js`, `similarity/service.js`. Tôi không đọc `.env` hay `.env.test`.

```
$ npm run db:test:up      → "Kiểm tra DB test: tất cả OK."
$ npm run db:test:reset   → Applying migration `20261101000000_init`, `20261101000100_search_and_security` … "Đã reset DB test (migrate reset)."
$ NO_COLOR=1 npm test     → shared 2 files 21/21; api 17 files 141/141; web 7 files 32/32; exit 0
$ npm run db:test:down    → "Embedded: đã dừng server." "Embedded: đã xóa …\nckh-db-test."
$ npm run lint            → exit 0
$ npm run format:check    → "All matched files use Prettier code style!", exit 0
$ grep .skip/.only/it.todo trong tests → không có
```
Kết quả khớp báo cáo: 135 test của backend-dev cộng 6 test QA thành 141. Không có test bị xóa, skip hay làm yếu.

Tôi chạy thêm `compare()` thật của `engine.js` trên đúng 30 đề tài mẫu (lấy `TOPICS` và `GENERIC` từ `seed.js`, mỗi đề tài so với 29 đề tài còn lại, ngưỡng mặc định) bằng script nháp:
```
30 { NONE: 26, REVIEW: 4 } maxContent 0.505
```
Bản ghi FR06 trong seed ghi `level NONE`, `corpusSize 0` cho cả 25 lần gửi (xem #2).

`resetData` ở `beforeAll`: tôi đếm lại theo từng file. Mọi file có chèn dữ liệu đều gọi hàm này trước lần chèn đầu tiên. `T201-db-test.test.js` chỉ đọc. Tôi đồng ý với QA rằng `T201-qa-guard-bypass.test.js` và `T201-qa-isolation.test.js` nằm ngoài quy ước.

## Đối chiếu đặc tả
| Điều kiện đạt | Đạt? | Ghi chú |
|---|---|---|
| Migration init + `after_init.sql` | Đạt | `migrate reset` áp đủ 2 migration. Test so khớp `after_init.sql` với migration `search_and_security` |
| §11b có 5 quan hệ đặt tên | Đạt | Có FK `ON DELETE RESTRICT` trong `init/migration.sql:544-610` |
| §11b có 5 index | Đạt | |
| §11b có 5 partial unique, đúng `WHERE` | Đạt | Khớp nguyên văn §11b. Có test P2002, kể cả trường hợp dòng đã kết thúc không bị chặn |
| §11b có 3 trigger chỉ-thêm mới | Đạt | Test kiểm `tgtype & 27`. QA đã thử đột biến và test bắt được |
| §11b(a) ghi kết quả `migrate dev --create-only` | Đạt | Báo cáo chạy 2 lần. QA xác nhận độc lập bằng `migrate diff` |
| §11b(b) test đọc `pg_indexes`/`pg_trigger` | Đạt | |
| §11b(c) dòng README về `DROP INDEX` | Đạt | README dòng 82 |
| §11b(d) chú thích `matches` theo §7.2 | Đạt | `schema.prisma`: đủ 10 trường |
| Seed: 1 khoa, 3 ngành, lĩnh vực, 1 đợt, 2 CB, 8 GV, 40 SV, 30 đề tài đủ 10 trạng thái, từ điển đồng nghĩa | Đạt | Có test đếm. Có thêm ADMIN (xem dưới) |
| Quy tắc 4: mỗi bước có `StatusHistory`, đi qua `TRANSITIONS` | Đạt | `seed.js:270-272` gọi `findTransition`. Có test chuỗi from/to (BE) và test người thực hiện (QA) |
| Quy tắc 4: chạy trong một transaction | Đạt | `seed.js:176` |
| FR04: mốc đợt đúng thứ tự | Đạt | Riêng việc mốc là ngày cố định thì xem #3 |
| FR06: kết quả lưu kèm phiên bản thuật toán, ngưỡng, nội dung đã so | Đạt một phần | Có đủ trường nhưng là giá trị giữ chỗ gắn nhãn thuật toán thật (#2) |
| Seed an toàn: từ chối production và DB đã có dữ liệu | Đạt một phần | Chỉ dựa vào `NODE_ENV` của máy chạy lệnh. DB production còn trống thì không chặn được (#1) |
| Quy tắc 8: `timestamptz` | Đạt | Có test `information_schema` |

### Đánh giá các quyết định của backend-dev
- **Thêm ADMIN `QT001`**: chấp nhận. Hệ thống không có tự đăng ký (FR02), nên dev cần một quản trị viên để tạo tài khoản. ADMIN không có quyền nghiệp vụ (FR25) nên tài khoản này không làm sai dữ liệu đề tài. Test đếm đã khóa `ADMIN: 1`. Rủi ro của tài khoản này khi seed lọt vào production nằm ở #1.
- **`mustChangePassword: true` cho mọi tài khoản**: chấp nhận với dev và E2E. Fixture E2E nên tự hạ cờ hoặc tự tạo tài khoản, đúng như QA trả lời. Tuy vậy, lập luận trong báo cáo ("nếu seed lọt ra môi trường khác thì vẫn buộc đổi") **sai về bảo mật**. Cờ này không bảo vệ gì khi mật khẩu đã công khai: người đăng nhập đầu tiên bằng `Nckh@2026-dev` sẽ được hệ thống mời đặt mật khẩu của chính họ, tức chiếm luôn tài khoản, kể cả `QT001`. Xem #1.
- **SimilarityCheck giữ chỗ**: có gây hiểu nhầm, xem #2.
- **Nhánh `db push + after_init.sql` trong `reset-test-db.js` giờ thành code chết**: nên xóa, xem #4. Việc này thuộc devops, không chặn T203.

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| 1 | MAJOR | `apps/api/prisma/seed.js:159-164`; `README.md:73-80`; `reports/T203.md` mục Mật khẩu | **Seed chưa thực sự chặn được production.** Chặn theo `NODE_ENV` là kiểm biến môi trường của *máy chạy lệnh*, không phải của DB. `.env.example` đặt sẵn `NODE_ENV=development`, và README mục "Kết nối Supabase" đặt `npx prisma db seed` ngay sau `migrate deploy`. Hiện chưa có cách nào khác để tạo quản trị viên đầu tiên trên production. Vì vậy người vận hành rất dễ chạy seed lên DB production còn trống (chưa có user) để "lấy tài khoản admin". Seed sẽ chạy thành công và tạo 51 tài khoản dùng chung mật khẩu công khai trong README, trong đó có `QT001` ADMIN. Như đã nói ở trên, `mustChangePassword` không giảm được rủi ro này. | (a) Bắt buộc xác nhận rõ ràng trước khi ghi, ví dụ yêu cầu `SEED_CONFIRM_DB=<tên database>` khớp với tên DB thật (đọc bằng `SELECT current_database()`), và in host/DB đích. Thiếu hoặc lệch thì từ chối bằng thông báo tiếng Việt. Ngoài ra vẫn giữ hai điều kiện chặn hiện có. (b) README: tách seed khỏi luồng dựng DB, thêm ghi chú "chỉ DB dev/demo, không bao giờ chạy trên production; lỡ chạy thì xóa toàn bộ tài khoản mẫu". Ghi rõ việc tạo quản trị viên đầu tiên trên production là việc khác (đưa vào T706 hoặc một task mới). (c) Sửa lập luận về `mustChangePassword` trong báo cáo. (d) Thêm test: seed từ chối khi thiếu hoặc sai xác nhận. Nên mời `bao-mat` xem lại phần này. |
| 2 | MINOR | `apps/api/prisma/seed.js:290-301` | Bản ghi `SimilarityCheck` mẫu là giá trị giữ chỗ (`corpusSize 0`, `level NONE`, `matches []`) nhưng mang `algorithmVersion` thật `tfidf-bigram-v1+trgm`, nên trông như kết quả FR06 thật. FR07 hiển thị kết quả FR06 trên màn hình xét duyệt, nên khi demo cán bộ sẽ thấy "không cảnh báo, kho 0 đề tài" ở mọi hồ sơ mẫu. Trong khi đó, chạy thuật toán thật trên chính 30 đề tài này cho 4 đề tài ở mức REVIEW (contentScore tối đa 0,505). Nhiều lần gửi trong seed diễn ra sau khi đã có đề tài khác ở trạng thái nằm trong kho so, nên `corpusSize 0` cũng mâu thuẫn với chính dữ liệu mẫu. Với dev thì chưa sai đặc tả, nhưng dữ liệu này làm sai lệch phần trình bày FR06/FR07 khi demo. | Chọn một trong hai: (a) gọi `compare()` thật (thuần JS, rẻ) với kho tại thời điểm gửi, gồm các đề tài trạng thái thuộc kho §3 của chính seed, rồi lưu kết quả đúng như `runSimilarityCheck` (khi T211 xong thì chuyển sang dạng `matches` đầy đủ của §7.2); hoặc (b) gắn `algorithmVersion: 'seed-placeholder'` để UI và người đọc phân biệt được. Nên chọn (a). |
| 3 | MINOR | `apps/api/prisma/seed.js:198-201, 239, 325, 332` | Mọi mốc thời gian là ngày cố định. Đợt đóng đăng ký ngày 31/12/2026, tức khoảng 2 tháng sau hôm nay. Sau ngày đó, dữ liệu mẫu không còn "đợt đang mở đăng ký": các thao tác FR04 (tạo đề tài, gửi đề nghị GVHD) sẽ bị từ chối khi demo hoặc nghiệm thu, nhiều khả năng rơi vào năm 2027. Test hiện có vẫn xanh nên không bắt được lỗi này. | Tính mốc theo thời điểm chạy seed, ví dụ `base = now − 60 ngày`, `regCloseAt = now + 90 ngày`, các mốc khác suy ra từ đó. Giữ test TC-FR04-20 (mốc lịch sử < now, `REQUEST_ADVISOR` nằm trong cửa sổ đăng ký). Thêm một assert: `regOpenAt ≤ now ≤ regCloseAt` ngay sau khi seed. |
| 4 | MINOR | `apps/api/scripts/reset-test-db.js:36-44`; `docs/agents/design/QD_DB_TEST.md:147` | Từ T203 đã có migration, nên nhánh `db push --force-reset` + `after_init.sql` không còn chạy. Nhánh này cũng che lỗi: nếu thư mục `migrations` bị thiếu (checkout lỗi, lỡ xóa), reset sẽ âm thầm dựng schema bằng `db push`, khác với CI và production, nhưng vẫn báo thành công. `QD_DB_TEST.md:147` vẫn nhắc nhánh này. Code của devops (T201). | Giao DO: bỏ nhánh `else`, khi không có migration thì báo lỗi tiếng Việt và thoát ≠0. Cập nhật chú thích đầu file và `QD_DB_TEST.md:147`. Có thể gộp vào T204 hoặc T205, hoặc mở một task nhỏ. Không chặn T203. |

Tôi giữ nguyên 2 MINOR của QA (`reviews/T203-kiem-thu-v1.md`): TRUNCATE không bị trigger chặn (đã chuyển sang T204), và seed còn thiếu một số ca biên. Tôi không thấy cần nâng mức hai mục này.

Không kiểm: driver `docker`/CI (Docker không chạy trên máy này, giống báo cáo); không tự chạy `migrate dev --create-only` (dựa vào báo cáo và `migrate diff` của QA).

Kết luận: CHANGES_REQUESTED – BLOCKER 0, MAJOR 1, MINOR 3.
