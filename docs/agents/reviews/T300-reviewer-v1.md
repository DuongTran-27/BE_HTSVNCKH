# Review T300 – reviewer – vòng 1
Kết luận: CHANGES_REQUESTED

## Tôi đã tự kiểm tra
- Đã đọc: `CLAUDE.md`, `docs/agents/QUY_TRINH.md`, `docs/agents/reports/T300.md`, `docs/agents/design/UI.md` (toàn bộ 499 dòng), `docs/DAC_TA.md` (mục 1–8), `docs/agents/design/API_GD2.md` (toàn bộ), `packages/shared/src/transitions.js`, `packages/shared/src/enums.js`, `docs/agents/CAU_HOI.md`, `docs/agents/BANG_CONG_VIEC.md` (T206, T300–T309, T504), `apps/api/src/middlewares/errorHandler.js:23` (500 có `error.requestId`, khớp UI §7).
- Phạm vi thay đổi: `git status` cho thấy T300 chỉ thêm 2 file chưa commit, `docs/agents/design/UI.md` và `docs/agents/reports/T300.md`. Không đụng code, test hay `API_GD2.md`.
- `npm test` (tự chạy, 2026-11-01). Kết quả khớp phần điều phối viên dán trong báo cáo:
  ```
  RUN  v4.1.12 D:/Website_HTWLHD_SV_NCKH_demo3/packages/shared
  Test Files  2 passed (2)
       Tests  21 passed (21)
  RUN  v4.1.12 D:/Website_HTWLHD_SV_NCKH_demo3/apps/api
  Test Files  9 passed (9)
       Tests  87 passed (87)
  ```
- `npm run lint`: `'eslint' is not recognized as an internal or external command`. Lỗi này có từ trước (repo chưa cài eslint; T202 sẽ thiết lập, như đã ghi ở `T216-reviewer-v1.md`). T300 chỉ có tài liệu nên lỗi không thuộc task này. Xem INFO 11.
- Báo cáo ghi rõ agent không chạy được `npm test`, và điều phối viên đã bổ sung kết quả. Kết quả tôi tự chạy trùng khớp nên không có lệch bằng chứng.
- Đối chiếu tham chiếu: 25 route; mọi mục `API §x` được trích đều có tiêu đề thật trong API_GD2. Tôi kiểm thủ công từng endpoint của R1–R25 với API §3–§9 về vai trò được gọi và dạng response.

## Đối chiếu đặc tả
| Điều kiện đạt | Đạt? | Ghi chú |
|---|---|---|
| Đủ vai trò: khách, SV, GV, cán bộ, admin | Đạt | Mục 2.1–2.5 |
| Admin không có quyền nghiệp vụ (FR25) | Đạt | Admin chỉ có Tài khoản, Danh mục (khoa/ngành/lớp/lĩnh vực), Kho (API §9.2 cho phép), Đổi mật khẩu. R4–R17, R23–R24 không có ADMIN; gõ URL thì ra 403. Từ đồng nghĩa chỉ dành cho STAFF, khớp API §4.2 |
| Route ↔ endpoint ↔ quyền đúng API_GD2 | Đạt một phần | Vai trò của từng route khớp ma trận API. Có 1 chỗ sai dạng response (MAJOR 1) và 1 chỗ lấy dữ liệu từ endpoint không trả trường đó (MINOR 2) |
| Hành động chỉ theo `availableActions`/TRANSITIONS | Đạt | Mục 5.1 có đúng 9 action GĐ2, từ→sang và tác nhân khớp `transitions.js:6-14`. Action GĐ4+ bị bỏ qua. Ngoại lệ 1 (R15) dùng chính `availableActions()` của shared. Ngoại lệ 2 chỉ dùng để ẩn link, suy đúng theo `isCurrentAdvisor` (API §8.4). Không có đường đi ngoài bảng |
| Trạng thái tải/rỗng/lỗi | Đạt | Mục 6 là quy ước chung; mỗi màn ở mục 4 có Rỗng và Lỗi riêng |
| Ánh xạ mã lỗi đủ, tiếng Việt | Đạt | Đủ 34 mã của API §2 cộng `SERVICE_BUSY` (bảng việc T206), thêm mất mạng và mã chưa biết. Toàn bộ thông điệp bằng tiếng Việt |
| Lỗi kiểm tra tương tự không bao giờ hiện "không trùng" (FR06, quy tắc 5) | Đạt | UI.md:186, :247, :270, :429. Panel ERROR màu xám, chữ "Chưa kiểm tra được". `null` hiện "—". Nên ghi rõ thêm cho R11/R16 (MINOR 5) |
| Responsive 360 px, lỗi theo từng trường (NFR07) | Đạt | Mục 8 (mobile trước, bảng chuyển thành thẻ, ô nhập ≥16 px, vùng chạm 44 px) và mục 7 (`setError` theo `details`) |
| Giờ `Asia/Ho_Chi_Minh`; hạn theo giờ server (NFR06) | Đạt | Mục 1.4: giờ máy khách chỉ dùng để tô màu |
| FR07: màn xét duyệt hiện FR06 + giải trình; quyết định gắn snapshot | Đạt | R17 gửi `submissionId = latestSubmission.id`, xử lý `STALE_SUBMISSION` |
| FR17: xem khác biệt hai lần gửi | Đạt | R13 |
| FR16.5: cán bộ thấy đề tài kẹt Chờ GVHD | Đạt một phần | Có lối tắt ở R4 nhưng bất tiện; chưa có chỗ đặt trên dashboard (MINOR 3) |
| M1, M5 (E2E T309) | Đạt | Luồng R5→R8→R9→R15→R10→R16/R17 đủ màn |
| Giả định U1–U8 không mâu thuẫn đặc tả | Đạt (U4 cần cân nhắc) | U3, U5–U8 khớp G3 và API. U4 nên xem lại (MINOR 4) |

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| 1 | MAJOR | `docs/agents/design/UI.md:477-478` | Quy tắc cache mâu thuẫn hợp đồng API. (a) Dòng 477 viết "PUT đề tài, **kiểm tra trước**: `setQueryData(['topic', id], response.topic)`". Nhưng `POST …/similarity-checks` trả `{ similarityCheck }` chứ không có `topic` (API §7.1, API_GD2:464). FE làm theo sẽ không cập nhật `['topic', id]`, nên badge `latestSimilarity` và cảnh báo `isStale` ở R6/R7 hiển thị kết quả cũ. (b) Dòng 478: sau `/actions` SUBMIT/RESUBMIT có một `SimilarityCheck` mới nhưng không invalidate `['similarity-latest', id]`. (c) Khi gửi nhận `JUSTIFICATION_REQUIRED` hoặc `SIMILARITY_NOT_CHECKED`, server **đã lưu** một lần kiểm mới (API §8.2 bước 4, chạy ngoài transaction), nhưng UI không invalidate gì cả | Tách thành 3 quy tắc: PUT → `setQueryData(['topic', id], r.topic)`. Kiểm tra trước → `setQueryData(['similarity-latest', id], r.similarityCheck)` + invalidate `['topic', id]`, `['topics']`. `/actions` gửi/gửi lại → thêm `setQueryData(['similarity-latest', id], r.similarityCheck)`. Lỗi `JUSTIFICATION_REQUIRED`/`SIMILARITY_NOT_CHECKED` → invalidate `['topic', id]`, `['similarity-latest', id]` |
| 2 | MINOR | `docs/agents/design/UI.md:297` (và R17 ở :151) | "lý do yêu cầu chỉnh sửa lần trước (từ R11)": item của `GET …/submissions` chỉ có `decision: { action, decidedAt }`, không có `reason` (API §8.4, API_GD2:565). R17 cũng không gọi `status-history` | Khi `seq > 1`: gọi `GET …/submissions/{seq-1}` (có `decision.reason`) và thêm endpoint này vào cột Endpoint của R17 |
| 3 | MINOR | `docs/agents/design/UI.md:188`, `:114-125` | Lối tắt FR16.5 bắt cán bộ chọn từng đợt có `registrationOpen = false`. Item danh sách đã có `round.registrationOpen` (API §9.1) nên không cần chọn đợt. Đề tài HAS_ADVISOR sau khi đóng đăng ký cũng bị kẹt (không SUBMIT_FOR_REVIEW được), nhưng lối tắt bỏ sót. Đặc tả ghi "cán bộ thấy danh sách này **trên dashboard**", trong khi mục 2.7 không giữ chỗ cho tiện ích này | Lối tắt = `status=WAITING_ADVISOR` (và một lối tắt nữa cho `HAS_ADVISOR`), không lọc đợt, hiện badge "Đã đóng đăng ký" theo `item.round.registrationOpen`. Thêm một dòng vào mục 2.7: tiện ích "Đề tài kẹt sau khi đóng đăng ký" trên dashboard T504 |
| 4 | MINOR | `docs/agents/design/UI.md:333`, `:492` (U4) | U4 chỉ gửi các khóa khác `DEFAULT_ROUND_CONFIG`. Hệ quả: khi dev đổi giá trị mặc định trong code (dự kiến có, vì ngưỡng FR06 sẽ được "hiệu chỉnh bằng bộ dữ liệu mẫu", mục 3), mọi đợt đang chạy đổi tham số ngay, không có AuditLog `ROUND_UPDATE`. Điều này ngược tinh thần "không hồi tố" (API §4.3). Đặc tả mục 8 ghi tham số "lưu trong cấu hình đợt". Lý do nêu ở U4 ("đổi mặc định không còn tác dụng") vì vậy lại là ưu điểm của cách ngược lại | Kiến trúc sư chọn một trong hai và ghi rõ hệ quả: (a) giữ U4 và ghi "đổi mặc định áp dụng cho mọi đợt chưa ghi đè, kể cả đợt đang chạy"; hoặc (b) khi tạo đợt thì gửi đủ `config` (chốt tham số theo đợt), khi sửa thì gửi lại đủ. Tôi nghiêng về (b) |
| 5 | MINOR | `docs/agents/design/UI.md:253`, `:290` | Quy tắc "`null` → '—', không bao giờ 'Không trùng'" mới chỉ ghi ở R4 (:186). R11 (`similarityLevel` của lần gửi) và R16 (`latestSimilarityLevel`) chưa ghi cách hiển thị `null`. GĐ6 (G5) sẽ có lần gửi mang cờ "chưa kiểm tra" | Ghi một lần ở mục 4.13 hoặc 6: mọi ô mức trùng lặp `null` → "—" (R4) hoặc "Chưa kiểm tra được" (R11, R12, R16, R17). Dùng chung thành phần `SimilarityBadge` |
| 6 | MINOR | `docs/agents/design/UI.md:322` | "Sửa: chỉ `name`": lớp không có `name`, `catalogUpdateSchema` của lớp chỉ có `isActive` (API §4.2:266-267) | Ghi: lớp chỉ có "Ngừng dùng"/"Dùng lại", không có form sửa |
| 7 | MINOR | `docs/agents/design/UI.md:308` | "`facultyId` (ẩn khi ADMIN; …)" dễ đọc thành "ẩn với người dùng ADMIN". Ý đúng là ẩn khi **vai trò tài khoản đang tạo** là ADMIN (API §3.2:193) | Đổi thành "ẩn khi `role` = ADMIN" |
| 8 | MINOR | `docs/agents/design/UI.md:6`, `:447` | Dòng 6 ghi "Màn GĐ4–6 chỉ ghi chỗ đặt (mục 2.5)", đúng ra là mục 2.7. Dòng 447 "không cuộn ngang… trừ bảng so sánh (R13) đã xếp chồng" tự mâu thuẫn, vì đã xếp chồng thì không còn cuộn ngang | Sửa thành "mục 2.7". Bỏ vế "trừ…" hoặc ghi "kể cả R13 (xếp chồng)" |
| 9 | MINOR | `docs/agents/design/UI.md:26` | Kiểm `next` chỉ chặn `//`. Chuỗi `/\evil.com` bị trình duyệt hiểu như `//evil.com` nếu đi qua `window.location` | Thêm điều kiện: không chứa `\`, và chỉ điều hướng bằng `navigate()` của React Router, không gán `window.location`. Bảo mật sẽ soát lại ở T302 |
| 10 | MINOR | `docs/agents/design/UI.md:213-214` | Hồ sơ đang giữ lĩnh vực đã ngừng dùng: UI vẫn hiện lĩnh vực đó. Nhưng PUT luôn gửi đủ trường và server kiểm `fieldId isActive` (API §5.1:359), nên **mọi lần lưu** (kể cả chỉ sửa tóm tắt) đều nhận 400 tại `fieldId`. Hiện người dùng chỉ biết khi bấm lưu | Ghi thêm: khi `topic.field` không còn trong danh sách lĩnh vực đang dùng, hiện cảnh báo ngay tại ô "Lĩnh vực này đã ngừng dùng, hãy chọn lĩnh vực khác trước khi lưu" |
| 11 | INFO | `package.json:11` | `npm run lint` hỏng do chưa cài eslint. Lỗi có từ trước, ngoài phạm vi T300 | T202 phải làm cho lệnh chạy xanh |
| 12 | INFO | API_GD2 §4.3:296, §5.2 | Không phải lỗi của UI. Nếu cán bộ tăng `minSummaryWords`/`minKeywords` khi đã có đề tài HAS_ADVISOR, đề tài đó không còn đạt `topicSubmitSchema` mà không sửa được (FR05). UI R10 bước 1 chỉ "dừng" | Kiến trúc sư cân nhắc ở T600, hoặc R24 cảnh báo khi tăng các tham số này. R10 nên có câu hướng dẫn "Liên hệ cán bộ khoa" thay vì chỉ dừng |

## Trả lời câu hỏi trong báo cáo
1. **`latestSimilarityStatus` trong danh sách**: không cần ở GĐ2. Ở UNDER_REVIEW, lần kiểm gần nhất luôn là lần kiểm lúc gửi và phải OK (lỗi thì gửi bị chặn; ở UNDER_REVIEW không được "Kiểm tra trước"). Vì vậy hàng chờ R16 không bao giờ gặp `null` do lỗi. Ở R4, "—" chấp nhận được vì không bao giờ nói "không trùng". Khi T600 thiết kế cờ "chưa kiểm tra" (G5) thì thêm trường này.
2. **`permissions.viewHistory`**: chấp nhận Ngoại lệ 2 cho GĐ3, vì nó suy đúng `isCurrentAdvisor`, chỉ dùng để ẩn link, và backend vẫn kiểm. Khuyến nghị kiến trúc sư bổ sung trường này vào API §5.1 (T209 làm, chỉ thêm trường) trước T305/T306, rồi bỏ ngoại lệ. Lý do: FR21 (GĐ6) sẽ làm quyền đọc lịch sử phức tạp hơn và UI không thể tự suy ra được nữa.
3. **`SERVICE_BUSY`**: xác nhận. Bảng việc T206 (`BANG_CONG_VIEC.md:21`) đã giao "P2028 → 503 `SERVICE_BUSY`… thêm dòng vào bảng mã lỗi §2", và thông điệp "Hệ thống đang bận, vui lòng thử lại" trùng đề xuất ở `T200-reviewer-v3.md` MINOR 1. Lưu ý: API_GD2:111, :142, :730 vẫn ghi P2028 → 409. T206 phải sửa cả ba chỗ đó, không chỉ thêm dòng.
4. **Diff R13**: đồng ý tự viết so sánh theo từ (LCS) kèm unit test, không thêm thư viện. Nếu văn bản dài làm LCS O(n·m) chậm (tóm tắt ≤5000 ký tự, khoảng 1.000 từ, tức khoảng 10⁶ ô) thì vẫn chấp nhận được. Vượt mức này thì FE đề xuất ở T307.
5. **Bộ lọc GVHD cần `roundId`**: chấp nhận cho GĐ3. Cán bộ vẫn lọc được theo GVHD (FR08) sau khi chọn đợt; tham số `lecturerId` của `GET /api/topics` không cần đợt. Chưa cần đổi API.
6. **Phạm vi**: (a) đồng ý. Điều phối viên sửa mô tả T504, bỏ chữ "công khai" (G3 đã xác nhận). (b) đồng ý. (c) đồng ý, giao R15 phía cán bộ cho T308.

Kết luận: CHANGES_REQUESTED – 0 BLOCKER, 1 MAJOR, 9 MINOR, 2 INFO.
