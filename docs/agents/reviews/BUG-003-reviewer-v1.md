# Review BUG-003 – reviewer – vòng 1
Kết luận: APPROVED

## Tôi đã tự kiểm tra
Đã đọc: dòng BUG-003 trong `BANG_CONG_VIEC.md`; `reports/BUG-003.md`; `reports/T201.md` mục "Vòng sửa 2"; `apps/api/scripts/test-db-guard.js`, `reset-test-db.js`, `db-test.js`; `tests/T201-db-helpers.test.js`, `tests/T201-qa-isolation.test.js`. Đã chạy chung với T201: xem `reviews/T201-reviewer-v2.md`, mục "Tôi đã tự kiểm tra".
```
$ npm run db:test:up → exit=0 ; npm run db:test:reset → exit=0
$ NO_COLOR=1 npm test ×2 → 21/21, 123/123, 32/32, exit=0 cả 2 lần
$ (apps/api) npx vitest run … --reporter=verbose
  ✓ TC-NFR08-01: reset từ chối khi DIRECT_URL … trỏ host không cục bộ
  ✓ T201-db-helpers > chỉ DIRECT_URL trỏ ra ngoài vẫn bị chặn (BUG-003)
  ✓ T201-db-helpers > localhost nhưng DB không phải *_test (DB dev cục bộ) bị chặn
$ DATABASE_URL=…localhost:54329/postgres DIRECT_URL=…/nckh_test node scripts/reset-test-db.js → "Từ chối reset … DB "postgres"", exit=1
$ npm run db:test:down → exit=0, không còn postgres
```
Với kịch bản `nckh_dev_qa`/`dev_marker` trong mô tả BUG, tôi không tự dựng lại DB nháp. Bằng chứng: QA tái hiện lại ở `BUG-003-kiem-thu-v1.md`, TC-NFR08-03 (cùng cơ chế "DB dev trên localhost, `dev_marker` còn") chạy xanh trên máy tôi, và tôi đã đọc code chặn ở `test-db-guard.js:30-31`.

## Đối chiếu đặc tả
| Điều kiện đạt | Đạt? | Ghi chú |
|---|---|---|
| Kiểm cả `DIRECT_URL` trước mọi lệnh prisma | Đạt | `reset-test-db.js:13-14` gọi `assertTestDbEnv` trước mọi `execSync`. Danh sách biến lấy từ `schema.prisma` (`test-db-guard.js:16-17`), nên `shadowDatabaseUrl` thêm sau này cũng bị kiểm |
| Host cục bộ, cùng DB test | Đạt | Không bắt `DIRECT_URL === DATABASE_URL`, mà bắt cả hai đều là DB `*_test` ở localhost. Đủ an toàn, và còn chặt hơn đề xuất vì chặn được cả DB dev trên localhost |
| Test đỏ của QA chuyển xanh, không bị sửa | Đạt | TC-NFR08-01 xanh, file không đổi |
| Thông báo tiếng Việt, exit ≠0 | Đạt | "Từ chối reset: …", `process.exit(1)` |

## Vấn đề
Không có. MINOR chung về câu báo khi DB tắt (`reset-test-db.js:27`) ghi ở `T201-reviewer-v2.md` #2.
