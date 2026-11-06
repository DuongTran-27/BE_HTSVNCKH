# Review T601 – bao-mat – vòng 1
Kết luận: APPROVED

## Tôi đã tự kiểm tra
- `npm run lint` → `eslint . --max-warnings 0`, exit 0, không lỗi/cảnh báo.
- `npm test` (DB test đang chạy, không reset) → exit 0:
  ```
  @nckh/shared  Test Files 7 passed (7)   Tests 73 passed (73)
  @nckh/api     Test Files 51 passed (51) Tests 652 passed (652)
  @nckh/web     Test Files 22 passed (22) Tests 168 passed (168)
  test exit=0
  ```
  Khớp số liệu trong báo cáo.
- Test tấn công tạm `apps/api/tests/security/T601-bao-mat.test.js` (supertest, app riêng có `createMemoryStorage`), chạy `npx vitest run tests/security/T601-bao-mat.test.js` → `1 passed (1)`. Nội dung kiểm:
  - GV đích (`isChangeTarget`) ở stage TARGET: `POST /api/documents/:id/download-url`, `GET …/feedbacks`, `…/progress`, `…/status-history` đều 403; `GET /api/topics/:id/change-requests` chỉ trả yêu cầu của mình.
  - GV cũ chưa được cấp quyền, sau duyệt: `download-url`, `feedbacks`, `progress`, `submissions`, `similarity-checks/latest`, `change-requests` của đề tài đều 403 (FR19.4).
  - IDOR `PUT /api/topics/:id/former-advisors/:lecturerId/read-access`: cán bộ khoa khác, GV cũ, GV mới, SV trưởng nhóm, ADMIN → 403; cán bộ trong khoa → 200.
  - GV cũ được cấp quyền: `download-url` 200 (lấp chỗ trống báo cáo nêu ở "Còn lại / rủi ro"), `feedbacks` 200; ghi nhận xét, tạo yêu cầu thay GV, tự cấp lại quyền → 403; `TopicDetail.readOnlyAccess = true`, `formerAdvisors = []`, `permissions.giveFeedback = false`; bộ lọc `?lecturerId=<GV cũ>` của cán bộ không trả đề tài (G29).
  - Test không phát hiện lỗi nên đã gỡ khỏi repo theo quy trình (bản lưu ngoài repo). Đề xuất đưa các assert `download-url` của GV cũ/GV đích vào `T601-change-requests.test.js` (m3).
- File đã đọc: `changeRequests/{service,advisorChange,prismaRepo,routes}.js`, migration `20261106000000_gd6_change_requests/migration.sql`, `lib/logger.js`, `server.js`, diff `execution/{lock,prismaRepo,service,feedbackService,progressService,documentService}.js`, `topics/{service,listService,prismaRepo,closeService,closeConditions,snapshotService,advisorRepo,advisorService,similarityService}.js`, `notifications/routes.js` (`requireCronSecret` dùng `Authorization` → đã nằm trong redact), diff `API_GD6.md`, danh sách test `T601-change-requests.test.js`.

## Đối chiếu đặc tả
| Điều kiện đạt | Đạt? | Ghi chú |
|---|---|---|
| FR25: mọi route GĐ6 sau `guard` (requireAuth), ADMIN 403 ở `requireRole` | Đạt | `businessRouter(guard)` + `roles` không gồm ADMIN; route con dưới `/api/topics` đi qua guard của topicsRouter. Test ca 8 + probe IDOR |
| Quyền theo quan hệ kiểm ở service; cán bộ chỉ khoa được cấp | Đạt | `inScope` từ `staffFacultyIds`; `scopeWhere` áp ở WHERE trước phân trang; `get` trả 403 khi ngoài phạm vi, 404 khi không tồn tại |
| FR19.4 GV cũ mất mọi quyền kể cả đọc; trừ khi cán bộ cấp chỉ đọc | Đạt | Một nơi `canReadExecution`; `isFormerAdvisorReader` loại trừ `isCurrentAdvisor`; mọi nhánh ghi vẫn yêu cầu `isCurrentAdvisor`/`isMember`. Probe xác nhận cả `download-url` |
| `isChangeTarget` không đọc phần thực hiện | Đạt | Không có trong `canReadExecution`; probe 403 |
| GV cũ không ghi được sau thời điểm duyệt (race dưới khóa, §1.2) | Đạt | Duyệt khóa Topic (`FOR NO KEY UPDATE`) → `at = now()` sau khóa; mọi ghi của GVHD (nhận xét bản nộp/tiến độ, nhập kết quả, mốc nhánh LECTURER) gọi `assertCurrentAdvisor` sau cùng câu khóa; READ COMMITTED nên câu đọc Advising sau khóa thấy bản đã commit. `REQUEST_CLOSE` đọc `advisorId` dưới khóa. Các chuyển trạng thái khác bị chặn bởi `bumpTopicVersion`. Test đua 4 vòng + kiểm đột biến |
| Hạn mức GV mới (FR16) dưới khóa | Đạt | Khóa Topic → User (cùng thứ tự với advisorService), đếm bằng câu riêng sau khóa; test ca 4 |
| Transaction + nhật ký | Đạt | create/accept/decline/withdraw/approve/cấp quyền đều trong `withLockTx`, AuditLog + thông báo cùng tx; cập nhật có điều kiện `updateMany` chống ghi đè (ca 5). FR19 không đổi trạng thái nên không ghi `StatusHistory` (test kiểm 0) – đúng |
| Toàn vẹn DB | Đạt | Partial unique `change_request_one_pending`, trigger bất biến + chặn DELETE/TRUNCATE; bảng không mới nên RLS không đổi |
| Rò dữ liệu | Đạt | `ChangeRequestView` chỉ `id/fullName/role` của người; `formerAdvisors` chỉ cho cán bộ; thông báo không chứa lý do; `pendingChangeRequests` lọc theo quan hệ |
| Redact log (A T501) | Đạt | `LOG_REDACT` gồm `authorization`, `cookie`, `set-cookie`; CRON_SECRET đi qua `Authorization`; có test |

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| m1 | MINOR | `apps/api/src/modules/topics/service.js` (`canView`) | `canView` thêm `isChangeTarget`, nên GV đích đọc được cả `GET …/similarity-checks/latest` (similarityService dùng `canView`), trong khi §1.1 ghi "Chỉ `GET /api/topics/:id`". Giống tiền lệ `isRequestedLecturer`, vai trò LECTURER không bị FR08 che, nên không phải lỗ hổng | KTS ghi rõ trong §1.1 là chấp nhận (như isRequestedLecturer), hoặc T605 tách `canView` cho similarity |
| m2 | MINOR | `changeRequests/advisorChange.js:48-49` | Lúc duyệt có kiểm lại khóa/vai trò GV mới nhưng không kiểm lại `facultyId === topic.facultyId` (GV chuyển khoa giữa lúc tạo và lúc duyệt). Hiếm gặp | Thêm điều kiện `lec.facultyId !== lock/topic facultyId` vào `stale(...)` |
| m3 | MINOR | `tests/T601-change-requests.test.js` | Chưa có assert `POST /api/documents/:id/download-url` cho GV cũ (chưa cấp 403 / được cấp 200) và GV đích (403) – báo cáo tự nêu. Probe của tôi đã chứng minh đúng | Thêm 3 assert vào test "cán bộ cấp → GV cũ đọc được…" (cần app có `storage` bộ nhớ) |
| m4 | MINOR | `changeRequests/service.js:93-95` | `canCreate(rel)` tính từ ảnh trước khóa; trưởng nhóm vừa chuyển quyền (song song) vẫn tạo được một yêu cầu. Không leo quyền thực sự (vẫn là thành viên, vẫn cần GV mới + cán bộ duyệt) | Có thể bỏ qua; nếu sửa thì kiểm lại `LEADER` sau `lockTopic` |
| m5 | MINOR | `changeRequests/service.js:147-150` | `withdraw` chỉ xét `createdById`; người tạo đã rời nhóm / cán bộ đã mất phạm vi khoa vẫn rút được. Đúng chữ hợp đồng ("chỉ người tạo") | T603 (rời nhóm) quyết định có ràng thêm hay không |

## Câu hỏi của báo cáo – quyết định
1. **Không sửa `after_init.sql` (lệch §2.6 / §… "Ghi vào cả `migration.sql` và `after_init.sql`")**: chấp nhận. `after_init.sql` được test T203 khóa byte-by-byte với migration `search_and_security` và chính file ghi "đã áp thì không sửa"; mọi môi trường dựng từ `prisma migrate` đều nhận index/trigger GĐ6, có test riêng (P2002 + trigger + đếm TRUNCATE ở T204). Về bảo mật không có khoảng trống. KTS sửa câu trong §2.6 và dòng ~555 của `API_GD6.md` thành "chỉ trong migration GĐ6" khi chạm tài liệu lần tới.
2. **Sửa trực tiếp `API_GD6.md` cho m1–m4, m7, m8**: chấp nhận. Diff chỉ ghi lại hành vi đã hiện thực và sửa tham chiếu §11 → §11b; không nới quyền nào ngoài m2 T600 (GV cũ thấy yêu cầu thay mình), và m2 không lộ thêm dữ liệu vì GV cũ đã nhận `CHANGE_REQUESTED` và xem được yêu cầu đó khi còn là GVHD hiện hành. KTS chỉ cần xác nhận khi review GĐ6 tiếp theo, không hoàn lại.

## Kết luận
APPROVED – không có BLOCKER/MAJOR. MINOR m1–m5 không chặn DONE; m2, m3 nên làm luôn nếu tiện, còn lại ghi vào T603/T605/T607.
