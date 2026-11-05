# T505 – Review vòng 1 (reviewer)

Kết luận: **APPROVED**

## Lệnh tự chạy
- `npm run lint`: xanh (max-warnings 0).
- `npm test`: shared 73, api 632, web 168, tất cả đạt (khớp báo cáo).
- `npm run test:e2e -w @nckh/web`: 20 passed (khớp báo cáo).

## Đối chiếu
- Độc lập: đáp án `oracle()` đọc thô bảng topic/advising/resultVersion rồi gom bằng JS, không dùng SQL sản phẩm. Seed PRNG cố định (20261106), không phụ thuộc thời gian trừ mốc tương đối `at()` đã dùng trong cả bộ test.
- Độ chặt: so sánh toEqual từng dòng JSON với CSV đã parse, tổng, và Map đáp án theo key. Có chống test rỗng (P01). E01 kiểm số đổi đúng sau từng sự kiện, gồm G27 (chưa đóng không tính kết quả).
- Notify: kiểm đếm dòng thật, bản độc lập với unique của DB (`duplicates()`), đồng thời 5 lần, người nhận khác, bị khóa, không tự nhận.
- `prepare.js`: chỉ thêm SVE2E6 và `state.bell`; spec khác vẫn xanh.
- Ca hủy đổi thẳng DB có chú thích trong code (stats test dòng 170) và báo cáo ("cần bổ sung qua API khi T602 xong").

## BLOCKER / MAJOR
Không có.

## MINOR (không chặn)
- `stats-consistency.test.js:110`: ngưỡng `nonEmpty > 30` trên 180 lần kiểm khá lỏng; nên nâng dần hoặc ghi rõ tỷ lệ mong đợi.
- `stats-consistency.test.js:71`: `unescape` dùng quy ước nháy đơn của sản phẩm; chấp nhận được, nhưng nên có một assert cứng cho một ô cụ thể (ví dụ `'=1+1`).
- `notify-dedupe.test.js:190`: assert `n.link.includes(t.id) || n.link.startsWith('/')` gần như luôn đúng, nên siết hoặc bỏ.
- Khi T602 xong, chuyển bước hủy trong TC-FR14-E01 sang API (đã được báo cáo ghi nhận).
