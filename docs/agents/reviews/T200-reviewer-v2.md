# Review T200 – reviewer – vòng 2
Kết luận: APPROVED (kèm 3 MINOR, 1 NIT; không còn BLOCKER/MAJOR)

## Tôi đã tự kiểm tra
- Đã đọc: `reviews/T200-reviewer-v1.md`, `reports/T200.md` (mục "Vòng sửa 1"), `design/API_GD2.md` bản mới (739 dòng, toàn bộ), `design/QD_ZOD.md:60` (dòng BUG-001 thêm vào), `BANG_CONG_VIEC.md` (GĐ2, GĐ3, T501, T600–T609).
- Code đối chiếu: `apps/api/src/modules/topics/stateMachine.js` (thứ tự câu lệnh trong `applyTransition`), `packages/shared/src/transitions.js`, `apps/api/src/app.js` (chỗ gắn `requirePasswordChanged`), `apps/api/src/lib/errors.js`, `apps/api/prisma/sql/after_init.sql` (`forbid_mutation`), grep `apps/api/src`: không có chỗ nào gọi `similarityCheck.update/delete` hay `submission.update/delete`, nên trigger chỉ-thêm ở §11b không làm hỏng code GĐ1.
- `npm test`: shared `Tests 21 passed (21)`, api `Test Files 9 passed (9)`, `Tests 87 passed (87)`. Task chỉ sửa tài liệu, không có gì lệch.
- `npm run lint`: `'eslint' is not recognized`. ESLint chưa được cài (T202 còn TODO), không tính cho task này.
- Báo cáo ghi "Không có Bash". Với task thiết kế thì chấp nhận được.

## Xác nhận vấn đề vòng 1
| # | Vấn đề cũ | Đã sửa? | Ghi chú |
|---|---|---|---|
| 1 MAJOR | Race giới hạn N đề tài/SV | **Đã sửa** | §5.5:379-392: đọc lại `TopicMember` sau khi `updateMany` giữ khóa Topic, rồi khóa User theo id, rồi đếm bằng câu lệnh riêng. Có thêm cách (b): accept tăng `version` (§1.5:75). Kiểm với code: `applyTransition` chạy `updateMany` (có `status: transition.from`) → `statusHistory.create` → `extra(tx)` trong cùng `$transaction` (`stateMachine.js:50-60`), nên lúc `extra` chạy thì khóa Topic đã được giữ. Lệnh accept khóa Topic `FOR UPDATE`, và sau khi chờ xong thì đọc lại dòng mới nhất, thấy WAITING_ADVISOR nên trả `INVITATION_CLOSED`. Kịch bản vòng 1 đã bị chặn. REQUEST_ADVISOR là đường duy nhất đưa đề tài từ trạng thái không hoạt động sang hoạt động (`transitions.js:6`), nên chỉ cần một điểm kiểm chính thức là đủ |
| 2 | `conflict()` không có `details` | Đã sửa | §11c:695, §8.2:508 |
| 3 | Thiếu relation/index | Đã sửa | §11b, có FK và partial unique index |
| 4 | G5 chưa có task nhận | Đã sửa trên bảng (T609, T600). Hợp đồng chưa cập nhật tên task – MINOR #1 |
| 5 | Lý do G2 | Đã sửa | §12-G2, §13.2 |
| 6 | `submissions/diff` trùng mẫu | Đã sửa | `submission-diff` (§8.4:549) |
| 7 | Mã lỗi đổi trưởng nhóm | Đã sửa | §5.4:366 `TOPIC_NOT_EDITABLE` |
| 8 | Kiểm tra trước ở WAITING_ADVISOR | Đã sửa | §5.1:333, §7.1:434 thống nhất |

## Phân tích khóa (§1.8, §5.5, §6, accept lời mời) – không có deadlock mới
| Luồng | Khóa lấy theo thứ tự |
|---|---|
| REQUEST_ADVISOR | Topic X (`updateMany` = NO KEY UPDATE) → KEY SHARE User trưởng nhóm (FK `StatusHistory.actorId` mới ở §11b) → NO KEY UPDATE User các thành viên theo id → KEY SHARE User GV (FK `AdvisorRequest.lecturerId`) |
| ACCEPT_ADVISING | Topic → KEY SHARE User GV (actor) → NO KEY UPDATE User GV |
| Mời / chấp nhận lời mời | Topic `FOR UPDATE` → KEY SHARE User SV (FK `TopicMember.userId`) → cập nhật `Topic.version` (trên dòng đã khóa) |
| Khóa/reset/PATCH user | Chỉ User (+ RefreshToken), không đụng Topic |

- Không luồng nào khóa hai Topic. Không luồng nào giữ khóa User rồi mới chờ Topic. Vì vậy không có vòng chờ Topic ↔ User.
- Hai REQUEST_ADVISOR có chung thành viên đều khóa User theo id tăng dần, nên không có vòng chờ User ↔ User.
- Chọn `FOR NO KEY UPDATE` cho User là đúng: nó tương thích với các KEY SHARE do insert có FK sinh ra (StatusHistory, AdvisorRequest, TopicMember, RefreshToken). Nếu dùng `FOR UPDATE` thì các insert này sẽ chặn nhau. PATCH đổi `email`/`code` (cột có unique index) sẽ lấy `FOR UPDATE` trên User và có thể phải chờ một chút, nhưng không tạo vòng.
- Accept chỉ "kiểm sớm" và không khóa User C, nên không thêm cạnh chờ nào. Điểm kiểm chính thức vẫn nằm ở REQUEST_ADVISOR.

## Nội dung mới (từ review FE/BE) so với đặc tả và các phần khác
| Mục | Đánh giá |
|---|---|
| `staffFacultyIds`, `GET /api/users/:id` | Chỉ thêm trường, không lộ thêm dữ liệu ngoài phạm vi. Khớp FR25 |
| `requirePasswordChanged` gắn ở `app.js` sau `/api/auth`, `/api/health` | Khả thi với `app.js:29-34`. Người dùng vẫn đổi được mật khẩu qua `/api/auth/change-password`. Khớp FR02 |
| `TOPIC_INCOMPLETE` tách khỏi `VALIDATION_ERROR` | Nhất quán ở §1.3, §2, §5.2, §6, §8.2 |
| Kiểm quyền xem (403) trước `checkTransition` (§8.1:492) | Khớp quy ước 403/404 ở §2 và NFR02 |
| `skipSimilarity` | Chỉ bỏ qua khối `needsSimilarity`; lần gọi thứ hai vẫn đi qua TRANSITIONS. Không có đường đi mới |
| `matches` lưu dạng đầy đủ, ẩn/hiện theo `status` lúc kiểm | Làm FR17 (snapshot bất biến) chặt hơn. Ẩn hồ sơ chờ với mọi vai trò khác STAFF, khớp mục 3 + G4 |
| Trigger chỉ-thêm `Submission`/`ReviewDecision`/`SimilarityCheck` | Code hiện có không có update/delete. `justification` được ghi ngay lúc tạo (§8.2 bước 4), nên không xung đột |
| `GET /api/lecturers` mở cho LECTURER | Không trả email/SĐT. Chấp nhận được |
| `sort=updatedAt_asc` cho hàng chờ | Đúng: ở UNDER_REVIEW không còn thao tác nào ghi lên Topic ngoài chuyển trạng thái |
| §10 | Không đổi, vẫn khớp `transitions.js` |

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| 1 | MINOR | `API_GD2.md:9`, `:14`, `:143`, `:475`, `:638-639`, `:644-645`, `:648`, `:699-700`, `:702`, `:714`, `:735` | Hợp đồng chưa theo bảng việc mới. Còn ghi T207 và T212 (bảng đã tách thành T207a/T207b, T212a/T212b). §12-G5 và §14 vẫn ghi "Chưa có task nhận", trong khi bảng đã có T600 (hợp đồng) và T609 (hiện thực). Ngoài ra §5 ghi §5.3–5.5 thuộc T208, nhưng `:379` giao quy trình REQUEST_ADVISOR cho T210. Bảng ghi T208 nhận "giới hạn đề tài hoạt động/sinh viên", nên dễ có hai task cùng làm hoặc không task nào làm | Đổi tên task: §3 CSV/hằng `USER_IMPORT_*`/`csv.js` → T207b, phần còn lại → T207a. §8.2–8.3, `skipSimilarity`, `details.similarityCheck`, nhánh xét duyệt của `topicActionSchema` → T212a. §8.4, `submissionDiffQuerySchema` → T212b. G5 → "hợp đồng T600, hiện thực T609". Ghi rõ: T208 làm kiểm sớm lúc accept, T210 làm quy trình chính thức §5.5. **Ngoài T200 (cho điều phối viên):** `BANG_CONG_VIEC.md:79` T605 còn phụ thuộc "T212", và `:64` T501 còn nhắc "T212". Hai task này không còn tồn tại, nên đổi thành T212a |
| 2 | MINOR | `API_GD2.md:92`; `stateMachine.js:51-55` | "Đầu transaction có khóa: `SET LOCAL lock_timeout`" không làm được với các luồng đi qua `applyTransition`. Câu đầu tiên của transaction là `updateMany` do `applyTransition` gọi, còn `extra` chỉ chạy sau đó. Vì vậy lúc chờ khóa Topic không có timeout. §11c cũng không ghi phải sửa `applyTransition`. Thêm nữa, lỗi `55P03` từ `$queryRaw` trong Prisma đến dưới dạng `P2010` với `meta.code = '55P03'`, chứ không có mã `55P03` ở cấp ngoài | Thêm vào §11c (T210): `applyTransition` chạy `SET LOCAL lock_timeout = '5s'` trước `updateMany` (luôn chạy, hoặc qua tùy chọn `lockTimeout`), kèm test. Ở `:696` ghi rõ cách nhận diện lỗi (`P2010` + `meta.code`, hoặc tìm `55P03` trong `message`) và T206 test bằng lỗi giả |
| 3 | MINOR | `API_GD2.md:353-360` | `decline`/`cancel` không khóa Topic, và hợp đồng không yêu cầu cập nhật lời mời có điều kiện. Khi `cancel` (trưởng nhóm) và `accept` chạy đồng thời, kết quả có thể là lời mời ở `WITHDRAWN` nhưng `TopicMember` vẫn được tạo, hoặc `ACCEPTED` ghi đè `WITHDRAWN`. Dữ liệu không nhất quán và AuditLog ghi sai | Cả `accept`/`decline`/`cancel` đều dùng `invitation.updateMany({ where: { id, status: 'PENDING' } })`; `count !== 1` thì 409 `INVITATION_CLOSED` (với accept thì phải trước khi tạo `TopicMember`). Ghi thêm: accept phải đọc trạng thái lời mời và đề tài **sau** câu khóa Topic. T214 thêm ca test cancel ‖ accept |
| 4 | NIT | `API_GD2.md:495`, `:89` | §8.1 bước 5 "Điều kiện riêng" đứng trước `applyTransition`, nhưng các kiểm ở §5.5/§6 lại chạy trong `extra`. `:89` khóa Topic bằng `FOR UPDATE`, trong khi đúng lý do đã nêu ở `:88` thì `FOR NO KEY UPDATE` hợp hơn: không chặn thừa các insert có FK tới Topic, ví dụ `SimilarityCheck` của "Kiểm tra trước" | Thêm vào bước 5 câu "(kiểm cần khóa chạy trong `extra`, xem §5.5, §6)". Cân nhắc dùng `FOR NO KEY UPDATE` cho Topic. Đổi hay không đều không ảnh hưởng tính đúng |

Không còn BLOCKER/MAJOR. Ba MINOR nên sửa trước khi T206/T208/T210 bắt đầu, hoặc để task hiện thực tự làm theo đề xuất ở trên. Không cần review thêm vòng nữa chỉ cho các MINOR này.

Kết luận: APPROVED – MAJOR race N đề tài/SV đã sửa đúng (đọc lại thành viên dưới khóa Topic, khóa User theo id, thứ tự Topic → User nhất quán ở §5.5/§6/accept, không tạo deadlock); còn 3 MINOR (tên task chưa theo bảng tách T207a/b, T212a/b, T609; `lock_timeout` không đặt được trước `updateMany` của `applyTransition`; accept/cancel lời mời thiếu cập nhật có điều kiện) và 1 NIT.
