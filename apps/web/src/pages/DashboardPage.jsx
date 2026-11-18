import { useQueries } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Archive, ClipboardCheck, FileStack, GitPullRequestArrow, Mail, PencilLine, PlayCircle, UserCheck, Users } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import { PageHeader } from '../components/ui.jsx';
import { cn } from '@/lib/utils';

// Ô số liệu theo vai trò: [nhãn, API danh sách (lấy total, pageSize=1), trang đích, biểu tượng].
// Chỉ dùng API danh sách sẵn có nên phạm vi dữ liệu do backend lọc theo người gọi (FR25).
const PENDING_CR = ['Yêu cầu thay đổi đang chờ', '/change-requests?status=PENDING&pageSize=1', '/yeu-cau', GitPullRequestArrow];
const TILES = {
  STUDENT: [
    ['Đề tài của tôi', '/topics?pageSize=1', '/de-tai', FileStack],
    ['Cần chỉnh sửa', '/topics?status=NEEDS_REVISION&pageSize=1', '/de-tai?status=NEEDS_REVISION', PencilLine],
    ['Lời mời đang chờ', '/invitations?status=PENDING&pageSize=1', '/loi-moi', Mail],
    PENDING_CR,
  ],
  LECTURER: [
    ['Đề nghị chờ phản hồi', '/advisor-requests?status=PENDING&pageSize=1', '/de-nghi-huong-dan', UserCheck],
    ['Đề tài hướng dẫn', '/topics?pageSize=1', '/de-tai', FileStack],
    ['Đang thực hiện', '/topics?status=IN_PROGRESS&pageSize=1', '/de-tai?status=IN_PROGRESS', PlayCircle],
    PENDING_CR,
  ],
  STAFF: [
    ['Hồ sơ chờ xét duyệt', '/topics?status=UNDER_REVIEW&pageSize=1', '/xet-duyet', ClipboardCheck],
    ['Đề tài', '/topics?pageSize=1', '/de-tai', FileStack],
    ['Đang thực hiện', '/topics?status=IN_PROGRESS&pageSize=1', '/de-tai?status=IN_PROGRESS', PlayCircle],
    PENDING_CR,
  ],
  ADMIN: [
    ['Tài khoản', '/users?pageSize=1', '/quan-ly/tai-khoan', Users],
    ['Kho đề tài', '/repository?pageSize=1', '/kho', Archive],
  ],
};

// /tong-quan – trang tổng quan sau đăng nhập
export function DashboardPage() {
  const { user } = useAuth();
  const tiles = TILES[user?.role] ?? [];
  const results = useQueries({
    queries: tiles.map(([, url]) => ({ queryKey: ['dashboard', url], queryFn: async () => (await api(url)).total })),
  });
  return (
    <section>
      <PageHeader title={`Xin chào, ${user?.fullName ?? ''}`} description="Tóm tắt những việc đang chờ bạn." />
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map(([label, url, to, Icon], i) => {
          const q = results[i];
          return (
            <li key={url}>
              <Link to={to} className="group flex h-full items-center gap-4 rounded-2xl border bg-card p-5 shadow-sm transition-[box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:shadow-md">
                <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-accent text-blue-700"><Icon aria-hidden="true" className="size-6" /></span>
                <span className="min-w-0">
                  <span className="block text-sm text-muted-foreground">{label}</span>
                  {q.isPending ? <span role="status" className="mt-1 block h-8 w-12 animate-pulse rounded-md bg-muted"><span className="sr-only">Đang tải…</span></span>
                    : <span className={cn('block text-3xl font-bold tabular-nums', q.isError && 'text-base font-medium text-red-700')}>{q.isError ? 'Không tải được' : q.data}</span>}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
