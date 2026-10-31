# Review T216 – reviewer – vòng 1
Kết luận: APPROVED

## Tôi đã tự kiểm tra
- Đã đọc: `CLAUDE.md`, `docs/agents/QUY_TRINH.md`, `docs/agents/reports/T216.md`, dòng T216/T202/T215/T301 trong `BANG_CONG_VIEC.md`, `git diff` của `apps/api/package.json`, `packages/shared/package.json`, `package.json`, `package-lock.json`.
- `npm ci`: cài được từ lockfile, không lỗi.
- `npm test` (Node v24.12.0):
  ```
  RUN  v4.1.12 .../packages/shared
  Test Files  1 passed (1)
       Tests  5 passed (5)
  RUN  v4.1.12 .../apps/api
  Test Files  6 passed (6)
       Tests  40 passed | 7 expected fail (47)
  ```
  Tổng 52 = 5 + 47, giống báo cáo. Số test không giảm. `npx vitest list` ở apps/api ra 47 dòng.
- `npm audit`: chỉ còn `zod <4.6.6` (high, GHSA-mrhx-c7xc-m3w5), thuộc T215. Không còn advisory nào của vitest, @vitest/mocker, vite, vite-node, esbuild hay tinypool.
- `npm ls vitest vite esbuild tinypool vite-node`: vitest 4.1.12 (api, shared deduped), @vitest/mocker 4.1.12, vite 8.3.5. Không còn esbuild, tinypool, vite-node trong cây.
- Kiểm `it.fails` độc lập: tạo 3 test ở thư mục scratchpad, ngoài repo, chạy bằng vitest 4.1.12 của repo. Hai test `it.fails` có assertion đúng (sync và async) đều bị báo `×` với `Error: Expect test to fail`, exit=1. Test có assertion sai được tính là `expected fail`. Như vậy `it.fails` vẫn có tác dụng, không bị biến thành "đạt" vô điều kiện. `npx vitest run tests/security` ra `1 passed | 7 expected fail (8)`.
- Grep `.skip|.only|.todo` trong `apps/api/tests` và `packages/shared`: không có. 7 `it.fails` (5 ở `T199-input-size.test.js`, 2 ở `T199-rate-limit.test.js`) còn nguyên. `git diff` không có thay đổi nào trên file test được theo dõi. `apps/api/vitest.config.js` (của T201) không bị sửa.
- Engines: vitest 4.1.12 yêu cầu `^20.0.0 || ^22.0.0 || >=24.0.0`, vite 8.3.5 yêu cầu `^20.19.0 || >=22.12.0`. Cả hai hợp với Node LTS (20.19+, 22, 24).
- Lockfile v3 có đủ binding native cho Linux (`@rolldown/binding-linux-x64-gnu/musl`, `lightningcss-linux-x64-*`), nên CI/Render trên Linux cài được.
- `npm run lint`: `'eslint' is not recognized`. Lỗi này có từ trước T216 (repo chưa cài eslint). ESLint do T202 thiết lập, mà T202 phụ thuộc T216. Báo cáo đã ghi rõ. Tôi không tính là lỗi của task này.

## Đối chiếu đặc tả
| Điều kiện đạt | Đạt? | Ghi chú |
|---|---|---|
| Nâng vitest (vite/esbuild/tinypool kéo theo) hết critical/high | Đạt | Tự chạy `npm audit`: chỉ còn zod |
| Test vẫn đạt (bảng ghi 44, hiện là 52) | Đạt | 5 + 40 passed + 7 expected fail = 52, exit 0 |
| `npm audit` sạch (trừ zod, theo ghi chú điều phối, T215 xử lý) | Đạt | 1 high là zod |
| Không skip/sửa/làm yếu test, `it.fails` còn tác dụng | Đạt | Đã kiểm độc lập bằng test ngoài repo |
| Phiên bản hợp lý với Node LTS (NFR09) | Đạt | Chọn 4.1.12, không chọn 5.x (5.x bỏ Node 20). Đây là bản nhỏ nhất vá cả vitest lẫn @vitest/mocker |

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| 1 | MINOR | docs/agents/reports/T216.md (mục "Quyết định thiết kế", ý 1) | Báo cáo ghi vitest 4 hỗ trợ Node `^20`, nhưng vite 8.3.5 mà nó kéo theo đòi `^20.19.0 \|\| >=22.12.0`. Node 20 bản cũ hơn 20.19 sẽ hỏng. Báo cáo cũng tự nhận chưa chạy thử trên Node 20. | Thêm `"engines": { "node": ">=20.19.0" }` vào `package.json` gốc (hoặc `.nvmrc`). Ma trận CI ở T202 nên chạy Node 20.19+ và 22. Có thể gộp việc này vào T202. |
| 2 | MINOR | packages/shared/package.json:6-17 | `npm install` định dạng lại file (gộp một dòng thành nhiều dòng). Nội dung không đổi, nhưng diff bị nhiễu. | Chấp nhận được. Chỉ ghi lại để reviewer sau không tưởng nhầm là thay đổi nội dung. |
| 3 | INFO | package.json:11 | `npm run lint` hỏng vì chưa cài eslint. Lỗi có từ trước, ngoài phạm vi task. | T202 phải làm cho `npm run lint` chạy xanh. |
| 4 | INFO | – | vite 8 dùng Rolldown/Oxc. Khi làm T301 cần chọn `@vitejs/plugin-react` tương thích. Bảng việc đã ghi chú việc này ở T301. | Không cần làm gì thêm. |

Không có BLOCKER hay MAJOR.
