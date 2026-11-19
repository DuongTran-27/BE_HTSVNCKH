# TASK-DC-15 – Web: hội đồng R30–R32, ra hội đồng / trả về trên R6, khối bảo vệ + điểm quá trình (FR34, FR35)
- Agent: frontend-dev · Trạng thái: REVIEW · Ngày: 2026-11-20
- Đã đọc: CLAUDE.md, `QUY_TRINH.md`, `design/UI.md` §12.7, §12.8, §12.12, `design/API_GD7.md` §1.1, §1.3, §5, §6, §7.5, báo cáo TASK-DC-13, TASK-DC-14; code backend `councils/{routes,service}.js`, `topics/service.js` (`presentDefense`), `topics/listService.js`.
- Không sửa backend, không đổi hợp đồng API.

## Màn hình đã làm
| Route | Vai trò | Nội dung | Trạng thái đã xử lý |
|---|---|---|---|
| R6 `/de-tai/:id` | LECTURER (GVHD) | Nút "Đề nghị ra hội đồng" (theo `availableActions`) → hộp thoại: điểm quá trình (`type=number`, bước 0,25, schema nhận 2 chữ số thập phân), nhận xét; cảnh báo "Sau khi gửi, sinh viên không nộp hoặc sửa tài liệu được nữa"; điểm < 5 → gợi ý tại chỗ, vẫn gửi được | lỗi theo ô (schema `topicActionSchema` dùng chung + 400 server), `PROCESS_SCORE_TOO_LOW`, `NO_FINAL_REPORT` (+ liên kết tab Tài liệu), `MILESTONES_NOT_PASSED` (liệt kê mốc), `NO_REQUIRED_MILESTONE`, 409 khác hiện trong hộp và tải lại đề tài (gửi lại dùng `version` mới) |
| R6 | STAFF | "Trả về đang thực hiện" (`RETURN_FROM_DEFENSE`): `ReasonDialog` bắt buộc lý do, nhắc "Phân công hội đồng chưa chốt sẽ bị hủy" | lỗi trong hộp; sau mọi lần gửi tải lại đề tài + `['council']`, `['councils']` |
| R6 | GVHD (đề nghị đóng) | `REQUEST_CLOSE` khi `round.effectiveConfig.requireDefense`: hộp xác nhận thêm gợi ý "Đợt này bắt buộc bảo vệ…"; `DEFENSE_REQUIRED` hiện trong hộp (cơ chế có sẵn của `CloseActions`) | |
| R6 | mọi vai trò đọc được phần thực hiện | Khối "Bảo vệ trước hội đồng" theo `topic.defense`: `WAITING_ASSIGNMENT` "Chờ khoa phân công hội đồng"; `ASSIGNED` "Hội đồng {code} – {name}", "Chưa có kết quả"; `DECIDED` điểm cuối lớn, Đạt/Không đạt, bảng điểm từng thành viên (vai trò, họ tên, điểm, nhận xét; dưới `sm` xếp khối). Khối "Điểm quá trình" theo `topic.processScore`. `councilAccess` → dải "Bạn xem với tư cách thành viên hội đồng ({vai trò}) – chỉ đọc" + nút "Đến màn chấm" → `/cham-bao-ve/:assignmentId` | `defense = null` → không hiện khối; `processScore = null` → không hiện |
| R30 `/hoi-dong` | STAFF | Bảng lưới (≥ `lg`) / thẻ: mã, tên, đợt, chủ tịch, số thành viên, số đề tài, badge "Đã có điểm" (`locked`). Lọc đợt + `q` trên URL, phân trang server, nút "Lập hội đồng" | đang tải, rỗng ("Chưa có hội đồng nào trong đợt này." / có lọc), lỗi + Thử lại |
| R31 `/hoi-dong/moi` | STAFF | Đợt, tên, ba khối Chủ tịch (1) / Thư ký (1) / Ủy viên (1–5, nút thêm/bớt). Một ô "Tìm giảng viên" chung gọi `GET /users?role=LECTURER&isLocked=false&facultyId={khoa của đợt}&q=`; GV đã chọn ở ô khác bị `disabled` (làm mờ). Validate `councilCreateSchema`. Thành công → R32 | lỗi theo ô, lỗi `members` hiện đầu khối (schema và 400 server), `CONFLICT_OF_INTEREST` liệt kê `details.conflicts` |
| R32 `/hoi-dong/:id` | STAFF; LECTURER thành viên (chỉ đọc) | Trái 1/3: đợt, badge "Đã có điểm", thành viên; "Sửa tên và thành viên" (ẩn khi `locked`) → form tên + thành viên (PATCH tên rồi PUT thành viên với `version` mới). Phải 2/3: bảng đề tài gán (mã, tên → R6, GVHD, trạng thái, "Đã chấm x/y", điểm cuối, Đạt/Không đạt), "Hủy gán" chỉ ở dòng chưa chốt và `scoredCount = 0` (`ReasonDialog`). "Gán đề tài" → hộp `sm:max-w-3xl`: danh sách `GET /topics?status=WAITING_DEFENSE&councilAssigned=false&roundId=`, ô tìm, chọn nhiều; đề tài có GVHD là thành viên → nền đỏ "Xung đột: GVHD là thành viên hội đồng", ô chọn bị khóa | `COUNCIL_LOCKED` → đóng form + toast, khối về chỉ đọc; `CONFLICT_OF_INTEREST` (liệt kê), `TOPIC_ALREADY_ASSIGNED`/`NOT_WAITING_DEFENSE` (liệt kê `details.topicCodes`) – hộp vẫn mở; `ASSIGNMENT_HAS_SCORES` → thêm gợi ý dùng "Trả về đang thực hiện" ở trang đề tài; 403/404 qua `QueryBox`; GV: dải "Bạn là thành viên hội đồng – chỉ đọc", không nút |

Menu cán bộ thêm "Hội đồng". `SCREENS`: `hoi-dong`, `hoi-dong/moi` [STAFF], `hoi-dong/:id` [STAFF, LECTURER]; thêm `cham-bao-ve`, `cham-bao-ve/:assignmentId` [LECTURER] dùng **trang tạm** (Placeholder) để liên kết "Đến màn chấm" và liên kết thông báo có đích – DC-16 thay bằng R33/R34 và thêm mục menu.

## Quyết định thiết kế
- **`TopicDetail.defense = null` sau `RETURN_FROM_DEFENSE`** (ghi chú từ DC-09, lệch chữ GD7 §7.5): theo chỉ đạo, khi `defense` null thì **không hiện khối bảo vệ** (không hiện "đã ra hội đồng"). Điểm quá trình cũ vẫn hiện vì `processScore` là dữ liệu riêng (bản mới nhất). Reviewer/kien-truc-su quyết nếu muốn hiện lịch sử.
- Form "Đề nghị ra hội đồng" dùng thẳng `topicActionSchema` của shared (nhánh `REQUEST_DEFENSE`) làm resolver, không chép luật điểm/nhận xét.
- `EXEC_STATUSES` thêm `WAITING_DEFENSE`: tab Mốc/Tiến độ và mục "Kết quả cuối" vẫn hiện khi chờ bảo vệ (GVHD, nhóm, thành viên hội đồng đọc được theo GD7 §1.1). Quyền ghi vẫn theo `permissions` của server.
- Biên bản (`minutes`) không có trong `TopicDetail.defense`; nội dung biên bản là `summary` của kết quả cuối nguồn hội đồng (GD7 §7.4 bước 6), đã hiện ở mục "Kết quả cuối" – không gọi thêm API.
- Ô chọn GV: một ô tìm chung + `<select>` cho từng vị trí (không thêm thư viện combobox). Tên GV đã chọn được nhớ lại để ô không mất nhãn khi đổi từ khóa.
- Điểm hiển thị kiểu Việt Nam (`fmtScore`: "7.25" → "7,25"), giữ chuỗi thập phân của server, không đổi sang số thực.
- Invalidate: ghi hội đồng → `['council']`, `['councils']`, `['topics']`; đề nghị/trả về → `invalidateAfterAction` + `invalidateExec` + `['council']`, `['councils']` (UI §12.12).

## File thay đổi
| File | Thay đổi |
|---|---|
| `apps/web/src/components/DefenseActions.jsx` | mới – nút + hộp `REQUEST_DEFENSE`, `RETURN_FROM_DEFENSE` |
| `apps/web/src/components/DefenseSection.jsx` | mới – khối bảo vệ, điểm quá trình, dải thành viên hội đồng |
| `apps/web/src/pages/councils/CouncilListPage.jsx` | mới – R30 |
| `apps/web/src/pages/councils/CouncilCreatePage.jsx` | mới – R31 (+ `useRounds`) |
| `apps/web/src/pages/councils/CouncilDetailPage.jsx` | mới – R32: sửa, gán, hủy gán |
| `apps/web/src/pages/councils/CouncilMembersFields.jsx` | mới – khối Chủ tịch/Thư ký/Ủy viên dùng chung R31, R32 |
| `apps/web/tests/dc15.test.jsx` | mới – 26 test |
| `apps/web/src/components/TopicActionBar.jsx` | gắn `DefenseActions` |
| `apps/web/src/components/CloseActions.jsx` | gợi ý `requireDefense` ở hộp đề nghị đóng |
| `apps/web/src/pages/topics/TopicDetailPage.jsx` | gắn dải hội đồng, khối bảo vệ, điểm quá trình |
| `apps/web/src/lib/execution.js` | `EXEC_STATUSES` + `WAITING_DEFENSE` |
| `apps/web/src/lib/format.js` | `fmtScore` |
| `apps/web/src/lib/nav.js`, `apps/web/src/routes.jsx` | 5 route, menu cán bộ |
| `docs/agents/BANG_CONG_VIEC.md` | DC-15 → REVIEW |

## Điều kiện đạt ↔ test (`apps/web/tests/dc15.test.jsx`, 26 test)
| Điều kiện (UI §12.7, §12.8) | Test | Kết quả |
|---|---|---|
| Hộp đề nghị ra hội đồng: validate, cảnh báo khóa tài liệu | "validate bằng schema dùng chung…" | đạt |
| Điểm < 5 gợi ý tại chỗ, vẫn gửi; `PROCESS_SCORE_TOO_LOW`; body đúng | "điểm < 5 hiện gợi ý…" | đạt |
| Gửi thành công → khối "Chờ khoa phân công" | "gửi thành công…" | đạt |
| `NO_FINAL_REPORT` (link Tài liệu), `MILESTONES_NOT_PASSED` | "NO_FINAL_REPORT có liên kết…" | đạt |
| Nút theo `availableActions` | "không có REQUEST_DEFENSE…" | đạt |
| `REQUEST_CLOSE` + `requireDefense`, `DEFENSE_REQUIRED` | "REQUEST_CLOSE khi đợt bắt buộc bảo vệ…" | đạt |
| Trả về: lý do bắt buộc, nhắc hủy phân công | "lý do bắt buộc, nhắc hủy phân công…" | đạt |
| Khối bảo vệ 3 trạng thái, bảng điểm, điểm quá trình, `defense = null`, `councilAccess` | 5 test nhóm "R6 – khối bảo vệ…" | đạt |
| R30 bảng, lọc, rỗng, lỗi; menu/quyền vào | 3 test nhóm "R30" | đạt |
| R31 validate, làm mờ GV đã chọn, thêm/bớt ủy viên (tối đa 5), body + điều hướng, lỗi `members` | 3 test nhóm "R31" | đạt |
| R32 bảng gán, hủy gán chỉ dòng chưa điểm, GV chỉ đọc, `locked` | 3 test đầu nhóm "R32" | đạt |
| Gán: xung đột đỏ + không chọn được, tham số lọc, body; `CONFLICT_OF_INTEREST`/`NOT_WAITING_DEFENSE` liệt kê | 2 test "gán đề tài…" | đạt |
| Hủy gán `ASSIGNMENT_HAS_SCORES`; sửa PATCH→PUT version mới, `CONFLICT_OF_INTEREST`; `COUNCIL_LOCKED` | 3 test cuối | đạt |

## Bằng chứng chạy lệnh
```
$ npm run lint                      → exit 0 (eslint . --max-warnings 0, không lỗi)
$ npx vitest run tests/dc15.test.jsx (apps/web)   → Tests 26 passed (26)
$ DB_TEST_DRIVER=embedded npm run db:test:up ; npm run db:test:reset
  Kiểm tra DB test: tất cả OK. / DB test đã chạy. / Đã reset DB test (migrate reset).
$ npm test                          → EXIT=0
  shared  Test Files 8 passed (8)    Tests 115 passed (115)
  api     Test Files 84 passed (84)  Tests 1217 passed (1217)
  web     Test Files 36 passed (36)  Tests 351 passed (351)   (26 test mới của DC-15)
$ npm run build -w @nckh/web        → ✓ built in 655ms
$ npm run test:e2e -w @nckh/web     → EXIT=0, 74 passed (4.7m)
```

## Còn lại / rủi ro
- `/cham-bao-ve*` hiện là trang tạm (DC-16 làm R33/R34 + mục menu "Chấm bảo vệ").
- Chưa kiểm tay bằng trình duyệt ở 360 px và dark mode; dùng `bg-card`, lưới chỉ ở `lg`, bảng điểm xếp khối dưới `sm`, nút `min-h-11`.
- Chưa có E2E luồng hội đồng (ngoài phạm vi task; 74 E2E cũ vẫn chạy).
- Danh sách GV trong ô chọn lấy tối đa 100 người mỗi lần tìm (`pageSize=100`); khoa lớn hơn cần gõ tìm.

## Câu hỏi cho reviewer
1. `defense = null` sau trả về: chấp nhận không hiện khối (quyết định hiện tại), hay cần backend trả `state` riêng cho "đã từng ra hội đồng"?
2. Thêm `WAITING_DEFENSE` vào `EXEC_STATUSES` (hiện tab Mốc/Tiến độ khi chờ bảo vệ) – đồng ý?
