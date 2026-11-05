# Review T501 – bao-mat – vòng 1
Kết luận: APPROVED

## Tôi đã tự kiểm tra
- `npm run lint` -> `eslint .` không lỗi, không cảnh báo.
- `npm test -w @nckh/api` -> `Test Files 47 passed (47)`, `Tests 602 passed (602)` (DB test đã chạy sẵn).
- Đã đọc: báo cáo T501, API_GD45 §8.1–8.4, toàn bộ `apps/api/src/modules/notifications/*`, `git diff` của app.js, env.js, server.js, các service/repo T208/T210/T212a/T401–T405, `lib/router.js`, `middlewares/rateLimit.js`, model `Notification` (unique `(userId, dedupeKey)`), danh sách test T501.
- Không viết test tấn công riêng: các kịch bản cần chứng minh (IDOR `:id/read`, 401/404/429 cron, rollback, chạy cron song song) đã có trong `tests/T501-notifications.test.js` và đều đạt.

## Đối chiếu trọng tâm
| Hạng mục | Kết quả |
|---|---|
| Cron: thiếu `CRON_SECRET` | 404 trước mọi xử lý (`requireCronSecret`), production có cảnh báo khi khởi động; env có `.min(32)`. |
| Cron: so sánh bí mật | `timingSafeEqual(sha256(given), sha256(secret))`, độ dài luôn bằng nhau; chỉ chấp nhận `Bearer `; thông báo lỗi không chứa giá trị header. |
| Cron: rate limit | Limiter 10/15 phút theo IP đứng **trước** kiểm bí mật (chặn dò), dùng factory chung; test 429 đạt. |
| Cron: log | `pino` redact `req.headers.authorization`, `req.headers.cookie`, `res.headers["set-cookie"]` – đúng đường dẫn của serializer pino-http. |
| Cron: đầu vào | Không nhận tham số thời gian; dùng giờ server. `$queryRaw` dùng template có tham số + `Prisma.join`, không ghép chuỗi. |
| IDOR thông báo | Mọi truy vấn có `userId = req.user.id`; `markRead` dùng `updateMany where {id, userId}`; không phải của mình -> 404 (không dò id); `read-all` chỉ của mình; `:id` kiểm qua `idSchema`. Router qua `businessRouter(guard)` (requireAuth + requirePasswordChanged). |
| Rò dữ liệu | `notifyTopic` đọc thành viên `leftAt: null`, GVHD `endAt: null` **trong tx sau khóa** -> thành viên đã rời/GV cũ không nhận. Cán bộ khoa lọc theo `StaffScope.facultyId = topic.facultyId` + role STAFF. Tài khoản khóa bị bỏ. `ADVISOR_REQUEST_WITHDRAWN` chỉ chứa mã đề tài; lý do từ chối và nội dung nhận xét không vào tiêu đề. Response chỉ chọn `id,type,title,link,readAt,createdAt`. |
| Dedupe đồng thời | `createMany({ skipDuplicates: true })` -> `ON CONFLICT DO NOTHING` trên unique `(userId, dedupeKey)`; nhắc đề nghị hướng dẫn dùng `UPDATE ... WHERE remindedAt IS NULL RETURNING id`, chỉ bên thắng gửi. |
| Cùng transaction | Mọi `o.notify` nằm trong callback tx của thao tác, sau `audit`; test rollback đạt. |

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| A | MINOR | apps/api/src/server.js:15 | Cấu hình `redact` không có test; nếu sau này đổi serializer/đường dẫn log, header `Authorization` (CRON_SECRET, access token) có thể lọt vào log mà không ai biết. | Thêm một test nhỏ: tạo pino với cùng cấu hình redact, ghi `{ req: { headers: { authorization: 'Bearer x' } } }`, khẳng định ra `[Redacted]`. Có thể tách cấu hình logger ra hàm để test. |
| B | MINOR | apps/api/src/modules/topics/advisorService.js:36,80 | Khóa `ADVISOR_RESPONSE:${t.advisorRequests[0]?.id}` / `ADVISOR_REQUEST_WITHDRAWN:${req?.id}` dựa vào việc `closeRequest` chỉ thành công khi có đề nghị PENDING (đúng hiện nay). Nếu bất biến này đổi, khóa thành `...:undefined` và từ đó chặn vĩnh viễn thông báo cùng loại cho người nhận đó. Không khai thác được hiện tại. | Ném lỗi (hoặc assert) khi không có id thay vì dùng `?.`. |
| C | MINOR | apps/api/src/app.js (có sẵn, không do T501) | `genReqId` lấy `x-request-id` từ client đưa vào log; ngoài phạm vi T501, ghi lại để theo dõi. | Giới hạn độ dài/ký tự hoặc luôn sinh UUID. |

Câu hỏi của dev: `MILESTONE_REQUIRED_REMOVED` dùng version **sau** cập nhật – chấp nhận (duy nhất mỗi lần, thống nhất với đóng đề tài, không ảnh hưởng bảo mật).

Kết luận: APPROVED. Không có BLOCKER/MAJOR. 3 MINOR không chặn (A, B nên làm khi tiện; C ngoài phạm vi).
