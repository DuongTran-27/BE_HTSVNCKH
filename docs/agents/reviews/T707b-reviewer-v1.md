# Review T707 bước B (BE, FE, QA, DO) – reviewer v1
Kết luận: **APPROVED** (0 BLOCKER, 0 MAJOR, 5 MINOR)

## Bằng chứng tự chạy (2026-11-08, Windows, máy local)
| Lệnh | Kết quả |
|---|---|
| `npm run db:test:up` | K1–K7 OK, "DB test đã chạy" |
| `npm run lint` | `eslint . --max-warnings 0`, không lỗi |
| `npm test` (sau `db:test:reset`) | shared 7/73; API 64 file / **945** test; web 28/230. Tất cả đạt. Chạy lại API riêng: 945/945 |
| `npm run build -w @nckh/web` | built OK (chỉ cảnh báo kích thước chunk có sẵn) |
| `npm run test:e2e -w @nckh/web` | 2 lần liên tiếp: **58 passed (2.8m)**, **58 passed (2.8m)**; `grep -ci hydratefallback` trên log = 0 |
| Sau E2E: `pg_proc` trên `nckh_t309_test` | chỉ còn `immutable_unaccent` (hàm đã được trả tên) |

Đếm test: HEAD 942 → BE +1 (B11) = 943 → QA +2 (TC-FR16-B7, TC-FR06-94) = 945, khớp lần tôi chạy. Báo cáo `T707b-qa.md` ghi 946 là sai số đếm (MINOR 1), không phải lệch kết quả: không có test nào đỏ, bị xóa hay bị skip.

Soát test bị làm yếu: `git diff -U0 apps` không có `.skip`/`.only` mới. Các dòng `it/test` bị xóa đều là đổi tên (TC-FR06-93 thêm assert, TC-FR14-E01/E02 → E03/E04, mô tả `gd6-ui-b.test.jsx:290`).

## Câu hỏi 1 – B1/G46
- `topics/service.js:57`: `canSeeBypassReason = isMember || isCurrentAdvisor || inStaffScope`, dùng ở TopicDetail (`:114`) và snapshot (`snapshotService.js:67` qua `can.rel`, `reader()` trả `rel`). Hai nơi cùng một quy tắc, đúng G46 (đã chấp nhận ở `T707a-reviewer-v1.md`).
- `T609-similarity-bypass.test.js:166-167`: GVHD hiện hành từ `reason: null` sang `REASON` là do đổi đặc tả G46, có ghi chú trong test và báo cáo. Không phải nới: assert vẫn là `toEqual` cả object, đồng thời có ca mới chặt hơn.
- **SV đã rời với `leftAt` = +1 giờ: kiểm đúng nhánh "đã rời", không phải xanh do trùng hợp.** `prismaRepo.js:19` chỉ nạp `members` với `leftAt: null`, nên bản ghi có `leftAt` khác null (kể cả ở tương lai) **không** vào `t.members` mà vào `formerMembers` (`findFormerMembers`). Do đó `relations()` cho `isMember = false`, `formerMemberWindows = [[-1h, +1h)]`, `versionReader` trả hàm cửa sổ → 200, và `canSeeBypassReason` false → `reason: null`. Kiểm đảo: với code cũ (`role === 'LECTURER'`), `gone` (STUDENT) sẽ nhận `REASON` → test đỏ. GV cũ (`endAt` quá khứ, `readOnlyGranted`) đi đường `isFormerAdvisorReader`, cũng đúng. Dữ liệu `leftAt` ở tương lai không thực tế (MINOR 2) nhưng không làm sai ý nghĩa test.

## Câu hỏi 2 – B11, B2, B6, B8
- B11 `app.js:35`: `helmet()` trước chốt. Test `T706b.test.js` so tập header 404 của chốt với 404 thường (bỏ `vary`/`access-control-*` vì cors vẫn sau chốt, đúng phạm vi B11) và khẳng định CSP/HSTS/nosniff có mặt. Đạt.
- B2 `PastTopicsPage.jsx:87`: dùng `SimilarityLevelCell level/status/unchecked`; API `snapshotService.js:46` trả `similarityStatus`, `unchecked` cho danh sách lần gửi. Test `change-requests.test.jsx` khẳng định "Gửi khi chưa kiểm tra" và không có "Không trùng" (quy tắc 5 CLAUDE.md). Đạt.
- B6 `routes.jsx:173-178`: `hydrateFallbackElement` tiếng Việt, `role="status"`; log E2E không còn cảnh báo. Đạt.
- B8 `StatsPage.jsx:102`: `key={params.roundId}`. Test `stuck-topics.test.jsx` tự đặt `key` trong khung test nên không chứng minh `StatsPage` có `key` (MINOR 3, đã được FE tự nêu).

## Câu hỏi 3 – E2E
- TC-FR06-E10 (`gd6.spec.js:75`): `db()` (`helpers.js:36`) dùng `DB_URL` là **hằng** trong `env.js` (`localhost:54329/nckh_t309_test`), không đọc biến môi trường hay `.env`, nên `ALTER FUNCTION` không thể chạy vào DB khác. Đó là chốt chặn đủ. `workers: 1` (`playwright.config.js:11`) bảo đảm không ca nào chạy song song lúc hàm bị đổi tên; `finally` trả tên; tôi xác nhận sau 2 lần chạy hàm đã về đúng tên. Nếu trả tên lỗi, `.catch(() => {})` nuốt lỗi, nhưng các bước recheck sau đó (`updated >= 1`) sẽ đỏ nên lỗi không bị che (MINOR 4: nên để lỗi nổi lên). Assert đủ mạnh: toast "chưa kiểm tra được", cờ ở hàng chờ, `updated >= 1` rồi `= 0` (idempotent), cờ mất, thông báo "Đã kiểm tra lại…". `reason` hiện cho SV (G46).
- TC-FR24-E01 (`m4.spec.js:70`): `attachment=true`, TTL 280–300 s, AuditLog +1, người ngoài 403 và AuditLog không tăng. Hạn chế không tải byte thật đã ghi trung thực.
- B7 TC-FR16-B7: 4 vai/người, `toEqual` danh sách mã + `total`, có đề tài `UNDER_REVIEW` của cùng người để chứng minh lọc `stuck`; dọn trong `finally`. Đạt.
- B9 TC-FR06-94: so văn bản seed, có `expect(block).toBeTruthy()` và `length > 0` nên regex hỏng thì test đỏ, không xanh rỗng. Đạt.
- B10: thêm `level ∈ {NONE, REVIEW, HIGH}` và recall ≥ 0,8 (ngưỡng đặc tả mục 3). Đạt.
- B15: chỉ đổi nhãn. Đạt.
- Sửa ca chập chờn `roles.spec.js:92-97`: chỉ thêm chờ (`settled` + `expect.poll` nút mở hoặc ô giải trình xuất hiện) trước khi đếm. Không đổi assert nào, các kỳ vọng "Đã gửi hồ sơ lần 2", "Chờ xét duyệt" giữ nguyên. Không nới. Lần chạy của tôi: 2/2 xanh (cộng 3/3 của QA).

## Câu hỏi 4 – ci.yml job e2e
Hợp lý: `needs: test`, service `postgres:16` cùng cấu hình job `test` (ảnh chính thức có sẵn contrib `pg_trgm`/`unaccent`; `db:test:up` chế độ external tạo extension ở `template1`, và `prepare.js` tạo `nckh_t309_test` từ đó). Mật khẩu `postgres` là DB dùng một lần, có ghi chú; `CRON_SECRET`/JWT trong `e2e/env.js` là giá trị giả. Không dùng secret thật. `apps/api/.env.test` đã được theo dõi trong git (job `test` cũng dựa vào nó), tôi không đọc nội dung. Artifact chỉ khi `failure()`. Chưa chạy thật trên GitHub Actions, actionlint chưa có (MINOR 5).

## Câu hỏi 5 – TRUY_VET.md
Khớp ca mới ở M3, M4, M5, FR14, FR16, FR24, mục 4. Lệch nhỏ: dòng FR06 (`TRUY_VET.md:32`) cột test vẫn chỉ liệt kê `e/gd6.spec.js TC-FR06-E09`, còn TC-FR06-E10 chỉ nằm ở cột ghi chú (gộp vào MINOR 1).

## MINOR (không chặn, theo QUY_TRINH)
1. `reports/T707b-qa.md`: sửa số "API 64 file/946 test" thành 945 (số thật). `TRUY_VET.md:32` thêm `TC-FR06-E10` vào cột test của FR06.
2. `T609-similarity-bypass.test.js:173`: nên dùng `leftAt: new Date()` (rời ngay sau khi có snapshot, giống luồng thật `groupService.js:128`) thay cho +1 giờ ở tương lai. Kết quả không đổi vì snapshot tạo trước đó.
3. `tests/stuck-topics.test.jsx`: test chỉ chứng minh mẫu remount bằng `key`. Nên render `StatsPage` thật (đổi `roundId` trên URL) để test đỏ nếu ai xóa `key` ở `StatsPage.jsx:102`.
4. `gd6.spec.js` (khối `finally` của TC-FR06-E10): bỏ `.catch(() => {})` khi trả tên hàm, hoặc chỉ nuốt lỗi khi chưa đổi tên được (ví dụ đặt cờ `renamed`), để lỗi trả tên hiện ra đúng chỗ.
5. Job `e2e` chưa có bằng chứng chạy trên Linux/GitHub Actions. T708 cần một lần chạy CI xanh (log "58 passed") hoặc ghi rõ hạn chế. Cân nhắc đặt `e2e` thành required check (việc của con người).

## Còn mở (không thuộc bước B)
B5 (hoãn, ngoài đặc tả) và B13 (gỡ `LOG_PROXY_HOPS` sau khi con người đo §6.4 mục 3) vẫn theo quyết định T707a. B12: QA đo 10/10 dưới tải, không sửa test. Đúng hướng dẫn.
