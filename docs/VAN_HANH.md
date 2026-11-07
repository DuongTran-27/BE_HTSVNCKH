# Vận hành – việc con người cần làm

## 1. DB test trên máy dev Windows (T201)
Từ T201 (theo `docs/agents/design/QD_DB_TEST.md`), `npm run db:test:up` tự dùng `embedded-postgres` khi Docker không chạy,
nên **Docker không còn chặn việc chạy test**. Không cần làm gì để chạy test; chỉ cần một lần sau khi clone/`npm ci`:
```bash
npx -w @nckh/api prisma generate
```

### 1.1 (Tùy chọn) Bật Docker Desktop – để chạy DB test giống CI hơn
Hiện Docker Desktop không khởi động được engine; log `%LOCALAPPDATA%\Docker\log\host\com.docker.backend.exe.log.0` ghi:
`engine linux/wsl failed to start: checking preconditions: Virtual Machine Platform not enabled`.

1. Bật ảo hóa CPU trong BIOS/UEFI nếu chưa bật (Intel VT-x / AMD-V; Task Manager > Performance > CPU > "Virtualization: Enabled").
2. Mở PowerShell **Run as Administrator**:
   ```powershell
   dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
   dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
   ```
3. Khởi động lại máy, mở Docker Desktop, đợi trạng thái "Engine running".
4. Xác nhận trong Git Bash tại thư mục repo:
   ```bash
   npm run db:test:down                 # dừng embedded nếu đang chạy (cổng 54329)
   docker info --format '{{.ServerVersion}}'
   npm run db:test:up                   # phải in "DB test: docker ..." và K1–K7 đều OK
   npm run db:test:reset
   npm test
   npm run db:test:down
   ```

### 1.2 Phương án C – chỉ khi embedded bị loại (QĐ §5.3)
Chưa cần. Nếu điều phối viên báo loại embedded: cài PostgreSQL 16 bản Windows (zip EDB không cần admin, hoặc bộ cài nếu có admin),
chạy server ở cổng **54329**, user/mật khẩu `postgres/postgres`, rồi chạy `DB_TEST_DRIVER=external npm run db:test:up`
(script tự tạo extension `pg_trgm`, `unaccent` và DB `nckh_test`, in bảng K1–K7).

### 1.3 Nâng phiên bản `embedded-postgres`
Gói được ghim `16.14.0-beta.17`. Nâng bản = tải binary ngoài mới → cần người dùng duyệt (QĐ §4.5); không để Dependabot tự nâng.

## 2. CI GitHub Actions (T202)
Workflow `.github/workflows/ci.yml` không cần secret nào (DB test là service container `postgres:16`, mật khẩu test `postgres` không phải bí mật).
1. Trước tiên đẩy lịch sử hiện có (đến commit ngay trước T202) lên GitHub thành nhánh mặc định `main` (local đang là `master`: `git push origin <commit-trước-T202>:refs/heads/main`), rồi mới đẩy nhánh chứa T202 và mở PR vào `main`. Nếu `main` rỗng/cũ, bước "Prettier cho file mới" sẽ kiểm cả file cũ và job `lint` đỏ. CI cũng chạy khi push vào `master`.
2. Tab **Actions** → run "CI" của PR: phải có 3 job xanh – `lint`, `test (22.22)`, `test (24)`.
3. Mở log job `test (24)`, kiểm:
   - bước `npm run db:test:up` in K1–K7 đều `OK` (K2 `Asia/Ho_Chi_Minh`);
   - bước "Địa chỉ server mà lớp kiểm mức DB thấy" in `inet_server_addr = 172.x.x.x` (hoặc 127.0.0.1/::1);
   - bước `npm test` xanh – nghĩa là `globalSetup` đã qua lớp kiểm mức DB với địa chỉ đó.
   Địa chỉ ngoài 10.x/172.16–31.x/192.168.x/loopback → test đỏ "Từ chối chạy test"; báo lại devops (mở BUG), **không** nới chốt chặn tay.
4. Job Summary của run có bảng "Độ phủ module nghiệp vụ"; artifact `coverage` (giữ 7 ngày) có báo cáo HTML.
5. (Khuyến nghị) Settings → Branches → Branch protection cho `main`: bật "Require status checks to pass", chọn `lint`, `test (22.22)`, `test (24)`.
6. Nếu job `test (22.22)` báo không tìm được Node 22.22 → báo devops; không hạ `engines` (react-router 8.4 cần ≥ 22.22).

## 3. Sao lưu và dọn file mồ côi (T608, FR26)
File: `.github/workflows/backup.yml`, `.github/workflows/cleanup-orphans.yml`, `apps/api/scripts/backup-prune.js`, `apps/api/scripts/cleanup-orphans.js`.

### 3.1 Thiết lập (một lần, con người làm)
1. Supabase > Project Settings > Database > Connection string, chọn **Session pooler** (cổng 5432; pg_dump không chạy qua Transaction pooler 6543). **Bắt buộc dùng role chỉ đọc** (job dọn mồ côi dùng lại secret này, chạy sau `npm ci`). Tạo bằng SQL Editor: `CREATE ROLE backup_ro LOGIN BYPASSRLS PASSWORD '<mật khẩu mạnh>'; GRANT CONNECT ON DATABASE postgres TO backup_ro; GRANT USAGE ON SCHEMA public TO backup_ro; GRANT SELECT ON ALL TABLES IN SCHEMA public TO backup_ro; GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO backup_ro; ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT ON TABLES TO backup_ro; ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT ON SEQUENCES TO backup_ro;` `BYPASSRLS` là bắt buộc: mọi bảng `public` bật RLS không có policy (migration `20261101000100`), thiếu nó pg_dump báo lỗi còn job dọn mồ côi thấy 0 dòng mà không lỗi. Nếu Supabase từ chối `BYPASSRLS` cho role `postgres` thì báo devops, đừng bỏ cờ này. `ALTER DEFAULT PRIVILEGES` giúp bảng tạo ở migration sau vẫn đọc được. pg_dump chỉ dump schema `public` (`--schema=public`). (với pooler, user là `backup_ro.<ref>`).
2. GitHub repo phải là **private** (workflow tự từ chối chạy nếu repo public). Settings > Secrets and variables > Actions > New repository secret: `BACKUP_DATABASE_URL` = chuỗi trên; `BACKUP_PASSPHRASE` = cụm mật khẩu dài ngẫu nhiên (>= 32 ký tự) dùng mã hóa dump. Cất `BACKUP_PASSPHRASE` ở nơi an toàn thứ hai (trình quản lý mật khẩu): mất nó là không giải mã được mọi bản sao lưu.
3. Settings > Actions > General > Workflow permissions: workflow tự khai `actions: write` để xóa artifact cũ; nếu tổ chức chặn thì chọn "Read and write permissions".
4. Đẩy lên GitHub. Tab Actions > "Backup" > Run workflow (chạy tay lần đầu).

### 3.2 Xác nhận
- Run xanh; bước "Kiểm tra bản dump đọc được" in vài dòng `pg_restore --list`; artifact `nckh-backup-YYYYMMDD-HHMMSS.dump.gpg` xuất hiện.
- Từ ngày thứ 8, bước "Giữ 7 bản mới nhất" in `đã xóa artifact ...`; luôn còn đúng 7 bản `nckh-backup-*` (chỉ tính artifact của run `backup.yml` trên nhánh mặc định; step không còn đỏ khi không có gì để xóa).
- Sau khi đẩy lên, đợi một lần chạy **theo lịch** (sự kiện `schedule`, không phải chạy tay) và xác nhận log: bước "Từ chối repo public" xanh, bước dọn in đúng nhánh mặc định. Chạy tay có payload khác lịch nên không đủ.
- Lịch chạy 03:00 giờ VN. GitHub tự tắt workflow theo lịch sau 60 ngày repo không hoạt động: kiểm tra định kỳ.
- Giới hạn: chỉ sao lưu DB, không sao lưu file Cloudinary (ngoài phạm vi FR26). Dump được mã hóa gpg AES256 bằng `BACKUP_PASSPHRASE` trước khi upload.

### 3.3 Diễn tập khôi phục (làm ít nhất một lần, có biên bản)
Làm trên **DB thử**, không bao giờ trên DB production (project Supabase thứ hai hoặc Postgres cục bộ).
1. Tải artifact từ tab Actions, giải nén ra `nckh-backup-....dump.gpg`, rồi giải mã: `gpg --batch --pinentry-mode loopback --passphrase '<BACKUP_PASSPHRASE>' -d -o nckh-backup.dump nckh-backup-....dump.gpg` (gõ trên máy cá nhân, tránh để cụm mật khẩu trong lịch sử shell; hoặc bỏ `--passphrase` để gpg hỏi). Các lệnh dưới dùng `nckh-backup.dump`.
2. Ghi giờ bắt đầu. Tạo DB trống, rồi (nếu trên Supabase hai extension nằm ở schema `extensions` thì tạo `CREATE SCHEMA IF NOT EXISTS extensions;` và thêm `WITH SCHEMA extensions` vào các lệnh sau) `CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE EXTENSION IF NOT EXISTS unaccent;`
3. `pg_restore --no-owner --no-privileges --clean --if-exists -d "<URL DB thử>" nckh-backup.dump` (hoặc `docker run --rm -i postgres:17 pg_restore ... < file`). Cảnh báo về schema hệ thống Supabase có thể bỏ qua; lỗi ở bảng `public` thì không.
4. Chạy truy vấn sau ở cả DB gốc và DB thử, so sánh (lệch nhỏ là bình thường nếu DB gốc có ghi sau thời điểm dump; ghi lại):
   `SELECT 'User',count(*) FROM "User" UNION ALL SELECT 'Topic',count(*) FROM "Topic" UNION ALL SELECT 'Document',count(*) FROM "Document" UNION ALL SELECT 'StatusHistory',count(*) FROM "StatusHistory" UNION ALL SELECT 'AuditLog',count(*) FROM "AuditLog";`
5. Kiểm trigger và index còn nguyên: `SELECT count(*) FROM pg_trigger WHERE tgname LIKE '%immutable%';` (kỳ vọng >= 3), `SELECT count(*) FROM pg_indexes WHERE indexdef ILIKE '%gin%';` (> 0).
6. Ghi giờ kết thúc. Lập biên bản (ngày, người làm, bản dump nào, thời gian khôi phục, bảng số bản ghi, kết quả) lưu vào `docs/agents/reports/` hoặc nơi khoa quy định.

### 3.4 Dọn file mồ côi
- Job `Cleanup orphans` chạy **dry-run** theo lịch: liệt kê file Cloudinary (`raw`/`authenticated`, tiền tố `<CLOUDINARY_FOLDER>/`), đối chiếu `Document.publicId`, in file mồ côi (không Document nào tham chiếu, cũ hơn 24 giờ) và số Document `UPLOADING` quá 24 giờ. Cần secret `CLOUDINARY_URL` và biến repo `CLOUDINARY_FOLDER` (giống giá trị của backend production, mặc định backend là `nckh/production`).
- Xóa thật: `node --env-file-if-exists=apps/api/.env apps/api/scripts/cleanup-orphans.js --apply`. Mỗi file xóa ghi AuditLog `STORAGE_ORPHAN_DELETE` (`entityType: StorageObject`, `entityId: publicId`), nên cần URL DB **có quyền ghi AuditLog** – role `backup_ro` của job không ghi được, vì vậy job theo lịch vẫn chỉ dry-run. Không bao giờ xóa file có Document tham chiếu (kiểm lại ngay trước khi xóa); không xóa dòng DB nào.
- **Chốt chặn `--apply`** (chống xóa nhầm khi DB và thư mục kho không khớp, ví dụ DB dev + kho production): (1) bắt buộc đặt tường minh `CLOUDINARY_FOLDER` (không dùng mặc định `nckh/<NODE_ENV>`), thiếu thì exit 2; (2) từ chối (exit 3, không xóa gì) khi số mồ côi > 10 file hoặc > 10% số file liệt kê, trừ khi có `--max-delete=N` với N >= số mồ côi. Quy trình: chạy dry-run trước **với đúng cùng biến môi trường**, kiểm tra danh sách và `DATABASE_URL` trỏ đúng DB production (có quyền ghi), rồi mới chạy `--apply` (thêm `--max-delete=N` nếu cần). AuditLog được ghi trước khi xóa từng file.
- Không có `CLOUDINARY_URL`: chỉ dry-run, có thể đưa danh sách bằng `--storage-list=ds.json` (`[{ "publicId", "createdAt" }]`); `--apply` bị từ chối (exit 2).

## 4. Nhắc hạn theo lịch (T502, FR13)
File: `.github/workflows/reminders.yml` (08:00 giờ VN hằng ngày + chạy tay), gọi `POST /api/cron/reminders` (T501).
1. Render: đặt biến môi trường `CRON_SECRET` (>= 32 ký tự ngẫu nhiên, ví dụ `openssl rand -base64 48`), deploy lại. Chưa đặt thì endpoint trả 404.
2. GitHub > Settings > Secrets and variables > Actions > New repository secret: `CRON_SECRET` (cùng giá trị) và `API_BASE_URL` (ví dụ `https://<app>.onrender.com`, không có `/api`, không dấu `/` cuối). Có thể trỏ qua domain Vercel nếu proxy `/api/*` đã bật.
3. Tab Actions > "Reminders" > Run workflow. Xanh: log in `HTTP 200` và JSON số thông báo đã tạo. Chạy lần hai: số mới ~0 (chống trùng).
4. Lỗi: 404 = chưa đặt `CRON_SECRET` trên Render; 401 = hai giá trị lệch nhau; 429 = gọi quá 10 lần/15 phút. Workflow tự thử lại 4 lần (cách 30 giây) cho trường hợp Render đang khởi động.
5. Chạy lại kiểm tra trùng lặp (T609, G5): `.github/workflows/similarity-recheck.yml` (phút 15 mỗi giờ + chạy tay), gọi `POST /api/cron/similarity-rechecks`, dùng **cùng hai secret** trên. Kết quả JSON `{ checked, updated, stillFailing }`; `stillFailing` > 0 nhiều giờ liền = FR06 vẫn lỗi, xem log Render. Limiter 10 lần/15 phút dùng chung với nhắc hạn.

## 5. Tách role chạy app khỏi role migrate (T703c, đề xuất – con người làm trên Supabase)
Mục đích: trigger chỉ-thêm (AuditLog, StatusHistory, Document, Feedback, …) chỉ chặn được nếu role của app **không sở hữu bảng**. Role sở hữu (`postgres`) luôn `DROP TRIGGER` / `ALTER TABLE … DISABLE TRIGGER` được (MINOR 3 `reviews/T204-bao-mat-v1.md`). Migration vẫn chạy bằng `postgres`, app chạy bằng role mới `nckh_app`. Không đổi code; chỉ đổi chuỗi kết nối.

### 5.1 Tạo role (Supabase > SQL Editor, chạy bằng `postgres`, sau khi `prisma migrate deploy` đã chạy)
```sql
-- BYPASSRLS bắt buộc: mọi bảng public bật RLS không policy (NFR03); thiếu cờ này app thấy 0 dòng mà không báo lỗi.
CREATE ROLE nckh_app LOGIN NOINHERIT NOCREATEDB NOCREATEROLE BYPASSRLS PASSWORD '<mật khẩu mạnh, khác postgres>';
GRANT CONNECT ON DATABASE postgres TO nckh_app;
GRANT USAGE ON SCHEMA public TO nckh_app;
GRANT USAGE ON SCHEMA extensions TO nckh_app;   -- pg_trgm/unaccent của Supabase nằm ở schema extensions
-- Chỉ DML; không TRUNCATE, REFERENCES, TRIGGER
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO nckh_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO nckh_app;   -- topic_code_seq, id AuditLog
-- Bảng chỉ-thêm tuyệt đối (trigger forbid_mutation không có ngoại lệ): bỏ luôn quyền sửa/xóa – lớp thứ hai ngoài trigger.
-- KHÔNG đưa vào đây Submission, ResultVersion, ChangeRequest: trigger của chúng cho phép một số UPDATE hợp lệ.
REVOKE UPDATE, DELETE ON "AuditLog", "StatusHistory", "ReviewDecision", "SimilarityCheck", "Document",
  "MilestoneDueChange", "Feedback", "MilestoneReopen", "SimilarityBypass" FROM nckh_app;
-- Bảng/sequence do migration sau tạo (chạy bằng postgres) tự có quyền DML
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO nckh_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO nckh_app;
```
Migration sau tạo **bảng chỉ-thêm mới** phải tự thu quyền, viết sao cho chạy được cả trên DB test (không có role này):
`DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nckh_app') THEN REVOKE UPDATE, DELETE ON "<Bảng>" FROM nckh_app; END IF; END $$;`

### 5.2 Đổi chuỗi kết nối
- Render `DATABASE_URL`: `postgresql://nckh_app.<ref>:<mật khẩu>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1`.
- `DIRECT_URL` (role `postgres`) chỉ dùng cho `prisma migrate deploy`. Nếu còn để trên Render (lệnh build chạy migrate) thì kẻ chiếm được tiến trình app vẫn đọc được nó; tách thật sự = chạy migrate ở nơi khác (job GitHub Actions chạy tay có secret riêng) và **xóa `DIRECT_URL` khỏi Render**. Việc này thuộc T706 (devops kiểm Prisma Client có cần biến `DIRECT_URL` lúc chạy không; nếu cần thì đặt bằng đúng chuỗi `nckh_app`).
- Script `bootstrap` admin chạy bằng `DATABASE_URL` (`nckh_app`) được. Seed và job sao lưu giữ nguyên (`postgres` / `backup_ro`); `ALTER DEFAULT PRIVILEGES FOR ROLE postgres` ở mục 3.1 vẫn đúng vì migration vẫn chạy bằng `postgres`.

### 5.3 Xác nhận (kết nối bằng `nckh_app` qua psql/pooler cổng 5432, không phải SQL Editor)
Mỗi câu sau phải **lỗi** (permission denied / must be owner):
```sql
DROP TRIGGER audit_log_append_only ON "AuditLog";
ALTER TABLE "AuditLog" DISABLE TRIGGER ALL;
SET session_replication_role = replica;
UPDATE "AuditLog" SET action = action WHERE false;
TRUNCATE "Notification";
CREATE TABLE zz (x int);
```
Nếu riêng `CREATE TABLE` chạy được: `REVOKE CREATE ON SCHEMA public FROM PUBLIC;` (chạy bằng postgres). Đã thử kịch bản 5.1 + các câu trên trên Postgres 16 của DB test bằng `SET ROLE nckh_app` (T703c): 6 câu bị từ chối; SELECT, nextval, INSERT AuditLog, UPDATE Topic chạy được.
Còn `SELECT count(*) FROM "User";` phải trả đúng số tài khoản (khác 0 – nếu 0 là thiếu `BYPASSRLS`). Sau đó đăng nhập web, tạo/sửa một đề tài, tải một tài liệu, xem thống kê để chắc app đủ quyền.

### 5.4 Data API của Supabase (NFR03)
Cách chắc nhất: Settings > API > tắt Data API (app không dùng). Nếu giữ: `curl "https://<ref>.supabase.co/rest/v1/User?select=id" -H "apikey: <anon key>"` phải trả `[]` hoặc lỗi; và nên chạy `REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;` (các hàm hiện có vô hại nhưng gọi được qua `/rest/v1/rpc/...`).
