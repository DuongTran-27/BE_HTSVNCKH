# T703 bước B – reviewer v1

Kết luận: **CHANGES_REQUESTED** (1 MAJOR, sửa fixture test; code sản phẩm đạt)

## Lệnh tự chạy (2026-11-08)
- `npm run db:test:reset`: "Đã reset DB test (migrate reset)." – migration `20261108000100_t703b_submission_guard_hash` áp được.
- `npm run lint`: `eslint . --max-warnings 0` sạch.
- `npm test`: shared 7 file 73/73; api 60 file 907/907; web 25 file 219/219. Khớp bằng chứng trong báo cáo.

## MAJOR

### M1. Ca từ chối của T609 thành rỗng nghĩa với 3 điều kiện trigger cũ
`apps/api/tests/T609-similarity-bypass.test.js:297` (`mkCheck` mặc định `contentHash: 'h'`), dùng ở dòng 307–312 (`okOther`, `okOld`, `crCheck`).

Trigger mới AND thêm `c."contentHash" = submission_payload_hash(OLD.payload)`. `'h'` không bao giờ bằng sha256 hex, nên `new_ok` luôn false với mọi dòng tạo bằng `mkCheck` mặc định. Các ca "OK của đề tài khác", "OK cũ hơn lần gửi", "OK của ChangeRequest (m5c)" vẫn đỏ, nhưng **đỏ vì sai hash**, không còn kiểm điều kiện `c."topicId" = NEW."topicId"`, `c."createdAt" > OLD."createdAt"`, `NOT EXISTS ChangeRequest`. Grep `tests/`: chỉ có file này kiểm các điều kiện đó. Hệ quả: nếu ai xóa một trong ba điều kiện khỏi `submission_guard`, toàn bộ test vẫn xanh. Đây là test bị làm yếu gián tiếp (quy tắc 1). Báo cáo ghi "Ca từ chối giữ 'h', vẫn đỏ đúng như mong đợi", nhưng chính việc giữ `'h'` gây ra lỗi này.

Đề xuất (tối thiểu): cho `mkCheck` mặc định hash khớp payload mà `mkSub` dùng, ví dụ trong `mkCheck` đặt `contentHash` theo `contentHash({ title: <title đề tài>, keywords: [] })`. Cách gọn: `mkSub` trả thêm `h = hashOf(t)`, rồi `okOther` và `okNew` dùng `{ contentHash: h }`, `okOld` dùng `{ createdAt: ..., contentHash: h }`, `crCheck` dùng `{ contentHash: h }`. Riêng `okOther`: hash phải khớp payload của `s` (đề tài `t`), không phải của đề tài khác, để ca này chỉ đỏ vì khác `topicId`. Sau đó bỏ được `hashOf` cục bộ ở ca "ERROR → OK". Không đổi assert nào.

## Xác nhận các điểm yêu cầu
1. **`submission_payload_hash` khớp byte với `contentHash()`**: đạt.
   - Thứ tự `[title, summary, objectives, keywords]` cố định, không khoảng trắng, giống `JSON.stringify` mảng.
   - `to_json(text)` của PG escape `"`, `\`, `\b\f\n\r\t`, các ký tự < 0x20 khác thành `\u00xx` chữ thường, không escape `/`, U+2028 hay ký tự ngoài BMP. JS cũng làm đúng như vậy.
   - Khóa thiếu hoặc JSON null thành `'null'`, giống JS (`undefined`/`null` trong mảng đều thành `null`).
   - `keywords` thiếu thành `[]`, giống `recheck.js:14`. `keywords` là `String[]` (schema.prisma:214) và title/summary/objectives không null (schema:211–213), nên không gặp ca phần tử null hoặc kiểu số.
   - Test 2a so 3 payload: có ngoặc kép, `\`, `\n\t\r`, `\u0001`, `\u001f`, emoji, null, thiếu khóa. U+2028 mà báo cáo nhắc thì không có trong test (xem m1).
2. **Không chặn nhầm luồng G5/FR06**: chỉ `applySimilarityRecheck` UPDATE `similarityCheckId` (grep `src/`). Recheck băm đúng payload với `keywords ?? []`, nên hash khớp. Ca cron thật T609 (applySimilarityRecheck) vẫn xanh. INSERT không qua trigger (`BEFORE UPDATE OR DELETE`).
3. **Quy tắc 5**: trigger từ chối (kể cả khi hàm băm ném lỗi, chẳng hạn `keywords` là scalar) thì `recheck.js` bắt lỗi, tăng `stillFailing`, và lần gửi vẫn giữ trạng thái "chưa kiểm tra". Không có đường nào coi kết quả là "không trùng". Đạt.
4. **Fixture T609 (3 chỗ)**: trong ca "ERROR → OK", chỉ thêm `contentHash` khớp; assert giữ nguyên, không có `.skip`/`.only`. Phần này theo đúng hợp đồng mới. Tuy vậy ca từ chối ở trên lại bị yếu đi, xem M1.
5. **REJECTED trong danh sách bỏ qua**: DAC_TA dòng 109 ghi "tự chạy lại khi hết lỗi và cập nhật vào snapshot". `transitions.js` không có chuyển trạng thái nào đi ra từ `REJECTED`, nên trạng thái này cũng là trạng thái cuối như CLOSED/CANCELLED, và kết quả chạy lại không còn ai dùng. Lần gửi vẫn hiện "chưa kiểm tra", tức là không giả kết quả. Chấp nhận, cùng lý do với m3 gốc (đóng/hủy).
6. **Limiter cron**: tách bucket theo `req.path`. `/reminders`, đường dẫn lạ, hoa/thường hay có `/` cuối đều rơi vào `fallback`, nên chỉ có đúng 2 bucket và không có đường nào thoát limiter. Limiter vẫn chạy trước `requireCronSecret`. Ngân sách dò secret là 20 lượt/15 phút/IP, không đáng kể với secret ≥ 32 ký tự. Chấp nhận.
7. **isLatest (m2)**: với người đã rời, lọc khoảng trước khi tính max. Với thành viên hiện hành (`full`) không lọc, hành vi giữ nguyên. Test 3a kiểm cả hai phía và `latestOnly`. Đạt.
8. **Nguồn giờ `now()`**: `joinedAt` (tạo đề tài, nhận lời mời) và `Submission.createdAt` đều lấy `now()` của service. Test 3b tiêm giờ cố định. Đạt.
9. **escapeCell**: `/^(?:[\t\r]|\s*[=+\-@＝＋－＠])/`. Bắt được khoảng trắng (kể cả U+3000) đứng trước công thức và ký tự toàn chiều rộng. `'a =b'` giữ nguyên. Đạt.
10. **total (API_GD45 §9)**: tính tổng trên toàn bộ nhóm rồi mới `slice(0, MAX_ROWS)`. Test 1.001 nhóm cho total 1.006. Đạt.
11. **Hash giả login, cleanup-orphans**: `.catch` xóa cache khi lỗi, test 500 → 401 → 401. Danh sách mồ côi được in trước khi ném lỗi, và có test hai nhánh ngưỡng. Đạt.

## MINOR (không chặn)
- m1. `tests/T703b.test.js:107–111`: thêm một payload có U+2028, `\b`, `\f`, `\u007f` để test đúng như báo cáo mô tả.
- m2. Trigger so `c."createdAt"` (giờ DB/Prisma của dòng SimilarityCheck) với `OLD."createdAt"` (giờ app, đổi ở m3). Cron chạy cách lần gửi hàng giờ nên lệch vài giây giữa hai nguồn giờ không ảnh hưởng. Chỉ ghi nhận.

## Vòng sau cần
Sửa M1 rồi chạy lại `npm run db:test:reset`, `npm run lint`, `npm test`. Nên kiểm nhanh bằng đột biến: tạm xóa `c."createdAt" > OLD."createdAt"` thì ca T609 phải đỏ, sau đó hoàn tác.
