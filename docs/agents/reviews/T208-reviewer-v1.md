# T208 – Review vòng 1 (reviewer)
Tự chạy sau `db:test:reset`: shared 68/68; api 30 file 349/349; web 98/98; `npm run lint` xanh. Khớp báo cáo. Không có test bị xóa/skip/làm yếu (file test mới).

## Đối chiếu yêu cầu
- Min–max: `maxMembers` kiểm ở mời (thành viên + lời mời chờ) và ở accept (đếm sau khóa), dùng `effectiveRoundConfig` (`groupService.js:41-43,81-83`). `minMembers` không kiểm ở T208 mà ở `REQUEST_ADVISOR` (T210) – đúng §5.5/§6 (dòng 402-409, 431); không phải thiếu sót.
- accept/decline/cancel có điều kiện `status: PENDING` qua `closeInvitation` (`groupRepo.js:35-37`); lỗi -> rollback toàn tx (accept đặt trước khi tạo TopicMember; GROUP_FULL rollback giữ lời mời PENDING). Có test cancel ‖ accept 5 vòng. Đạt.
- Khóa Topic `FOR NO KEY UPDATE` (mời) và `updateMany` làm câu khóa đầu (accept, đổi trưởng nhóm); INSERT TopicMember lấy KEY SHARE tương thích với NO KEY UPDATE, không tự chặn nhau. Đạt.
- `withLockTx` (`lib/tx.js`): `set_config(..., true)` là câu đầu, lock_timeout 3s < tx 15s; test `current_setting` trong/ngoài tx và tx khác giữ khóa -> 409. Đạt.
- Quyền (FR25): kiểm sơ bộ trước tx rồi kiểm lại trưởng nhóm sau khóa; decline chỉ người được mời, cancel chỉ LEADER hiện hành; ADMIN/STAFF/GV bị chặn ở route. AuditLog cùng tx cho cả 5 thao tác. Đạt.
- 2 MINOR T209: ngoại lệ `fieldId` đã ghi vào §5.1; test `GD2_ACTIONS` ⊂ `TRANSITIONS` có. Đóng.

## Câu hỏi của agent – hủy lời mời PENDING khi đề tài đã rời Nháp
Chấp nhận. Theo hợp đồng (dòng 431) `REQUEST_ADVISOR` đã chuyển mọi lời mời PENDING sang WITHDRAWN, nên bình thường không còn lời mời PENDING sau khi rời Nháp; trạng thái sót chỉ do lỗi ở T210. Khi đó hủy/từ chối lời mời PENDING là vô hại (không đổi nhóm), còn accept bị chặn bởi `bumpTopic {DRAFT}` -> `INVITATION_CLOSED`. Không cần đổi.

## Vấn đề
### MINOR 1 – Dòng T210 chưa nêu kiểm chính thức `STUDENT_TOPIC_LIMIT`
`docs/agents/BANG_CONG_VIEC.md` dòng T210 chỉ nêu hạn mức GV, `applyTransition` qua `withLockTx`, thứ tự, hạn đăng ký; KHÔNG nêu `GROUP_TOO_SMALL`, `STUDENT_TOPIC_LIMIT` có khóa User (§5.5 bước 5) và việc chuyển lời mời PENDING -> WITHDRAWN. Rủi ro: accept đồng thời hai nhóm cùng vượt kiểm sớm (báo cáo thừa nhận) mà không ai bịt. Đề xuất điều phối thêm các mục này vào dòng T210 (và ca đồng thời vào T214).

### MINOR 2 – Accept không kiểm lại người được mời
`groupService.js:65-77`. Chỉ kiểm `inviteeId === user.id`; không kiểm lại `facultyId` của SV so với khoa đợt (đổi khoa sau khi mời). Rủi ro rất thấp (requireAuth đã chặn tài khoản khóa); ghi nhận, không bắt buộc.

Không có BLOCKER/MAJOR.

Kết luận: APPROVED (BLOCKER 0, MAJOR 0, MINOR 2)
