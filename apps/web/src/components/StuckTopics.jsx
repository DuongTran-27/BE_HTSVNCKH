import { Link } from 'react-router';
import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { TOPIC_STATUS_LABEL } from '@nckh/shared';
import { api } from '../lib/api.js';
import { fmtDateTime, qs } from '../lib/format.js';
import { Badge, Pager, QueryBox } from './ui.jsx';

// FR16.5 (BUG-012): server lọc stuck=true và phân trang; widget hiển thị total + Pager
export function StuckTopics({ roundId }) {
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['topics', 'stuck', roundId, page],
    queryFn: () => api(`/topics${qs({ stuck: 'true', roundId, page, pageSize: 10 })}`),
    placeholderData: keepPreviousData,
  });
  return (
    <section aria-labelledby="stuck-h" className="mt-6 rounded-md border border-amber-300 bg-amber-50 p-3">
      <h2 id="stuck-h" className="font-semibold">Đề tài kẹt sau khi đóng đăng ký</h2>
      <p className="text-sm text-slate-700">Đề tài chờ hoặc đã có GVHD nhưng chưa gửi xét duyệt, trong khi đợt đã đóng đăng ký.</p>
      <div className="mt-2">
        <QueryBox query={query} empty="Không có đề tài nào bị kẹt." isEmpty={(d) => d.items.length === 0}>
          {(d) => (
            <>
            <p className="mb-2 text-sm font-medium">Tổng cộng {d.total} đề tài kẹt</p>
            <ul className="space-y-2">
              {d.items.map((t) => (
                <li key={t.id} className="rounded-md border border-slate-300 bg-white p-2 text-sm">
                  <Link to={`/de-tai/${t.id}`} className="break-words font-medium text-blue-700 underline decoration-blue-700/30 underline-offset-4 hover:decoration-blue-700">{t.code} – {t.title}</Link>
                  <p className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge tone="amber">{TOPIC_STATUS_LABEL[t.status]}</Badge>
                    <span>{t.round?.name}{t.round?.regCloseAt ? ` · đóng đăng ký ${fmtDateTime(t.round.regCloseAt)}` : ''}</span>
                  </p>
                </li>
              ))}
            </ul>
            <Pager page={d.page} pageSize={d.pageSize} total={d.total} onPage={setPage} />
            </>
          )}
        </QueryBox>
      </div>
    </section>
  );
}
