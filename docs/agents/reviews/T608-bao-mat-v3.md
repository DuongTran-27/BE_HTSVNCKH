# Review T608 – bao-mat – vòng 3
Kết luận: APPROVED

## Tôi đã tự kiểm tra
- `cd apps/api && npx vitest run tests/T608-devops-scripts.test.js` -> `Test Files 1 passed (1)`, `Tests 6 passed (6)` (test thuần, không cần DB; Docker không chạy trên máy review).
- `printf '[]' | RUN_IDS= BRANCH=main node backup-prune.js 7` -> exit=1, không in id nào (đóng khi lỗi, #C).
- `... | RUN_IDS=5 BRANCH=main node backup-prune.js 0` -> exit=1 (keep không hợp lệ).
- Mô phỏng bước đầu backup.yml bằng `bash -eo pipefail`: `read -r P B < <(false)` -> exit=1 (gh api lỗi thì job đỏ); `< <(echo "false main")` -> in "deny", exit=1.
- Đã đọc: báo cáo T608 mục "Vòng 3", review v1/v2, `backup.yml`, `cleanup-orphans.yml`, `backup-prune.js`, test T608, VAN_HANH mục 3.
- Không chạy được: workflow thật trên GitHub, pg_dump/pg_restore với role `backup_ro` trên Supabase (cần con người, VAN_HANH 3.2).

## 2 MAJOR của v2
| # v2 | Trạng thái | Ghi chú |
|---|---|---|
| A payload `schedule` không có `repository` | Đã sửa | backup.yml:28-35 đọc `private`/`default_branch` qua `gh api repos/$GITHUB_REPOSITORY`, đúng cho mọi sự kiện. Đóng khi lỗi: gh lỗi -> `read` trả 1 -> job đỏ; `private != true` -> exit 1; nhánh rỗng -> exit 1. Bước dọn dùng `env.DEFAULT_BRANCH` và tự kiểm lại (dòng 72-74). `contents: read` đủ cho GET repo. VAN_HANH 3.2 yêu cầu xác nhận bằng một lần chạy theo lịch. |
| B role `backup_ro` không dump được | Đã sửa (theo tài liệu) | VAN_HANH 3.1: `BYPASSRLS`, `ALTER DEFAULT PRIVILEGES FOR ROLE postgres` cho TABLES và SEQUENCES, có giải thích và hướng xử lý khi Supabase từ chối cờ. backup.yml:48 thêm `--schema=public`. VAN_HANH 3.3 bước 2 có lưu ý schema `extensions`. Job dọn mồ côi chạy bằng role này nay đọc được `Document` (hết lỗi "0 dòng âm thầm"). |

MINOR v2: #C đã sửa (CLI ném lỗi khi thiếu `RUN_IDS`/`BRANCH`), #D đã sửa (backup-prune.js:11 lọc `head_repository_id === repository_id`, có test artifact fork), #E giữ nguyên như đã chấp nhận.

## Vấn đề mới
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| F | MINOR | docs/VAN_HANH.md:72 | Dump có `--schema=public` nên `pg_restore --clean --if-exists` có thể sinh lỗi `DROP SCHEMA public` / `CREATE SCHEMA public` (schema đã tồn tại, có extension phụ thuộc). Các lỗi này vô hại nhưng mâu thuẫn câu "lỗi ở bảng `public` thì không [bỏ qua]", người diễn tập dễ hiểu nhầm. Chưa kiểm thực tế (không có Docker). | Khi diễn tập, ghi vào biên bản những lỗi gặp phải; cân nhắc bỏ `--clean` vì DB thử luôn trống. |
| G | MINOR | VAN_HANH 3.1 | `ALTER DEFAULT PRIVILEGES FOR ROLE postgres` chỉ có tác dụng nếu migration chạy bằng role `postgres` (đúng với `DIRECT_URL` hiện tại). Nếu đổi role chạy migration thì phải cập nhật. | Ghi chú một dòng khi có thay đổi; không chặn. |

Không thấy lỗi mới về bí mật: secret chỉ nằm trong env của từng step cần, không echo, `persist-credentials: false`, `permissions` khai theo job.

Kết luận: cả hai MAJOR của v2 đã sửa đúng, không có lỗ hổng khai thác được. APPROVED. Việc con người còn lại (không chặn review): tạo/cập nhật role `backup_ro` theo SQL mới và xác nhận log một lần chạy theo lịch (VAN_HANH 3.2).
