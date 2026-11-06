# Review TASK-T603 – bao-mat – vòng 1
Kết luận: APPROVED

## Tôi đã tự kiểm tra
- `npm run lint` → `eslint . --max-warnings 0` sạch.
- `npm test` → shared 73/73, api 53 file 677/677, web 22 file 168/168 (khớp báo cáo).
- Đọc `git diff` toàn bộ + `changeRequests/leaveGroup.js`, `tests/T603-leave.test.js`; đối chiếu `design/API_GD6.md` §5; rà mọi chỗ gọi `canReadExecution`/`versionReader` (feedback, progress, milestones/results, status-history vẫn chỉ `canReadExecution` → người đã rời 403).
- Test tấn công tạm (supertest, đã gỡ): (1) cán bộ duyệt LEAVE_GROUP, đổi `Topic.title` trực tiếp ở DB, người đã rời gọi `GET /api/change-requests/:id` và `GET /api/change-requests` → 200, `topic.title` = tên mới (xem m1); (2) trưởng nhóm withdraw/decline/approve yêu cầu rời của thành viên khác → 403/403/403 (đúng).

## Đối chiếu đặc tả
| Điều kiện đạt | Đạt? | Ghi chú |
|---|---|---|
| §5.1 rời trước duyệt: quyền trước trạng thái, khóa `version + PRE_APPROVAL`, kiểm lại dưới khóa | Đạt | `leftAt` lấy sau khóa; race với duyệt hồ sơ: duyệt thắng → `LEAVE_NEEDS_APPROVAL`, rời thắng → bên kia lệch version |
| §5.2 LEAVE_GROUP: chỉ chính mình, không trưởng nhóm, đếm lại min dưới khóa | Đạt | Phạm vi cán bộ kiểm ở `approve` trước handler; `apply` kiểm lại LEADER/thành viên (chặn race chuyển quyền trưởng nhóm ‖ duyệt) |
| §5.4 người đã rời chỉ đọc phiên bản trong `[joinedAt, leftAt)`, endpoint khác 403 | Đạt | `formerMemberWindows` chỉ của chính user; download-url lấy `topicId` từ Document (không IDOR); ca 6 test 8 endpoint khác 403 + người ngoài 403 |
| Biên `inWindows` | Đạt | joinedAt được, leftAt không; `uploadedAt`, `leftAt` cùng là giờ app lấy sau khóa Topic → không có upload "sau khi rời" lọt vào khoảng |
| `GET /api/me/past-topics` | Đạt | STUDENT, `none: LIVE`; title chỉ từ snapshot trong khoảng |
| MINOR m5 (withdraw) | Đạt | Kiểm ngoài transaction – chấp nhận, kết quả xấu nhất chỉ là WITHDRAWN |
| Sửa test cũ | Đạt | T601: đổi LEAVE_GROUP → TOPIC_CHANGE giữ ý nghĩa, thêm assert PENDING (mạnh hơn). T209: thêm 2 khóa vào `toEqual` toàn bộ (mạnh hơn). Không làm yếu test – chấp nhận cả hai |

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| m1 | MINOR (thành MAJOR khi T605 xong) | `changeRequests/service.js` `presentChangeRequest` + `scopeWhere` STUDENT (`createdById`/`targetUserId`) | Người đã rời vẫn đọc ChangeRequest của mình (LEAVE_GROUP luôn có createdBy = target = người rời), `topic.title` là tên **hiện tại**. Sau khi TOPIC_CHANGE (T605) đổi tên, người đã rời thấy tên mới – trái §5.4/FR18 ("không lộ tên đổi sau khi rời"). Hiện chưa khai thác được qua API (tên đề tài IN_PROGRESS chỉ đổi được bằng T605); đã chứng minh bằng cách sửa DB | Ghi vào T605: khi người xem không còn quan hệ hiện hành (`!canView`), trả `topic.title` từ snapshot trong khoảng (như past-topics) hoặc `null` |
| m2 | MINOR | `execution/documentService.js` list | `isLatest` tính trên cả chuỗi → người đã rời biết có bản mới hơn (báo cáo đã nêu). Không lộ nội dung | Tính `isLatest` sau khi lọc khoảng nếu tiện |
| m3 | MINOR | `schema.prisma` `TopicMember.joinedAt`, `Submission.createdAt` (DB `now()` = giờ bắt đầu transaction, đồng hồ DB) vs `leftAt` (giờ app) | So sánh khoảng trộn hai đồng hồ; lệch đồng hồ Render↔Supabase cỡ ms, khoảng giữa rời và lần nộp kế tiếp ở mức thao tác người → không khai thác thực tế | Không cần sửa; nếu về sau chỉnh, đặt `joinedAt` bằng `now()` app sau khóa |
| m4 | MINOR | `changeRequests/service.js` `withdraw` | Kiểm quan hệ m5 ngoài transaction (báo cáo đã nêu) | Chấp nhận |

Trả lời câu hỏi báo cáo: (1) chấp nhận hai chỗ sửa test; (2) đổi thứ tự `notifyDecided` không ảnh hưởng quyền – người rời nhận link `/yeu-cau`, không nhận link đề tài đã mất quyền.
