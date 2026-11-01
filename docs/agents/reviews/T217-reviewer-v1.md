# Review T217 – reviewer – vòng 1
Kết luận: CHANGES_REQUESTED

## Tôi đã tự kiểm tra
- Đã đọc: `CLAUDE.md`, `docs/agents/QUY_TRINH.md`, `docs/agents/reports/T217.md`, `docs/agents/design/QD_DB_TEST.md`, `docs/agents/design/SPIKE_EMBEDDED_PG.md`, `docs/agents/reports/T201.md`, `docker-compose.test.yml`, `docker/postgres-test/init.sql`, `apps/api/scripts/reset-test-db.js`, `package.json` gốc, `apps/api/package.json`, `apps/api/prisma/sql/after_init.sql`, `apps/api/src/modules/similarity/prismaRepo.js:10`, `docs/DAC_TA.md:209` (NFR08), `docs/agents/CAU_HOI.md` #1, bảng việc T201/T202/T203/T217. Không đọc `apps/api/.env.test` (quy tắc 6); nội dung URL lấy từ báo cáo T201 và README.
- Phạm vi: `git status` cho thấy T217 chỉ thêm `design/QD_DB_TEST.md` và `reports/T217.md` (spike là của devops). Không có code, test hay dependency nào đổi. `package.json` và `apps/api/package.json` chưa có `embedded-postgres`. Không chạy hay cài embedded-postgres theo yêu cầu.
- `npm test` (tự chạy, 2026-11-01), khớp phần điều phối viên dán trong báo cáo:
  ```
  RUN  v4.1.12 D:/Website_HTWLHD_SV_NCKH_demo3/packages/shared
  Test Files  2 passed (2)
       Tests  21 passed (21)
  RUN  v4.1.12 D:/Website_HTWLHD_SV_NCKH_demo3/apps/api
  Test Files  9 passed (9)
       Tests  87 passed (87)
  ```
- `npm run lint`: `'eslint' is not recognized as an internal or external command`. Lỗi có từ trước (ESLint thuộc T202). Task này chỉ có tài liệu nên lỗi không thuộc T217.
- Đối chiếu số liệu spike với QĐ: bản `16.14.0-beta.17` phát hành 2026-06-05, `16.15.0-beta.19` phát hành 2026-10-30, pg_trgm 1.6, unaccent 1.1, TZ, 7,5 s, user không có quyền admin. QĐ trích đúng cả. Nhận định semver ở §4.1 đúng: bản prerelease `16.15.0-beta.*` không khớp `^16.14.0-beta.17`.

## Đối chiếu đặc tả
| Điều kiện đạt | Đạt? | Ghi chú |
|---|---|---|
| Nhất quán công nghệ đã chốt (CLAUDE.md) | Đạt | Chỉ thêm devDependency `embedded-postgres`, dùng cục bộ, ghim chính xác. Không đổi stack runtime. Prisma, `reset-test-db.js` và `.env.test` giữ nguyên. Có điểm `pg` còn bỏ ngỏ, xem MAJOR 1 |
| NFR08: DB test tách riêng | Đạt | Cả 3 trình dùng chung hợp đồng `:54329/nckh_test` (§1.4). Script reset vẫn chặn host không cục bộ. DB dùng một lần (xóa thư mục dữ liệu, giống tmpfs) |
| Có pg_trgm/unaccent không | Đạt | Spike có bằng chứng thật. Chữ `Đ` để T201 kiểm. Thiếu extension là tiêu chí loại B (§5.3), đúng quy tắc 5 |
| Cổng 54329, timezone | Đạt | Đặt tường minh `-c timezone=…`, không theo hệ điều hành. Yêu cầu T202 đặt `TZ` cho service CI (§4.3) |
| CI hay chỉ cục bộ | Đạt | CI luôn dùng service `postgres:16`. Embedded không dùng trên CI. Khi hai bên khác kết quả thì lấy CI (§1.1, §1.5, §3) |
| Quy tắc chọn trình không che lỗi | Đạt một phần | Ép bằng biến thì không chuyển trình khác. Tự chọn thì in ra trình đã chọn. Còn lệch `external` (MINOR 2) và `down` có thể chọn sai trình (MINOR 3) |
| Rủi ro chuỗi cung ứng | Đạt một phần | Đã có: ghim chính xác, lockfile `integrity`, luật ≥14 ngày, không tự nâng bản, nâng bản cần người dùng duyệt. Còn thiếu thứ tự kiểm script cài và gói linux-x64 (MINOR 6) |
| Danh sách việc T201 đủ và kiểm được | Chưa | §6 có đủ việc, nhưng §4.4 (bằng chứng của T201) không thực hiện được bằng công cụ QĐ cho phép (MAJOR 1). Phép kiểm similarity quá lỏng (MINOR 4) |

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| 1 | MAJOR | `docs/agents/design/QD_DB_TEST.md:52`, `:61-70`, `:105` (§5.2 đoạn cuối) | §4.2 bước 5 cấm dùng `pg` trực tiếp và chỉ cho dùng `npx prisma db execute`. Nhưng `prisma db execute` **không in kết quả truy vấn**, chỉ báo chạy xong. Vì vậy §4.4 ("in ra màn hình, đây cũng là bằng chứng của T201") không làm được. Câu "lỗi ở bất kỳ dòng nào thì `up` thoát khác 0" cũng vô nghĩa với các dòng `SHOW`/`SELECT`: giá trị sai (timezone `Asia/Bangkok`, encoding `WIN1252`, unaccent không bỏ dấu `Đ`) không phải lỗi SQL. Nếu làm đúng chữ, ta có một phép kiểm luôn qua, che lỗi đúng ở các điểm V1/V4 còn mở. Còn nếu T201 "đề xuất thêm `pg`" thì lại phải thêm một vòng duyệt thư viện, trong khi QĐ này chính là chỗ để duyệt. | Chốt ngay trong QĐ một trong hai cách. (a) Duyệt `pg` (MIT, phổ biến, đã có sẵn trong cây phụ thuộc qua embedded-postgres) làm devDependency ghim chính xác của `apps/api`, chỉ dùng trong `db-test.js`. Script so từng giá trị với kỳ vọng, sai thì thoát ≠0, và in bảng kết quả. (b) Viết §4.4 thành khối `DO $$ … IF current_setting('TimeZone') <> 'Asia/Ho_Chi_Minh' THEN RAISE EXCEPTION …` cho từng điều kiện (version 16, UTF8, có 2 extension ở cả `nckh_test` và `template1`, `unaccent('Đề tài Nghiên cứu') = 'De tai Nghien cuu'`), chạy bằng `prisma db execute`, và ghi rõ bằng chứng là "chạy xong không lỗi". Tôi nghiêng về (a). Áp dụng cùng phép kiểm này cho cả 3 trình (`docker`, `embedded`, `external`), vì `external` ở §1.3 cũng cần "kiểm tra kết nối và extension" |
| 2 | MINOR | `QD_DB_TEST.md:13`, `:14`, `:16` | Dòng 13 liệt kê `DB_TEST_DRIVER=docker\|embedded`, còn dòng 16 và §6.2 có thêm `external`. Dòng 14 cũng chưa nói rõ: khi đã tự chọn Docker (vì `docker info` thoát 0) mà `compose up` lỗi thì có chuyển sang embedded không | Sửa dòng 13 thành `docker\|embedded\|external`; giá trị khác thì báo lỗi. Thêm một câu: "Đã chọn trình (ép hoặc tự chọn) thì lỗi ở trình đó là lỗi, không chuyển trình khác" |
| 3 | MINOR | `QD_DB_TEST.md:54` | `down` chọn trình lại bằng `docker info`. Nếu `up` chạy embedded rồi Docker sống lại, `down` sẽ gọi `compose down` và để server embedded chạy tiếp. Ngược lại cũng có thể xảy ra | `down` (khi không ép bằng biến) dừng theo trạng thái thật: có thư mục dữ liệu embedded thì `pg_ctl stop` + xóa; Docker sống thì `compose down`. Có thể làm cả hai, vì cả hai đều không lỗi khi không có gì để dừng |
| 4 | MINOR | `QD_DB_TEST.md:68` | `similarity('quan ly de tai', 'quan ly đe tai') > 0` luôn đúng vì hai chuỗi chung nhiều trigram ASCII. Phép này không chứng minh được gì về unaccent hay locale | Thay bằng `similarity(lower(unaccent('ĐỀ TÀI Quản lý')), 'de tai quan ly') = 1`. Phép này kiểm cả unaccent chữ hoa lẫn chuỗi xử lý giống `prismaRepo.js:10` |
| 5 | MINOR | `QD_DB_TEST.md:59`; spike §4 "Không ảnh hưởng pg_trgm/unaccent" | Rủi ro `--locale=C` rộng hơn "thứ tự sắp xếp". Với ctype C, `lower()`/`upper()`/`ILIKE` chỉ đổi hoa thường chữ ASCII, và pg_trgm coi ký tự nhiều byte (chữ có dấu) là dấu phân cách từ. Mã hiện tại gọi `unaccent` trước `lower` (`prismaRepo.js:10`, `after_init.sql` index), nên FR06 hầu như không bị ảnh hưởng. Nhưng truy vấn nào dùng `lower`/`ILIKE`/trigram trên văn bản còn dấu sẽ cho kết quả khác CI | Sửa câu rủi ro ở §4.3 thành: "khác ở collation **và** ctype: sắp xếp, đổi hoa thường, ILIKE, pg_trgm trên văn bản có dấu; mọi so khớp văn bản tiếng Việt phải qua `unaccent` trước". Giao T201 thử `--locale=en-US` (tên locale Windows, chạy được với UTF8) hoặc ICU nếu binary hỗ trợ. Thử được thì dùng, không được thì giữ `C` và ghi lại. Đây là câu trả lời cho câu hỏi RV trong báo cáo: chấp nhận `C`, với điều kiện ghi đúng phạm vi rủi ro |
| 6 | MINOR | `QD_DB_TEST.md:74`, `:109` | (a) Kiểm `scripts`/`postinstall` phải làm **trước** khi `npm install`. Thứ tự hiện tại (cài ở §6.1 rồi mới ghi V5) để script cài chạy trước khi được đọc. (b) Chỉ kiểm `windows-x64`, nhưng §3 thừa nhận `npm ci` trên CI sẽ tải và cài `@embedded-postgres/linux-x64`, nên script cài của gói này cũng chạy trên CI | §6.1: chạy `npm view embedded-postgres@16.14.0-beta.17 scripts`, `npm view @embedded-postgres/windows-x64@16.14.0-beta.17 scripts` và `npm view @embedded-postgres/linux-x64@16.14.0-beta.17 scripts` trước, rồi mới cài. Có `preinstall`/`install`/`postinstall` thì dừng lại đọc. Ghi rõ lockfile phải có mục `linux-x64` kèm `integrity` |
| 7 | MINOR | `QD_DB_TEST.md:51` | `pg_ctl start` gọi từ Node trên Windows dễ treo, vì tiến trình `postgres` thừa hưởng handle stdout/stderr của `execSync`. Đây là câu hỏi DO trong báo cáo | Ghi rõ: `pg_ctl start -w -D <dir> -l <dir>/server.log -o "…"` và gọi với `stdio: 'ignore'` (hoặc `spawnSync` với stdio ignore). Tôi chọn `pg_ctl` làm cách chính, vì không để lại tiến trình Node mồ côi và `down` dừng theo cách chuẩn. Tiến trình Node tách rời chỉ là dự phòng, như QĐ đã ghi |
| 8 | MINOR | `QD_DB_TEST.md:17`, `:51`, `:75` | Hợp đồng ghi `127.0.0.1:54329`, nhưng `.env.test`/README dùng `localhost:54329` (theo báo cáo T201), còn server chỉ nghe `127.0.0.1`. Trên Windows, `localhost` có thể phân giải ra `::1` trước | Ghi hợp đồng là `localhost:54329`, rồi chọn một trong hai: cho server nghe `listen_addresses=localhost`, hoặc đưa vào V6 điều kiện Prisma kết nối được qua `localhost` |

Ghi nhận tốt: CI là chuẩn duy nhất để kết luận. Tiêu chí loại B (§5.3) rõ ràng, có quy tắc dừng và không tự chuyển sang C (§6.7). Ghi chú cho T202 (service container không gắn được `init.sql`, phải tạo extension trước khi reset) đúng và quan trọng. Các file đang chạy của T201 không phải đổi.

Kết luận: CHANGES_REQUESTED – BLOCKER 0, MAJOR 1, MINOR 7.
