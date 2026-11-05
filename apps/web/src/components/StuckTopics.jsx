import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { TOPIC_STATUS_LABEL } from '@nckh/shared';
import { api } from '../lib/api.js';
import { fmtDateTime, qs } from '../lib/format.js';
import { Badge, QueryBox } from './ui.jsx';

// FR16.5: đề tài chưa gửi xét duyệt mà đợt đã đóng đăng ký. Dùng GET /api/topics có sẵn (API_GD2 §5.4), chỉ cán bộ
// shortcut: tối đa 100 đề tài mỗi trạng thái (một trang), nâng thành phân trang khi một khoa có nhiều hơn
export function StuckTopics({ roundId }) {
  const query = useQuery({
    queryKey: ['topics', 'stuck', roundId],
    queryFn: async () => {
      const pages = await Promise.all(['WAITING_ADVISOR', 'HAS_ADVISOR'].map((status) => api(`/topics${qs({ status, roundId, pageSize: 100 })}`)));
      return pages.flatMap((p) => p.items).filter((t) => t.round?.registrationOpen === false);
    },
  });
  return (
    <section aria-labelledby="stuck-h" className="mt-6 rounded-md border border-amber-300 bg-amber-50 p-3">
      <h2 id="stuck-h" className="font-semibold">Đề tài kẹt sau khi đóng đăng ký</h2>
      <p className="text-sm text-slate-700">Đề tài chờ hoặc đã có GVHD nhưng chưa gửi xét duyệt, trong khi đợt đã đóng đăng ký.</p>
      <div className="mt-2">
        <QueryBox query={query} empty="Không có đề tài nào bị kẹt." isEmpty={(d) => d.length === 0}>
          {(d) => (
            <ul className="space-y-2">
              {d.map((t) => (
                <li key={t.id} className="rounded-md border border-slate-300 bg-white p-2 text-sm">
                  <Link to={`/de-tai/${t.id}`} className="break-words font-medium text-blue-800 underline">{t.code} – {t.title}</Link>
                  <p className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge tone="amber">{TOPIC_STATUS_LABEL[t.status]}</Badge>
                    <span>{t.round?.name}{t.round?.regCloseAt ? ` · đóng đăng ký ${fmtDateTime(t.round.regCloseAt)}` : ''}</span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </QueryBox>
      </div>
    </section>
  );
}
