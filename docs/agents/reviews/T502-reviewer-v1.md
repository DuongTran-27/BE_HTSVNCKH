# T502 – reviewer – v1
Kết luận: **APPROVED** · Ngày 2026-11-05 · BLOCKER: không · MAJOR: không
(Điều phối viên ghi lại từ báo cáo của reviewer – agent không tự ghi file.)

## Bằng chứng reviewer tự chạy
- `npm run lint` (`--max-warnings 0`): xanh · `npm run format:check`: xanh
- `npm test`: shared 69, api 602, web 163 – tất cả pass
- Nhánh thiếu migrations: đổi tên tạm `apps/api/prisma/migrations`, `node scripts/reset-test-db.js` → thông báo tiếng Việt, `exit=1`; đã trả lại thư mục.

## Soát
- Secret qua `printf` → `curl -K -`, không lộ tiến trình; URL không in. Đạt.
- `bash -e` + `--fail-with-body` → job đỏ khi lỗi. Đạt.
- `0 1 * * *` UTC = 08:00 VN. Đúng.
- Retry giữ nguyên được (endpoint idempotent, Render có thể ngủ).
- `ci.yml` `[main, master]`, `VAN_HANH.md` §2/§4, `QD_DB_TEST.md:147`: đạt.

## MINOR
1. `reminders.yml`: khi curl lỗi, `cat response.json` không chạy → log thiếu phản hồi lỗi. Đề xuất `curl ... || { rc=$?; cat response.json; exit $rc; }`.
2. Có thể bỏ `--retry-all-errors` để không thử lại 401/404 (đánh đổi: timeout khi Render ngủ).
