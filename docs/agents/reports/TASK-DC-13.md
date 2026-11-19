# TASK-DC-13 – Web giảng viên: đề tài tuyển sinh viên, công bố, ứng viên, chốt nhóm (FR31, FR33)
- Agent: frontend-dev · Trạng thái: REVIEW · Ngày: 2026-11-19
- Đã đọc: CLAUDE.md, `design/UI.md` §12.5, §12.12, `design/API_GD7.md` §3, §4, báo cáo TASK-DC-05, TASK-DC-06.
- Không sửa backend, không đổi hợp đồng API.

## Màn hình đã làm
| Route | Vai trò | Nội dung | Trạng thái đã xử lý |
|---|---|---|---|
| R5' `/de-tai/moi?nguon=gv` | LECTURER (thêm vào SV) | Dùng lại `TopicCreatePage`: tiêu đề "Công bố đề tài tuyển sinh viên", quy trình 3 bước; POST `/topics` → sang R7'. `REGISTRATION_CLOSED` gắn vào ô đợt | tải đợt, rỗng, lỗi, lỗi theo ô |
| R7' `/de-tai/:id/sua` | LECTURER (thêm vào SV) | Khi `topic.origin === 'LECTURER'`: thêm "Yêu cầu ứng viên" và "Số sinh viên cần tuyển" (1..`maxMembers` của đợt), danh sách "Đủ điều kiện công bố" chạy `topicPublishSchema`; "Kiểm tra trước" dùng `SimilarityPanel` có sẵn. Đề tài SV không có 2 ô và không gửi 2 trường này | DRAFT; xung đột phiên bản, lỗi 400 theo trường |
| Trang công bố `/de-tai/:id/cong-bo` | LECTURER | Dùng lại nguyên `SubmitPage` (R10): đủ trường → kiểm trùng FR06 → giải trình (bắt buộc khi đỏ, tùy chọn khi vàng) → "Công bố tuyển sinh viên". Chỉ vào được khi `availableActions` có `PUBLISH_RECRUITMENT`, không thì về R6. Lỗi `LECTURER_QUOTA_EXCEEDED`, `REGISTRATION_CLOSED`, `JUSTIFICATION_REQUIRED`, `SIMILARITY_NOT_CHECKED`, `TOPIC_INCOMPLETE` xử lý như R10 | DRAFT |
| R6 `/de-tai/:id` | STUDENT, LECTURER, STAFF | Khối "Đang tuyển sinh viên – x/y chỗ, n đơn chờ" + liên kết "Xem ứng viên" (chỉ khi `applicationCounts` khác null); khối "Yêu cầu ứng viên" khi đề tài nguồn GV; nút "Công bố tuyển sinh viên" / "Chốt nhóm" / "Ngừng tuyển" trên `TopicActionBar` theo `availableActions` | RECRUITING, DRAFT |
| R29 `/de-tai/:id/ung-vien` | LECTURER, STAFF | Thanh "x/y đã nhận" + "Chốt nhóm"/"Ngừng tuyển"; tab theo trạng thái đơn (mặc định Chờ duyệt); bảng lưới ở `lg`, thẻ ở dưới `lg`; lời giới thiệu rút gọn 2 dòng, bấm mở toàn văn; "Đồng ý" (xác nhận), "Từ chối" (lý do bắt buộc); nút theo `availableActions` của từng đơn | RECRUITING và các trạng thái khác (còn từ chối được đơn chờ) |

Nút "Công bố đề tài tuyển sinh viên" thêm vào R4 (danh sách đề tài) cho giảng viên.

## Quyết định
- Hành động tuyển sinh gom vào `RecruitActions` (dùng ở R6 và R29) để hai nơi cùng một hộp thoại: ngừng tuyển dùng `ReasonDialog` (lý do bắt buộc; cảnh báo đỏ khi `acceptedCount > 0`), chốt nhóm dùng `ConfirmDialog`. Lỗi server (vd `GROUP_TOO_SMALL`, `CONCURRENT_UPDATE`) hiện `err.message` ngay trong hộp thoại.
- "Chốt nhóm" không bị làm mờ theo số thành viên (không tự suy luật ở client); server trả `GROUP_TOO_SMALL`, UI hiện thông báo.
- Duyệt đơn: `GROUP_FULL`/`STUDENT_TOPIC_LIMIT` hiện trong hộp thoại; `APPLICATION_CLOSED`/`NOT_RECRUITING` đóng hộp thoại + toast; mọi trường hợp đều tải lại đề tài + danh sách.
- `invalidateAfterAction` thêm `['recruitments']`, `['applications']`, `['topic-applications', id]` (UI §12.12).
- `SCREENS` (`lib/nav.js`): `de-tai/moi`, `de-tai/:id/sua` thêm LECTURER; thêm `de-tai/:id/cong-bo` [LECTURER], `de-tai/:id/ung-vien` [LECTURER, STAFF] (chỉ để dẫn đường; backend vẫn kiểm quyền).

## File thay đổi
| File | Thay đổi |
|---|---|
| `apps/web/src/components/RecruitActions.jsx` | mới – công bố (liên kết), chốt nhóm, ngừng tuyển |
| `apps/web/src/pages/topics/ApplicantsPage.jsx` | mới – R29 |
| `apps/web/tests/dc13.test.jsx` | mới – 25 test |
| `apps/web/src/lib/topicForm.js` | `topicToForm` thêm 2 trường cho nguồn GV; `editSchemaFor`; `PUBLISH_FIELDS`; `submitProblems(…, publish)` |
| `apps/web/src/pages/topics/TopicEditPage.jsx` | mục "Tuyển sinh viên", điều kiện công bố |
| `apps/web/src/pages/topics/SubmitPage.jsx` | thêm action `PUBLISH_RECRUITMENT` |
| `apps/web/src/pages/topics/TopicCreatePage.jsx`, `TopicListPage.jsx`, `TopicDetailPage.jsx` | chữ/quy trình GV, nút công bố, khối "Đang tuyển" + yêu cầu |
| `apps/web/src/components/TopicActionBar.jsx` | gắn `RecruitActions` |
| `apps/web/src/lib/nav.js`, `routes.jsx`, `lib/queries.js` | route, quyền dẫn đường, invalidate |
| `docs/agents/BANG_CONG_VIEC.md` | DC-13 → REVIEW |

## Điều kiện đạt ↔ test (`apps/web/tests/dc13.test.jsx`, 25 test)
| Điều kiện | Test |
|---|---|
| Form tạo/sửa đề tài tuyển validate | "giảng viên thấy tiêu đề riêng…", "số 0 bị chặn…", "vượt số thành viên tối đa…", "lỗi 400 theo trường…", "đề tài của sinh viên không có 2 ô…", "REGISTRATION_CLOSED hiện ở ô đợt" |
| Công bố + cảnh báo trùng | "đỏ: bắt buộc giải trình…", "vàng: tùy chọn", "thiếu số sinh viên cần tuyển…", "LECTURER_QUOTA_EXCEEDED…", "không có PUBLISH_RECRUITMENT… quay về", nút ở R6 dẫn sang trang công bố |
| Gỡ công bố bắt buộc lý do | "ngừng tuyển: bắt buộc lý do… cảnh báo đỏ…", "lỗi 409 hiện trong hộp thoại" |
| Danh sách ứng viên, duyệt/từ chối | "hiện thanh x/y…", "đồng ý…", "từ chối: bắt buộc lý do", "chỉ hiện nút theo availableActions", "đủ chỗ…" |
| Chốt nhóm | "chốt nhóm: xác nhận… GROUP_TOO_SMALL…" |
| Lỗi 409/400/403 | "GROUP_FULL…", "APPLICATION_CLOSED…", "403 từ server…" |
| Khối R6 | "hiện số chỗ, đơn chờ…", "không có applicationCounts…" |

## Bằng chứng chạy lệnh
```
$ npm run lint                      → exit 0 (eslint . --max-warnings 0)
$ npm test                          → exit 0
  shared  Test Files 8 passed (8)    Tests 115 passed (115)
  api     Test Files 84 passed (84)  Tests 1217 passed (1217)
  web     Test Files 34 passed (34)  Tests 297 passed (297)   (có 25 test mới của DC-13)
$ npm run build -w @nckh/web        → exit 0 (built in 785ms)
$ npm run test:e2e -w @nckh/web     → 74 passed (4.7m), exit 0
```
Lệnh chạy sau lần sửa cuối. DB test: `DB_TEST_DRIVER=embedded npm run db:test:up` rồi `npm run db:test:reset` (cảnh báo EPERM `query_engine-windows.dll.node` như các task trước, không ảnh hưởng).

## Còn lại / rủi ro
- Chưa có E2E luồng tuyển (DC-21). Chưa kiểm tay bằng trình duyệt ở 360 px và dark mode; dùng lớp `bg-card`, `min-h-11`, thẻ xếp một cột dưới `lg`.
- Menu giảng viên chưa có mục riêng cho bảng tin `/tuyen-sinh` (thuộc DC-14).
- Không có test cho "Số sinh viên cần tuyển" khi `maxMembers` của đợt đổi sau khi lưu (server vẫn kiểm lại khi công bố).

## Câu hỏi cho reviewer
Không có.

## Sửa theo review reviewer v1 (điều phối viên, 2026-11-19)
- m1: `SubmitPage.jsx` tiêu đề bước cuối "4. Công bố" khi `PUBLISH_RECRUITMENT`.
- m2: bỏ tham số thừa `?nguon=gv` ở `TopicListPage.jsx` và `dc13.test.jsx`.
- Lệnh: `npm run lint` → exit 0; `npx -w @nckh/web vitest run` → 297/297.
