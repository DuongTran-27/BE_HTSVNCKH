# Review BUG-006/007/008 – reviewer v1

Kết luận: **APPROVED** (không BLOCKER/MAJOR; 2 MINOR không chặn).

## Lệnh tự chạy (DB nckh_bugrv_test, localhost:54329)
- `npm run db:test:reset`: xanh.
- `npm run lint`: không lỗi.
- `npm test`: shared 68/68, api 40 file 495/495, web 20 file 144/144.
- `vitest run tests/T214-import-flaky.test.js` x3: cả 3 lần 2/2 passed.
Khớp báo cáo (web nay xanh).

## BUG-006
Đạt. `groupService.js:76-77` đọc khoa người được mời trong transaction sau khi khóa/đóng lời mời, ném `forbidden()` làm rollback cả closeInvitation, nên lời mời vẫn PENDING, không có thành viên, không tăng version. Người không tồn tại cũng ra 403 (an toàn). Chốt: dùng 403 `FORBIDDEN` có sẵn, không cần mã riêng.

## BUG-007
Đạt. `engine.js:79-83` giữ phần tử đầu tiên của mỗi giá trị chuẩn hóa (đã gộp đồng nghĩa) trước `slice(0,5)`, nên 5 chỗ không bị chiếm bởi từ trùng. Câu thêm ở §7.2 API_GD2.md (dòng 492) rõ và khớp hành vi.

## BUG-008
Đạt có lưu ý. Thứ tự middleware: guard -> limiter (10 lượt/15 phút/người) -> vai trò -> validate -> importScope(drain) nên limiter chạy trước; kẻ tấn công là STAFF đã đăng nhập, mỗi lượt giữ tối đa 10 s một kết nối. `drainThen` không giữ dữ liệu trong RAM (chỉ đếm `size`), có timeout, xử lý `end/error/aborted`, `fired` chống gọi lặp. Test 150 lượt + IMP-02 (mọi lượt đều 403) xanh 3 lần.
- Không thấy `it.fails`/skip/only trong `T214-*`. Chỉ 3 `it.fails` -> `it` và IMP-01/02 chặt hơn (bỏ timeout, lỗi mạng tính là lỗi). T214 là file chưa theo dõi nên không có diff để đối chiếu, nhưng nội dung hiện tại không có assertion lỏng.

### MINOR
1. `apps/api/src/lib/multipart.js:12` mặc định `maxBytes = 32 MB`. Gợi ý không đổi sang `USER_IMPORT_MAX_BYTES` (1 MB): test gửi 8 MB, ngưỡng 1 MB sẽ trả 403 khi client còn đang gửi và tái hiện ECONNRESET. Nếu muốn siết, đặt hằng riêng (vd. 16 MB) kèm comment; hiện chấp nhận 32 MB vì băng thông bị giới hạn bởi limiter và timeout 10 s.
2. `multipart.js:23` sau khi `fire` do vượt `maxBytes`, `removeAllListeners('data')` để luồng tiếp tục chảy và bị bỏ; ổn, nhưng `removeAllListeners('data')` cũng gỡ listener của middleware khác (hiện không có). Nên dùng `req.off('data', onData)`.
