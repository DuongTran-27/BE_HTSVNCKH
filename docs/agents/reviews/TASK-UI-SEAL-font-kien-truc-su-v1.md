# Review TASK-UI-SEAL (font) – kiến trúc sư v1

Đối tượng: `@fontsource/be-vietnam-pro` 5.3.0 (`apps/web/package.json`, ghim chính xác; `index.css` dòng 3–6 import 400/500/600/700).

Kết luận: **APPROVED**

| Tiêu chí | Kết quả | Căn cứ |
|---|---|---|
| Giấy phép | Đạt | `node_modules/@fontsource/be-vietnam-pro/package.json`: `"license": "OFL-1.1"`; có file LICENSE. Cho phép nhúng/tự host, chỉ cấm bán riêng font |
| Tiếng Việt (NFR07) | Đạt | `400.css` khai báo subset `vietnamese` với unicode-range U+0102-0103, U+0110-0111, U+01A0-01B0, U+0300-0309, U+0323, U+1EA0-1EF9 (đủ nguyên âm có dấu, đ, ơ, ư, dấu thanh tổ hợp). Be Vietnam Pro vốn thiết kế cho tiếng Việt |
| Không tải ngoài | Đạt | `@import` từ npm; `vite build` đã sinh file `apps/web/dist/assets/be-vietnam-pro-{latin,latin-ext,vietnamese}-{400,500,600,700}-normal-*.woff2` (+ .woff). Hợp CSP `font-src 'self'` trong `apps/web/vercel.json` |
| Kích thước tải | Chấp nhận | Mỗi độ đậm chia 3 subset bằng `unicode-range` nên trình duyệt chỉ tải subset có ký tự dùng trên trang (thường latin + vietnamese, ~2 file woff2 mỗi độ đậm, tối đa 8 file với 4 độ đậm). Trình duyệt hiện đại chỉ dùng woff2, bỏ qua .woff |

Đề xuất (không bắt buộc): import theo subset (`vietnamese-400.css`, `latin-400.css`…) chỉ bỏ được `latin-ext` mà trình duyệt vốn đã không tải khi trang không dùng ký tự đó, nên lợi ích thực tế gần bằng 0 và làm mất dự phòng cho tên riêng có ký tự ngoài. Giữ nguyên import hiện tại. Có thể giảm số request bằng cách bỏ độ đậm 500 nếu UI ít dùng `font-medium` – tùy chọn của UI.

Điều kiện: giữ ghim phiên bản chính xác; không thêm `@import url(https://fonts.googleapis...)`.

Giới hạn kiểm tra: vai này không có shell nên không tự chạy lại `npm run build -w @nckh/web`; đã đối chiếu thư mục `dist/assets` có sẵn từ lần build trước. Chưa đo byte từng file woff2.
