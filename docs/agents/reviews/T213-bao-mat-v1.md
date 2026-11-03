# Review T213 – bao-mat – v1
- Reviewer: bảo mật (reviewer duy nhất, chế độ tiết kiệm quota; MINOR không chặn) · Ngày: 2026-11-03
- Phạm vi: packages/shared/src/schemas.js, apps/api/src/modules/topics/{listService,listRepo,routes,prismaRepo,snapshotService,reviewService}.js, apps/api/src/app.js, apps/api/tests/T213-topic-list.test.js
- Đối chiếu: DAC_TA FR08, FR25; API_GD2 §9.1, §8.4; reviews/T212b-reviewer-v1.md MINOR 1–2

## Kết luận: **APPROVED**
Không có BLOCKER, không có MAJOR.

## Đúng đặc tả
- FR08 / §9.1: đủ 7 bộ lọc (`roundId, academicYear, fieldId, lecturerId, status, result, q`), 4 kiểu sort, phân trang ở server, item đúng các trường của §9.1, không có `availableActions`.
- FR25: route `GET /` (routes.js:35) chỉ cho STAFF/LECTURER/STUDENT nên ADMIN bị 403. `scopeOf` (listService.js:11-16) đúng bảng phạm vi: SV là thành viên `leftAt null`, GV là GVHD `endAt null`, STAFF là khoa được cấp trừ DRAFT; vai trò khác nhận tập rỗng. Phạm vi là phần tử đầu của `AND` (listService.js:40) và dùng cùng một `where` cho cả `count` và `findMany` (listRepo.js), nên bộ lọc/total/sort không làm lộ dữ liệu ngoài phạm vi.
- MINOR 1 T212b: snapshotService.js:24 thêm `t.status !== 'DRAFT'` cho STAFF; có test. MINOR 2: reviewService.js:15-19 gọi `logger?.warn` kèm `err` và `topicId`, logger được truyền từ app.js.

## Bảo mật – đã kiểm
- SQL injection: `q` đi qua template `Prisma.sql` có tham số (listRepo.js:20-24). `sort` là enum Zod và được tra trong map `SORTS` (không ghép chuỗi).
- Escape LIKE: listRepo.js:14 escape `\ % _`; PostgreSQL mặc định dùng `\` làm ký tự escape cho LIKE/ILIKE.
- DoS: `q` tối đa 200 ký tự, `pageSize` tối đa 100, `page` tối đa 10000, tham số dạng mảng bị 400. Parser `simple` của Express 5 cùng `z.object` (bỏ khóa lạ) khiến `roundId[$ne]` bị bỏ qua.
- Response không có `passwordHash`/email/tóm tắt; `leader` chỉ có `code` và `fullName`.

Test tấn công tạm (`apps/api/tests/security/T213-bao-mat.test.js`, 6 test) đã chạy xanh rồi xóa, vì không phát hiện lỗi. Nội dung test:
- payload `' OR 1=1 --`, `%' OR '1'='1`, `DROP TABLE`, `\`, `%`, `_`, `\%`, `a\` trong `q`: SV chỉ thấy đề tài của mình, `q=%` cho total 0, số dòng Topic không đổi;
- `sort` lạ, `status`/`q` dạng mảng, `q` 201 ký tự, `pageSize=101`, `pageSize=1e6`, `page=0`, `page=10001`: tất cả 400;
- STAFF không có phạm vi khoa: total 0; STAFF lọc `status=DRAFT`: total 0;
- ADMIN có `q`: 403; response không chứa `passwordHash`, email, `summary`.

## BLOCKER
Không có.

## MAJOR
Không có.

## MINOR (không chặn)
1. listRepo.js:18-26: `searchIds` quét toàn bảng `Topic`, không giới hạn theo phạm vi, rồi trả mọi id khớp vào `id IN (...)`. Không lộ dữ liệu vì phạm vi vẫn được AND. Tuy nhiên `q` 1 ký tự sinh danh sách IN gần bằng toàn bộ đề tài, mỗi phần tử là 1 tham số bind. Ổn ở quy mô 2.000 đề tài. Nếu T704 đo thấy chậm, có thể thêm `LIMIT` hoặc đưa phạm vi vào SQL. Gợi ý: đặt `q.min(2)` hoặc ghi chú `shortcut:`.
2. listRepo.js:6: `round: true` nạp cả `config` của đợt cho từng dòng. `present` đã lọc nên không lộ ra ngoài, chỉ tốn tải; có thể đổi sang `select`.

## Trả lời "Câu hỏi cho reviewer"
- snapshotService khác `canView` ở chỗ GV được đề nghị (`isRequestedLecturer`): **giữ nguyên**. §8.4 liệt kê rõ quyền đọc là `isMember · isCurrentAdvisor · inStaffScope`. GV mới được đề nghị chỉ cần xem chi tiết (canView) để quyết định, không cần lịch sử snapshot hay lý do từ chối trước đó. Như vậy hẹp hơn và an toàn hơn. Không cần thống nhất; nếu muốn rõ ràng thì thêm một câu vào §8.4: "GV được đề nghị không đọc snapshot/lịch sử".

## Bằng chứng chạy lệnh
DB riêng `nckh_t213rv_test` (embedded localhost:54329, tạo mới), `DATABASE_URL`/`DIRECT_URL` đặt trong shell, không đọc .env.
```
npm run db:test:reset                                   -> Đã reset DB test (migrate reset).
npx vitest run tests/T213-topic-list.test.js            -> Tests 20 passed (20)
npx vitest run tests/security/T213-bao-mat.test.js      -> Tests 6 passed (6)   (đã xóa sau khi chạy)
npm run lint                                            -> eslint . (không lỗi)
npm test  -> shared: Test Files 6 passed (6),  Tests 68 passed (68)
             api:    Test Files 36 passed (36), Tests 436 passed (436)
             web:    Test Files 14 passed (14), Tests 117 passed (117)
```
