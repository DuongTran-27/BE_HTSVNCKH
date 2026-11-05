# Review T503 – bao-mat – vòng 1
- Ngày: 2026-11-05 · Phạm vi: `apps/api/src/modules/stats/*`, `apps/api/src/app.js`, `apps/api/src/modules/topics/{listService,prismaRepo}.js`, `packages/shared/src/{enums,labels,schemas,csv}.js`, `apps/api/tests/T503-stats.test.js`
- Đối chiếu: FR14, FR20, FR23, FR25; API_GD45 §9, §11, G27, G29

## Kết luận: APPROVED

## BLOCKER
Không có.

## MAJOR
Không có.

## Đã kiểm
| Hạng mục | Kết quả |
|---|---|
| SQL động | Biểu thức chiều chỉ lấy từ bảng trắng `DIMS` theo `groupBy` (đã qua `z.enum(STATS_GROUP_BY)`); mọi bộ lọc là tham số `Prisma.sql` (kể cả `status`/`result` qua `CAST(${..} AS enum)`, `facultyIds` qua `ANY(${}::text[])`). Không có `$queryRawUnsafe` hay nối chuỗi. |
| Xác thực, vai trò | Router tạo bằng `businessRouter(guard)` nên có xác thực; `requireRole('STAFF','LECTURER')` chạy trước limiter và validate; service chặn lần hai (STUDENT/ADMIN → 403). Test có 401/403 cho cả JSON lẫn CSV. |
| Cán bộ khoa | Phạm vi `t.facultyId = ANY(staffFacultyIds)` luôn có trong WHERE; `facultyId` ngoài phạm vi → 403; danh sách rỗng → không ra dòng nào (không mở rộng). |
| GV dò số liệu người khác | Phạm vi `a.lecturerId = me` luôn AND với bộ lọc, nên `lecturerId=<GV khác>` chỉ trả rỗng; `facultyId` → 400. Join `Advising.endAt IS NULL` nên GV cũ sau khi thay không còn thấy (G29). Không lộ thông tin qua nhóm nhỏ: GV chỉ đếm đề tài của chính mình; cán bộ chỉ đếm trong khoa được cấp, vốn đã được xem chi tiết. |
| Khóa lặp / tham số lạ | Khóa lặp thành mảng → 400; khóa lạ bị bỏ (z.object), không ảnh hưởng SQL. |
| Đếm trùng | `advising_one_current` và `result_one_current` bảo đảm mỗi đề tài một dòng join; `total` = số đề tài. |
| CSV | Dùng `toCsv` shared: BOM, `escapeCell` thoát `= + - @ \t \r` và ngoặc kép/xuống dòng; nhãn đến từ dữ liệu người dùng (tên GV, lĩnh vực, đợt) đều đi qua `escapeCell`. Header `text/csv; charset=utf-8`, `attachment`, `no-store`; tên file chỉ ghép `groupBy` (enum) + ngày, không chèn được header. JSON cũng `no-store`. |
| JSON = CSV | Cả hai gọi `computeStats`; test so khớp từng dòng nhiều chiều/bộ lọc/vai trò. |
| G27 ở `GET /api/topics` | Bộ lọc `result` thêm `status: 'CLOSED'`, `item.result` = null nếu chưa CLOSED. Chỉ thu hẹp dữ liệu trả về (không lộ thêm). Kho chung (`repositoryService`) vốn đã ràng CLOSED; chi tiết đề tài vẫn có `currentResult` cho GV nhập/sửa trước khi đóng nên luồng FR23 không hỏng. Web không dùng `item.result` của danh sách cho đề tài chưa đóng. |
| Lộ dữ liệu | Response chỉ có `groupBy`, `total`, `rows{key,label,count}`; `key` là id GV/lĩnh vực/đợt – cùng mức với bộ lọc danh sách đã có. |

## MINOR (không chặn)
1. `escapeCell` (shared, có từ trước) không thoát ô bắt đầu bằng khoảng trắng rồi `=` (ví dụ `" =1+1"`) hoặc ký tự toàn chiều rộng `＝`. Excel hiện đại thường không thực thi các trường hợp này, nhưng có thể siết thêm bằng `/^\s*[=+\-@]/` khi có dịp.
2. `MAX_ROWS` cắt sau khi tính `total` từ `rows` đã cắt: nếu một ngày có hơn 1.000 nhóm thì `total` không còn bằng số đề tài. Thực tế không xảy ra (số GV/lĩnh vực/đợt nhỏ); ghi để biết.

## Bằng chứng chạy lệnh (reviewer tự chạy)
```
$ npm run db:test:up
Kiểm tra DB test: tất cả OK.
DB test đã chạy.

$ npm run lint
> eslint . --max-warnings 0
(không lỗi, không cảnh báo)

$ npm test
 Test Files  7 passed (7)    Tests  73 passed (73)     # shared
 Test Files  48 passed (48)  Tests  616 passed (616)   # api
 Test Files  21 passed (21)  Tests  163 passed (163)   # web
```
Không viết thêm test tấn công: các kịch bản dò (GV truyền `lecturerId`/`facultyId`, cán bộ khoa khác, khóa lặp, SV/ADMIN) đã có trong `T503-stats.test.js` và đều đạt.
