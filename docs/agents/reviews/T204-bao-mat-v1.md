# Review T204 – bao-mat – vòng 1
Kết luận: APPROVED

## Tôi đã tự kiểm tra
- Đọc: `CLAUDE.md`, `QUY_TRINH.md` (chế độ tiết kiệm quota), `reports/T204.md`, FR15 + mục 5 `DAC_TA.md`, `reviews/T203-kiem-thu-v1.md` MINOR 1, `reviews/T203-bao-mat-v2.md` MINOR 1–2; migration `20261102000000_block_truncate`, `forbid_mutation()` trong `20261101000100_search_and_security`, `src/modules/audit/service.js`, diff `stateMachine.js`, `tests/db.js`, `prisma/seed.js`, `tests/T203-schema.test.js`, README, `tests/T204-audit.test.js`, `vitest.config.js`, `.github/workflows/ci.yml`, các trường bí mật trong `schema.prisma`.
- `npm run db:test:up` → "Kiểm tra DB test: tất cả OK."; `npm run db:test:reset` → "Đã reset DB test (migrate reset)."
- `NO_COLOR=1 npm test -w @nckh/api` lần 1: `Test Files 20 passed (20)`, `Tests 178 passed | 1 expected fail (179)`.
- Chạy lại ngay lần 2 (không reset): `Test Files 20 passed (20)`, `Tests 178 passed | 1 expected fail (179)`. Không tái hiện được 3 test seed đỏ mà báo cáo nhắc. `fileParallelism: false` nên không phải do chạy song song file; test seed tự `DROP DATABASE ... WITH (FORCE)` trước và sau nên DB phụ còn sót cũng không gây ra. Nguyên nhân có lẽ là lần chạy đó xảy ra trước khi áp migration mới, nhưng chưa chứng minh được.
- `npm run lint` → `eslint .` không lỗi.

## Đối chiếu đặc tả
| Điều kiện đạt | Đạt? | Ghi chú |
|---|---|---|
| FR15: ghi ai, khi nào, thao tác, đối tượng, trước/sau | Đạt | `recordAudit` nhận `tx` nên ghi cùng transaction, có test rollback |
| FR15: chỉ thêm (UPDATE/DELETE/TRUNCATE, cả `TRUNCATE "Topic" CASCADE`) | Đạt | Trigger câu lệnh dùng lại `forbid_mutation()` (hàm này chỉ RAISE, không dùng NEW/OLD nên chạy được ở mức câu lệnh) |
| Mọi chuyển trạng thái ghi StatusHistory, qua một helper | Đạt | `applyTransition` → `recordStatus(tx, …)` |
| `resetData` vẫn chạy | Đạt | `SET LOCAL` nằm trong batch `$transaction`, cùng một kết nối. CI: service `postgres:16` với `POSTGRES_USER=postgres` là superuser nên ổn; embedded cũng vậy |
| Cờ seed ở mức DB, không ghi đè được bằng `options` | Đạt | `setrole = 0` loại `ALTER ROLE … IN DATABASE`; test kiểm trước rằng `options` có hiệu lực ở phiên, nên đây không phải test rỗng |
| RLS bao cả view/matview | Đạt | Không có matview; view phải `security_invoker=true` |
| Migration chạy được trên Supabase (`migrate deploy`) | Đạt (theo lý thuyết) | Chỉ `CREATE TRIGGER` trên bảng do role `postgres` sở hữu, không cần superuser. Không tạo bảng nên không cần RLS. Chưa chạy trên Supabase thật |

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| 1 | MINOR | `apps/api/src/modules/audit/service.js:5` | `redact` chỉ lọc khóa theo tên `password\|token\|secret\|hash$`. Lọc theo tên đủ cho schema hiện tại (`passwordHash`, `tokenHash`, `contentHash` đều bị bắt; lọc thừa `*token*` cũng chấp nhận được vì lỗi theo hướng an toàn). Còn sót các tên phổ biến như `apiKey`, `privateKey`, `authorization`, `cookie`, `credential`, `otp`, `salt`. Ngoài ra, giá trị là `Decimal`/`Buffer` sẽ bị biến thành object rỗng hoặc mảng byte, còn `BigInt` thì làm `create` ném lỗi. | Thêm `key$\|authorization\|cookie\|credential\|otp\|salt` vào regex và giữ nguyên giá trị không phải plain object (ví dụ kiểm `Object.getPrototypeOf(v) === Object.prototype`). Chỗ gọi vẫn nên tự chọn trường "quan trọng" theo FR15 thay vì đẩy cả bản ghi. |
| 2 | MINOR | `apps/api/src/modules/audit/service.js:38-50` | `listAudit` chưa kiểm đầu vào: `beforeId` không phải số làm `BigInt()` ném `SyntaxError` (thành 500), `limit` là NaN thì `take: NaN`. Kết quả trả về có `ip` (dữ liệu cá nhân). Hiện chưa có route nên chưa khai thác được. | Khi làm route: dùng Zod cho query (`beforeId` khớp `^\d+$`, `limit` là số nguyên 1–200), chỉ cho đúng vai trò được xem (admin không có quyền nghiệp vụ), cân nhắc ẩn `ip`. Ghi vào task làm route. |
| 3 | MINOR (ghi nhận) | `apps/api/prisma/migrations/20261102000000_block_truncate/migration.sql` | Trigger chỉ là lớp phòng thủ thêm: role sở hữu bảng (`postgres` trên Supabase, cũng là role của app) vẫn có thể `DROP TRIGGER`/`DISABLE TRIGGER`. Theo tài liệu Supabase, role này cũng được phép đặt `session_replication_role`. Mức DB không thể chặn hơn khi app dùng role sở hữu bảng. | Không sửa ở T204. Nếu sau này cần chặn chặt hơn: tách role chạy app (không sở hữu bảng) khỏi role chạy migrate, đưa vào đề xuất cho `kien-truc-su`. |

Không viết test tấn công nào: không tìm thấy lỗ hổng khai thác được trong phạm vi task.

BLOCKER: 0 · MAJOR: 0 · MINOR: 3

Kết luận: APPROVED
