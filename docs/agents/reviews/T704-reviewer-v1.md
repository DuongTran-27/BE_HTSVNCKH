# Review T704 + BUG-011 + BUG-012 (backend) – reviewer v1
Kết luận: **CHANGES_REQUESTED** (2 việc nhỏ, sửa nhanh; không có BLOCKER).

## Lệnh tự chạy
- `npm run lint`: sạch.
- `npm test`: shared 73/73, api 924/924 (61 file), web 219/219 (25 file). Khớp báo cáo.
- `npm run perf -w @nckh/api` (DB nckh_t704_test): 26/26 xanh. Khớp báo cáo.

## Quyết định cho 4 câu hỏi
1. **T213 `q=%` 1 ký tự -> 400: hợp lệ, không phải nới test.** Hành vi sản phẩm đổi có chủ đích (BUG-011). Test vẫn kiểm `%` không là wildcard ở các dòng `100%` và `phòng_họp` (2 ký tự trở lên), và có thêm test 400 và `searchIds('a') = []`. DAC_TA FR08 chỉ ghi "lọc theo ... từ khóa", không quy định độ dài tối thiểu, nên q >= 2 không mâu thuẫn. Chấp nhận.
2. **BUG-011, giữ `IN` với q 2 ký tự: chấp nhận cho phạm vi một khoa** (đo 2.170 dòng: `ng` 89%, 8 ms; trần 32.767 bind ~ 36.000 đề tài, còn cách một bậc độ lớn). Điều kiện: **thêm comment `shortcut:` ở `listRepo.js` (`searchIds`)**, ví dụ `// shortcut: IN (id...) tới ~36.000 đề tài (trần 32.767 bind, q 2 ký tự khớp ~89%); vượt thì chuyển id = ANY($1::text[]) hoặc EXISTS`. Hiện comment dòng 21 chỉ nói "chặn IN gần toàn bảng", chưa nêu giới hạn và cách nâng cấp. (MAJOR theo yêu cầu điều phối, sửa 1 dòng.)
3. **`stuck=true`**: FR16.5 trong DAC_TA ghi đúng "đóng đăng ký mà đề tài vẫn ở Chờ GVHD". Code thêm HAS_ADVISOR (đợt đóng mà chưa gửi xét duyệt). Đây là mở rộng so với chữ của FR16.5, đã nêu trong báo cáo và theo chỉ đạo điều phối; chấp nhận, nhưng MINOR: cập nhật `API_GD2.md` §9.1 ghi rõ `stuck` gồm cả HAS_ADVISOR (hiện chỉ ghi `stuck?`). Phạm vi vai trò đúng: dùng sẵn phạm vi của `list` (STAFF theo khoa, ADMIN 403, test có), AND với bộ lọc khác, `now()` giờ server (NFR06), `stuck=false` không lọc, giá trị lạ 400. OpenAPI sinh từ `topicListQuerySchema` nên có `stuck` và minLength; T701 xanh.
4. **T704**: phương pháp đạt yêu cầu NFR04 (2.000 đề tài, Postgres thật, HTTP thật, p95, server đã khởi động, ANALYZE, seed cố định, DB riêng qua chốt chặn NFR08). Số đo: danh sách <= 32 ms (ngưỡng 1000), thống kê <= 11 ms (2000), FR06 p95 248-259 ms (3000): đạt biên lớn. Cấu hình máy và giới hạn (Postgres cục bộ, chưa đo qua pooler Supabase) đã nêu. Suite perf tách khỏi `npm test` (đuôi `.perf.js`), không skip/làm yếu test sản phẩm. Test perf TC-NFR04-01/05 được sửa theo hành vi mới có lý do rõ trong báo cáo, kỳ vọng chặt hơn (đếm DB = 170, id duy nhất), chấp nhận. CSV: ghi trung thực "sát ngưỡng giả định", đã tách BUG-013, không xét ở đây.

## Vấn đề
| # | Mức | Vị trí | Vấn đề | Đề xuất |
|---|---|---|---|---|
| 1 | MAJOR | `apps/api/src/modules/topics/listRepo.js:21` | Thiếu comment `shortcut:` nêu giới hạn bind/36.000 đề tài | Thêm như mục 2 |
| 2 | MAJOR | `apps/web/src/pages/topics/TopicListPage.jsx:30,42`, `RepositoryPage.jsx:17`, `review/ReviewQueuePage.jsx:42` | FE vẫn gửi `q` 1 ký tự lên `/topics` và `/repository` (chỉ cắt 200), nay trả 400: gõ 1 ký tự là hiện lỗi, hồi quy UX của FR08. Báo cáo BE có nêu, nhưng phần FE của BUG-012 chưa làm | Trong phần FE của BUG-011/012: chỉ gửi `q` khi `trim().length >= 2` (hoặc `minLength=2` + gợi ý tiếng Việt), kèm test web. BUG-011 chưa được đóng cho tới khi làm |
| 3 | MINOR | `docs/agents/design/API_GD2.md` §9.1 | `stuck` chưa ghi gồm HAS_ADVISOR và là mở rộng FR16.5 | Ghi rõ |
| 4 | MINOR | `T213-topic-list.test.js` BUG-012 | Chưa test vai LECTURER/STUDENT với `stuck=true` (chỉ STAFF/ADMIN) | Thêm 1 ca xác nhận chỉ thấy phạm vi của mình |

Không ghi nhận: test bị skip/xóa, logic trạng thái ngoài TRANSITIONS (stuck chỉ là bộ lọc đọc), lộ dữ liệu.

Sau khi sửa #1, #2 (và nên #3, #4) có thể duyệt lại nhanh; không cần chạy lại perf.
