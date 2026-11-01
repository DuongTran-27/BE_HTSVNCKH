import { createBrowserRouter, Outlet } from 'react-router';
import { useAuth } from './lib/auth.js';
import { logout } from './lib/api.js';

// Placeholder đến khi T302 (R1, R2), T303 (layout, guard, 403/404) thay thế
function Placeholder({ title }) {
  const { user } = useAuth();
  return (
    <main className="mx-auto max-w-3xl p-4">
      <h1 className="text-xl font-bold">{title}</h1>
      <p className="mt-2 text-slate-700">Màn hình đang được xây dựng.</p>
      {user && (
        <button type="button" onClick={logout} className="mt-4 min-h-11 rounded-md border border-slate-300 px-4">
          Đăng xuất
        </button>
      )}
    </main>
  );
}

// Data router bắt buộc (useBlocker ở R7, R21 – UI §1.1)
export const router = createBrowserRouter([
  {
    element: <Outlet />,
    children: [
      { path: '/', element: <Placeholder title="Trang chủ" /> },
      { path: '/dang-nhap', element: <Placeholder title="Đăng nhập" /> },
      { path: '/doi-mat-khau', element: <Placeholder title="Đổi mật khẩu" /> },
      { path: '*', element: <Placeholder title="Không tìm thấy trang" /> },
    ],
  },
]);
