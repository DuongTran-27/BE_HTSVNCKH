# Review T200 – frontend-dev – vòng 3
Kết luận: APPROVED

Góc nhìn: người xây giao diện GĐ3 (T301–T308). Vòng này kiểm: 3 MINOR của tôi ở vòng 2 đã xử lý chưa; các thay đổi vòng sửa 2 (mã lỗi 409, quyết định cùng origin, G1–G3/G11–G14 đã xác nhận) có làm UI khó hơn không; mã lỗi/response có đủ để hiện thông báo tiếng Việt không.

## Tôi đã tự kiểm tra
- `npm test` (tự chạy, 2026-11-01):
```
> @nckh/shared@0.1.0 test
 Test Files  2 passed (2)
      Tests  21 passed (21)

> @nckh/api@0.1.0 test
 Test Files  9 passed (9)
      Tests  87 passed (87)
   Duration  1.38s
```
- Đã đọc: `docs/agents/reports/T200.md` (toàn bộ, nhất là "Vòng sửa 2"); `docs/agents/design/API_GD2.md` §1.1, §1.3, §1.5, §1.8, §2 (các dòng 409/429), §5.3–5.5, §6, §9.1, §11c; `docs/agents/reviews/T200-frontend-dev-v2.md`; `docs/agents/QUY_TRINH.md`.
- Đối chiếu code: `apps/api/src/app.js:20` (`trust proxy` 1); `apps/api/src/middlewares/rateLimit.js:16` (khóa theo IP với `ipv6Subnet`, hoặc theo `req.user.id`); `docs/agents/design/QD_ZOD.md:128-131` (rủi ro `trust proxy` khi đi qua Vercel rewrite).

## Đối chiếu vấn đề vòng 2
| # vòng 2 | Mức | Đạt? | Ghi chú (mục API_GD2) |
|---|---|---|---|
| 1 – `updatedAt_asc` lệch khi đổi trưởng nhóm ở UNDER_REVIEW | MINOR | Đạt | §9.1:593 ghi rõ là hạn chế đã chấp nhận, kèm lý do và hướng mở cho T213. Trên UI hàng chờ, tôi sẽ hiện `latestSubmission.createdAt` ở cột "Gửi lúc", để cán bộ nhận ra hồ sơ bị xếp lệch. Chấp nhận |
| 2 – item đề nghị hướng dẫn thiếu `round` | MINOR | Đạt | §6:443-448: `topic.round: { id, name }`, cùng dạng với item lời mời §5.3:373. Màn GV gom đề nghị theo `round.id` rồi gọi `GET /api/lecturers?roundId=` mỗi đợt một lần để hiện "Đã nhận x/y". Item còn có `topic.status` và `topic.version`, đủ để mở hộp thoại nhận/từ chối mà không phải tải chi tiết trước |
| 3 – cookie refresh, `Retry-After` khi khác origin | MINOR | Đạt | §1.1:27: quyết định kiến trúc gọi `/api/*` tương đối. §11c:740-741 giao phần proxy Vite cho T301 và `vercel.json` cho T706. Có ghi phương án dự phòng khi khác origin (`exposedHeaders`, `sameSite: 'none'` + `secure`, phải qua `bao-mat`). Phù hợp nguyên tắc "một client duy nhất": `baseURL` để rỗng, không cần biến môi trường cho URL API |

## Thay đổi vòng 2 nhìn từ UI
| Thay đổi | Đủ/nhất quán cho GĐ3? | Ghi chú |
|---|---|---|
| 409 `CONCURRENT_UPDATE` mở rộng cho lock timeout/deadlock/`P2028` (§1.8, §2:141) | Đủ | FE chỉ cần một nhánh: hiện `error.message` ("Đề tài vừa được người khác cập nhật, vui lòng tải lại"), giữ dữ liệu form, invalidate `['topic', id]`. Dữ liệu đã rollback nên bấm lại không gây ghi hai lần. Không cần phân biệt nguyên nhân |
| 409 `INVITATION_CLOSED` cho accept/decline/cancel (§5.3:377-386) | Đủ | Thông điệp "Lời mời không còn hiệu lực" dùng được cho cả 3 nút. Sau lỗi, FE invalidate danh sách lời mời để dòng đó tự biến mất hoặc đổi trạng thái. Accept tăng `version` (§1.5), nên phía trưởng nhóm nhận 409 `CONCURRENT_UPDATE` nếu đang mở bản cũ. Hai mã có ý nghĩa tách bạch |
| Đổi trưởng nhóm: `updateMany` theo `version` → 409 `CONCURRENT_UPDATE` (§5.4:391) | Đủ | Form gửi kèm `version` như mọi thao tác ghi khác |
| G1 đã xác nhận: `REQUEST_ADVISOR` đòi đủ trường, 400 `TOPIC_INCOMPLETE` (§6:430) | Đủ | `details` là map trường (§1.3a), nên FE gắn lỗi vào từng ô và hiện nút "Sửa hồ sơ". Phía client có thể kiểm trước bằng `topicSubmitSchema` để tắt nút gửi đề nghị |
| G2, G3, G11–G14 đã xác nhận | Không đổi shape | Chỉ đổi nhãn "giả định" thành "đã xác nhận", FE không phải làm gì thêm |
| `withLockTx`, `lock_timeout` 3 s | Không ảnh hưởng shape | Lúc tranh chấp, request có thể mất khoảng 3 s. Nút phải ở trạng thái đang xử lý (disabled + spinner) để người dùng không bấm lại; việc này đã có sẵn trong nguyên tắc UI |

Mã lỗi và response đủ để hiện thông báo tiếng Việt: mọi mã mới đều có `message` tiếng Việt ở §2; `details` tuân §1.3. Không thấy mã nào FE phải tự dịch.

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| 1 | MINOR | API_GD2.md:27; QD_ZOD.md:128-131; app.js:20 | Quyết định cùng origin biến rủi ro `trust proxy` ở QD_ZOD §4.6 từ "có thể" thành "chắc chắn có". Mọi request đều đi qua Vercel rewrite rồi mới tới proxy của Render, nên với `trust proxy` = 1, `req.ip` có thể là IP hạ tầng Vercel. Khi đó các limiter theo IP (đăng nhập) gộp mọi người dùng vào chung một hạn mức. Hậu quả ở UI: người dùng nhận 429 `RATE_LIMITED` dù chưa thử lần nào. §1.1 chưa trỏ tới rủi ro này | Thêm một câu vào §1.1: "Hệ quả: chuỗi proxy gồm Vercel → Render, T706/T703 phải chỉnh `trust proxy` theo QD_ZOD §4.6". Không đổi hợp đồng, không chặn GĐ3 |

## Trả lời câu hỏi trong báo cáo
- Mục 7 (cùng origin, T301): đồng ý. T301 nên dựng proxy Vite (`server.proxy['/api']`) và API client dùng đường dẫn tương đối ngay từ đầu, để không phải sửa lại sau. Điều phối viên nên ghi điều này vào mô tả T301.
- `P2028` → 409 `CONCURRENT_UPDATE` (thay vì 503): đồng ý từ phía FE. Cả hai đều dẫn đến cùng một hành động cho người dùng (tải lại, thử lại). Dùng chung một mã giúp client gọn hơn.

Kết luận: APPROVED – 0 BLOCKER, 0 MAJOR, 1 MINOR (§1.1 chưa trỏ tới rủi ro `trust proxy` mà quyết định cùng origin kéo theo; không chặn GĐ3).
