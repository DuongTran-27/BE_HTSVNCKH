import { Link, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.js';
import { fmtDateTime, qs } from '../../lib/format.js';
import { useScopedFaculties } from '../../lib/queries.js';
import { inputClass } from '../../components/FormField.jsx';
import { Badge, Options, Pager, QueryBox, btnGhost, btnPrimary, opt } from '../../components/ui.jsx';

// R23 – API_GD2 §4.3 GET /api/rounds
export function RoundsPage() {
  const { user } = useAuth();
  const [sp, setSp] = useSearchParams();
  const facultyId = sp.get('facultyId') ?? '';
  const academicYear = sp.get('academicYear') ?? '';
  const page = Number(sp.get('page')) || 1;
  const faculties = useScopedFaculties(user);
  const set = (k, v) => setSp((old) => {
    const n = new URLSearchParams(old);
    if (v) n.set(k, v); else n.delete(k);
    if (k !== 'page') n.delete('page');
    return n;
  });
  // Năm học sai định dạng sẽ bị server từ chối (400) – chỉ gửi khi đủ dạng
  const yearOk = /^\d{4}-\d{4}$/.test(academicYear);
  const query = useQuery({
    queryKey: ['rounds', facultyId, yearOk ? academicYear : '', page],
    queryFn: () => api(`/rounds${qs({ facultyId, academicYear: yearOk ? academicYear : '', page, pageSize: 20 })}`),
  });
  const facName = Object.fromEntries((faculties.data ?? []).map((f) => [f.id, f.name]));
  const filtered = facultyId || academicYear;

  return (
    <section>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-xl font-bold">Đợt</h1>
        <Link to="/quan-ly/dot/moi" className={btnPrimary}>Tạo đợt mới</Link>
      </div>
      <form className="mt-3 grid gap-2 sm:grid-cols-3" onSubmit={(e) => e.preventDefault()} aria-label="Bộ lọc đợt">
        <select aria-label="Khoa" className={inputClass} value={facultyId} onChange={(e) => set('facultyId', e.target.value)}>
          <Options placeholder="Mọi khoa" options={opt(faculties.data ?? [])} />
        </select>
        <input aria-label="Năm học" placeholder="Năm học, ví dụ 2026-2027" className={inputClass} defaultValue={academicYear}
          onBlur={(e) => set('academicYear', e.target.value.trim())} onKeyDown={(e) => e.key === 'Enter' && set('academicYear', e.currentTarget.value.trim())} />
        {filtered && <button type="button" className={btnGhost} onClick={() => setSp({})}>Xóa bộ lọc</button>}
      </form>
      <div className="mt-3">
        <QueryBox query={query} empty="Chưa có đợt nào. Tạo đợt mới." isEmpty={(d) => d.items.length === 0}>
          {(d) => (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[48rem] text-left text-sm">
                  <thead><tr className="border-b bg-slate-100">
                    {['Tên', 'Khoa', 'Năm học', 'Mở đăng ký', 'Đóng đăng ký', 'Hạn xét duyệt', 'Kết thúc', ''].map((h) => <th key={h} scope="col" className="p-2">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {d.items.map((r) => (
                      <tr key={r.id} className="border-b">
                        <td className="p-2 break-words"><Link className="text-blue-800 underline" to={`/quan-ly/dot/${r.id}`}>{r.name}</Link></td>
                        <td className="p-2">{facName[r.facultyId] ?? ''}</td>
                        <td className="p-2">{r.academicYear}</td>
                        <td className="p-2">{fmtDateTime(r.regOpenAt)}</td>
                        <td className="p-2">{fmtDateTime(r.regCloseAt)}</td>
                        <td className="p-2">{fmtDateTime(r.reviewDeadline)}</td>
                        <td className="p-2">{fmtDateTime(r.endAt)}</td>
                        <td className="p-2">{r.registrationOpen && <Badge tone="green">Đang mở đăng ký</Badge>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager page={d.page} pageSize={d.pageSize} total={d.total} onPage={(p) => set('page', String(p))} />
            </>
          )}
        </QueryBox>
      </div>
    </section>
  );
}
