# Review TASK-DC-08 – bao-mat – vòng 1
Kết luận: APPROVED

Tôi tự đọc `git diff` và các file chưa theo dõi: `modules/councils/{service,prismaRepo,routes}.js`, `DC08-councils.test.js`, thay đổi ở `topics/service.js` (`relations`, `canView`, `canReadExecution`, `viewHistory`), `topics/prismaRepo.js` (`COUNCIL_SEATS`), `execution/prismaRepo.js` (`findExecTopic`), `topics/{listRepo,listService}.js`, `packages/shared/src/{schemas,enums,labels}.js`, `openapi/spec.js`, `app.js`, `tests/db.js`, `DC07-defense.test.js`, `T501-notifications.test.js`. Tôi đối chiếu với `lib/tx.js` (`withLockTx`, `lock_timeout` 3s), `middlewares/validate.js`, mọi nơi gọi `canView`/`canReadExecution`/`relations()` (grep toàn `apps/api/src`), `ADVISOR_CHANGE_STATUSES` và các đường tạo `Advising`. Tài liệu đối chiếu: API_GD7 §1.1–1.3, §6, §11; DAC_TA mục 9 (FR35, FR24, FR25); review DC-07 (m3, m4). Tôi không đọc `.env` và không sửa code.

## Tôi đã tự kiểm tra
```
$ DB_TEST_DRIVER=embedded npm run db:test:up
Kiểm tra DB test: tất cả OK.
DB test đã chạy.
$ npm run db:test:reset
Đã reset DB test (migrate reset).
$ npm run lint
lint_exit=0
$ npm test
test_exit=0
 Test Files  8 passed (8)    Tests  100 passed (100)     # shared
 Test Files  81 passed (81)  Tests  1167 passed (1167)   # api
 Test Files  32 passed (32)  Tests  245 passed (245)     # web
```
Tổng 1512/1512, khớp báo cáo. Lint và test chạy tuần tự, không có tiến trình test nào khác.

Tôi không viết test tấn công riêng. Mọi đường tấn công tôi nghĩ ra đều đã có ca trong DC08 và đang xanh: IDOR hội đồng khoa khác, GV ngoài hội đồng, SV, ADMIN, 12 endpoint ghi với thành viên hội đồng, mất quyền sau hủy/CLOSED, đồng thời gán. Phần khóa và thứ tự khóa tôi kiểm bằng cách đọc code (xem dưới). `git diff` và file mới không chứa khóa hay chuỗi kết nối.

## Đối chiếu đặc tả / danh mục bảo mật
| Điều kiện | Đạt? | Ghi chú |
|---|---|---|
| ADMIN không có quyền nghiệp vụ (FR25) | Đạt | `requireRole('STAFF')` cho ghi, `requireRole('STAFF','LECTURER')` cho đọc (`routes.js:282-298`). `businessRouter(guard)` có `requireAuth`. `GET /api/topics?councilAssigned` với ADMIN trả 400, phạm vi ADMIN vẫn rỗng |
| STAFF chỉ trong khoa được cấp | Đạt | Ghi: `loadForStaff` (`service.js:46-51`) và `create` (`:58`) dùng `inScope` theo `council.facultyId`/`round.facultyId`. Hủy: `:147` theo `a.council.facultyId`. Gán: đề tài khác khoa/đợt với hội đồng → 400 (`:116`), nên không gán chéo khoa được. Danh sách: `facultyId in staffFacultyIds` (`:164`) |
| SV 403 | Đạt | Bị chặn ở `requireRole`; TC-15, TC-16 |
| IDOR `:id` hội đồng/phân công | Đạt | `get` kiểm phạm vi hoặc thành viên (`service.js:174-180`). Mọi id qua `checkId` (`idSchema`) nên id rác trả 404. 404 và 403 khác nhau, cùng quy ước với các module khác (id cuid, không đoán được) |
| Thành viên HĐ chỉ đọc (GD7 §1.1) | Đạt | `isCouncilMember` thêm **một lần** ở `relations()` (`topics/service.js:50`), dùng trong `canView`/`canReadExecution`/`viewHistory`. Tôi grep mọi chỗ dùng `canView`: các đường ghi (`similarityService.check`, `advisorService`, `reviewService`, `closeService`, `defenseService`, `recruitmentService`, `changeRequests`) đều kiểm quan hệ/vai trò riêng sau `canView`. TC-13 khẳng định đủ 12 endpoint ghi của §6.6 #7 trả 403, không sinh AuditLog ghi. `canSeeBypassReason` không gồm hội đồng (G46 giữ nguyên) |
| Mất quyền khi hủy phân công / đề tài đóng (G62) | Đạt | `COUNCIL_SEATS` lọc `cancelledAt: null`; `COUNCIL_GONE` = CLOSED/CANCELLED. `findDetail` và `findExecTopic` dùng chung, nên `download-url` cũng mất quyền (TC-14). Bị bỏ khỏi hội đồng thì dòng `CouncilMember` bị xóa, mất quyền ngay ở request kế tiếp (TC-12) |
| G49: không mở rộng `GET /api/topics` cho GV hội đồng | Đạt | Phạm vi LECTURER không đổi; TC-17 |
| `defenseCouncil` chỉ STAFF | Đạt | `listService.js` spread có điều kiện `user.role === 'STAFF'`; phạm vi STAFF đã áp ở WHERE trước phân trang |
| Transaction + thứ tự khóa (§1.2) | Đạt | Gán: Council `FOR SHARE` → Topic `ORDER BY id FOR NO KEY UPDATE` (LockRows nằm trên Sort, nên khóa theo thứ tự id). Hủy: Council `FOR SHARE` → Topic → Assignment. Đổi thành viên: chỉ Council `FOR UPDATE`. RETURN_FROM_DEFENSE: Topic → Assignment, không khóa Council. INSERT CouncilAssignment lấy `FOR KEY SHARE` trên Council/Topic, tương thích với khóa đang giữ. Không có chu trình. `lock_timeout` 3s < timeout tx 15s |
| Tất cả hoặc không | Đạt | Mọi kiểm và mọi INSERT nằm trong một `withLockTx`. Lỗi ở bất kỳ đề tài nào (kể cả P2002) đều ném ra, rollback cả lô (TC-05, TC-06) |
| Xung đột lợi ích kiểm sau khóa | Đạt | Gán: thành viên đọc sau Council SHARE (đổi thành viên cần FOR UPDATE nên bị chặn); GVHD đọc sau khóa Topic (`service.js:122-126`). Đổi thành viên: đọc GVHD của phân công mở sau Council FOR UPDATE. GVHD không đổi được ở WAITING_DEFENSE (`ADVISOR_CHANGE_STATUSES`, cả 2 đường `createAdvising` đều qua kiểm này; TC-09), nên không cần khóa Topic |
| Đồng thời gán một đề tài vào 2 HĐ | Đạt | Topic lock tuần tự hóa; index `council_assignment_one_open` là chốt cuối; TC-07 chạy 4 lượt |
| `COUNCIL_LOCKED` khi đã có điểm | Đạt | `hasScores` đọc sau FOR UPDATE; TC-11 giữ FOR SHARE như §7.3 |
| Đầu vào (Zod) | Đạt | Body là `strictObject`; cơ cấu thành viên `.max(7)` trước refine (QD_ZOD §5); `topicIds` 1..50, không trùng; query có schema. SQL thô dùng tagged template / `Prisma.join`, không ghép chuỗi |
| Rate limit | Đạt | Ghi 30/15 phút/user (TC-19). Xem ghi chú 1 |
| Audit | Đạt | `COUNCIL_CREATE`, `COUNCIL_UPDATE`, `COUNCIL_MEMBERS_SET` (before/after), `COUNCIL_ASSIGN` (mỗi đề tài), `COUNCIL_UNASSIGN`, đều có `ip`, cùng tx với thay đổi |
| Rò rỉ dữ liệu | Đạt | `CouncilView` chỉ có mã/tên/trạng thái đề tài, tên GVHD, điểm tổng hợp; không có `passwordHash`/email/token. Danh sách không có `assignments`. Xem ghi chú 2 |
| m3 DC-07 | Đạt | `tests/db.js:21` restart `council_code_seq`; TC-02 khẳng định `HD-2026-001` |
| m4 DC-07 | Đạt | DC07 §5.6 #5 giờ phân biệt: phân công mở 200 → hủy 403; phân công đã chốt (HĐ khác) vẫn 200 |

## Trả lời câu hỏi của dev
1. **§6.6 #6 mới một nửa**: chấp nhận cho DC-08. Phần DC-08 chịu trách nhiệm (đổi thành viên khóa FOR UPDATE, `COUNCIL_LOCKED` đọc sau khóa, người bị bỏ mất quyền) đã có test. Tôi chuyển thành điều kiện bắt buộc cho DC-09 (m1 dưới).
2. **`TOPIC_ALREADY_ASSIGNED` chỉ có đề tài trùng đầu tiên**: chấp nhận. Đây không phải vấn đề bảo mật. Index là chốt chặn đúng và an toàn khi đồng thời; một bước đọc trước dưới khóa Topic cũng sẽ đúng nhưng không bắt buộc. GD7 §1.3 chỉ quy định có `details.topicCodes`, không yêu cầu đủ.
3. **`includeCancelled` của thành viên HĐ bị bỏ qua**: chấp nhận. GD7 §6.1 chỉ nói tham số dành cho cán bộ. Bỏ qua thì không lộ gì (`service.js:179` ép `staff && …`), và schema vẫn chặn giá trị lạ (400).
4. **Hai test cũ bị đổi (quy tắc 1)**:
   | Test | Quyết định | Lý do |
   |---|---|---|
   | `T501-notifications` 39 → 43 | Chấp nhận | GD7 §11 thêm đúng 4 loại `COUNCIL_*`; ca "mỗi loại có nhãn" giữ nguyên, vẫn so độ dài chính xác |
   | `DC07-defense` §5.6 #5 | Chấp nhận, chặt hơn | Ca cũ chỉ xanh vì chưa có `isCouncilMember`. Giữ dữ liệu cũ sẽ mâu thuẫn GD7 §1.1 (phân công đã chốt vẫn đọc). Ca mới thêm 2 khẳng định (200 trước khi trả, lecF2 vẫn 200), giữ nguyên các khẳng định cũ. Đây đúng là việc m4 yêu cầu |

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| m1 | MINOR (chuyển DC-09) | `councils/service.js:88-90`; DC-09 `my-score` | §6.6 #6 nhánh "đổi trước → chấm nhận 403" chưa chứng minh được vì chưa có endpoint chấm. Nếu DC-09 kiểm tư cách thành viên **trước** khi khóa Council, người vừa bị bỏ vẫn chấm được | DC-09: `my-score`/`finalize` khóa Council FOR SHARE rồi mới đọc `CouncilMember` của me. Thêm ca đồng thời "đổi trước → chấm 403" (cùng chỗ với m1 của DC-07) |
| m2 | MINOR | `councils/routes.js:280`, `:298` | `councilsRouter` và `councilAssignmentsRouter` mỗi bên tạo một limiter riêng, nên mỗi user được 30 lần ghi hội đồng **cộng** 30 lần hủy phân công trong 15 phút (tổng 60), trong khi GD7 §6 ghi "Limiter ghi 30/15 phút/user" cho cả mục. Mức rủi ro thấp: chỉ STAFF trong phạm vi, mọi lần ghi đều có audit | Dùng chung một instance (tạo ở `app.js` hoặc ở module rồi truyền vào), hoặc ghi rõ trong GD7 là đếm riêng |

Ghi chú (không tính là vấn đề):
1. GET hội đồng không có limiter riêng, giống các endpoint đọc khác (đã có limiter chung của app nếu cấu hình).
2. Thành viên HĐ vẫn thấy trong `GET /api/councils/:id` các phân công đã chốt của đề tài đã CLOSED (mã, tên, trạng thái, tên GVHD, `finalScore`, `decision`), dù không mở được chi tiết đề tài (G62). Đây là quyết định của chính hội đồng họ và là dữ liệu tối thiểu, đúng hình dạng §6.1. Nếu muốn ẩn tuyệt đối thì bên thiết kế quyết ở DC-09 (§7.2).
3. 404/403 khác nhau ở `GET /api/councils/:id` cho phép dò sự tồn tại của id; id là cuid, cùng quy ước toàn dự án.
4. E2E chưa chạy (việc của điều phối viên). Seed không đổi, nhưng item `GET /api/topics` của STAFF có thêm khóa `defenseCouncil`.
5. `.playwright-mcp/` không thuộc task này, không commit.

Tổng vòng 1: 0 BLOCKER, 0 MAJOR, 2 MINOR. Không chặn DONE; m1 gắn vào DC-09, m2 sửa khi tiện (hoặc khi làm DC-09 vì DC-09 thêm route vào `councilAssignmentsRouter`).
