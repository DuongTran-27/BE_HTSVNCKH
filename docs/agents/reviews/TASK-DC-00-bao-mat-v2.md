# Review TASK-DC-00 – bao-mat – vòng 2
Kết luận: APPROVED

Vòng cuối (2/2). Kiểm từng BLOCKER/MAJOR ở v1 bằng cách đọc chỗ sửa trong tài liệu, không dựa vào bảng "Vòng sửa 1".

## Tôi đã tự kiểm tra
- Đọc lại `docs/agents/design/API_GD7.md` §0, §0.1, §1.1, §1.3, §2.3, §3.4–3.5, §4.3, §4.6, §5.3–5.6, §6.6 #7, §8.1–8.4, §9.2–9.4, §10.2, §12, §13, bảng "Vòng sửa 1"; `docs/DAC_TA.md` mục 9 (FR31, FR38, ghi chú hội đồng/`requireDefense`); `docs/agents/design/UI.md` §12.5, §12.7; `docs/agents/BANG_CONG_VIEC.md` dòng DC-01…DC-20.
- Kết quả `npm audit` của vòng 1 (nodemailer 10.6.0 + google-auth-library 10.9.1: `found 0 vulnerabilities`; engines Node ≥ 20) khớp với số ghi ở §12.

## Đối chiếu đặc tả (vấn đề v1)
| # v1 | Đã sửa? | Bằng chứng trong tài liệu |
|---|---|---|
| B1 nodemailer | Đã sửa | GD7 §12 dòng `nodemailer` ghim 10.6.0, tối thiểu 10.1.4, ghi engines; BANG DC-04 |
| M1 limiter SSO | Đã sửa (xem n1) | §8.2 bước 2: `start` 300/15 phút; bước 3: `callback` `skipSuccessfulRequests`, 302 lỗi tính là thất bại; §8.4 test 25 lần thành công |
| M2 RECRUITING kẹt | Đã sửa | §0 `UNPUBLISH_RECRUITMENT` có `reasonRequired`; §3.4 gỡ thành viên dưới khóa, AuditLog `MEMBER_REMOVE`, thông báo `RECRUITMENT_CANCELLED`; G63; DAC_TA FR31; UI §12.5 cảnh báo đỏ |
| M3 ứng tuyển không khóa | Đã sửa | §4.3: `withLockTx`, Topic `FOR SHARE` (xung đột với khóa ghi của chốt/ngừng tuyển; FK chỉ lấy KEY SHARE nên không tự khóa chết), kiểm lại RECRUITING sau khóa; §4.6 #10 |
| M4 ghi đè kết quả hội đồng | Đã sửa (xem n2) | §5.5 `COUNCIL_RESULT_LOCKED` dưới khóa; §5.3 bỏ `DEFENSE_REQUIRED` khi `source = COUNCIL`; §5.6 #8, #9; DAC_TA mục 9 |
| M5 Kanban | Đã sửa | §10.2 chỉ tính Feedback có `evaluation`, 3 ca test; DAC_TA FR38 |
| M6 RLS | Đã sửa | §2.3: `ENABLE ROW LEVEL SECURITY` đủ 6 bảng |
| M7 bảng việc | Đã sửa | DC-01, DC-07 cột Review `BM`; DC-11 phụ thuộc `TASK-DC-05, TASK-DC-07` |
| m1–m10, m12 | Đã sửa | SSO cấp phiên trong tx + đọc lại `isLocked/lockedUntil/role`, export `issueTokens`; `CANCELLED` + `ssoCallbackQuerySchema`; `next` ≤ 512; `GOOGLE_ALLOWED_DOMAINS` + email phải đúng `hd`; ADMIN `PASSWORD_ONLY` (G60); subject lọc ký tự điều khiển, link dự phòng, dọn `FAILED`, "ít nhất một lần"; uuid ghi chú; điểm bảo vệ chỉ khi CLOSED; 3 test chéo luồng; G62 + liệt kê endpoint ghi; §0.1 dòng rà Advising |
| m11 (không sửa, G61) | Chấp nhận | Ẩn tên trong FR06 chặt hơn bảng tin, không lộ thêm dữ liệu; giữ một quy tắc ẩn đã qua review T214 là hợp lý |

Không thấy mâu thuẫn mới mức BLOCKER/MAJOR. Gỡ thành viên khi ngừng tuyển cho GV thêm một cách loại SV, nhưng bắt buộc lý do, có AuditLog và thông báo, nên chấp nhận được (G63).

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| n1 | MINOR | `API_GD7.md:518`; `apps/api/src/middlewares/rateLimit.js:8` | `skipSuccessfulRequests` của express-rate-limit coi mọi mã < 400 là thành công. Callback luôn trả 302, kể cả khi lỗi, nên mặc định **không đếm lần nào**. Tài liệu đã ghi ý định "302 lỗi tính là thất bại", nhưng `createLimiter` hiện chỉ nhận cờ boolean | DC-03 thêm `requestWasSuccessful` tùy biến (vd. `res.locals.ssoOk`) vào `createLimiter`; thêm test: 21 callback lỗi cùng IP → lần 21 bị 429 |
| n2 | MINOR | `API_GD7.md:71`; `UI.md:606` | Bảng mã lỗi §1.3 vẫn ghi `DEFENSE_REQUIRED` khi "kết quả hiện hành ≠ FAIL", thiếu "và `source ≠ COUNCIL`" như §5.3. Gợi ý UI "(trừ kết quả Không đạt)" cũng thiếu ngoại lệ kết quả hội đồng | Sửa câu ở §1.3 và UI §12.7 cho khớp §5.3 |
| n3 | MINOR | `API_GD7.md:184` (`application_one_active`), `:254` | Index chỉ loại `WITHDRAWN`, nên đơn `DECLINED`/`ACCEPTED` vẫn tính là còn hiệu lực. Sau khi ngừng tuyển rồi công bố lại, SV bị gỡ và SV có đơn bị từ chối tự động không ứng tuyển lại được (`APPLICATION_EXISTS`). Điều này trái câu "công bố lại là đề tài mới tuyển từ đầu" | Đổi điều kiện index thành `status IN ('PENDING','ACCEPTED')` và đặt đơn `ACCEPTED` của người bị gỡ sang trạng thái kết thúc; hoặc ghi rõ giả định "không ứng tuyển lại" + test |

Tổng vòng 2: 0 BLOCKER, 0 MAJOR, 3 MINOR (không chặn DONE; sửa ở task tương ứng DC-03, DC-05/DC-06 hoặc ngay trong tài liệu).
