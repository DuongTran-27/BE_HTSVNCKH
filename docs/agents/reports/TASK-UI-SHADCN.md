# TASK-UI-SHADCN – Giao diện dựa trên shadcn/ui

Yêu cầu người dùng (2026-11-11): làm giao diện đẹp hơn bằng thư viện frontend được đánh giá cao trên GitHub thay vì tự viết CSS.
Chọn shadcn/ui (shadcn-ui/ui, MIT, Radix UI + Tailwind). Duyệt: `docs/agents/reviews/TASK-UI-SHADCN-kien-truc-su-v1.md` (APPROVED có điều kiện), UI.md U9 đã cập nhật.

## Làm gì
- Alias `@/` → `src` (`vite.config.js`, áp cho cả vitest và e2e vì cùng config; `jsconfig.json`). `components.json` viết tay (style new-york, tsx false), không chạy `shadcn init` nên `index.css` không bị ghi đè; token màu shadcn được thêm tay, ánh xạ vào màu Văn Lang (`--primary` = đỏ #D72134 như nút chính cũ, chữ/vòng focus navy, viền slate-300).
- Component chép về (chỉ những cái dùng): `button`, `badge`, `dialog`, `alert`, `avatar`, `label`, `separator` trong `src/components/ui/`. Đã xóa card/input/textarea/table/native-select CLI chép thừa. CLI ghi `import { cn } from "cn"` (gói npm không liên quan) → sửa thành `@/lib/utils` và gỡ gói `cn`. Việt hóa "Close" → "Đóng".
- Primitive dùng chung đổi phần bên trong, các trang tự đổi theo: `btnPrimary/btnGhost/btnDanger` dựng từ `buttonVariants` (giữ min-h-11, co 3% khi nhấn); `Badge` → Badge shadcn; `QueryBox` lỗi → Alert; `ConfirmDialog` → Dialog Radix (role="dialog", Esc, khóa focus); `FormField` → Label Radix + class Input shadcn (vẫn `<input>/<select>` gốc để giữ `register()`); `Layout` → Avatar, Separator, nút đầu trang `buttonVariants` ghost; avatar ở chi tiết tài khoản → Avatar.
- `ReasonDialog`, form yêu cầu thay đổi giữ `useDialogA11y` (test của nó gửi Tab ở `document`, focus trap Radix không bắt được) và chỉ đổi khung sang class Dialog của shadcn (`dialogOverlay`, `dialogPanel`).
- Giữ: font Be Vietnam Pro, phẳng (thêm `--shadow-xs: 0`), bo góc nhỏ, `prefers-reduced-motion`, `:focus-visible`, `TempPasswordBox` role="alertdialog". Không đổi logic/API.

## Phụ thuộc (ghim chính xác)
`radix-ui` 1.8.1, `class-variance-authority` 0.7.1, `clsx` 2.1.1, `tailwind-merge` 3.7.0; dev: `tw-animate-css` 1.4.0.

## Kích thước bundle (gzip, tổng JS+CSS của `dist/assets`)
Trước 350 623 B → sau 376 352 B: **+25,7 KB** (ngưỡng 60 KB).

## Bằng chứng
```
npm run lint                  → không lỗi
npm test                      → 73 + 962 + 234 passed, 0 failed
npm run build -w @nckh/web    → built
npm run test:e2e -w @nckh/web → 54 passed, 4 failed
```
4 test E2E lỗi: `e2e/m5.spec.js` TC-FR14-E03, TC-FR14-E04 (desktop + mobile) – `locator('table tfoot td')` khớp 2 ô vì cột "Tỉ lệ" (100%) ở dòng tổng
được thêm từ commit ab78b9b (TASK-UI-REDESIGN), không do task này (StatsPage không bị sửa); E2E chưa chạy lại từ đó. Sản phẩm đúng đặc tả
(tổng vẫn khớp từng dòng và CSV); test dùng selector quá rộng. Theo quy tắc 1 không tự sửa test – **đề nghị reviewer quyết** đổi selector thành
`table tfoot td:first-of-type` (hoặc ô đầu tiên của dòng tổng).

Đã xem bằng ảnh chụp Playwright: đăng nhập, thống kê, danh sách và chi tiết tài khoản, hộp xác nhận.
