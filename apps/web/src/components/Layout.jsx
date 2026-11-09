import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router';
import {
  Archive, BarChart3, CalendarRange, ClipboardCheck, FileStack, FlaskConical, GitPullRequestArrow, History,
  KeyRound, LibraryBig, LogOut, Mail, Tags, UserCheck, Users,
} from 'lucide-react';
import { logout } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import { ROLE_LABEL } from '@nckh/shared';
import { NotificationBell } from './NotificationBell.jsx';
import { MENU } from '../lib/nav.js';
import { initials } from './ui.jsx';

// Biểu tượng theo đường dẫn menu (nav.js giữ nhãn và quyền, ở đây chỉ trang trí)
const ICON = {
  '/de-tai': FileStack, '/loi-moi': Mail, '/yeu-cau': GitPullRequestArrow, '/lich-su-tham-gia': History, '/kho': Archive,
  '/de-nghi-huong-dan': UserCheck, '/thong-ke': BarChart3, '/xet-duyet': ClipboardCheck, '/quan-ly/dot': CalendarRange,
  '/quan-ly/tai-khoan': Users, '/quan-ly/danh-muc/nganh': Tags, '/quan-ly/danh-muc/khoa': Tags,
};

const linkClass = ({ isActive }) => 'group inline-flex min-h-11 shrink-0 items-center gap-2.5 rounded-lg px-3 text-sm font-medium transition-all '
  + (isActive
    ? 'bg-white text-blue-800 shadow-sm ring-1 ring-slate-200/80 [&>svg]:text-blue-600'
    : 'text-slate-600 hover:bg-white/70 hover:text-slate-900 [&>svg]:text-slate-400 hover:[&>svg]:text-slate-600');


// Khung các trang sau đăng nhập. Mật khẩu tạm: chỉ còn "Đăng xuất" (UI §1.2).
export function Layout() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  if (!user) return null; // đang đăng xuất, router sắp chuyển về /dang-nhap
  if (user.mustChangePassword && pathname !== '/doi-mat-khau') return <Navigate to="/doi-mat-khau" replace />;
  const menu = user.mustChangePassword ? [] : (MENU[user.role] ?? []);
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[15rem_1fr]">
      <aside className="border-b border-slate-200/80 bg-slate-100/60 backdrop-blur-xl lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto lg:border-r lg:border-b-0">
        <Link to="/" className="flex min-h-11 items-center gap-2.5 px-4 py-2 font-semibold text-slate-900 lg:py-6">
          <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 text-white shadow-md shadow-blue-700/30"><FlaskConical aria-hidden="true" className="size-4" /></span>
          <span className="leading-tight">NCKH<span className="block text-xs font-normal text-slate-500">Khoa CNTT</span></span>
        </Link>
        {menu.length > 0 && (
          <nav aria-label="Menu chính" className="flex gap-1 overflow-x-auto px-2 pb-2 lg:flex-col lg:overflow-visible lg:px-3">
            {menu.map((m) => {
              const Icon = ICON[m.to] ?? LibraryBig;
              return <NavLink key={m.to} to={m.to} className={linkClass}><Icon aria-hidden="true" className="size-4" />{m.label}</NavLink>;
            })}
          </nav>
        )}
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/70 backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-end gap-1 px-4 py-2 lg:px-8">
            <div className="mr-auto flex min-w-0 items-center gap-2.5">
              <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-blue-500 to-violet-600 text-xs font-semibold text-white ring-2 ring-white shadow-sm">{initials(user.fullName)}</span>
              <span className="min-w-0 text-sm leading-tight"><span className="block font-medium break-words">{user.fullName}</span><span className="text-xs text-slate-500">{ROLE_LABEL[user.role] ?? user.role}</span></span>
            </div>
            {!user.mustChangePassword && <NotificationBell />}
            {!user.mustChangePassword && <NavLink to="/doi-mat-khau" className={linkClass}><KeyRound aria-hidden="true" className="size-4" /><span className="sr-only sm:not-sr-only">Đổi mật khẩu</span></NavLink>}
            <button type="button" onClick={logout} className={linkClass({ isActive: false })}><LogOut aria-hidden="true" className="size-4" /><span className="sr-only sm:not-sr-only">Đăng xuất</span></button>
          </div>
        </header>
        {/* key theo mục menu: hiệu ứng chạy khi đổi mục, không dựng lại trang khi đổi route con (giữ state tab/form) */}
        <div key={pathname.split('/')[1]} className="mx-auto max-w-6xl animate-fade-up p-4 lg:p-8"><Outlet /></div>
      </div>
    </div>
  );
}
