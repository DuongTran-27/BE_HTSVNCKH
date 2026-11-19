# TASK-DC-12 – Web: trạng thái/action GĐ7, đăng nhập Google, R35 hồ sơ cá nhân (FR28, FR30, NFR07) + m2, m3 BM DC-03

## Thay đổi
**Shared (`packages/shared`)**
- `nextPathSchema` (m3 BM DC-03): một quy tắc `next` cho API (start SSO) và web: chuỗi ≤ 512, bắt đầu `/`, không `//`, không `\`, không ký tự điều khiển (U+0000–U+001F, U+007F). Thay `safeNext` viết tay ở cả hai phía (API giữ hàm `safeNext` nhưng gọi schema; web `lib/nav.js#safeNext` gọi schema).
- `SSO_ERROR_LABEL` thêm `RATE_LIMITED` "Thử đăng nhập quá nhiều lần, vui lòng thử lại sau", `SERVER_ERROR` "Hệ thống đang gặp sự cố, vui lòng thử lại sau" (m2).

**API (m2 BM DC-03)**
- `auth/routes.js`: middleware lỗi riêng cho `/google/callback`. Khi SSO bật và chưa gửi header: 429 của limiter → 302 `${PUBLIC_APP_URL}/dang-nhap?sso_error=RATE_LIMITED`; mọi lỗi khác (DB, lock timeout, lỗi không lường) → 302 `…?sso_error=SERVER_ERROR` + `req.log.error`; luôn xóa cookie `nckh_oauth`. SSO tắt (404 của `ssoOn`) hoặc header đã gửi → `next(err)` cho `errorHandler` chung như cũ. Không cấp phiên khi lỗi (tx đã rollback); limiter vẫn đếm lần đó là thất bại (`ssoOk` không đặt).
- `auth/ssoService.js`: `safeNext` dùng `nextPathSchema` (chặt hơn trước: chặn thêm ký tự điều khiển).

**Web**
- R1 `LoginPage`: `GET /api/auth/providers` (khóa `['auth-providers']`, `staleTime: Infinity`, không retry). `google === true` → liên kết `<a href="/api/auth/google/start?next=…">` "Đăng nhập bằng Google" (logo G, không form, không `window.location`) đặt trên form mật khẩu, ngăn bằng "hoặc"; `next` chỉ gắn khi qua `safeNext`. Lỗi/`false` → không có nút. Đọc `sso_error` → hộp lỗi cấp form theo `SSO_ERROR_LABEL` (mã lạ: "Đăng nhập bằng Google không thành công"), rồi xóa `sso_error` khỏi URL bằng `replace` (giữ `next`).
- `/dang-nhap/google`: `ssoLoader` trong `routes.jsx` – chờ `bootstrapSession()` (refresh lúc khởi động có sẵn), có phiên → `afterLoginPath(user, next)`; không → `/dang-nhap`.
- `lib/nav.js`: `afterLoginPath(user, next)` dùng chung cho đăng nhập mật khẩu và Google (mật khẩu tạm → `/doi-mat-khau`; `next` hợp lệ và vai trò vào được → `next`; còn lại → trang chủ vai trò). Thêm màn `ho-so` cho cả 4 vai trò.
- R35 `/ho-so` (`pages/ProfilePage.jsx`): thẻ chỉ đọc (mã, họ tên, email, vai trò, khoa, lớp – ngành) + "Liên hệ cán bộ khoa nếu thông tin sai."; form `phone` (`profileUpdateSchema` qua `zodResolver`, `type="tel"`, `inputMode="tel"`), "Lưu thay đổi", "Xóa số" (chỉ khi đã có số, gửi `null`). Thành công: cập nhật cache `['profile']`, toast "Cập nhật thành công". Lỗi: chi tiết `VALIDATION_ERROR` gắn vào ô, lỗi khác hộp lỗi; 429 → `useCooldown` khóa nút. Desktop 2 cột (`lg`), dưới `lg` 1 cột.
- Header (`Layout.jsx`): liên kết "Hồ sơ" (biểu tượng; chữ từ `sm`) cạnh "Đổi mật khẩu", mọi vai trò kể cả ADMIN; ẩn khi đang phải đổi mật khẩu.
- R20 (`UserDetailPage.jsx`): thêm dòng "Số điện thoại" chỉ đọc (`phone` đã có ở `GET /api/users/:id` từ DC-02).
- `STATUS_TONE`: `RECRUITING` xanh lá (đang mở), `WAITING_DEFENSE` xanh dương (chờ người khác). Nhãn trạng thái/action mới đã có ở shared (`TOPIC_STATUS_LABEL`, `ACTION_LABEL`, DC-01) và mọi chỗ web đều đọc từ đó (badge danh sách, tổng quan, `ExecShell`, lịch sử/snapshot); `TopicActionBar` bỏ qua action chưa có UI – nút/hộp thoại `PUBLISH_RECRUITMENT`, `UNPUBLISH_RECRUITMENT`, `FINALIZE_GROUP` thuộc DC-13, `REQUEST_DEFENSE`, `RETURN_FROM_DEFENSE` thuộc DC-15 (UI §12.12).

## Màn hình đã làm
| Route | Vai trò | Trạng thái đã xử lý |
|---|---|---|
| `/dang-nhap` (R1 bổ sung) | Khách | providers đang tải/lỗi/tắt → không nút; bật → nút Google; `sso_error` 10 mã + mã lạ; form mật khẩu như cũ |
| `/dang-nhap/google` | Khách vừa SSO | có phiên → `next`/trang chủ/đổi mật khẩu; không phiên → `/dang-nhap`; mất mạng → màn "Không kết nối được máy chủ" có sẵn của app |
| `/ho-so` (R35) | STUDENT, LECTURER, STAFF, ADMIN | đang tải (khung xám), lỗi + "Thử lại", không có lớp/khoa (ẩn dòng lớp, khoa "—"), lỗi tại ô, lỗi server, 429, lưu/xóa số |
| `/quan-ly/tai-khoan/:id` (R20) | ADMIN, STAFF | dòng SĐT chỉ đọc ("—" khi chưa có) |

## File
- `packages/shared/src/schemas.js`, `packages/shared/src/labels.js`, `packages/shared/src/schemas.test.js`
- `apps/api/src/modules/auth/routes.js`, `apps/api/src/modules/auth/ssoService.js`, `apps/api/tests/DC03-sso.test.js`
- `apps/web/src/pages/LoginPage.jsx`, `apps/web/src/pages/ProfilePage.jsx` (mới), `apps/web/src/routes.jsx`, `apps/web/src/lib/nav.js`, `apps/web/src/components/Layout.jsx`, `apps/web/src/components/ui.jsx`, `apps/web/src/pages/admin/UserDetailPage.jsx`
- `apps/web/tests/dc12.test.jsx` (mới, 26 test), `apps/web/tests/auth-pages.test.jsx`, `apps/web/tests/security/T302-next-control-chars.test.jsx`
- `docs/agents/BANG_CONG_VIEC.md` (DC-12 → REVIEW)

## Test
- `apps/web/tests/dc12.test.jsx`: nút Google hiện khi bật (href đúng, không trong form, `next` mã hóa), `next` độc hại không gắn; ẩn khi tắt hoặc providers lỗi 500; `sso_error` từng mã trong `SSO_ERROR_LABEL` → đúng nhãn và `sso_error` bị xóa khỏi URL, giữ `next`; mã lạ → thông điệp chung; `ssoLoader` (next hợp lệ, độc hại, vai trò khác, mật khẩu tạm, không phiên); `afterLoginPath`, `canVisit('/ho-so')` 4 vai trò; R35: tải/hiển thị, số sai → lỗi tại ô và không PATCH, lưu số chuẩn hóa + toast + nút "Xóa số", Xóa số gửi `null`, `VALIDATION_ERROR` gắn ô, 429 khóa nút, lỗi tải + "Thử lại"; badge `RECRUITING`/`WAITING_DEFENSE` đúng nhãn và tông.
- `packages/shared/src/schemas.test.js`: `nextPathSchema` (nhận 3, từ chối 12 ca gồm 512+1 ký tự, mảng, null, ký tự điều khiển).
- `apps/api/tests/DC03-sso.test.js` (m2): lần 21 bị chặn → 302 `sso_error=RATE_LIMITED`, header `ratelimit-remaining: 0`, cookie `nckh_oauth` bị xóa, IP khác không ảnh hưởng; lỗi DB khi cấp phiên (lỗi Prisma lock timeout và lỗi bất kỳ ở bước tìm user) → 302 `sso_error=SERVER_ERROR`, không JSON, không `nckh_rt`, không token; SSO tắt → callback vẫn 404 JSON.
- **Đổi test cũ do đặc tả đổi (quy tắc 1):** ca "21 callback lỗi cùng IP → lần 21 bị 429 RATE_LIMITED" khẳng định body JSON 429 – đúng hành vi mà review m2 BM DC-03 yêu cầu đổi. Ca mới giữ nguyên ý (lần 21 bị chặn, IP khác không bị) nhưng khẳng định 302 `RATE_LIMITED` và `ratelimit-remaining: 0`. Hai test LoginPage cũ chỉ được bọc `QueryClientProvider` (đặt sẵn `['auth-providers'] = { google: false }`) vì R1 giờ dùng TanStack Query; không đổi khẳng định nào.

## Lệnh và kết quả (chạy sau lần sửa cuối)
- `npm run lint` → `eslint . --max-warnings 0`, exit 0, không cảnh báo.
- `DB_TEST_DRIVER=embedded npm run db:test:up` → "Kiểm tra DB test: tất cả OK. DB test đã chạy."; `npm run db:test:reset` → "Đã reset DB test (migrate reset)."
- `npm test` → exit 0: shared 8 file **115/115**; api 84 file **1217/1217**; web 33 file **271/271** (tổng 1603).
- `npm run build -w @nckh/web` → `✓ built` (chỉ cảnh báo chunk > 500 kB có từ trước).
- `npm run test:e2e -w @nckh/web` (embedded-postgres, desktop + mobile) → **74 passed (4.6m)**, exit 0.

## Câu hỏi cho reviewer
- Mã mới `SERVER_ERROR` (thay vì dùng `GOOGLE_ERROR` như gợi ý m2) vì thông điệp `GOOGLE_ERROR` "Không kết nối được với Google" sai khi lỗi là DB. Hai mã mới chưa có trong bảng UI §12.3 / GD7 §8.2 – đề nghị KTS ghi bổ sung.
- Middleware lỗi callback ghi `req.log.error` cho mọi lỗi không phải 429 (kể cả lock timeout 409, vốn errorHandler chung không log error) – chấp nhận vì callback hiếm khi lỗi và cần dấu vết khi người dùng chỉ thấy thông điệp chung.
- `nextPathSchema` ở API chặt hơn `safeNext` cũ (chặn ký tự điều khiển) – không đổi hành vi với `next` hợp lệ.
- Liên kết "Hồ sơ" đặt ở thanh đầu trang (cạnh "Đổi mật khẩu") vì app chưa có menu thả xuống người dùng; UI §12.1 ghi "menu người dùng".
- E2E cho hồ sơ/nút Google thuộc DC-23, chưa viết ở task này.

## Sửa theo review bao-mat v1 (điều phối viên, 2026-11-19)
- m2: `LoginPage.jsx` `ssoMessage` chỉ tra khóa riêng (`Object.hasOwn`) – `sso_error=constructor/toString/__proto__` → thông điệp chung. Test mới trong `dc12.test.jsx`.
- m1: thêm `RATE_LIMITED`, `SERVER_ERROR` vào UI.md §12.3 và API_GD7.md (bảng shared `SSO_ERROR_LABEL`).
- Lệnh: `npm run lint` → exit 0; `npm run db:test:reset` rồi `npm test` → exit 0 (số liệu ở trên).
- Ghi chú: lần chạy `npm test` đầu sau khi sửa có 2 lỗi ở `T201-qa-guard-bypass.test.js` (TC-NFR08-04/05: `CREATE DATABASE nckh_qa_guard` → 23505 "already exists" ngay sau `DROP … WITH (FORCE)`), không liên quan DC-12. Chạy riêng file → 4/4; `db:test:reset` + `npm test` lại → exit 0: shared 115/115, api 1217/1217, web 272/272. Nguyên nhân chưa xác định (nghi embedded-postgres trên Windows) – theo dõi nếu lặp lại.
