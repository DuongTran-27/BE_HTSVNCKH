import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { FINAL_RESULT_LABEL, STATS_DIMENSION_LABEL, STATS_GROUP_BY, TOPIC_STATUS_LABEL } from '@nckh/shared';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.js';
import { downloadCsv, qs } from '../../lib/format.js';
import { useCatalog } from '../../lib/queries.js';
import { pickEnum, pickYear, useUrlParams } from '../../lib/urlParams.js';
import { DebouncedInput, FilterSelect } from '../../components/ListFilters.jsx';
import { StatsChart } from '../../components/StatsChart.jsx';
import { StuckTopics } from '../../components/StuckTopics.jsx';
import { QueryBox, btnGhost, btnPrimary } from '../../components/ui.jsx';

const toOptions = (labels) => Object.entries(labels).map(([value, label]) => ({ value, label }));
const STATUS_NO_DRAFT = Object.fromEntries(Object.entries(TOPIC_STATUS_LABEL).filter(([k]) => k !== 'DRAFT')); // API_GD45 §9.1
const CHARTS = { bar: 'Biểu đồ cột', pie: 'Biểu đồ tròn' };

// /thong-ke – API_GD45 §9. Biểu đồ, bảng và CSV dùng cùng một chuỗi query (FR14)
export function StatsPage() {
  const { user } = useAuth();
  const u = useUrlParams();
  const isStaff = user?.role === 'STAFF';
  const [chart, setChart] = useState('bar');
  const [csvError, setCsvError] = useState('');
  const [busy, setBusy] = useState(false);
  const params = {
    groupBy: pickEnum(u.get('groupBy'), STATS_GROUP_BY) || 'status',
    roundId: u.get('roundId'), academicYear: pickYear(u.get('academicYear')), fieldId: u.get('fieldId'),
    lecturerId: isStaff ? u.get('lecturerId') : '',
    status: pickEnum(u.get('status'), Object.keys(STATUS_NO_DRAFT)), result: pickEnum(u.get('result'), Object.keys(FINAL_RESULT_LABEL)),
  };
  const query = qs(params);
  const rounds = useQuery({ queryKey: ['rounds', 'all'], queryFn: async () => (await api('/rounds?pageSize=100')).items });
  const fields = useCatalog('fields');
  const lecturers = useQuery({ queryKey: ['users', 'lecturers-filter'], enabled: isStaff, queryFn: async () => (await api('/users?role=LECTURER&pageSize=100')).items });
  const stats = useQuery({ queryKey: ['stats', query], queryFn: () => api(`/stats${query}`), placeholderData: keepPreviousData });
  const yearBad = u.get('academicYear') && !params.academicYear;

  const exportCsv = async () => {
    setBusy(true);
    setCsvError('');
    try {
      const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date()).replaceAll('-', '');
      downloadCsv(await api(`/stats/export.csv${query}`, { as: 'blob' }), `thong-ke-${params.groupBy}-${day}.csv`);
    } catch (err) {
      setCsvError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const dim = STATS_DIMENSION_LABEL[params.groupBy];
  return (
    <section>
      <h1 className="text-2xl font-semibold">Thống kê</h1>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <FilterSelect label="Thống kê theo" value={params.groupBy} onChange={(v) => u.set('groupBy', v)} options={toOptions(STATS_DIMENSION_LABEL)} />
        <FilterSelect label="Đợt" value={params.roundId} onChange={(v) => u.set('roundId', v)} placeholder="Mọi đợt"
          options={(rounds.data ?? []).map((r) => ({ value: r.id, label: `${r.name} (${r.academicYear})` }))} />
        <div>
          <DebouncedInput label="Năm học" value={u.get('academicYear')} onCommit={(v) => u.set('academicYear', v)} placeholder="2026-2027" maxLength={9} />
          {yearBad && <p className="mt-1 text-sm text-red-700">Năm học dạng 2026-2027</p>}
        </div>
        <FilterSelect label="Lĩnh vực" value={params.fieldId} onChange={(v) => u.set('fieldId', v)} placeholder="Mọi lĩnh vực"
          options={(fields.data ?? []).map((f) => ({ value: f.id, label: f.name }))} />
        {isStaff && (
          <FilterSelect label="Giảng viên hướng dẫn" value={params.lecturerId} onChange={(v) => u.set('lecturerId', v)} placeholder="Mọi giảng viên"
            options={(lecturers.data ?? []).map((l) => ({ value: l.id, label: `${l.code} – ${l.fullName}` }))} />
        )}
        <FilterSelect label="Trạng thái" value={params.status} onChange={(v) => u.set('status', v)} placeholder="Mọi trạng thái" options={toOptions(STATUS_NO_DRAFT)} />
        <FilterSelect label="Kết quả" value={params.result} onChange={(v) => u.set('result', v)} placeholder="Mọi kết quả" options={toOptions(FINAL_RESULT_LABEL)} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {u.any && <button type="button" className={btnGhost} onClick={u.clear}>Xóa bộ lọc</button>}
        <button type="button" className={btnPrimary} disabled={busy} onClick={exportCsv}>{busy ? 'Đang tải…' : 'Xuất CSV'}</button>
        <div className="flex gap-1" role="group" aria-label="Kiểu biểu đồ">
          {Object.entries(CHARTS).map(([k, l]) => <button key={k} type="button" className={btnGhost} aria-pressed={chart === k} onClick={() => setChart(k)}>{l}</button>)}
        </div>
      </div>
      {csvError && <p role="alert" className="mt-2 text-sm text-red-700">{csvError}</p>}
      <div className="mt-4">
        <QueryBox query={stats} empty="Không có đề tài nào khớp bộ lọc." isEmpty={(d) => d.rows.length === 0}>
          {(d) => (
            <>
              <StatsChart rows={d.rows} type={chart} label={dim} />
              <div className="mt-4 overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <caption className="mb-2 text-left font-medium">Số đề tài theo {dim.toLowerCase()} (tổng {d.total})</caption>
                  <thead><tr className="border-b border-slate-400"><th scope="col" className="p-2">{dim}</th><th scope="col" className="p-2 text-right">Số đề tài</th></tr></thead>
                  <tbody>
                    {d.rows.map((r) => (
                      <tr key={String(r.key)} className="border-b border-slate-200"><td className="break-words p-2">{r.label}</td><td className="p-2 text-right">{r.count}</td></tr>
                    ))}
                  </tbody>
                  <tfoot><tr><th scope="row" className="p-2 text-left">Tổng</th><td className="p-2 text-right font-semibold">{d.total}</td></tr></tfoot>
                </table>
              </div>
            </>
          )}
        </QueryBox>
      </div>
      {isStaff && <StuckTopics key={params.roundId} roundId={params.roundId} />}
    </section>
  );
}
