# Bảng công việc

Chủ trì: KTS = kien-truc-su · BE = backend-dev · FE = frontend-dev · QA = kiem-thu · RV = reviewer · BM = bao-mat · DO = devops.
Cột **Review**: mọi agent trong cột phải APPROVED. Chỉ điều phối viên sửa cột Trạng thái.
Giai đoạn 1 (nền tảng: auth, state machine, similarity engine, CSV, schema) đã xong – xem `docs/LO_TRINH.md`.

## Giai đoạn 2 – Hạ tầng và API nghiệp vụ

| ID | Việc | FR/NFR | Chủ trì | Review | Phụ thuộc | Trạng thái |
|---|---|---|---|---|---|---|
| T199 | Quyết định nâng `zod` 3 → 4 (lỗ hổng GHSA-mrhx-c7xc-m3w5, mức high) hoặc biện pháp thay thế (giới hạn kích thước body/mảng); ghi `design/QD_ZOD.md` | NFR02 | KTS | RV, BM | – | DONE 2026-11-01 |
| T200 | Hợp đồng API GĐ2 (`docs/agents/design/API_GD2.md`): endpoint, request/response, mã lỗi, quyền từng vai trò | FR02–FR08, FR16, FR17 | KTS | RV, FE, BE | T199 | DONE 2026-11-01 |
| T201 | `docker-compose.test.yml` Postgres 16 + pg_trgm/unaccent; script reset DB cho test; tách DB dev/test | NFR08 | DO | RV, QA | T217 | DOING |
| T216 | Nâng `vitest` (và vite/esbuild/tinypool kéo theo) lên bản không còn lỗ hổng audit (critical/high); 44 test vẫn đạt; `npm audit` sạch | NFR09 | DO | RV, BM | – | DONE 2026-11-01 |
| T217 | Quyết định phương án DB test khi máy không chạy được Docker (WSL lỗi `HCS_E_SERVICE_NOT_AVAILABLE`, CAU_HOI #1): đánh giá devDependency `embedded-postgres` 16.x (Windows x64, không cần admin) – có `pg_trgm`/`unaccent` không, cổng 54329, timezone, chạy trong CI hay chỉ cục bộ, cách chọn Docker/embedded trong `db:test:up`; ghi `design/QD_DB_TEST.md`. Duyệt xong → T201 làm lại theo quyết định | NFR08 | KTS | RV, DO | – | DONE 2026-11-01 |
| T202 | ESLint + Prettier + GitHub Actions chạy lint + test mỗi PR (có service Postgres); `@vitest/coverage-v8`, báo độ phủ module nghiệp vụ trên CI; ma trận Node 22.22 + 24, `engines` `>=22.22.0` ở package.json gốc (react-router 8.4 cần Node ≥22.22 – INFO I2 `reviews/T301-kien-truc-su-v1.md`), `npm ci` giữ optional deps (binding rolldown/lightningcss của vite 8) | NFR09 | DO | RV | T201, T216 | TODO |
| T203 | Migration init + `after_init.sql`; seed dữ liệu mẫu (1 khoa, 3 ngành, lĩnh vực CNTT, 1 đợt, 2 cán bộ, 8 GV, 40 SV, 30 đề tài đủ trạng thái, từ điển đồng nghĩa); §11b `API_GD2.md` (relation, index, partial unique, trigger chỉ-thêm Submission/ReviewDecision/SimilarityCheck); chạy `migrate dev --create-only` ghi kết quả có sinh `DROP INDEX` không; integration test đọc `pg_indexes`/`pg_trigger`; dòng README về `DROP INDEX`; sửa chú thích `SimilarityCheck.matches` theo §7.2 | FR04, FR06 | BE | RV, QA | T201 | TODO |
| T204 | Service lịch sử thao tác (AuditLog) + helper ghi StatusHistory; integration test trigger chỉ-thêm | FR15 | BE | RV, BM | T203 | TODO |
| T205 | Repo Prisma cho auth chạy với DB thật; integration test FR01 trên Postgres; `revokeToken` lần hai cùng id trả `false` và logout bằng token đã xoay thu hồi token mới nhất (MINOR 1 `reviews/BUG-002-reviewer-v1.md`); khe logout‖refresh trên Postgres thật – logout thu hồi họ lần hai hoặc khóa `FOR UPDATE`, có integration test; test logout lặp bằng token của họ đã thu hồi (MINOR 1–2 `reviews/BUG-002-bao-mat-v1.md`) | FR01 | BE | RV, BM | T203 | TODO |
| T215 | Thực hiện `design/QD_ZOD.md`: nâng zod 4 + `express-rate-limit ^8` (một bản cho mọi workspace), bỏ `required_error`, `ENABLE_SWAGGER` dùng `z.stringbool()`, locale `vi`, thêm `.max()` theo §5, `express.json` 100kb, trả 413 `PAYLOAD_TOO_LARGE`; toàn bộ test ở §6 (đổi 5 `it.fails` trong `tests/security/T199-input-size.test.js` thành `it`); limiter dùng chung trả 429 `RATE_LIMITED` qua errorHandler (tiếng Việt) cho `/login` và `/change-password`; MINOR trong `reviews/T199-*-v2.md`; limiter login `skipSuccessfulRequests: true` + test (M1, `reviews/T199-bao-mat-v3.md`); đổi 2 `it.fails` trong `tests/security/T199-rate-limit.test.js`; createLimiter tách nhánh IP (`ipv6Subnet`) và theo người dùng (`keyGenerator`) – MINOR 1 `reviews/T199-reviewer-v3.md` | NFR02 | BE | RV, BM | T199 | DONE 2026-11-01 |
| T206 | API danh mục + đợt (CRUD, ngừng dùng thay vì xóa, kiểm tra thứ tự mốc); `requirePasswordChanged` gắn ở app.js, `staffFacultyIds` trong `{ user }`, `conflict()` có details, P2002/P2025 và lỗi tranh chấp khóa (P2010+`meta.code` 55P03, P2034, dự phòng theo message) → 409 `CONCURRENT_UPDATE`; P2028 → 503 `SERVICE_BUSY` kèm `logger.warn` và thêm dòng vào bảng mã lỗi §2 `API_GD2.md` (MINOR 1 `reviews/T200-reviewer-v3.md`); unit test bằng lỗi giả từng dạng, nhãn enum ở shared (§11 `API_GD2.md`) | FR04 | BE | RV, FE | T200, T204, T215 | TODO |
| T207a | API tài khoản (§3.2 `API_GD2.md` trừ nhập CSV): tạo, khóa/mở, reset (mật khẩu tạm theo QD_ZOD §4.4 N7), `staff-scopes`, `GET /api/users/:id`, limiter tạo/reset; phạm vi khoa của cán bộ | FR02, FR25 | BE | RV, BM | T205, T206 | TODO |
| T207b | Nhập CSV tài khoản: preview/confirm, lỗi theo dòng, `importLock` (kiểm và đặt cờ đồng bộ, test đồng thời bằng hasher giả), hằng `USER_IMPORT_*`, chuyển `csv.js` sang shared – QD_ZOD §4.4 | FR02 | BE | RV, BM | T207a | TODO |
| T208 | API nhóm + lời mời + trưởng nhóm; giới hạn min–max; kiểm sớm số đề tài hoạt động/sinh viên khi chấp nhận lời mời (kiểm chính thức ở T210, §5.5 `API_GD2.md`); helper `withLockTx` (`$queryRaw` `set_config(lock_timeout)` câu đầu, tx timeout 15s; integration test `current_setting` trong/ngoài tx); khóa Topic mức NO KEY UPDATE; accept/decline/cancel lời mời cập nhật có điều kiện `status: PENDING` (§11c) | FR03 | BE | RV, QA | T209 | TODO |
| T209 | API hồ sơ đề tài: nháp, sửa theo trạng thái, kiểm tra trường bắt buộc, sinh mã bằng sequence; schema nháp/gửi dùng chung hằng `fieldId`, `SUMMARY_MAX` (MINOR `reviews/T215-reviewer-v1.md`); thêm `permissions.viewHistory` vào `TopicDetail` (đề xuất T300) | FR05 | BE | RV, QA | T206 | TODO |
| T210 | API đề nghị hướng dẫn: gửi, nhận/từ chối, rút; hạn mức GV kiểm tra trong transaction; `applyTransition` chạy qua `withLockTx` + integration test DB thật hai tx cùng khóa Topic → 409 (§11c); thứ tự mặc định `advisor-requests` `createdAt ASC, id ASC` (đề xuất T300) | FR16 | BE | RV, QA | T208 | TODO |
| T211 | Endpoint kiểm tra tương tự qua DB (pg_trgm) + lưu SimilarityCheck + ẩn hồ sơ chờ với SV; lưu `matches` dạng đầy đủ + trạng thái lúc kiểm + `matchedKeywords`, `presentMatches(matches, viewerRole)` ẩn với mọi vai trò trừ STAFF; `GET similarity-checks/latest` + `isStale` | FR06 | BE | RV, BM, QA | T209 | TODO |
| T212a | Gửi xét duyệt / gửi lại (SUBMIT/RESUBMIT, `skipSimilarity`, kiểm quyền xem 403 trước `checkTransition`) + snapshot bất biến + quyết định duyệt/sửa/từ chối + `STALE_SUBMISSION` | FR07, FR17 | BE | RV, QA | T210, T211 | TODO |
| T212b | Đọc snapshot: `submissions`, `submissions/:seq`, `submission-diff` (so sánh 2 snapshot), `status-history` | FR17 | BE | RV, QA | T212a | TODO |
| T213 | API tra cứu danh sách: lọc, phân trang server, phạm vi theo vai trò | FR08 | BE | RV, BM, FE | T212a | TODO |
| T214 | Test integration độc lập cho luồng GĐ2 (viết từ đặc tả, không đọc code service); gồm test rollback transaction khi lỗi giữa chừng (NFR05) và hạn tính theo giờ server bất kể giờ máy khách (NFR06); ca đồng thời cancel ‖ accept lời mời | FR02–FR08, FR16, FR17 | QA | RV | T207b, T212b, T213 | TODO |

## Giai đoạn 3 – Frontend lõi

| ID | Việc | FR/NFR | Chủ trì | Review | Phụ thuộc | Trạng thái |
|---|---|---|---|---|---|---|
| T300 | Thiết kế màn hình theo vai trò (`design/UI.md`): sitemap, route, quyền, trạng thái rỗng/lỗi/tải | M1–M5 | KTS | RV, FE | T200 | DONE 2026-11-01 |
| T301 | Khung `apps/web`: Vite (vite 8 đã có trong repo từ T216 – chọn `@vitejs/plugin-react` tương thích), Router, Tailwind, TanStack Query, API client tự refresh, xóa cache khi logout, proxy `/api` khi dev; API client chỉ dùng đường dẫn tương đối `/api` (cùng origin – cookie refresh `SameSite=Lax`, NFR01), không gọi thẳng domain Render; proxy Vite `/api` dựng ngay từ đầu (§1.1 `API_GD2.md`); data router (`createBrowserRouter`), module auth, `applyServerErrors`, `useCooldown`, `Toast`, `FormField` (§9.1 `design/UI.md`); API client gặp 403 `PASSWORD_CHANGE_REQUIRED` thì đặt `mustChangePassword = true` trong module auth; cài `@hookform/resolvers` (kèm RHF + Zod) | NFR01, NFR07 | FE | RV, BM | T300 | DOING |
| T302 | Đăng nhập, đổi mật khẩu, bắt đổi mật khẩu lần đầu: trang R2 và chuyển hướng ngay sau đăng nhập | FR01 | FE | RV, BM | T301, T205 | TODO |
| T303 | Layout theo vai trò, route guard, trang 403/404; `RequireAuth` chặn mọi route khác khi `mustChangePassword` (§1.2 `design/UI.md`) | FR25 | FE | RV, BM | T302 | TODO |
| T304 | Màn quản trị: danh mục, đợt (form cấu hình tham số), tài khoản + nhập CSV | FR02, FR04 | FE | RV, QA | T303, T207b | TODO |
| T305 | Màn sinh viên: nhóm + lời mời, soạn hồ sơ, "Kiểm tra trước", cảnh báo vàng/đỏ, giải trình, gửi; form R7 chỉ nạp giá trị ban đầu một lần, khi tải lại chỉ cập nhật `version` (không ghi đè ô đang nhập); mutation gửi/gửi lại dùng `onSettled` invalidate `topic`, `similarity-latest`, `topics`, `submissions` (MINOR 1 `reviews/T300-reviewer-v2.md`) | FR03, FR05, FR06 | FE | RV, QA | T303, T212a, T306 | TODO |
| T306 | Màn giảng viên: đề nghị hướng dẫn chờ xử lý, nhận/từ chối; khung chi tiết đề tài R6 + `TopicActionBar`, R15 cả phía cán bộ (§9.1 `design/UI.md`); R15 cán bộ lọc theo đợt gọi `GET /api/rounds` | FR16 | FE | RV, QA | T303, T210 | TODO |
| T307 | Màn cán bộ: hàng chờ xét duyệt, xem snapshot + kết quả FR06 + giải trình, so sánh 2 lần gửi, quyết định | FR07, FR17 | FE | RV, QA | T303, T212b, T213, T305 | TODO |
| T308 | Màn danh sách/tra cứu có bộ lọc, phân trang; R4 (trang chủ SV gồm nút tạo đề tài, banner lời mời) và R25 (§9.1 `design/UI.md`) | FR08 | FE | RV, QA | T303, T213 | TODO |
| T309 | E2E Playwright GĐ3: SV tạo nhóm → mời GV → GV nhận → SV gửi (có trùng cao) → cán bộ duyệt | M1, M5 | QA | RV | T305–T308 | TODO |

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
| T501 | Thông báo trong web (đã đọc, chống trùng theo dedupeKey) + endpoint nhắc hạn bảo vệ bằng CRON_SECRET; gắn thông báo vào mọi endpoint đã có (T208, T210, T212a, T401–T405) theo danh sách sự kiện FR13 | FR13 | BE | RV, BM | T405 | TODO |
| T502 | GitHub Actions theo lịch gọi endpoint nhắc hạn | FR13, NFR10 | DO | RV | T501 | TODO |
| T503 | API thống kê theo GV/lĩnh vực/trạng thái/kết quả/năm/đợt + CSV cùng bộ lọc; GV chỉ thấy đề tài mình | FR14 | BE | RV, BM, QA | T405 | TODO |
| T504 | UI chuông thông báo, dashboard Recharts, xuất CSV (kho tra cứu đã làm ở T308; G3: cần đăng nhập); tiện ích dashboard "đề tài kẹt sau khi đóng đăng ký" (FR16.5) | FR08, FR13, FR14 | FE | RV, QA | T501, T503 | TODO |
| T505 | Test: số liệu dashboard khớp CSV; thông báo không trùng | FR13, FR14 | QA | RV | T504 | TODO |

## Giai đoạn 6 – Luồng ngoại lệ và sao lưu

| ID | Việc | FR/NFR | Chủ trì | Review | Phụ thuộc | Trạng thái |
|---|---|---|---|---|---|---|
| T600 | Hợp đồng API GĐ6 (`design/API_GD6.md`) cho FR18–FR23 + G5 `API_GD2.md` (cán bộ cho phép gửi với cờ "chưa kiểm tra" khi FR06 lỗi) – theo ràng buộc §14 `API_GD2.md`: cờ suy ra, không thêm cột sửa được; thêm `latestSimilarityStatus` vào item danh sách và xử lý đề tài kẹt khi tăng tham số đợt (INFO 12 `reviews/T300-reviewer-v1.md`) | FR18–FR23 | KTS | RV, FE, BE | T400 | TODO |
| T601 | Thay giảng viên (chuyển bản nộp chờ, chấm dứt quyền GV cũ) – API (UI ở T607) | FR19 | BE | RV, BM, QA | T600, T405 | TODO |
| T602 | Đề nghị và quyết định hủy | FR20 | BE | RV, QA | T600, T405 | TODO |
| T603 | Rời nhóm + quyền đọc theo khoảng thời gian là thành viên | FR21 | BE | RV, BM | T600, T208 | TODO |
| T604 | Sửa sai kết quả bằng phiên bản mới | FR23 | BE | RV, QA | T600, T404 | TODO |
| T605 | Thay đổi sau duyệt (chạy lại FR06 khi đổi tên/tóm tắt) | FR18 | BE | RV, QA | T600, T212a | TODO |
| T606 | Mở lại mốc đã đạt | FR22 | BE | RV, QA | T600, T404 | TODO |
| T607 | UI cho T601–T606 | FR18–FR23 | FE | RV, QA | T601–T606 | TODO |
| T608 | Sao lưu `pg_dump` hằng ngày (GitHub Actions, giữ 7 bản) + job dọn file mồ côi + hướng dẫn diễn tập khôi phục | FR26 | DO | RV, BM | T202, T203 | TODO |
| T609 | Hiện thực G5: cho phép gửi khi FR06 lỗi với cờ "chưa kiểm tra", endpoint cán bộ cho phép kèm lý do, job chạy lại FR06, nới trigger `submission_immutable` chỉ cho cột `similarityCheckId` | FR06, FR07 | BE | RV, BM, QA | T600, T212a | TODO |

## Giai đoạn 7 – Hoàn thiện

| ID | Việc | FR/NFR | Chủ trì | Review | Phụ thuộc | Trạng thái |
|---|---|---|---|---|---|---|
| T701 | OpenAPI sinh từ schema Zod + Swagger UI (tắt ở production) | NFR08 | BE | RV, KTS | T607 | TODO |
| T702 | E2E đầy đủ theo vai trò, viewport mobile 360 px và desktop | NFR07 | QA | RV | T607 | TODO |
| T703 | Rà soát bảo mật toàn dự án: 403 theo vai trò cho mọi endpoint nhạy cảm, cookie, CORS, RLS, CSV injection, upload; login tài khoản không tồn tại vẫn chạy verify với hash giả (chống dò tài khoản qua thời gian phản hồi, từ review T199); đo số hop proxy thật trước khi đổi `trust proxy`, chặn gọi thẳng `*.onrender.com`; kiểm định dạng `x-request-id` do client gửi (review T215-bao-mat) | NFR01–NFR03 | BM | RV | T607 | TODO |
| T704 | Đo hiệu năng với seed 2.000 đề tài (danh sách ≤1s, thống kê ≤2s, FR06 ≤3s) | NFR04 | QA | RV, BE | T607 | TODO |
| T705 | Bộ thực nghiệm FR06: ≥100 cặp gán nhãn, script báo precision/recall theo ngưỡng | FR06 | QA | RV, KTS | T607 | TODO |
| T706 | Cấu hình deploy: `vercel.json` (rewrite SPA + proxy `/api`), `render.yaml`, hướng dẫn biến môi trường; chỉnh `trust proxy` theo số hop thật qua Vercel rewrite (review T200-frontend-dev-v3); CSP + header bảo mật (`X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors`) cho trang tĩnh trong `vercel.json` (INFO 4 `reviews/T301-bao-mat-v1.md`); build Vercel/Render dùng Node ≥22.22 (khuyến nghị 24.x); **không tự deploy** | NFR10 | DO | RV, BM | T607 | TODO |
| T707 | Ma trận truy vết `docs/agents/TRUY_VET.md` FR ↔ test | M1–M5 | KTS | RV | T701–T706 | TODO |
| T708 | Kiểm tra cuối (`/kiem-tra-cuoi`) | Tất cả | RV | BM, QA | T707 | TODO |

## Lỗi phát sinh

| ID | Mô tả | Phát hiện bởi | Chủ trì | Review | Trạng thái |
|---|---|---|---|---|---|
| BUG-001 | `errorHandler` trả 500 INTERNAL + `logger.error` cho lỗi 4xx khác của body-parser (content-encoding lạ, gzip hỏng): phải trả `err.status` với thông điệp tiếng Việt cố định khi `err.expose && err.status < 500`; đổi 2 `it.fails` trong `tests/security/T215-bao-mat.test.js` thành `it` | bao-mat (review T215) | BE | RV, BM | DONE 2026-11-01 |
| BUG-002 | Logout bằng refresh token đã xoay vòng (`revokedAt` khác null) không thu hồi cả họ phiên (`apps/api/src/modules/auth/service.js:67-71`): khi refresh và logout chạy đồng thời, cookie mới vẫn dùng được sau đăng xuất. Logout phải thu hồi toàn bộ họ token kể cả khi token gửi lên đã bị xoay; có test | bao-mat (review T301) | BE | RV, BM | DONE 2026-11-01 |
