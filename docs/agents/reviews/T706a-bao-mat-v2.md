# Review T706a (bước A) – bảo mật – v2
- Reviewer: bao-mat · Ngày: 2026-11-08 · Phạm vi: các mục sửa theo v1
- **Kết luận: APPROVED**

## Bằng chứng tự chạy
```
$ npm run lint                      → exit 0 (--max-warnings 0)
$ npm test                          → shared 73/73; api 63 file 932/932; web 27 file 228/228
$ npm run build -w @nckh/web        → ✓ built in 315ms
```
API chạy được lần này (DB test đã dựng), không có ca nào lỗi.

## Kiểm các mục v1
- **MAJOR 1 – đóng.** VAN_HANH §6.4 mục 1 có `curl -sI .../api/health | grep -i '^x-middleware'` phải rỗng. Nếu có header thì xoay `ORIGIN_SECRET` theo 4 bước: sinh mới, cập nhật Render và deploy lại, cập nhật Vercel và redeploy, chạy lại curl. Có báo devops.
- **MINOR 1.a – đóng.** `middleware.js` bỏ mọi header có tiền tố `x-middleware-` do client gửi. Test ở dòng 31–38 kiểm `x-middleware-rewrite` giả không ghi đè đích, header giả không đi tiếp, và override-headers không chứa `x-middleware`.
- **MINOR 3.a – đóng.** §6.2 bước 2: environment `production` giới hạn nhánh `main` và có Required reviewers. `MIGRATE_DATABASE_URL` là environment secret, không phải repository secret.
- Các sửa tài liệu khác (cron qua domain Vercel, bỏ `--clean` khi restore, không đặt `DIRECT_URL` trên Render) không mở thêm rủi ro. `restore` dùng DB thử trống nên bỏ `--clean` là đúng.

## Nhắc lại hợp đồng bước B (đã chốt ở v1 mục 5, không đổi)
- `ORIGIN_SECRET` bắt buộc ở production (refine trong `env.js`, thiếu thì server không khởi động).
- Đặt ngay sau `app.disable`, trước mọi router. So bằng `timingSafeEqual`, khác độ dài trả 404.
- Chỉ miễn `GET /api/health` khớp chính xác.
- Thêm `x-nckh-origin` vào `LOG_REDACT`.
- Test bổ sung (a)–(c) như v1. Phải chạy lại cả suite API.
- MAJOR T703c mục 3 chỉ đóng khi §6.4 có kết quả đo thật đủ 9 mục.

Không còn MAJOR hay MINOR mở cho bước A.
