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
1. Đẩy nhánh chứa T202 lên GitHub và mở PR vào `main`.
2. Tab **Actions** → run "CI" của PR: phải có 3 job xanh – `lint`, `test (22.22)`, `test (24)`.
3. Mở log job `test (24)`, kiểm:
   - bước `npm run db:test:up` in K1–K7 đều `OK` (K2 `Asia/Ho_Chi_Minh`);
   - bước "Địa chỉ server mà lớp kiểm mức DB thấy" in `inet_server_addr = 172.x.x.x` (hoặc 127.0.0.1/::1);
   - bước `npm test` xanh – nghĩa là `globalSetup` đã qua lớp kiểm mức DB với địa chỉ đó.
   Địa chỉ ngoài 10.x/172.16–31.x/192.168.x/loopback → test đỏ "Từ chối chạy test"; báo lại devops (mở BUG), **không** nới chốt chặn tay.
4. Job Summary của run có bảng "Độ phủ module nghiệp vụ"; artifact `coverage` (giữ 7 ngày) có báo cáo HTML.
5. (Khuyến nghị) Settings → Branches → Branch protection cho `main`: bật "Require status checks to pass", chọn `lint`, `test (22.22)`, `test (24)`.
6. Nếu job `test (22.22)` báo không tìm được Node 22.22 → báo devops; không hạ `engines` (react-router 8.4 cần ≥ 22.22).
