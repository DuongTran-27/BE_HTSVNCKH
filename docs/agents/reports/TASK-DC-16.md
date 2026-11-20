# TASK-DC-16 – Web: chấm bảo vệ R33, R34 + MINOR m1, m2, m4 từ DC-15 (FR36, FR37)
- Agent: frontend-dev (phần trang) + phiên chính (nối route/menu, sửa `useTopic`, test) · Trạng thái: DONE (reviewer v1 APPROVED) · Ngày: 2026-11-20
- Đã đọc: CLAUDE.md, `design/UI.md` §12.9, `design/API_GD7.md` §6.1, §7, báo cáo TASK-DC-15.

## Màn hình
| Route | Vai trò | Nội dung | Lỗi/trạng thái |
|---|---|---|---|
| R33 `/cham-bao-ve` | LECTURER | Tab "Chưa chốt" (mặc định, `status=OPEN`) / "Đã chốt" (`status=DECIDED`) trên URL; lưới ≥ `lg`, thẻ dưới `lg`: mã + tên đề tài (→ R34), hội đồng, vai trò của tôi, "Tôi đã chấm"/"Chưa chấm", "Đã chấm x/y", điểm cuối + Đạt/Không đạt khi đã chốt; phân trang server | rỗng "Bạn chưa được phân công chấm đề tài nào.", lỗi qua `QueryBox` |
| R34 `/cham-bao-ve/:assignmentId` | LECTURER thành viên | Trái: đề tài (tóm tắt, đợt, GVHD, nhóm, liên kết R6), "Báo cáo tổng kết" (`documents?stage=FINAL`, nút "Tải về" gọi `download-url` mỗi lần – FR24), "Điểm quá trình", "Nhận xét của GVHD" (phân trang). Phải (dính khi cuộn ≥ `lg`): "Kết quả hội đồng" khi đã chốt (điểm, quyết định, người chốt, biên bản); "Điểm của tôi" (`defenseScoreSchema`, điền sẵn khi có `myScore`, "Lưu điểm"/"Cập nhật điểm", nút dính đáy dưới `lg`); "Bảng điểm hội đồng" chỉ khi server trả `scores` + "Điểm trung bình tạm tính" + "Chốt nghiệm thu" theo `FINALIZE` | Đề tài CLOSED/CANCELLED: không gọi API đề tài (G62), hiện "Đề tài đã đóng – xem kết quả trong Kho đề tài nếu đạt"; `ASSIGNMENT_DECIDED` → toast + tải lại; 409 khác → thông điệp + "Dữ liệu đã được tải lại"; phân công bị hủy → dải cảnh báo |
| Hộp chốt | CHAIR/SECRETARY | Bước 1: biên bản (`defenseFinalizeSchema`), trung bình + kết quả dự kiến (`gradeFromDefenseScore` theo `defenseGrades` của đợt, chỉ xem trước). Bước 2: "Hành động này sẽ khóa toàn bộ điểm và chuyển đề tài sang Chờ đóng. Bạn có chắc chắn?". Gửi `{ version: topic.version, minutes }` | `SCORES_INCOMPLETE` → quay bước 1, liệt kê `details.missing` (họ tên + vai trò); 403/`ASSIGNMENT_DECIDED` → toast, đóng hộp |
| R6 – "Kết quả cuối" | GVHD | Kết quả hiện hành nguồn `COUNCIL` → ẩn form nhập, hiện "Kết quả do hội đồng quyết định."; badge "Biên bản hội đồng" | |

Menu GV thêm "Chấm bảo vệ". Trang tạm Placeholder của DC-15 được thay bằng R33/R34 trong `routes.jsx`.

## MINOR từ DC-15
- **m1**: backend `CouncilView.round.facultyId` (repo `ROUND` select + `presentCouncil`, API_GD7 §6.1 cập nhật); `CouncilMembersFields` chỉ truy vấn GV khi đã có `facultyId` (R31 trước khi chọn đợt hiện "Chọn đợt trước để tìm giảng viên cùng khoa."), R32 truyền `c.round.facultyId`.
- **m2**: R32 PATCH tên thành công rồi PUT thành viên lỗi → thông điệp mở đầu "Đã lưu tên mới; thành viên chưa lưu".
- **m4**: khối bảo vệ đã chốt thêm "Biên bản hội đồng: xem mục "Kết quả cuối"."
- `ScoreTable` tách ra từ `DefenseSection` để R6 và R34 dùng chung.

## Lỗi phát hiện khi viết test
`useTopic(id)` bỏ qua tham số thứ hai nên R34 vẫn gọi `GET /topics/:id` khi đề tài đã đóng (server trả 403 → hộp lỗi thay vì chỉ dẫn Kho). Sửa: `useTopic(id, enabled = true)` – các nơi gọi cũ không đổi hành vi.

## File thay đổi
`apps/api/src/modules/councils/{prismaRepo,service}.js`, `apps/api/tests/DC08-councils.test.js` (kỳ vọng `facultyId`), `apps/web/src/pages/defense/{DefenseAssignmentsPage,DefenseScorePage}.jsx` (mới), `apps/web/src/routes.jsx`, `apps/web/src/lib/{nav,queries}.js`, `apps/web/src/components/{DefenseSection,ResultSection}.jsx`, `apps/web/src/pages/councils/{CouncilDetailPage,CouncilMembersFields}.jsx`, `apps/web/tests/{dc15,dc16}.test.jsx`, `docs/agents/design/API_GD7.md` §6.1.

## Test mới – `apps/web/tests/dc16.test.jsx` (11 ca)
menu + `canVisit`; R33 rỗng, dòng + tab DECIDED; R34 ủy viên (tải báo cáo FINAL, điểm quá trình, không bảng điểm, body PUT `{ score: 8.25, comment }`), điểm 11 bị chặn client, đề tài đóng không gọi API đề tài; thư ký: bảng điểm + chốt 2 bước gửi `{ version: 7, minutes }`, `SCORES_INCOMPLETE` liệt kê người thiếu; `previewAverage`; m4 + khóa form kết quả nguồn hội đồng; m1 không truy vấn GV khi chưa chọn đợt.

## Bằng chứng chạy lệnh (2026-11-20)
```
$ npx vitest run tests/dc16.test.jsx        (apps/web)
      Tests  11 passed (11)
$ npm run db:test:up && npm run db:test:reset
Kiểm tra DB test: tất cả OK. / Đã reset DB test (migrate reset).
$ npm test
 Test Files  8 passed (8)    Tests  115 passed (115)     (shared)
 Test Files  84 passed (84)  Tests  1217 passed (1217)   (api)
 Test Files  37 passed (37)  Tests  362 passed (362)     (web)
$ npm run lint      → eslint . --max-warnings 0 (không lỗi)
$ npm run build -w @nckh/web → ✓ built
```
E2E chưa chạy: task không đổi seed hay luồng cũ (DC-22 sẽ phủ E2E hội đồng).
