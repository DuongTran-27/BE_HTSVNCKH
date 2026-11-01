# Review T300 – reviewer – vòng 2
Kết luận: APPROVED

## Tôi đã tự kiểm tra
- Đã đọc: `CLAUDE.md`, `docs/agents/QUY_TRINH.md`, `docs/agents/reports/T300.md` (mục "Vòng sửa 1"), `docs/agents/design/UI.md` (toàn bộ 541 dòng), review vòng 1 của tôi (`T300-reviewer-v1.md`), `T300-frontend-dev-v2.md`. Trong `docs/agents/design/API_GD2.md` đã đọc §3.1–§3.2, §4.2–§4.3, §5.1–§5.4, §6, §7.1, §8.1–§8.4, §9.1–§9.2. Cũng đã đọc `docs/DAC_TA.md` (FR16, mục 5), `packages/shared/src/transitions.js` và các dòng T206–T214, T300–T309, T504, T600 trong `BANG_CONG_VIEC.md`.
- Phạm vi thay đổi: `git status` cho thấy T300 vẫn chỉ có 2 file tài liệu chưa commit (`design/UI.md`, `reports/T300.md`). Không có thay đổi ở code, test hay `API_GD2.md`. `BANG_CONG_VIEC.md` do điều phối viên sửa.
- `npm test` (tôi tự chạy, 2026-11-01). Kết quả trùng với phần điều phối viên dán trong báo cáo, mục "Bằng chứng chạy lệnh vòng sửa 1":
  ```
  RUN  v4.1.12 D:/Website_HTWLHD_SV_NCKH_demo3/packages/shared
  Test Files  2 passed (2)
       Tests  21 passed (21)
  RUN  v4.1.12 D:/Website_HTWLHD_SV_NCKH_demo3/apps/api
  Test Files  9 passed (9)
       Tests  87 passed (87)
  ```
- `npm run lint`: `'eslint' is not recognized as an internal or external command`. Lỗi này có từ trước và không thuộc phạm vi T300, vì T300 chỉ có tài liệu (xem INFO 6). Phần thiết lập eslint thuộc T202.
- Kết quả tôi tự chạy không lệch với bằng chứng trong báo cáo.

## Vấn đề vòng 1 → vòng 2
| # v1 | Mức | Đã sửa đúng? | Bằng chứng |
|---|---|---|---|
| 1 Cache sai response | MAJOR | Đạt. Chi tiết ở mục "Quy tắc cache §9.2 ↔ response thật" bên dưới. Còn một khe nhỏ, xem MINOR 1 | UI.md:513-521 |
| 2 Lý do quyết định lần trước | MINOR | Đạt. R17 gọi thêm `GET …/submissions/{seq-1}`, endpoint này có `decision.reason` (API_GD2:571) | UI.md:159, :313, :315 |
| 3 Lối tắt FR16.5 | MINOR | Đạt. Có 2 lối tắt không lọc đợt. Badge dựa trên `item.round.registrationOpen`, trường này có trong item §9.1 (API_GD2:610). §2.7 đã giữ chỗ cho dashboard. Bảng việc chưa ghi phần này vào T504, xem MINOR 3 | UI.md:197, :130 |
| 4 U4 | MINOR | Đạt. Chọn phương án (b) và ghi rõ hệ quả | UI.md:350-351, :533 |
| 5 Quy tắc ô mức `null` | MINOR | Đạt. Dùng một quy tắc chung trong `SimilarityBadge`, áp cho R4, R6, R11, R12, R16, R17 | UI.md:284-287 |
| 6 Lớp không có `name` | MINOR | Đạt. Khớp API_GD2:267 | UI.md:340 |
| 7 "ẩn khi ADMIN" | MINOR | Đạt | UI.md:326 |
| 8 Tham chiếu "mục 2.5" và câu R13 | MINOR | Đạt | UI.md:6, :466 |
| 9 `next` chứa `\` | MINOR | Đạt. Chỉ dùng `navigate()`, có unit test ở T302 | UI.md:33 |
| 10 Lĩnh vực ngừng dùng | MINOR | Đạt. Cách nhận biết đúng: SV không được dùng `includeInactive=true` (API_GD2:264) | UI.md:223 |
| 11 lint | INFO | Chưa sửa, đúng là ngoài phạm vi T300 | – |
| 12 Tăng tham số đợt | INFO | Đạt. R10 có hướng dẫn, R24 có cảnh báo. Gốc vấn đề đã ghi vào mô tả T600 (BANG_CONG_VIEC:75) | UI.md:254, :352 |

## Quy tắc cache §9.2 ↔ response thật
| Endpoint | Response (API_GD2) | Quy tắc UI | Khớp? |
|---|---|---|---|
| `PUT /api/topics/:id` | 200 `{ topic }` (:360) | `setQueryData(['topic'])` + invalidate `similarity-latest`, `topics` | Đạt |
| `POST …/similarity-checks` | 200 `{ similarityCheck }`, không có `topic` (:464) | Chỉ hiện `r.similarityCheck` và invalidate. Không `setQueryData` vì vị trí `isStale` trong response `latest` chưa rõ (:459) | Đạt |
| `POST …/actions` | `{ topic }`. SUBMIT/RESUBMIT trả thêm `submission`, `similarityCheck` cùng cấp (:526-527) | `setQueryData(['topic'], r.topic)` và invalidate đủ. Khóa `['submission', id]` khớp theo tiền tố và không nhầm với `['submissions', id]`. `['invitations']` cho REQUEST_ADVISOR khớp §6:432 | Đạt |
| Lời mời: tạo / accept / decline / cancel | `{ invitation }` · `{ invitation, topicId }` · 200 · 200 (:370, :382, :384-385) | Chỉ invalidate, không `setQueryData`. Accept có `topicId` trong response | Đạt |
| `POST …/leader` | `{ topic }` (:393) | Invalidate. Có thể `setQueryData` nhưng invalidate vẫn đúng | Đạt |
| Lỗi FR06 khi gửi | `details.similarityCheck`, lần kiểm đã được lưu (§8.2 bước 4, :534-537) | Invalidate `topic`, `similarity-latest`, `topics` | Đạt, nhưng chưa phủ các lỗi khác xảy ra sau bước 4 (MINOR 1) |
| `submission-diff` | Snapshot bất biến | Không invalidate | Đạt |

## Phân chủ §9.1 và phụ thuộc trên bảng việc
- Mỗi thành phần có đúng một chủ, không chồng lấn:
  - `SimilarityBadge` thuộc T303, `SimilarityPanel` thuộc T305.
  - Khung R6 và `TopicActionBar` thuộc T306. T305 gắn action SV, T307 gắn nút "Xét duyệt".
  - R15 (phía GV và phía cán bộ) thuộc T306. R4 và R25 thuộc T308.
  - `Toast`, `FormField`, `applyServerErrors`, `useCooldown` thuộc T301. Tài liệu ghi thống nhất ở §1.3:38, §7:423 và §9.1.
- Phụ thuộc trên bảng việc khớp §9.1:501-508:
  - T305 phụ thuộc T303, T212a, T306 (đã bỏ T213).
  - T306 phụ thuộc T303, T210.
  - T307 phụ thuộc T303, T212b, T213, T305.
  - T308 phụ thuộc T303, T213.
  - T309 phụ thuộc T305–T308.
- Phụ thuộc gián tiếp đều có:
  - T305 cần T208 và T211, có qua T212a (→ T210 → T208; → T211).
  - T306 cần T209, có qua T210 → T208 → T209.
  - T307 gắn nút vào R6, có T306 qua T305.
- Không có vòng phụ thuộc. Chuỗi FE là T301 → T302 → T303 → T306 → T305 → T307. T304 và T308 chạy nhánh song song.
- Mô tả T301, T306, T308 trên bảng đã ghi thêm phần được giao. T209 đã có `permissions.viewHistory`, T210 đã có thứ tự `createdAt ASC, id ASC`, T600 đã có `latestSimilarityStatus` và INFO 12.

## Các quyết định mới ↔ đặc tả và hợp đồng
| Quyết định | Kết quả | Ghi chú |
|---|---|---|
| Q1: không thêm `latestSimilarityStatus` ở GĐ2 | Đạt | Giữ đúng lập luận vòng 1. Quy tắc 5 vẫn được bảo đảm: danh sách hiện "—", không bao giờ hiện "không trùng" (UI.md:286) |
| Q5: bộ lọc GVHD dùng `GET /api/users?role=LECTURER` | Đạt | Endpoint có trong API §3.2 (:180). Ma trận §3.1 cho STAFF xem LECTURER/STUDENT trong phạm vi khoa. `userListQuerySchema` có `role`, `q`. Không lọc `facultyId` thì server tự giới hạn theo phạm vi, nên không bị 403. Không có cờ loại GV bị khóa, nên GV đã khóa vẫn hiện, đúng mục đích lọc đề tài cũ. `id` trả về dùng được cho `lecturerId` của `GET /api/topics` (§9.1, GVHD hiện hành). Cán bộ thấy email GV, điều này nằm trong quyền sẵn có ở R18. Bộ lọc chỉ dành cho STAFF, khớp UI.md:146, :193 |
| Q6(c): R15 phía cán bộ giao T306 | Đạt | `GET /api/advisor-requests` cho STAFF xem trong phạm vi (:440). Item có `lecturer.fullName` và `pendingDays`. Phía cán bộ chỉ đọc, không có nút, đúng với FR16.4: cán bộ được báo, không phải là tác nhân. Một route có một chủ. Còn thiếu endpoint đợt cho bộ lọc, xem MINOR 2 |
| U4 phương án (b) | Đạt | Khớp đặc tả mục 8 ("lưu trong cấu hình đợt"). PATCH `config` thay toàn bộ phần ghi đè (:296). `roundConfigInputSchema` là partial nên gửi đủ khóa vẫn hợp lệ. STAFF nhận cả `config` và `effectiveConfig` (:279). Có một hệ quả nhỏ về AuditLog, xem INFO 5 |
| Ngoại lệ 1 (R15) | Đạt | Với WAITING_ADVISOR + LECTURER, `availableActions` chỉ trả ACCEPT_ADVISING và DECLINE_ADVISING (`transitions.js:7-8`). Không có đường đi ngoài TRANSITIONS |

## Đối chiếu đặc tả
| Điều kiện đạt | Đạt? | Ghi chú |
|---|---|---|
| Đủ vai trò; admin không có quyền nghiệp vụ (FR25) | Đạt | Không đổi so với vòng 1. Bộ lọc GVHD chỉ dành cho STAFF |
| Route ↔ endpoint ↔ quyền đúng API_GD2 | Đạt | Hai lỗi của vòng 1 đã sửa. R15 còn thiếu một endpoint trong cột (MINOR 2) |
| Hành động chỉ theo `availableActions`/TRANSITIONS | Đạt | §5.1 không đổi. Ngoại lệ 1 dùng hàm của shared |
| Tải/rỗng/lỗi; ánh xạ mã lỗi tiếng Việt | Đạt | Không giảm so với vòng 1 |
| Quy tắc 5 (lỗi FR06 không bao giờ là "không trùng") | Đạt | Quy tắc chung `SimilarityBadge` (UI.md:283-287) |
| FR07/FR17: xét duyệt gắn snapshot, có lý do lần trước, có so sánh | Đạt | R17 dùng `submissionId`, lần `seq-1` và R13 |
| FR16.5: cán bộ thấy đề tài kẹt | Đạt | Có lối tắt ở R4. Tiện ích dashboard đã giữ chỗ cho T504, nhưng bảng việc chưa ghi (MINOR 3) |
| NFR06, NFR07, NFR01 | Đạt | Không đổi. Thêm `<dialog>` và data router |

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| 1 | MINOR | `docs/agents/design/UI.md:519-521` | Nhóm "sau lỗi có ghi dữ liệu" mới chỉ có `JUSTIFICATION_REQUIRED` và `SIMILARITY_NOT_CHECKED`. Theo API §8.2, mọi lỗi xảy ra **sau bước 4** của SUBMIT/RESUBMIT đều để lại một `SimilarityCheck` đã lưu. Các lỗi đó gồm `CONCURRENT_UPDATE` hoặc `INVALID_TRANSITION` ở bước 6 (người khác ghi chen giữa), 503 `SERVICE_BUSY`, 500 và mất mạng (lúc này không biết lần gửi đã thành công hay chưa). §7:439 chỉ invalidate `['topic', id]`, nên `['similarity-latest', id]` ở R10 vẫn giữ lần kiểm cũ. Chưa vi phạm quy tắc 5, vì server luôn kiểm lại khi gửi, nhưng panel R10 có thể hiện sai kết quả và bước 2 có thể tự chạy kiểm lại không cần thiết | Với mutation SUBMIT/RESUBMIT, dùng `onSettled` (thành công, mọi lỗi, kể cả mất mạng) để invalidate `['topic', id]`, `['similarity-latest', id]`, `['topics']`, `['submissions', id]`. Như vậy không phải liệt kê từng mã lỗi. T305 làm được mà không cần đổi hợp đồng |
| 2 | MINOR | `docs/agents/design/UI.md:157` (R15), `:301` | Phía cán bộ "lọc theo đợt (`roundId`)" cần danh sách đợt, nhưng cột Endpoint của R15 không có `GET /api/rounds` (API §4.3). R16 thì có liệt kê | Thêm `GET /api/rounds` (API §4.3, cán bộ, cho bộ lọc đợt) vào cột Endpoint của R15 |
| 3 | MINOR | `docs/agents/design/UI.md:130`; `docs/agents/BANG_CONG_VIEC.md:68` | §2.7 giao tiện ích "Đề tài kẹt sau khi đóng đăng ký" (FR16.5, đặc tả: "trên dashboard") cho T504. Mô tả T504 trên bảng việc chưa có mục này, và mục "Việc cho điều phối viên" trong báo cáo cũng không nhắc. Nếu để vậy, T504 dễ bỏ sót một điều kiện đạt của FR16 | Điều phối viên thêm vào mô tả T504: "tiện ích đề tài kẹt sau khi đóng đăng ký (FR16.5, §2.7 `design/UI.md`)" |
| 4 | INFO | `docs/agents/design/UI.md:394` | Ngoại lệ 2 ghi "khi API §5.1 có trường này, T306 đổi…". Hiện T209 đã nhận việc thêm `permissions.viewHistory`, và T306 phụ thuộc gián tiếp vào T209, nên khi T306 bắt đầu thì trường này đã có. Như vậy, nếu không có gì thay đổi, T306 không cần dùng ngoại lệ này | Khi T209 cập nhật API §5.1, kiến trúc sư bỏ Ngoại lệ 2 (hoặc chỉ giữ làm phương án dự phòng). Không chặn duyệt |
| 5 | INFO | `docs/agents/design/UI.md:351`, `:533` (U4) | Gửi đủ `config` cũng có nghĩa là lần sửa đầu tiên của một đợt có `config` partial (tạo bằng seed hoặc API) sẽ ghi AuditLog `ROUND_UPDATE` có `config` before/after khác nhau, dù tham số hiệu lực không đổi | Chấp nhận được. T206 có thể ghi thêm `effectiveConfig` before/after để người đọc log phân biệt. Không bắt buộc |
| 6 | INFO | `package.json` (script `lint`) | `npm run lint` vẫn hỏng vì chưa cài eslint. Lỗi ngoài phạm vi T300 | T202 xử lý |

Ghi chú: tôi đồng ý với 2 MINOR trong `T300-frontend-dev-v2.md`: form R7 chỉ `reset` có chủ đích, và việc phân chủ phần chuyển hướng `mustChangePassword` giữa T301, T302, T303. Các MINOR ở trên và 2 MINOR của FE đều là hướng dẫn cài đặt, không phải lỗi thiết kế. Có thể bổ sung vào UI.md khi T301/T305 nhận việc, không cần thêm một vòng review.

Kết luận: APPROVED – 0 BLOCKER, 0 MAJOR, 3 MINOR, 3 INFO.
