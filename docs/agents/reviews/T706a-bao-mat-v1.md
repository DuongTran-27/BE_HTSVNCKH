# Review T706a (bước A) – bảo mật – v1
- Reviewer: bao-mat · Ngày: 2026-11-08 · Phạm vi: thay đổi chưa commit (vercel.json, middleware.js + test, .env.example x2, render.yaml, migrate/reminders/similarity-recheck.yml, .nvmrc, eslint.config.js, VAN_HANH §3–§6)
- **Kết luận: CHANGES_REQUESTED** (1 MAJOR, chỉ sửa tài liệu checklist; còn lại MINOR)

## Bằng chứng tự chạy
```
$ npm run lint                          → eslint . --max-warnings 0 (không lỗi)
$ npm run build -w @nckh/web            → ✓ built in 289ms
$ npm test
  shared: Test Files 7 passed, Tests 73 passed
  api:    KHÔNG CHẠY ĐƯỢC – Docker Desktop không khởi động trên máy review ("Không kết nối được DB test ... localhost:54329")
  web:    Test Files 27 passed, Tests 227 passed (gồm 7 ca middleware)
$ cd apps/web && npx vitest run tests/middleware.test.js → 7 passed
$ git status --porcelain apps/api packages → chỉ " M apps/api/.env.example" (dòng chú thích)
$ dist/index.html: chỉ <script type=module src=/assets/...> + <link stylesheet>, không có script/style inline
$ grep dist/assets/*.js: createElement("style") | insertRule | new Function | eval( → 0 ở mọi chunk;
  setAttribute("style") → 0; cssText → 0. Recharts nằm ở StatsPage-*.js, cũng 0.
```
Suite API không chạy được ở đây; bước A không đổi mã API (chỉ `.env.example`), nên kết quả 932 ca trong báo cáo vẫn dùng được. Bước B (đổi `app.js`/`env.js`) **bắt buộc** chạy lại cả suite API.

## 1. middleware.js tự dựng `x-middleware-*`
- Đúng hợp đồng đã yêu cầu. Bỏ `x-nckh-origin` do client gửi (DROP, chỉ còn một mục trong override, có test). Bỏ `host` và các header hop-by-hop. Đích luôn là `API_ORIGIN` (regex `^https://[^/]+$`) cộng với `pathname`, mà matcher buộc `pathname` bắt đầu bằng `/api`, nên client không đổi được host đích. Thiếu hoặc sai cấu hình thì trả 503 JSON và không có header rewrite. Không có `console.*`, và secret không xuất hiện trong thân 503.
- Khi giao thức sai, middleware **đóng lại** về phía API: header không tới được thì API (sau bước B) trả 404, không mở thêm đường vào nào. Còn một trường hợp mở: Vercel không nhận ra `x-middleware-rewrite` và trả nguyên `Response(null, {headers})` cho trình duyệt. Khi đó **secret lộ ra client** qua `x-middleware-request-x-nckh-origin`. Thư viện `@vercel/functions` tạo đúng bộ header này nên cũng gặp đúng rủi ro đó. Khác biệt duy nhất: thư viện là API có tài liệu, Vercel giữ tương thích cho nó.
- **Quyết định:** giữ bản tự dựng ở bước A, không bắt buộc thêm thư viện. **Khuyến nghị kien-truc-su duyệt trước** `@vercel/functions` (dependency của `apps/web`, chỉ middleware dùng) làm phương án dự phòng sẵn, để khi checklist mục 1 thất bại thì đổi được ngay. Nếu kien-truc-su muốn giảm phụ thuộc vào giao thức không công khai thì chuyển sang thư viện luôn cũng được, bảo mật không phản đối.

### MAJOR 1 – checklist chưa kiểm lộ secret ra client
VAN_HANH §6.4 mục 1 chỉ kiểm "200 JSON của API". Cần thêm hai bước:
- `curl -sI https://<app>.vercel.app/api/health | grep -i '^x-middleware'` phải **rỗng**. Kiểm thêm một request có cookie hoặc đăng nhập.
- Nếu thấy bất kỳ header `x-middleware-*` nào: **xoay `ORIGIN_SECRET` ngay** ở cả Vercel và Render, rồi báo devops.

Phải xong trước khi đóng T706. Đây là sửa tài liệu, không cần đổi code.

### MINOR 1.a
Nên bỏ mọi header client gửi có tiền tố `x-middleware-`, thay vì chỉ bỏ các tên trong DROP: `if (DROP.has(name) || name.startsWith('x-middleware-')) continue;`. Thêm một ca test. Vercel nhiều khả năng đã lọc các header này ở biên, nên đây chỉ là phòng thủ thêm một lớp.

## 2. CSP và header tĩnh
- Không chặn tính năng nào:
  - React và Recharts gán style qua CSSOM, và bundle không có `<style>`, `insertRule`, `eval` hay `setAttribute('style')`.
  - Tải tài liệu dùng `location.assign(<URL ký>)`, là điều hướng nên CSP không áp.
  - Xuất CSV dùng `blob:` + `a.download`. Đây là tải xuống, `img-src`/`connect-src` không áp.
  - Upload đi qua `/api` cùng origin.
  - Không có font hay ảnh ngoài.
- `source` `/((?!api/).*)` khớp cả `/`. `/api` (không có `/`) do middleware bắt trước, nên không rơi về `index.html`. Header của trang tĩnh không chồng lên CSP của helmet ở API.
- `frame-ancestors 'none'` + `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: same-origin`, `Permissions-Policy` đều đạt yêu cầu INFO 4 của T301. Trang cần đăng nhập vẫn phải kiểm trên Console (checklist mục 8). Đạt.

## 3. render.yaml và migrate.yml
- `render.yaml` không chứa giá trị bí mật nào: các biến bí mật để `sync: false`, riêng `JWT_ACCESS_SECRET` dùng `generateValue`. Migrate không chạy trên Render. Không có `DIRECT_URL`. Build có `--include=dev` + `prisma generate`. Health là `/api/health`, `autoDeploy: false`. Đạt.
- Prisma schema có `directUrl = env("DIRECT_URL")`. Báo cáo đã có bằng chứng client chạy được khi thiếu biến này. Checklist §6.2 bước 3 (`db:true`) sẽ xác nhận lại trên Render.
- `migrate.yml`:
  - Chỉ có `workflow_dispatch`, `permissions: contents: read`, `persist-credentials: false`.
  - Secret chỉ nằm trong env của bước migrate, **sau** `npm ci`, nên script cài đặt của dependency không thấy được.
  - Không echo. `test -n` không in giá trị.
  - Lỗi Prisma (P1001…) chỉ in host:port, không in mật khẩu. GitHub cũng mask secret.
  - Có `environment: production`. Đạt.

### MINOR 3.a
§6.2 bước 2 nên ghi rõ:
- Tạo `MIGRATE_DATABASE_URL` là **environment secret** của `production`, không phải repository secret.
- Đặt environment `production` với "Deployment branches" = chỉ nhánh chính (cân nhắc thêm Required reviewers).

Nếu không làm vậy, ai có quyền ghi repo cũng chạy được `workflow_dispatch` trên một nhánh tùy ý, tức là chạy migration chưa review lên DB production bằng role `postgres`.

## 4. Cron
`|| { rc=$?; cat response.json; exit "$rc"; }` chỉ in thân phản hồi của server: JSON lỗi API, hoặc 503 của middleware. Cả hai không chứa secret. `-w` chỉ in mã HTTP. Header truyền qua stdin (`-K -`). Dòng lỗi của curl (`--show-error`) không in URL hay header. Bỏ `--retry-all-errors` là hợp lý: lỗi 401/404 dừng ngay. Đạt, đóng MINOR 1–2 của T502.

## 5. Hợp đồng bước B – CHỐT
- `ORIGIN_SECRET` **bắt buộc ở production**:
  - Kiểu `z.string().min(32).optional()` + `refine`: `NODE_ENV === 'production'` mà thiếu thì server **không khởi động**, giống `CLOUDINARY_URL`.
  - Lý do: nếu thiếu mà chỉ cảnh báo thì đường gọi thẳng Render mở lại một cách âm thầm. MAJOR T703c (bỏ qua giới hạn theo IP qua `X-Forwarded-For` giả) sẽ quay lại mà không ai thấy.
  - Dev và test giữ optional, bỏ qua kiểm.
- Các điểm còn lại giữ như báo cáo T706a:
  - Đặt trước mọi router, nên đặt ngay sau `app.disable`.
  - So bằng `timingSafeEqual`. Khác độ dài thì trả 404, không ném lỗi.
  - Thân 404 giống hệt 404 chuẩn.
  - Chỉ miễn `GET /api/health`, so **khớp chính xác** path. Không miễn cron.
  - Thêm `req.headers["x-nckh-origin"]` vào `LOG_REDACT`.
- Test bước B bổ sung:
  - (a) Production thiếu `ORIGIN_SECRET` thì `env.js` ném lỗi.
  - (b) Log (destination giả) không chứa giá trị header.
  - (c) `/api/health/x` và `POST /api/health` không có header thì trả 404.
- Checklist §6.4 mục 1–9 đủ để đóng MAJOR T703c mục 3 **sau khi** bổ sung MAJOR 1 ở trên. Mục 3 (đo hop rồi mới đặt `trust proxy`) phải làm **sau** mục 2, báo cáo đã ghi đúng thứ tự này. MAJOR T703c chỉ đóng khi có mục "Kết quả đo thật" ghi đủ 9 mục.

## Tổng hợp
| Mức | Mục | Việc |
|---|---|---|
| MAJOR | 1 | §6.4 mục 1: kiểm không có `x-middleware-*` trong response gửi client; nếu có thì xoay secret |
| MINOR | 1.a | Bỏ mọi header client gửi có tiền tố `x-middleware-` + 1 test |
| MINOR | 3.a | `MIGRATE_DATABASE_URL` là environment secret, giới hạn branch cho environment `production` |
| Quyết định | 5 | `ORIGIN_SECRET` bắt buộc ở production (refine trong `env.js`) |
| Khuyến nghị | 1 | kien-truc-su duyệt trước `@vercel/functions` làm phương án dự phòng |
