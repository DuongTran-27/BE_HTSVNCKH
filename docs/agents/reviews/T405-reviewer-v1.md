# Review T405 – reviewer – vòng 1
Kết luận: APPROVED

## Tôi đã tự kiểm tra
- Đọc: `CLAUDE.md`, `docs/agents/QUY_TRINH.md`, `docs/DAC_TA.md` (FR27, mục 5 bảng chuyển trạng thái), `docs/agents/design/API_GD45.md` §1.1–§1.2, §2, §7, `docs/agents/reports/T405.md`.
- Code: `git diff` (topics/{stateMachine,service,prismaRepo,routes}.js, execution/feedbackService.js, shared/{schemas,transitions}.js, tests T209/T404) + file mới `closeConditions.js`, `closeRepo.js`, `closeService.js`, `tests/T405-close.test.js`. Không xét 5 script `apps/api/scripts/*` (ngoài phạm vi).
- `git status`: `apps/api/tests/stateMachine.test.js` **không đổi**.
- Lệnh tự chạy:
```
$ npm run db:test:up        → Kiểm tra DB test: tất cả OK. DB test đã chạy.
$ npm run lint              → eslint . (không lỗi)
$ npm test
 Test Files  6 passed (6)    Tests  68 passed (68)
 Test Files  46 passed (46)  Tests  578 passed (578)
 Test Files  20 passed (20)  Tests  144 passed (144)
```
Khớp "Bằng chứng chạy lệnh" trong báo cáo.

## Đối chiếu đặc tả
| Điều kiện đạt | Đạt? | Ghi chú |
|---|---|---|
| FR27.1 GVHD gửi đóng khi mọi mốc bắt buộc Đạt + kết quả cuối có nhận xét của GVHD → Chờ đóng | Đạt | `closeConditions.js` (G24, G25); test REQUEST_CLOSE + G25 (GV cũ) |
| CAU_HOI #8: không mốc bắt buộc → 409 `NO_REQUIRED_MILESTONE` | Đạt | `stateMachine.js:42`, chỉ khi `=== 0` nên ctx cũ không đổi hành vi; test cả "không mốc" và "chỉ mốc không bắt buộc" |
| `MILESTONES_NOT_PASSED` kèm `details.milestones` (≤20) | Đạt | `evaluateClose` cắt 20; test DB kiểm tên mốc |
| FR27.2 Cán bộ trả lại (lý do) / xác nhận đóng | Đạt | 400 thiếu lý do, 403 GVHD/cán bộ khoa khác, StatusHistory có `reason` |
| FR27.3 Kiểm lại ngay lúc đóng, theo đánh giá hiện hành, dưới khóa | Đạt | `closeService.js` gọi lại `checkTransition` với điều kiện đọc bằng `tx` trong `extra` (sau `updateMany` giữ khóa); test DB mốc bị đổi NEEDS_WORK khi WAITING_CLOSE → 409; unit trước-đạt/dưới-khóa-không-đạt → không audit; test đua REQUEST_CLOSE ‖ tạo mốc |
| FR27.4 Sau đóng chỉ đọc, kết quả không sửa qua §6.4, đóng đạt vào kho | Đạt | `POST results` 409 `TOPIC_NOT_IN_PROGRESS`; `/api/repository` chứa đề tài |
| FR27.5 Hết hạn, chưa đủ điều kiện → đóng Không đạt, bắt buộc lý do | Đạt | Đúng §7.3: hạ bản hiện hành trước, tạo `ResultVersion FAIL`, `summary 'Đóng do hết hạn đợt: ' + reason`, `createdById` = cán bộ, version max+1; `ROUND_NOT_ENDED`, `CLOSE_CONDITIONS_MET` (G26) kiểm sớm và kiểm lại dưới khóa |
| Bảng chuyển trạng thái chỉ ở `transitions.js` | Đạt | `TRANSITIONS` không đổi; chỉ thêm `ENABLED_ACTIONS` dẫn xuất từ `TRANSITIONS`; mọi luật đi qua `checkTransition` |
| Mọi chuyển trạng thái ghi StatusHistory, trong transaction | Đạt | `applyTransition` (withLockTx); lỗi 409 không ghi (test đếm 0) |
| FR25 quyền backend, ADMIN 403 | Đạt | `requireRole` route + `checkTransition`; test ADMIN 403 cho REQUEST_CLOSE và CLOSE_EXPIRED; SV ngoài 403 trước khi lộ trạng thái (`canView` trước) |
| CAU_HOI #9 SV thấy kết quả ngay | Đạt | `currentResult` (không `summary`) cho mọi người xem được; test SV trưởng nhóm |
| §7.4 TopicDetail (`availableActions`, `round.endAt/ended`, `currentResult`, `closeReadiness`, 7 quyền) | Đạt | Công thức quyền khớp §7.4 từng khóa |
| MINOR m2 T404 (`status === READY`) | Đạt | `feedbackService.js:36` + test UPLOADING → 404 |
| MINOR m3 T404 (tên test "hai GV") | Đạt | Chỉ đổi tên, thân test giữ nguyên |
| Văn bản lỗi tiếng Việt | Đạt | |

## Quyết định về `T209-topics.test.js:64`
**Hợp lệ, không làm yếu test.** Hợp đồng API_GD45 §7.4 bắt buộc thêm 7 khóa vào `permissions`, nên kỳ vọng 5 khóa cũ trở thành sai đặc tả. Bản sửa vẫn dùng `toEqual` (so khớp toàn bộ), giữ nguyên giá trị 5 khóa cũ, và 7 giá trị mới đúng cho SV trưởng nhóm ở DRAFT (đã đối chiếu: `uploadProposal` true vì member+DRAFT, `readExecution` true vì isMember, các quyền cần IN_PROGRESS/GVHD đều false). Agent đã ghi lý do trong báo cáo theo quy tắc 1. Chấp nhận.

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| m1 | MINOR | `apps/api/tests/T405-close.test.js:18-20` | `try { close(...) } catch (e) { expect(...) }` – nếu `close` không ném thì test vẫn xanh, kiểm `details` ở unit thực chất lỏng (test DB dòng 108 đã bù). | Dùng `expect(() => close(...)).toThrow(expect.objectContaining({ code: 'MILESTONES_NOT_PASSED', details: {...} }))` hoặc `expect.assertions(n)`. |
| m2 | MINOR | `apps/api/tests/T405-close.test.js:143` | Nhánh "không đóng" chỉ kiểm `c`, không kiểm `m.status === 201`; cách viết `expect([c.status, [...]]).toEqual([409, expect.arrayContaining([code(c)])])` khó đọc. | `expect(c.status).toBe(409); expect(['MILESTONES_NOT_PASSED','CONCURRENT_UPDATE']).toContain(code(c)); expect(m.status).toBe(201);` |
| m3 | MINOR | `apps/api/src/modules/topics/prismaRepo.js:24` ↔ `apps/api/src/modules/execution/prismaRepo.js:73` | Điều kiện "mốc bị bỏ cờ chưa Đạt" lặp ở hai nơi; sửa một nơi dễ lệch. (§7.3 ghi đọc AuditLog; dùng cột `requiredRemovedAt` của T401 là hợp lý, đã ghi trong báo cáo.) | Export một hằng `REQUIRED_REMOVED_WHERE` dùng chung. |
| m4 | MINOR | `apps/api/src/modules/topics/closeService.js:15,26` | `rel` (isCurrentAdvisor/inStaffScope) tính trước transaction và dùng lại trong lần kiểm dưới khóa – cùng loại với m1 T404 đã hoãn sang T601. `hasFinalResult` đã đọc lại GVHD dưới khóa nên điều kiện G25 vẫn đúng. | Xử lý cùng T601 như báo cáo đã nêu. |

Không có BLOCKER/MAJOR. Thông báo `CLOSE_REQUESTED`/`CLOSE_RETURNED`/`TOPIC_CLOSED` để T501 (đúng phân công).
