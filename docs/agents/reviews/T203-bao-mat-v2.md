# Review T203 – bao-mat – vòng 2
Kết luận: APPROVED

Phạm vi: "Vòng sửa 2" trong `reports/T203.md`, xử lý MAJOR 1 (xác nhận seed theo tên DB) và MINOR 2 (RLS) của `reviews/T203-bao-mat-v1.md`.

## Tôi đã tự kiểm tra
Theo yêu cầu điều phối, tôi **không** bật DB test vì reviewer đang dùng. Tôi không đọc `.env`. Không chạy `npm test` hay seed.

- `npm run lint` → `eslint .`, **exit 0**.
- `git status --short apps/api/vitest.config.js` → không có thay đổi. File đã về đúng bản HEAD, không còn dòng đặt `SEED_CONFIRM_DB`.
- `git grep` theo mẫu chuỗi kết nối có mật khẩu, `CLOUDINARY_URL=cloudinary://`, `-----BEGIN`, `eyJhbGciOi` (bỏ qua `postgres:postgres@localhost`). Chỉ thấy placeholder trong `.env.example` (`<ref>:<password>`), host `.invalid`/`example`/`u:p` trong test và báo cáo, cùng mẫu lệnh trong `.claude/commands`. **Không có bí mật thật.**
- Tôi kiểm tra Prisma đang dùng bản 5.22.0, engine Rust `prisma-client-js`, không có driver adapter `pg`. Như vậy biến môi trường `PGOPTIONS` không có tác dụng. Engine nhận tham số URL `options`: Neon dùng tham số này cho Prisma (`options=endpoint%3D…`). Tôi không chạy thử được vì DB đang bận.
- File đã đọc:
  - `apps/api/prisma/seed.js`: `assertSeedAllowedDb` ở dòng 167–184, thứ tự chốt ở dòng 202–209, khối CLI ở cuối file.
  - `apps/api/scripts/test-db-guard.js`: `DB_LEVEL_CHECK_SQL` ở dòng 40–47.
  - `apps/api/tests/T203-schema.test.js`: `beforeAll`, test cờ ở dòng 206–243, test kho FR06, test RLS ở dòng 287–292.
  - `README.md`: dòng 79–100.
  - `reports/T203.md`: mục "Vòng sửa 2".

## Đối chiếu đặc tả
| Điều kiện đạt | Đạt? | Ghi chú |
|---|---|---|
| Production không có cờ thì seed từ chối (MAJOR 1 vòng 1) | Đạt | `current_setting('nckh.seed_allowed', true)` đọc trên chính kết nối tới DB đích. URL trỏ nhầm sang production (DB `postgres` chưa từng `ALTER DATABASE … SET`) cho kết quả `NULL`. Kết quả này rơi xuống nhánh `DB_LEVEL_CHECK_SQL`, và nhánh đó ném lỗi vì `postgres` không khớp `^[A-Za-z0-9_]+_test$`. Seed từ chối trước khi đếm user hay ghi gì. Chốt `NODE_ENV` chạy trước, chốt "đã có người dùng" chạy sau, cả hai vẫn giữ |
| Nhánh `*_test` không bị lạm dụng ở DB không cục bộ | Đạt | Trên Supabase, `inet_server_addr()` là địa chỉ nội bộ (10.x/172.x), nên điều kiện dải địa chỉ riêng **không** phân biệt được cloud với máy cục bộ. Chỉ còn điều kiện tên DB thật sự chặn. Database production của Supabase luôn là `postgres` và không thể đổi tên thành `*_test`. Nếu ai đó tạo thêm DB `x_test` trong project production, seed chỉ ghi vào DB riêng đó. Data API và ứng dụng không dùng DB này, nên không ảnh hưởng dữ liệu hay tài khoản production. Chấp nhận |
| Kết nối có tự đặt được cờ không | Được, nhưng phải cố ý | Xem #1. `nckh.seed_allowed` là tham số tùy biến (placeholder GUC, mức USERSET). Bất kỳ phiên nào cũng đặt được bằng `SET`, bằng tham số khởi động `options=-c nckh.seed_allowed=on` trên URL (nếu kết nối thẳng, không qua pooler), hoặc bằng `ALTER ROLE … SET` không kèm `IN DATABASE`. `seed.js` không chạy `SET` nào, và README không hướng dẫn cách nào trong số đó. Người vận hành chỉ vượt chốt được khi **tự tay** thêm cờ vào URL hay lệnh, nên đây không phải lỗi trỏ nhầm URL mà chốt cần chặn. Tôi xếp MINOR (phòng thủ chiều sâu), không xếp MAJOR |
| Test chốt cờ | Đạt | DB phụ `nckh_seedguard` (tên không phải `*_test`, đóng vai DB Supabase). (a) Chưa có cờ: seed bị từ chối, số user vẫn 0. (b) Sau `ALTER DATABASE … SET`, mở kết nối mới: seed tạo 51 user. DB phụ luôn bị `DROP … WITH (FORCE)` trong `finally`, kể cả trước khi tạo. Nhánh `*_test` được phủ qua `beforeAll` (seed trên `nckh_test`, không có cờ). Báo cáo có kết quả đột biến cho cả hai cách bỏ chốt. Tôi đọc code thấy khớp, nhưng không chạy lại |
| NFR03: RLS bật, có test khóa | Đạt | Test `relkind IN ('r','p') AND NOT relrowsecurity` trong `public` phải trả rỗng, không có ngoại lệ. README dòng 80 có quy tắc cho bảng mới. Bật RLS cho `_prisma_migrations` là đúng: Prisma chạy bằng role `postgres` là chủ sở hữu bảng nên không bị RLS chặn. View hay materialized view (`v`/`m`) sau này sẽ không được test bắt, xem #2 |
| Không lộ bí mật | Đạt | Xem phần tự kiểm. Thông báo từ chối chỉ in tên DB và lệnh SQL hướng dẫn, không in URL hay user |
| README hướng dẫn và cảnh báo | Đạt | Mục "Dữ liệu mẫu" có bước bật cờ, ghi rõ "không bao giờ chạy lệnh này trên production", có cách xử lý khi lỡ chạy, và thứ tự các chốt khớp code |

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| 1 | MINOR | `apps/api/prisma/seed.js:171-173` | `current_setting()` trả về giá trị **hiệu lực của phiên**, nên phía kết nối có thể ghi đè giá trị đặt ở mức database. Có ba cách: thêm `?options=-c%20nckh.seed_allowed%3Don` vào URL; chạy `SET` trong phiên; hoặc `ALTER ROLE postgres SET nckh.seed_allowed='on'`. Cách cuối, trên một cluster dùng chung cho nhiều DB, sẽ làm mọi DB của role đó qua chốt. Hiện không có đường nào **vô tình** dẫn tới các trường hợp này. Tuy vậy vẫn có một kịch bản thực tế: người vận hành thấy `ALTER DATABASE` bị từ chối trên Supabase, bèn "chữa" bằng cách thêm `options` vào URL trong `.env`, rồi sau đó chỉ đổi host/mật khẩu sang production mà giữ nguyên query string. Khi đó chốt bị vô hiệu. Tôi chưa viết test đỏ vì không được bật DB. Cách tái hiện: thêm `options=-c nckh.seed_allowed=on` vào `urlFor(GUARD_DB)` ở nhánh (a) của test cờ, seed sẽ chạy được | Đọc cờ **đã lưu ở mức database** thay vì giá trị hiệu lực của phiên. Kết nối không ghi đè được giá trị này, chỉ `ALTER DATABASE` mới đổi được: `SELECT EXISTS (SELECT 1 FROM pg_db_role_setting s JOIN pg_database d ON d.oid = s.setdatabase WHERE d.datname = current_database() AND s.setrole = 0 AND 'nckh.seed_allowed=on' = ANY (s.setconfig)) AS allowed`. Catalog này mọi role đều đọc được. Thêm một dòng vào test cờ: URL có `options=-c nckh.seed_allowed=on` mà DB chưa `ALTER DATABASE` thì seed vẫn bị từ chối. Thay đổi này không làm hỏng test (b) hiện có |
| 2 | MINOR | `apps/api/tests/T203-schema.test.js:287-292`; `README.md:80` | Test RLS chỉ xét bảng (`r`/`p`). Nếu sau này thêm view hoặc materialized view trong `public`, Data API Supabase sẽ lộ dữ liệu qua đó, vì view chạy với quyền chủ sở hữu và bỏ qua RLS, còn materialized view không có RLS. Hiện chưa có view nào | Thêm vào test: không có `relkind IN ('v','m')` trong `public`, hoặc view phải `security_invoker = true`. Thêm một câu vào README dòng 80. Có thể làm ở task đầu tiên tạo view |

Hai vấn đề đều là MINOR: sửa, hoặc ghi lý do không sửa. Hai MAJOR/MINOR của vòng 1 đã đóng. Vấn đề #1 ở trên chỉ là phòng thủ chiều sâu, chưa làm lỗi vòng 1 mở lại: khi URL trỏ nhầm sang production mà không ai cố ý thêm cờ, seed vẫn bị từ chối.

Không kiểm:
- Không chạy `npm test`, seed hay các đột biến, do DB test đang bận. Phần đột biến tôi dựa vào báo cáo và việc đọc code.
- Không chạy thử Prisma 5.22 với tham số `options` trên URL. Kết luận cho #1 dựa trên tài liệu và hành vi chuẩn của PostgreSQL với placeholder GUC.
- Chưa xác minh trên Supabase thật rằng role `postgres` được phép `ALTER DATABASE postgres SET nckh.seed_allowed`. Việc này để con người làm khi dựng DB demo. Nếu bị từ chối thì cần quay lại #1 trước khi đưa ra cách khác.

Kết luận: APPROVED – BLOCKER 0, MAJOR 0, MINOR 2.
