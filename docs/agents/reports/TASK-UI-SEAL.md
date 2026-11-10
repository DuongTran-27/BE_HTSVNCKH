# TASK-UI-SEAL – Giao diện "Hồ sơ và con dấu"

Yêu cầu người dùng (2026-11-10, qua skill frontend-design): bỏ kiểu giao diện "trông như AI làm" (gradient tím, kính mờ,
thẻ giống nhau có bóng, nhãn viết hoa, Inter). Người dùng đã duyệt hướng: chữ màu mực, nền trắng lạnh, phẳng,
một điểm nhấn đỏ son là con dấu trạng thái, font Be Vietnam Pro.

## Thay đổi
- `index.css`: font Be Vietnam Pro (400/500/600/700); thang `blue-*` đổi thành thang màu mực (`blue-700` = `#1C2B4A`);
  `slate-50` = `#F7F8FA`; thêm `--color-seal` `#B3261E`; bo góc nhỏ hơn; `shadow-sm`/`shadow-md` tắt (phẳng toàn trang,
  hộp thoại và toast giữ `shadow-lg/xl`); bỏ quầng gradient nền; đầu bảng chữ thường, kẻ đậm màu mực; thêm `animate-stamp`.
- `ui.jsx`: nút đặc màu mực/đỏ, không gradient, không co khi nhấn; thẻ phẳng viền rõ; trạng thái rỗng bỏ ô gradient;
  thêm `Stamp` (con dấu viền đôi, nghiêng 4°, hiện một lần).
- `Layout.jsx`: sidebar nền mực chữ trắng, mục đang mở có vạch trắng; header trắng đặc; bỏ logo/avatar gradient;
  bỏ hiệu ứng hiện dần khi đổi trang.
- `TopicDetailPage.jsx`: trạng thái ở đầu trang dùng `Stamp` thay `Badge`; tiêu đề khối chữ thường. Danh sách vẫn dùng `Badge` theo `STATUS_TONE`.
- `LoginPage.jsx`: panel trái nền mực phẳng, bỏ quầng, lưới chấm, chữ gradient, thẻ kính; tính năng là danh sách kẻ dòng.
- `Snapshot.jsx`, `ReviewPage.jsx`: nhãn khối bỏ viết hoa.
- Điều chỉnh so với đề xuất ban đầu: nút chính dùng màu mực thay vì đỏ son, vì `btnDanger` đã là đỏ và đỏ son dành riêng cho con dấu.

## Đề xuất thư viện (chờ `kien-truc-su` duyệt)
Thay `@fontsource-variable/inter` 5.3.0 bằng `@fontsource/be-vietnam-pro` 5.3.0 (ghim chính xác, OFL-1.1, tự host nên hợp CSP
`font-src 'self'`). Lý do: font thiết kế cho tiếng Việt, dấu cân hơn Inter. Đã cập nhật UI.md U9.

## Bằng chứng
```
$ npm run lint
> eslint . --max-warnings 0          (không lỗi, không cảnh báo)

$ npm test -w @nckh/web
 Test Files  28 passed (28)
      Tests  230 passed (230)

$ npm run build -w @nckh/web
✓ built in 624ms
```
Chụp màn hình bằng Playwright trên dev server (đăng nhập, danh sách đề tài, chi tiết đề tài 1360 px và 390 px): con dấu hiện đúng,
không tràn ngang ở mobile. Chỉ đổi class CSS và thêm một component trình bày, không đổi logic nên không thêm test.
Chưa chạy E2E (`npm run test:e2e`).

## Cập nhật 2026-11-10: bảng màu theo vlu.edu.vn
Yêu cầu người dùng: lấy màu theo web Đại học Văn Lang. Mã màu đếm từ CSS thật của trang (`/_next/static/css/*.css`):
đỏ `#D72134` (67 lần), navy `#1F2251` (24), viền `#E2E4E9`, vàng `#FEBD25`, nền `#F2F5FF`/`#F5F6FC`, đỏ đậm `#B50315`, navy đậm `#101129`.
- `index.css`: thang `blue-*` → navy VLU; `slate-50/200/300` → nền/viền VLU; thêm `vlu-red`, `vlu-red-dark`, `vlu-gold`; `seal` = đỏ VLU.
- `ui.jsx`: nút chính đỏ VLU (chữ trắng trên `#D72134` tương phản 5,0:1, đạt AA); nút nguy hiểm đổi sang dạng viền đỏ để không lẫn với nút chính.
- `Layout.jsx`: vạch đánh dấu mục menu đang mở màu vàng VLU.

```
$ npm run lint            (không lỗi)
$ npm test -w @nckh/web   Test Files 28 passed (28) · Tests 230 passed (230)
$ npm run build -w @nckh/web   ✓ built in 719ms
```
Đã chụp lại trang đăng nhập và chi tiết đề tài để soát.

## Cập nhật 2026-11-10: đăng nhập nhanh bằng tài khoản mẫu (chỉ dev)
Yêu cầu người dùng: trang đăng nhập hiện các tài khoản để đăng nhập nhanh theo vai trò.
- `LoginPage.jsx`: khối "Đăng nhập nhanh (dữ liệu mẫu)" có 4 nút QT001, CB001, GV001, SV22010. Bấm nút là điền mã cùng mật khẩu
  seed rồi gửi qua đúng luồng `onSubmit` (vẫn qua backend, rate limit, khóa tài khoản). Mảng tài khoản và khối giao diện
  chỉ tồn tại khi `import.meta.env.DEV`: bản build production không chứa mật khẩu mẫu.
- `tests/auth-pages.test.jsx`: test mới, bấm "Giảng viên" thì gửi `{ identifier: 'GV001', password: seed }` và chuyển về trang chủ giảng viên.
- DB dev (không phải code): đặt lại mật khẩu seed và bỏ cờ bắt đổi mật khẩu cho QT001, CB001, GV001, SV22010.

```
$ npm run lint                        (không lỗi)
$ npm test -w @nckh/web               Test Files 28 passed (28) · Tests 231 passed (231)
$ npm run build -w @nckh/web          ✓ built in 608ms
$ grep -l "Nckh@2026\|Đăng nhập nhanh" apps/web/dist/assets/*.js   → không có (dist sạch)
$ curl POST /api/auth/login (QT001, CB001, GV001, SV22010, mật khẩu seed) → 200 cả 4
```

## Sửa lỗi 2026-11-10: đăng nhập lại bằng vai trò khác bị đưa tới trang 403
Người dùng báo (ảnh): quản trị viên đăng nhập xong thấy "Bạn không có quyền truy cập trang này" ở `/yeu-cau`.
Nguyên nhân: phiên cũ (sinh viên) hết hạn ở `/yeu-cau` → `/dang-nhap?next=/yeu-cau`; `LoginPage` chuyển tới `next`
mà không xét vai trò của người vừa đăng nhập.
- `lib/nav.js`: chuyển bảng `SCREENS` (đường dẫn → vai trò) từ `routes.jsx` sang đây, thêm `canVisit(role, path)` (dùng `matchPath`).
  `routes.jsx` import lại `SCREENS`, không đổi hành vi guard.
- `LoginPage.jsx`: chỉ dùng `next` khi `canVisit(user.role, next)`, ngược lại về `homePath(role)`.
- `tests/auth-pages.test.jsx`: test tái hiện lỗi (ADMIN + `next=/yeu-cau` → `/quan-ly/tai-khoan`) và test `canVisit`.

```
$ npm run lint                 (không lỗi)
$ npm test -w @nckh/web        Test Files 28 passed (28) · Tests 233 passed (233)
$ npm run build -w @nckh/web   ✓ built in 648ms
```

## Cập nhật 2026-11-10: mã sinh viên, lớp, ngành mẫu theo cách đặt mã của ĐH Văn Lang
Yêu cầu người dùng: dùng mã kiểu Văn Lang, vd. MSSV `2374802010121`, lớp `71K29CNTT08`.
Cấu trúc: MSSV = 2 số năm nhập học + mã ngành Bộ GD&ĐT (7 số) + 4 số thứ tự; lớp = `71` + khóa `K29` (nhập học 2023) + ngành + số lớp.
- `prisma/seed.js`: ngành CNTT (7480201), KTPM (7480103), HTTT (7480104) thay KTPM/HTTT/KHMT; lớp `71K29CNTT08`, `71K29KTPM02`,
  `71K29HTTT01`; 40 sinh viên mã `23<mã ngành><0001–0040>` (không trùng MSSV ví dụ của người dùng). Mã cán bộ, giảng viên,
  quản trị giữ nguyên (không tìm được định dạng công khai).
- `e2e/prepare.js`, `LoginPage.jsx` (đăng nhập nhanh), `README.md`: đổi theo mã mới.
- DB dev: đổi mã tại chỗ (ngành, lớp, mã + email sinh viên), giữ nguyên mật khẩu và dữ liệu khác.

```
$ npm run db:test:reset        Đã reset DB test (migrate reset).
$ npm test                     shared 73/73 · api Test Files 65 passed, Tests 948 passed · web 233/233
$ npm run lint                 (không lỗi)
$ curl POST /api/auth/login 2374801030010 / mật khẩu seed → 200
```

## Cập nhật 2026-11-10: dữ liệu demo bằng danh sách sinh viên, giảng viên thật
Người dùng cung cấp 19 sinh viên (MSSV, họ tên) và 5 giảng viên (họ tên, email @vlu.edu.vn) để làm dữ liệu demo.
Đây là dữ liệu cá nhân của người thật nên **không đưa vào code/commit**: lưu ở `apps/api/prisma/demo-people.local.json`
(mẫu `*.local.json` thêm vào `.gitignore`). `seed.js`, test và E2E vẫn dùng dữ liệu giả.
- `scripts/demo-people.js` (`npm run demo:people -w @nckh/api`): đọc file cục bộ, kiểm tra (thiếu mã/tên, trùng, email sai, giới hạn số lượng),
  chặn production và DB chưa bật cờ `nckh.seed_allowed` (`assertSeedAllowedDb`, nay được export), cập nhật trong một transaction:
  sinh viên thật thay sinh viên mẫu thứ 21–39 (mã, họ tên, email `<mã>@nckh.example`), giảng viên thật thay GV001–GV005 (họ tên, email thật).
  Không gán học hàm cho người thật. Chạy lại nhiều lần cho cùng kết quả.
- `prisma/seed.js`: export `seedStudentCode(i)` dùng chung cho seed và script.
- `tests/demo-people.test.js`: 6 test cho `planDemoPeople`.
- App không gửi email ra ngoài (không có thư viện gửi mail) nên email thật chỉ dùng để đăng nhập.

```
$ npm run demo:people -w @nckh/api     Đã cập nhật 24 tài khoản demo.   (chạy 2 lần, cùng kết quả)
$ curl POST /api/auth/login 2374802010121 | hung.hd@vlu.edu.vn | GV001 → 200
$ npm run lint                         (không lỗi)
$ npm test                             shared 73/73 · api 66 files, 954/954 · web 233/233
$ git status --short | grep local.json → không có (file đã bị ignore)
```
