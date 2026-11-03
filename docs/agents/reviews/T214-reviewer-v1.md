# Review T214 – reviewer v1

Kết luận: **APPROVED** (không BLOCKER/MAJOR; MINOR không chặn).

## Tự chạy (DB riêng `nckh_t214rv_test`, localhost:54329, `db:test:reset` OK)
- `npm run lint`: sạch.
- `vitest run tests/T214` lần 1: 51 passed, 2 expected fail, 1 failed; lần 2: 51 passed, 1 expected fail, 2 failed.
  Các lỗi đều là "Expect test to fail" = BE đang sửa BUG-006/007/008 song song làm `it.fails` hết đỏ (TC-FR06-04, TC-FR03-F3). Không phải lỗi test; sẽ xanh khi 3 dòng đổi sang `it`. Không có test nào chập chờn ngoài hiệu ứng này (2 lần, kết quả khác nhau chỉ do tiến độ sửa của BE).
- 150 lượt x 8 MB chạy ~vài giây (cả file ~10 s) – không nặng cho CI.

## Đánh giá
- Test viết từ đặc tả, kiểm trên DB (count, status, version, StatusHistory), không chỉ status code. Tốt.
- Ca đồng thời dùng `Promise.all` trên request thật, lặp nhiều lượt, bất biến kiểm trên DB; đúng đồng thời.
- Rollback NFR05: trigger Postgres thật, 5 điểm, có `finally` dọn trigger; hợp lệ.
- NFR06: header/query giả của client được thử, kiểm cả đợt đóng/chưa mở/sát hạn; hợp lệ.
- `it.fails` chỉ ở 3 chỗ đúng BUG-006/007/008.

## MINOR
1. `T214-import-flaky.test.js:41-44` (TC-FR25-IMP-02): tiêu đề nói "403 JSON FORBIDDEN" nhưng `attempt` (dòng 23-30) chỉ trả status và bỏ qua lỗi mạng; nếu cả 30 lượt lỗi mạng thì test vẫn xanh (rỗng). Đề xuất: trả cả `r.body.error.code`, kiểm `FORBIDDEN`, và đòi ít nhất một phản hồi nhận được.
2. `T214-import-flaky.test.js:34-39`: `it.fails` + timeout 120000 – nếu timeout, `it.fails` cũng xanh giả. Sau khi BUG-008 sửa, đổi `it` (đã dự kiến) và hạ vòng lặp (vd. 150 → 30 ở CI) hoặc giữ vì tổng chỉ ~vài giây.
3. `T214-gd2-flow.test.js:175-184` (TC-NFR06-04): phụ thuộc đồng hồ thật, chờ ~4 s; request đầu phải xong trong <4 s, có rủi ro rất nhỏ trên CI chậm. Chấp nhận; có thể tăng `close` lên 6 s hoặc dùng fake timers cho phần chờ không (DB dùng `now()` server nên khó) – giữ nguyên là được.
4. `T214-gd2-flow.test.js:310` (TC-FR06-05): regex `/...|s39|s40/` có thể khớp ngẫu nhiên trong id cuid (xác suất cực nhỏ) và `summary` có thể hợp lệ xuất hiện ở dữ liệu của chính nhóm. Nên kiểm theo khóa cụ thể (`code` của nhóm khác) thay vì chuỗi con.
5. `T214-concurrency.test.js:5-6` và `T214-gd2-flow.test.js:6-7`: import `request`/`app` tách dòng riêng (gộp được); `it.each([1..n])` tham số không dùng chỉ để lặp – chấp nhận.
