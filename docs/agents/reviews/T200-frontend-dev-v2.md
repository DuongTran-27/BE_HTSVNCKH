# Review T200 – frontend-dev – vòng 2
Kết luận: APPROVED

Góc nhìn: người sẽ xây giao diện GĐ3 (T301–T308). Vòng này tôi kiểm hai việc: 12 vấn đề của tôi ở vòng 1 đã được sửa đúng và đủ chưa, và phần mới thêm (do RV/BE yêu cầu) có làm UI khó hơn không.

## Tôi đã tự kiểm tra
Task thiết kế, không có test để chạy. Đã đọc:
- `docs/agents/design/API_GD2.md` bản vòng sửa 1 (toàn bộ, 739 dòng); `docs/agents/reports/T200.md` mục "Vòng sửa 1"; `docs/agents/reviews/T200-frontend-dev-v1.md`; `docs/agents/QUY_TRINH.md` (mẫu review).
- Đối chiếu code:
  - `apps/api/src/app.js:23`: `cors({ origin, credentials: true })`, **không có `exposedHeaders`**.
  - `apps/api/src/middlewares/rateLimit.js:14`: `standardHeaders: true`.
  - `apps/api/src/modules/auth/routes.js:13-14`: cookie `secure` khi production, `sameSite: 'lax'`.
  - `apps/web/` hiện rỗng: chưa có cấu hình proxy/rewrite nào.

## Đối chiếu vấn đề vòng 1
| # vòng 1 | Mức | Đạt? | Ghi chú (mục API_GD2) |
|---|---|---|---|
| 1 – phạm vi khoa của STAFF ở `/me` | MAJOR | Đạt | §1.1, §11c: `staffFacultyIds` có trong `user` của login/refresh/me, `[]` với vai trò khác. Đã giao T206/T205. FE lọc được dropdown khoa ở form đợt, nhập CSV và lọc người dùng |
| 2 – `GET /api/users/:id`, phạm vi hiện tại | MAJOR | Đạt | §3.2: có `GET /api/users/:id` → `{ user: UserView }`. `UserView` (cả item danh sách) có `staffFacultyIds`. `PUT staff-scopes` trả `UserView` mới, nên FE cập nhật cache ngay mà không phải gọi lại. Hợp đồng ghi rõ form phải điền sẵn |
| 3 – shape `pendingAdvisorRequest`/`decision`/SUBMIT | MAJOR | Đạt | §5.1 định nghĩa đủ `advisor`, `pendingAdvisorRequest { id, lecturer, createdAt, pendingDays }`, `latestSubmission.decision { action, reason, decidedAt, decidedBy }`, `latestSimilarity`. §8.1: SUBMIT/RESUBMIT trả `{ topic, submission, similarityCheck }`, ba khóa cùng cấp. Đủ để vẽ màn chờ GVHD, hiện lý do của cán bộ ở Cần chỉnh sửa/Bị từ chối, và màn kết quả sau khi gửi |
| 4 – `round.effectiveConfig` | MINOR | Đạt | §5.1. Có thêm `reviewDeadline`. Màn chi tiết còn đúng 1 request |
| 5 – quy ước `details`, lỗi hồ sơ thiếu | MINOR | Đạt | §1.3 (a)(b)(c) đủ để viết một hàm `applyApiErrorToForm` dùng chung. Mã mới 400 `TOPIC_INCOMPLETE` tách khỏi `VALIDATION_ERROR`, nên UI phân biệt được "hồ sơ thiếu" (hiện nút "Sửa hồ sơ") với "lý do quá ngắn" (gắn vào ô `reason` của hộp thoại) |
| 6 – enum/nhãn ở shared | MINOR | Đạt | §11: `REQUEST_STATUS(_LABEL)`, `ROLE_LABEL`, `SIMILARITY_LEVEL_LABEL`, `ACTION_LABEL` (có test so khóa với TRANSITIONS) |
| 7 – CSV | MINOR | Đạt | §3.2: `details.file`, `field: string \| null`, `USER_IMPORT_*` ở shared, ghi rủi ro mất `credentials`. Lỗi 413 không có `details.file`: FE tự gắn vào ô file, và đã kiểm trước bằng `USER_IMPORT_MAX_BYTES` |
| 8 – refresh song song | MINOR | Đạt | §1.1 |
| 9 – sắp xếp hàng chờ | MINOR | Đạt một phần | §9.1 có `updatedAt_asc`, item có `latestSubmission { seq, createdAt }` và `round.reviewDeadline`. Còn lệch thứ tự khi đổi trưởng nhóm, xem vấn đề #1 |
| 10 – xem lại FR06, kết quả cũ | MINOR | Đạt | §7.1 `GET …/similarity-checks/latest` (có `isStale`); §5.1 `latestSimilarity.isStale` |
| 11 – hạn mức GV, luồng mức vàng | MINOR | Đạt một phần | (b) Đạt: §8.2 có "Luồng UI gửi hồ sơ khuyến nghị", khớp cách tôi định làm T305. (a) Dùng được `GET /api/lecturers?roundId=` nhưng còn thiếu round ở item đề nghị, xem vấn đề #2 |
| 12 – `WRONG_PASSWORD`/`SAME_PASSWORD`, `Retry-After` | MINOR | Đạt về hợp đồng | §2 có đủ. Header chưa đọc được nếu khác origin, xem vấn đề #3 |

## Nội dung mới có ảnh hưởng UI
| Thay đổi | Ảnh hưởng FE |
|---|---|
| Chấp nhận lời mời tăng `Topic.version` (§1.5) | Có lợi: màn trưởng nhóm đang mở bản cũ sẽ nhận 409 rồi tải lại trước khi gửi đề nghị. FE nên invalidate `['topic', id]` sau khi `accept`; response có `topicId` để làm việc này |
| `/actions` trả 403 trước 409 (§8.1) | Không ảnh hưởng: nút đã ẩn theo `availableActions` |
| `checkSimilarity` cho cả WAITING_ADVISOR (§5.1) | Chỉ cần đọc `permissions.checkSimilarity`, FE không phải thêm logic |
| `matches` lưu bất biến, ẩn theo `status` lúc kiểm (§7.2) | Hiển thị snapshot cũ ổn định. Shape `SimilarityCheckView` không đổi so với vòng 1 |
| Đổi trưởng nhóm ở trạng thái kết thúc trả `TOPIC_NOT_EDITABLE` (§5.4) | Nút đã ẩn qua `permissions.transferLeader`; nếu vẫn gặp thì hiện `error.message` |
| `submission-diff` đổi đường dẫn | Chỉ đổi URL, không ảnh hưởng gì khác |
| `lock_timeout` → 409 `CONCURRENT_UPDATE` (§1.8) | Đi chung nhánh 409 sẵn có (giữ form, tải lại) |

Không có thay đổi nào làm UI khó hơn.

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| 1 | MINOR | API_GD2.md:566, 365 | `updatedAt_asc` được coi là "gửi trước làm trước" với lý do lần ghi cuối lên Topic ở UNDER_REVIEW là lần chuyển trạng thái. Nhưng đổi trưởng nhóm được phép ở UNDER_REVIEW và có tăng `version` (§5.4), tức là cập nhật Topic và đổi `updatedAt`. Hồ sơ đó sẽ nhảy xuống cuối hàng chờ. Màn vẫn hiện đúng `latestSubmission.createdAt` nhưng thứ tự sai | Thêm `sort=submittedAt_asc` (theo `createdAt` của Submission mới nhất), hoặc ghi rõ hạn chế này trong §9.1. Không chặn GĐ3 |
| 2 | MINOR | API_GD2.md:418, 423 | Item của `GET /api/advisor-requests` có `topic` nhưng không có `round`. Màn của GV không biết phải gọi `GET /api/lecturers?roundId=` với đợt nào để hiện "Đã nhận 4/5" cạnh từng đề nghị. Cách tạm: chọn đợt bằng `GET /api/rounds` rồi lọc `?roundId=` | Thêm `topic.round: { id, name }` vào item (cùng dạng item lời mời §5.3), chỉ thêm trường |
| 3 | MINOR | API_GD2.md:133, 27; `app.js:23`; `auth/routes.js:14` | (a) Nếu web (Vercel) và API (Render) khác origin, trình duyệt không cho JS đọc `Retry-After`/`RateLimit-*`, vì `cors` không có `exposedHeaders`. (b) Nghiêm trọng hơn, và có từ GĐ1: `*.vercel.app` và `*.onrender.com` là hai site khác nhau. Cookie `nckh_rt` đặt `sameSite: 'lax'` nên không được gửi kèm `fetch` POST `/api/auth/refresh` khác site, và refresh luôn thất bại | Ghi vào §1.1 một quyết định: web gọi API **cùng origin** qua rewrite `/api/*` của Vercel (giải quyết cả (a) và (b), không đổi backend). Nếu không dùng rewrite thì phải có `exposedHeaders: ['Retry-After','RateLimit-Policy','RateLimit']` và cookie `sameSite: 'none'` + `secure`. Việc này thuộc kiến trúc/triển khai, không chặn T200, nhưng điều phối viên nên giao cho task triển khai trước T301 |

## Trả lời câu hỏi cho FE trong báo cáo
Dạng bọc theo tên cùng `availableActions` + `permissions` + các shape mới ở §5.1 là đủ cho T305–T308. Các màn quản trị T303 giờ đã vẽ đúng phạm vi STAFF được.

Kết luận: APPROVED – 3 MAJOR vòng 1 đã sửa đúng và đủ, 9 MINOR đã xử lý. Còn 3 MINOR mới, không chặn GĐ3: thứ tự hàng chờ bị lệch khi đổi trưởng nhóm, item đề nghị hướng dẫn thiếu `round`, cookie/header khi web và API khác origin.
