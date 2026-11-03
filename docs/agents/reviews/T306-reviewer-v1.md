# Review T306 – reviewer v1

Kết luận: **APPROVED** (không BLOCKER/MAJOR). Phạm vi: chỉ frontend T306.

## Lệnh tự chạy (2026-11-03)
- `npm run lint`: xanh.
- `npm test -w @nckh/web`: 13 file, 107 test passed (khớp báo cáo).
- `npm run build -w @nckh/web`: xanh, `index-*.js` 387.07 kB, không còn cảnh báo chunk > 500 kB.

## Đối chiếu yêu cầu
- R15 GV (chờ xử lý, nhận/từ chối, lý do 5–2000 qua `reasonSchema`, hạn mức): có code (`AdvisorRequestsPage.jsx`, `AdvisingActions.jsx`, `ReasonDialog.jsx`) và test.
- R15 cán bộ: chỉ xem, lọc đợt qua `GET /rounds` (`AdvisorRequestsPage.jsx:59,77-81`), GV không gọi: đạt, có test.
- R6 + `TopicActionBar`: nút lấy từ `topic.availableActions` của server (`TopicActionBar.jsx:5`): đạt.
- T304 m1: `UserDetailPage.jsx` giữ mật khẩu tạm trong state cục bộ, mutation trả `null`: đạt, có test. Lưu ý: nhiệm vụ nói "gọi `api()` trực tiếp thay `useMutation`" nhưng cách làm vẫn dùng `useMutation`. Kết quả (không nằm trong MutationCache) đạt, chấp nhận.
- T304 m2: `idSchema` có thông báo tiếng Việt (`packages/shared/src/catalog.js:13`): đạt.
- Code-splitting: `React.lazy` + `Suspense` (`routes.jsx`): đạt.

## BLOCKER
Không.

## MAJOR
Không.

## MINOR (không chặn)
1. `routes.jsx` (Suspense bọc mọi màn): chưa có error boundary khi tải chunk thất bại (mạng đứt, sau khi deploy bản mới). Nên thêm `errorElement` hoặc ErrorBoundary tiếng Việt, kèm nút "Tải lại".
2. `ReasonDialog.jsx:333-334`: `role="dialog"` nhưng chưa thấy xử lý focus ban đầu, phím Esc và bẫy focus. Nên dùng chung cơ chế với `ConfirmDialog` (UI NFR truy cập).
3. `AdvisorRequestsPage.jsx:25`: ngưỡng nhắc dùng `DEFAULT_ROUND_CONFIG`, không theo cấu hình đợt. Đã ghi trong báo cáo. Chỉ ảnh hưởng màu. Đề xuất API trả ngưỡng theo đợt (T211/GD2).
4. `AdvisorRequestsPage.jsx:94`: mỗi nhóm đợt gọi một `useMyQuota` (`GET /lecturers?q=code&pageSize=100`). Chấp nhận được ở quy mô hiện tại.
5. `TopicDetailPage.jsx:145,207,214-216`: liên kết tới `/de-tai`, `/nhom`, `/lan-gui`, `/lich-su`, `/sua` hiện trỏ tới trang tạm hoặc chưa có route (thuộc T305/T307). Cần xác nhận khi các task đó xong.
6. Chưa kiểm 360 px bằng trình duyệt thật và chưa có E2E (T309), đã nêu trong báo cáo.
