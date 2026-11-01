# Review T217 – reviewer – vòng 3
Kết luận: APPROVED

## Tôi đã tự kiểm tra
- Đã đọc: `CLAUDE.md`, `docs/agents/QUY_TRINH.md` (mẫu review), `docs/agents/reports/T217.md` (mục "Vòng sửa 2"), `docs/agents/design/QD_DB_TEST.md` (bản vòng sửa 2), `docs/agents/reviews/T217-reviewer-v2.md`, `package.json` gốc, `apps/api/package.json`, `apps/api/scripts/reset-test-db.js`. Không đọc review của agent khác. Không đọc `.env.test`. Không chạy hay cài embedded-postgres.
- Phạm vi vòng này: chỉ đổi 2 file tài liệu. `package.json` và `apps/api/package.json` không có `embedded-postgres` hay `pg`. Script gốc `db:test:up/down` vẫn là lệnh Docker (`up -d --wait`). Không có code, test hay dependency nào đổi.
- `npm test` (tự chạy, 2026-11-01), khớp bằng chứng vòng sửa 2 trong báo cáo:
  ```
  RUN  v4.1.12 D:/Website_HTWLHD_SV_NCKH_demo3/packages/shared
  Test Files  2 passed (2)
       Tests  21 passed (21)
  RUN  v4.1.12 D:/Website_HTWLHD_SV_NCKH_demo3/apps/api
  Test Files  9 passed (9)
       Tests  87 passed (87)
  RUN  v4.1.12 D:/Website_HTWLHD_SV_NCKH_demo3/apps/web
  Test Files  3 passed (3)
       Tests  23 passed (23)
  EXIT=0
  ```
- `npm run lint`: `'eslint' is not recognized as an internal or external command`. Lỗi này có từ trước (ESLint thuộc T202), không do T217 gây ra, giống vòng 1 và vòng 2.
- Cú pháp generate (tự chạy, lệnh chỉ đọc): `npx -w @nckh/api prisma --version` → `prisma 5.22.0`, `@prisma/client 5.22.0`, thoát 0. Đặt `-w` sau tên lệnh (`npx prisma --version -w @nckh/api`) thì prisma in trang trợ giúp, tức là không nhận cờ. Kết quả này khớp giải thích ở §4.4.
- Client Prisma: `node_modules/.prisma/client/{index,default}.js` đều chứa chuỗi `did not initialize yet` (bản giả, 2078 byte). **Đính chính review v2 của tôi**: ở v2 tôi viết "client đã generate" là sai, vì tôi chỉ thấy thư mục có tồn tại mà không kiểm nội dung. Ở v1 và v2 tôi cũng bỏ sót lỗi `current_setting('lc_ctype')` trên PG16. Vòng sửa 2 đã xử lý đúng cả hai điểm.

## Kiểm tra các thay đổi vòng sửa 2
| Thay đổi | Đúng? | Ghi chú |
|---|---|---|
| K7 đọc locale qua `pg_database` (§4.4:95, §4.3:73) | Đúng | Từ PG15, `lc_collate`/`lc_ctype` không còn là GUC, nên `current_setting` báo lỗi 42704. Trên PG15+, `datcollate`/`datctype` có kiểu `text`, nên không cần `::text` như K4. Vẫn giữ luật "lỗi SQL → thoát ≠0", đúng tinh thần không nuốt lỗi. Không còn chỗ nào trong QĐ dùng `SHOW lc_ctype` |
| `npx -w @nckh/api prisma generate` và thứ tự CI (§4.4:83, §6 bước 1, 5, 6) | Đúng | Cú pháp đã được tự kiểm như trên. Thứ tự CI hợp lý: `npm ci` → generate → `external up` → reset → test. `db-test.js` bắt lỗi "did not initialize yet", in đúng lệnh và không tự generate (không ghi ngầm vào `node_modules`). Lỗi luôn được báo ra, không bị nuốt |
| `down` dùng `pg_ctl status` (§4.2 bước 7) | Đúng | Ba nhánh mã thoát 0/3/khác đều rõ ràng. Stop lỗi thì không xóa `DATA_DIR`, không làm mất dữ liệu đang được server giữ. Logic dùng chung cho cả khi ép trình lẫn khi không ép. Có bằng chứng bắt buộc ở §6 bước 4.6 cho trường hợp `postmaster.pid` cũ |
| Locale mặc định `en-US`, chỉ rơi về `C` khi initdb lỗi (§4.2 bước 4, §4.3) | Đúng | Rủi ro khi dùng `C` vẫn được ghi đủ. Quy tắc "unaccent trước" vẫn giữ |
| K4 `extname::text AS extname, extversion` | Đúng | Đã khớp với cột "In ra" |
| Docker `up -d --wait` (§1.2) | Đúng | Khớp `package.json:12` hiện tại |
| Giữ `DIRECT_URL ??= DATABASE_URL` (§4.4:85) | Đúng | Giống `reset-test-db.js:17`. Lý do giữ hợp lý, chỉ tốn một dòng |

## Đối chiếu đặc tả
| Điều kiện đạt | Đạt? | Ghi chú |
|---|---|---|
| Có quyết định phương án DB test khi không có Docker, ghi ở `design/QD_DB_TEST.md` | Đạt | Thứ tự A → B → C. CI dùng service `postgres:16`, embedded chỉ chạy cục bộ |
| §6 việc T201 đủ và kiểm được | Đạt | Bước 1 (`npm view` → cài → lockfile/audit → generate) có thứ tự rõ. Bước 4 có 7 lệnh, mỗi lệnh chạy trong một tiến trình riêng và có kết quả mong đợi kiểm được: bảng K1–K7, reset (V2/V6), `npm test`, up lặp, down với `tasklist`, `postmaster.pid` cũ, biến sai thoát ≠0. Có quy tắc dừng ở bước 7 |
| Không mâu thuẫn mới | Đạt | Không thấy mâu thuẫn chặn việc. Chỉ còn vài điểm nhỏ, xem bảng dưới |
| NFR08 | Đạt | Hợp đồng `localhost:54329/nckh_test` không đổi. `reset-test-db.js` vẫn chặn host không cục bộ |

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| 1 | INFO | `QD_DB_TEST.md:65` (§4.2 bước 7, mã khác) | Nếu `initdb` lỗi giữa chừng, `DATA_DIR` còn lại nhưng không phải data dir, nên `pg_ctl status` thoát 4. Khi đó `down` lỗi mãi, chỉ gỡ được bằng `up` (bước 4 xóa `DATA_DIR`) hoặc xóa tay | T201 cho thông báo lỗi ở nhánh này in đường dẫn `DATA_DIR` và cách gỡ ("chạy lại `db:test:up` hoặc xóa thư mục"). Không cần sửa QĐ |
| 2 | INFO | `QD_DB_TEST.md:151` (§6 bước 4.6) | `taskkill /F /IM postgres.exe` diệt **mọi** tiến trình postgres trên máy. Máy hiện tại không có Postgres khác nên an toàn, nhưng trên máy có phương án C hoặc Postgres khác thì lệnh này sẽ diệt luôn các server đó | T201 ghi chú điều này khi dán bằng chứng. Nếu muốn chỉ diệt đúng server thì dùng PID ở dòng đầu `postmaster.pid` (`taskkill /F /PID <pid>`) |
| 3 | INFO | `reports/T217.md:22-23, 29, 57-59` | Mục "Quyết định thiết kế", "Điều kiện đạt" và "Câu hỏi cho reviewer" vẫn ghi theo bản đầu: rủi ro chấp nhận là `--locale=C`, "Giả định pg_ctl", "chữ `Đ` để T201 kiểm". Các điểm này đã được QĐ vòng sửa 2 thay thế | Nguồn sự thật là QĐ. Khi chuyển DONE, nên thêm một dòng "xem Vòng sửa 2" ở các mục đó. Không chặn việc |

Ghi nhận tốt: phát hiện lỗi K7 trên PG16 (trước đó tôi bỏ sót) được sửa bằng truy vấn đã chạy thật. Lệnh generate được kiểm cú pháp và đưa vào cả T201, README lẫn thứ tự CI. Nhánh `down` xử lý đúng trường hợp `postmaster.pid` cũ mà không có nguy cơ xóa dữ liệu khi server còn sống.

Kết luận: APPROVED – BLOCKER 0, MAJOR 0, MINOR 0, INFO 3.
