# Review T200 – reviewer – vòng 1
Kết luận: CHANGES_REQUESTED

## Tôi đã tự kiểm tra
- Đã đọc: `CLAUDE.md`, `docs/agents/QUY_TRINH.md`, `docs/DAC_TA.md` (toàn bộ), `docs/agents/design/API_GD2.md` (560 dòng, toàn bộ), `docs/agents/reports/T200.md`, `docs/agents/design/QD_ZOD.md`, `docs/agents/BANG_CONG_VIEC.md` (dòng GĐ2, GĐ6, GĐ7).
- Code đối chiếu: `packages/shared/src/transitions.js`, `apps/api/src/lib/errors.js`, `apps/api/src/middlewares/{auth.js,errorHandler.js}`, `apps/api/src/modules/topics/{stateMachine.js,code.js}`, `apps/api/src/modules/similarity/{service.js,prismaRepo.js}`, `packages/shared/src/schemas.js` (keywords), `apps/api/prisma/schema.prisma`, `apps/api/prisma/sql/after_init.sql`.
- `npm test`: shared + api xanh, api `Test Files 9 passed (9)`, `Tests 87 passed (87)`. Task chỉ có tài liệu, không đổi code, nên không có gì lệch với báo cáo.
- `npm run lint`: `'eslint' is not recognized` (ESLint chưa được cài, việc của T202 đang TODO). Không do T200 gây ra, không tính cho task này.
- Báo cáo ghi "Không có Bash". Với task thiết kế thì chấp nhận được, vì không có test tự động nào để chạy.
- Grep schema/SQL: có `topic_code_seq` và index GIN trigram trong `after_init.sql`. `apps/api/prisma/migrations/` còn trống (T203 làm migration init), nên đổi schema bây giờ vẫn không tốn gì.
- §10 so với `TRANSITIONS`: 9 action GĐ2 khớp đúng `from/to/actors/leaderOnly/requestedLecturerOnly/reasonRequired/needsSimilarity`. Không có đường đi mới. Các action GĐ4–6 được liệt kê đủ ở dòng 498.

## Đối chiếu đặc tả
| Điều kiện đạt | Đạt? | Ghi chú |
|---|---|---|
| FR02 mã/email không trùng | Có | 409 `DUPLICATE` (P2002), email được trim + lowercase |
| FR02 CSV: xem trước, lỗi theo dòng, chỉ ghi khi xác nhận | Có | Có preview/confirm; confirm kiểm lại từ đầu, còn lỗi là `IMPORT_HAS_ERRORS` và không ghi gì; `row` tính cả dòng tiêu đề; khớp QD §4.4 (1 MB, 2.000 dòng, importLock, 2 phép băm song song) |
| FR02 không tự đăng ký, không tự nâng quyền | Có | Không có endpoint đổi `role`; STAFF chỉ tạo được LECTURER/STUDENT; không tự khóa hay tự reset |
| FR02 bắt đổi mật khẩu sau reset | Có | `requirePasswordChanged` cho mọi router ngoài `/api/auth`. Làm được vì `requireAuth` nạp lại user mỗi request (`auth.js:12`), nên cờ có hiệu lực ngay |
| FR03 chỉ lời mời được chấp nhận mới thành thành viên | Có | Chỉ `accept` tạo `TopicMember` |
| FR03 min–max thành viên | Có | Có khóa Topic `FOR UPDATE`, đếm cả lời mời PENDING |
| FR03 N đề tài hoạt động/SV/đợt | **Một phần** | Có điểm kiểm và khóa User, nhưng tập thành viên đem khóa có thể đã cũ – xem vấn đề #1 |
| FR03 đúng một trưởng nhóm, chỉ trưởng nhóm gửi | Có | `leaderOnly`; đổi trưởng nhóm nằm trong một transaction |
| FR04 ngừng dùng thay vì xóa | Có | Không có endpoint xóa danh mục/đợt (chặt hơn đặc tả). Synonym xóa cứng là giả định có lý do |
| FR04 thứ tự mốc, min ≤ max | Có | Kiểm cả khi tạo lẫn khi PATCH (gộp với giá trị cũ rồi kiểm lại); `roundConfigSchema` có refine min ≤ max, review < high |
| FR05 chỉ sửa ở Nháp/Cần chỉnh sửa | Có | 409 `TOPIC_NOT_EDITABLE`; PUT kèm `version` |
| FR05 trường bắt buộc khi gửi | Có | `topicSubmitSchema(cfg)` lấy tham số theo đợt |
| FR05 mã duy nhất khi đồng thời | Có | `nextTopicCode` dùng sequence có thật (`after_init.sql:5`) |
| FR05 chỉ gửi trong thời gian mở đăng ký | Có (kèm G2) | Kiểm ở REQUEST_ADVISOR và SUBMIT; RESUBMIT được miễn – xem vấn đề #5 |
| FR06 top 5, hai điểm, cảnh báo không chặn, HIGH bắt buộc giải trình | Có | §7, §8.2 |
| FR06 lỗi không bao giờ bị coi là "không trùng" | Có | ERROR có `level: null`, khi gửi trả 409 `SIMILARITY_NOT_CHECKED`, không bao giờ trả `NONE`, không lộ `errorMessage` |
| FR06 ẩn hồ sơ chờ của nhóm khác | Có | Ẩn với mọi vai trò khác STAFF (G4). Đã ghi việc sửa `presentMatches` (`service.js:16` hiện chỉ ẩn với STUDENT) |
| FR06 lưu phiên bản thuật toán/ngưỡng/nội dung đã so | Có | Các cột tương ứng đã có trong `SimilarityCheck` |
| FR06 mục 3 – cờ "chưa kiểm tra" | Dời | G5. Chưa có task nào nhận – xem vấn đề #4 |
| FR07 chỉ cán bộ khoa chứa đề tài, có lý do, lưu người/thời điểm | Có | `inStaffScope`, `reasonRequired`, `ReviewDecision` |
| FR07 quyết định gắn đúng snapshot | Có | Phải là `seq` lớn nhất và chưa có quyết định, không thì 409 `STALE_SUBMISSION`; có thêm `submissionId @unique` + `version` |
| FR07 màn xét duyệt hiện kết quả FR06 + giải trình | Có | `GET submissions/:seq` |
| FR08 đủ 7 bộ lọc, phân trang ở server | Có | Đợt, năm học, lĩnh vực, GVHD, trạng thái, kết quả, từ khóa |
| FR08 phạm vi theo vai trò | Có | Áp ở `WHERE`, trước phân trang và trước `total`; bộ lọc chỉ thu hẹp phạm vi |
| FR08 kho chung chỉ gồm đề tài đóng đạt, đúng trường | Có | Không trả `id`, thành viên, file, nhận xét |
| FR16 nhận/từ chối có lý do, rút đề nghị | Có | |
| FR16 hạn mức kiểm trong transaction | Có | Khóa User của GV `FOR UPDATE` trong `extra`, sau `updateMany` của `applyTransition`. Ở READ COMMITTED, câu đếm chạy sau khi lấy khóa nên thấy được bản ghi vừa commit. Hai transaction khóa Topic khác nhau rồi cùng chờ một User nên không tạo vòng deadlock |
| FR16.5 không gửi xét duyệt sau khi đóng đăng ký; cán bộ thấy danh sách kẹt | Có | |
| FR17 snapshot bất biến (nội dung + FR06) | Có | Không có endpoint sửa/xóa; `payload` có `fieldName`. Phần file để đến T403 (GĐ2 chưa có file) |
| FR17 xem khác biệt giữa hai lần gửi | Có | §8.4 diff – lưu ý thứ tự route, vấn đề #6 |
| FR25 kiểm quyền ở backend, ADMIN không có quyền nghiệp vụ, cán bộ chỉ trong phạm vi khoa | Có | §1.1, §2, từng endpoint; quy ước 403/404 rõ ràng |
| §10 không thêm đường đi | Có | Như trên |

### Đánh giá 14 giả định §12
| # | Ý kiến |
|---|---|
| G1 | Hợp lý. Đây là lựa chọn duy nhất nhất quán với FR05 + mục 5 (ở HAS_ADVISOR không sửa được, cũng không có đường quay lại). Đồng ý giữ trong lúc chờ khoa trả lời |
| G2 | Đồng ý về hành vi, nhưng phải ghi đúng lý do – vấn đề #5 |
| G3, G6, G7, G8, G10, G11, G12, G13 | Hợp lý, chọn hướng an toàn hoặc khớp đặc tả |
| G4 | Hợp lý: mục 3 chỉ cho "cán bộ thấy đầy đủ" |
| G5 | Hợp lý cho GĐ2 (quy tắc an toàn: lỗi thì không gửi được), nhưng chưa có task nào nhận – vấn đề #4 |
| G9 | Chấp nhận được (`Topic.code` bắt buộc, sequence không trùng; khoảng trống mã không phải lỗi) |
| G14 | Khớp mục 3 "Đã đóng (mọi năm)" và khớp code hiện có (`prismaRepo.js`) |

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| 1 | MAJOR | `docs/agents/design/API_GD2.md:313`, `:290-292`, `:47` | Giới hạn N đề tài hoạt động/SV có lỗ hổng khi chạy đồng thời. `accept` lời mời không tăng `Topic.version` (§1.5 chỉ liệt kê sửa nháp, chuyển trạng thái, đổi trưởng nhóm). Còn REQUEST_ADVISOR thì khóa `User WHERE id IN (thành viên)` theo danh sách thành viên đã tải **trước** transaction. Kịch bản: X tải thành viên {A} → C chấp nhận lời mời vào X (Y của C vẫn DRAFT nên kiểm sớm qua) → Y REQUEST_ADVISOR commit → X REQUEST_ADVISOR: `updateMany` vẫn khớp `version`, chỉ khóa và đếm A, nên lọt. Kết quả: C có 2 đề tài hoạt động trong cùng đợt, vi phạm FR03 | Chọn một trong hai cách và ghi vào §5.5 + §1.5: (a) trong `extra`, sau khi `updateMany` đã giữ khóa dòng Topic, **đọc lại** `TopicMember` (`leftAt IS NULL`) rồi mới khóa User theo thứ tự id và đếm; hoặc (b) `accept`/`decline`/`cancel` lời mời tăng `Topic.version`. Khuyến nghị (a), có thể làm thêm (b). T214 thêm ca test đồng thời tương ứng |
| 2 | MINOR | `docs/agents/design/API_GD2.md:83`, `:88`, `:408-409`; `apps/api/src/lib/errors.js:13` | Hợp đồng dùng `details` cho các lỗi 409 (`STUDENT_TOPIC_LIMIT`, `DUPLICATE`, `SIMILARITY_NOT_CHECKED`) và 400 `JUSTIFICATION_REQUIRED`. Nhưng `conflict(code, msg)` không nhận `details`, còn `checkTransition` ném hai lỗi FR06 mà không kèm `details`. §11 không ghi việc phải đổi chỗ này | Thêm vào §11 (hoặc mục mới "Thay đổi ở apps/api"): `conflict(code, msg, details)`; service bắt lỗi FR06 từ `checkTransition` rồi gắn `details.similarityCheck` (hoặc `checkTransition` nhận thêm tham số `details`). Ghi task phụ trách (T207/T212) |
| 3 | MINOR | `apps/api/prisma/schema.prisma:234-244`, `:275`, `:289`, `:441`; `API_GD2.md:285`, `:341`, `:426-445` | Response cần `invitee{code,fullName}`, `lecturer{fullName}`, `createdBy`, `decidedBy`, `actor{fullName,role}`, nhưng `Invitation.inviteeId`, `AdvisorRequest.lecturerId`, `Submission.createdById`, `ReviewDecision.decidedById`, `StatusHistory.actorId` đều không có relation tới `User`, và `Invitation` không có index cho `inviteeId`. Hợp đồng không ghi có cần đổi schema hay không | Vì migration init chưa có (T203), nên thêm một mục "Thay đổi schema đề xuất cho T203": các relation trên, `@@index([inviteeId, status])` cho Invitation; tùy chọn thêm partial unique index "một LEADER đang hiệu lực mỗi Topic" và "một Invitation PENDING mỗi (topicId, inviteeId)" làm lưới an toàn ở DB. Nếu chọn không đổi schema thì ghi rõ "join thủ công" |
| 4 | MINOR | `docs/agents/design/API_GD2.md:540`, `:559` | G5 dời phần mục 3 "cán bộ cho phép gửi với cờ chưa kiểm tra + tự chạy lại, cập nhật snapshot" sang GĐ6, nhưng `BANG_CONG_VIEC.md` không có task nào nhận (T600 chỉ phủ FR18–FR23). Để vậy thì yêu cầu sẽ bị mất | Ghi tên task nhận (ví dụ thêm vào phạm vi T600/T605, hoặc đề xuất task mới để điều phối viên tạo) ở §12-G5 và §14 |
| 5 | MINOR | `docs/agents/design/API_GD2.md:537`, `:404` | G2 viện dẫn "mục 5 không nêu điều kiện thời gian". Nhưng FR05 ghi chung "Chỉ gửi được trong thời gian mở đăng ký", nên lý do này yếu. Lý do mạnh thì chưa ghi: NEEDS_REVISION chỉ có đường ra duy nhất là RESUBMIT (`transitions.js:12`), chặn theo thời gian thì đề tài kẹt vĩnh viễn | Bổ sung lý do "không chặn để tránh kẹt ở Cần chỉnh sửa, vì không có đường ra nào khác" vào G2 và câu hỏi §13.2 |
| 6 | MINOR | `docs/agents/design/API_GD2.md:428`, `:437` | `GET /submissions/diff` và `GET /submissions/:seq` trùng mẫu đường dẫn. Nếu khai báo `:seq` trước thì "diff" bị coerce int lỗi và trả 400 | Ghi rõ: khai báo route `diff` trước `:seq` (hoặc đổi thành `/submissions-diff`) |
| 7 | MINOR | `docs/agents/design/API_GD2.md:303` | Đổi trưởng nhóm ở trạng thái kết thúc trả `INVALID_TRANSITION`, trong khi đây không phải chuyển trạng thái | Dùng `TOPIC_NOT_EDITABLE` với thông điệp riêng, hoặc ghi chú là dùng lại mã có chủ ý |
| 8 | MINOR | `docs/agents/design/API_GD2.md:354` | "Kiểm tra trước" không cho ở WAITING_ADVISOR mà không nêu lý do | Ghi lý do (nội dung không đổi được từ HAS_ADVISOR trở về trước, và ở WAITING_ADVISOR cũng không đổi), hoặc thêm WAITING_ADVISOR cho nhất quán |

Vấn đề #1 phải sửa xong mới APPROVED. Các MINOR thì sửa, hoặc ghi lý do không sửa trong "Vòng sửa 1".

Kết luận: CHANGES_REQUESTED – 1 MAJOR (giới hạn đề tài/SV có lỗ hổng khi chạy đồng thời, vì REQUEST_ADVISOR khóa theo danh sách thành viên đã tải trước transaction), 7 MINOR; §10 khớp TRANSITIONS, 14 giả định hợp lý.
