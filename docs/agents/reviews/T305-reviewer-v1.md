# T305 – Review v1 (reviewer)

Kết luận: **APPROVED** (không BLOCKER/MAJOR; MINOR không chặn theo QUY_TRINH chế độ tiết kiệm).

## Lệnh tự chạy
- `npm run lint` – xanh
- `npm test -w @nckh/web` – 14 file, 117 test xanh (khớp báo cáo)
- `npm run build -w @nckh/web` – xanh, mỗi màn là chunk riêng

## Đối chiếu trọng tâm
- FR06 lỗi không là "không trùng": `lib/similarity.js:9` ERROR/level null -> kind `error`; `SimilarityPanel.jsx:7,55,60-63` và `SimilarityBadge` hiện "Chưa kiểm tra được", không có nhánh "Không trùng" cho lỗi. Đạt, có test.
- Giải trình HIGH bắt buộc: `similarity.js:12-13` + `SubmitPage.jsx:122` khóa nút gửi tới khi đủ `minJustificationWords`; vàng tùy chọn; server lỗi `JUSTIFICATION_REQUIRED`/`SIMILARITY_NOT_CHECKED` thay panel bằng `details.similarityCheck` (`SubmitPage.jsx:65-68`). Đạt.
- R7 không ghi đè ô đang nhập: `TopicEditPage.jsx:23,48` (form không unmount khi refetch, `useState` initial một lần), `version` đọc từ prop lúc lưu (`:82`). Đạt, có test.
- `onSettled` invalidate `topic`, `similarity-latest`, `topics`, `submissions` qua `invalidateAfterAction` (`queries.js:35`, `SubmitPage.jsx:77`). Đạt, có test cả nhánh lỗi.
- Tiếng Việt: đạt. A11y cơ bản (role=alert/status, aria-expanded, aria-label nút xóa từ khóa, label qua FormField): đạt.

## MINOR
1. `SubmitPage.jsx:37,122` – nếu lần kiểm tự động/thủ công thất bại (mạng, 429) thì `check` rơi về `latest.data` đang `isStale`; nếu kết quả cũ là NONE/REVIEW nút gửi vẫn bật dù panel ghi "Kết quả cũ". Server vẫn chặn nên không sai nghiệp vụ, nhưng nên tắt nút khi `check.isStale` (thêm `|| check?.isStale` vào `disabled`, và coi như `unchecked` trong `justificationState`).
2. `SubmitPage.jsx:104` – khi `latest.isError` (không tải được kết quả gần nhất), panel hiện "Chưa kiểm tra lần nào." gây hiểu nhầm, không có thông báo lỗi tải. Hiển thị `latest.error.message` + nút thử lại. Không phải "không trùng" nên không chặn.
3. `TopicEditPage.jsx:176-186` – hộp thoại xung đột `CONCURRENT_UPDATE` là div thủ công, không bẫy/đặt focus, không Esc (báo cáo đã nêu cùng hạn chế của `ConfirmDialog`); "Tải bản mới"/"Giữ nội dung của tôi" chưa có test riêng. Xử lý khi có Dialog cơ sở T303.
4. `TopicEditPage.jsx:109` – lỗi `onCheck` khi `err.status` không có (lỗi mạng) bị nuốt, người dùng không thấy gì. Nên `setFormError(err.message)` cho mọi lỗi chưa xử lý.
5. Chưa kiểm 360 px bằng trình duyệt thật (E2E thuộc T309); ghi nhận.
