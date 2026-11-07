# Review bảo mật T706 bước B – v1
Kết luận: **APPROVED** (không BLOCKER/MAJOR; 3 MINOR không chặn)

## Bằng chứng chạy
- `npm run lint`: sạch (eslint --max-warnings 0).
- `npm test` (DB test reset): API 64 file / 942 ca pass; web 27 file / 228 ca pass.
- `BUG-013-temp-hash.test.js` chạy riêng 4 lần: 4/4 pass (4 ca mỗi lần), không chập chờn.
- Thử so sánh 404: tạo test tạm (đã xóa) so `GET /api/nope` (không ORIGIN_SECRET) với `GET /api/auth/me` thiếu header (có ORIGIN_SECRET). Body giống hệt: `{"error":{"code":"NOT_FOUND","message":"Không tìm thấy đường dẫn"}}`, status 404, cùng content-length/etag.

## Đối chiếu hợp đồng (T706a v1 mục 5)
- ORIGIN_SECRET bắt buộc ở production (refine, min 32): đạt, có test (a). Dev/test optional.
- `timingSafeEqual`: đạt. Khác độ dài thì trả sớm 404, không ném lỗi. Nhánh lệch độ dài chỉ lộ độ dài secret, vốn cố định và không bí mật; không khai thác được.
- Miễn đúng `GET /api/health` (so method + path chính xác; `/api/health/x`, POST, cron đều 404): đạt, có test (c).
- Vị trí: sau `pinoHttp`, trước helmet/cors/json/router: đạt. `throw` đồng bộ trong middleware Express 5 đi vào errorHandler, ra 404 chuẩn.
- Log: `req.headers["x-nckh-origin"]` đã vào LOG_REDACT; test (b) xác nhận log có tên header nhưng không có giá trị. Log hiện có `x-forwarded-for` thô nhưng chỉ là IP, không nhạy cảm.
- Preflight OPTIONS qua Vercel: middleware Vercel gắn header cho mọi method nên qua; gọi thẳng Render bị 404 (đúng ý). Cần xác nhận ở checklist §6.4 mục 1.
- LOG_PROXY_HOPS: mặc định false, chỉ log trong handler `GET /api/health` (`req.ips`, `x-forwarded-for`), không log cookie/token. Chấp nhận. Lưu ý: health được miễn secret nên ai cũng kích hoạt được dòng log này khi biến đang bật; chỉ tăng log, vô hại, và bật tạm.
- Pad 17408 = 19456 − 2048: đúng ý MINOR 1 BUG-013 (tổng verify nhẹ + pad = một verify đầy đủ). Chuỗi mã hóa mang tham số nên verify không đổi. Cache promise vẫn xử lý reject.
- Test của agent khác: BUG-013 chỉ đổi assert sang hai phía 0,8–1,2 (siết chặt hơn, theo yêu cầu, không nới). T403:314 chỉ thêm `ORIGIN_SECRET` vào fixture production (bắt buộc do refine mới); các assert khác giữ nguyên. Xác nhận không nới.
- CORS: trim + lọc rỗng, có test.

## MINOR (không chặn)
1. 404 của chốt ORIGIN_SECRET không có header helmet/CORS (404 chuẩn có CSP, HSTS, `access-control-*`...). Body giống nhau nhưng header khác, nên kẻ gọi thẳng Render nhận ra "bị chốt chặn" so với 404 thật. Không khai thác được gì (chỉ biết có lớp chặn), nên chấp nhận. Muốn khớp thì đặt `helmet()` trước chốt này.
2. Test thời gian BUG-013 so tỉ lệ hai khoảng 10 lần verify; trên CI chạy chung tải có thể dao động ngoài 0,8–1,2. 4/4 lần đạt ở đây, chưa đo dưới tải. Nếu CI chập chờn thì tăng số vòng hoặc lấy median, không nới ngưỡng.
3. Mã `LOG_PROXY_HOPS` là tạm; theo VAN_HANH §6.4 mục 3 phải gỡ sau khi đo. Ghi vào bảng việc để không bị bỏ sót.

## Còn lại để đóng T706 (không thuộc review mã)
Mục "Kết quả đo thật" §6.4 đủ 9 mục (kể cả MAJOR 1 T706a: `curl -sI ... | grep -i '^x-middleware'` rỗng) do con người làm sau deploy; MAJOR T703c mục 3 chỉ đóng khi có số đo.
