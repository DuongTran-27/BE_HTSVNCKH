# T703 bước B – reviewer v2

Kết luận: **APPROVED** (không còn BLOCKER/MAJOR)

## Lệnh tự chạy (2026-11-08)
- `npm run db:test:reset`: "Đã reset DB test (migrate reset)."
- `npm run lint`: `eslint . --max-warnings 0` sạch.
- `npm test`: shared 73/73; api 60 file 907/907; web 25 file 219/219. Khớp báo cáo.

## Xác nhận sửa
- M1: đã sửa đúng. `T609-similarity-bypass.test.js:308-314` dùng `h = contentHash({title: t.title, keywords: []})` cho `okOther`, `okNew`, `okOld`, `crCheck`, cùng hash khớp payload của `s` (đã chứng minh bởi ca "ERROR → OK" dùng cùng cách tính và xanh). Chỉ `errNew` giữ hash mặc định vì nó bị từ chối do status, đúng ý. Không assert nào đổi, không `.skip`/`.only`. Mỗi ca từ chối nay chỉ đỏ vì đúng một điều kiện (topicId / createdAt / ChangeRequest).
- Đột biến: báo cáo ghi 3 đột biến (bỏ topicId, bỏ createdAt, bỏ NOT EXISTS ChangeRequest) đều làm ca đỏ. Tôi không tự chạy lại đột biến; dựa vào suy luận từ diff (hash khớp nên chỉ điều kiện còn lại mới chặn) cộng báo cáo.
- m1: `T703b.test.js:107-111` đã thêm payload U+2028, `\b`, `\f`, `\u007f`, U+0085 trong title/summary/keywords; test xanh, nghĩa là hash SQL khớp JS với các ký tự này.

## Ghi nhận (không chặn)
- Ba ca đột biến nằm trong một `it` vòng lặp nên khi đỏ chỉ báo ca đầu tiên lọt. Chấp nhận.
