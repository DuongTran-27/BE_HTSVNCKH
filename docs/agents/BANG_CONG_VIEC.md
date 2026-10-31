# Bảng công việc

Chủ trì: KTS = kien-truc-su · BE = backend-dev · FE = frontend-dev · QA = kiem-thu · RV = reviewer · BM = bao-mat · DO = devops.
Cột **Review**: mọi agent trong cột phải APPROVED. Chỉ điều phối viên sửa cột Trạng thái.
Giai đoạn 1 (nền tảng: auth, state machine, similarity engine, CSV, schema) đã xong – xem `docs/LO_TRINH.md`.

## Giai đoạn 2 – Hạ tầng và API nghiệp vụ

| ID | Việc | FR/NFR | Chủ trì | Review | Phụ thuộc | Trạng thái |
|---|---|---|---|---|---|---|
| T199 | Quyết định nâng `zod` 3 → 4 (lỗ hổng GHSA-mrhx-c7xc-m3w5, mức high) hoặc biện pháp thay thế (giới hạn kích thước body/mảng); ghi `design/QD_ZOD.md` | NFR02 | KTS | RV, BM | – | DONE 2026-11-01 |
| T200 | Hợp đồng API GĐ2 (`docs/agents/design/API_GD2.md`): endpoint, request/response, mã lỗi, quyền từng vai trò | FR02–FR08, FR16, FR17 | KTS | RV, FE, BE | T199 | TODO |
| T201 | `docker-compose.test.yml` Postgres 16 + pg_trgm/unaccent; script reset DB cho test; tách DB dev/test | NFR08 | DO | RV, QA | – | BLOCKED |
| T216 | Nâng `vitest` (và vite/esbuild/tinypool kéo theo) lên bản không còn lỗ hổng audit (critical/high); 44 test vẫn đạt; `npm audit` sạch | NFR09 | DO | RV, BM | – | DONE 2026-11-01 |
| T202 | ESLint + Prettier + GitHub Actions chạy lint + test mỗi PR (có service Postgres); `@vitest/coverage-v8`, báo độ phủ module nghiệp vụ trên CI; ma trận Node 20 + 24, `engines` `>=20.19.0` ở package.json gốc, `npm ci` giữ optional deps (binding rolldown/lightningcss của vite 8) | NFR09 | DO | RV | T201, T216 | TODO |
| T203 | Migration init + `after_init.sql`; seed dữ liệu mẫu (1 khoa, 3 ngành, lĩnh vực CNTT, 1 đợt, 2 cán bộ, 8 GV, 40 SV, 30 đề tài đủ trạng thái, từ điển đồng nghĩa) | FR04, FR06 | BE | RV, QA | T201 | TODO |
| T204 | Service lịch sử thao tác (AuditLog) + helper ghi StatusHistory; integration test trigger chỉ-thêm | FR15 | BE | RV, BM | T203 | TODO |
| T205 | Repo Prisma cho auth chạy với DB thật; integration test FR01 trên Postgres | FR01 | BE | RV, BM | T203 | TODO |
| T215 | Thực hiện `design/QD_ZOD.md`: nâng zod 4 + `express-rate-limit ^8` (một bản cho mọi workspace), bỏ `required_error`, `ENABLE_SWAGGER` dùng `z.stringbool()`, locale `vi`, thêm `.max()` theo §5, `express.json` 100kb, trả 413 `PAYLOAD_TOO_LARGE`; toàn bộ test ở §6 (đổi 5 `it.fails` trong `tests/security/T199-input-size.test.js` thành `it`); limiter dùng chung trả 429 `RATE_LIMITED` qua errorHandler (tiếng Việt) cho `/login` và `/change-password`; MINOR trong `reviews/T199-*-v2.md`; limiter login `skipSuccessfulRequests: true` + test (M1, `reviews/T199-bao-mat-v3.md`); đổi 2 `it.fails` trong `tests/security/T199-rate-limit.test.js`; createLimiter tách nhánh IP (`ipv6Subnet`) và theo người dùng (`keyGenerator`) – MINOR 1 `reviews/T199-reviewer-v3.md` | NFR02 | BE | RV, BM | T199 | TODO |
| T206 | API danh mục + đợt (CRUD, ngừng dùng thay vì xóa, kiểm tra thứ tự mốc) | FR04 | BE | RV, FE | T200, T204, T215 | TODO |
| T207 | API tài khoản: tạo, khóa/mở, reset, nhập CSV có xem trước + lỗi theo dòng; phạm vi khoa của cán bộ; áp dụng `design/QD_ZOD.md` §4.4 (importLock kiểm và đặt cờ đồng bộ, test đồng thời bằng hasher giả) | FR02, FR25 | BE | RV, BM | T205, T206 | TODO |
| T208 | API nhóm + lời mời + trưởng nhóm; giới hạn min–max và đề tài hoạt động/sinh viên | FR03 | BE | RV, QA | T206 | TODO |
| T209 | API hồ sơ đề tài: nháp, sửa theo trạng thái, kiểm tra trường bắt buộc, sinh mã bằng sequence | FR05 | BE | RV, QA | T208 | TODO |
| T210 | API đề nghị hướng dẫn: gửi, nhận/từ chối, rút; hạn mức GV kiểm tra trong transaction | FR16 | BE | RV, QA | T209 | TODO |
| T211 | Endpoint kiểm tra tương tự qua DB (pg_trgm) + lưu SimilarityCheck + ẩn hồ sơ chờ với SV | FR06 | BE | RV, BM, QA | T209 | TODO |
| T212 | Gửi xét duyệt / gửi lại + snapshot bất biến + quyết định duyệt/sửa/từ chối + so sánh 2 snapshot | FR07, FR17 | BE | RV, QA | T210, T211 | TODO |
| T213 | API tra cứu danh sách: lọc, phân trang server, phạm vi theo vai trò | FR08 | BE | RV, BM, FE | T212 | TODO |
| T214 | Test integration độc lập cho luồng GĐ2 (viết từ đặc tả, không đọc code service); gồm test rollback transaction khi lỗi giữa chừng (NFR05) và hạn tính theo giờ server bất kể giờ máy khách (NFR06) | FR02–FR08, FR16, FR17 | QA | RV | T213 | TODO |

## Giai đoạn 3 – Frontend lõi

| ID | Việc | FR/NFR | Chủ trì | Review | Phụ thuộc | Trạng thái |
|---|---|---|---|---|---|---|
| T300 | Thiết kế màn hình theo vai trò (`design/UI.md`): sitemap, route, quyền, trạng thái rỗng/lỗi/tải | M1–M5 | KTS | RV, FE | T200 | TODO |
| T301 | Khung `apps/web`: Vite (vite 8 đã có trong repo từ T216 – chọn `@vitejs/plugin-react` tương thích), Router, Tailwind, TanStack Query, API client tự refresh, xóa cache khi logout, proxy `/api` khi dev | NFR01, NFR07 | FE | RV, BM | T300 | TODO |
| T302 | Đăng nhập, đổi mật khẩu, bắt đổi mật khẩu lần đầu | FR01 | FE | RV, BM | T301, T205 | TODO |
| T303 | Layout theo vai trò, route guard, trang 403/404 | FR25 | FE | RV, BM | T302 | TODO |
| T304 | Màn quản trị: danh mục, đợt (form cấu hình tham số), tài khoản + nhập CSV | FR02, FR04 | FE | RV, QA | T303, T207 | TODO |
| T305 | Màn sinh viên: nhóm + lời mời, soạn hồ sơ, "Kiểm tra trước", cảnh báo vàng/đỏ, giải trình, gửi | FR03, FR05, FR06 | FE | RV, QA | T303, T212 | TODO |
| T306 | Màn giảng viên: đề nghị hướng dẫn chờ xử lý, nhận/từ chối | FR16 | FE | RV, QA | T303, T210 | TODO |
| T307 | Màn cán bộ: hàng chờ xét duyệt, xem snapshot + kết quả FR06 + giải trình, so sánh 2 lần gửi, quyết định | FR07, FR17 | FE | RV, QA | T303, T212 | TODO |
| T308 | Màn danh sách/tra cứu có bộ lọc, phân trang | FR08 | FE | RV, QA | T303, T213 | TODO |
| T309 | E2E Playwright GĐ3: SV tạo nhóm → mời GV → GV nhận → SV gửi (có trùng cao) → cán bộ duyệt | M1, M5 | QA | RV | T305–T307 | TODO |

## Giai đoạn 4 – Thực hiện đề tài

| ID | Việc | FR/NFR | Chủ trì | Review | Phụ thuộc | Trạng thái |
|---|---|---|---|---|---|---|
| T400 | Hợp đồng API GĐ4–5 (`design/API_GD45.md`) | FR09–FR14, FR24, FR27 | KTS | RV, FE, BE | T214 | TODO |
| T401 | API mốc: tạo/sửa (GVHD, cán bộ), đổi hạn có lịch sử | FR09 | BE | RV, QA | T400 | TODO |
| T402 | API tiến độ: tự khai %, khóa sau khi GV nhận xét | FR10 | BE | RV, QA | T401 | TODO |
| T403 | Upload Cloudinary raw/authenticated qua backend (multer, loại + dung lượng), phiên bản, nhãn nộp muộn, link ngoài; tải bằng URL ký 5 phút + ghi lịch sử; áp dụng `design/QD_ZOD.md` §4.3 (multer ^2.5.0, kiểm nội dung trên buffer); URL ký ở chế độ `attachment` (M2 review T199) | FR11, FR24 | BE | RV, BM, QA | T401 | TODO |
| T404 | API nhận xét theo bản nộp, đánh giá mốc, kết quả cuối có phiên bản | FR12 | BE | RV, QA | T403 | TODO |
| T405 | API đóng đề tài (REQUEST_CLOSE, RETURN, CONFIRM_CLOSE, CLOSE_EXPIRED) dùng `checkTransition` | FR27 | BE | RV, QA | T404 | TODO |
| T406 | UI mốc, tiến độ, nộp file, nhận xét, đóng đề tài cho cả 3 vai trò | FR09–FR12, FR27 | FE | RV, QA | T405 | TODO |
| T407 | E2E GĐ4: nộp mốc → nộp muộn → GV nhận xét → đủ điều kiện → đóng | M2, M3 | QA | RV | T406 | TODO |

## Giai đoạn 5 – Thông báo và thống kê

| ID | Việc | FR/NFR | Chủ trì | Review | Phụ thuộc | Trạng thái |
|---|---|---|---|---|---|---|
| T501 | Thông báo trong web (đã đọc, chống trùng theo dedupeKey) + endpoint nhắc hạn bảo vệ bằng CRON_SECRET; gắn thông báo vào mọi endpoint đã có (T208, T210, T212, T401–T405) theo danh sách sự kiện FR13 | FR13 | BE | RV, BM | T405 | TODO |
| T502 | GitHub Actions theo lịch gọi endpoint nhắc hạn | FR13, NFR10 | DO | RV | T501 | TODO |
| T503 | API thống kê theo GV/lĩnh vực/trạng thái/kết quả/năm/đợt + CSV cùng bộ lọc; GV chỉ thấy đề tài mình | FR14 | BE | RV, BM, QA | T405 | TODO |
| T504 | UI chuông thông báo, dashboard Recharts, xuất CSV, kho tra cứu công khai | FR08, FR13, FR14 | FE | RV, QA | T501, T503 | TODO |
| T505 | Test: số liệu dashboard khớp CSV; thông báo không trùng | FR13, FR14 | QA | RV | T504 | TODO |

## Giai đoạn 6 – Luồng ngoại lệ và sao lưu

| ID | Việc | FR/NFR | Chủ trì | Review | Phụ thuộc | Trạng thái |
|---|---|---|---|---|---|---|
| T600 | Hợp đồng API GĐ6 (`design/API_GD6.md`) cho FR18–FR23 | FR18–FR23 | KTS | RV, FE, BE | T400 | TODO |
| T601 | Thay giảng viên (chuyển bản nộp chờ, chấm dứt quyền GV cũ) – API (UI ở T607) | FR19 | BE | RV, BM, QA | T600, T405 | TODO |
| T602 | Đề nghị và quyết định hủy | FR20 | BE | RV, QA | T600, T405 | TODO |
| T603 | Rời nhóm + quyền đọc theo khoảng thời gian là thành viên | FR21 | BE | RV, BM | T600, T208 | TODO |
| T604 | Sửa sai kết quả bằng phiên bản mới | FR23 | BE | RV, QA | T600, T404 | TODO |
| T605 | Thay đổi sau duyệt (chạy lại FR06 khi đổi tên/tóm tắt) | FR18 | BE | RV, QA | T600, T212 | TODO |
| T606 | Mở lại mốc đã đạt | FR22 | BE | RV, QA | T600, T404 | TODO |
| T607 | UI cho T601–T606 | FR18–FR23 | FE | RV, QA | T601–T606 | TODO |
| T608 | Sao lưu `pg_dump` hằng ngày (GitHub Actions, giữ 7 bản) + job dọn file mồ côi + hướng dẫn diễn tập khôi phục | FR26 | DO | RV, BM | T202, T203 | TODO |

## Giai đoạn 7 – Hoàn thiện

| ID | Việc | FR/NFR | Chủ trì | Review | Phụ thuộc | Trạng thái |
|---|---|---|---|---|---|---|
| T701 | OpenAPI sinh từ schema Zod + Swagger UI (tắt ở production) | NFR08 | BE | RV, KTS | T607 | TODO |
| T702 | E2E đầy đủ theo vai trò, viewport mobile 360 px và desktop | NFR07 | QA | RV | T607 | TODO |
| T703 | Rà soát bảo mật toàn dự án: 403 theo vai trò cho mọi endpoint nhạy cảm, cookie, CORS, RLS, CSV injection, upload; login tài khoản không tồn tại vẫn chạy verify với hash giả (chống dò tài khoản qua thời gian phản hồi, từ review T199) | NFR01–NFR03 | BM | RV | T607 | TODO |
| T704 | Đo hiệu năng với seed 2.000 đề tài (danh sách ≤1s, thống kê ≤2s, FR06 ≤3s) | NFR04 | QA | RV, BE | T607 | TODO |
| T705 | Bộ thực nghiệm FR06: ≥100 cặp gán nhãn, script báo precision/recall theo ngưỡng | FR06 | QA | RV, KTS | T607 | TODO |
| T706 | Cấu hình deploy: `vercel.json` (rewrite SPA + proxy `/api`), `render.yaml`, hướng dẫn biến môi trường; **không tự deploy** | NFR10 | DO | RV, BM | T607 | TODO |
| T707 | Ma trận truy vết `docs/agents/TRUY_VET.md` FR ↔ test | M1–M5 | KTS | RV | T701–T706 | TODO |
| T708 | Kiểm tra cuối (`/kiem-tra-cuoi`) | Tất cả | RV | BM, QA | T707 | TODO |

## Lỗi phát sinh

| ID | Mô tả | Phát hiện bởi | Chủ trì | Review | Trạng thái |
|---|---|---|---|---|---|
