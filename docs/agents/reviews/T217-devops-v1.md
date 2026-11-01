# Review T217 – devops – vòng 1
Kết luận: CHANGES_REQUESTED

## Tôi đã tự kiểm tra
Các file đã đọc: `reports/T217.md`, `design/QD_DB_TEST.md`, `design/SPIKE_EMBEDDED_PG.md`, `reports/T201.md`, `docker-compose.test.yml`, `docker/postgres-test/init.sql`, `apps/api/scripts/reset-test-db.js`, `apps/api/vitest.config.js`, `package.json` gốc, `apps/api/package.json`, `apps/api/prisma/schema.prisma` (datasource) và dòng T202 trong `BANG_CONG_VIEC.md`. Tôi không đọc `apps/api/.env.test`: hệ thống quyền chặn lệnh này. Nội dung file lấy theo mô tả trong báo cáo T201.

Thư mục nháp spike đã có sẵn gói. Tôi chỉ liệt kê và đọc file, không chạy binary nào:
```
$ ls node_modules/@embedded-postgres/windows-x64/native/bin
initdb.exe  pg_ctl.exe  postgres.exe  libpq.dll  icu*67.dll ...   (KHÔNG có psql.exe, createdb.exe)
$ grep -n "pg_ctl\|initdb\|postgres.exe" node_modules/@embedded-postgres/windows-x64/dist/*.js
4:export const pg_ctl = path.resolve(__dirname, '..', 'native', 'bin', 'pg_ctl.exe');
5:export const initdb = path.resolve(__dirname, '..', 'native', 'bin', 'initdb.exe');
6:export const postgres = path.resolve(__dirname, '..', 'native', 'bin', 'postgres.exe');
$ grep -n exports node_modules/embedded-postgres/package.json node_modules/@embedded-postgres/windows-x64/package.json
embedded-postgres/package.json:5:  "exports": "./dist/index.js",
@embedded-postgres/windows-x64/package.json:5:  "exports": "./dist/index.js",
$ grep postinstall node_modules/@embedded-postgres/windows-x64/package.json
    "postinstall": "node scripts/hydrate-symlinks.js"
$ cat .../native/pg-symlinks.json
[]
$ grep -n "^Đ\|^đ" .../native/share/tsearch_data/unaccent.rules
92:Đ	D
93:đ	d
$ ls .../native/share/timezone/Asia | grep -i ho_chi
Ho_Chi_Minh
```
Kết quả:
- **V2 đạt một phần**: gói có `pg_ctl`, `initdb`, `postgres` nhưng không có `psql`. Đường dẫn binary chỉ lấy được bằng `import('@embedded-postgres/windows-x64')`. Gói chính chỉ export `dist/index.js`, còn `dist/binary.js` không import được qua `exports`.
- **V5**: `postinstall` chỉ đọc `native/pg-symlinks.json` (bản Windows là `[]`) rồi tạo symlink cục bộ. Script này không gọi mạng và không tải gì thêm. Chưa kiểm người duy trì và `npm audit signatures` (để T201 làm).
- **V1, chữ Đ**: `unaccent.rules` có ánh xạ `Đ→D`, `đ→d`. Vẫn phải chạy thật trên server để xác nhận.
- Dữ liệu timezone có sẵn `Asia/Ho_Chi_Minh`.

Quy tắc chọn trình chạy trên máy này:
```
$ node -e "console.log(require('os').tmpdir())"                       # Git Bash
C:\Users\GIGA\AppData\Local\Temp
$ powershell -NoProfile -Command "node -e \"console.log(require('os').tmpdir())\""
C:\Users\GIGA\AppData\Local\Temp
$ time (docker info >/dev/null 2>&1; echo docker_info_exit=$?)
docker_info_exit=1
real    0m0.303s
$ npx prisma --version
prisma 5.22.0 · @prisma/client 5.22.0 (client đã generate)
```
`os.tmpdir()` cho cùng một thư mục ở cả hai shell. `docker info` thoát khác 0 sau 0,3 s khi engine hỏng. Timeout 10 s chỉ cần khi Docker Desktop đang khởi động, nên con số này hợp lý. T201 nên dùng `spawnSync('docker', ['info'], { timeout: 10000, stdio: 'ignore' })`. Nếu máy không có lệnh `docker` thì `error.code === 'ENOENT'`, khi đó coi như Docker không sống.

```
$ NO_COLOR=1 npm test
 RUN  v4.1.12 D:/Website_HTWLHD_SV_NCKH_demo3/packages/shared
 Test Files  2 passed (2)
      Tests  21 passed (21)
 RUN  v4.1.12 D:/Website_HTWLHD_SV_NCKH_demo3/apps/api
 Test Files  9 passed (9)
      Tests  87 passed (87)
EXIT=0
```
Kết quả khớp phần bằng chứng bổ sung trong báo cáo T217.

## Đối chiếu đặc tả
| Điều kiện đạt (mô tả T217) | Đạt? | Ghi chú |
|---|---|---|
| pg_trgm/unaccent: tách điều đã biết và điều phải xác minh | Đạt | §2, §5.1. Đã có thêm bằng chứng tĩnh cho `Đ` (xem trên) |
| Cổng 54329, timezone | Đạt | §1.4, §4.2, §4.3. Đặt timezone tường minh qua `-c timezone=` là đúng |
| CI hay chỉ cục bộ | Đạt | Chỉ cục bộ. CI dùng service `postgres:16`, đúng nguyên tắc DevOps |
| Cách chọn Docker/embedded trong `db:test:up` | Đạt một phần | Ổn cho `up`. Cách chọn cho `down` có lỗ hổng (vấn đề #3). Danh sách giá trị của `DB_TEST_DRIVER` không thống nhất (vấn đề #4) |
| Bản ghim, khởi tạo extension, nơi lưu dữ liệu, tiêu chí loại | Đạt một phần | Bản ghim, nơi lưu dữ liệu và tiêu chí loại ổn. Bước kiểm tra §4.4 không làm được bằng công cụ §4.2 bước 5 chỉ định (vấn đề #1) |
| Việc T201 làm lại | Đạt | §6 đủ, có thứ tự, có bằng chứng phải nộp |
| Ghi chú CI (T202) | Đạt | Đúng: service container không gắn được `init.sql`, nên cần bước tạo extension. `TZ` trên service làm initdb ghi `Asia/Ho_Chi_Minh`. Cổng `54329:5432` khớp `.env.test`, nên CI không phải đặt `DATABASE_URL`. Bổ sung nhỏ ở vấn đề #5 |

Trả lời câu hỏi của kien-truc-su:
- **`pg_ctl` hay tiến trình Node tách rời**: chọn `pg_ctl`. Gói có binary này và nó ổn định hơn một tiến trình Node giữ PID. Hai điều kiện kèm theo ở vấn đề #2.
- **Collation**: tôi đồng ý chấp nhận `C` (thuộc RV quyết). Bản Windows có ICU 67, nhưng CI dùng libc `en_US.utf8`, không dùng ICU, nên chuyển sang ICU cũng không làm thứ tự giống CI hẳn.

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| 1 | MAJOR | `docs/agents/design/QD_DB_TEST.md:52` và `:60-69` (§4.2 bước 5 với §4.4) | §4.4 bắt `up` **in** `SHOW server_version/timezone/server_encoding`, danh sách extension và kết quả `unaccent`/`similarity` làm bằng chứng. Nhưng §4.2 bước 5 chỉ cho dùng `prisma db execute` và cấm `pg`. `prisma db execute` **không trả dòng kết quả**, chỉ báo thành công hay thất bại. Gói cũng không có `psql` (đã liệt kê). Làm đúng chữ thì T201 không có cách nào in bằng chứng. | Ghi rõ trong QĐ: phần kiểm §4.4 chạy bằng `@prisma/client` 5.22 đã cài sẵn (`new PrismaClient({ datasourceUrl })` + `$queryRawUnsafe`). Cách này in được kết quả, chạy cả với `template1`, và không thêm thư viện. `prisma db execute` chỉ dùng cho DDL. Tùy chọn khác: cho phép thêm `pg` làm devDependency tường minh. |
| 2 | MINOR | `QD_DB_TEST.md:51` (§4.2 bước 4) | Đặc tả cần nói rõ 3 điều để T201 không mắc lỗi khi hiện thực. (a) Đường dẫn binary phải lấy bằng `await import('@embedded-postgres/' + platform)`, vì gói chính không export `binary.js`. Đây là import một phụ thuộc gián tiếp, cùng loại với `pg` mà §5.2 đã nhắc, nên cần QĐ cho phép rõ. (b) Bắt buộc `pg_ctl start -w -l <datadir>/server.log`. Nếu thiếu `-l`, postgres giữ handle stdout của tiến trình cha, `execFileSync` sẽ treo. (c) Việc "server sống sau khi script npm thoát" mới là suy luận: trên Windows, libuv đưa tiến trình con vào job object. Cờ breakaway có lẽ đủ để giữ server sống, nhưng chưa ai chạy thử. | Thêm (a), (b) vào §4.2 bước 4. Thêm (c) vào V2: sau khi `up` thoát, một tiến trình **khác** (`db:test:reset`) phải kết nối được. §6 bước 4 đã ngầm làm việc này, chỉ cần ghi rõ là để chứng minh V2. |
| 3 | MINOR | `QD_DB_TEST.md:54` (§4.2 bước 7) | `down` chọn trình bằng `docker info` có thể chọn khác `up`. Ví dụ: `up` chạy embedded, sau đó Docker sống lại, thì `down` chỉ chạy `docker compose down` và bỏ sót postgres embedded đang giữ cổng 54329. Lần `up` sau chọn Docker sẽ lỗi cổng bận. | `down` (khi không có `DB_TEST_DRIVER`) dừng theo **trạng thái**, không theo phép dò: có `<tmpdir>/nckh-db-test/postmaster.pid` thì `pg_ctl stop`. Docker sống thì cũng chạy `compose down`. Cả hai lệnh đều an toàn khi gọi lặp lại. |
| 4 | MINOR | `QD_DB_TEST.md:13` và `:16` | §1.2 liệt kê `DB_TEST_DRIVER=docker\|embedded`, nhưng §1.3 và §6 bước 2 lại có thêm `external`. | Sửa §1.2 thành `docker\|embedded\|external`. |
| 5 | MINOR | `QD_DB_TEST.md:52`, `:114` (§4.2 bước 5, §6 bước 6) | Hai chi tiết mà T201 và T202 dễ vấp. (a) `init.sql` dùng `\c`, đây là lệnh của psql, nên không đưa được vào `prisma db execute`. Phải gọi riêng cho từng DB (URL `.../template1`, rồi `.../nckh_test`). `CREATE DATABASE` phải đứng một mình trong một lần gọi, vì nó không chạy được trong chuỗi nhiều lệnh. (b) Ghi chú T202 nên thêm `options: --health-cmd "pg_isready -U postgres" ...` cho service. Runner ubuntu có sẵn `psql`, nên CI có thể dùng `psql` hoặc cách (a). | Thêm một câu cho mỗi ý. |
| 6 | INFO | `QD_DB_TEST.md:§5.1 V5` | Cập nhật V5 theo kết quả review: `postinstall` = `hydrate-symlinks.js`, chỉ tạo symlink cục bộ từ `pg-symlinks.json` (bản Windows rỗng), không tải gì. | Ghi kết quả vào QĐ. T201 chỉ còn phải kiểm người duy trì và `npm audit signatures`. |

Kết luận: CHANGES_REQUESTED – BLOCKER 0, MAJOR 1, MINOR 4, INFO 1.
