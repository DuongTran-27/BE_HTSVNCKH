# T206 – Review vòng 2 (reviewer)
Tự chạy (db:test:up, db:test:reset): shared 32/32; api 22 file, 216 đạt + 1 expected fail; web 75/75; `npm run lint` xanh. Khớp báo cáo.

## Xác nhận vòng 1
- MAJOR 1 (fail-open): ĐÃ SỬA. `lib/router.js` `businessRouter(guard)` đặt guard là câu đầu router; catalog tách 5 router mount tiền tố riêng (`app.js:36-44`), `BUSINESS_PREFIXES` đã bỏ; 404 đường dẫn lạ giữ nguyên, test GĐ1 không đổi. Test 401/PASSWORD_CHANGE_REQUIRED cho 6 tiền tố x 4 phương thức và test đọc mã nguồn cấm `Router()`/thiếu `businessRouter` có thật. Router quên guard: nếu tự `Router()`/import `Router` từ express thì test nguồn đỏ; nếu dùng `businessRouter` thì guard có sẵn. Chưa tự đột biến (không sửa code); đọc test thấy logic đúng.
- MINOR 1: ĐÃ SỬA. `rounds/prismaRepo.js:26-33` `updateLocked` khóa `FOR NO KEY UPDATE`, đọc, kiểm, ghi, audit trong một transaction; có test hai PATCH song song -> [200,400].
- MINOR 2: ĐÃ SỬA (thông báo trung tính, có test).
- MINOR 3: chấp nhận giữ 404 trước 403 theo §2, có test cả hai.

## Còn lại
### MINOR 1 – Test bảo vệ còn khe nhỏ
`tests/T206-catalog-rounds.test.js:379,397-410`. Danh sách tiền tố test 401 là hằng số cứng (tiền tố mới không tự được kiểm); regex cấm `Router` không bắt `import { Router as R } from 'express'` và chỉ quét `modules/*/routes.js`. Rủi ro thấp vì test nguồn buộc dùng `businessRouter`. Đề xuất (có thể gộp T207a): lấy tiền tố từ `app._router.stack`/hằng xuất từ app.js, và nới regex thành `/from\s*'express'/` kèm `Router`.

Kết luận: APPROVED (BLOCKER 0, MAJOR 0, MINOR 1)
