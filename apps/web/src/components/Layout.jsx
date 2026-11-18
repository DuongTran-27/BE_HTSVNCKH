import { useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router';
import {
  Archive, BarChart3, CalendarRange, ClipboardCheck, FileStack, FlaskConical, GitPullRequestArrow, History,
  KeyRound, LibraryBig, LogOut, Mail, PanelLeftClose, PanelLeftOpen, Tags, UserCheck, Users,
} from 'lucide-react';
import { logout } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import { ROLE_LABEL } from '@nckh/shared';
import { NotificationBell } from './NotificationBell.jsx';
import { MENU } from '../lib/nav.js';
import { initials } from './ui.jsx';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';

// Biểu tượng theo đường dẫn menu (nav.js giữ nhãn và quyền, ở đây chỉ trang trí)
const ICON = {
  '/de-tai': FileStack, '/loi-moi': Mail, '/yeu-cau': GitPullRequestArrow, '/lich-su-tham-gia': History, '/kho': Archive,
  '/de-nghi-huong-dan': UserCheck, '/thong-ke': BarChart3, '/xet-duyet': ClipboardCheck, '/quan-ly/dot': CalendarRange,
  '/quan-ly/tai-khoan': Users, '/quan-ly/danh-muc/nganh': Tags, '/quan-ly/danh-muc/khoa': Tags,
};

const linkClass = ({ isActive }) => cn(buttonVariants({ variant: 'ghost' }), 'min-h-11 shrink-0 gap-2.5 px-3 text-muted-foreground hover:text-blue-900',
  isActive && 'bg-accent text-blue-900');
// Thanh bên navy Văn Lang (người dùng chọn 2026-11-18): mục đang mở nền trắng mờ + vạch vàng Văn Lang bên trái
const navClass = (collapsed) => ({ isActive }) => cn(
  'relative inline-flex min-h-11 shrink-0 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-vlu-gold',
  collapsed && 'lg:justify-center lg:px-0',
  isActive
    ? 'bg-white/12 text-white lg:before:absolute lg:before:inset-y-2 lg:before:left-0 lg:before:w-[3px] lg:before:rounded-full lg:before:bg-vlu-gold'
    : 'text-white/70 hover:bg-white/8 hover:text-white',
);
const COLLAPSE_KEY = 'nckh.sidebarCollapsed';
const readCollapsed = () => {
  try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; }
};

// Khung các trang sau đăng nhập. Mật khẩu tạm: chỉ còn "Đăng xuất" (UI §1.2).
export function Layout() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  if (!user) return null; // đang đăng xuất, router sắp chuyển về /dang-nhap
  if (user.mustChangePassword && pathname !== '/doi-mat-khau') return <Navigate to="/doi-mat-khau" replace />;
  const menu = user.mustChangePassword ? [] : (MENU[user.role] ?? []);
  const toggle = () => setCollapsed((c) => {
    try { localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1'); } catch { /* chỉ là tiện ích, bỏ qua nếu bị chặn */ }
    return !c;
  });
  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;
  return (
    <div className={cn('min-h-screen lg:grid', collapsed ? 'lg:grid-cols-[4.5rem_1fr]' : 'lg:grid-cols-[16rem_1fr]')}>
      <aside className="bg-blue-700 text-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        <Link to="/" className={cn('flex min-h-11 items-center gap-3 px-4 py-3 focus-visible:outline-vlu-gold lg:h-16', collapsed && 'lg:justify-center lg:px-0')}>
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-vlu-red text-white shadow-sm"><FlaskConical aria-hidden="true" className="size-5" /></span>
          <span className={cn('leading-tight', collapsed && 'lg:sr-only')}>
            <span className="block font-bold text-white">Nghiên cứu khoa học</span>
            <span className="block text-xs text-white/60">Khoa Công nghệ Thông tin</span>
          </span>
        </Link>
        <Separator className="hidden bg-white/10 lg:block" />
        {menu.length > 0 && (
          <nav aria-label="Menu chính" className="flex gap-1 overflow-x-auto px-2 pb-2 lg:flex-1 lg:flex-col lg:overflow-x-visible lg:overflow-y-auto lg:p-3">
            {!collapsed && <p aria-hidden="true" className="hidden px-3 pb-1 pt-2 text-xs font-semibold tracking-wide text-white/50 uppercase lg:block">Chức năng</p>}
            {menu.map((m) => {
              const Icon = ICON[m.to] ?? LibraryBig;
              return (
                <NavLink key={m.to} to={m.to} title={collapsed ? m.label : undefined} className={navClass(collapsed)}>
                  <Icon aria-hidden="true" className="size-[18px] shrink-0" />
                  <span className={cn(collapsed && 'lg:sr-only')}>{m.label}</span>
                </NavLink>
              );
            })}
          </nav>
        )}
        <div className="hidden border-t border-white/10 p-3 lg:block">
          <button type="button" onClick={toggle} aria-pressed={collapsed}
            className={cn(buttonVariants({ variant: 'ghost' }), 'min-h-11 w-full justify-start gap-3 px-3 text-white/70 hover:bg-white/8 hover:text-white focus-visible:outline-vlu-gold', collapsed && 'justify-center px-0')}>
            <ToggleIcon aria-hidden="true" className="size-[18px]" /><span className={cn(collapsed && 'sr-only')}>Thu gọn menu</span>
          </button>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/70">
          <div className="flex min-h-16 flex-wrap items-center justify-end gap-1 px-4 py-2 lg:px-8">
            <div className="mr-auto flex min-w-0 items-center gap-3">
              <Avatar aria-hidden="true" className="size-9"><AvatarFallback className="bg-blue-700 text-xs font-semibold text-white">{initials(user.fullName)}</AvatarFallback></Avatar>
              <span className="min-w-0 text-sm leading-tight"><span className="block font-semibold break-words">{user.fullName}</span><span className="text-xs text-muted-foreground">{ROLE_LABEL[user.role] ?? user.role}</span></span>
            </div>
            {!user.mustChangePassword && <NotificationBell />}
            {!user.mustChangePassword && <NavLink to="/doi-mat-khau" className={linkClass}><KeyRound aria-hidden="true" className="size-4" /><span className="sr-only sm:not-sr-only">Đổi mật khẩu</span></NavLink>}
            <button type="button" onClick={logout} className={linkClass({ isActive: false })}><LogOut aria-hidden="true" className="size-4" /><span className="sr-only sm:not-sr-only">Đăng xuất</span></button>
          </div>
        </header>
        <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8"><Outlet /></div>
      </div>
    </div>
  );
}
