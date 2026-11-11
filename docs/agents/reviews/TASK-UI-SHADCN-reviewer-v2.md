# Review TASK-UI-SHADCN – reviewer v2 (vòng 5 và sửa test chập chờn)

Kết luận: **APPROVED**. Không có BLOCKER/MAJOR/MINOR mới.

Tự chạy (một tiến trình): `npm run lint` sạch; `npm test` 73 + 972 + 236 passed, 0 failed. E2E không chạy lại (báo cáo 74/74).

## 1e686a3 (giao diện)
- Đọc diff ExecShell, GroupPage, MilestonesPage, SimilarityPanel và các dòng đổi lớp còn lại: phần lớn là đổi class (`border-slate-200/80 bg-white` thành `border bg-card`, h1 thành kiểu PageHeader). Không đổi nhãn ô, tên nút, `data-testid`.
- ExecShell: mã và nhãn trạng thái tách phần tử nhưng có `<span className="sr-only"> · </span>` nên trình đọc màn hình vẫn nghe "mã · trạng thái". h1 vẫn là tiêu đề tab, tên đề tài thêm ở đoạn phụ (không trùng chữ).
- GroupPage: chuỗi "mã – họ tên" còn trong một phần tử; avatar `aria-hidden`; vai trò là chữ trong Badge (không chỉ dựa vào màu). Link quay lại giữ `min-h-11`.
- MilestonesPage: "1. Tên mốc" và "Hạn: …" vẫn nguyên chuỗi liền.
- SimilarityPanel: `{m.code}{m.title && ...}` an toàn khi thiếu title. Chữ muted trên nền thẻ trắng đạt tương phản AA (đã tính ở v1). Không thấy phần tử nào mới có thể tràn ngang 360 px (`min-w-0`, `break-words`, `flex-wrap`).

## 30bdb22 (test chập chờn)
- `tests/setup.js` chỉ gọi `configure({ asyncUtilTimeout: 3000 })`; `vite.config.js` thêm `setupFiles`. Đây là cấu hình Vitest/jsdom, E2E chạy bằng Playwright và `exclude: e2e/**`, nên không bị ảnh hưởng. Chỉ nới thời gian chờ, không nới điều kiện.
- `change-requests.test.jsx`: `getByRole` thành `await findByRole` cho cùng hai nút, cùng tên; các `queryBy…toBeNull` giữ nguyên. Không yếu hơn.
- `guards.test.jsx`: `getAllByRole('Đăng xuất')` đổi thành `findAllByRole` và đặt trước `queryByRole('navigation')…toBeNull()`. Cùng assertion, thứ tự mới còn chặt hơn (khẳng định menu vắng khi layout đã dựng, tránh đạt giả khi chưa render).
- Không có `.skip/.only`, không xóa test.

## Chưa kiểm
Không chạy E2E; không chụp màn hình lại 22 trang.
