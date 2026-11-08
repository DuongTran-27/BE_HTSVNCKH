# T707b-do – B14: job E2E trong CI

## Thay đổi
- `.github/workflows/ci.yml`: thêm job `e2e` (ubuntu-latest, Node 24, `needs: test`, timeout 30 phút).
  - Service `postgres:16` cổng 54329 (giống job test), `DB_TEST_DRIVER=external`.
  - Các bước: `npm ci` -> `prisma generate` -> `npm run db:test:up` (tạo pg_trgm/unaccent ở template1, để `prepare.js` tạo `nckh_t309_test` kế thừa extension) -> `npx playwright install --with-deps chromium` (working-directory apps/web) -> `npm run test:e2e -w @nckh/web`.
  - `actions/upload-artifact@v4` khi `failure()`: `apps/web/e2e/.out/test-results/` (trace `retain-on-failure`, ảnh/video nếu có), 7 ngày.
- Không đụng job lint/test; không thêm secret. Biến E2E là giá trị giả đã cố định trong `apps/web/e2e/env.js` (không đọc .env).

## Giả định
- `db:test:up` ở chế độ external dùng đúng postgres://postgres:postgres@localhost:54329 như `env.js` (đã đúng ở job test).
- Matrix Node không cần: chỉ Node 24.
- `needs: test` nghĩa là e2e chỉ chạy khi cả 2 phiên bản Node của test xanh (tổng thời gian CI tăng ~3 phút + cài chromium).

## Bằng chứng
- `npx prettier --check .github/workflows/ci.yml`: All matched files use Prettier code style.
- actionlint: không có sẵn (`npx actionlint` lỗi không tìm thấy executable) -> chưa kiểm.
- `npm run db:test:up`: K1–K7 OK, "DB test đã chạy".
- `npm run test:e2e -w @nckh/web` (Windows, local): 58 passed (2.8m).
- `apps/web/e2e/.out` đã nằm trong .gitignore.

## Rủi ro
- Chưa chạy thật trên GitHub Actions/Linux. Có thể gặp: thiếu thư viện hệ thống (đã có `--with-deps`), khác biệt đường dẫn/locale Linux, thời gian (60s timeout webServer) trên runner chậm.
- Reporter chỉ `list`, không có HTML report; trace nằm trong test-results. Nếu muốn HTML report cần sửa playwright.config.js (không làm).
- Cách xác nhận: đẩy lên nhánh/PR, xem job `e2e` xanh và log "58 passed"; nếu đỏ tải artifact `playwright-e2e`, mở bằng `npx playwright show-trace`.
- Reviewer nên cân nhắc đặt `e2e` thành required check trong branch protection (việc con người).
