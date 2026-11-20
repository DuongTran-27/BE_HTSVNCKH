# TASK-DC-21, TASK-DC-22, TASK-DC-23 – E2E Playwright cho tuyển SV, hội đồng, hồ sơ/SSO/Kanban/Excel

Trạng thái: DONE (reviewer v1 APPROVED) · FR27, FR28, FR30–FR39, NFR07 · Vai: QA (kiem-thu)

Kỳ vọng lấy từ `docs/DAC_TA.md` (FR28–FR39, bảng chuyển trạng thái, mục 9 M1/M2/M4/NT), `design/UI.md` §12, `design/API_GD7.md` (mã lỗi §1.3, §5.1, §6.2–6.3, §7.4, §10.1). Mỗi spec chạy ở cả hai project của `playwright.config.js`: `desktop` (Desktop Chrome 1280×720) và `mobile` (360×740, NFR07), mỗi project dùng bộ dữ liệu riêng (tiền tố `E2E`/`M36`). Không sửa code sản phẩm.

## Dữ liệu (apps/web/e2e/prepare.js – thêm vào `buildDataset`)
Tài khoản/đề tài mới, chỉ các spec mới dùng (không đụng dữ liệu spec cũ, không phụ thuộc thứ tự file):
- `rec`: GV `GV{P}R` (chưa có đề tài – không chạm hạn mức FR16), SV `SV{P}RA`, `SV{P}RB` (chưa có đề tài – FR03); nội dung đề tài = nội dung đề tài đang thực hiện đầu tiên của seed (FR06 ra HIGH).
- `def`: GVHD `GV{P}D`, GV hội đồng `GV{P}H1/H2/H3`, SV `SV{P}D`; đề tài IN_PROGRESS có mốc bắt buộc Đạt + tài liệu `stage=FINAL`, `READY` (dạng LINK, không cần Cloudinary).
- `dc23`: SV `SV{P}P` (hồ sơ), GV `GV{P}K` + SV `SV{P}K`, đề tài IN_PROGRESS có mốc 1 đã nộp chưa đánh giá (Chờ đánh giá) và mốc 2 Đạt.

## TASK-DC-21 – `apps/web/e2e/dc21.spec.js` (serial, 4 test × 2 project)
| Mã | FR | Nội dung |
|---|---|---|
| TC-FR31-E01 | FR31, FR06 | GV vào R26 → "Công bố đề tài tuyển sinh viên" → tạo nháp → soạn (yêu cầu ứng viên, số SV = 2) → trang công bố: panel HIGH, nút "Công bố tuyển sinh viên" disabled khi chưa/giải trình ngắn, enabled khi đủ → công bố; DB `RECRUITING` |
| TC-FR32-E02 | FR32 | 2 SV ứng tuyển từ bảng tin; sau gửi: "Đang chờ duyệt", form ẩn (1 đơn hiệu lực); SV B không thấy tên SV A; DB 2 đơn PENDING |
| TC-FR33-E03 | FR33 | GV nhận SV A ("1/2 đã nhận"), từ chối SV B (thiếu lý do → hộp vẫn mở), chốt nhóm → DB `HAS_ADVISOR`, thành viên duy nhất SV A là `LEADER` (người nhận đầu tiên); SV B thấy "Bị từ chối" + lý do ở R28 |
| TC-FR33-E04 | FR33, FR05, FR07 | Trưởng nhóm vào đề tài từ R28 → gửi xét duyệt (HIGH, giải trình) → cán bộ duyệt → DB `IN_PROGRESS` |
Mọi màn chính kiểm `overflowX <= 0` (ý nghĩa ở project mobile 360 px).

## TASK-DC-22 – `apps/web/e2e/dc22.spec.js` (serial, 5 test × 2 project)
| Mã | FR | Nội dung |
|---|---|---|
| TC-FR34-E01 | FR34 | Hộp "Đề nghị ra hội đồng": 4,5 → gợi ý tại chỗ "(dưới 5,0)", gửi → thông điệp server `PROCESS_SCORE_TOO_LOW`, hộp mở, DB vẫn `IN_PROGRESS` và **0** `ProcessScore`; 7,5 → `WAITING_DEFENSE`, R6 "Chờ khoa phân công hội đồng." |
| TC-FR35-E02 | FR35, FR25 | Cán bộ lập hội đồng (Chủ tịch H1, Thư ký H2, Ủy viên = GVHD) → hộp gán: đề tài đánh dấu "Xung đột: GVHD là thành viên hội đồng", checkbox disabled; gọi thẳng API `POST /councils/:id/assignments` → 409 `CONFLICT_OF_INTEREST`, `details.conflicts` đúng, DB 0 phân công; sửa Ủy viên → H3 → gán được ("Đã chấm 0/3"); đưa GVHD trở lại khi đã gán → hộp lỗi "{GV} là GVHD của đề tài {mã}", thành viên trong DB giữ nguyên |
| TC-FR36-E03 | FR36 | H1 (8,5), H3 (7,25), H2 (9) chấm qua R33 → R34; ủy viên sau khi tải lại không thấy nhận xét của Chủ tịch và không có "Bảng điểm hội đồng"; DB 3 điểm |
| TC-FR37-E04 | FR37 | Thư ký: hộp 2 bước hiện 8,25 + "Đạt – Tốt"; Hủy ở bước 2 → vẫn `WAITING_DEFENSE`; chốt lại → `WAITING_CLOSE`, `finalScore` 8.25 `PASSED`, kết quả hiện hành `GOOD`; Chủ tịch không còn nút Lưu/Cập nhật điểm |
| TC-FR27-E05 | FR27, FR08 | Cán bộ "Xác nhận đóng đề tài" → `CLOSED`; `/kho?q=` có đề tài; SV mở R6 thấy khối "Bảo vệ trước hội đồng" 8,25, Đạt, mã hội đồng `HD-yyyy-nnn` |

## TASK-DC-23 – `apps/web/e2e/dc23.spec.js` (4 test độc lập × 2 project)
| Mã | FR | Nội dung |
|---|---|---|
| TC-FR30-E01 | FR30, FR15 | `/ho-so`: không có ô sửa họ tên/email; SĐT `0123 45` → "Số điện thoại không hợp lệ", DB vẫn null; `0912 345 678` → "Cập nhật thành công", DB `0912345678` (chuẩn hóa), đúng 1 AuditLog `PROFILE_UPDATE`; tải lại vẫn hiện số |
| TC-FR28-E02 | FR28 | `GET /api/auth/providers` → `google: false`; không có link Google, form mật khẩu còn; `sso_error=NO_ACCOUNT`/`DOMAIN_NOT_ALLOWED`/mã lạ → đúng thông điệp UI §12.3, `sso_error` bị xóa khỏi URL; `GET /api/auth/google/start` → 404 |
| TC-FR38-E03 | FR38 | GVHD chỉ dùng bàn phím (focus nút "Chuyển … sang…", Enter, mũi tên, Enter; gõ nhận xét; Enter trên nút gửi): menu chỉ gồm cột hợp lệ (Chờ đánh giá → {Đạt, Cần bổ sung}; Đạt → {Cần bổ sung}); `aria-live` đọc "Đã chuyển … sang …"; thẻ sang cột mới; DB: feedback `PASSED` + mốc PASSED, mốc mở lại → `NEEDS_WORK`; SV: không có nút chuyển, không có `draggable` |
| TC-FR39-E04 | FR39 | Cán bộ `/thong-ke` → "Xuất Excel": sự kiện download, tên `.xlsx`, file > 0 byte, bắt đầu `PK`; đọc bằng `exceljs` (đã có trong repo, hoisted từ apps/api): có sheet "Thống kê" và "Danh sách đề tài", số dòng dữ liệu = `total` của `/api/stats` mà trang đã tải |

## File
- `apps/web/e2e/prepare.js` (sửa: thêm dữ liệu `rec`, `def`, `dc23` cho mỗi project)
- `apps/web/e2e/dc21.spec.js`, `apps/web/e2e/dc22.spec.js`, `apps/web/e2e/dc23.spec.js` (mới)
- `apps/web/playwright.config.js` (sửa: mỗi project gửi `X-Forwarded-For` riêng – `10.209.0.1` desktop, `10.209.0.2` mobile; xem mục Lỗi tìm thấy)

## Bằng chứng chạy
- Lần chạy đầu toàn bộ (trước khi sửa config): `7 failed, 93 passed (13.0m)`. 7 ca cuối của project mobile (`m5.spec.js` ×3, `roles.spec.js` ×4) treo ở `login` với màn "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại." – không phải ca mới hỏng mà do bộ 100 ca vượt giới hạn `POST /api/auth/refresh` 300/15 phút/IP (mọi `page.goto` khởi động lại SPA gọi refresh một lần; cả bộ chạy chung một IP qua proxy Vite). Ca đỏ bắt đầu từ #94 và đỏ liên tục tới hết = đặc trưng hết hạn mức cửa sổ.
- Sửa ở hạ tầng test (không đổi code sản phẩm, không nới giới hạn): mỗi project là một máy khách riêng qua `X-Forwarded-For` (API `trust proxy 1`), mỗi project ~50 ca ≈ 160 lần refresh < 300.
- `npm run test:e2e -w @nckh/web` lần 2: `100 passed (6.2m)`, exit 0.
- `npm run test:e2e -w @nckh/web` lần 3 (liên tiếp): `100 passed (6.2m)`, exit 0; 26 ca mới (13 × 2 project) đều ✓. Hai lần cho cùng kết quả, không có ca chập chờn.
- Tổng: 74 ca cũ + 26 ca mới = 100.
- `npm run lint` (`eslint . --max-warnings 0`): exit 0.
- Không sửa code sản phẩm nên không chạy `npm test`.

## Lỗi tìm thấy
| ID | Mức | Trạng thái | Ghi chú |
|---|---|---|---|
| – | – | – | Không có lỗi sản phẩm làm ca mới đỏ. Không sửa code sản phẩm. |

Phát hiện (chưa mở BUG, để reviewer quyết):
- Hạn mức refresh 300/15 phút/IP làm bộ E2E đỏ khi vượt ~93 ca; đã xử lý bằng IP giả theo project. Bộ E2E tiếp tục lớn thì có thể chạm lại (mỗi project ~160/300).
- UX (MINOR, FE): khi `POST /api/auth/refresh` lúc khởi động trả 429, `bootstrapSession` (`apps/web/src/lib/api.js:229`) coi mọi lỗi là `offline` và hiện "Không kết nối được máy chủ…" thay vì thông điệp 429 kèm thời gian chờ theo UI mục 7. Người dùng thật ở NAT lớn có thể gặp. Chưa có test đỏ: muốn có thì cần một ca riêng ép 429 lúc khởi động.

Lệch nhỏ so với UI §12 (không làm test đỏ, không mở BUG, để reviewer quyết):
- R26 nút GV trỏ `/de-tai/moi`, UI §12.1 ghi `/de-tai/moi?nguon=gv` (hành vi tương đương vì trang tự nhận vai GV).
- R28 không có cột GV mà UI §12.6 liệt kê ("đề tài, GV, ngày nộp, trạng thái, lý do").

## Giới hạn
- Kiểm tra 2 người chốt cùng lúc / 2 lần duyệt đơn đồng thời không làm ở E2E (đã có ở integration API: `apps/api/tests/DC06-applications.test.js`, `DC09-scoring.test.js`); E2E chỉ phủ luồng người dùng.
- Kéo thả chuột HTML5 không kiểm ở E2E (task chỉ yêu cầu bàn phím); logic cột có unit test `kanbanColumn` (DC-17).

## Sau review (phiên chính, 2026-11-20)
- MINOR R28 thiếu cột GV (UI §12.6): backend `ApplicationView.topic.advisor { fullName } | null` (`applicationRepo.js` VIEW + `presentApplication`, API_GD7 §4.1), web R28 hiện "GV: …". Test: `DC06-applications.test.js` kỳ vọng `topic.advisor`, `dc14.test.jsx` ca mới "hiện GV của đề tài".
- MINOR R26 `?nguon=gv`: chấp nhận, sửa UI.md theo hành vi hiện tại.
- MINOR 429 lúc khởi động hiện "Không kết nối được máy chủ": **đúng đặc tả** UI §1 (dòng 24, quyết định T301 #5) – không sửa.
- MINOR giới hạn IP E2E: ghi vào `QUY_TRINH.md`.
```
$ npm test → shared 115/115 · api 86 file 1222/1222 · web 39 file 384/384
$ npm run lint → exit 0
```
