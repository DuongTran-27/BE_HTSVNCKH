# Review TASK-UI-SHADCN – kien-truc-su – v1

Kết luận: **APPROVED (có điều kiện)**. Ngày 2026-11-11.

## Đánh giá
- Giấy phép: shadcn/ui, Radix, cva, clsx, tailwind-merge, tw-animate-css đều MIT. Đạt.
- Không phải runtime package: mã chép vào repo, sửa được, không phụ thuộc CDN. Radix chạy cục bộ, không tải gì lúc chạy; font vẫn tự host (fontsource). CSP không bị ảnh hưởng (không inline script; style do Radix đặt qua thuộc tính style/CSSOM, chỉ cần `style-src` đang có – kiểm tra khi build).
- Bundle: `radix-ui` hợp nhất tree-shake được khi import theo tên (ESM); chỉ primitive được import mới vào bundle. Thêm vài chục KB gzip, chấp nhận được cho NFR hiệu năng nếu giữ điều kiện 3.
- a11y: Radix tốt hơn thủ công (focus trap, aria). Là cải thiện so với `useDialogA11y`.
- Công nghệ: không đổi Tailwind 4 / RHF / Zod / TanStack / Recharts / lucide. Phù hợp CLAUDE.md.
- Rủi ro: (a) bản `radix-ui` 1.x và React 19.3 – phải build và test thật; (b) đổi token/bo góc/bóng làm lệch giao diện đã duyệt (phẳng, bo ít); (c) test hiện có phụ thuộc role/nhãn; (d) CLI shadcn có thể ghi đè `index.css` và cài thêm dep ngoài danh sách.

## Điều kiện bắt buộc
1. Chỉ thêm đúng 5 dep đã đề xuất, ghim phiên bản chính xác (không `^`). CLI shadcn không được thêm dep nào khác, không ghi đè `index.css` mất khối `@theme`/animation/reduced-motion hiện có: merge tay, kiểm tra diff. Không dùng `npx` ghi vào `package.json` ngoài `apps/web`.
2. Giữ nhận diện: navy #1F2251, đỏ #D72134 (nút chính), vàng #FEBD25 (vạch menu), font Be Vietnam Pro, phong cách phẳng (không bóng thẻ, bo nhỏ). Token `--primary` = màu nút chính hiện tại (đỏ) hoặc navy theo đúng như UI hiện tại; không tự đổi bảng màu.
3. Chỉ chép component thực sự dùng (button, dialog, badge, ... ). Import `radix-ui` theo tên (`import { Dialog } from "radix-ui"`), không import cả gói. Báo kích thước bundle trước/sau (`npm run build -w @nckh/web`); tăng gzip quá ~60 KB phải giải trình.
4. Không xóa/sửa/skip test. `ConfirmDialog` giữ `role="dialog"` (Radix có sẵn), tên truy cập, Esc đóng, trả focus; `TempPasswordBox` giữ `role="alertdialog"`. `<select>` gốc giữ `register()`. Toàn bộ `npm test`, `npm run lint`, build và e2e Playwright phải xanh, kèm bằng chứng lệnh trong báo cáo.
5. Alias `@/` → `src` thêm ở `vite.config.js`, `jsconfig.json` và cấu hình vitest/eslint nếu có (resolve alias phải áp cho test).
6. Phạm vi: chỉ giao diện (`apps/web`); không đổi logic nghiệp vụ, hợp đồng API, `availableActions`, văn bản tiếng Việt. Mọi nhãn/aria tiếng Việt giữ nguyên; component shadcn có chuỗi tiếng Anh (vd. "Close" sr-only) phải Việt hóa.
7. Giữ `prefers-reduced-motion`, `:focus-visible` rõ, vùng chạm min-h-11 cho nút.
8. Ghi vào báo cáo task: danh sách component đã chép, phiên bản dep, kích thước bundle.
