# Review T216 – bao-mat – vòng 1
Kết luận: APPROVED

## Tôi đã tự kiểm tra
File đã đọc: `docs/agents/reports/T216.md`, `docs/agents/QUY_TRINH.md` (mẫu), `git diff` của `apps/api/package.json`, `packages/shared/package.json`, `package.json`, và `package-lock.json` (so với HEAD bằng script, không xem tay). Không đọc file `.env*`.

- `npm audit` cho kết quả **1 high severity vulnerability**, chỉ còn `zod <4.6.6` (GHSA-mrhx-c7xc-m3w5), thuộc T215. Không còn advisory critical/high/moderate nào của vitest, @vitest/mocker, vite, vite-node, tinypool, esbuild.
- `npm ls vitest vite esbuild tinypool @vitest/mocker vite-node` cho vitest@4.1.12 (api, shared deduped), @vitest/mocker@4.1.12, vite@8.3.5. Không còn esbuild, tinypool, vite-node.
- So sánh lockfile HEAD với bản làm việc (theo khóa `packages`):
  - **Thêm 39 gói**, đều là phụ thuộc đã biết của vite 8 / vitest 4: `rolldown` + 15 `@rolldown/binding-*` (optional, theo nền tảng), `@rolldown/pluginutils`, `@oxc-project/types`, `lightningcss` + 11 binding (optional), `detect-libc`, `tinyglobby`, `fdir`, `picomatch@4`, `obug`, `convert-source-map`, `@standard-schema/spec`, `@types/chai`, `@types/deep-eql`. Không thấy tên giống typosquat.
  - **Đổi phiên bản 15 gói**: họ `@vitest/*`, `chai` 6, `vite` 8, `vitest` 4, `std-env`, `tinyexec`, `tinyrainbow`, `pathe`, `es-module-lexer`.
  - **Bỏ 60 gói**: esbuild và `@esbuild/*`, rollup và `@rollup/*`, tinypool, vite-node, tinyspy, loupe, cac... Có thêm `@napi-rs/lzma-linux-x64-gnu` là gói mồ côi bị dọn. Bỏ gói này không có rủi ro.
  - Mọi gói `resolved` đều trỏ về `https://registry.npmjs.org/` (ngoại trừ 2 link workspace nội bộ). Mọi gói đều có `integrity`.
  - Gói có `hasInstallScript` giữ nguyên như trước: `@prisma/client`, `@prisma/engines`, `prisma`, `argon2`, `fsevents`. **Không có install/postinstall script mới.**
- Diff `package.json`: phần của T216 chỉ là `vitest ^2.1.9` thành `^4.1.12` ở api và shared. Các script `db:test:*` và việc định dạng lại JSON thuộc T201 (đã đối chiếu với `reports/T201.md`). Không có script lifecycle mới.
- `npm test`: shared `5 passed (5)`; api `Test Files 6 passed (6)`, `Tests 40 passed | 7 expected fail (47)`, exit 0. Khớp với báo cáo.
- `npx vitest run tests/security --reporter=verbose` (trong apps/api): `1 passed | 7 expected fail (8)`. Bảy `it.fails` của T199 vẫn chạy và vẫn đang "fail như mong đợi".
- Đã tự kiểm ngữ nghĩa `it.fails` trên vitest 4 bằng test tạm `apps/api/tests/zz-tmp-t216-review.test.js` (đã xóa ngay sau khi chạy). Một `it.fails` có assertion đúng cho `× ... Error: Expect test to fail`, và một `it.fails` có assertion sai được tính là `expected fail`. Như vậy khi T199 được sửa, các test này sẽ đổi sang đỏ đúng như thiết kế.

## Đối chiếu đặc tả
| Điều kiện đạt | Đạt? | Ghi chú |
|---|---|---|
| vitest/vite/esbuild/tinypool hết lỗ hổng critical/high (NFR09) | Đạt | Moderate cũng hết. Chỉ còn zod (T215, ngoài phạm vi theo thỏa thuận) |
| 44 test vẫn đạt | Đạt | Hiện có 52: 5 + 40 + 7 expected fail |
| `npm audit` sạch (trừ zod) | Đạt | Tự chạy cho cùng kết quả |
| Không kéo gói lạ/đáng ngờ, không install script mới | Đạt | Xem phần so sánh lockfile ở trên |
| Test bảo mật `tests/security` còn hiệu lực | Đạt | 7 `it.fails` vẫn chạy; ngữ nghĩa đã kiểm độc lập |

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| 1 | MINOR | apps/api/package.json, packages/shared/package.json | `^4.1.12` hỗ trợ Node 20 theo engines, nhưng mới chỉ chạy thử trên Node 24.12.0. Môi trường Render/CI có thể dùng Node 20. | Để T202 (CI) chạy ma trận có Node 20, hoặc ghi `engines` ở root. Không chặn T216. |
| 2 | INFO | package-lock.json | vite 8 kéo theo binary native (rolldown, lightningcss) qua optional deps. Nếu `npm ci` chạy với `--no-optional` hoặc lockfile được sinh trên một nền tảng duy nhất thì có thể thiếu binding. | Theo dõi khi dựng CI/`apps/web`. Không phải lỗ hổng. |
| 3 | INFO | – | zod <4.6.6 (high, DoS bộ nhớ) vẫn còn. Mức độ khai thác phụ thuộc vào giới hạn body 100kb của T199. | Xử lý trong T215. |

Kết luận: APPROVED – chuỗi vitest đã hết advisory, lockfile chỉ thêm phụ thuộc hợp lệ từ registry npm, không có install script mới, test bảo mật vẫn còn hiệu lực.
