# TASK-CSP-CHECK – Kiểm CSP của vercel.json trên bản build production (cục bộ)

Yêu cầu của người dùng (2026-11-12): agent tự làm phần không cần con người. Mục 4 `BAO_CAO_HOAN_THANH.md` §5 / `VAN_HANH.md` §6.4 mục 8.

## Cách kiểm
- `npm run build -w @nckh/web`, phục vụ `dist` bằng `vite preview` với **đúng** các header trong `apps/web/vercel.json` (bỏ `upgrade-insecure-requests` vì chạy `http://localhost`), `/api` proxy tới API E2E (DB test embedded, dữ liệu `e2e/prepare.js`).
- Playwright (Chromium) đăng nhập 4 vai trò QT001, CBE2E, GVE2E, SVE2E4; đi qua mọi liên kết menu (gồm `/thong-ke` có biểu đồ Recharts), mở hộp thoại thật: ConfirmDialog "Khóa" (chi tiết tài khoản), "Đóng do quá hạn", "Đề nghị đóng đề tài", ChangeRequestForm "Thay giảng viên", "Thay đổi hồ sơ" – rồi Hủy. Ghi mọi console "Content Security Policy" và sự kiện `securitypolicyviolation`.
- Script dùng một lần, để ở scratchpad (không commit).

## Kết quả
1. **`script-src` – `eval`** ở mọi trang: do Zod 4 thử `new Function` (phép thử `allowsEval`, lỗi bị nuốt nhưng trình duyệt vẫn báo vi phạm). **Đã sửa:** `apps/web/src/lib/zodConfig.js` đặt `z.config({ jitless: true })`, import đầu tiên trong `main.jsx`; test `src/lib/zodConfig.test.js`. Chạy lại: hết vi phạm `eval`.
2. **`style-src-elem` – inline** khi mở **bất kỳ hộp thoại Radix nào**: `react-remove-scroll-bar` (Radix Dialog) chèn thẻ `<style>` khóa cuộn nền. **Chưa sửa – cần bao-mat/người dùng quyết:**
   - Ảnh hưởng: chỉ mất khóa cuộn trang nền khi hộp thoại mở. Hộp thoại vẫn mở/đóng, khóa focus, Esc, `pointer-events` (đặt qua CSSOM, không bị CSP chặn) bình thường.
   - Không dùng được hash: nội dung thẻ có `${gap}px` theo độ rộng thanh cuộn từng máy. Nonce cần CSP sinh theo request (trang tĩnh Vercel không có).
   - Phương án: (a) giữ CSP nghiêm, chấp nhận mất khóa cuộn (đề xuất); (b) thêm `'unsafe-inline'` cho riêng `style-src-elem` – cần bao-mat duyệt.
3. **Thuộc tính `style`** (thanh tiến độ, biểu đồ): **không** vi phạm – React gán qua CSSOM. Không cần `style-src-attr 'unsafe-inline'` như lo ngại trong MINOR 1 `reviews/FINAL-bao-mat.md` v2.
4. Không vi phạm nào khác (`img`, `font`, `connect`) trên các trang đã đi qua.

## Bằng chứng
```
CSP header: default-src 'self'; script-src 'self'; style-src 'self'; ... frame-ancestors 'none'
Lần 1: [QT001|CBE2E|GVE2E|SVE2E4] event :: script-src | eval
Lần 3 (sau jitless): chỉ còn "Applying inline style violates ... 'style-src 'self''" + event style-src-elem | inline,
  đúng ở các trang có mở hộp thoại: /quan-ly/tai-khoan/:id, /de-tai/:id, /de-tai/:id/yeu-cau
npm run lint                   → eslint . --max-warnings 0, không lỗi
npx vitest run (apps/web)      → Test Files 30 passed (30), Tests 240 passed (240)
```
Chưa kiểm: Safari/Firefox; trên Vercel thật vẫn phải làm §6.4 mục 8 (header do Vercel gắn).
