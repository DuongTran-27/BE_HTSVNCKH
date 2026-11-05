# Review T608 – bao-mat – vòng 1
Kết luận: CHANGES_REQUESTED

## Tôi đã tự kiểm tra
- `npx -w @nckh/api vitest run tests/T608` -> `Test Files 1 passed (1)`, `Tests 5 passed (5)`.
- `npm run lint` -> `eslint .` không lỗi.
- `git grep` chuỗi kết nối có mật khẩu: chỉ có placeholder (`.env.example`, test giả `example.invalid`). Không có bí mật trong repo.
- Chạy thử ngữ nghĩa shell mặc định của step GitHub (`bash -e {0}`, **không** có `pipefail` khi không khai `shell:`):
  - `bash -e -c 'false | head -n 5; echo after-pipe-ok'` -> in `after-pipe-ok`, exit 0 (lỗi vế trái pipe bị nuốt).
  - `echo "" | while read -r id; do [ -n "$id" ] && echo "del $id" && echo ok; done` dưới `bash -e` -> exit 1.
- `git remote -v` rỗng: không xác định được repo GitHub public hay private.
- Đã đọc: báo cáo T608, `backup.yml`, `cleanup-orphans.yml`, `backup-prune.js`, `cleanup-orphans.js`, test T608, VAN_HANH mục 3, DAC_TA FR26, QUY_TRINH (chế độ tiết kiệm quota), `ci.yml`, `schema.prisma` (cột `passwordHash`, `RefreshToken.tokenHash`).

## Đối chiếu đặc tả
| Điều kiện đạt (FR26) | Đạt? | Ghi chú |
|---|---|---|
| pg_dump hằng ngày bằng GitHub Actions, lưu ngoài Supabase | Một phần | Có cron + artifact; bước kiểm dump không có tác dụng (#1); step dọn đỏ khi không có gì để xóa (#2) |
| Giữ 7 bản gần nhất | Một phần | Hàm thuần đúng; nhưng đếm cả artifact cùng tiền tố từ workflow/PR khác, có thể đẩy bản thật ra khỏi danh sách và xóa (#4) |
| Diễn tập khôi phục, biên bản | Chưa | Có hướng dẫn VAN_HANH 3.3; con người phải làm. Chấp nhận ở trạng thái này |
| Chỉ dọn file không tham chiếu, > 24h; không xóa tài liệu đã nộp | Đạt (dry-run) | Không có code xóa; `--apply` exit 2; ngày hỏng -> giữ; READY không bao giờ được chọn |
| Ghi lịch sử từng file đã xóa | Chưa áp dụng | Chưa xóa thật; đã ghi việc còn lại ở VAN_HANH 3.4. Chấp nhận |

Điểm tốt: secret truyền qua `env` và `docker run -e BACKUP_DATABASE_URL` (không có giá trị trên dòng lệnh), không `set -x`, không echo secret; workflow dọn mồ côi chỉ `contents: read` và secret chỉ ở step dry-run (không lộ cho `npm ci`); không có `${{ }}` nào từ input người dùng trong `run:` (không có script injection); dry-run thật sự an toàn.

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| 1 | MAJOR | .github/workflows/backup.yml:38 | `pg_restore --list < "$BACKUP_FILE" \| head -n 5` chạy dưới `bash -e` không `pipefail` -> exit code là của `head`, luôn 0. Bước "Kiểm tra bản dump đọc được" không bao giờ đỏ, dump hỏng vẫn được upload và bước dọn sẽ xóa bản tốt cũ để giữ bản hỏng. Báo cáo coi đây là kiểm tra đã có. | Thêm `shell: bash` (GitHub khi đó dùng `-eo pipefail`) cho các step, hoặc `pg_restore --list < "$F" > toc.txt && head -n 5 toc.txt`. |
| 2 | MAJOR | .github/workflows/backup.yml:50-52 (+ apps/api/scripts/backup-prune.js:18) | Khi không có gì để xóa (<= 7 bản, tức 7 ngày đầu và khi cron bị bỏ ngày), `console.log('')` in một dòng rỗng -> `[ -n "$id" ] && ...` trả 1 là lệnh cuối của vòng `while` -> pipeline cuối step exit 1 -> job Backup đỏ mỗi ngày dù bản sao đã upload. Đã chứng minh bằng `bash -e` ở trên. Job đỏ thường xuyên làm người vận hành bỏ qua lỗi thật. | Đổi vòng thành `if [ -n "$id" ]; then gh api -X DELETE ... && echo ...; fi`, hoặc thêm `|| true` có chủ đích chỉ cho dòng rỗng; không in gì khi danh sách rỗng. |
| 3 | MAJOR | .github/workflows/backup.yml:39-44 | Artifact là bản dump toàn DB **không mã hóa** (gồm `User.passwordHash`, `RefreshToken.tokenHash`, dữ liệu cá nhân sinh viên). Ai có quyền đọc repo đều tải được; nếu repo public thì mọi tài khoản GitHub đăng nhập đều tải được. Hiện chỉ có khuyến nghị "nên private" trong VAN_HANH 3.1, workflow không chặn. Không xác định được repo hiện tại (không có remote) – nếu public thì đây là BLOCKER. | Chặn cứng: bước đầu `if: ${{ !github.event.repository.private }}` -> `exit 1` ("Repo public, từ chối sao lưu"), và/hoặc mã hóa `gpg --batch --symmetric --cipher-algo AES256 --passphrase-file` bằng secret `BACKUP_PASSPHRASE` trước khi upload (cập nhật VAN_HANH 3.3 bước giải mã). |
| 4 | MAJOR | apps/api/scripts/backup-prune.js:9; .github/workflows/backup.yml:49 | Danh sách artifact là toàn repo, chỉ lọc theo tiền tố tên. Bất kỳ workflow nào khác (kể cả workflow `pull_request` của PR, chạy được upload artifact) tạo >= 7 artifact tên `nckh-backup-*` mới hơn sẽ khiến lần chạy kế tiếp xóa toàn bộ bản sao lưu thật (mất dữ liệu sao lưu, không khôi phục được). | Chỉ đếm artifact thuộc các run của chính workflow này trên nhánh mặc định: lọc `a.workflow_run.head_branch === <default branch>` và `workflow_run.id` thuộc `gh api repos/$GITHUB_REPOSITORY/actions/workflows/backup.yml/runs`; hoặc đơn giản hơn dùng `--jq` theo `workflow_run.head_branch` + đặt tên kèm `github.workflow`. Thêm test cho artifact lạ cùng tiền tố. |
| 5 | MINOR | .github/workflows/backup.yml:9-11, 24 | `actions: write` ở cấp workflow áp cho mọi step; `actions/checkout` mặc định lưu token vào `.git/config`. | Chuyển `permissions` xuống job, thêm `persist-credentials: false` cho checkout. |
| 6 | MINOR | .github/workflows/backup.yml:22, 24-25, 39; cleanup-orphans.yml:17-18 | Action theo tag (`@v4`) và image `postgres:17` không ghim digest; image nhận chuỗi kết nối DB. | Ghim SHA cho action và digest cho image (hoặc ghi lý do chấp nhận). |
| 7 | MINOR | .github/workflows/cleanup-orphans.yml:26-27; docs/VAN_HANH.md:57 | Job dry-run chỉ cần đọc nhưng dùng lại secret có thể là role `postgres` toàn quyền, chạy sau `npm ci` (mã phụ thuộc nằm trong tiến trình có secret). | Bắt buộc (không chỉ "nên") role chỉ đọc cho `BACKUP_DATABASE_URL`, ghi rõ lệnh tạo role trong VAN_HANH 3.1. |

Ghi chú: #1–#4 đều sửa nhỏ, không cần thư viện mới. MINOR không chặn DONE.
