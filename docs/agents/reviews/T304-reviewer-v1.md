# Review T304 – reviewer – vòng 1

## Lệnh tự chạy
- `npm test -w @nckh/web`: 12 file, 98 test xanh (khớp báo cáo). `npm run lint`: sạch. `npm run build -w @nckh/web`: OK (cảnh báo chunk > 500 kB, đã nêu trong báo cáo).
- Không chạy test API/DB theo yêu cầu.

## Đối chiếu
- Đường dẫn/phương thức khớp API_GD2 §3.2: `/users`, `/users/:id`, `lock|unlock|reset-password`, `PUT staff-scopes`, `import/preview|confirm?facultyId=` (multipart field `file`), danh mục, `/rounds`. Mã lỗi `IMPORT_HAS_ERRORS`, `DUPLICATE`, `PAYLOAD_TOO_LARGE`, 429, `details.file` được xử lý.
- ADMIN không có quyền nghiệp vụ đợt: route `/quan-ly/dot*` chỉ STAFF, có test ADMIN -> 403 không gọi API. Đạt.
- Mật khẩu tạm: tạo và nhập CSV dùng state cục bộ/`api()` trực tiếp; không vào `localStorage`/`sessionStorage`/query cache (grep sạch). File mật khẩu qua `toCsv`. Đạt.
- INFO i1: `doRefresh` đổi user -> `clearClientSession` + đăng xuất; `login` phát `'login'` qua BroadcastChannel; có 3 test. Đạt.
- Test `guards.test.jsx`: đổi route `/quan-ly/danh-muc/khoa` sang `/kho` là hợp lệ. Ý nghĩa test (vai trò hợp lệ thấy trang tạm trong layout, không 404) giữ nguyên, assertion không yếu đi vì route cũ đã thành màn thật; `/kho` vẫn là trang tạm. Chấp nhận (không vi phạm quy tắc 1).
- Nhãn ADMIN: DAC_TA không dùng chuỗi "Quản trị viên"; UI.md §2.5 gọi "Quản trị (ADMIN)", API_GD2 §1.3 định nghĩa `ROLE_LABEL` = "Quản trị". Giữ "Quản trị", không đổi shared.

## Vấn đề
- MINOR m1 `apps/web/src/pages/admin/UserDetailPage.jsx:81-84`: reset mật khẩu dùng `useMutation`, nên `temporaryPassword` nằm trong `mutation.data` của MutationCache (bộ nhớ, đến khi gc) dù không vào query cache. Đề xuất gọi `api()` trực tiếp trong handler như `UserCreatePage`, hoặc `mutation.reset()` khi đóng hộp; thêm assertion kiểm `qc.getMutationCache().getAll()`.
- MINOR m2 (báo cáo đã nêu): thông điệp Zod mặc định tiếng Anh/khó hiểu cho `idSchema` rỗng ("Chọn khoa"). Vi phạm quy tắc 7 nhẹ; sửa message trong shared ở task sau.
- INFO: chưa kiểm 360 px và E2E (T309); bundle 542 kB nên code-split.

Số lượng: BLOCKER 0, MAJOR 0, MINOR 2.

Kết luận: APPROVED
