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
