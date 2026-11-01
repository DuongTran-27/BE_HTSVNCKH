# Review T217 – reviewer – vòng 2
Kết luận: APPROVED

## Tôi đã tự kiểm tra
- Đã đọc: `CLAUDE.md`, `docs/agents/reports/T217.md` (mục "Vòng sửa 1"), `docs/agents/design/QD_DB_TEST.md` (bản vòng sửa 1), `docs/agents/reviews/T217-reviewer-v1.md`, `docs/agents/design/SPIKE_EMBEDDED_PG.md`, `apps/api/package.json`, `apps/api/scripts/reset-test-db.js`, `apps/api/prisma/schema.prisma` (datasource), `docker-compose.test.yml`, `docker/postgres-test/init.sql`, `package.json` gốc. Không đọc `.env.test` (quy tắc 6). Không chạy hay cài embedded-postgres.
- Phạm vi: vòng này chỉ đổi 2 file tài liệu. `package.json` và `apps/api/package.json` không có `embedded-postgres` hay `pg`. Không có code, test hay dependency nào đổi.
- `@prisma/client` là phụ thuộc trực tiếp: `apps/api/package.json` có `"@prisma/client": "^5.22.0"` trong `dependencies`, bản cài là `node_modules/@prisma/client` 5.22.0, `prisma` CLI 5.22.0, client đã generate (`node_modules/.prisma/client` có). `datasourceUrl` có từ Prisma 5.2, nên dùng được ở 5.22.
- `npm test` (tự chạy, 2026-11-01), khớp bằng chứng điều phối viên dán ở báo cáo:
  ```
  RUN  v4.1.12 D:/Website_HTWLHD_SV_NCKH_demo3/packages/shared
  Test Files  2 passed (2)
       Tests  21 passed (21)
  RUN  v4.1.12 D:/Website_HTWLHD_SV_NCKH_demo3/apps/api
  Test Files  9 passed (9)
       Tests  87 passed (87)
  ```
- `npm run lint`: `'eslint' is not recognized as an internal or external command`. Lỗi này có từ trước (ESLint thuộc T202), không do T217 gây ra, giống vòng 1.

## Xác nhận vấn đề vòng 1
| # | Mức | Đã sửa đúng? | Ghi chú |
|---|---|---|---|
| 1 | MAJOR | Đúng | §4.4 dùng `@prisma/client` (`$queryRawUnsafe`), không còn `prisma db execute`. Bảng K1–K6 có kỳ vọng cụ thể: version 16.x theo khoảng số, `TimeZone`, `UTF8`, 2 extension ở cả `nckh_test` và `template1`, `unaccent('Đề tài Nghiên cứu')`, similarity `= 1`. In `OK`/`SAI` kèm giá trị thật. Có `SAI` hoặc lỗi thì thoát ≠0 và cấm nuốt lỗi. Phép kiểm áp dụng cho cả 3 trình. Lý do không thêm `pg` hợp lý: thư viện đã có sẵn, không phải duyệt thêm. Cách này khác đề xuất (a) của tôi nhưng giải quyết đúng gốc vấn đề |
| 2 | MINOR | Đúng | §1.2 đã có `docker\|embedded\|external`, giá trị khác thì thoát ≠0, và có câu "lỗi ở trình đã chọn là lỗi, không chuyển trình" kèm ví dụ |
| 3 | MINOR | Đúng | §4.2 bước 7: khi không ép bằng biến, `down` dừng theo `postmaster.pid` và Docker sống, làm cả hai nếu cả hai đúng. Gọi lặp an toàn |
| 4 | MINOR | Đúng | K6 `similarity(lower(unaccent('ĐỀ TÀI Quản lý')), 'de tai quan ly') = 1`, so bằng `Number(v) === 1` |
| 5 | MINOR | Đúng | §4.3 ghi rủi ro ở cả collation lẫn ctype (ORDER BY, `lower`/`upper`/`ILIKE`, pg_trgm), có quy tắc "unaccent trước", và thứ tự thử `en-US` rồi mới `C`. K7 ghi nhận `lc_ctype` và `lower('ĐỀ')` |
| 6 | MINOR | Đúng | §4.5 và §6 bước 1 chạy `npm view … scripts` cho 3 gói **trước** khi cài. Lockfile phải có `integrity` của linux-x64. Đã thêm tiêu chí loại cho script cài của linux-x64 (§5.3) |
| 7 | MINOR | Đúng | §4.2 bước 5 bắt buộc `pg_ctl start -w -l … -o …` với `stdio: 'ignore'` và giải thích lý do. Server sống sau khi script thoát đã chuyển thành giả định V2, có cách chứng minh (§6 bước 4.2) và có dự phòng |
| 8 | MINOR | Đúng | §1.4 dùng `localhost:54329`. Embedded nghe `listen_addresses=localhost` (vẫn chỉ loopback). V6 có điều kiện kết nối qua `localhost` |

## Đối chiếu yêu cầu vòng này
| Điều kiện | Đạt? | Ghi chú |
|---|---|---|
| Không thêm thư viện ngoài `embedded-postgres`, ghim chính xác | Đạt | Dòng duyệt thư viện ở đầu QĐ ghi rõ không thêm `pg`. §4.1 ghim `16.14.0-beta.17` bằng `--save-exact` và cấm `^`/`~`. Import trực tiếp `@embedded-postgres/<platform>-<arch>` là phụ thuộc gián tiếp, đã ghim qua lockfile, QĐ cho phép tường minh |
| Quy trình bằng chứng §6 đủ cho T201 | Đạt | §6 bước 4 có thứ tự rõ: up (K1–K7) → reset ở tiến trình khác (V2, V6 qua localhost) → `npm test` → up lần hai (gọi lặp) → down, kiểm `tasklist`/`DATA_DIR` → down lần hai → biến sai thoát ≠0. Logic chọn trình và so kỳ vọng có unit test không cần DB (§6 bước 2). Có quy tắc dừng (§6 bước 7) |
| Không phát sinh mâu thuẫn mới | Đạt | Không thấy mâu thuẫn chặn việc. Có vài điểm nhỏ cần ghi chú cho T201, xem bên dưới |
| NFR08 (DB test tách riêng) | Đạt | Hợp đồng cổng/DB/user không đổi. `reset-test-db.js` vẫn chặn host không cục bộ và không phải sửa |

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| 1 | INFO | `QD_DB_TEST.md` §4.4 K4 | Cột "In ra" ghi `danh sách + extversion`, nhưng truy vấn chỉ có `SELECT extname`. Ngoài ra `extname` có kiểu `name`, và việc Prisma raw query chuyển kiểu này sang JS chưa được kiểm | T201 viết `SELECT extname::text, extversion FROM pg_extension …` cho khớp. Không cần sửa QĐ |
| 2 | INFO | `QD_DB_TEST.md` §1.2, §4.4; `package.json:13` | Trình `docker` chạy kiểm §4.4 ngay sau `compose up`. Nếu bỏ `--wait` (lệnh hiện tại đang có) thì K1 sẽ lỗi kết nối vì Postgres chưa sẵn sàng | T201 giữ `docker compose -f docker-compose.test.yml up -d --wait` trong nhánh `docker` |
| 3 | INFO | `QD_DB_TEST.md` §4.4 (dòng "URL lấy từ `DATABASE_URL`…"); `schema.prisma:12` | Schema có `directUrl = env("DIRECT_URL")`. `reset-test-db.js:17` gán `DIRECT_URL ??= DATABASE_URL`. Khi tạo `PrismaClient`, `db-test.js` nên làm giống vậy để tránh lỗi thiếu biến môi trường | Thực hiện đúng cách nạp env như `reset-test-db.js`, kể cả dòng `DIRECT_URL`, như QĐ đã ghi "nạp như `reset-test-db.js`" |

Ghi nhận tốt: MAJOR được giải quyết mà không thêm thư viện. Bảng K1–K7 biến các điểm V1/V4 còn mở thành phép kiểm có thể trượt thật. V2 được ghi trung thực là giả định, kèm cách chứng minh bằng một tiến trình riêng. Các ý của DO (health-cmd cho T202, `init.sql` không chạy được qua Prisma, `CREATE DATABASE` chạy riêng) đều đã được đưa vào QĐ.

Kết luận: APPROVED – BLOCKER 0, MAJOR 0, MINOR 0, INFO 3.
