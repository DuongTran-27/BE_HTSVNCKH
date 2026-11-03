# Review T212b – reviewer v1
Kết luận: **APPROVED** (không BLOCKER/MAJOR; MINOR không chặn theo chế độ tiết kiệm).

## Lệnh tự chạy (DB riêng nckh_t212brv_test, localhost:54329, db:test:reset)
- `npm run lint`: sạch.
- `npm test`: shared 68/68, api 35 file 416/416, web 117/117. Khớp báo cáo (web nhiều hơn do T305 song song).

## Câu hỏi quyền đọc
Đúng §8.4 (API_GD2.md:565: `isMember · isCurrentAdvisor · inStaffScope`) và khớp `permissions.viewHistory` (service.js:87). Không dùng `canView`: GV được đề nghị chưa nhận chưa có quyền xem hồ sơ chờ/lịch sử; chặt hơn là chủ ý, 403 có test. Giữ nguyên.

## Đối chiếu FR17/FR25
- Snapshot đọc từ `payload` bất biến, quyền ở service (snapshotService.js:20-26), ADMIN 403 qua `requireRole`, 404 trước 403 (cùng quy ước `get`).
- Không lộ hồ sơ chờ: `checkView` đi qua `presentMatches(…, user.role)` (snapshotService.js:14); `list` chỉ trả `level`, không matches. Có test SV/GV không thấy `code/title/topicId`.
- `seq` sai định dạng → 404, diff `from=to` → 400 (schemas.js). OK.
- MINOR 1 T212a: `readAfter` (reviewService.js:14-16) xử lý đúng.

## Vấn đề
- MINOR 1 – snapshotService.js:24 / `history` (:75-78): STAFF trong phạm vi khoa đọc được `status-history` của đề tài `DRAFT`, trong khi `canView` (service.js:33) ẩn DRAFT với STAFF. Lịch sử có thể chứa lý do GV từ chối (DECLINE_ADVISING → DRAFT, reason) khi SV đã rút/được trả về nháp. §8.4 không nêu ngoại lệ, nên đây là điểm cần chốt thiết kế. Đề xuất: thêm `|| (rel.inStaffScope && t.status !== 'DRAFT')` thay cho `rel.inStaffScope`, kèm 1 test; hoặc ghi rõ vào §8.4 nếu chấp nhận.
- MINOR 2 – reviewService.js:15: `.catch(() => …)` nuốt lỗi không log. Đề xuất log cảnh báo (logger sẵn có của API) để không mất dấu vết lỗi đọc lại.
- MINOR 3 – T212b.md: báo cáo ghi `npm test` chạy trước khi sửa lint ở file test; đã được tôi chạy lại toàn bộ xanh, không còn lệch.
