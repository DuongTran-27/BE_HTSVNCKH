import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';

/** Chuông (FR13): poll 60 s, dừng khi tab ẩn (refetchIntervalInBackground mặc định false). Danh sách ở /thong-bao */
export function NotificationBell() {
  const q = useQuery({
    queryKey: ['notifications', 'count'], queryFn: async () => (await api('/notifications/unread-count')).count,
    refetchInterval: 60_000, retry: false,
  });
  const n = q.data ?? 0;
  return (
    <Link to="/thong-bao" aria-label={n > 0 ? `Thông báo, ${n} chưa đọc` : 'Thông báo'} className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-md hover:bg-blue-800">
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="2"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21h4" /></svg>
      {n > 0 && <span className="absolute right-0 top-1 rounded-full bg-red-600 px-1.5 text-xs font-bold leading-5 text-white">{n > 99 ? '99+' : n}</span>}
    </Link>
  );
}
