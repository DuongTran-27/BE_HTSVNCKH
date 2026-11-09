import { Link, useLocation, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { fmtDateTime, qs, searchTerm } from '../../lib/format.js';
import { useCatalog } from '../../lib/queries.js';
import { inputClass } from '../../components/FormField.jsx';
import { SimilarityLevelCell } from '../../components/SimilarityPanel.jsx';
import { Options, Pager, QueryBox, btnGhost } from '../../components/ui.jsx';

// R16 – API_GD2 §9.1. Thứ tự đúng như server trả (updatedAt_asc), không sắp phía client
export function ReviewQueuePage() {
  const [sp, setSp] = useSearchParams();
  const here = useLocation();
  const roundId = sp.get('roundId') ?? '';
  const fieldId = sp.get('fieldId') ?? '';
  const q = sp.get('q') ?? '';
  const page = Number(sp.get('page')) || 1;
  const set = (k, v) => setSp((old) => {
    const n = new URLSearchParams(old);
    if (v) n.set(k, v); else n.delete(k);
    if (k !== 'page') n.delete('page');
    return n;
  });
  const rounds = useQuery({ queryKey: ['rounds', 'all'], queryFn: async () => (await api('/rounds?pageSize=100')).items });
  const fields = useCatalog('fields');
  const query = useQuery({
    queryKey: ['topics', 'review-queue', roundId, fieldId, q, page],
    queryFn: () => api(`/topics${qs({ status: 'UNDER_REVIEW', sort: 'updatedAt_asc', roundId, fieldId, q: searchTerm(q), page, pageSize: 20 })}`),
  });
  const now = Date.now();
  return (
    <section>
      <h1 className="text-2xl font-semibold">Hàng chờ xét duyệt</h1>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <select aria-label="Đợt" className={inputClass} value={roundId} onChange={(e) => set('roundId', e.target.value)}>
          <Options placeholder="Mọi đợt" options={(rounds.data ?? []).map((r) => ({ value: r.id, label: `${r.name} (${r.academicYear})` }))} />
        </select>
        <select aria-label="Lĩnh vực" className={inputClass} value={fieldId} onChange={(e) => set('fieldId', e.target.value)}>
          <Options placeholder="Mọi lĩnh vực" options={(fields.data ?? []).map((f) => ({ value: f.id, label: f.name }))} />
        </select>
        <form onSubmit={(e) => { e.preventDefault(); set('q', String(new FormData(e.currentTarget).get('q')).trim().slice(0, 200)); }} className="flex gap-2">
          <input name="q" aria-label="Tìm kiếm" defaultValue={q} maxLength={200} placeholder="Mã, tên, từ khóa" className={inputClass} />
          <button type="submit" className={btnGhost}>Tìm</button>
        </form>
      </div>
      <div className="mt-3">
        <QueryBox query={query} empty="Không có hồ sơ nào chờ xét duyệt." isEmpty={(d) => d.items.length === 0}>
          {(d) => (
            <>
              <ul className="space-y-2">
                {d.items.map((t) => {
                  const late = t.round.reviewDeadline && new Date(t.round.reviewDeadline).getTime() < now;
                  return (
                    <li key={t.id} className="rounded-xl border border-slate-300 bg-white p-4 shadow-sm">
                      <Link to={`/xet-duyet/${t.id}`} state={{ from: here.pathname + here.search }} className="break-words font-medium text-blue-700 underline decoration-blue-700/30 underline-offset-4 hover:decoration-blue-700">{t.code} – {t.title}</Link>
                      <p className="mt-1 text-sm text-slate-700">{t.round.name} · Trưởng nhóm: {t.leader?.fullName} · {t.memberCount} thành viên · GVHD: {t.advisor?.fullName ?? 'Chưa có'}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                        <span>Gửi lúc {fmtDateTime(t.latestSubmission?.createdAt)} (lần {t.latestSubmission?.seq})</span>
                        <span className={late ? 'font-medium text-red-700' : ''}>Hạn xét duyệt {fmtDateTime(t.round.reviewDeadline)}</span>
                        <SimilarityLevelCell level={t.latestSimilarityLevel} status={t.latestSimilarityStatus} unchecked={t.latestSubmission?.unchecked} />
                      </p>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2 text-sm text-slate-700">Thứ tự gần đúng theo thời điểm gửi.</p>
              <Pager page={d.page} pageSize={d.pageSize} total={d.total} onPage={(p) => set('page', String(p))} />
            </>
          )}
        </QueryBox>
      </div>
    </section>
  );
}
