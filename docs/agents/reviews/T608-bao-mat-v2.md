# Review T608 – bao-mat – vòng 2
Kết luận: CHANGES_REQUESTED

## Tôi đã tự kiểm tra
- `npx -w @nckh/api vitest run tests/T608` -> `Test Files 1 passed (1)`, `Tests 6 passed (6)`.
- `npm run lint` -> `eslint .` không lỗi.
- Đã đọc lại: mục "Vòng sửa 1" trong báo cáo T608, `backup.yml`, `cleanup-orphans.yml`, `backup-prune.js`, test T608, VAN_HANH 3.1–3.3, và migration `20261101000100_search_and_security/migration.sql:37-44` (bật RLS cho mọi bảng `public`, không có policy).
- Không chạy được workflow thật (không có GitHub ở đây).

## 4 MAJOR của v1
| # v1 | Trạng thái | Ghi chú |
|---|---|---|
| 1 pipe nuốt lỗi pg_restore | Đã sửa | `defaults.run.shell: bash` (backup.yml:22-24) + ghi `toc.txt` (backup.yml:50). |
| 2 step dọn đỏ khi rỗng | Đã sửa | `if/then/fi` đọc từ file (backup.yml:75-80); script không in gì khi rỗng (backup-prune.js:23). |
| 3 dump không mã hóa | Đã sửa về cơ chế | gpg AES256, cụm mật khẩu qua fd 0 (không lộ trên dòng lệnh), xóa bản rõ, upload `.gpg` (backup.yml:53-65). Chặn repo public: xem #A, cách kiểm hiện tại hỏng khi chạy theo lịch. |
| 4 artifact lạ cùng tiền tố | Đã sửa về cơ chế | Lọc theo `workflow_run.id` và `head_branch` (backup-prune.js:10-11), có test. Còn kẽ hở nhỏ: #C, #D. |

## Vấn đề mới do bản sửa gây ra
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| A | MAJOR | .github/workflows/backup.yml:29, 69 | `github.event.repository.*` lấy từ payload sự kiện. Với sự kiện `schedule`, payload chỉ có `schedule` (không có `repository`). Hậu quả: `!github.event.repository.private` thành `!null` = true, nên bước "Từ chối repo public" chạy và `exit 1` ở **mọi lần chạy theo lịch**, không còn sao lưu hằng ngày (sai FR26). Chạy tay (`workflow_dispatch`) thì có payload nên vẫn xanh, vì vậy bước xác nhận VAN_HANH 3.2 không phát hiện ra. Cùng nguyên nhân, `BRANCH` (dòng 69) rỗng nên bộ lọc nhánh tắt (backup-prune.js:11 `!branch`) và `?branch=` lấy run của mọi nhánh. Chưa xác minh được trên GitHub. | Đọc từ API thay vì từ payload, đúng cho mọi sự kiện: `read -r PRIV BRANCH < <(gh api "repos/$GITHUB_REPOSITORY" --jq '"\(.private) \(.default_branch)"')`, rồi `[ "$PRIV" = true ] \|\| exit 1`, và kiểm `test -n "$BRANCH"`. Sau khi sửa, xác nhận bằng log của một lần chạy **theo lịch** (ghi vào VAN_HANH 3.2). |
| B | MAJOR | docs/VAN_HANH.md:56 (3.1 bước 1); backup.yml:45 | Role `backup_ro` giờ là **bắt buộc**, nhưng làm theo SQL hướng dẫn thì pg_dump hỏng: (1) mọi bảng `public` bật RLS và không có policy (migration :37-44), role không có `BYPASSRLS` nên pg_dump (`row_security=off`) báo lỗi "query would be affected by row-level security policy"; (2) pg_dump không có `--schema` nên dump mọi schema của Supabase (`auth`, `storage`, ...), mà `backup_ro` không có quyền ở đó; (3) `GRANT ... ON ALL TABLES` chỉ áp cho bảng hiện có, bảng thêm ở migration sau sẽ làm pg_dump lỗi quyền. Riêng job dọn mồ côi: Prisma chạy bằng `backup_ro` sẽ bị RLS lọc âm thầm, `Document` trả 0 dòng, nên dry-run luôn báo 0 (kết quả sai mà không lỗi). | Thêm `BYPASSRLS` cho role (`CREATE ROLE backup_ro LOGIN BYPASSRLS ...`, cần role `postgres` của Supabase có BYPASSRLS; nếu không cấp được thì ghi rõ dùng role khác), `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT ON TABLES TO backup_ro;` (tương tự cho SEQUENCES), và `pg_dump --schema=public` (dữ liệu ứng dụng chỉ nằm ở `public`). Kiểm lại VAN_HANH 3.3: nếu `pg_trgm`/`unaccent` ở schema `extensions` trên Supabase thì DB thử phải tạo extension trong schema cùng tên trước khi restore. |
| C | MINOR | backup-prune.js:10, 21 | Nếu `RUN_IDS` rỗng thì bộ lọc run bị tắt (mở khi lỗi, đáng lẽ phải đóng). Ít xảy ra vì run hiện tại có trong danh sách, nhưng xem #A. | CLI: `RUN_IDS` rỗng -> exit 1, không xóa gì. |
| D | MINOR | backup-prune.js:10-11 | Run từ PR fork có sửa `backup.yml` vẫn mang workflow id này, và `head_branch` là tên nhánh của fork (có thể là `main`). Chỉ khai thác được khi repo private bật cho chạy workflow từ fork PR (mặc định tắt). | Lọc thêm `a.workflow_run.head_repository_id === a.workflow_run.repository_id`, hoặc chỉ lấy run có `event=schedule\|workflow_dispatch`. |
| E | MINOR | backup.yml:26, 33-36 | Không ghim SHA/digest: chấp nhận theo báo cáo. | – |

Điểm tốt: `permissions: {}` ở cấp workflow, quyền khai theo job; `persist-credentials: false`; không echo secret; không có script injection; dry-run vẫn an toàn.

Theo QUY_TRINH (chế độ tiết kiệm quota), đây là vòng 2 nhưng vẫn còn MAJOR, nên task chuyển **BLOCKED** chờ điều phối viên quyết định. Cả hai MAJOR đều sửa nhỏ (một step `gh api`, một đoạn SQL, một cờ `--schema=public`).
