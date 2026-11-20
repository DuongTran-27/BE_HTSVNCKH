# TASK-DC-17 – Web: Kanban mốc R36 (FR38, NFR07)
- Agent: frontend-dev · Trạng thái: DONE (reviewer v1 APPROVED) · Ngày: 2026-11-20
- Đã đọc: CLAUDE.md, `design/UI.md` §12.1, §12.2, §12.10, §12.12, §7, `design/API_GD7.md` §10.2, §12, dòng TASK-DC-17 trong `BANG_CONG_VIEC.md`, backend `apps/api/src/modules/execution/{service,feedbackService}.js` (`presentMilestone.awaitingFeedback`, mã 409), `topics/service.js` (`permissions`).

## Màn hình đã làm
| Route | Vai trò | Nội dung | Lỗi/trạng thái |
|---|---|---|---|
| R36 `/de-tai/:id/kanban` (tab "Kanban" cạnh "Mốc" trong `ExecTabs`, cùng điều kiện hiện tab Mốc) | STUDENT, LECTURER, STAFF | 4 cột Chưa nộp · Chờ đánh giá · Cần bổ sung · Đạt, tiêu đề có số thẻ. Thẻ: "thứ tự. tên mốc" (link → `/de-tai/:id/moc#moc-<id>`), hạn (đỏ + "(quá hạn)" khi `isOverdue`), badge "Bắt buộc", "Bản nộp phiên bản N" + "Nộp muộn" (`latestDocument.isLate`). ≥ `lg`: 4 cột ngang chia đều; dưới `lg`: khối dọc, nút "Thu gọn/Mở rộng" (`aria-expanded`) | Đang tải/lỗi qua `QueryBox` + `ExecShell` (403/404 tại chỗ); rỗng "Chưa có mốc thực hiện nào."; cột rỗng "Không có mốc" |
| R36 – GVHD hiện hành | LECTURER (`status === 'IN_PROGRESS' && permissions.manageMilestones && topic.advisor.id === user.id`) | Thẻ có cột đích (`kanbanTargets`) mới `draggable` + nút "Chuyển sang…" (Radix `DropdownMenu` từ gói `radix-ui` đã cài, `modal={false}`) chỉ liệt kê cột đích hợp lệ. Kéo: cột hợp lệ viền nổi bật + `dropEffect='move'`, cột khác `dropEffect='none'` và không nhận thả. Chờ đánh giá → Đạt/Cần bổ sung: hộp nhận xét bắt buộc → `POST /documents/{latestDocument.id}/feedbacks { content, evaluation, milestoneVersion }`. Đạt → Cần bổ sung: `ReasonDialog` → `POST /milestones/:id/reopen { version, reason }` | Không cập nhật lạc quan: thẻ chỉ đổi cột khi tải lại sau API thành công; sau mọi kết quả gọi `invalidateExec` (`['milestones', id]`, `['topic', id]`…). 409 `STALE_DOCUMENT`/`MILESTONE_ALREADY_PASSED`/`CONCURRENT_UPDATE`, 403, 404… → đóng hộp, toast thông điệp server, tải lại. `NETWORK_ERROR` → toast "Mạng gián đoạn, cập nhật thất bại". `VALIDATION_ERROR`/`REASON_REQUIRED` → lỗi trong hộp, giữ chữ đã gõ. Thành công → `aria-live="polite"` "Đã chuyển {tên mốc} sang {cột}" |
| R36 – người khác | SV, cán bộ, thành viên hội đồng, GVHD khi không còn IN_PROGRESS | Chỉ xem: không `draggable`, không nút chuyển | |
| R14 `/de-tai/:id/moc` | như cũ | Mỗi mốc có `id="moc-<id>"`; mở với hash thì cuộn tới mốc khi dữ liệu tải xong | |

Thẻ và link tên mốc có `aria-describedby` trỏ tới phần tử ẩn "Cột hiện tại: {cột}" của cột chứa thẻ.

## Thiết kế
- `kanbanColumn(m)` (hàm thuần, xuất từ `KanbanPage.jsx`): `PASSED` → Đạt; `awaitingFeedback` → Chờ đánh giá; `NEEDS_WORK` → Cần bổ sung; còn lại → Chưa nộp (đúng thứ tự GD7 §10.2). `kanbanTargets(m)` suy cột đích từ cột hiện tại.
- Dùng lại `ReasonDialog` cho hộp nhận xét: thêm 2 prop tùy chọn `schema` (mặc định `reasonSchema`) và `confirmClassName` (mặc định `btnDanger`). Schema nhận xét = `z.object({ reason: progressFeedbackSchema.shape.content })` – cùng ràng buộc nội dung 1–2000 ký tự với `documentFeedbackSchema` của API. Nơi gọi cũ không đổi hành vi.
- Không thêm thư viện (GD7 §12): HTML5 DnD + `radix-ui` đã có. Chunk lazy `KanbanPage` ~55,6 kB (20 kB gzip, chủ yếu do Radix DropdownMenu/Popper). Cảnh báo chunk > 500 kB của `index` đã có từ trước (đo lại trên `master` không có thay đổi: 515,43 kB).

## File thay đổi
- Mới: `apps/web/src/pages/topics/KanbanPage.jsx`, `apps/web/tests/dc17.test.jsx`.
- Sửa: `apps/web/src/lib/nav.js` (SCREENS `de-tai/:id/kanban` [S, L, F]), `apps/web/src/routes.jsx` (lazy `KanbanPage`), `apps/web/src/components/ExecShell.jsx` (tab "Kanban"), `apps/web/src/components/ReasonDialog.jsx` (prop `schema`, `confirmClassName`), `apps/web/src/pages/topics/MilestonesPage.jsx` (neo `moc-<id>` + cuộn theo hash).

## Test mới – `apps/web/tests/dc17.test.jsx` (19 ca)
`kanbanColumn` (6 nhánh, gồm Đạt ưu tiên và nộp lại sau Cần bổ sung) + `kanbanTargets`; `canVisit` (ADMIN không vào) + tab Kanban; thẻ đúng cột, số thẻ, hạn đỏ, Bắt buộc, phiên bản + Nộp muộn, link neo, `aria-describedby`; thu gọn cột; rỗng; chỉ xem cho SV, cán bộ, GV khác (hội đồng), GVHD khi WAITING_DEFENSE; GVHD: chỉ thẻ có đích mới kéo được, menu đúng đích; kéo thả (cột sai `dropEffect none` + không mở hộp, cột đúng viền + `move`, nhận xét bắt buộc, thẻ ở cột cũ trước khi gửi, body đúng, thẻ sang Đạt sau tải lại, aria-live); menu bàn phím → NEEDS_WORK; reopen body `{ version, reason }`; 3 mã 409 → toast + tải lại + thẻ ở cột cũ; lỗi mạng → toast; tab Mốc có neo `moc-<id>`.

## Bằng chứng chạy lệnh (2026-11-20)
```
$ npx vitest run tests/dc17.test.jsx        (apps/web)
 Test Files  1 passed (1)
      Tests  19 passed (19)
$ npm test
 Test Files  8 passed (8)    Tests  115 passed (115)     (shared)
 Test Files  84 passed (84)  Tests  1217 passed (1217)   (api)
 Test Files  39 passed (39)  Tests  383 passed (383)     (web)
$ npm run lint      → eslint . --max-warnings 0 (không lỗi)
$ npm run build -w @nckh/web → ✓ built in 784ms (cảnh báo chunk index > 500 kB có sẵn từ trước)
```
E2E chưa chạy: Kanban bằng bàn phím thuộc TASK-DC-23. Chưa kiểm tra trực quan ở 360 px trong trình duyệt thật (bố cục: 1 cột dọc dưới `lg`, `min-w-0` + `break-words`, menu qua Portal).

## Câu hỏi cho reviewer
1. Lỗi 409/403/404/mạng: đóng hộp + toast (theo §12.10 "thẻ ở nguyên cột cũ, toast"), nên nội dung nhận xét đã gõ bị mất. Chỉ lỗi dữ liệu nhập giữ hộp mở. Nếu muốn giữ hộp mở cả khi lỗi mạng thì đổi một dòng.
2. Thành công chỉ báo qua `aria-live` (không thêm toast) để trình đọc màn hình không đọc hai lần; thẻ tự sang cột mới sau khi tải lại.


## Sau review (phiên chính)
MINOR 1 reviewer: lỗi `NETWORK_ERROR` giờ toast "Mạng gián đoạn, cập nhật thất bại" **và giữ hộp mở** với nội dung đã gõ (ném lại lỗi để `ReasonDialog` hiện tại chỗ). Test lỗi mạng thêm kỳ vọng hộp còn mở + giữ lý do. `npx vitest run tests/dc17.test.jsx` → 19 passed; `npm run lint` sạch.
