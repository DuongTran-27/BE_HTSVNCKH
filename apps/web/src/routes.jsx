import { Suspense, lazy } from 'react';
import { Navigate, redirect } from 'react-router';
import { bootstrapSession } from './lib/api.js';
import { auth, useAuth } from './lib/auth.js';
import { homePath } from './lib/nav.js';
import { Layout } from './components/Layout.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import { ChangePasswordPage } from './pages/ChangePasswordPage.jsx';
import { Placeholder } from './pages/Placeholder.jsx';
import { Forbidden, NotFound } from './pages/ErrorPages.jsx';
const TopicDetailPage = lazy(() => import('./pages/topics/TopicDetailPage.jsx').then((m) => ({ default: m.TopicDetailPage })));
const AdvisorRequestsPage = lazy(() => import('./pages/topics/AdvisorRequestsPage.jsx').then((m) => ({ default: m.AdvisorRequestsPage })));
const TopicListPage = lazy(() => import('./pages/topics/TopicListPage.jsx').then((m) => ({ default: m.TopicListPage })));
const RepositoryPage = lazy(() => import('./pages/topics/RepositoryPage.jsx').then((m) => ({ default: m.RepositoryPage })));
const RepositoryDetailPage = lazy(() => import('./pages/topics/RepositoryPage.jsx').then((m) => ({ default: m.RepositoryDetailPage })));
const TopicCreatePage = lazy(() => import('./pages/topics/TopicCreatePage.jsx').then((m) => ({ default: m.TopicCreatePage })));
const TopicEditPage = lazy(() => import('./pages/topics/TopicEditPage.jsx').then((m) => ({ default: m.TopicEditPage })));
const GroupPage = lazy(() => import('./pages/topics/GroupPage.jsx').then((m) => ({ default: m.GroupPage })));
const AdvisorInvitePage = lazy(() => import('./pages/topics/AdvisorInvitePage.jsx').then((m) => ({ default: m.AdvisorInvitePage })));
const SubmitPage = lazy(() => import('./pages/topics/SubmitPage.jsx').then((m) => ({ default: m.SubmitPage })));
const InvitationsPage = lazy(() => import('./pages/topics/InvitationsPage.jsx').then((m) => ({ default: m.InvitationsPage })));
const SubmissionHistoryPage = lazy(() => import('./pages/topics/SubmissionHistoryPage.jsx').then((m) => ({ default: m.SubmissionHistoryPage })));
const SubmissionPage = lazy(() => import('./pages/topics/SubmissionPage.jsx').then((m) => ({ default: m.SubmissionPage })));
const SubmissionDiffPage = lazy(() => import('./pages/topics/SubmissionDiffPage.jsx').then((m) => ({ default: m.SubmissionDiffPage })));
const MilestonesPage = lazy(() => import('./pages/topics/MilestonesPage.jsx').then((m) => ({ default: m.MilestonesPage })));
const ProgressPage = lazy(() => import('./pages/topics/ProgressPage.jsx').then((m) => ({ default: m.ProgressPage })));
const DocumentsPage = lazy(() => import('./pages/topics/DocumentsPage.jsx').then((m) => ({ default: m.DocumentsPage })));
const ReviewQueuePage = lazy(() => import('./pages/review/ReviewQueuePage.jsx').then((m) => ({ default: m.ReviewQueuePage })));
const ReviewPage = lazy(() => import('./pages/review/ReviewPage.jsx').then((m) => ({ default: m.ReviewPage })));
const UsersPage = lazy(() => import('./pages/admin/UsersPage.jsx').then((m) => ({ default: m.UsersPage })));
const UserCreatePage = lazy(() => import('./pages/admin/UserCreatePage.jsx').then((m) => ({ default: m.UserCreatePage })));
const UserDetailPage = lazy(() => import('./pages/admin/UserDetailPage.jsx').then((m) => ({ default: m.UserDetailPage })));
const UserImportPage = lazy(() => import('./pages/admin/UserImportPage.jsx').then((m) => ({ default: m.UserImportPage })));
const CatalogPage = lazy(() => import('./pages/admin/CatalogPage.jsx').then((m) => ({ default: m.CatalogPage })));
const RoundsPage = lazy(() => import('./pages/admin/RoundsPage.jsx').then((m) => ({ default: m.RoundsPage })));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage.jsx').then((m) => ({ default: m.NotificationsPage })));
const StatsPage = lazy(() => import('./pages/stats/StatsPage.jsx').then((m) => ({ default: m.StatsPage })));
const RoundFormPage = lazy(() => import('./pages/admin/RoundFormPage.jsx').then((m) => ({ default: m.RoundFormPage })));

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
  ['de-tai/:id/moc', [S, L, F], 'Mốc thực hiện'],
  ['de-tai/:id/tien-do', [S, L, F], 'Tiến độ'],
  ['de-tai/:id/tai-lieu', [S, L, F], 'Tài liệu'],
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
  ['thong-bao', [S, L, F, A], 'Thông báo'],
  ['thong-ke', [L, F], 'Thống kê'],
  ['kho', [S, L, F, A], 'Kho đề tài'],
  ['kho/:code', [S, L, F, A], 'Chi tiết kho đề tài'],
];

// Màn đã làm (T304–T308); còn lại là trang tạm. key ép dựng lại khi đổi loại danh mục
const SCREEN_ELEMENT = {
  'de-tai': <TopicListPage />,
  'thong-bao': <NotificationsPage />,
  'thong-ke': <StatsPage />,
  kho: <RepositoryPage />,
  'kho/:code': <RepositoryDetailPage />,
  'de-tai/moi': <TopicCreatePage />,
  'de-tai/:id': <TopicDetailPage />,
  'de-tai/:id/sua': <TopicEditPage />,
  'de-tai/:id/nhom': <GroupPage />,
  'de-tai/:id/moi-gvhd': <AdvisorInvitePage />,
  'de-tai/:id/gui': <SubmitPage />,
  'de-tai/:id/lich-su': <SubmissionHistoryPage />,
  'de-tai/:id/lan-gui/:seq': <SubmissionPage />,
  'de-tai/:id/so-sanh': <SubmissionDiffPage />,
  'de-tai/:id/moc': <MilestonesPage />,
  'de-tai/:id/tien-do': <ProgressPage />,
  'de-tai/:id/tai-lieu': <DocumentsPage />,
  'xet-duyet': <ReviewQueuePage />,
  'xet-duyet/:id': <ReviewPage />,
  'loi-moi': <InvitationsPage />,
  'de-nghi-huong-dan': <AdvisorRequestsPage />,
  'quan-ly/tai-khoan': <UsersPage />,
  'quan-ly/tai-khoan/moi': <UserCreatePage />,
  'quan-ly/tai-khoan/nhap-csv': <UserImportPage />,
  'quan-ly/tai-khoan/:id': <UserDetailPage />,
  'quan-ly/danh-muc/khoa': <CatalogPage key="khoa" kind="khoa" />,
  'quan-ly/danh-muc/nganh': <CatalogPage key="nganh" kind="nganh" />,
  'quan-ly/danh-muc/lop': <CatalogPage key="lop" kind="lop" />,
  'quan-ly/danh-muc/linh-vuc': <CatalogPage key="linh-vuc" kind="linh-vuc" />,
  'quan-ly/danh-muc/dong-nghia': <CatalogPage key="dong-nghia" kind="dong-nghia" />,
  'quan-ly/dot': <RoundsPage />,
  'quan-ly/dot/moi': <RoundFormPage create />,
  'quan-ly/dot/:id': <RoundFormPage />,
};

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
        element: <RequireRole roles={roles}><Suspense fallback={<p role="status" className="p-4">Đang tải…</p>}>{SCREEN_ELEMENT[path] ?? <Placeholder title={title} />}</Suspense></RequireRole>,
      })),
      { path: '*', element: <NotFound /> },
    ],
  },
];
