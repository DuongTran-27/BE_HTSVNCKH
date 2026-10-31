# Review T215 – reviewer – vòng 1
Kết luận: APPROVED

## Tôi đã tự kiểm tra
Lệnh tự chạy lại (2026-11-01, máy Windows, sau `npm ci`):

| Lệnh | Kết quả | Khớp báo cáo? |
|---|---|---|
| `npm ci` | thành công, `found 0 vulnerabilities` | — |
| `npm ls zod express-rate-limit` | `express-rate-limit@8.7.2`, `zod@4.6.7` ở api; `zod@4.6.7 deduped` ở shared | Khớp |
| `npm audit` | `found 0 vulnerabilities` (GHSA-mrhx-c7xc-m3w5 đã hết) | Khớp |
| `npm test` (lần 1) | shared: 2 file, 21/21 đạt; api: 7 file, 67/67 đạt; exit 0 | Khớp (88/88) |
| `npm test` (lần 2) | exit 0 | Không chập chờn |
| `npm test 2>&1 \| grep ERR_ERL` | không có dòng nào | Khớp MINOR 1 RV-v3 |
| `grep -rnE "\.(skip\|only\|fails\|todo)\(" apps/api/src apps/api/tests packages/shared/src` | không còn | Khớp |
| `grep -rn "required_error\|invalid_type_error\|errorMap"` trong `src` | không còn | Khớp |
| `grep -rn "rateLimit(\|express-rate-limit" apps/api/src` | chỉ `middlewares/rateLimit.js:1,10` | Khớp (cấm gọi trực tiếp) |
| `npm run lint` | không chạy (chưa có ESLint – việc của T202) | Ghi nhận, không tính cho T215 |

So sánh test bảo mật với commit gốc: `git diff 92ae897 -- apps/api/tests/security`. Hai file chỉ đổi 5 + 2 dòng `it.fails(` → `it(`. Có thêm đúng 1 assertion `expect(r.text.length).toBeLessThan(1024)` (`T199-input-size.test.js:48`), theo yêu cầu §6. Không assertion nào bị xóa hay nới. Không làm yếu test.

File đã đọc: `CLAUDE.md`, `docs/agents/QUY_TRINH.md` (mẫu review), `docs/agents/reports/T215.md`, `docs/agents/design/QD_ZOD.md` (toàn bộ, nhất là §2, §4.2, §4.5, §4.6, §5, §6, §7), `reviews/T199-{reviewer,bao-mat}-v2.md`, `reviews/T199-{reviewer,bao-mat}-v3.md` (các MINOR giao cho T215), dòng T215 trong `BANG_CONG_VIEC.md`. Đã đọc `git diff` của: `packages/shared/src/schemas.js`, `packages/shared/package.json`, `apps/api/package.json`, `apps/api/.env.example`, `apps/api/src/{app.js,config/env.js,middlewares/errorHandler.js,middlewares/validate.js,modules/auth/routes.js}`. Đã đọc file mới: `apps/api/src/middlewares/rateLimit.js`, `apps/api/tests/security/T215.test.js`, `packages/shared/src/schemas.test.js`. Đã đọc thêm `apps/api/src/lib/errors.js`.

Phạm vi: phần diff thuộc T215 chỉ nằm trong các file nêu trên. Lượt chạy này không xét `package.json` gốc (script `db:test:*`), `.gitignore`, `README.md`, `docker*`, `apps/api/{.env.test,scripts/,vitest.config.js}`, `docs/VAN_HANH.md` vì thuộc T201. Ở `BANG_CONG_VIEC.md`, T215 chỉ chuyển trạng thái sang REVIEW. Không thấy thay đổi ngoài phạm vi.

## Đối chiếu đặc tả (QD_ZOD §6, NFR02)
| Điều kiện đạt | Đạt? | Ghi chú |
|---|---|---|
| 1. zod `^4.6.7` ở shared + api, một bản; express-rate-limit `^8` | Đạt | `npm ls`: một bản 4.6.7 deduped, 8.7.2 |
| GHSA-mrhx-c7xc-m3w5 hết | Đạt | `npm audit` 0. `schemas.test.js:15` (spy 0 lần với 10.000 phần tử) chặn việc quay lại bản cũ |
| 2. `required_error` → `error`; thiếu `fieldId` → "Chọn lĩnh vực" | Đạt | `schemas.js:35`; `schemas.test.js:44` assert đúng 1 issue, path và thông điệp |
| 3. `ENABLE_SWAGGER` `z.stringbool().default(false)` + ghi chú `.env.example` | Đạt | `env.js:11`, `.env.example:12`. Test: `T199-input-size` (đổi từ fails) và `T215.test.js:66-74` (`false/true/FALSE/1/0`, bỏ dòng → false, `'abc'` và `''` → ném lỗi có chữ `ENABLE_SWAGGER`) |
| 4. `z.config(z.locales.vi())` ở đầu `schemas.js` | Đạt | `schemas.js:5`. `schemas.test.js:76` so khớp nguyên văn thông điệp tiếng Việt |
| 5. `.max()` theo bảng §5 (8 trường) | Đạt | identifier 300, password/currentPassword/newPassword 128 (newPassword `.min(8).max(128)` trước regex), objectives 3000, keyword 60, fieldId 64 ở cả nháp và gửi. `schemas.test.js:56-74` kiểm cả 8 trường và giá trị biên |
| `summary` `.max(5000, { error, abort: true })` trước refine; 5001 ký tự → đúng 1 issue | Đạt | `schemas.js:30-31`; `schemas.test.js:32`. Bỏ `abort` thì refine sinh issue thứ 2 và test đỏ, nên test có giá trị thật. Test `:39` chứng minh refine vẫn hoạt động |
| keywords 5.000 × `"a"` → 400 `VALIDATION_ERROR` | Đạt | `T215.test.js:45` (nháp + gửi, response < 1 KB); `schemas.test.js:22` (đúng 1 issue) |
| 6. `express.json` 100kb | Đạt | `app.js:24`. Hai test: 200kb bị chặn, 90kb vẫn 200 (`T215.test.js:40`) |
| 7. `entity.too.large` → 413 `PAYLOAD_TOO_LARGE` tiếng Việt, không log error | Đạt | `errorHandler.js:11-13`, đứng trước `logger.error`. `T215.test.js:31` spy `logger.error` không bị gọi và so khớp toàn bộ `body.error` |
| Mật khẩu > 128 → 400; mảng 45.000 phần tử ≤ 2 khóa và < 1024 B | Đạt | `T199-input-size` (đổi từ fails, thêm điều kiện 1024) |
| 8. `validate.js` `.slice(0, 50)` | Đạt | `validate.js:7`; `T215.test.js:55` (80 issue → đúng 50 khóa, có `f0`, không có `f50`) |
| 9. Factory `createLimiter`, 429 `RATE_LIMITED` tiếng Việt qua errorHandler | Đạt | `rateLimit.js:17` gọi `next(AppError)`. `T199-rate-limit` (đổi từ fails) và `T215.test.js:81` so khớp code và message |
| Login: IP, `ipv6Subnet: 56` | Đạt | `rateLimit.js:16`. IPv6 rải trên nhiều /64 trong cùng /56 vẫn 429 (`T215.test.js:99`); khác /56 thì bucket riêng (`:110`); test /64 của BM xanh |
| Login `skipSuccessfulRequests: true` (M1 BM-v3) | Đạt | `routes.js:19`. `T215.test.js:89`: 25 lần đúng không bị 429, sau đó lần sai vẫn bị đếm đến 429 |
| `/change-password` 5/15 phút theo `req.user.id`, thứ tự `requireAuth` → limiter → `validate` | Đạt | `routes.js:20,46`. `T215.test.js:116`: lần 6 → 429, người dùng khác vẫn 400 (chứng minh khóa theo user). `:129`: chưa đăng nhập luôn 401. Nếu đảo thứ tự, `req.user.id` sẽ ném lỗi ra 500 và test đỏ |
| MINOR 1 RV-v3: tách nhánh ip/user, không `ERR_ERL_` | Đạt | Hai nhánh loại trừ nhau ở `rateLimit.js:16`, `keyBy` lạ thì ném lỗi. `T215.test.js:136` bắt `console.error/warn`; `npm test` không in `ERR_ERL` |
| MINOR RV-v2 #1, #3; BM-v2 N2, N3 | Đạt | Factory + handler; `.env.example` + test `''`; 429 chuẩn; IPv6. RV-v2 #2 (multer) thuộc T403 |
| `// shortcut:` cho store trong bộ nhớ (§7) | Đạt | `rateLimit.js:7` |
| §5.9a regex tuyến tính | Đạt | `/[A-Za-z]/`, `/\d/`, `/\s+/`: không lồng lượng từ, không backreference |
| Quy tắc 7 (tiếng Việt) | Đạt | 413, 429, thông điệp schema, locale mặc định đều tiếng Việt. `env.js` có thể ra tiếng Anh nhưng QD §2 chấp nhận (log khởi động) |

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| 1 | MINOR | `packages/shared/src/schemas.js:14,21,35` ; `reports/T215.md:7` | §5.8 yêu cầu trường dùng chung giữa nháp và gửi lấy từ cùng một hằng. `fieldId` của bản gửi viết lại `z.string({ error: 'Chọn lĩnh vực' }).min(1, …).max(64)`, không dùng biến `fieldId` (dòng 14). `summary` cũng ghi số 5000 ở hai chỗ (dòng 21 và 30). Báo cáo lại ghi `fieldId` đã dùng chung, không đúng code. Hiện chưa sai giá trị, nhưng mức `.max()` có thể lệch nhau khi một bên bị sửa | Khai báo `const fieldId = z.string({ error: 'Chọn lĩnh vực' }).max(64)` và dùng cho cả hai (bản gửi: `fieldId.min(1, 'Chọn lĩnh vực')`). Đặt hằng `SUMMARY_MAX = 5000` cho cả hai chỗ `summary`. Sửa câu tương ứng trong báo cáo. Có thể làm ở T206/T209 khi động vào schema đề tài |
| 2 | NIT | `apps/api/tests/security/T199-input-size.test.js:13,22,29,38,49` ; `T199-rate-limit.test.js:14-16,26-28` | Tên test vẫn có "(hiện đang 500 INTERNAL)", chú thích vẫn ghi "T215 phải đổi it.fails → it". Nay đã sai sự thật. BE giữ nguyên vì đây là test của BM, như vậy là đúng | BM tự dọn khi review T215 (trả lời câu hỏi trong báo cáo): bỏ cụm "(hiện đang 500 INTERNAL)", đổi chú thích thành "kiểm chứng GHSA/QD_ZOD §…". Chỉ đổi chữ, không đổi assertion |
| 3 | NIT | `packages/shared/src/schemas.test.js:78` | Thông điệp mặc định của locale `vi` lẫn tên kiểu tiếng Anh ("mong đợi string, nhận được số"). Đây là bản dịch của zod, chấp nhận được theo QD §2. Các trường mà người dùng thấy đều đã có thông điệp tự viết | Không cần sửa. FE (T301+) ưu tiên thông điệp tự viết cho trường hiển thị trên form |

Không có BLOCKER/MAJOR. Mọi lệnh tôi tự chạy đều khớp bằng chứng trong báo cáo. Việc đổi 7 `it.fails` → `it` không làm yếu assertion nào, còn thêm điều kiện 1024 B. Mỗi điều kiện ở §6 đều có test thật, và tôi đã kiểm bằng suy luận rằng các test then chốt (abort, slice 50, thứ tự `requireAuth` → limiter, khóa theo user) sẽ đỏ nếu bỏ phần code tương ứng. `npm run lint` chưa chạy được do thiếu ESLint (T202), không tính cho task này.

Kết luận: APPROVED – T215 đạt toàn bộ QD_ZOD §6 (zod 4.6.7 một bản, express-rate-limit 8.7.2, audit 0, 88/88 test xanh hai lần, 7 `it.fails` → `it` không nới assertion). Còn 1 MINOR (§5.8 hằng dùng chung cho `fieldId`/`summary`) và 2 NIT, không chặn task.
