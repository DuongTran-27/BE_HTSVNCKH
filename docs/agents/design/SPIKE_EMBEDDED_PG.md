# Spike: embedded-postgres thay Docker cho DB test (đầu vào T217)

Ngày chạy: 2026-11-01. Máy: Windows 11 Pro 22621, Node v24.12.0, npm 11.6.2, user `GIGA` **không có quyền admin** (`net session` thất bại).
Thư mục nháp: `C:\Users\GIGA\AppData\Local\Temp\claude\...\scratchpad\pg-spike` (ngoài repo; repo không thêm dependency).

Bối cảnh: Docker Desktop không chạy (WSL lỗi `HCS_E_SERVICE_NOT_AVAILABLE`). T201 cần Postgres 16 + pg_trgm + unaccent, cổng 54329, DB `nckh_test`, TZ `Asia/Ho_Chi_Minh`.

## 1. Chọn phiên bản

```
$ npm view embedded-postgres time --json | grep '"16\.' | tail -4
  "16.13.0-beta.17": "2026-04-17T09:32:50.813Z",
  "16.14.0-beta.17": "2026-06-05T10:11:02.851Z",
  "16.15.0-beta.19": "2026-10-30T17:48:57.097Z",
```

- `16.15.0-beta.19` mới 2 ngày tuổi, chưa đủ 2 tuần nên **loại**.
- Chọn **`embedded-postgres@16.14.0-beta.17`** (phát hành 2026-06-05). Binary `@embedded-postgres/windows-x64@16.14.0-beta.17` phát hành 2026-06-05T10:10:58Z.
- Lưu ý: mọi bản của gói đều gắn nhãn `-beta` (đây là cách upstream đánh số, không có bản "stable"). Phải pin chính xác (`--save-exact`).
- Dải `^16.14.0-beta.17` của các optionalDependencies không khớp `16.15.0-beta.*` (theo semver, prerelease chỉ khớp cùng bộ 16.14.0), nên binary vẫn là 16.14.

## 2. Cài đặt

```
$ npm init -y && npm install --save-exact embedded-postgres@16.14.0-beta.17 pg
added 17 packages, and audited 18 packages in 5s
found 0 vulnerabilities
INSTALL_SECONDS=6
$ du -sh node_modules; du -sh node_modules/@embedded-postgres/*
100M    node_modules
99M     node_modules/@embedded-postgres/windows-x64
$ npm ls --depth=1
├─┬ embedded-postgres@16.14.0-beta.17
│ ├── UNMET OPTIONAL DEPENDENCY @embedded-postgres/linux-x64@^16.14.0-beta.17   (bình thường: chỉ cài binary đúng nền tảng)
│ ├── @embedded-postgres/windows-x64@16.14.0-beta.17
│ ├── async-exit-hook@2.0.1
│ └── pg@8.23.1 deduped
└─┬ pg@8.23.1
```

Binary có sẵn extension (không cần tải thêm):

```
$ find @embedded-postgres/windows-x64 -name 'pg_trgm*' -o -name 'unaccent*'
native/lib/pg_trgm.dll
native/lib/unaccent.dll
native/share/extension/pg_trgm.control
native/share/extension/pg_trgm--1.5--1.6.sql ...
```

## 3. Script chạy thử (`spike.mjs`, trong thư mục nháp)

Tùy chọn chính: `databaseDir=./data`, `port: 54329`, `user/password: postgres/postgres`, `persistent: false`,
`initdbFlags: ['--encoding=UTF8','--locale=C']`, `postgresFlags: ['-c','timezone=Asia/Ho_Chi_Minh']`.
Trình tự: `initialise()` -> `start()` -> `createDatabase('nckh_test')` -> các truy vấn qua `pg.Client` -> `stop()` -> xóa `./data`.

```
$ time node spike.mjs
initialise: 6.88s
start: 0.13s
CREATE EXTENSION pg_trgm => []
CREATE EXTENSION unaccent => []
SELECT extname, extversion FROM pg_extension ORDER BY extname => [{"extname":"pg_trgm","extversion":"1.6"},{"extname":"plpgsql","extversion":"1.0"},{"extname":"unaccent","extversion":"1.1"}]
SELECT similarity('kiem tra','kiểm tra') AS sim_raw, similarity('kiem tra', unaccent('kiểm tra')) AS sim_unaccent, unaccent('Kiểm tra') AS ua => [{"sim_raw":0.5,"sim_unaccent":1,"ua":"Kiem tra"}]
SHOW server_version => [{"server_version":"16.14"}]
SHOW timezone => [{"TimeZone":"Asia/Ho_Chi_Minh"}]
SELECT now()::text AS now => [{"now":"2026-11-01 12:24:51.067803+07"}]
ALTER DATABASE nckh_test SET timezone TO 'Asia/Ho_Chi_Minh' => []
stop: 0.14s

real    0m7.533s
EXIT=0
$ tasklist | grep -i postgres || echo "no postgres process"
no postgres process
```

## 4. Ghi nhận

| Mục | Kết quả |
|---|---|
| Thời gian cài | ~6 s (cache npm nóng một phần) |
| Dung lượng node_modules | 100 MB (99 MB là binary windows-x64) |
| Khởi động | `initialise` (initdb) 6,9 s lần đầu; `start` 0,13 s; `stop` 0,14 s; tổng vòng đời 7,5 s |
| Cần admin? | **Không** – chạy bằng user thường `GIGA` |
| Lỗi gặp phải | Không có. Không báo thiếu VC++ runtime, không lỗi quyền thư mục, không lỗi cổng |
| pg_trgm / unaccent | Có: pg_trgm 1.6, unaccent 1.1 (điều kiện loại **không** xảy ra) |
| Bản server | PostgreSQL 16.14 |
| Timezone | `postgresFlags: ['-c','timezone=Asia/Ho_Chi_Minh']` có hiệu lực; `ALTER DATABASE ... SET timezone` cũng chạy được (dự phòng) |
| Hỗ trợ CI linux-x64 | Có: optionalDependency `@embedded-postgres/linux-x64@16.14.0-beta.17` (os=linux, cpu=x64); README liệt kê Linux/x64 hỗ trợ đầy đủ. `engines.node >= 16` |
| Dọn dẹp | `persistent: false` + xóa `./data`; sau khi chạy không còn tiến trình postgres |

Hạn chế / rủi ro:
- Gói luôn mang nhãn `beta`; cần pin chính xác và để `package-lock.json` khóa cả binary.
- Không chạy dưới root (Linux) trừ khi bật `createPostgresUser` (sửa hệ thống) – runner GitHub Actions mặc định là user `runner`, không phải root, nên không ảnh hưởng. Chưa thử trên Linux.
- Dùng `--locale=C`: sắp xếp chuỗi tiếng Việt theo byte; Supabase dùng `en_US.UTF-8`. Không ảnh hưởng pg_trgm/unaccent nhưng có thể khác thứ tự `ORDER BY` văn bản.
- `npm ci` trên mọi máy sẽ tải ~100 MB binary nếu gói nằm trong devDependencies chung; cân nhắc chỉ dùng cục bộ (CI giữ service Postgres 16 như nguyên tắc DevOps).
- Chưa thử Prisma `migrate deploy` trên cluster này (ngoài phạm vi spike).

## 5. Kết luận

**Khả thi.** `embedded-postgres@16.14.0-beta.17` chạy Postgres 16.14 trên Windows không cần admin/Docker, có sẵn pg_trgm + unaccent, đặt được cổng 54329, DB `nckh_test`, TZ `Asia/Ho_Chi_Minh`; vòng đời khởi tạo-chạy-dừng khoảng 7,5 s. Có binary linux-x64 cho CI nếu cần.
Việc thêm gói làm devDependency của repo là đổi/thêm thư viện, cần `kien-truc-su` duyệt (theo CLAUDE.md).
