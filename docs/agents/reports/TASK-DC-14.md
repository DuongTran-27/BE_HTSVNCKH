# TASK-DC-14 – Web sinh viên: bảng tin đề tài tuyển, ứng tuyển, đơn ứng tuyển, menu (FR32)
- Agent: frontend-dev · Trạng thái: REVIEW · Ngày: 2026-11-19
- Đã đọc: CLAUDE.md, `design/UI.md` §12.6, §12.12, `design/API_GD7.md` §4.1–4.3, báo cáo TASK-DC-05, TASK-DC-06, TASK-DC-13.
- Không sửa backend, không đổi hợp đồng API.

## Màn hình đã làm
| Route | Vai trò | Nội dung | Trạng thái đã xử lý |
|---|---|---|---|
| R26 `/tuyen-sinh` | STUDENT, LECTURER, STAFF | Lưới thẻ (1/2/3 cột theo `lg`/`xl`): mã, tên, lĩnh vực, giảng viên, trích tóm tắt, "Còn n chỗ", đợt, badge "Đã đóng đăng ký", badge đơn của tôi. Lọc đợt, lĩnh vực, giảng viên (chọn đợt trước, vì `GET /lecturers` cần `roundId`), tìm `q`; trạng thái nằm trên URL; phân trang ở server. Giảng viên thêm nút "Công bố đề tài tuyển sinh viên" | đang tải, rỗng (không lọc / có lọc), lỗi + "Thử lại" |
| R27 `/tuyen-sinh/:topicId` | STUDENT (ứng tuyển); LECTURER, STAFF chỉ đọc | Trái: tóm tắt, mục tiêu, từ khóa, yêu cầu; phải (dính ở `lg`): giảng viên, lĩnh vực, đợt, số chỗ, khối ứng tuyển. Không có đơn hoặc đơn `DECLINED` → form "Lời giới thiệu" (`applicationCreateSchema`, bộ đếm); `PENDING` → ẩn form, "Đang chờ duyệt" + "Rút đơn" (xác nhận); `ACCEPTED` → "Vào đề tài" | 404 → "Đề tài không còn tuyển hoặc không tồn tại."; `APPLICATION_EXISTS`, `REGISTRATION_CLOSED`, `STUDENT_TOPIC_LIMIT`, `ALREADY_MEMBER`, `NOT_RECRUITING` hiện `err.message` của server dưới form; 400 theo trường vào ô |
| R28 `/don-ung-tuyen` | STUDENT | Danh sách đơn (đề tài, trạng thái, ngày nộp, lý do từ chối); "Vào đề tài" khi `ACCEPTED`; "Rút đơn" chỉ khi server trả `WITHDRAW` trong `availableActions`, có xác nhận | rỗng + nút sang R26, lỗi, phân trang; `APPLICATION_CLOSED` hiện trong hộp thoại rồi tải lại |
| R4 `/de-tai` | STUDENT | Trạng thái rỗng thêm nút "Xem đề tài giảng viên đang tuyển" | |

Menu: sinh viên thêm "Đề tài tuyển sinh viên", "Đơn ứng tuyển"; giảng viên thêm "Đề tài tuyển sinh viên" (DC-13 để lại cho DC-14). `SCREENS` thêm 3 route (cán bộ vào được R26/R27 chỉ đọc; quản trị viên không). Liên kết thông báo `/tuyen-sinh` do backend gửi nay có đích.

## Quyết định
- Nút theo dữ liệu server: "Rút đơn" ở R28 theo `availableActions`; ở R27 theo `myApplication.status` (bảng tin chỉ trả `{id, status}`, không có `availableActions`). Form ứng tuyển không bị chặn theo `registrationOpen`: UI chỉ hiện badge, server trả `REGISTRATION_CLOSED`.
- Hiện form khi ứng viên có đơn `DECLINED` (index duy nhất của backend chỉ chặn đơn `PENDING`, nên nộp lại được).
- Sau mọi lần ghi (kể cả lỗi) invalidate `['recruitments']`, `['applications']`.
- `WithdrawDialog` dùng chung R27 và R28; `APPLICATION_LABEL/TONE` định nghĩa ở `RecruitBoardPage.jsx`.

## File thay đổi
| File | Thay đổi |
|---|---|
| `apps/web/src/pages/topics/RecruitBoardPage.jsx` | mới – R26 |
| `apps/web/src/pages/topics/RecruitDetailPage.jsx` | mới – R27 + `WithdrawDialog` |
| `apps/web/src/pages/topics/MyApplicationsPage.jsx` | mới – R28 |
| `apps/web/tests/dc14.test.jsx` | mới – 28 test |
| `apps/web/src/lib/nav.js`, `routes.jsx` | 3 route, quyền dẫn đường, menu SV + GV |
| `apps/web/src/pages/topics/TopicListPage.jsx` | nút ở trạng thái rỗng của sinh viên |
| `docs/agents/BANG_CONG_VIEC.md` | DC-14 → REVIEW |

## Điều kiện đạt ↔ test (`dc14.test.jsx`, 28 test)
| Điều kiện | Test |
|---|---|
| Bảng tin: thẻ, lọc, tìm, trống, phân trang, lỗi | "hiện thẻ…", "lọc theo đợt…", "tìm kiếm gửi q…", "rỗng…", "phân trang…", "lỗi API…" |
| Nút công bố của giảng viên; R4 rỗng của sinh viên | "giảng viên có nút công bố…", "R4 rỗng…" |
| Ứng tuyển: validate, thành công, từng mã lỗi | "lời giới thiệu ngắn…", "gửi thành công…", `it.each` 5 mã, "lỗi 400 theo trường…" |
| Ẩn form khi có đơn; rút đơn có xác nhận | "đơn đang chờ…", "đã được nhận…", "đơn bị từ chối…", "giảng viên: chỉ đọc…", "404…" |
| Đơn của tôi | "hiện đơn; rút đơn phải xác nhận…", "APPLICATION_CLOSED…", "nút theo availableActions…", "rỗng…" |
| Menu theo vai trò | "mục menu theo vai trò", "canVisit…" |

## Bằng chứng chạy lệnh
```
$ npm run lint                      → exit 0 (eslint . --max-warnings 0)
$ DB_TEST_DRIVER=embedded npm run db:test:up ; npm run db:test:reset   → "Đã reset DB test" (cảnh báo EPERM query_engine như các task trước)
$ npm test                          → exit 0
  shared  Test Files 8 passed (8)    Tests 115 passed (115)
  api     Test Files 84 passed (84)  Tests 1217 passed (1217)
  web     Test Files 35 passed (35)  Tests 325 passed (325)   (28 test mới của DC-14)
$ npm run build -w @nckh/web        → exit 0 (built in 720ms)
$ npm run test:e2e -w @nckh/web     → 74 passed (4.9m), exit 0
```

## Còn lại / rủi ro
- `ApplicationView` (§4.1) không có tên giảng viên nên R28 không có cột "GV" như UI §12.6; thiếu thì cần backend thêm `topic.lecturer` (không đổi hợp đồng trong task này).
- Bộ lọc giảng viên chỉ dùng được sau khi chọn đợt (do `GET /lecturers` bắt buộc `roundId`; `GET /users` không dành cho sinh viên).
- Chưa kiểm tay bằng trình duyệt ở 360 px và dark mode; dùng `bg-card`, `min-h-11`, lưới 1 cột dưới `lg`. Chưa có E2E luồng tuyển (DC-21).

## Câu hỏi cho reviewer
Cột giảng viên ở R28 (xem trên): chấp nhận bỏ hay thêm `topic.lecturer` vào `ApplicationView`?
