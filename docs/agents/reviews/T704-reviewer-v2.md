# Review T704 + BUG-011 + BUG-012 – reviewer v2
Kết luận: **APPROVED**.

## Lệnh tự chạy
- `npm run lint`: sạch (max-warnings 0).
- `npm test`: shared 73/73, api 924/924 (61 file), web 220/220 (26 file).
- `npm run build -w @nckh/web`: thành công.
- `npm run test:e2e -w @nckh/web`: 54/54 passed (gồm /thong-ke với widget kẹt).

## Xác nhận vấn đề v1
1. MAJOR 1 (comment shortcut) đã sửa: `listRepo.js:20` có `shortcut:` nêu giới hạn ~32.767 bind (~36.000 đề tài) và cách nâng cấp `= ANY($1::text[])`/EXISTS. Thêm guard `q.trim().length < 2` ở `searchIds`.
2. MAJOR 2 (FE gửi q 1 ký tự) đã sửa: helper `searchTerm` (`format.js`) chỉ trả q khi trim >= 2 ký tự; dùng ở TopicListPage, RepositoryPage, ReviewQueuePage; có `searchTerm.test.js`.
3. FE BUG-012 đã làm: `StuckTopics.jsx` gọi `/topics?stuck=true&roundId&page&pageSize=10`, không còn gộp 2 lần theo status phía client, hiện "Tổng cộng N đề tài kẹt" và `Pager`, `keepPreviousData`.
4. T504.test.jsx: sửa theo hợp đồng mới (mock trả total 12), assert chặt hơn (có `stuck=true`, `pageSize=10`, không còn `status=`, hiện total). Không nới lỏng vô lý. Việc bỏ assert "đợt mở bị loại" hợp lý vì lọc nay ở server (đã có test T213 phía API).
5. MINOR 3 (API_GD2 §9.1): đã ghi `stuck` gồm HAS_ADVISOR, nêu là mở rộng FR16.5.
6. MINOR 4 (test LECTURER/STUDENT với `stuck=true`): chưa thấy bổ sung, không chặn; nên làm ở lượt dọn sau.

## Ghi chú nhỏ (không chặn)
- `StuckTopics`: `page` không reset về 1 khi `roundId` đổi (nếu prop đổi mà component không remount). Ảnh hưởng thấp.

Không ghi nhận test bị skip/xóa, hồi quy quyền hay lộ dữ liệu. BUG-011/012 có thể đóng.
