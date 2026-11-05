# QĐ-DB-TEST – Chọn Postgres cho test khi máy dev không chạy được Docker

- Task: T217 · NFR08 · Người quyết định: kien-truc-su · Ngày: 2026-11-01 · Bản: vòng sửa 2
- Trạng thái quyết định: **ĐÃ DUYỆT** (T217 DONE 2026-11-01). Spike `design/SPIKE_EMBEDDED_PG.md` đã qua V1, V3, V4 và một phần V5. Review DO v1 kiểm tĩnh thêm V2 (một phần), V5 (`postinstall`), V1 (`Đ` trong `unaccent.rules`). Review DO v2 **chạy thật** §4.2/§4.4 trên embedded (thư mục nháp): `pg_ctl start -w -l` không treo, server sống sau khi script thoát (V2), `--locale=en-US` chạy được, K1–K6 đạt, `CREATE DATABASE` qua `@prisma/client` ở `template1` chạy được. Phần còn mở do T201 kiểm và nộp bằng chứng trong repo (§5.1).
- Bối cảnh: CAU_HOI #1, báo cáo T201. Máy dev: Windows 11, Node 24.12.0, không có Postgres cài sẵn, cổng 5432 đóng. Docker Desktop CLI 28.5.1 có nhưng engine không lên (WSL `HCS_E_SERVICE_NOT_AVAILABLE`; log Docker: "Virtual Machine Platform not enabled"; BIOS `VirtualizationFirmwareEnabled=False`). Sửa cần quyền admin + vào BIOS → việc của con người, chưa biết khi nào xong.
- Người dùng **đã cho phép** tải và chạy gói `embedded-postgres` (điều phối viên báo 2026-11-01, sau khi lệnh thử đầu tiên bị hệ thống quyền chặn "Code from External"). Mỗi lần nâng phiên bản gói này sau này vẫn là tải binary ngoài mới → cần người dùng duyệt lại.
- QĐ này duyệt thư viện (CLAUDE.md, mục "Công nghệ"): `embedded-postgres` (devDependency của `apps/api`, ghim chính xác, **chỉ dùng cục bộ**), với điều kiện qua được cổng §5. **Không** thêm `pg` (lý do ở §4.4).

## 1. Quyết định

1. **CI (T202) luôn dùng service container `postgres:16` của GitHub Actions.** Không dùng embedded trên CI. CI là môi trường chuẩn để kết luận test đạt/không đạt.
2. **Cục bộ: `npm run db:test:up` tự chọn trình chạy**:
   - Biến `DB_TEST_DRIVER=docker|embedded|external` nếu có → dùng đúng trình đó. Giá trị khác → báo lỗi, thoát ≠0.
   - Không có biến → `spawnSync('docker', ['info'], { timeout: 10000, stdio: 'ignore' })`. Thoát 0 → **Docker** (phương án A, `docker-compose.test.yml` giữ nguyên; nhánh này chạy đúng lệnh hiện có `docker compose -f docker-compose.test.yml up -d --wait` – **giữ `--wait`**, vì §4.4 chạy ngay sau đó, thiếu `--wait` thì K1 lỗi kết nối do Postgres chưa sẵn sàng). Thoát ≠0, hết giờ hoặc `error.code === 'ENOENT'` (không có lệnh docker) → **embedded** (phương án B).
   - **Đã chọn trình (ép hoặc tự chọn) thì lỗi ở trình đó là lỗi, thoát ≠0, không chuyển sang trình khác.** Ví dụ: `docker info` thoát 0 nhưng `compose up` lỗi → báo lỗi, không chạy embedded.
   - In ra trình đã chọn, ví dụ `DB test: embedded-postgres 16.14 tại localhost:54329`.
3. **Phương án C** (PostgreSQL 16 bản Windows do người dùng tự cài) là **đường dự phòng**, chỉ dùng khi B bị loại theo §5.3. Người dùng tự chạy server ở cổng 54329, đặt `DB_TEST_DRIVER=external` → `db:test:up` không khởi động gì, chỉ tạo extension/DB nếu thiếu (§4.2 bước 5) rồi chạy kiểm tra §4.4; `db:test:down` không làm gì.
4. Dù dùng trình nào thì hợp đồng với phần còn lại vẫn giữ: **`localhost:54329`** (đúng URL trong `apps/api/.env.test`), DB `nckh_test`, user/mật khẩu `postgres/postgres`, có `pg_trgm` + `unaccent` ở `nckh_test` và `template1`, `TimeZone = Asia/Ho_Chi_Minh`, `server_encoding = UTF8`. `apps/api/.env.test`, `reset-test-db.js` và `vitest.config.js` **không đổi**.
5. Bằng chứng chạy trên embedded được dùng để chốt task cục bộ. Kết luận cuối về test DB vẫn là CI xanh (sau T202). Nếu kết quả embedded và CI khác nhau thì **lấy CI**, và mở BUG để tìm nguyên nhân.

## 2. So sánh

| Tiêu chí | A. Docker (hiện tại) | B. `embedded-postgres` 16.x (cục bộ) | C. PostgreSQL 16 Windows tự cài |
|---|---|---|---|
| Có `pg_trgm`/`unaccent` | **Đã biết**: ảnh `postgres:16` chính thức có contrib; `init.sql` tạo cả hai | **Đã kiểm qua spike** trên bản `16.14.0-beta.17` / Windows: gói kèm `pg_trgm` 1.6 và `unaccent` 1.1; `CREATE EXTENSION` chạy được; `unaccent('Kiểm tra')` = `Kiem tra`. `unaccent.rules` có `Đ→D`, `đ→d` (DO kiểm tĩnh) | **Gần như chắc chắn**: bộ cài/zip của EDB có kèm contrib. Vẫn phải chạy `CREATE EXTENSION` để xác nhận |
| Cần admin | **Có** (bật VMP/WSL, BIOS, khởi động lại) | **Không**: spike chạy bằng user thường `GIGA` (không có quyền admin). Cài mất ~6 s, chiếm ~100 MB | Bộ cài EDB: **có** (cài Windows service). Bản zip của EDB: không cần admin nhưng phải tự `initdb`/`pg_ctl` |
| Giống CI/production | **Rất giống CI** (cùng ảnh Docker). Production là Supabase (Render chỉ chạy API) | Cùng bản chính 16, khác bản phụ. Có thể khác locale (§4.3). Chạy trên Windows, không phải Linux | Giống B (Windows, locale có thể khác). Người dùng chọn bản phụ |
| Rủi ro chuỗi cung ứng | Thấp: ảnh Docker chính thức | **Trung bình**: binary native từ npm; chưa rõ số người duy trì; số bản `-beta` liên tục. `postinstall` của gói nền chỉ tạo symlink cục bộ (DO kiểm). Giảm rủi ro theo §4.5 | Thấp: tải từ EDB/postgresql.org. Nhưng không có lockfile, mỗi máy cài một kiểu |
| Công sức | Mã: không còn gì. Con người: cao, chưa biết thời gian (BIOS) | Mã: một script `db-test.js` cỡ 120–160 dòng + tài liệu. Con người: đã duyệt tải | Mã: gần như không (nhánh `external` dùng chung kiểm tra). Con người: cài đặt + chạy server, khó lặp lại |
| Lặp lại được trên máy khác | Có | Có (lockfile ghim) | Không (thủ công) |

**Lý do chọn A ưu tiên → B → C**: A giống CI nhất, nên dùng ngay khi Docker sống. B mở khóa T201/T202/T203 ngay hôm nay mà không cần admin, lại ghim được bằng lockfile. C cần người dùng làm tay, không lặp lại được, nên chỉ để dự phòng.

## 3. Phạm vi của B: chỉ cục bộ

- CI không dùng embedded; chỉ gọi `db:test:up` với `DB_TEST_DRIVER=external` (§6 bước 6), service do workflow T202 tự khai báo. Gói vẫn có trong `devDependencies`, nên `npm ci` trên CI sẽ tải và cài gói nền `@embedded-postgres/linux-x64` (optional dependency, có `postinstall`) dù không dùng. Ta chấp nhận cái giá vài chục MB này, với điều kiện script cài của gói linux-x64 đã được đọc trước (§4.5). **Không** dùng `--omit=optional`, vì T202 cần optional deps cho vite.
- Không dùng embedded trong `globalSetup` của vitest. Vòng đời DB vẫn tách khỏi test như với Docker (up → reset → test → down).

## 4. Đặc tả phương án B (cho T201)

### 4.1 Phiên bản ghim
- Ghim **chính xác** (không dùng `^`/`~`) trong `apps/api/package.json` → `devDependencies`: `"embedded-postgres": "<X>"`.
- Chọn `<X>` theo luật: bản **16.x** mới nhất có `time[<X>]` ≤ **2026-10-18** (≥ 14 ngày tính đến 2026-11-01). Cả `@embedded-postgres/windows-x64@<X>` và `@embedded-postgres/linux-x64@<X>` cùng phải tồn tại.
- **Đã chọn: `<X>` = `16.14.0-beta.17`** (phát hành 2026-06-05; binary `windows-x64` cùng bản phát hành 2026-06-05). `16.15.0-beta.19` bị loại vì phát hành 2026-10-30, chưa đủ 14 ngày. Nguồn: spike §1. Mọi bản của gói đều mang nhãn `-beta` vì đó là cách upstream đánh số; nhãn này không phải lý do loại, nhưng là lý do bắt buộc ghim chính xác (`npm install --save-exact`). Khoảng `^16.14.0-beta.17` của các optional dependency không khớp `16.15.0-beta.*`, nên binary vẫn là 16.14. Không chọn 17.x/18.x: CI và ảnh Docker đang ở 16.
- `package-lock.json` phải có `integrity` cho gói chính, `@embedded-postgres/windows-x64` **và** `@embedded-postgres/linux-x64`.

### 4.2 Khởi tạo (script `apps/api/scripts/db-test.js`, lệnh `up` / `down`)
Gợi ý cách dùng gói. T201 được đổi chi tiết nếu thấy cách đơn giản hơn, nhưng phải giữ các kết quả ở §1.4 và phép kiểm §4.4.
1. **Nơi lưu dữ liệu**: `DATA_DIR = path.join(os.tmpdir(), 'nckh-db-test')`, **ngoài repo** (DO đã xác nhận `os.tmpdir()` cho cùng thư mục ở Git Bash và PowerShell). Không file nào sinh vào repo, nên không phải thêm `.gitignore`.
2. **Đường dẫn binary**: `const { initdb, pg_ctl } = await import('@embedded-postgres/' + process.platform + '-' + process.arch)` (ví dụ `windows-x64` trên Windows: ánh xạ `win32` → `windows`). Gói chính chỉ export `dist/index.js`, không export đường dẫn binary, nên **QĐ cho phép import trực tiếp gói nền này** (phụ thuộc gián tiếp, đã ghim qua lockfile). Không dùng lớp `EmbeddedPostgres` của JS (server dừng khi tiến trình Node thoát vì `async-exit-hook`). Gói **không có `psql`** (DO đã liệt kê): mọi truy vấn đi qua `@prisma/client` (§4.4).
3. **`up`**: nếu cổng 54329 đã có server và kiểm tra §4.4 qua → báo "đã chạy", thoát 0 (gọi lại nhiều lần không lỗi). Nếu cổng bận mà kiểm tra không qua → báo lỗi, không xóa gì, thoát ≠0.
4. Xóa `DATA_DIR` cũ (dùng một lần, giống tmpfs). Chạy `initdb -D <DATA_DIR> --encoding=UTF8 --locale=<L> --username=postgres --auth=scram-sha-256 --pwfile=<file tạm>` (file tạm xóa ngay sau khi dùng, kể cả khi lỗi). `<L>` = **`en-US`** (DO v2 đã chạy được với UTF8); chỉ khi initdb lỗi với `en-US` mới chạy lại với `C` (xem §4.3).
5. Khởi động: `pg_ctl start -w -D <DATA_DIR> -l <DATA_DIR>/server.log -o "-p 54329 -c listen_addresses=localhost -c timezone=Asia/Ho_Chi_Minh"`, gọi bằng `spawnSync`/`execFileSync` với **`stdio: 'ignore'`**. Cả `-l` lẫn `stdio: 'ignore'` là bắt buộc: thiếu thì `postgres` thừa hưởng handle stdout/stderr của Node và lệnh gọi treo. `-w` để `pg_ctl` chỉ trả về khi server đã nhận kết nối. Lỗi → in đường dẫn `server.log`, thoát ≠0.
   - `listen_addresses=localhost`: server nghe cả `127.0.0.1` và `::1`, nên URL `localhost` trong `.env.test` kết nối được dù Windows phân giải `localhost` ra địa chỉ nào trước. Vẫn chỉ nghe trên loopback.
   - **Đã chạy thử (DO v2)**: `pg_ctl start` trả về sau ~0,29 s; `postgres` do `pg_ctl` sinh ra vẫn sống sau khi tiến trình Node thoát, cả khi gọi trực tiếp lẫn qua `npm run` (Git Bash). T201 vẫn phải nộp bằng chứng V2 trong repo (§6 bước 4), chạy thêm một lần từ **PowerShell**. Nếu ở máy/shell nào V2 trượt (server chết khi script thoát) → dự phòng: tiến trình Node tách rời (`detached: true`, `stdio: 'ignore'`, `unref()`) chạy `pg_ctl start`, ghi lý do vào báo cáo.
6. **Tạo extension và DB** – cùng cho `embedded` và `external`, dùng `@prisma/client` (§4.4), **mỗi lệnh SQL một lần gọi** `$executeRawUnsafe` (Prisma dùng prepared statement, không chạy chuỗi nhiều lệnh):
   - Kết nối URL `.../template1`: `CREATE EXTENSION IF NOT EXISTS pg_trgm`, rồi `CREATE EXTENSION IF NOT EXISTS unaccent`.
   - Vẫn ở `template1`: nếu `SELECT 1 FROM pg_database WHERE datname = 'nckh_test'` rỗng thì `CREATE DATABASE nckh_test` (một lệnh riêng, ngoài transaction – `$executeRawUnsafe` không mở transaction). DB mới thừa hưởng extension từ `template1`.
   - Kết nối URL `.../nckh_test`: chạy lại hai lệnh `CREATE EXTENSION IF NOT EXISTS` (cần cho `external`, nơi DB có thể đã có sẵn).
   - Không dùng `init.sql`: file này dùng `\c` là lệnh của `psql`, không chạy được qua Prisma. `init.sql` chỉ dành cho Docker, giữ nguyên.
7. **`down`**:
   - **Bước dừng embedded** (dùng chung cho ép và không ép): không có `DATA_DIR` → bỏ qua. Có `DATA_DIR` → chạy `pg_ctl status -D <DATA_DIR>` (stdio ignore) và xét mã thoát:
     - `0` (đang chạy) → `pg_ctl stop -w -m fast -D <DATA_DIR>`; stop thoát ≠0 → báo lỗi, thoát ≠0, **không** xóa `DATA_DIR` (server có thể còn giữ file).
     - `3` (không có server – kể cả khi `postmaster.pid` đã cũ do máy khởi động lại/tiến trình bị kill) → không gọi `stop`.
     - Mã khác (ví dụ `4`: thư mục không phải data dir) → báo lỗi, thoát ≠0.
     - Sau đó xóa `DATA_DIR`. Lý do: DO v2 đã chạy – với `postmaster.pid` cũ, `pg_ctl stop` thoát 1 (`could not send stop signal ... No such process`), còn `pg_ctl status` thoát 3.
   - Ép bằng biến: `embedded` → bước dừng embedded; `docker` → `docker compose -f docker-compose.test.yml down`; `external` → không làm gì.
   - Không ép: **dừng theo trạng thái thật, không theo phép dò `docker info`**. (a) Có `DATA_DIR` → bước dừng embedded. (b) `docker info` thoát 0 → `docker compose ... down`. Làm cả (a) và (b) nếu cả hai đúng. Cả hai an toàn khi gọi lặp. Không có gì để dừng → thoát 0.

### 4.3 Timezone, mã hóa, locale
- `timezone` đặt tường minh khi khởi động. **Không** để mặc định theo hệ điều hành, vì Windows có thể ra `Asia/Bangkok` hay tên khác. Docker dùng `TZ` → initdb ghi `Asia/Ho_Chi_Minh`. T202 cũng phải đặt `TZ: Asia/Ho_Chi_Minh` cho service CI. Quy tắc CLAUDE.md #8 không đổi.
- Bắt buộc `--encoding=UTF8`: initdb trên Windows dễ chọn WIN1252/WIN1258 theo locale máy, làm hỏng tiếng Việt.
- **Locale mặc định: `--locale=en-US`** (tên locale Windows, dùng được với UTF8; libc gần với `en_US.utf8` của CI nhất). DO v2 đã chạy: `datcollate`/`datctype` = `en-US`, `lower('ĐỀ')` = `đề`, `upper('đề')` = `ĐỀ`. Chỉ khi initdb lỗi với `en-US` mới rơi về `--locale=C` (in cảnh báo). Ghi locale đã dùng và kết quả K7 (`datctype`, `lower('ĐỀ')`) vào báo cáo. Lưu ý: từ PG16 `lc_collate`/`lc_ctype` không còn là tham số cấu hình (`SHOW lc_ctype`/`current_setting('lc_ctype')` lỗi 42704) – phải đọc từ `pg_database`. Không dùng ICU: CI dùng libc, ICU cũng không làm thứ tự giống CI (DO).
- **Rủi ro chấp nhận nếu rơi về `C`** – khác CI ở cả collation **và** ctype:
  - sắp xếp chuỗi (`ORDER BY` trên văn bản);
  - `lower()`/`upper()`/`ILIKE` chỉ đổi hoa thường chữ ASCII (`lower('Đ')` = `Đ`);
  - pg_trgm coi ký tự nhiều byte (chữ có dấu) là dấu phân cách từ, nên trigram trên văn bản còn dấu khác CI.
  - **Quy tắc cho mã dự án**: mọi so khớp văn bản tiếng Việt (tìm kiếm, kiểm tra tương tự FR06) phải qua `unaccent` **trước** `lower`/trigram – mã hiện tại đã làm vậy (`apps/api/src/modules/similarity/prismaRepo.js:10`, index trong `after_init.sql`). Test không dựa vào thứ tự collation của văn bản tiếng Việt; cần thứ tự ổn định thì sắp theo id/thời gian. Phát hiện test khác kết quả giữa embedded và CI vì lý do này → mở BUG, lấy CI làm chuẩn.

### 4.4 Kiểm tra sau `up` (in kết quả, so giá trị cụ thể, sai thì thoát ≠0)
**Công cụ: `@prisma/client` 5.22 đã cài sẵn** (`new PrismaClient({ datasourceUrl })` + `$queryRawUnsafe`/`$executeRawUnsafe`). Áp dụng cho **cả ba trình** (`docker`, `embedded`, `external`).

Lý do chọn `@prisma/client` thay vì thêm `pg`: (1) đã là phụ thuộc trực tiếp của `apps/api`, không thêm thư viện, không phải duyệt lại; (2) trả được dòng kết quả (khác `prisma db execute`), kết nối được tới `template1` qua `datasourceUrl`; (3) chạy được `CREATE DATABASE` vì không bọc transaction. Không có yêu cầu kỹ thuật nào ở đây buộc phải dùng `pg` (không cần stream, COPY, nhiều lệnh một lần). Hạn chế đã biết: **client phải được generate**. Repo hiện chưa generate (`node_modules/.prisma/client` là bản giả; `reset-test-db.js` dùng `db push --skip-generate`), nên bản clone mới và CI đều phải chạy **`npx -w @nckh/api prisma generate`** trước `db:test:up` (cờ `-w` đặt **trước** `prisma`; viết `npx prisma generate -w @nckh/api` thì `-w` bị chuyển cho prisma và lỗi `unknown or unexpected option`). `db-test.js` bắt lỗi "did not initialize yet", in đúng lệnh trên và thoát ≠0; **không** tự chạy generate (tránh ghi `node_modules` ngầm). `prisma db execute` không còn dùng trong `db-test.js`.

URL lấy từ `DATABASE_URL` trong `apps/api/.env.test`, nạp **giống hệt** `reset-test-db.js`, **kể cả dòng `process.env.DIRECT_URL ??= process.env.DATABASE_URL`**. Quyết định: giữ dòng này. DO v2 thấy client chạy được khi thiếu `DIRECT_URL` (client chỉ dùng `datasourceUrl`; `directUrl` dành cho CLI migrate), nhưng một dòng gán mặc định không tốn gì, giữ cách nạp env thống nhất giữa hai script và tránh lỗi nếu bản Prisma sau kiểm `env("DIRECT_URL")` khi khởi tạo. Đổi phần tên DB thành `template1` khi cần, truyền qua `new PrismaClient({ datasourceUrl })`. Không in mật khẩu.

| # | Truy vấn (DB) | Kỳ vọng | In ra |
|---|---|---|---|
| K1 | `SELECT current_setting('server_version_num')::int AS v` (nckh_test) | `160000 ≤ v < 170000` | `server_version` |
| K2 | `SELECT current_setting('TimeZone') AS v` (nckh_test) | `= 'Asia/Ho_Chi_Minh'` | giá trị |
| K3 | `SELECT current_setting('server_encoding') AS v` (nckh_test) | `= 'UTF8'` | giá trị |
| K4 | `SELECT extname::text AS extname, extversion FROM pg_extension WHERE extname IN ('pg_trgm','unaccent') ORDER BY 1` – chạy ở **nckh_test** và **template1** (`::text` vì `extname` kiểu `name`) | đúng 2 dòng `pg_trgm`, `unaccent` ở mỗi DB | danh sách + `extversion` |
| K5 | `SELECT unaccent('Đề tài Nghiên cứu') AS v` (nckh_test) | `= 'De tai Nghien cuu'` | giá trị |
| K6 | `SELECT similarity(lower(unaccent('ĐỀ TÀI Quản lý')), 'de tai quan ly') AS v` (nckh_test) | `= 1` (so số, `Number(v) === 1`) | giá trị |
| K7 (chỉ in) | `SELECT datcollate, datctype, lower('ĐỀ') AS low FROM pg_database WHERE datname = current_database()` (nckh_test) | không so, chỉ ghi nhận locale (§4.3). Truy vấn phải chạy được (lỗi SQL vẫn → thoát ≠0). DO v2: `en-US`, `en-US`, `đề` | giá trị |

- Mỗi dòng in `OK`/`SAI` kèm giá trị thật, ví dụ `K2 TimeZone = Asia/Ho_Chi_Minh OK`. Có bất kỳ `SAI` nào hoặc lỗi kết nối/SQL → in tổng kết, `$disconnect()`, thoát ≠0. Không được nuốt lỗi.
- K5 + K6 là điều kiện của V1. K2, K3 là V4. Bảng in ra này là bằng chứng bắt buộc trong báo cáo T201.

### 4.5 Giảm rủi ro chuỗi cung ứng
- Ghim chính xác + lockfile `integrity` + luật ≥ 14 ngày (§4.1).
- **Trước khi `npm install`** (T201 §6 bước 1), chạy và ghi vào báo cáo:
  - `npm view embedded-postgres@16.14.0-beta.17 scripts maintainers repository`
  - `npm view @embedded-postgres/windows-x64@16.14.0-beta.17 scripts`
  - `npm view @embedded-postgres/linux-x64@16.14.0-beta.17 scripts`
  - Có `preinstall`/`install`/`postinstall` mà **khác** `node scripts/hydrate-symlinks.js` → dừng, không cài, báo điều phối viên. Bản windows-x64 đã được DO đọc: chỉ đọc `native/pg-symlinks.json` (rỗng) rồi tạo symlink cục bộ, không gọi mạng. Bản linux-x64 (chạy trên CI) phải đọc nội dung script sau khi cài (trong `node_modules`, không chạy) và ghi lại: chỉ tạo symlink trong thư mục gói thì chấp nhận.
- Sau khi cài: `npm audit signatures`, ghi kết quả (không có chữ ký/provenance thì chỉ ghi nhận, không phải lý do loại).
- Server chỉ nghe loopback (`localhost`), mật khẩu xác thực bằng scram. Dữ liệu chỉ là dữ liệu test.
- Không nâng phiên bản tự động (Dependabot nếu có thì bỏ qua gói này). Nâng bản = task riêng + người dùng duyệt tải.

## 5. Cổng xác minh và tiêu chí loại bỏ B

### 5.1 Các điểm phải xác minh
| # | Điểm | Cách kiểm | Kết quả đến vòng sửa 2 |
|---|---|---|---|
| V1 | Gói nền Windows có `pg_trgm`, `unaccent`, bỏ dấu đúng cả `Đ` | §4.4 K4, K5, K6 | **Đạt (thư mục nháp, DO v2)**: K4 pg_trgm 1.6 + unaccent 1.1 ở cả 2 DB, K5 `De tai Nghien cuu`, K6 `1`. Còn: T201 chạy lại bằng `db-test.js` trong repo |
| V2 | Có `pg_ctl`; server sống sau khi `up` thoát | liệt kê thư mục binary; sau `up` thoát, **một tiến trình khác** (`npm run db:test:reset`) kết nối được | **Đạt (thư mục nháp, DO v2)**: có `pg_ctl.exe`, `initdb.exe`, `postgres.exe` (không có `psql.exe`); server sống sau khi `node` thoát, gọi trực tiếp và qua `npm run`. Còn: T201 nộp bằng chứng trong repo, thêm một lần từ PowerShell |
| V3 | Chạy được bằng user thường, không hỏi UAC | chạy `up` trong shell thường | **Đạt** (user `GIGA`, không có quyền admin) |
| V4 | `TimeZone`, `server_encoding` đúng | §4.4 K2, K3 | **Đạt (thư mục nháp, DO v2)**: K2 `Asia/Ho_Chi_Minh`, K3 `UTF8`. Còn: T201 chạy lại trong repo |
| V5 | Ngày phát hành, người duy trì, script cài đặt (windows-x64 **và** linux-x64) | §4.1, §4.5 | Ngày phát hành **Đạt**. `postinstall` windows-x64 **Đạt** (DO: `hydrate-symlinks.js`, chỉ symlink cục bộ, không tải). Còn: T201 kiểm script linux-x64, người duy trì, `npm audit signatures` |
| V6 | `db:test:reset` + `npm test` chạy trên embedded, kết nối qua `localhost` | lệnh T201 | **Một phần**: DO v2 kết nối qua `localhost:54329` được. Còn: `db:test:reset` + `npm test` |

### 5.2 Kết quả spike
Nguồn: `design/SPIKE_EMBEDDED_PG.md` (devops, 2026-11-01). Kết luận của spike là **khả thi**.
- Bản server: PostgreSQL 16.14. Cổng 54329 và DB `nckh_test` tạo được.
- Thời gian: initdb lần đầu 6,9 s; start 0,13 s; stop 0,14 s; cả vòng đời 7,5 s. Sau khi stop không còn tiến trình postgres.
- Không lỗi VC++ runtime, quyền thư mục hay cổng.
- Gói có binary `linux-x64` nhưng **chưa thử trên Linux**. Không ảnh hưởng QĐ vì CI không dùng embedded (§1.1); chỉ script cài của gói này cần đọc (§4.5).
- Spike dùng `--locale=C` (mặc định của gói) và import `pg` trực tiếp. Mã dự án **không** import `pg`; dùng `@prisma/client` (§4.4). Lần chạy thử của DO v2 (theo đúng §4.2/§4.4 của QĐ) dùng `--locale=en-US` và `@prisma/client` 5.22 – xem `reviews/T217-devops-v2.md`.

Không có tiêu chí loại nào ở §5.3 xảy ra. B được chọn, với điều kiện T201 hoàn tất các phần "Còn" ở §5.1.

### 5.3 Loại B → chuyển C khi
- V1 trượt: không tạo được `pg_trgm` hoặc `unaccent`, hoặc K5/K6 sai. Không chấp nhận chạy test mà thiếu extension, vì kiểm tra trùng FR06 phụ thuộc vào chúng (CLAUDE.md #5).
- V2 trượt cả cách chính lẫn dự phòng (không giữ được server sống giữa `up` và lệnh tiếp theo).
- V3 trượt (cần admin), hoặc V6 trượt vì lỗi của gói (không phải lỗi mã dự án).
- V5 phát hiện script cài đặt (windows-x64 hoặc linux-x64) tải thêm mã từ nguồn khác npm hoặc làm việc ngoài thư mục gói, hoặc không có bản 16.x nào đủ 14 ngày.

Khi loại B: gỡ gói khỏi `package.json`/lockfile, bỏ nhánh embedded trong `db-test.js` (giữ `docker` + `external`), cập nhật CAU_HOI #1 để người dùng cài C (bản zip EDB 16 không cần admin, hoặc bộ cài nếu có admin), cổng 54329, user `postgres/postgres`, rồi chạy `DB_TEST_DRIVER=external npm run db:test:up` (tự tạo extension + DB theo §4.2 bước 6).

## 6. Việc T201 phải làm lại
1. **Trước khi cài**: chạy các lệnh `npm view ... scripts` ở §4.5 (ba gói), ghi kết quả; khác dự kiến thì dừng. Sau đó cài `embedded-postgres@16.14.0-beta.17` bằng `--save-exact` vào `apps/api` devDependencies (§4.1). Ghi bằng chứng `npm ls embedded-postgres`, mục lockfile có `integrity` của cả ba gói, nội dung `postinstall` của linux-x64, `npm audit signatures`. Sau đó chạy `npx -w @nckh/api prisma generate` (client trong repo chưa generate, §4.4) và ghi kết quả.
2. Viết `apps/api/scripts/db-test.js` (`up`/`down`, chọn trình theo §1.2: `docker` | `embedded` | `external`; khởi động §4.2; kiểm §4.4 cho cả ba trình). Có tự kiểm nhỏ cho phần thuần logic (chọn trình từ biến/kết quả `docker info`, so kỳ vọng K1–K6) – unit test vitest không cần DB.
3. Sửa script gốc: `db:test:up` → `node apps/api/scripts/db-test.js up`, `db:test:down` → `... down`. `db:test:reset` giữ nguyên. Không đổi `docker-compose.test.yml`, `init.sql`, `.env.test`, `vitest.config.js`, `reset-test-db.js`, trừ khi chạy thật thấy lỗi (khi đó ghi lý do).
4. Chạy và dán bằng chứng, theo đúng thứ tự, mỗi lệnh là một tiến trình riêng:
   1. `npm run db:test:up` → bảng K1–K7 (V1, V4) và locale đã dùng (§4.3). Chạy từ **PowerShell** (DO v2 đã thử Git Bash).
   2. `npm run db:test:reset` (`migrate reset`, đã gồm `after_init.sql`; thiếu `migrations` thì báo lỗi, T502) – vì `up` đã thoát, lệnh này kết nối được chính là bằng chứng **V2** (server sống sau khi script thoát) và kết nối qua `localhost` (V6).
   3. `npm test` (V6).
   4. `npm run db:test:up` lần hai khi server đang chạy → "đã chạy", thoát 0.
   5. `npm run db:test:down` → kiểm không còn tiến trình `postgres` (`tasklist | findstr postgres`) và `DATA_DIR` đã xóa; gọi `down` lần hai → thoát 0.
   6. `postmaster.pid` cũ: `up`, rồi `taskkill /F /IM postgres.exe`, rồi `down` → thoát 0 và `DATA_DIR` đã xóa (§4.2 bước 7).
   7. Một lần chạy cố ý sai (ví dụ `DB_TEST_DRIVER=abc npm run db:test:up`) → thoát ≠0.
5. Cập nhật README (mục DB test: 3 trình, biến `DB_TEST_DRIVER`, bước `npx -w @nckh/api prisma generate` trước `db:test:up` lần đầu) và `docs/VAN_HANH.md` (Docker giờ là tùy chọn, không còn chặn; mục C nếu B bị loại).
6. Ghi chú cho T202 (trong báo cáo T201): service `postgres:16` với `POSTGRES_USER/POSTGRES_PASSWORD=postgres`, `POSTGRES_DB=nckh_test`, `TZ=Asia/Ho_Chi_Minh`, cổng `54329:5432`, và `options: --health-cmd "pg_isready -U postgres -d nckh_test" --health-interval 2s --health-timeout 3s --health-retries 30` để job chỉ chạy khi DB sẵn sàng. Service container không gắn được `init.sql` (repo được checkout sau khi service đã khởi động), nên trước `db:test:reset` phải có bước tạo extension. Thứ tự bước trên CI: `npm ci` → **`npx -w @nckh/api prisma generate`** (bắt buộc, `db-test.js` dùng `@prisma/client`) → `DB_TEST_DRIVER=external npm run db:test:up` → `npm run db:test:reset` → `npm test`. Bước tạo extension đơn giản nhất là `DB_TEST_DRIVER=external npm run db:test:up` (dùng lại §4.2 bước 6 + kiểm §4.4, cùng một mã với cục bộ); cách khác là `psql` có sẵn trên runner ubuntu chạy `init.sql`.
7. Nếu V1–V6 trượt theo §5.3 → dừng, báo điều phối viên, không tự chuyển sang C.
