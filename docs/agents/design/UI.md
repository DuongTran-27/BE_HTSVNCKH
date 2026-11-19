# UI – Thiết kế màn hình theo vai trò (GĐ3)

- Task: T300 · M1–M5 · FR01–FR08, FR16, FR17, FR25 · NFR01, NFR06, NFR07 · Người soạn: kien-truc-su · Ngày: 2026-11-01
- Trạng thái: **ĐỀ XUẤT – vòng sửa 1** (xử lý `reviews/T300-reviewer-v1.md`, `reviews/T300-frontend-dev-v1.md`; chờ RV, FE duyệt lại).
- Nguồn: `docs/DAC_TA.md` (mục 1–8), `design/API_GD2.md` (gọi tắt **API §x**), `reports/T200.md`, `reviews/T200-*-v3.md`, `CAU_HOI.md` #2–#6, `BANG_CONG_VIEC.md` (T301–T309, T206), `packages/shared/src/{enums,transitions,schemas}.js`, `apps/api/src/modules/auth/*`, `apps/api/src/middlewares/errorHandler.js`.
- Tài liệu này không chứa code. Tên trường, mã lỗi, endpoint lấy nguyên văn từ API_GD2. Màn GĐ4–6 chỉ ghi chỗ đặt (mục 2.7), chưa có hợp đồng.

---

## 1. Nguyên tắc chung

### 1.1 Phiên và gọi API (T301, T302)
- Mọi request đi qua **một** API client, đường dẫn tương đối `/api/*` (API §1.1, cùng origin). Không có biến môi trường cho URL API.
- Body là `FormData` (nhập CSV, R21): client **không** tự đặt `Content-Type` để trình duyệt tự thêm `multipart/form-data; boundary=…`. Body là object → `application/json`.
- Router: **bắt buộc data router** (`createBrowserRouter` + `RouterProvider`), vì chặn rời trang (R7, R21) dùng `useBlocker`, chỉ chạy với data router. Không dùng `<BrowserRouter>`.
- Access token chỉ giữ trong bộ nhớ (không `localStorage`, NFR01). Refresh token là cookie httpOnly `nckh_rt`, JS không đọc.
- **Nguồn duy nhất của `user` + access token: module auth trong bộ nhớ** (T301), có `subscribe` để React đọc qua `useSyncExternalStore`. Không lưu `user` trong cache TanStack Query (không có khóa `['me']`), nên `queryClient.clear()` không làm mất `user`. Login, refresh, `GET /api/auth/me` đều ghi vào module này.
- Khởi động app: gọi `POST /api/auth/refresh` một lần → có `{ accessToken, user }` thì vào app, 401/403 thì là khách, lỗi mạng/5xx thì màn "Không kết nối được máy chủ" + "Thử lại". Trong lúc chờ: màn tải toàn trang (logo + "Đang tải…").
- Gặp 401 `UNAUTHORIZED` ở request thường: refresh **một lần** rồi gửi lại request. Không refresh với chính `/api/auth/login`, `/api/auth/refresh`.
- **Tuần tự hóa refresh** (API §1.1, refresh gọi đôi sẽ thu hồi cả họ phiên):
  - Promise refresh dùng chung đặt ở **biến cấp module** của API client, không đặt trong state hay effect. Nhờ vậy React StrictMode chạy effect khởi động 2 lần ở dev vẫn chỉ ra 1 request.
  - Giữa các tab: bọc trong `navigator.locks.request('nckh-refresh', …)`. Trình duyệt không có `navigator.locks` → chỉ dùng promise trong tab (chấp nhận rủi ro hai tab cùng refresh trên trình duyệt cũ).
  - Refresh bị từ chối (401/403) → xóa module auth + `queryClient.clear()`, chuyển `/dang-nhap?next=<đường dẫn hiện tại>`, toast "Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại" (chỉ một lần dù nhiều request cùng thất bại).
  - Refresh lỗi mạng/5xx/429 → **không** đăng xuất: request gốc nhận `ApiError` (xử lý như lỗi mạng/lỗi server ở mục 6, 7). Lúc khởi động → màn "Không kết nối được máy chủ" + "Thử lại", không coi là khách. Lý do: Render ngủ hoặc mất mạng tạm thời không phải lý do để mất phiên (quyết định T301 #5, `kien-truc-su` duyệt).
- Đăng xuất: `POST /api/auth/logout` → xóa module auth + `queryClient.clear()` → `/dang-nhap`. Lỗi mạng khi logout vẫn xóa phía client.
- `user` (từ login/refresh/me) có `id`, `code`, `fullName`, `role`, `facultyId`, `mustChangePassword`, `staffFacultyIds` (API §1.1). Sau đổi mật khẩu (204) gọi lại `GET /api/auth/me` và ghi `user` mới vào module auth (cập nhật `mustChangePassword`).

### 1.2 Phân quyền ở giao diện (T303)
- Guard theo `user.role` chỉ để **dẫn đường**, không phải bảo mật. Backend luôn kiểm (FR25). Mọi màn vẫn phải xử lý 403 từ API.
- `mustChangePassword === true` → mọi route trừ `/doi-mat-khau` chuyển về `/doi-mat-khau`. Header chỉ còn nút "Đăng xuất". Nếu API vẫn trả 403 `PASSWORD_CHANGE_REQUIRED` (ví dụ dữ liệu `user` cũ) → xử lý giống trên.
- **ADMIN không có menu nghiệp vụ** (đề tài, lời mời, đề nghị, xét duyệt, đợt, từ đồng nghĩa). Gõ thẳng URL nghiệp vụ → trang 403. Admin chỉ thấy: Tài khoản, Danh mục (khoa, ngành, lớp, lĩnh vực), Kho đề tài.
- Nút chuyển trạng thái **chỉ** hiện theo `topic.availableActions` (API §5.1). Nút không chuyển trạng thái (sửa, mời, đổi trưởng nhóm, kiểm tra trước) **chỉ** theo `topic.permissions`. UI không tự suy luận quyền từ vai trò/trạng thái, trừ hai ngoại lệ ghi ở mục 5.3.
- Điều kiện dữ liệu (hạn đăng ký, số thành viên, hạn mức GV) **không** dùng để ẩn nút (API §5.1 "nút vẫn hiện"). UI được hiện **gợi ý** cạnh nút (ví dụ "Đã hết thời gian đăng ký"), backend quyết định.
- `next` sau đăng nhập chỉ nhận đường dẫn nội bộ: bắt đầu bằng `/`, không bắt đầu bằng `//`, **không chứa `\`** (trình duyệt hiểu `/\evil.com` như `//evil.com`). Sai → về trang chủ vai trò (chống open redirect). Chỉ điều hướng bằng `navigate()` của React Router, **không** gán `window.location`. T302 có unit test cho hàm kiểm `next`; bảo mật soát lại ở T302.

### 1.3 Dữ liệu và URL
- Bộ lọc, trang, sắp xếp của mọi danh sách nằm trong **query string** (chia sẻ link, nút Back hoạt động). Tên tham số trùng tên query của API (`roundId`, `status`, `q`, `page`, `pageSize`, `sort`…). Giá trị không hợp lệ trên URL → bỏ qua, dùng mặc định.
- Phân trang ở server (`page`, `pageSize` mặc định 20). Khi đổi trang giữ dữ liệu cũ đến lúc có dữ liệu mới (`placeholderData` giữ trang trước), không nháy trắng.
- Ô tìm `q`: debounce 400 ms, cắt 200 ký tự (API §1.7). Đồng bộ query string + debounce làm một lần trong hook `useUrlState` (T303, mục 9.1).
- Nhãn enum lấy từ shared: `TOPIC_STATUS_LABEL`, `FINAL_RESULT_LABEL`, `REQUEST_STATUS_LABEL`, `ROLE_LABEL`, `SIMILARITY_LEVEL_LABEL`, `ACTION_LABEL` (API §11, T206 thêm). Không viết cứng nhãn trong web.
- Validate client bằng chính schema shared (React Hook Form + `zodResolver`): `loginSchema`, `changePasswordSchema`, `topicDraftSchema`, `topicSubmitSchema(effectiveConfig)`, `reasonSchema`, `invitationCreateSchema`, `leaderTransferSchema`, `userCreateSchema`, `userUpdateSchema`, `staffScopesSchema`, `roundCreateSchema`, `roundUpdateSchema`, schema danh mục (API §11). Lỗi server vẫn có thể khác (dữ liệu DB), nên luôn xử lý `details` (mục 7).

### 1.4 Thời gian (NFR06)
- Hiển thị mọi thời điểm bằng `Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })`, dạng `dd/MM/yyyy HH:mm`. Không dùng múi giờ máy khách.
- Ô nhập mốc của đợt: `datetime-local` hiểu là giờ Việt Nam, gửi lên chuỗi ISO có `+07:00` (API §1.4). Việt Nam không có giờ mùa hè nên offset cố định.
- "Còn mở đăng ký", "đã quá hạn" lấy từ trường server (`registrationOpen`, `pendingDays`). Giờ máy khách chỉ được dùng cho tô màu trang trí (ví dụ hạn xét duyệt đã qua), không dùng để ẩn/tắt nút.

### 1.5 Trạng thái chung của một màn (chi tiết mục 6)
Mỗi màn có đủ 4 trạng thái: **đang tải lần đầu** (khung xương), **rỗng** (thông điệp + hành động gợi ý), **lỗi** (theo mục 7, có nút "Thử lại"), **có dữ liệu**. Mỗi nút gửi có trạng thái **đang xử lý** (disabled + spinner + chữ "Đang xử lý…"), vì tranh chấp khóa có thể chờ ~3 s (API §1.8).

---

## 2. Sitemap theo vai trò

Trang chủ vai trò (route `/` tự chuyển): SV → `/de-tai` · GV → `/de-nghi-huong-dan` · Cán bộ → `/xet-duyet` · Admin → `/quan-ly/tai-khoan`.

### 2.1 Khách (chưa đăng nhập)
```
/dang-nhap
(mọi route khác → /dang-nhap?next=…)
```

### 2.2 Sinh viên (STUDENT)
```
Đề tài của tôi        /de-tai                      (trang chủ; nút "Tạo đề tài", banner lời mời đang chờ)
  ├ Tạo đề tài        /de-tai/moi
  └ Chi tiết đề tài   /de-tai/:id                  (thanh hành động theo availableActions)
      ├ Soạn hồ sơ    /de-tai/:id/sua              (permissions.edit; "Kiểm tra trước")
      ├ Nhóm          /de-tai/:id/nhom             (mời, hủy lời mời, đổi trưởng nhóm)
      ├ Mời GVHD      /de-tai/:id/moi-gvhd         (REQUEST_ADVISOR)
      ├ Gửi xét duyệt /de-tai/:id/gui              (SUBMIT_FOR_REVIEW | RESUBMIT)
      └ Lịch sử       /de-tai/:id/lich-su          (các lần gửi + lịch sử trạng thái)
           ├ Lần gửi  /de-tai/:id/lan-gui/:seq
           └ So sánh  /de-tai/:id/so-sanh?from=&to=
Lời mời               /loi-moi
Kho đề tài            /kho, /kho/:code
Đổi mật khẩu          /doi-mat-khau
```

### 2.3 Giảng viên (LECTURER)
```
Đề nghị hướng dẫn     /de-nghi-huong-dan           (trang chủ; nhận/từ chối, "Đã nhận x/y")
Đề tài hướng dẫn      /de-tai                      (đề tài mình là GVHD hiện hành)
  └ Chi tiết          /de-tai/:id                  (GVHD hiện hành hoặc GV được đề nghị)
      └ Lịch sử       /de-tai/:id/lich-su, /lan-gui/:seq, /so-sanh   (chỉ GVHD hiện hành, API §8.4)
Kho đề tài            /kho, /kho/:code
Đổi mật khẩu          /doi-mat-khau
```

### 2.4 Cán bộ khoa (STAFF)
```
Xét duyệt             /xet-duyet                   (trang chủ; hàng chờ UNDER_REVIEW)
  └ Màn xét duyệt     /xet-duyet/:id               (snapshot mới nhất + FR06 + giải trình + quyết định)
Đề tài                /de-tai                      (đề tài khoa trong phạm vi, trừ Nháp)
  └ Chi tiết          /de-tai/:id  → Lịch sử, Lần gửi, So sánh
Đề nghị hướng dẫn     /de-nghi-huong-dan           (chỉ đọc, theo dõi đề nghị chờ lâu)
Quản lý
  ├ Đợt               /quan-ly/dot, /quan-ly/dot/moi, /quan-ly/dot/:id
  ├ Tài khoản         /quan-ly/tai-khoan, /moi, /:id, /nhap-csv     (GV, SV khoa trong phạm vi)
  └ Danh mục          /quan-ly/danh-muc/nganh | lop | linh-vuc | dong-nghia
Kho đề tài            /kho, /kho/:code
Đổi mật khẩu          /doi-mat-khau
```

### 2.5 Quản trị (ADMIN) – không có quyền nghiệp vụ
```
Tài khoản             /quan-ly/tai-khoan           (trang chủ; mọi vai trò, mọi khoa; gán phạm vi cán bộ)
  ├ Tạo               /quan-ly/tai-khoan/moi
  ├ Chi tiết          /quan-ly/tai-khoan/:id
  └ Nhập CSV          /quan-ly/tai-khoan/nhap-csv
Danh mục              /quan-ly/danh-muc/khoa | nganh | lop | linh-vuc
Kho đề tài            /kho, /kho/:code             (API §9.2 cho phép ADMIN)
Đổi mật khẩu          /doi-mat-khau
```

### 2.6 Chung
```
/403        Không có quyền (cũng hiển thị tại chỗ khi API trả 403 lúc tải trang)
*           404 Không tìm thấy trang
```

### 2.7 Chỗ đặt màn GĐ4–6 (chưa có hợp đồng; chỉ giữ chỗ, không làm ở GĐ3)
| Vị trí | Nội dung | FR | Hợp đồng / task UI |
|---|---|---|---|
| Tab `/de-tai/:id/moc` | Mốc thực hiện, đổi hạn có lịch sử; nhận xét/đánh giá theo bản nộp; mở lại mốc | FR09, FR12, FR22 | API_GD45 (T400) / T406; FR22: API_GD6 / T607 |
| Tab `/de-tai/:id/tien-do` | Cập nhật tiến độ tự khai % | FR10 | T400 / T406 |
| Tab `/de-tai/:id/tai-lieu` | Upload, phiên bản, link ngoài, tải bằng URL ký 5 phút | FR11, FR24 | T400 / T406 |
| Thanh hành động `/de-tai/:id` | `REQUEST_CLOSE` (GV), `CONFIRM_CLOSE`, `RETURN_TO_ADVISOR`, `CLOSE_EXPIRED`, `CANCEL` (cán bộ) – chỉ cần thêm hộp thoại, cơ chế `availableActions` giữ nguyên | FR20, FR27 | T400, T600 / T406, T607 |
| Header: chuông + `/thong-bao` | Thông báo, đã đọc | FR13 | T400 / T504 |
| `/thong-ke` (cán bộ; GV chỉ đề tài mình) | Biểu đồ Recharts + bảng + CSV cùng bộ lọc | FR14 | T400 / T504 |
| Dashboard cán bộ (`/thong-ke` hoặc đầu `/xet-duyet`) | Tiện ích "Đề tài kẹt sau khi đóng đăng ký" (FR16.5: đặc tả ghi "cán bộ thấy danh sách này trên dashboard"). GĐ3 đã có lối tắt ở R4 (mục 4.4); T504 đưa thành tiện ích, dùng cùng truy vấn | FR16.5 | API §9.1 / T504 |
| Tab `/de-tai/:id/yeu-cau` + hàng chờ cán bộ `/yeu-cau` | Thay đổi sau duyệt, thay GV, đề nghị hủy, rời nhóm | FR18–FR21 | API_GD6 (T600) / T607 |
| `/de-tai/:id` (cán bộ) | Sửa sai kết quả bằng phiên bản mới | FR23 | T600 / T607 |
| `/xet-duyet/:id` | Cán bộ cho phép gửi với cờ "chưa kiểm tra" khi FR06 lỗi kéo dài (G5) | FR06, FR07 | T600 / T607 |

---

## 3. Bảng route ↔ vai trò ↔ API

"Vai trò" là vai trò được vào route (guard). Quan hệ với đề tài do backend kiểm; UI xử lý 403 theo mục 7.

| # | Route | Vai trò được vào | Màn | Endpoint gọi (mục API_GD2) | Task |
|---|---|---|---|---|---|
| R1 | `/dang-nhap` | Khách | Đăng nhập | `POST /api/auth/login` (API §1.1, API §2) | T302 |
| R2 | `/doi-mat-khau` | Mọi vai trò đã đăng nhập | Đổi mật khẩu (tự chọn hoặc bắt buộc) | `POST /api/auth/change-password`, `GET /api/auth/me` (API §1.1, API §1.2) | T302 |
| R3 | `/`, `/403`, `*` | Tùy | Chuyển hướng, 403, 404 | – | T303 |
| R4 | `/de-tai` | STUDENT, LECTURER, STAFF | Danh sách đề tài trong phạm vi | `GET /api/topics` (API §9.1); bộ lọc: `GET /api/rounds` (API §4.3), `GET /api/fields` (API §4.2), `GET /api/users?role=LECTURER` (API §3.2, chỉ STAFF, cho bộ lọc GVHD); SV thêm `GET /api/invitations?status=PENDING&pageSize=1` (API §5.3) cho banner | T308 (cả phần SV: nút tạo + banner) |
| R5 | `/de-tai/moi` | STUDENT | Tạo đề tài nháp | `GET /api/rounds` (API §4.3), `POST /api/topics` (API §5.1) | T305 |
| R6 | `/de-tai/:id` | STUDENT, LECTURER, STAFF | Chi tiết đề tài + thanh hành động | `GET /api/topics/:id` (API §5.1); `POST /api/topics/:id/actions` (API §8.1, API §10) cho `WITHDRAW_ADVISOR_REQUEST`, `ACCEPT_ADVISING`, `DECLINE_ADVISING` (API §6) | T306 (khung + `TopicActionBar`); T305 thêm action SV + panel trùng lặp; T307 thêm nút "Xét duyệt" (mục 9.1) |
| R7 | `/de-tai/:id/sua` | STUDENT | Soạn hồ sơ, "Kiểm tra trước" | `GET /api/topics/:id`, `PUT /api/topics/:id` (API §5.1), `GET /api/fields` (API §4.2), `POST /api/topics/:id/similarity-checks`, `GET /api/topics/:id/similarity-checks/latest` (API §7.1, API §7.2) | T305 |
| R8 | `/de-tai/:id/nhom` | STUDENT, LECTURER, STAFF | Thành viên, lời mời chờ, mời, hủy lời mời, đổi trưởng nhóm | `GET /api/topics/:id` (API §5.1), `POST /api/topics/:id/invitations`, `POST /api/invitations/:id/cancel` (API §5.3), `POST /api/topics/:id/leader` (API §5.4) | T305 |
| R9 | `/de-tai/:id/moi-gvhd` | STUDENT | Chọn GV, gửi đề nghị hướng dẫn | `GET /api/topics/:id` (API §5.1), `GET /api/lecturers?roundId=` (API §6), `POST /api/topics/:id/actions` `REQUEST_ADVISOR` (API §8.1, API §6, API §5.5) | T305 |
| R10 | `/de-tai/:id/gui` | STUDENT | Gửi xét duyệt / gửi lại (luồng 4 bước) | `GET /api/topics/:id` (API §5.1), `GET …/similarity-checks/latest`, `POST …/similarity-checks` (API §7.1), `POST /api/topics/:id/actions` `SUBMIT_FOR_REVIEW`/`RESUBMIT` (API §8.1, API §8.2) | T305 |
| R11 | `/de-tai/:id/lich-su` | STUDENT, LECTURER, STAFF | Danh sách lần gửi + lịch sử trạng thái | `GET /api/topics/:id/submissions`, `GET /api/topics/:id/status-history` (API §8.4) | T307 |
| R12 | `/de-tai/:id/lan-gui/:seq` | STUDENT, LECTURER, STAFF | Xem snapshot (nội dung + FR06 + giải trình + quyết định) | `GET /api/topics/:id/submissions/:seq` (API §8.4, API §7.2) | T307 |
| R13 | `/de-tai/:id/so-sanh` | STUDENT, LECTURER, STAFF | So sánh 2 lần gửi (`?from=&to=`) | `GET /api/topics/:id/submission-diff` (API §8.4) | T307 |
| R14 | `/loi-moi` | STUDENT | Lời mời gửi tới mình | `GET /api/invitations`, `POST /api/invitations/:id/accept`, `POST /api/invitations/:id/decline` (API §5.3) | T305 |
| R15 | `/de-nghi-huong-dan` | LECTURER, STAFF | GV: xử lý đề nghị; cán bộ: theo dõi (chỉ đọc) | `GET /api/advisor-requests` (API §6), `GET /api/lecturers?roundId=` (API §6), GV: `POST /api/topics/:id/actions` `ACCEPT_ADVISING`/`DECLINE_ADVISING` (API §8.1, API §6) | T306 (cả GV và cán bộ chỉ đọc) |
| R16 | `/xet-duyet` | STAFF | Hàng chờ xét duyệt | `GET /api/topics?status=UNDER_REVIEW&sort=updatedAt_asc` (API §9.1), `GET /api/rounds` (API §4.3) | T307 |
| R17 | `/xet-duyet/:id` | STAFF | Màn xét duyệt | `GET /api/topics/:id` (API §5.1), `GET /api/topics/:id/submissions/:seq` (lần mới nhất và, khi `seq > 1`, lần `seq-1` để lấy lý do quyết định trước), `GET /api/topics/:id/submissions` (API §8.4), `POST /api/topics/:id/actions` `APPROVE`/`REQUEST_REVISION`/`REJECT` (API §8.1, API §8.3) | T307 |
| R18 | `/quan-ly/tai-khoan` | ADMIN, STAFF | Danh sách tài khoản | `GET /api/users` (API §3.2), `GET /api/faculties`, `GET /api/majors`, `GET /api/classes` (API §4.2) | T304 |
| R19 | `/quan-ly/tai-khoan/moi` | ADMIN, STAFF | Tạo tài khoản | `POST /api/users` (API §3.2, API §3.1), danh mục (API §4.2) | T304 |
| R20 | `/quan-ly/tai-khoan/:id` | ADMIN, STAFF | Xem, sửa, khóa/mở, reset mật khẩu, phạm vi khoa (ADMIN) | `GET /api/users/:id`, `PATCH /api/users/:id`, `POST /api/users/:id/lock`, `POST /api/users/:id/unlock`, `POST /api/users/:id/reset-password`, `PUT /api/users/:id/staff-scopes` (API §3.2) | T304 |
| R21 | `/quan-ly/tai-khoan/nhap-csv` | ADMIN, STAFF | Nhập CSV 3 bước | `POST /api/users/import/preview`, `POST /api/users/import/confirm` (API §3.2) | T304 |
| R22 | `/quan-ly/danh-muc/:loai` | `khoa`: ADMIN · `nganh`, `lop`, `linh-vuc`: ADMIN, STAFF · `dong-nghia`: STAFF | Danh mục | `GET/POST /api/faculties|majors|classes|fields`, `PATCH /api/…/:id`, `GET/POST /api/synonyms`, `DELETE /api/synonyms/:id` (API §4.1, API §4.2) | T304 |
| R23 | `/quan-ly/dot` | STAFF | Danh sách đợt | `GET /api/rounds` (API §4.3) | T304 |
| R24 | `/quan-ly/dot/moi`, `/quan-ly/dot/:id` | STAFF | Form đợt + cấu hình tham số | `GET /api/rounds/:id`, `POST /api/rounds`, `PATCH /api/rounds/:id` (API §4.3) | T304 |
| R25 | `/kho`, `/kho/:code` | Mọi vai trò đã đăng nhập (kể cả ADMIN) | Kho đề tài đóng đạt | `GET /api/repository`, `GET /api/repository/:code` (API §9.2), `GET /api/fields` (API §4.2) | T308 |

---

## 4. Mô tả từng màn

Ký hiệu: **Tải** = dữ liệu cần tải · **Rỗng** = trạng thái rỗng · **Lỗi riêng** = lỗi khác với xử lý chung ở mục 7.

### 4.1 Đăng nhập – R1 (T302)
- Thành phần: ô "Mã hoặc email" (`identifier`), "Mật khẩu" (`password`, nút hiện/ẩn), nút "Đăng nhập". Không có link đăng ký (FR02).
- Thành công: `mustChangePassword` → `/doi-mat-khau`; không thì `next` hợp lệ (mục 1.2) hoặc trang chủ vai trò.
- Lỗi riêng (lỗi cấp form, đặt trên nút): 401 → "Mã/email hoặc mật khẩu không đúng" (giữ thông điệp server, không gợi ý tài khoản có tồn tại); 403 `ACCOUNT_LOCKED`; 429 `TEMP_LOCKED`; 429 `RATE_LIMITED` (kèm "thử lại sau N phút" nếu có `Retry-After`). Xóa ô mật khẩu sau lỗi, giữ ô mã.

### 4.2 Đổi mật khẩu – R2 (T302)
- Thành phần: `currentPassword`, `newPassword` (gợi ý: ≥ 8 ký tự, có chữ và số – theo `changePasswordSchema`), "Nhập lại mật khẩu mới" (chỉ kiểm phía client).
- Chế độ bắt buộc (`mustChangePassword`): banner "Bạn cần đổi mật khẩu trước khi tiếp tục", ẩn menu, chỉ còn "Đăng xuất".
- Thành công (204): gọi `GET /api/auth/me`, toast "Đã đổi mật khẩu. Các phiên đăng nhập khác đã bị đăng xuất.", về trang chủ vai trò.
- Lỗi riêng: `WRONG_PASSWORD` → ô `currentPassword`; `SAME_PASSWORD` → ô `newPassword`; 429 `RATE_LIMITED` (5 lần/15 phút).

### 4.3 Layout, guard, 403/404 – R3 (T303)
- Header: tên hệ thống, menu theo vai trò (mục 2), tên người dùng + vai trò (`ROLE_LABEL`), menu người dùng (Đổi mật khẩu, Đăng xuất). Chỗ trống cho chuông thông báo (T504).
- Trang 403: "Bạn không có quyền truy cập trang này" + nút "Về trang chủ". Trang 404: "Không tìm thấy trang" + nút "Về trang chủ".
- Khi API trả 403/404 lúc **tải** dữ liệu chính của trang: hiện nội dung 403/404 **tại chỗ** (giữ URL, giữ header), không chuyển route.

### 4.4 Danh sách đề tài – R4 (T308, cả phần SV)
- Tiêu đề theo vai trò: SV "Đề tài của tôi", GV "Đề tài hướng dẫn", cán bộ "Đề tài của khoa".
- Bộ lọc (FR08): đợt (`roundId`), năm học (`academicYear`), lĩnh vực (`fieldId`), GVHD (`lecturerId`, chỉ cán bộ), trạng thái (`status`), kết quả (`result`), từ khóa (`q`), sắp xếp (`sort`). Nút "Xóa bộ lọc". SV/GV: bộ lọc thu gọn trong nút "Lọc" (danh sách thường ngắn).
- Bộ lọc GVHD (cán bộ): ô chọn có tìm kiếm, nguồn `GET /api/users?role=LECTURER&q=…` (API §3.2; server tự giới hạn theo khoa trong phạm vi). Không cần chọn đợt trước, và có cả GV đã khóa (vẫn là GVHD của đề tài cũ). Hiện mã + họ tên. Xem quyết định Q5 trong báo cáo.
- Cột/thẻ: mã, tên, trạng thái (badge), đợt, lĩnh vực, GVHD, trưởng nhóm + số thành viên, mức trùng lặp gần nhất (`latestSimilarityLevel`, hiển thị theo quy tắc ô mức ở mục 4.13), cập nhật lúc. Bấm dòng → `/de-tai/:id`.
- SV: nút "Tạo đề tài" → R5; banner "Bạn có N lời mời đang chờ" (từ `total`) → `/loi-moi`.
- Cán bộ, lối tắt FR16.5 (không cần chọn đợt): "Đề tài chờ GVHD" = `status=WAITING_ADVISOR`; "Đề tài đã có GVHD chưa gửi" = `status=HAS_ADVISOR`. Ở mọi dòng, khi `item.round.registrationOpen === false` và trạng thái ∈ {DRAFT, WAITING_ADVISOR, HAS_ADVISOR} → badge "Đã đóng đăng ký" (đề tài kẹt). Tiện ích trên dashboard: T504 (mục 2.7).
- Tải: danh sách + danh mục bộ lọc (đợt, lĩnh vực) song song.
- Rỗng: không có bộ lọc → SV "Bạn chưa có đề tài nào. Hãy tạo đề tài hoặc chấp nhận lời mời." (+ 2 nút); GV "Bạn chưa hướng dẫn đề tài nào."; cán bộ "Chưa có đề tài nào trong khoa." Có bộ lọc → "Không có đề tài phù hợp với bộ lọc" + "Xóa bộ lọc". `page` vượt quá (`items: []`, `total > 0`) → về trang cuối.

### 4.5 Tạo đề tài – R5 (T305)
- Thành phần: chọn đợt (từ `GET /api/rounds`, hiện tên + năm học + "Đang mở đăng ký"/"Chưa mở hoặc đã đóng đăng ký" theo `registrationOpen`), ô "Tên đề tài" (tùy chọn ở bước này). Nút "Tạo nháp".
- Thành công (201): chuyển `/de-tai/:id/sua`, toast "Đã tạo đề tài {code}".
- Rỗng: không có đợt → "Khoa chưa mở đợt đăng ký nào." (không có nút tạo).
- Lỗi riêng: 409 `REGISTRATION_CLOSED` tại ô đợt; 403 (đợt khác khoa) → thông điệp form.

### 4.6 Chi tiết đề tài – R6 (T306 dựng khung + `TopicActionBar` + action GV; T305 thêm action SV và panel trùng lặp; T307 thêm nút "Xét duyệt")
Một màn dùng chung cho SV, GV, cán bộ; nội dung theo dữ liệu trả về, không theo nhánh vai trò.
- **Đầu trang**: mã, tên (rỗng → "(Chưa đặt tên)"), badge trạng thái, đợt + năm học, lĩnh vực.
- **Vùng thông báo theo trạng thái**:
  - `NEEDS_REVISION`/`REJECTED`: hộp nổi bật lý do của cán bộ từ `latestSubmission.decision` (`reason`, `decidedBy.fullName`, `decidedAt`) – FR07.
  - `WAITING_ADVISOR`: "Đang chờ {pendingAdvisorRequest.lecturer.fullName} phản hồi – {pendingDays} ngày".
  - `round.registrationOpen === false` và trạng thái ∈ {DRAFT, WAITING_ADVISOR, HAS_ADVISOR}: cảnh báo "Đã hết thời gian đăng ký của đợt – không gửi đề nghị/gửi xét duyệt được" (FR16.5). Gợi ý, không ẩn nút.
  - `UNDER_REVIEW`: "Đang chờ cán bộ xét duyệt – lần gửi {seq} lúc {createdAt}; hạn xét duyệt {reviewDeadline}".
- **Thân**: Tóm tắt, Mục tiêu, Từ khóa (chip), GVHD (`advisor` hoặc "Chưa có"), Nhóm (tóm tắt thành viên, trưởng nhóm đánh dấu, "x/maxMembers" từ `round.effectiveConfig`; link "Quản lý nhóm" → R8), Kiểm tra trùng lặp (`SimilarityBadge` của `latestSimilarity` – T306; `isStale` → "Kết quả cũ – nội dung đã đổi sau lần kiểm này"; nút "Xem chi tiết" mở `SimilarityPanel`, tải `GET …/similarity-checks/latest` – T305 gắn vào), Lần gửi gần nhất (link R12), link "Lịch sử" → R11.
- **Thanh hành động**: nút theo mục 5. Sửa hồ sơ (`permissions.edit`) → R7.
- Tải: `GET /api/topics/:id`. Panel trùng lặp tải khi mở.
- Lỗi riêng: tải 403 → "Bạn không có quyền xem đề tài này" tại chỗ (SV ngoài nhóm, GV đã từ chối, cán bộ khoa khác hoặc đề tài Nháp); 404 → "Không tìm thấy đề tài".

### 4.7 Soạn hồ sơ – R7 (T305)
- Vào được khi `permissions.edit`; nếu không → chuyển về R6 kèm toast "Chỉ sửa được hồ sơ ở trạng thái Nháp hoặc Cần chỉnh sửa".
- Trường (`topicUpdateSchema`): `title`; `summary` (bộ đếm "x/{minSummaryWords} từ" bằng `countWords`); `objectives`; `keywords` (nhập dạng chip, Enter/dấu phẩy để thêm, chặn ở `maxKeywords`, bộ đếm "x/{minKeywords}–{maxKeywords}"); `fieldId` (chọn lĩnh vực `isActive`); `version` ẩn.
- **Lĩnh vực đã ngừng dùng**: SV không gọi được `includeInactive=true`, nên nhận biết khi `topic.field` khác `null` và `topic.field.id` không có trong `GET /api/fields`. Khi đó ô vẫn hiện tên `topic.field.name` kèm nhãn "Ngừng dùng" và cảnh báo ngay tại ô (không chờ bấm lưu): "Lĩnh vực này đã ngừng dùng, hãy chọn lĩnh vực khác trước khi lưu". Lý do: PUT gửi đủ trường và server kiểm `fieldId` `isActive` (API §5.1), nên mọi lần lưu đều nhận 400 tại `fieldId` cho tới khi đổi lĩnh vực. Không đổi hợp đồng ở GĐ3 (trường hợp hiếm: cán bộ ngừng dùng lĩnh vực giữa đợt).
- **Giá trị form từ `TopicDetail`** (dùng chung cho form R7 và cho mọi lần chạy `topicSubmitSchema` trên dữ liệu đã lưu ở R9, R10): `{ title, summary, objectives, keywords, fieldId: topic.field?.id ?? '' }`. `TopicDetail` chỉ có `field: { id, name }`, không có `fieldId`; đưa thẳng `TopicDetail` vào schema thì ô lĩnh vực luôn báo thiếu. T305 viết hàm chuyển này một lần, có unit test.
- **Luôn gửi đủ mọi trường** (PUT thay toàn bộ, API §5.1).
- Danh sách kiểm "Đủ điều kiện gửi" chạy `topicSubmitSchema(round.effectiveConfig)` trên dữ liệu form, hiện từng mục đạt/chưa đạt. Chỉ là gợi ý, không chặn lưu nháp.
- Nút: "Lưu nháp" (validate `topicDraftSchema`); "Kiểm tra trước" (`permissions.checkSimilarity`): nếu form có thay đổi chưa lưu thì lưu trước rồi mới gọi `POST …/similarity-checks` (API §7.1 so nội dung đã lưu). Kết quả hiện ở panel trùng lặp (mục 4.13).
- Rời trang khi còn thay đổi chưa lưu → hộp xác nhận (`useBlocker` của data router, mục 1.1, + `beforeunload`).
- Nhận lỗi trường từ R10/R6 (`TOPIC_INCOMPLETE`) qua state điều hướng → `setError` từng ô khi mở form.
- Lỗi riêng: 409 `CONCURRENT_UPDATE` → hộp thoại "Hồ sơ vừa được thành viên khác cập nhật" với 2 lựa chọn: "Tải bản mới (bỏ thay đổi của tôi)" hoặc "Giữ nội dung của tôi" (tải lại để lấy `version` mới, giữ nguyên ô đã nhập, người dùng bấm lưu lần nữa sẽ ghi đè có chủ ý). 409 `TOPIC_NOT_EDITABLE` → toast + về R6. 429 ở "Kiểm tra trước" (10 lần/15 phút).

### 4.8 Nhóm – R8 (T305)
- Thành viên (`members`: mã, họ tên, vai trò Trưởng nhóm/Thành viên, ngày tham gia), "x/maxMembers".
- Lời mời đang chờ (`pendingInvitations`, chỉ thành viên thấy): mã SV, họ tên, ngày mời; nút "Hủy lời mời" khi `permissions.invite`.
- Form mời (khi `permissions.invite`): ô "Mã sinh viên" (`inviteeCode`). Không có tìm kiếm danh bạ (API §5.3).
- Đổi trưởng nhóm (khi `permissions.transferLeader`): chọn thành viên khác → hộp xác nhận "Bạn sẽ không còn là trưởng nhóm" → `POST …/leader` với `{ userId, version }`.
- GV, cán bộ: chỉ xem danh sách thành viên.
- Rỗng: không có lời mời chờ → "Chưa có lời mời nào đang chờ".
- Lỗi riêng: `VALIDATION_ERROR` tại `inviteeCode` ("Không tìm thấy sinh viên phù hợp"); `ALREADY_MEMBER`, `GROUP_FULL` tại `inviteeCode`; `TOPIC_NOT_EDITABLE` → toast + tải lại; `INVITATION_CLOSED` (hủy) → toast + tải lại; `CONCURRENT_UPDATE` (đổi trưởng nhóm) → toast + tải lại.

### 4.9 Mời GVHD – R9 (T305)
- Vào được khi `availableActions` có `REQUEST_ADVISOR`; không thì về R6.
- Bước kiểm trước: `topicSubmitSchema(round.effectiveConfig)` trên dữ liệu đã lưu (chuyển từ `TopicDetail` như mục 4.7). Chưa đạt → hiện danh sách thiếu + nút "Sửa hồ sơ" (nếu `permissions.edit`); vẫn cho chọn GV nhưng bấm gửi sẽ hiện lỗi tại chỗ, không gọi API.
- Danh sách GV (`GET /api/lecturers?roundId={round.id}`, có `q`, phân trang): mã, họ tên, "Đã nhận {activeTopicCount}/{maxTopics}", badge "Đã đủ" khi `isFull` (vẫn chọn được, backend kiểm lúc GV nhận). Không có email.
- Chọn một GV → hộp xác nhận "Gửi đề nghị hướng dẫn tới {fullName}? Các lời mời thành viên đang chờ sẽ bị rút." → `REQUEST_ADVISOR { version, lecturerId }`.
- Thành công: về R6, toast "Đã gửi đề nghị hướng dẫn".
- Rỗng: "Khoa chưa có giảng viên nào trong đợt này."
- Lỗi riêng: `TOPIC_INCOMPLETE` (mục 7), `REGISTRATION_CLOSED`, `GROUP_TOO_SMALL`, `STUDENT_TOPIC_LIMIT` ("Sinh viên {codes} đã đạt số đề tài hoạt động tối đa trong đợt"), `VALIDATION_ERROR` tại `lecturerId`.

### 4.10 Gửi xét duyệt / gửi lại – R10 (T305; luồng API §8.2)
Vào được khi `availableActions` có `SUBMIT_FOR_REVIEW` hoặc `RESUBMIT`. Một trang, 4 bước dọc (mobile cũng đọc tuần tự):
1. **Đủ trường**: `topicSubmitSchema(round.effectiveConfig)` trên dữ liệu đã lưu (chuyển như mục 4.7). Chưa đạt → danh sách thiếu, dừng:
   - `RESUBMIT` (`NEEDS_REVISION`, `permissions.edit` = true): nút "Sửa hồ sơ" → R7.
   - `SUBMIT_FOR_REVIEW` (`HAS_ADVISOR`, không sửa được): "Hồ sơ không còn đạt yêu cầu hiện tại của đợt (có thể cán bộ vừa đổi cấu hình). Vui lòng liên hệ cán bộ khoa." (review RV INFO 12; xem đề xuất cho T600 trong báo cáo).
2. **Kiểm tra trùng lặp**: tải `…/latest`. Nếu `null`, hoặc `isStale`, hoặc `createdAt` cũ hơn 24 giờ (Giả định U3) → **tự chạy "Kiểm tra trước" một lần**; ngoài ra có nút "Kiểm tra lại". Đang chạy: "Đang kiểm tra trùng lặp…" (≤ vài giây).
3. **Kết quả + giải trình** (panel mục 4.13):
   - `NONE`: không có ô giải trình.
   - `REVIEW` (vàng): ô giải trình tùy chọn.
   - `HIGH` (đỏ): ô giải trình bắt buộc, bộ đếm "x/{thresholds.minJustificationWords} từ"; nút gửi chỉ bật khi đủ từ.
   - `ERROR`: "Chưa kiểm tra được" (xám), nút "Thử lại". Vẫn cho bấm gửi vì lúc gửi server kiểm lại bắt buộc.
4. **Gửi**: nút "Gửi xét duyệt" hoặc "Gửi lại" (`ACTION_LABEL`) → `{ action, version, justification? }`.
- Thành công: về R6, toast "Đã gửi hồ sơ lần {submission.seq}".
- Lỗi riêng: `JUSTIFICATION_REQUIRED` → thay panel bằng `details.similarityCheck`, focus ô giải trình, thông điệp "Kết quả kiểm tra vừa thay đổi, hồ sơ nghi trùng cao – cần giải trình tối thiểu N từ"; `SIMILARITY_NOT_CHECKED` → panel ERROR từ `details.similarityCheck` + "Chưa kiểm tra được, vui lòng thử lại"; `TOPIC_INCOMPLETE`; `REGISTRATION_CLOSED` (chỉ SUBMIT_FOR_REVIEW); `CONCURRENT_UPDATE`; `INVALID_TRANSITION`; 429 (limiter 30/15 phút ở actions, 10/15 phút ở kiểm tra trước).

### 4.11 Lịch sử, snapshot, so sánh – R11, R12, R13 (T307; SV, GV dùng lại)
- R11: bảng lần gửi (`seq` giảm dần, thời điểm, người gửi, `similarityLevel` theo quy tắc ô mức ở mục 4.13, quyết định + thời điểm hoặc "Chưa xử lý"); chọn 2 lần → "So sánh" (R13). Bên dưới: lịch sử trạng thái (từ → sang bằng `TOPIC_STATUS_LABEL`, thao tác bằng `ACTION_LABEL`, người + vai trò, lý do, thời điểm).
- R12: nội dung `payload` (tên, tóm tắt, mục tiêu, từ khóa, `fieldName`), panel FR06 (`similarityCheck`, kèm `justification`), quyết định (`decision`). Nút "So sánh với lần trước" khi `seq > 1`.
- R13: `?from=&to=` (mặc định lần trước và lần mới nhất). Hiện cờ `changes` (trường nào đổi), từ khóa thêm/bớt; khác biệt chi tiết trong văn bản do frontend tính từ 2 `payload` (so theo từ, không thêm thư viện – xem Câu hỏi 4 trong báo cáo). Desktop: 2 cột; mobile: xếp chồng, cũ trên mới dưới.
- Rỗng: R11 không có lần gửi → "Hồ sơ chưa được gửi xét duyệt lần nào." Lịch sử trạng thái rỗng → "Chưa có thay đổi trạng thái."
- Quyền: GV **được đề nghị** (chưa là GVHD) không xem được (API §8.4) → ẩn link "Lịch sử" (mục 5.3); gõ URL → 403 tại chỗ.
- Lỗi riêng: `from = to` hoặc `seq` không tồn tại → 400/404 tại chỗ "Lần gửi không tồn tại".

### 4.12 Lời mời – R14 (T305)
- Tab theo `status`: Đang chờ (mặc định), Đã chấp nhận, Đã từ chối, Đã rút (`REQUEST_STATUS_LABEL`).
- Thẻ: mã + tên đề tài, đợt, trưởng nhóm (mã, họ tên), số thành viên, ngày mời. Không có tóm tắt (API §5.3).
- Nút (chỉ tab Đang chờ): "Chấp nhận" (xác nhận: "Bạn sẽ trở thành thành viên đề tài {code}") và "Từ chối" (xác nhận).
- Thành công chấp nhận → chuyển `/de-tai/{topicId}`. Từ chối → dòng rời tab Đang chờ.
- Rỗng: "Bạn không có lời mời nào đang chờ."
- Lỗi riêng: `INVITATION_CLOSED` → toast + tải lại danh sách; `GROUP_FULL`; `STUDENT_TOPIC_LIMIT`.

### 4.13 Panel kết quả kiểm tra trùng lặp (thành phần dùng chung: R7, R10, R6, R12, R17)
- Đầu panel: mức hồ sơ (`SIMILARITY_LEVEL_LABEL`; màu: không cảnh báo = xanh lá nhạt, Cần xem xét = vàng, Nghi trùng cao = đỏ, `status: ERROR` = xám "Chưa kiểm tra được"); thời điểm kiểm; `isStale` nếu có.
- **Không bao giờ** hiện "Không trùng"/"Không tương tự" khi `status = ERROR` hoặc `level = null` (FR06, CLAUDE.md quy tắc 5).
- **Quy tắc ô mức trùng lặp** (thành phần `SimilarityBadge`, T303; áp dụng **mọi** nơi hiện một mức, không viết riêng từng màn):
  - Có mức: `SIMILARITY_LEVEL_LABEL[level]` + màu như trên.
  - Danh sách đề tài (R4, R16 – `latestSimilarityLevel: null`): "—". Danh sách không phân biệt "chưa kiểm" với "kiểm lỗi", nên không được đoán (xem quyết định Q1 trong báo cáo).
  - Gắn với một lần kiểm/lần gửi cụ thể (R6 `latestSimilarity`, R11 `similarityLevel`, R12, R17): `level: null` hoặc `status: ERROR` → "Chưa kiểm tra được" (xám). Không có lần kiểm nào (`latestSimilarity: null`) → "Chưa kiểm tra" (xám). Từ GĐ6 (G5) lần gửi mang cờ "chưa kiểm tra" cũng rơi vào ô "Chưa kiểm tra được".
- Top 5 (`matches`): dòng đầy đủ → mã, tên, năm học, lĩnh vực, trạng thái, điểm tên, điểm nội dung (dạng %), mức, từ khóa trùng (`matchedKeywords`); dòng `hidden: true` → chỉ `note` + 2 điểm + mức. Cán bộ thấy đủ (API §7.2 do server ẩn/hiện, UI chỉ hiển thị).
- Chân panel (thu gọn mặc định): `algorithmVersion`, `corpusSize`, ngưỡng (`thresholds`).
- `justification` (nếu có): hộp "Giải trình của nhóm".
- Không có kết quả (`similarityCheck: null`): "Chưa kiểm tra lần nào."

### 4.14 Đề nghị hướng dẫn – R15 (T306, cả GV và cán bộ)
- Tab theo `status` (mặc định Chờ phản hồi). Gom theo đợt (`topic.round`).
- GV: đầu mỗi nhóm đợt hiện hạn mức của mình "Đã nhận {activeTopicCount}/{maxTopics}" (gọi `GET /api/lecturers?roundId=&q={user.code}` mỗi đợt một lần, lấy dòng `id = user.id`).
- Thẻ: mã + tên đề tài, trạng thái đề tài, "Chờ {pendingDays} ngày" (≥ `advisorReminderDays` thì tô cam – chỉ trang trí), nút "Xem hồ sơ" → R6.
- Nút GV (chỉ với đề nghị `PENDING`): lấy từ `availableActions(topic.status, 'LECTURER')` của shared (Ngoại lệ 1, mục 5.3):
  - "Nhận hướng dẫn": hộp xác nhận hiện hạn mức; `isFull` → cảnh báo "Bạn đã đủ hạn mức, hệ thống sẽ từ chối" (vẫn cho bấm).
  - "Từ chối": hộp thoại có ô lý do (`reasonSchema`, 5–2000 ký tự, bắt buộc).
  - Gửi `{ action, version: topic.version }`.
- Cán bộ: chỉ đọc, thêm cột GV (`lecturer.fullName`), lọc theo đợt (`roundId`). Đề nghị chờ lâu nhận ra bằng cột "Chờ {pendingDays} ngày" tô cam.
- **Thứ tự**: hiển thị đúng thứ tự server trả, **không** sắp phía client (danh sách phân trang ở server, sắp trong một trang là sai). API §6 chưa định nghĩa thứ tự của `GET /api/advisor-requests`; đề xuất T210 chốt mặc định `createdAt ASC, id ASC` (cũ nhất trước, ổn định khi phân trang), xem báo cáo. Khi T210 chốt như vậy, đề nghị chờ lâu tự nằm đầu mà UI không phải đổi.
- Rỗng: GV "Không có đề nghị nào đang chờ bạn." Cán bộ "Không có đề nghị nào."
- Lỗi riêng: `LECTURER_QUOTA_EXCEEDED` → hộp lỗi + tải lại hạn mức; `INVALID_TRANSITION` (nhóm đã rút) → toast "Đề nghị không còn hiệu lực" + tải lại; `CONCURRENT_UPDATE` → toast + tải lại.

### 4.15 Hàng chờ xét duyệt – R16 (T307)
- Mặc định `status=UNDER_REVIEW&sort=updatedAt_asc` (gửi trước làm trước). Lọc: đợt, lĩnh vực, `q`.
- Cột: mã, tên, đợt, trưởng nhóm, số thành viên, GVHD, **"Gửi lúc"** (`latestSubmission.createdAt`) + lần gửi (`seq`), mức trùng lặp (`latestSimilarityLevel`), hạn xét duyệt (`round.reviewDeadline`, tô đỏ nếu đã qua – trang trí). Bấm → R17.
- Ghi chú dưới bảng: "Thứ tự gần đúng theo thời điểm gửi" (hạn chế đã chấp nhận ở API §9.1).
- Rỗng: "Không có hồ sơ nào chờ xét duyệt."

### 4.16 Màn xét duyệt – R17 (T307; FR07, FR17)
- Tải: `GET /api/topics/:id` → lấy `latestSubmission.{id, seq}` → `GET …/submissions/{seq}`; song song `GET …/submissions` (số lần gửi) và, khi `seq > 1`, `GET …/submissions/{seq-1}` (khóa `['submission', id, seq-1]`) để lấy `decision.reason` của lần trước. Item của `GET …/submissions` không có `reason` (API §8.4).
- Bố cục desktop 2 cột: trái = nội dung snapshot lần gửi mới nhất (`payload`) + thông tin nhóm, GVHD; phải = panel FR06 đầy đủ + giải trình (mục 4.13) + khối quyết định. Mobile: 1 cột theo thứ tự nội dung → FR06 → quyết định (thanh nút dính đáy).
- Đầu trang: lần gửi {seq}, gửi lúc, hạn xét duyệt (chỉ hiển thị, không chặn – G2). `seq > 1`: link "So sánh với lần gửi trước" → R13 `?from={seq-1}&to={seq}` và hộp "Quyết định lần trước": `ACTION_LABEL[decision.action]`, `decision.reason`, người, thời điểm (từ `GET …/submissions/{seq-1}`).
- Khối quyết định: chỉ hiện khi `latestSubmission.decision === null` và `availableActions` có action tương ứng:
  - "Duyệt" (`APPROVE`): hộp xác nhận.
  - "Yêu cầu chỉnh sửa" (`REQUEST_REVISION`), "Từ chối" (`REJECT`, kiểu nút nguy hiểm, xác nhận 2 bước): ô lý do bắt buộc (`reasonSchema`).
  - Gửi `{ action, version, submissionId: latestSubmission.id, reason? }`.
- Đã có quyết định: hiện quyết định (người, thời điểm, lý do), không có nút.
- Thành công: toast theo câu cố định (không ghép `ACTION_LABEL` vào giữa câu): `APPROVE` → "Đã duyệt hồ sơ {code}"; `REQUEST_REVISION` → "Đã yêu cầu chỉnh sửa hồ sơ {code}"; `REJECT` → "Đã từ chối hồ sơ {code}". Về R16 (giữ bộ lọc).
- Lỗi riêng: `STALE_SUBMISSION` → "Hồ sơ vừa được gửi lần mới hoặc đã được xử lý" + tải lại cả màn; `CONCURRENT_UPDATE`, `INVALID_TRANSITION` → tải lại; `VALIDATION_ERROR` tại `reason`.

### 4.17 Tài khoản – R18, R19, R20 (T304; API §3.1)
- **R18 danh sách**: lọc `role` (cán bộ chỉ GV/SV), `facultyId` (cán bộ chỉ khoa trong `staffFacultyIds`; tên khoa lấy từ `GET /api/faculties`), `classId`, `isLocked`, `q`. Cột: mã, họ tên, email, vai trò, khoa, lớp, trạng thái (Hoạt động/Đã khóa, "Chờ đổi mật khẩu" nếu `mustChangePassword`). Nút "Tạo tài khoản", "Nhập CSV". Rỗng: "Chưa có tài khoản nào" / "Không có tài khoản phù hợp".
- **R19 tạo** (`userCreateSchema`): `code`, `email`, `fullName`, `role` (ADMIN: 4 vai trò; cán bộ: GV/SV), `facultyId` (ẩn khi ô `role` đang chọn là ADMIN, tức tài khoản đang tạo là quản trị – API §3.2; người tạo là cán bộ thì chỉ chọn khoa trong phạm vi), `classId` (khi STUDENT; chọn ngành của khoa → lớp `isActive`), `staffFacultyIds` (khi STAFF, chọn nhiều). Thành công → hộp **Mật khẩu tạm** (mục 4.20) rồi chuyển R20.
- **R20 chi tiết**: thông tin + form sửa (`userUpdateSchema`: `email`, `fullName`, `classId`; `facultyId` chỉ ADMIN). Nút: "Khóa"/"Mở khóa" (xác nhận; khóa sẽ đăng xuất mọi phiên), "Đặt lại mật khẩu" (xác nhận → hộp Mật khẩu tạm). Ẩn 3 nút này khi xem chính mình (API §3.1 trả 403). Khối "Phạm vi khoa" (chỉ ADMIN, chỉ khi user là STAFF): chọn nhiều khoa, **điền sẵn** `staffFacultyIds`, cảnh báo "Lưu sẽ thay toàn bộ phạm vi" → `PUT …/staff-scopes { facultyIds }`.
- Lỗi riêng: `DUPLICATE` → lỗi tại `code`/`email` từ `details`; `VALIDATION_ERROR` tại trường danh mục ngừng dùng; 429 (tạo/reset 30 lần/15 phút).

### 4.18 Nhập CSV – R21 (T304; API §3.2)
1. **Chọn file**: khoa (`facultyId`, cán bộ chỉ trong phạm vi), file `.csv`. Kiểm client trước upload: ≤ `USER_IMPORT_MAX_BYTES`. Nút "Tải file mẫu" (tạo bằng `toCsv` với `USER_IMPORT_HEADERS`, có BOM). Ghi chú "Tối đa {USER_IMPORT_MAX_ROWS} dòng". Nút "Xem trước".
2. **Xem trước**: `validCount`, `errorCount` (tổng thật); bảng lỗi (dòng, trường – `field: null` → "Cả dòng", thông điệp); bảng xem trước ≤ 100 dòng. `errorCount > 0` → nút xác nhận tắt, thông điệp "Sửa file rồi tải lên lại". Ghi "Chỉ hiện 100 lỗi/dòng đầu" khi tổng > 100.
3. **Xác nhận**: gửi **lại cùng file** → thành công: "Đã tạo {createdCount} tài khoản"; **tự tải ngay** file CSV mật khẩu tạm (`credentials` → `toCsv`), kèm nút "Tải lại file" và cảnh báo đỏ "Mật khẩu tạm chỉ có ở đây. Rời trang là mất." Chặn rời trang (`beforeunload` + `useBlocker`, mục 1.1) cho đến khi người dùng bấm "Tôi đã lưu file".
- Lỗi riêng: `VALIDATION_ERROR` với `details.file` → lỗi tại ô file; 413 `PAYLOAD_TOO_LARGE` → ô file; `IMPORT_HAS_ERRORS` → quay lại bước 2 với `details` mới; `IMPORT_IN_PROGRESS`; `DUPLICATE` (va chạm lúc ghi) → "Có tài khoản vừa được tạo trùng, hãy xem trước lại"; 429 (10 lần/15 phút).
- Mất kết nối ở bước 3: thông báo "Không rõ kết quả. Kiểm tra danh sách tài khoản; nếu đã tạo, đặt lại mật khẩu từng người." (rủi ro đã chấp nhận ở API §3.2).

### 4.19 Danh mục – R22 (T304; API §4.1, API §4.2)
- Tab: Khoa (ADMIN), Ngành (lọc theo khoa), Lớp (lọc theo ngành), Lĩnh vực, Từ đồng nghĩa (chỉ cán bộ).
- Danh sách không phân trang; công tắc "Hiện cả mục ngừng dùng" (`includeInactive`). Mục ngừng dùng: chữ mờ + badge "Ngừng dùng".
- Thêm: form ngắn (`code`, `name`; lớp chỉ `majorId` + `code`; từ đồng nghĩa `term`, `canonical`). Sửa: chỉ `name` (mã không đổi) với khoa, ngành, lĩnh vực. **Lớp không có form sửa** (model `Class` không có `name`, `catalogUpdateSchema` của lớp chỉ có `isActive` – API §4.2): chỉ có "Ngừng dùng"/"Dùng lại". "Ngừng dùng"/"Dùng lại" thay cho xóa (xác nhận: "Bản ghi cũ vẫn giữ, không chọn được cho bản ghi mới"). Từ đồng nghĩa có "Xóa" (xác nhận).
- Cán bộ: nút sửa ngành/lớp chỉ hiện với khoa trong `staffFacultyIds` (gợi ý; backend kiểm).
- Rỗng: "Chưa có {loại} nào."
- Lỗi riêng: `DUPLICATE` tại `code`.

### 4.20 Hộp "Mật khẩu tạm" (dùng chung R19, R20)
Hiện mật khẩu một lần, nút "Sao chép", cảnh báo "Mật khẩu chỉ hiện một lần. Người dùng phải đổi mật khẩu ở lần đăng nhập đầu." Không lưu vào cache TanStack Query (dùng state cục bộ của hộp, xóa khi đóng).

### 4.21 Đợt – R23, R24 (T304; API §4.3)
- R23: lọc khoa (trong phạm vi), năm học. Cột: tên, năm học, 4 mốc, badge "Đang mở đăng ký" (`registrationOpen`). Rỗng: "Chưa có đợt nào. Tạo đợt mới."
- R24 form (`roundCreateSchema` / `roundUpdateSchema`): `facultyId` (chỉ khi tạo), `name`, `academicYear`, 4 mốc `regOpenAt < regCloseAt < reviewDeadline < endAt` (mục 1.4), khối "Cấu hình tham số" theo bảng `roundConfigSchema`: số thành viên min–max, đề tài/SV, hạn mức GV, số ngày nhắc, số từ tóm tắt, số từ khóa min–max, dung lượng file, loại file, 4 ngưỡng tương tự + số từ giải trình. Ô điền sẵn: khi tạo = `DEFAULT_ROUND_CONFIG`; khi sửa = `round.effectiveConfig`. Ô có giá trị bằng `DEFAULT_ROUND_CONFIG` ghi chú "(mặc định)" – chỉ để đọc.
- **Luôn gửi đủ `config`** (mọi khóa của `roundConfigSchema`) khi tạo và khi sửa (Giả định U4 – đã đổi ở vòng sửa 1). Hệ quả: tham số được **chốt theo đợt**; đổi `DEFAULT_ROUND_CONFIG` trong code về sau chỉ ảnh hưởng đợt tạo mới, không đổi ngầm đợt đang chạy; mọi thay đổi tham số của đợt đều qua `PATCH` và có AuditLog `ROUND_UPDATE`.
- Sửa đợt: ghi chú "Thay đổi áp dụng từ lần kiểm tra kế tiếp, không áp dụng lại cho dữ liệu cũ". Khi **tăng** `minSummaryWords` hoặc `minKeywords`, hoặc **giảm** `maxKeywords`, so với giá trị hiện tại (các khóa mà `topicSubmitSchema` dùng, API §5.2): cảnh báo tại ô "Đề tài đang chờ GVHD hoặc đã có GVHD có thể không còn đủ điều kiện gửi và không tự sửa được" (review RV INFO 12). Chỉ là cảnh báo, vẫn cho lưu.
- Lỗi riêng: `VALIDATION_ERROR` có khóa lồng (`config.similarity.titleHigh`) → gắn đúng ô; lỗi thứ tự mốc tại ô sai đầu tiên.

### 4.22 Kho đề tài – R25 (T308; FR08, API §9.2)
- Lọc: năm học, lĩnh vực, kết quả (Xuất sắc/Tốt/Đạt), `q`. Thẻ: mã, tên, `summaryExcerpt`, lĩnh vực, năm học, kết quả. Bấm → `/kho/:code` (tóm tắt đầy đủ).
- Chỉ hiện đúng các trường API trả; không có thành viên, GVHD, file, nhận xét.
- Rỗng: "Kho chưa có đề tài nào đã đóng đạt." (ở GĐ2–3 kho luôn rỗng cho tới khi có đề tài đóng – GĐ4).
- Lỗi riêng: `/kho/:code` 404 → "Đề tài không có trong kho".

---

## 5. Hành động theo trạng thái

### 5.1 Nút chuyển trạng thái (`availableActions`, API §5.1, API §10)
Nhãn nút = `ACTION_LABEL[action]`. Nút chỉ hiện khi action có trong `topic.availableActions`.

| Action | Trạng thái nguồn | Ai thấy (server lọc) | Màn | UI khi bấm | Body |
|---|---|---|---|---|---|
| `REQUEST_ADVISOR` | DRAFT | Trưởng nhóm | R6 | Chuyển R9 | `version`, `lecturerId` |
| `WITHDRAW_ADVISOR_REQUEST` | WAITING_ADVISOR | Trưởng nhóm | R6 | Hộp xác nhận "Rút đề nghị? Đề tài về Nháp" | `version` |
| `ACCEPT_ADVISING` | WAITING_ADVISOR | GV được đề nghị | R6, R15 | Hộp xác nhận + hạn mức | `version` |
| `DECLINE_ADVISING` | WAITING_ADVISOR | GV được đề nghị | R6, R15 | Hộp lý do (bắt buộc) | `version`, `reason` |
| `SUBMIT_FOR_REVIEW` | HAS_ADVISOR | Trưởng nhóm | R6 | Chuyển R10 | `version`, `justification?` |
| `RESUBMIT` | NEEDS_REVISION | Trưởng nhóm | R6 | Chuyển R10 | `version`, `justification?` |
| `APPROVE` | UNDER_REVIEW | Cán bộ trong phạm vi | R17 (R6 có link "Xét duyệt" → R17) | Hộp xác nhận | `version`, `submissionId` |
| `REQUEST_REVISION` | UNDER_REVIEW | Cán bộ trong phạm vi | R17 | Hộp lý do | `version`, `submissionId`, `reason` |
| `REJECT` | UNDER_REVIEW | Cán bộ trong phạm vi | R17 | Hộp lý do + xác nhận 2 bước | `version`, `submissionId`, `reason` |

- Trên R6, cán bộ thấy một nút "Xét duyệt" (→ R17) thay cho 3 nút quyết định khi `availableActions` có bất kỳ action nào trong 3 action trên.
- Action GĐ4+ (`CANCEL`, `REQUEST_CLOSE`, `RETURN_TO_ADVISOR`, `CONFIRM_CLOSE`, `CLOSE_EXPIRED`) không có trong `availableActions` GĐ2 (API §5.1). Nếu xuất hiện, UI **bỏ qua** (không có hộp thoại) cho tới T406/T607.
- Không có nút nào ngoài bảng này đổi trạng thái đề tài. Không có đường đi ngoài `TRANSITIONS`.

### 5.2 Nút không đổi trạng thái (`permissions`, API §5.1)
| Quyền | Nút | Màn |
|---|---|---|
| `edit` | "Sửa hồ sơ" | R6 → R7 |
| `invite` | Form "Mời thành viên", "Hủy lời mời" | R8 |
| `transferLeader` | "Đổi trưởng nhóm" | R8 |
| `checkSimilarity` | "Kiểm tra trước" | R7, R6 (panel trùng lặp) |

### 5.3 Ngoại lệ (UI tự suy ra, có lý do)
1. **R15 – nút Nhận/Từ chối trên danh sách đề nghị**: item danh sách không có `availableActions` (API §6). Dùng `availableActions(topic.status, 'LECTURER')` của shared cho đề nghị `PENDING`. Đúng quan hệ vì `GET /api/advisor-requests` của GV chỉ trả đề nghị gửi tới mình. Backend vẫn kiểm lại.
2. **Ẩn link "Lịch sử" với GV chưa là GVHD**: API §8.4 không cho `isRequestedLecturer` đọc. `TopicDetail` không có cờ quan hệ, nên UI ẩn khi `user.role === 'LECTURER'` và `topic.advisor?.id !== user.id`. Cả hai reviewer chấp nhận cho GĐ3. Đã đề xuất T209 thêm `permissions.viewHistory` vào `TopicDetail` (xem báo cáo, mục "Đề xuất đổi hợp đồng"); khi API §5.1 có trường này, T306 đổi R6 sang dùng nó và bỏ ngoại lệ này.

---

## 6. Trạng thái đang tải / rỗng / lỗi (quy ước chung)

| Tình huống | Hiển thị |
|---|---|
| Tải lần đầu (danh sách) | Khung xương 5 dòng/thẻ, giữ header và bộ lọc |
| Tải lần đầu (chi tiết/form) | Khung xương theo bố cục, nút hành động chưa hiện |
| Tải lại ngầm (refetch, đổi trang) | Giữ dữ liệu cũ, thanh tiến trình mảnh trên đầu vùng nội dung |
| Request > 5 s | Thêm dòng "Máy chủ đang khởi động, vui lòng chờ…" (Render ngủ, NFR10) |
| Đang gửi | Nút disabled + spinner + "Đang xử lý…"; các nút hành động khác của cùng đề tài cũng disabled; chặn gửi đôi |
| Rỗng | Biểu tượng + câu tiếng Việt cụ thể từng màn (mục 4) + nút hành động gợi ý nếu có |
| Lỗi tải (GET) | Hộp lỗi tại vùng nội dung: thông điệp theo mục 7 + nút "Thử lại"; 403/404 hiện trang tại chỗ |
| Lỗi gửi (mutation) | Theo mục 7: lỗi trường → dưới ô; lỗi cấp form → hộp đỏ trên nút gửi; lỗi khác → toast. **Không xóa dữ liệu người dùng đã nhập** |
| Mất mạng | "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại." + "Thử lại" |

- TanStack Query: GET tự thử lại tối đa 2 lần **chỉ** với lỗi mạng và 503; không thử lại 4xx. Mutation không bao giờ tự thử lại.
- Sau mutation thành công: invalidate theo mục 9.2.

---

## 7. Ánh xạ mã lỗi API → thông báo và hành vi UI

Quy tắc chung:
- **Thông điệp**: hiện `error.message` của server (đã là tiếng Việt, API §2). Cột "Thông điệp" dưới đây là thông điệp UI dùng **khi thiếu** `message` hoặc khi UI cần nói cụ thể hơn.
- **`details` dạng map trường** (API §1.3a, cho `VALIDATION_ERROR`, `TOPIC_INCOMPLETE`, `DUPLICATE`): khóa có trong form → `setError(khóa)` (RHF hiểu đường dẫn chấm, ví dụ `keywords.2`, `config.similarity.titleHigh`); khóa `_` hoặc khóa không có trong form → danh sách lỗi cấp form. Focus ô lỗi đầu tiên.
- Một bộ xử lý lỗi dùng chung ở API client trả về đối tượng `{ status, code, message, details, retryAfter, requestId }`; từng màn chỉ khai báo các mã "Lỗi riêng" của mình.
- Gắn lỗi vào form làm **một lần** trong helper `applyServerErrors(error, setError, fieldNames)` (T301, có unit test): khóa có trong `fieldNames` → `setError`, còn lại → lỗi cấp form; focus ô lỗi đầu tiên. Tắt nút đến hết `Retry-After` làm một lần trong hook `useCooldown()` (T301): trả `{ active, remaining, message, start }`; màn gọi `start(err.retryAfter)` trong `onError` và đặt `disabled={active}`, hiện `message` ("Vui lòng thử lại sau N phút"). Dùng `start()` thay cho tham số để hai lần 429 liên tiếp cùng số giây vẫn khóa lại (quyết định T301 #4, `kien-truc-su` duyệt). Không màn nào tự viết lại hai việc này.

| HTTP | `code` | Thông điệp UI (khi thiếu `message`) | Hành vi UI |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | Dữ liệu không hợp lệ | Gắn lỗi theo trường từ `details`; `details.file` → ô file |
| 400 | `TOPIC_INCOMPLETE` | Hồ sơ chưa đủ thông tin bắt buộc | Hộp cảnh báo liệt kê trường thiếu (tên trường tiếng Việt: Tên đề tài, Tóm tắt, Mục tiêu, Từ khóa, Lĩnh vực) + nút "Sửa hồ sơ" (khi `permissions.edit`) → R7 kèm `details` để `setError` từng ô |
| 400 | `JUSTIFICATION_REQUIRED` | Hồ sơ nghi trùng cao, cần giải trình | Hiện panel từ `details.similarityCheck`, ô giải trình bắt buộc, focus (R10) |
| 400 | `WRONG_PASSWORD` / `SAME_PASSWORD` | (server) | Lỗi tại `currentPassword` / `newPassword` |
| 400 | `REASON_REQUIRED` | Thao tác này bắt buộc nhập lý do | Lỗi tại ô `reason` |
| 400 | `IMPORT_HAS_ERRORS` | File có dòng lỗi, chưa ghi dữ liệu nào | Quay lại bước xem trước với `details` (R21) |
| 400 | `BAD_JSON`, `BAD_REQUEST`, `UNKNOWN_ACTION` | Yêu cầu không hợp lệ | Toast; đây là lỗi lập trình, không có hành động cho người dùng |
| 401 | `UNAUTHORIZED` | Phiên đăng nhập không hợp lệ | Refresh 1 lần rồi gửi lại; thất bại → về đăng nhập (mục 1.1). Ở R1: lỗi cấp form |
| 403 | `PASSWORD_CHANGE_REQUIRED` | Bạn cần đổi mật khẩu trước khi tiếp tục | Chuyển `/doi-mat-khau` (chế độ bắt buộc) |
| 403 | `ACCOUNT_LOCKED` | Tài khoản đã bị khóa | R1: lỗi cấp form. Nơi khác (ít gặp) → đăng xuất + về R1 |
| 403 | `FORBIDDEN` | Bạn không có quyền thực hiện thao tác này | Khi tải: trang 403 tại chỗ. Khi gửi: toast + invalidate dữ liệu của màn (quyền có thể vừa đổi, ví dụ đã bị đổi trưởng nhóm) |
| 404 | `NOT_FOUND` | Không tìm thấy | Khi tải: trang 404 tại chỗ. Khi gửi: toast + invalidate |
| 409 | `CONCURRENT_UPDATE` | Đề tài vừa được người khác cập nhật, vui lòng tải lại | Giữ dữ liệu form; invalidate `['topic', id]`; hộp "Tải lại" (form soạn hồ sơ: 2 lựa chọn ở mục 4.7). Không tự gửi lại |
| 409 | `INVALID_TRANSITION` | Không thể thực hiện thao tác này khi đề tài đang ở trạng thái hiện tại | Toast + tải lại đề tài (nút sẽ cập nhật theo `availableActions` mới); nếu đang ở R9/R10 → về R6 |
| 409 | `INVITATION_CLOSED` | Lời mời không còn hiệu lực | Toast; invalidate danh sách lời mời và đề tài; dòng lời mời tự đổi trạng thái/biến mất |
| 409 | `TOPIC_NOT_EDITABLE` | Chỉ sửa được hồ sơ ở trạng thái Nháp hoặc Cần chỉnh sửa | Toast; tải lại; rời R7 về R6 |
| 409 | `REGISTRATION_CLOSED` | Ngoài thời gian đăng ký của đợt | Hộp cảnh báo tại chỗ cạnh nút gửi; giữ trên màn |
| 409 | `GROUP_TOO_SMALL` / `GROUP_FULL` | (server, có số N) | Hộp cảnh báo tại chỗ; ở R8 gắn vào `inviteeCode` |
| 409 | `STUDENT_TOPIC_LIMIT` | Sinh viên đã đạt số đề tài hoạt động tối đa trong đợt | Hộp cảnh báo + danh sách `details.codes` |
| 409 | `LECTURER_QUOTA_EXCEEDED` | Giảng viên đã đủ hạn mức hướng dẫn trong đợt | Hộp lỗi; tải lại hạn mức (R15) |
| 409 | `ALREADY_MEMBER` | Sinh viên đã là thành viên hoặc đã được mời | Lỗi tại `inviteeCode` |
| 409 | `SIMILARITY_NOT_CHECKED` | Chưa kiểm tra được trùng lặp, vui lòng thử lại | Panel trạng thái ERROR từ `details.similarityCheck` + "Thử lại"; **không** hiện "Không trùng" |
| 409 | `STALE_SUBMISSION` | Quyết định phải gắn với lần gửi mới nhất chưa được xử lý | Tải lại toàn bộ R17 |
| 409 | `DUPLICATE` | Dữ liệu đã tồn tại | Lỗi tại trường theo `details` (`code`, `email`); không có `details` → lỗi cấp form |
| 409 | `IMPORT_IN_PROGRESS` | Đang có lượt nhập khác, vui lòng thử lại sau | Hộp cảnh báo, giữ file đã chọn |
| 413 | `PAYLOAD_TOO_LARGE` | File vượt quá dung lượng cho phép | Lỗi tại ô file; không có file → toast |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Định dạng dữ liệu gửi lên không được hỗ trợ | Toast |
| 429 | `RATE_LIMITED` | Thao tác quá nhiều lần, vui lòng thử lại sau | Đọc header `Retry-After` (giây) → "Vui lòng thử lại sau {ceil(giây/60)} phút"; tắt nút đó đến hết thời gian. Không có header → chỉ thông điệp |
| 429 | `TEMP_LOCKED` | Đăng nhập sai quá nhiều lần, vui lòng thử lại sau | R1: lỗi cấp form |
| 500 | `INTERNAL` | Lỗi hệ thống, vui lòng thử lại | Toast kèm "Mã lỗi: {error.requestId}" (để báo hỗ trợ); giữ dữ liệu form |
| 503 | `SERVICE_BUSY` | Hệ thống đang bận, vui lòng thử lại | Toast + nút "Thử lại"; giữ dữ liệu form. Mã do T206 thêm vào API §2 (bảng việc T206) |
| – | (mất mạng, không có response) | Không kết nối được máy chủ | Như mục 6 |
| khác | mã chưa biết | `message` của server, hoặc "Đã có lỗi xảy ra" | Toast |

---

## 8. Responsive từ 360 px (NFR07)

- Thiết kế **mobile trước**; mốc Tailwind mặc định: dưới `sm` (640 px) là mobile, từ `lg` (1024 px) là desktop 2 cột.
- Không có cuộn ngang ở 360 px với mọi màn, kể cả R13 (dưới `lg` hai bản xếp chồng).
- **Điều hướng**: < `lg` → header gọn + nút menu mở ngăn kéo; ≥ `lg` → thanh bên trái.
- **Bảng → thẻ**: mọi bảng danh sách dưới `sm` hiển thị thành thẻ (mã + trạng thái dòng 1, tên dòng 2, 2–3 thông tin phụ dòng 3). Không ẩn cột chứa thông tin cần cho quyết định (trạng thái, mức trùng lặp, gửi lúc).
- **Bộ lọc**: dưới `sm` gom vào nút "Lọc" mở ngăn kéo từ dưới, hiện số bộ lọc đang bật.
- **Form**: 1 cột dưới `sm`; nhãn trên ô; cỡ chữ ô nhập ≥ 16 px (tránh iOS tự phóng to); lỗi ngay dưới ô (NFR07).
- **Thanh hành động** của R6, R10, R17: dưới `sm` dính đáy màn hình, tối đa 2 nút hiện, còn lại vào menu "Thêm"; nút nguy hiểm (Từ chối, Rút đề nghị) không đặt cạnh nút chính.
- **Hộp thoại và ngăn kéo**: dưới `sm` toàn màn hình, nút xác nhận ở đáy. Dùng phần tử `<dialog>` gốc mở bằng `showModal()` (giữ focus bên trong, Esc để đóng, nền không tương tác được), không thêm thư viện. Một thành phần `Dialog` cơ sở (T303) cho mọi hộp thoại và ngăn kéo; đóng thì trả focus về nút đã mở.
- Vùng chạm ≥ 44×44 px. Chuỗi dài (mã đề tài, email, từ khóa) phải xuống dòng (`break-words`).
- Panel trùng lặp: mỗi kết quả là một thẻ; 2 điểm hiển thị dạng thanh ngang có số %.
- Kiểm chứng: Playwright chạy viewport 360×740 và 1280×800 (T309, T702).

---

## 9. Thành phần dùng chung và khóa cache

### 9.1 Thành phần và chủ cố định (đặt ở `apps/web/src`)
Mỗi thành phần, hook, route có **đúng một** task chủ. Không có quy tắc "task nào làm trước thì làm". Task khác chỉ **dùng** hoặc **gắn thêm** phần của mình vào chỗ đã được chủ chừa sẵn (ví dụ thêm một action vào `TopicActionBar`), không viết bản thứ hai.

| Thành phần / route | Dùng ở | Chủ |
|---|---|---|
| API client (FormData, refresh tuần tự cấp module), bộ chuẩn hóa lỗi (mục 7), module auth (`user` + token, `subscribe`), `QueryClient` (quy tắc thử lại mục 6), data router gốc | Mọi màn | T301 |
| `applyServerErrors` (details → `setError`, focus ô đầu), `useCooldown` (`Retry-After`) | Mọi form | T301 |
| `Toast`, `FormField` (nhãn + ô + lỗi dưới ô, NFR07), màn tải toàn trang | Mọi màn (T302 dùng đầu tiên) | T301 |
| `RequireAuth`, `RequireRole`, layout + menu theo vai trò, trang 403/404 | Mọi màn | T303 |
| `ErrorState` (403/404/lỗi tải tại chỗ + "Thử lại"), `EmptyState`, `Skeleton` | Mọi màn | T303 |
| `Dialog` cơ sở (`<dialog>`, mục 8), `ConfirmDialog`, `ReasonDialog` (`reasonSchema`) | R6, R8, R14, R15, R17, R20 | T303 |
| `DataTable` (bảng ↔ thẻ), `Pagination`, `FilterBar`, `useUrlState` (query string + debounce `q`) | R4, R11, R14–R16, R18, R22, R23, R25 | T303 |
| `StatusBadge`, `SimilarityBadge` (quy tắc ô mức, mục 4.13), `DateTime` | Nhiều màn | T303 |
| R4 (khung, bộ lọc, cả nút "Tạo đề tài" và banner lời mời của SV), R25 | – | T308 |
| R6 khung + `TopicActionBar` (mục 5) + action GV (`ACCEPT_ADVISING`, `DECLINE_ADVISING`); R15 (GV và cán bộ) | – | T306 |
| `SimilarityPanel` (mục 4.13); action SV trên R6 (`REQUEST_ADVISOR`, `WITHDRAW_ADVISOR_REQUEST`, `SUBMIT_FOR_REVIEW`, `RESUBMIT`) + gắn panel vào R6; R5, R7–R10, R14; hàm `TopicDetail` → giá trị form (mục 4.7) | – | T305 |
| R11–R13, R16, R17; nút "Xét duyệt" trên R6 (mục 5.1); hàm diff theo từ (R13) | – | T307 |
| `TemporaryPasswordDialog`, R18–R24 | – | T304 |
| R1, R2 | – | T302 |

**Phụ thuộc giữa task FE suy ra từ bảng trên** (để điều phối viên đối chiếu `BANG_CONG_VIEC.md`):
- T301 → T302 → T303 → {T304, T305, T306, T307, T308}.
- T305 cần T306 (khung R6 + `TopicActionBar`).
- T307 cần T305 (`SimilarityPanel`) và T213 (R16 gọi `GET /api/topics`).
- T308 cần T213 (R4, R25). Banner lời mời gọi API §5.3 (T208) – có sẵn qua chuỗi T213 → T212a → T210 → T208.
- T306 cần T210 (R15, action GV); `GET /api/topics/:id` (T209) có sẵn qua T210 → T208 → T209.
- T305 không còn gọi `GET /api/topics` (R4 đã về T308).
- T309 cần T305–T308.

### 9.2 Khóa query và invalidate (TanStack Query)
- Khóa: `['topics', params]`, `['topic', id]`, `['similarity-latest', id]`, `['submissions', id]`, `['submission', id, seq]`, `['submission-diff', id, from, to]`, `['status-history', id]`, `['invitations', params]`, `['advisor-requests', params]`, `['lecturers', roundId, params]`, `['rounds', params]`, `['round', id]`, `['catalog', loai, params]`, `['users', params]`, `['user', id]`, `['repository', params]`, `['repository-item', code]`. Không có `['me']`: `user` ở module auth (mục 1.1).
- Invalidate theo tiền tố (mặc định của TanStack Query): `['submission', id]` khớp mọi `['submission', id, seq]`.
- Sau thao tác thành công (chỉ `setQueryData` khi response **có đúng** đối tượng đó):
  - `PUT /api/topics/:id` → 200 `{ topic }`: `setQueryData(['topic', id], r.topic)`; invalidate `['similarity-latest', id]` (`isStale` có thể đổi), `['topics']`.
  - `POST …/similarity-checks` ("Kiểm tra trước") → 200 `{ similarityCheck }`, **không có `topic`**: panel đang mở hiện ngay `r.similarityCheck`; invalidate `['similarity-latest', id]`, `['topic', id]` (`latestSimilarity` đổi), `['topics']` (`latestSimilarityLevel`). Không `setQueryData` vào `['similarity-latest', id]`, để không phụ thuộc vị trí trường `isStale` trong response `latest`.
  - `POST …/actions` → 200 `{ topic, … }`: `setQueryData(['topic', id], r.topic)`; invalidate `['topics']`, `['advisor-requests']`, `['lecturers']`, `['status-history', id]`, `['submissions', id]`, `['submission', id]` (quyết định đổi `decision` của lần gửi), `['similarity-latest', id]` (SUBMIT/RESUBMIT tạo lần kiểm mới), `['invitations']` (`REQUEST_ADVISOR` rút các lời mời đang chờ).
  - Lời mời (tạo/hủy/chấp nhận/từ chối), đổi trưởng nhóm: invalidate `['topic', topicId]`, `['invitations']`, `['topics']`.
  - Tài khoản, danh mục, đợt: invalidate khóa danh sách tương ứng + khóa chi tiết.
- Sau **lỗi** có ghi dữ liệu phía server:
  - `JUSTIFICATION_REQUIRED`, `SIMILARITY_NOT_CHECKED` ở `/actions`: server **đã lưu** một lần kiểm mới (API §8.2 bước 4, ngoài transaction) → hiện `details.similarityCheck`; invalidate `['topic', id]`, `['similarity-latest', id]`, `['topics']`.
  - `CONCURRENT_UPDATE`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_TRANSITION`, `INVITATION_CLOSED`, `STALE_SUBMISSION`: invalidate như mục 7.
- Đăng xuất / refresh thất bại: `queryClient.clear()` + xóa module auth.

---

## 10. Giả định

| # | Giả định | Lý do |
|---|---|---|
| U1 | Route dùng tiếng Việt không dấu (`/de-tai`, `/xet-duyet`) | Giao diện toàn tiếng Việt (NFR07); tên biến/hàm vẫn tiếng Anh |
| U2 | Một màn chi tiết đề tài dùng chung 3 vai trò; nội dung theo dữ liệu server trả | `TopicDetail` đã lọc theo người xem (API §5.1); tránh 3 bản sao lệch nhau |
| U3 | Ở R10, kết quả "Kiểm tra trước" cũ hơn **24 giờ** coi là cũ và tự kiểm lại | API §8.2 nói "lần kiểm quá cũ" nhưng không định nghĩa; kho có thể đổi trong ngày; limiter 10/15 phút đủ cho một lần tự chạy |
| U4 | Form đợt **luôn gửi đủ `config`** khi tạo và khi sửa (đổi ở vòng sửa 1) | Đặc tả mục 8: tham số "lưu trong cấu hình đợt"; API §4.3 "không hồi tố". Chỉ gửi khóa khác mặc định thì khi dev đổi `DEFAULT_ROUND_CONFIG` (ngưỡng FR06 sẽ được hiệu chỉnh) mọi đợt đang chạy đổi tham số ngầm, không có AuditLog. Gửi đủ chốt tham số theo đợt; hợp đồng đã cho phép (`roundConfigInputSchema` là partial, gửi đủ vẫn hợp lệ) |
| U5 | Access token chỉ giữ trong bộ nhớ; mỗi lần tải trang gọi refresh | NFR01; cookie httpOnly đã có, không cần lưu token ở `localStorage` |
| U6 | Kho đề tài (R25) làm ở T308 | API §9.2 thuộc GĐ2 (T213) và thuộc FR08 như T308. Mô tả T504 đã bỏ "kho tra cứu công khai" (G3: kho cần đăng nhập) |
| U7 | Mọi thành phần, route có chủ cố định (mục 9.1). R6 + `TopicActionBar` thuộc T306; R4 thuộc T308; R15 (cả phía cán bộ) thuộc T306 | Bỏ cơ chế "task nào làm trước" vì T304–T308 chạy song song sau T303, dễ trùng khi gộp (review FE MAJOR 2). T306 chỉ cần T210, xong trước T305 (cần T212a), nên giữ khung R6. R15 một route một chủ: phía cán bộ chỉ là danh sách chỉ đọc cùng endpoint, thêm cột GV |
| U8 | Không có màn riêng cho cán bộ xem hạn mức GV | Không có FR yêu cầu; R9 (SV) và R15 (GV) đã hiện "Đã nhận x/y" |
| U9 | Thư viện giao diện được duyệt (`apps/web`, ghim chính xác): `lucide-react` 1.70.0 (icon, ISC) và `@fontsource/be-vietnam-pro` 5.3.0 (font tự host, OFL-1.1, thay Inter từ TASK-UI-SEAL – đã duyệt, xem `reviews/TASK-UI-SEAL-font-kien-truc-su-v1.md`). **Bổ sung 2026-11-11 (duyệt có điều kiện):** shadcn/ui (MIT, style new-york, JS) – mã component chép vào `apps/web/src/components/ui/`; thêm `radix-ui`, `class-variance-authority`, `clsx`, `tailwind-merge`, `tw-animate-css` (ghim chính xác). Điều kiện xem `reviews/TASK-UI-SHADCN-kien-truc-su-v1.md`. **Đổi phong cách 2026-11-11 (người dùng chọn trực tiếp, thay điều kiện 2 "phẳng, bo góc nhỏ"):** dashboard hiện đại – thanh bên sáng thu gọn được, thẻ bóng mềm, bo góc rộng; màu Văn Lang chỉ làm điểm nhấn (nút chính, vạch mục menu đang mở, biểu đồ) | Duyệt bởi KTS, xem `reviews/TASK-UI-REDESIGN-kien-truc-su-v1.md` và `reviews/TASK-UI-SHADCN-kien-truc-su-v1.md`. Icon luôn import theo tên và có `aria-hidden` khi trang trí |

## 11. Schema cần thêm ở `packages/shared`
Không có schema mới. UI dùng lại các schema, hằng và nhãn đã liệt kê ở API §11 (T206, T207a, T207b, T208–T213) và `countWords` có sẵn. Nếu frontend cần hàm định dạng thời gian dùng chung với backend (CSV thống kê GĐ5), đề xuất ở T400.

---

## 12. Bổ sung theo đề cương (2026-11-18) – FR28–FR39

Hợp đồng: `design/API_GD7.md` (gọi tắt **GD7 §x**). Mọi quy ước mục 1–9 giữ nguyên (`availableActions`/`permissions` quyết định nút, 4 trạng thái mỗi màn, lỗi theo mục 7, nhãn từ shared). **Desktop là ưu tiên thiết kế** (người dùng chủ yếu dùng máy tính, mốc `lg` 1024 px trở lên dùng bố cục nhiều cột, bảng đầy đủ); dưới `lg` xếp một cột, dưới `sm` bảng thành thẻ, không cuộn ngang ở 360 px (NFR07, mục 8).

### 12.1 Sitemap bổ sung
```
Chung        Hồ sơ cá nhân        /ho-so                         (menu người dùng, mọi vai trò kể cả ADMIN)
Khách        /dang-nhap           nút "Đăng nhập bằng Google" khi providers.google; /dang-nhap/google (nhận kết quả SSO)
SV           Đề tài tuyển SV      /tuyen-sinh, /tuyen-sinh/:topicId
             Đơn ứng tuyển        /don-ung-tuyen
GV           Đề tài tuyển SV      /tuyen-sinh (xem bảng tin), nút "Công bố đề tài" → /de-tai/moi?nguon=gv
             Ứng viên             /de-tai/:id/ung-vien          (GVHD đề tài GV công bố)
             Chấm bảo vệ          /cham-bao-ve, /cham-bao-ve/:assignmentId
Cán bộ       Hội đồng             /hoi-dong, /hoi-dong/moi, /hoi-dong/:id
             Tuyển SV (chỉ đọc)   /tuyen-sinh
Đề tài       Kanban tiến độ       /de-tai/:id/kanban            (tab cạnh "Mốc", ai đọc được mốc đều xem)
Thống kê     nút "Xuất Excel"     /thong-ke
```

### 12.2 Bảng route bổ sung
| # | Route | Vai trò | Màn | Endpoint | Task |
|---|---|---|---|---|---|
| R26 | `/tuyen-sinh` | STUDENT, LECTURER, STAFF | Bảng tin đề tài đang tuyển | `GET /api/recruitments` (GD7 §4.2), `GET /api/rounds`, `GET /api/fields` | DC-14 |
| R27 | `/tuyen-sinh/:topicId` | STUDENT, LECTURER, STAFF | Chi tiết + form ứng tuyển (SV) | `GET /api/recruitments/:topicId`, `POST …/applications`, `POST /api/applications/:id/withdraw` (GD7 §4.3) | DC-14 |
| R28 | `/don-ung-tuyen` | STUDENT | Đơn của tôi | `GET /api/applications`, `POST /api/applications/:id/withdraw` | DC-14 |
| R29 | `/de-tai/:id/ung-vien` | LECTURER, STAFF | Danh sách đơn; duyệt/từ chối; chốt nhóm | `GET /api/topics/:id/applications`, `POST /api/applications/:id/accept|decline`, `POST /api/topics/:id/actions` `FINALIZE_GROUP`/`UNPUBLISH_RECRUITMENT` | DC-13 |
| R5', R7' | `/de-tai/moi?nguon=gv`, `/de-tai/:id/sua` | LECTURER | Tạo/sửa đề tài tuyển (thêm "Yêu cầu ứng viên", "Số SV cần tuyển"); công bố | `POST /api/topics`, `PUT /api/topics/:id`, `POST …/similarity-checks`, `/actions` `PUBLISH_RECRUITMENT` (GD7 §3) | DC-13 |
| R30 | `/hoi-dong` | STAFF | Danh sách hội đồng | `GET /api/councils` (GD7 §6.5) | DC-15 |
| R31 | `/hoi-dong/moi` | STAFF | Lập hội đồng | `POST /api/councils`, `GET /api/users?role=LECTURER` | DC-15 |
| R32 | `/hoi-dong/:id` | STAFF (thành viên HĐ: chỉ đọc) | Thành viên, đề tài được gán, gán thêm, hủy gán | `GET /api/councils/:id`, `PUT …/members`, `PATCH /api/councils/:id`, `POST …/assignments`, `POST /api/council-assignments/:id/cancel`, `GET /api/topics?status=WAITING_DEFENSE&councilAssigned=false` | DC-15 |
| R33 | `/cham-bao-ve` | LECTURER | Đề tài được phân công chấm | `GET /api/council-assignments` (GD7 §7.2) | DC-16 |
| R34 | `/cham-bao-ve/:assignmentId` | LECTURER | Xem hồ sơ, chấm, chốt | `GET /api/council-assignments/:id`, `GET /api/topics/:id/documents?stage=FINAL`, `POST /api/documents/:id/download-url`, `GET /api/topics/:id/feedbacks`, `PUT …/my-score`, `POST …/finalize` | DC-16 |
| R35 | `/ho-so` | Mọi vai trò | Hồ sơ cá nhân | `GET/PATCH /api/me/profile` (GD7 §10.1) | DC-12 |
| R36 | `/de-tai/:id/kanban` | STUDENT, LECTURER, STAFF | Kanban mốc | `GET /api/topics/:id/milestones`, `POST /api/documents/:id/feedbacks`, `POST /api/milestones/:id/reopen` | DC-17 |

### 12.3 Đăng nhập Google – R1 bổ sung, `/dang-nhap/google` (DC-12)
- R1 gọi `GET /api/auth/providers` (khóa `['auth-providers']`, `staleTime` vô hạn). `google: true` → nút "Đăng nhập bằng Google" dạng **liên kết** `<a href="/api/auth/google/start?next=…">` (không form, không `window.location` – GD7 §8.2), đặt trên form mật khẩu, ngăn bằng dòng "hoặc". Lỗi/`false` → không hiện nút, form mật khẩu như cũ.
- `/dang-nhap/google?next=`: gọi `POST /api/auth/refresh` (qua hàm khởi động có sẵn) → thành công thì như đăng nhập (mục 4.1: `mustChangePassword` → `/doi-mat-khau`, không thì `next` hợp lệ theo mục 1.2). Thất bại → `/dang-nhap`.
- R1 đọc `sso_error` trên URL → hộp lỗi cấp form theo `SSO_ERROR_LABEL`: `DOMAIN_NOT_ALLOWED` "Truy cập bị từ chối. Vui lòng dùng email do trường cấp."; `NO_ACCOUNT` "Tài khoản chưa được cấp trên hệ thống. Vui lòng liên hệ cán bộ khoa."; `ACCOUNT_LOCKED`; `EMAIL_NOT_VERIFIED`; `STATE_MISMATCH` "Phiên đăng nhập Google đã hết hạn, vui lòng thử lại"; `GOOGLE_ERROR`; `CANCELLED` "Bạn đã hủy đăng nhập bằng Google"; `PASSWORD_ONLY` "Tài khoản quản trị chỉ đăng nhập bằng mật khẩu"; `RATE_LIMITED`, `SERVER_ERROR` (bổ sung DC-12: callback bị 429 / lỗi máy chủ). Mã lạ → "Đăng nhập bằng Google không thành công". Sau khi hiện, xóa `sso_error` khỏi URL (`replace`).

### 12.4 Hồ sơ cá nhân – R35 (DC-12)
- Thẻ thông tin chỉ đọc: mã, họ tên, email, vai trò, khoa, lớp/ngành; ghi chú "Liên hệ cán bộ khoa nếu thông tin sai".
- Form một ô `phone` (`profileUpdateSchema`, `type="tel"`, `inputmode="tel"`), nút "Lưu thay đổi", "Xóa số". Thành công: toast "Cập nhật thành công". Lỗi tại ô: "Số điện thoại không hợp lệ". 429 theo mục 7.
- Chi tiết tài khoản R20 (cán bộ/admin) hiện thêm dòng SĐT chỉ đọc.

### 12.5 Đề tài GV công bố – R5', R7', R29 (DC-13)
- **R5'**: GV vào từ nút "Công bố đề tài tuyển sinh viên" (R26 và R4). Form như R5. Thành công → R7'.
- **R7'**: như R7 khi `topic.origin === 'LECTURER'`, thêm 2 ô: "Yêu cầu ứng viên" (`requirements`, textarea) và "Số sinh viên cần tuyển" (`recruitSlots`, 1..`round.effectiveConfig.maxMembers`). Danh sách "Đủ điều kiện công bố" chạy `topicPublishSchema`. Nút "Kiểm tra trước" (`permissions.checkSimilarity`) dùng `SimilarityPanel` có sẵn.
- **Công bố** (`PUBLISH_RECRUITMENT` trong `availableActions`): mở trang kiểu R10 4 bước (đủ trường → kiểm trùng → giải trình nếu HIGH → "Công bố"), **dùng lại thành phần của R10**, chỉ đổi action và nhãn. Lỗi riêng: `LECTURER_QUOTA_EXCEEDED`, `REGISTRATION_CLOSED`, `JUSTIFICATION_REQUIRED`, `SIMILARITY_NOT_CHECKED` như mục 7.
- **R6** khi `RECRUITING`: vùng thông báo "Đang tuyển sinh viên – {acceptedCount}/{recruitSlots} chỗ, {applicationCounts.pending} đơn chờ" + nút "Xem ứng viên" → R29 (khi `applicationCounts` khác `null`). Nút "Ngừng tuyển" (`UNPUBLISH_RECRUITMENT`, `ReasonDialog` bắt buộc lý do; khi `acceptedCount > 0` cảnh báo đỏ "{acceptedCount} sinh viên đã nhận sẽ bị gỡ khỏi đề tài"; luôn ghi "Đề tài về Nháp; các đơn đang chờ bị từ chối") và "Chốt nhóm" (`FINALIZE_GROUP`, xác nhận "Đóng ứng tuyển, các đơn còn chờ bị từ chối").
- **R29** (desktop: bảng; mobile: thẻ): cột mã SV, họ tên, lớp, lời giới thiệu (rút gọn 2 dòng, bấm mở toàn văn), ngày nộp, trạng thái. Tab theo `status`, mặc định Chờ duyệt. Đầu trang: thanh "{acceptedCount}/{recruitSlots} đã nhận" + nút "Chốt nhóm". Nút "Đồng ý" (xác nhận; khi đã đủ chỗ vẫn hiện, kèm gợi ý "Nhóm đã đủ số lượng" – server quyết định), "Từ chối" (`ReasonDialog`). Lỗi riêng: `GROUP_FULL` → hộp lỗi "Nhóm đã đạt số lượng tối đa" + tải lại; `STUDENT_TOPIC_LIMIT`; `APPLICATION_CLOSED` → toast + tải lại; `NOT_RECRUITING`. Rỗng: "Chưa có sinh viên ứng tuyển."

### 12.6 Bảng tin và ứng tuyển – R26, R27, R28 (DC-14)
- **R26**: lưới thẻ trên desktop (3 cột ≥ `xl`, 2 cột ≥ `lg`, 1 cột dưới `lg`). Thẻ: mã, tên, lĩnh vực, GV, `summaryExcerpt`, "Còn {recruitSlots − acceptedCount} chỗ", đợt + badge "Đã đóng đăng ký" khi `!round.registrationOpen`, trạng thái đơn của tôi (`myApplication.status`, badge "Đang chờ duyệt"/"Đã được nhận"/"Bị từ chối"). Lọc: đợt, lĩnh vực, GV, `q` (URL như mục 1.3). Rỗng: "Hiện chưa có đề tài nào đang tuyển sinh viên."
- **R27**: trái (desktop 2/3): tóm tắt, mục tiêu, từ khóa, yêu cầu ứng viên; phải (1/3, dính khi cuộn): GV, số chỗ, đợt, khối ứng tuyển. SV chưa có đơn còn hiệu lực → form "Lời giới thiệu" (`applicationCreateSchema`, bộ đếm ký tự) + "Gửi ứng tuyển". Có đơn `PENDING` → **ẩn form**, hiện "Đang chờ duyệt" + "Rút đơn" (xác nhận). GV/cán bộ: chỉ đọc. 404 → "Đề tài không còn tuyển hoặc không tồn tại". Lỗi riêng: `APPLICATION_EXISTS`, `REGISTRATION_CLOSED`, `STUDENT_TOPIC_LIMIT`.
- **R28**: bảng đơn (đề tài, GV, ngày nộp, trạng thái, lý do từ chối nếu có); đơn `ACCEPTED` có link "Vào đề tài" → R6. Rỗng: "Bạn chưa ứng tuyển đề tài nào." + nút → R26.
- Menu SV: "Đề tài tuyển sinh viên", "Đơn ứng tuyển". Trang chủ SV giữ `/de-tai`; khi SV chưa có đề tài, trạng thái rỗng R4 thêm nút "Xem đề tài giảng viên đang tuyển" → R26.

### 12.7 Ra hội đồng trên R6 (DC-15)
- `REQUEST_DEFENSE` (GV): hộp thoại "Đề nghị ra hội đồng" có ô `processScore` (số, bước 0,25 trên điều khiển nhưng nhận tối đa 2 chữ số thập phân), `processComment`, cảnh báo "Sau khi gửi, sinh viên không nộp hoặc sửa tài liệu được nữa". Điểm < 5 nhập vào ô → gợi ý tại chỗ "Không đủ điều kiện ra hội đồng (dưới 5,0). Hãy nhập kết quả Không đạt và gửi đóng" (vẫn cho bấm; server trả `PROCESS_SCORE_TOO_LOW`). Lỗi riêng: `NO_FINAL_REPORT` (link tab Tài liệu), `MILESTONES_NOT_PASSED`, `NO_REQUIRED_MILESTONE`.
- `REQUEST_CLOSE` khi đợt `requireDefense`: hiện gợi ý "Đợt này bắt buộc bảo vệ trước hội đồng (trừ kết quả Không đạt hoặc kết quả do hội đồng chốt)"; lỗi `DEFENSE_REQUIRED` → hộp lỗi.
- `RETURN_FROM_DEFENSE` (cán bộ): `ReasonDialog`, nhắc "Phân công hội đồng chưa chốt sẽ bị hủy".
- Khối **"Bảo vệ trước hội đồng"** trên R6 theo `topic.defense`: `WAITING_ASSIGNMENT` "Chờ khoa phân công hội đồng"; `ASSIGNED` "Hội đồng {code} – {name}", "Chưa có kết quả"; `DECIDED` điểm cuối (lớn), Đạt/Không đạt, bảng điểm từng thành viên (vai trò, họ tên, điểm, nhận xét), biên bản. Khối "Điểm quá trình" theo `topic.processScore`. `councilAccess` → dải "Bạn xem với tư cách thành viên hội đồng – chỉ đọc" + nút "Đến màn chấm" → R34.

### 12.8 Hội đồng – R30, R31, R32 (DC-15)
- **R30**: bảng mã, tên, đợt, chủ tịch, số thành viên, số đề tài, badge "Đã có điểm" (`locked`). Lọc đợt, `q`. Nút "Lập hội đồng". Rỗng: "Chưa có hội đồng nào trong đợt này."
- **R31 / sửa thành viên trên R32**: chọn đợt (khi tạo), tên; ba khối "Chủ tịch" (1), "Thư ký" (1), "Ủy viên" (1–5, nút thêm/bớt), mỗi ô là ô chọn GV có tìm kiếm (`GET /api/users?role=LECTURER&q=`). Một GV đã chọn ở ô khác bị làm mờ trong danh sách. Lỗi `members` hiện đầu khối. `COUNCIL_LOCKED` → khối thành viên chỉ đọc + "Hội đồng đã có điểm, không đổi được thành viên". `CONFLICT_OF_INTEREST` → hộp lỗi liệt kê `details.conflicts` ("{lecturerName} là GVHD của đề tài {topicCode}").
- **R32** desktop 2 cột: trái 1/3 thẻ thông tin + thành viên; phải 2/3 bảng đề tài được gán (mã, tên, GVHD, trạng thái, "Đã chấm {scoredCount}/{memberCount}", điểm cuối, Đạt/Không đạt). Nút "Gán đề tài" → hộp thoại rộng (desktop `max-w-3xl`): bảng chọn nhiều đề tài `WAITING_DEFENSE` chưa gán cùng đợt (có ô tìm), cột GVHD; đề tài có GVHD là thành viên hội đồng **được đánh dấu cảnh báo đỏ ngay trong danh sách** ("Xung đột: GVHD là thành viên hội đồng") và không chọn được (gợi ý; server vẫn kiểm). Gửi → lỗi `CONFLICT_OF_INTEREST`/`TOPIC_ALREADY_ASSIGNED`/`NOT_WAITING_DEFENSE` hiện danh sách mã, không đề tài nào được gán. Mỗi dòng chưa có điểm: "Hủy gán" (`ReasonDialog`); `ASSIGNMENT_HAS_SCORES` → hộp lỗi gợi ý dùng "Trả về đang thực hiện" ở R6.
- Thành viên hội đồng (LECTURER) mở R32: chỉ đọc, không có nút.

### 12.9 Chấm bảo vệ – R33, R34 (DC-16)
- **R33**: tab "Chưa chốt" (mặc định) / "Đã chốt"; bảng: mã + tên đề tài, hội đồng, vai trò của tôi (`COUNCIL_ROLE_LABEL`), "Tôi đã chấm"/"Chưa chấm", "Đã chấm {scoredCount}/{memberCount}". Rỗng: "Bạn chưa được phân công chấm đề tài nào."
- **R34** desktop 2 cột (≥ `lg`): **trái** (hồ sơ, cuộn): tóm tắt đề tài, nhóm, GVHD; "Báo cáo tổng kết" – danh sách tài liệu `stage=FINAL` với nút "Tải về" (FR24, URL ký 5 phút; không nhúng xem trước để không đổi CSP `frame-src`); "Điểm quá trình" + nhận xét GVHD; "Nhận xét của GVHD" (`GET …/feedbacks`, phân trang). **Phải** (dính khi cuộn): khối "Điểm của tôi" (`defenseScoreSchema`: ô điểm 0–10, nhận xét bắt buộc, nút "Lưu điểm"; khi đã có `myScore` thì điền sẵn, nút "Cập nhật điểm"); với `CHAIR`/`SECRETARY`: bảng điểm mọi thành viên + "Điểm trung bình tạm tính" (tính ở client chỉ để hiển thị) + nút "Chốt nghiệm thu" (`FINALIZE` trong `availableActions`). Dưới `lg`: trái trên, phải dưới; nút lưu điểm dính đáy.
- Chốt: hộp thoại 2 bước – bước 1 nhập "Biên bản/nhận xét chung" (`minutes`), hiện điểm trung bình và kết quả dự kiến ("Đạt – Tốt" theo `gradeFromDefenseScore` của shared, chỉ để xem trước); bước 2 xác nhận "Hành động này sẽ khóa toàn bộ điểm và chuyển đề tài sang Chờ đóng. Bạn có chắc chắn?" (Hủy → đóng hộp, dữ liệu giữ nguyên). Gửi `{ version: topic.version, minutes }`.
- Sau chốt: màn chỉ đọc, hiện kết quả. Khi đề tài đã đóng, thành viên hội đồng không còn quyền đọc (GD7 G62): R33 tab "Đã chốt" vẫn liệt kê dòng, bấm vào nhận 403 tại chỗ "Đề tài đã đóng – xem kết quả trong Kho đề tài nếu đạt".
- R6 của GVHD khi kết quả hiện hành nguồn hội đồng: ẩn form nhập kết quả, hiện "Kết quả do hội đồng quyết định"; lỗi `COUNCIL_RESULT_LOCKED` → hộp lỗi. Lỗi riêng: `SCORES_INCOMPLETE` → hộp lỗi liệt kê `details.missing`; `ASSIGNMENT_DECIDED` → toast "Hội đồng đã chốt kết quả" + tải lại; `NOT_WAITING_DEFENSE`, `CONCURRENT_UPDATE` → tải lại; 403 → trang 403 tại chỗ (đã bị bỏ khỏi hội đồng hoặc phân công bị hủy).
- Menu GV: "Chấm bảo vệ" (hiện với mọi GV; rỗng nếu không có phân công).

### 12.10 Kanban – R36 (DC-17)
- Bốn cột: Chưa nộp · Chờ đánh giá · Cần bổ sung · Đạt (suy ra theo GD7 §10.2 – "Chờ đánh giá" khi bản nộp mới nhất chưa có nhận xét kèm đánh giá, hàm thuần `kanbanColumn(milestone)` có unit test). Thẻ: tên mốc, hạn (đỏ khi `isOverdue`), badge "Bắt buộc", phiên bản nộp mới nhất + "Nộp muộn" (`latestDocument.isLate`). Bấm thẻ → tab Mốc tại mốc đó.
- Desktop ≥ `lg`: 4 cột ngang chia đều, không cuộn ngang. Dưới `lg`: 4 khối xếp dọc, mỗi khối có số thẻ, thu gọn được.
- **Kéo thả (chỉ GVHD hiện hành, `IN_PROGRESS`, tức `permissions.manageMilestones && topic.advisor?.id === user.id`)**: HTML5 DnD (`draggable`, `dragstart/dragover/drop`), chỉ cột đích hợp lệ nhận thả (viền nổi bật); cột khác `dropEffect = 'none'`.
  - Chờ đánh giá → Đạt / Cần bổ sung: hộp thoại nhận xét bắt buộc → `POST /api/documents/{latestDocument.id}/feedbacks { content, evaluation, milestoneVersion: milestone.version }`.
  - Đạt → Cần bổ sung: `ReasonDialog` → `POST /api/milestones/:id/reopen { version, reason }`.
  - Thẻ chỉ chuyển sau khi API thành công (không cập nhật lạc quan trước hộp thoại). Lỗi mạng/lỗi API: thẻ ở nguyên cột cũ, toast "Mạng gián đoạn, cập nhật thất bại" hoặc thông điệp mục 7 (`STALE_DOCUMENT`, `MILESTONE_ALREADY_PASSED`, `CONCURRENT_UPDATE` → tải lại).
- **Bàn phím và cảm ứng** (bắt buộc, HTML5 DnD không chạy trên cảm ứng): mỗi thẻ GV được thao tác có nút "Chuyển sang…" (menu Radix có sẵn) liệt kê **chỉ** cột đích hợp lệ; chọn → cùng hộp thoại như kéo thả. Vùng `aria-live="polite"` đọc "Đã chuyển {tên mốc} sang {cột}". Thẻ có `aria-describedby` mô tả cột hiện tại. Không có thư viện kéo thả (GD7 §12).
- SV, cán bộ, thành viên hội đồng: chỉ xem, không có `draggable`, không có nút chuyển.

### 12.11 Xuất Excel – `/thong-ke` (DC-18)
Nút "Xuất Excel" cạnh "Xuất CSV", gọi `GET /api/stats/export.xlsx` với **cùng chuỗi query** (tải bằng `fetch` + blob như CSV hiện có để gửi Bearer token). Đang tải: nút disabled + "Đang xuất…". `VALIDATION_ERROR` (quá 5.000 đề tài) → toast thông điệp server. 429 theo mục 7.

### 12.12 Thành phần và chủ (bổ sung mục 9.1)
| Thành phần / route | Chủ |
|---|---|
| Nút Google + `/dang-nhap/google` + `SSO_ERROR_LABEL` dùng ở R1; R35; màu `StatusBadge` cho `RECRUITING`, `WAITING_DEFENSE`; `ACTION_LABEL` mới trong `TopicActionBar` | DC-12 |
| R5', R7', trang công bố (dùng lại thành phần R10), R29, khối "Đang tuyển" trên R6 | DC-13 |
| R26–R28, mục menu SV | DC-14 |
| R30–R32, hộp thoại `REQUEST_DEFENSE`/`RETURN_FROM_DEFENSE`, khối "Bảo vệ trước hội đồng" + "Điểm quá trình" trên R6 | DC-15 |
| R33, R34 | DC-16 |
| R36 + `kanbanColumn` | DC-17 |
| Nút Excel | DC-18 |

Khóa query mới: `['auth-providers']`, `['profile']`, `['recruitments', params]`, `['recruitment', topicId]`, `['applications', params]`, `['topic-applications', id, params]`, `['councils', params]`, `['council', id]`, `['assignments', params]`, `['assignment', id]`. Invalidate: duyệt/từ chối/rút đơn → `['applications']`, `['topic-applications', id]`, `['topic', id]`, `['recruitments']`; chốt nhóm/công bố/ngừng tuyển → thêm `['topics']`; gán/hủy gán/đổi thành viên → `['council', id]`, `['councils']`, `['topics']`; chấm → `['assignment', id]`; chốt → `['assignment', id]`, `['assignments']`, `['topic', topicId]`, `['topics']`; Kanban → `['milestones', id]` (khóa có sẵn của tab Mốc), `['topic', id]`.

### 12.13 Giả định
| # | Giả định | Lý do |
|---|---|---|
| U10 | R34 không nhúng xem trước PDF; chỉ "Tải về" qua FR24 | Nhúng cần `frame-src`/`object-src` cho domain Cloudinary trong CSP; tải về đáp ứng UC19 mà không đổi CSP |
| U11 | Kanban không cập nhật lạc quan | Mọi chuyển cột cần hộp thoại nhận xét/lý do; cập nhật sau khi API thành công thì không cần hoàn tác (UC11 6a vẫn đạt: thẻ ở chỗ cũ khi lỗi) |
| U12 | Trang công bố đề tài GV dùng lại thành phần R10 | Cùng 4 bước đủ trường → FR06 → giải trình → gửi |
