# Review TASK-UI-REDESIGN – kien-truc-su – v1

**Kết luận: APPROVED** (kèm điều kiện nhỏ, không chặn).

## Phạm vi
Duyệt hậu kiểm 2 thư viện thêm vào `apps/web` (CLAUDE.md, mục "Công nghệ"): `lucide-react` 1.70.0, `@fontsource-variable/inter` 5.3.0.

## Đánh giá
| Tiêu chí | Kết quả | Chứng cứ |
|---|---|---|
| Hợp stack (React + Vite + Tailwind, JS ESM, không TS) | Đạt | Cả hai là gói JS thuần; lucide dùng như component JSX, fontsource chỉ là CSS `@import "@fontsource-variable/inter"` (`index.css` dòng 2, `--font-sans` dòng 9). Không cần cấu hình Vite |
| Giấy phép | Đạt | `lucide-react`: ISC (`package.json`). `@fontsource-variable/inter`: OFL-1.1. Cả hai cho phép dùng thương mại và nhúng/tự host; OFL chỉ cấm bán riêng font |
| CSP `vercel.json` | Đạt | Font đóng gói thành file `.woff2` cùng origin trong `dist/assets` (có `inter-vietnamese-wght-normal-*.woff2`, latin, latin-ext...) nên khớp `font-src 'self'`. `style-src 'self'` đủ vì CSS ra file riêng. Lucide render SVG inline qua React (thuộc tính, không `<style>`, không ảnh ngoài) nên không đụng `img-src` |
| Bundle | Chấp nhận | `sideEffects:false` + import theo tên → tree-shake; `dist/assets` có chunk icon nhỏ riêng (`clock-*.js`, `download-*.js`, `funnel-x-*.js`). Font tải theo `unicode-range`, trình duyệt chỉ lấy subset cần (latin + vietnamese). Review reviewer ghi bundle chính 550 kB là cảnh báo có sẵn của Vite, không do icon |
| Bảo trì | Thấp | Hai gói lớn, được duy trì tích cực, ghim phiên bản chính xác; thay icon/font là đổi vài import |
| Lựa chọn nhẹ hơn | Không rõ rệt | SVG tự viết: tốn công, khó nhất quán. Font hệ thống: không cần thư viện nhưng mất đồng nhất và hiển thị dấu tiếng Việt khác nhau giữa máy. Google Fonts CDN: vi phạm CSP |
| Không kéo thêm phụ thuộc | Đạt | Từ chối `shadcn init` (Radix/cva/tailwind-merge) là đúng, giữ `useDialogA11y` đã có test |

## Điều kiện (không chặn)
1. Luôn `import { Icon } from 'lucide-react'` theo tên; cấm `import * as` hoặc `icons` (mất tree-shake).
2. Icon trang trí có `aria-hidden`; nút chỉ có icon phải có `aria-label` tiếng Việt (NFR07).
3. Không thêm font/trọng số khác ngoài Inter; nếu cần giảm tải, chỉ import subset `latin` + `vietnamese`.
4. Gỡ `dist/` khỏi git nếu đang theo dõi (không kiểm được ở đây).

## Chưa kiểm
Không chạy `npm run build` (môi trường chỉ đọc/ghi file, không có shell); số kích thước dựa trên `dist/assets` hiện có và nhận xét reviewer v1. Hạn chế: chưa có số byte chính xác.

## Ghi chép tài liệu
Đã thêm giả định U9 vào `docs/agents/design/UI.md` mục 10.
