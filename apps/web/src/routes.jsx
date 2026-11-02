import { Navigate, redirect } from 'react-router';
import { bootstrapSession } from './lib/api.js';
import { auth, useAuth } from './lib/auth.js';
import { homePath } from './lib/nav.js';
import { Layout } from './components/Layout.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import { ChangePasswordPage } from './pages/ChangePasswordPage.jsx';
import { Placeholder } from './pages/Placeholder.jsx';
import { Forbidden, NotFound } from './pages/ErrorPages.jsx';

// Loader chạy ngay khi tạo router, trước khi phiên khởi động xong → phải chờ bootstrapSession trước khi đọc auth
// (review T301-reviewer-v3 i1). Guard chỉ để dẫn đường; backend kiểm quyền thật (FR25).
const authLoader = async ({ request }) => {
  await bootstrapSession();
  const { user } = auth.get();
  const url = new URL(request.url);
  if (!user) return redirect(`/dang-nhap?next=${encodeURIComponent(url.pathname + url.search)}`);
  if (user.mustChangePassword && url.pathname !== '/doi-mat-khau') return redirect('/doi-mat-khau');
  return null;
};

const guestLoader = async () => {
  await bootstrapSession();
  const { user } = auth.get();
  return user ? redirect(user.mustChangePassword ? '/doi-mat-khau' : homePath(user.role)) : null;
};

function RequireRole({ roles, children }) {
  const { user } = useAuth();
  return user && roles.includes(user.role) ? children : <Forbidden />;
}

const S = 'STUDENT';
const L = 'LECTURER';
const F = 'STAFF';
const A = 'ADMIN';
// [đường dẫn, vai trò được vào, tiêu đề] – UI §3
const SCREENS = [
  ['de-tai', [S, L, F], 'Đề tài'],
  ['de-tai/moi', [S], 'Tạo đề tài'],
  ['de-tai/:id', [S, L, F], 'Chi tiết đề tài'],
  ['de-tai/:id/sua', [S], 'Soạn hồ sơ'],
  ['de-tai/:id/nhom', [S, L, F], 'Nhóm'],
  ['de-tai/:id/moi-gvhd', [S], 'Mời giảng viên hướng dẫn'],
  ['de-tai/:id/gui', [S], 'Gửi xét duyệt'],
  ['de-tai/:id/lich-su', [S, L, F], 'Lịch sử'],
  ['de-tai/:id/lan-gui/:seq', [S, L, F], 'Lần gửi'],
  ['de-tai/:id/so-sanh', [S, L, F], 'So sánh các lần gửi'],
  ['loi-moi', [S], 'Lời mời'],
  ['de-nghi-huong-dan', [L, F], 'Đề nghị hướng dẫn'],
  ['xet-duyet', [F], 'Xét duyệt'],
  ['xet-duyet/:id', [F], 'Màn xét duyệt'],
  ['quan-ly/tai-khoan', [A, F], 'Tài khoản'],
  ['quan-ly/tai-khoan/moi', [A, F], 'Tạo tài khoản'],
  ['quan-ly/tai-khoan/nhap-csv', [A, F], 'Nhập tài khoản từ CSV'],
  ['quan-ly/tai-khoan/:id', [A, F], 'Chi tiết tài khoản'],
  ['quan-ly/danh-muc/khoa', [A], 'Danh mục khoa'],
  ['quan-ly/danh-muc/nganh', [A, F], 'Danh mục ngành'],
  ['quan-ly/danh-muc/lop', [A, F], 'Danh mục lớp'],
  ['quan-ly/danh-muc/linh-vuc', [A, F], 'Danh mục lĩnh vực'],
  ['quan-ly/danh-muc/dong-nghia', [F], 'Từ đồng nghĩa'],
  ['quan-ly/dot', [F], 'Đợt'],
  ['quan-ly/dot/moi', [F], 'Tạo đợt'],
  ['quan-ly/dot/:id', [F], 'Chi tiết đợt'],
  ['kho', [S, L, F, A], 'Kho đề tài'],
  ['kho/:code', [S, L, F, A], 'Chi tiết kho đề tài'],
];

function HomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={homePath(user?.role)} replace />;
}

// Data router bắt buộc (useBlocker ở R7, R21 – UI §1.1)
export const routes = [
  { path: '/dang-nhap', loader: guestLoader, element: <LoginPage /> },
  {
    loader: authLoader,
    element: <Layout />,
    children: [
      { path: '/', element: <HomeRedirect /> },
      { path: '/doi-mat-khau', element: <ChangePasswordPage /> },
      { path: '/403', element: <Forbidden /> },
      ...SCREENS.map(([path, roles, title]) => ({
        path: `/${path}`,
        element: <RequireRole roles={roles}><Placeholder title={title} /></RequireRole>,
      })),
      { path: '*', element: <NotFound /> },
    ],
  },
];
