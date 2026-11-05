import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router';
import { logout } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import { ROLE_LABEL } from '@nckh/shared';
import { NotificationBell } from './NotificationBell.jsx';
import { MENU } from '../lib/nav.js';

const linkClass = ({ isActive }) => `inline-flex min-h-11 items-center rounded-md px-3 text-sm ${isActive ? 'bg-blue-800 font-semibold' : 'hover:bg-blue-800'}`;

// Khung các trang sau đăng nhập. Mật khẩu tạm: chỉ còn "Đăng xuất" (UI §1.2).
export function Layout() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  if (!user) return null; // đang đăng xuất, router sắp chuyển về /dang-nhap
  if (user.mustChangePassword && pathname !== '/doi-mat-khau') return <Navigate to="/doi-mat-khau" replace />;
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-blue-900 text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2">
          <Link to="/" className="min-h-11 content-center font-bold">NCKH Khoa CNTT</Link>
          {!user.mustChangePassword && (
            <nav aria-label="Menu chính" className="flex flex-wrap gap-1">
              {MENU[user.role]?.map((m) => <NavLink key={m.to} to={m.to} className={linkClass}>{m.label}</NavLink>)}
            </nav>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-1 text-sm">
            {!user.mustChangePassword && <NotificationBell />}
            <span className="break-words">{user.fullName} ({ROLE_LABEL[user.role] ?? user.role})</span>
            {!user.mustChangePassword && <NavLink to="/doi-mat-khau" className={linkClass}>Đổi mật khẩu</NavLink>}
            <button type="button" onClick={logout} className="min-h-11 rounded-md px-3 hover:bg-blue-800">Đăng xuất</button>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-6xl p-4"><Outlet /></div>
    </div>
  );
}
