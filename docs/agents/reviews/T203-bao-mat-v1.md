# Review T203 – bao-mat – vòng 1
Kết luận: CHANGES_REQUESTED

Phạm vi: chốt chặn seed (MAJOR 1 của `reviews/T203-reviewer-v1.md`) sau "Vòng sửa 1", cùng các phần schema/migration liên quan bảo mật.

## Tôi đã tự kiểm tra
Theo yêu cầu điều phối, tôi **không** bật DB test vì reviewer khác đang dùng cổng 54329. Tôi không đọc `.env`. Riêng `.env.example` tôi chỉ đọc qua bộ lọc che giá trị dài.

- `npm run lint`: lần đầu **exit 1** với lỗi `apps/api/prisma/seed.js 131:7 'JUSTIFICATION' is assigned a value but never used`. Lúc đó `seed.js` vừa được sửa trước đó 3 giây (mtime 20:04:51, lệnh chạy lúc 20:04:54), tức là có người đang sửa file đồng thời. Tôi chạy lại lúc 20:05:00 (mtime 20:04:59) thì **exit 0**. Tôi coi lần lỗi đầu là do đọc đúng lúc file đang sửa dở, không tính là báo cáo sai. Người sửa cần chạy lại `npm run lint` sau lần ghi cuối cùng và dán kết quả vào báo cáo. Phần chốt chặn (`assertConfirmedDb`, kiểm `NODE_ENV`, kiểm "đã có người dùng") tôi đã đọc lại sau lần sửa đó và không thấy thay đổi.
- `diff after_init.sql migrations/*_search_and_security/migration.sql` (đã bỏ CR): giống hệt.
- Grep bí mật bằng `git grep` theo mẫu chuỗi kết nối có mật khẩu, `CLOUDINARY_URL`, `-----BEGIN`, JWT `eyJhbGciOi`: chỉ thấy `.env.test` và các test, đều là `postgres:postgres@localhost:54329/nckh_test` hoặc host `.invalid`/`example`. Đây không phải bí mật thật. `.env.example` chỉ chứa placeholder (`<region>`, `<key>:<secret>`, hai `*_SECRET` là chuỗi gợi ý thay giá trị).
- `reset-test-db.js:39` chạy `migrate reset --force --skip-seed`, nên reset DB test không kích hoạt seed.
- File đã đọc: `CLAUDE.md`, `apps/api/prisma/seed.js` (chốt chặn ở dòng 166–200, khối CLI ở dòng 444–457), `README.md` (mục "Kết nối Supabase" và "Dữ liệu mẫu"), `apps/api/vitest.config.js`, `apps/api/scripts/test-db-guard.js`, `apps/api/src/lib/password.js`, `apps/api/tests/T203-schema.test.js` (dòng 190–215), `apps/api/prisma/sql/after_init.sql`, mô hình `User`/`RefreshToken` trong `schema.prisma`, `reports/T203.md` (mục "Vòng sửa 1"), `reviews/T203-reviewer-v1.md`, `.env.example` (đã che giá trị), `docs/DAC_TA.md` NFR03.

## Đối chiếu đặc tả
| Điều kiện đạt | Đạt? | Ghi chú |
|---|---|---|
| Seed không chạy nhầm lên production (MAJOR 1 của reviewer) | Đạt một phần | Đủ dùng với DB cục bộ (`nckh_dev`). Với Supabase thì không phân biệt được dự án nào, xem #1 |
| NFR01: Argon2id | Đạt | `passwordHasher` dùng argon2id với m=19456 KiB, t=2, p=1 (mức tối thiểu OWASP). Seed băm một lần, cùng salt cho 51 tài khoản. Chấp nhận vì chỉ dùng cho dev, và mật khẩu đã công khai nên chung salt không làm mất thêm gì |
| FR02: `mustChangePassword` | Đạt (dev) | Báo cáo đã sửa lập luận: cờ này không bảo vệ được tài khoản có mật khẩu công khai |
| FR15/FR17: trigger chỉ-thêm | Đạt | 5 trigger `BEFORE UPDATE OR DELETE` gọi `forbid_mutation()`, có test `pg_trigger`. TRUNCATE không bị chặn (QA đã chuyển sang T204). Hàm không có `SECURITY DEFINER` |
| NFR03: RLS bật, không policy | Đạt cho các bảng hiện có | Không có test, và các bảng tạo ở migration sau sẽ không tự được bật. Xem #2 |
| NFR03: không có bí mật trong repo | Đạt | Xem phần tự kiểm |
| Dữ liệu cá nhân trong seed | Đạt | Email `@nckh.example` (tên miền dành riêng), họ tên tổ hợp giả. Không có dữ liệu thật |

## Trả lời câu hỏi của backend-dev
**Có nên chặn theo host `*.supabase.co` không?** Không nên. Lý do: DB demo cũng có thể nằm trên Supabase như backend-dev đã nói. Thêm nữa, URL pooler `aws-0-<region>.pooler.supabase.com` trong `.env.example` không khớp `*.supabase.co`, nên chặn theo host vừa chặn nhầm demo vừa bỏ lọt production. Vấn đề thật nằm ở chỗ khác, xem #1. Cách xác nhận nên gắn với **chính DB đích**, không dựa vào tên DB hay tên host.

**Thông báo lỗi và dòng `Database đích: "<db>" tại <host>` có lộ gì không?** Không lộ gì nhạy cảm. Thông tin chỉ in ra terminal của người vận hành, gồm tên DB và `inet_server_addr()` (trên Supabase là địa chỉ nội bộ). Không có user hay mật khẩu. Lỗi kết nối của Prisma (`e.message`) có thể in host và username. Username của pooler Supabase có chứa project ref, nhưng đó không phải bí mật. Không cần sửa.

**`vitest.config.js` tự đặt `SEED_CONFIRM_DB` có mở đường seed nhầm DB khác không?** Không. Giá trị chỉ được đặt sau khi `assertTestDbEnv` xác nhận mọi URL Prisma trỏ tới localhost và tên DB dạng `*_test`. Nếu chốt chặn thất bại thì tiến trình `exit(1)` trước khi đặt. Seed còn so giá trị này với `current_database()` trên chính kết nối đang dùng, nên dù tiến trình con thừa kế biến, nó vẫn chỉ khớp DB tên `nckh_test`. DB production không thể mang tên đó. Nếu làm theo đề xuất ở #1 thì có thể bỏ hẳn dòng này, vì DB test sẽ được nhận diện bằng `DB_LEVEL_CHECK_SQL` sẵn có.

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| 1 | MAJOR | `apps/api/prisma/seed.js:166-175`; `README.md` mục "Dữ liệu mẫu" | **Xác nhận bằng `current_database()` không phân biệt được các DB trên Supabase.** Mọi project Supabase đều dùng database tên `postgres` (xem `.env.example`: `.../postgres`). Vì vậy `SEED_CONFIRM_DB=postgres` khớp cả DB dev/demo **lẫn** DB production. Người vận hành chạy seed thường xuyên trên DB demo sẽ quen gõ đúng câu lệnh đó. README bước 2 lại dùng chung một file `apps/api/.env` cho mọi môi trường. Chỉ cần trong `.env` đang là URL production (vừa chạy `migrate deploy` ở bước 3) thì seed đi qua cả 3 chốt: `NODE_ENV` của máy cục bộ là `development`, tên DB khớp `postgres`, và DB production mới dựng còn trống. Kết quả là đúng kịch bản trong MAJOR 1 của reviewer: 51 tài khoản dùng mật khẩu công khai, có `QT001` ADMIN. Dòng in `Database đích: "postgres" tại 10.x.x.x` cũng không giúp người vận hành nhận ra mình đang trỏ vào đâu. Chốt "DB đã có người dùng" chỉ bắt đầu bảo vệ production sau khi T207a tạo admin đầu tiên. Khoảng hở rơi đúng vào lúc vừa dựng production xong. Đây là lỗi vận hành, không phải lỗ hổng khai thác từ xa, nên tôi để MAJOR, không nâng BLOCKER. | Đổi điều kiện xác nhận thành **chủ ý ghi vào chính DB đích**. Đây là thao tác chỉ làm một lần trên DB dev/demo và không bao giờ làm trên production. Ví dụ: `ALTER DATABASE postgres SET nckh.seed_allowed = 'on';` (role `postgres` của Supabase được phép đặt tham số tùy biến có dấu chấm; kết nối mới sẽ đọc giá trị này). Seed kiểm `current_setting('nckh.seed_allowed', true) = 'on'`, **hoặc** DB vượt qua `DB_LEVEL_CHECK_SQL` (dạng `*_test`, địa chỉ cục bộ). Với điều kiện này, URL nào trỏ nhầm sang production vẫn bị từ chối, vì production không có cờ. Sau đó có thể bỏ `SEED_CONFIRM_DB` và dòng đặt biến trong `vitest.config.js`. Nếu muốn giữ thêm một bước gõ xác nhận thì phải so với giá trị riêng cho từng project, chẳng hạn project ref. Giữ chốt `NODE_ENV` và chốt "đã có người dùng". Thông báo lỗi tiếng Việt nên chỉ cách bật cờ trên DB dev/demo. README: thêm bước bật cờ vào mục "Dữ liệu mẫu", và ghi rõ không chạy lệnh đó trên production. Test: (a) DB không có cờ và không phải `*_test` thì bị từ chối, số user không đổi. Có thể dựng trên DB test bằng một DB phụ tên `nckh_seedguard`, tạo rồi xóa giống cách `T201-qa-guard-bypass.test.js` đã làm. (b) DB có cờ thì seed chạy được. |
| 2 | MINOR | `apps/api/prisma/sql/after_init.sql:38-44`; `apps/api/tests/T203-schema.test.js` | RLS chỉ được bật cho các bảng **có tại thời điểm migration này chạy**. Bảng tạo ở migration sau (T204+: thông báo, file, v.v.) sẽ không có RLS, và Data API Supabase dùng anon key đọc được bảng đó. Điều này vi phạm NFR03. Hiện cũng chưa có test nào khóa RLS. | Thêm test: `SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity` phải trả rỗng. Test này sẽ đỏ ngay khi một migration sau quên bật RLS. Thêm một dòng vào README mục "Đổi schema": bảng mới phải có `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` trong migration. |

Không còn vấn đề nào khác. Mật khẩu dev `Nckh@2026-dev` công khai là chủ ý, đã được ghi trong README và chỉ an toàn khi #1 chặn được việc seed chạy nhầm. Hai hàm `immutable_unaccent` và `forbid_mutation` nằm trong schema `public` nên Data API có thể gọi qua `/rpc`, nhưng chỉ `immutable_unaccent` gọi trực tiếp được và hàm này vô hại.

Không kiểm: không chạy `npm test` hay seed (DB test đang bận); không thử Data API Supabase thật (NFR03, việc của con người trên môi trường thật); chưa viết test đỏ cho #1 vì cách sửa còn tùy phương án đã chọn, phần đề xuất ở trên đã mô tả test cần có.

Kết luận: CHANGES_REQUESTED – BLOCKER 0, MAJOR 1, MINOR 1.
