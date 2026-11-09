import { Link, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ROLE_LABEL } from '@nckh/shared';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.js';
import { qs } from '../../lib/format.js';
import { useCatalog, useScopedFaculties } from '../../lib/queries.js';
import { FilterX, Upload, UserPlus } from 'lucide-react';
import { Badge, Options, PageHeader, Pager, QueryBox, btnGhost, btnPrimary, opt, tableFrame } from '../../components/ui.jsx';
import { inputClass } from '../../components/FormField.jsx';

const FILTERS = ['role', 'facultyId', 'classId', 'isLocked', 'q'];

// R18 – API_GD2 §3.2 GET /api/users
export function UsersPage() {
  const { user } = useAuth();
  const [sp, setSp] = useSearchParams();
  const params = Object.fromEntries(FILTERS.map((k) => [k, sp.get(k) ?? '']));
  const page = Number(sp.get('page')) || 1;
  const set = (k, v) => setSp((old) => {
    const n = new URLSearchParams(old);
    if (v) n.set(k, v); else n.delete(k);
    n.delete('page');
    return n;
  });
  const faculties = useScopedFaculties(user);
  const allFaculties = useCatalog('faculties');
  const classes = useCatalog('classes');
  const query = useQuery({
    queryKey: ['users', params, page],
    queryFn: () => api(`/users${qs({ ...params, page, pageSize: 20 })}`),
  });
  const facName = Object.fromEntries((allFaculties.data ?? []).map((f) => [f.id, f.name]));
  const clsCode = Object.fromEntries((classes.data ?? []).map((c) => [c.id, c.code]));
  const roles = user.role === 'ADMIN' ? ['ADMIN', 'STAFF', 'LECTURER', 'STUDENT'] : ['LECTURER', 'STUDENT'];
  const filtered = FILTERS.some((k) => params[k]);

  return (
    <section>
      <PageHeader title="Tài khoản" description="Tài khoản sinh viên, giảng viên và cán bộ; khóa, mở khóa, đặt lại mật khẩu.">
        <Link to="/quan-ly/tai-khoan/nhap-csv" className={btnGhost}><Upload aria-hidden="true" className="size-4" />Nhập CSV</Link>
        <Link to="/quan-ly/tai-khoan/moi" className={btnPrimary}><UserPlus aria-hidden="true" className="size-4" />Tạo tài khoản</Link>
      </PageHeader>
      <form className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5 rounded-xl border border-slate-300 bg-white p-4 shadow-sm sm:p-5" onSubmit={(e) => e.preventDefault()} aria-label="Bộ lọc tài khoản">
        <select aria-label="Vai trò" className={inputClass} value={params.role} onChange={(e) => set('role', e.target.value)}>
          <Options placeholder="Mọi vai trò" options={roles.map((r) => ({ value: r, label: ROLE_LABEL[r] }))} />
        </select>
        <select aria-label="Khoa" className={inputClass} value={params.facultyId} onChange={(e) => set('facultyId', e.target.value)}>
          <Options placeholder="Mọi khoa" options={opt(faculties.data ?? [])} />
        </select>
        <select aria-label="Lớp" className={inputClass} value={params.classId} onChange={(e) => set('classId', e.target.value)}>
          <Options placeholder="Mọi lớp" options={opt(classes.data ?? [], 'id', (c) => c.code)} />
        </select>
        <select aria-label="Trạng thái" className={inputClass} value={params.isLocked} onChange={(e) => set('isLocked', e.target.value)}>
          <Options placeholder="Mọi trạng thái" options={[{ value: 'false', label: 'Hoạt động' }, { value: 'true', label: 'Đã khóa' }]} />
        </select>
        <input aria-label="Tìm theo mã, email, họ tên" placeholder="Tìm mã, email, họ tên" className={inputClass} defaultValue={params.q}
          onKeyDown={(e) => e.key === 'Enter' && set('q', e.currentTarget.value.trim())} onBlur={(e) => e.currentTarget.value.trim() !== params.q && set('q', e.currentTarget.value.trim())} />
      </form>
      {filtered && <button type="button" className={`${btnGhost} mt-2`} onClick={() => setSp({})}><FilterX aria-hidden="true" className="size-4" />Xóa bộ lọc</button>}
      <div className="mt-3">
        <QueryBox query={query} empty={filtered ? 'Không có tài khoản phù hợp' : 'Chưa có tài khoản nào'} isEmpty={(d) => d.items.length === 0}>
          {(d) => (
            <>
              <div className={tableFrame}>
                <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
                  <thead><tr>
                    {['Mã', 'Họ tên', 'Email', 'Vai trò', 'Khoa', 'Lớp', 'Trạng thái'].map((h) => <th key={h} scope="col" className="px-3 py-2.5">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {d.items.map((u) => (
                      <tr key={u.id}>
                        <td className="px-3 py-3"><Link className="font-mono font-medium text-blue-700 underline decoration-blue-700/30 underline-offset-4 hover:decoration-blue-700" to={`/quan-ly/tai-khoan/${u.id}`}>{u.code}</Link></td>
                        <td className="px-3 py-3 break-words font-medium text-slate-900">{u.fullName}</td>
                        <td className="px-3 py-3 break-all text-slate-600">{u.email}</td>
                        <td className="px-3 py-3">{ROLE_LABEL[u.role]}</td>
                        <td className="px-3 py-3">{facName[u.facultyId] ?? ''}</td>
                        <td className="px-3 py-3">{clsCode[u.classId] ?? ''}</td>
                        <td className="px-3 py-3 space-x-1">
                          {u.isLocked ? <Badge tone="red">Đã khóa</Badge> : <Badge tone="green">Hoạt động</Badge>}
                          {u.mustChangePassword && <Badge tone="amber">Chờ đổi mật khẩu</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager page={d.page} pageSize={d.pageSize} total={d.total}
                onPage={(p) => setSp((old) => { const n = new URLSearchParams(old); n.set('page', p); return n; })} />
            </>
          )}
        </QueryBox>
      </div>
    </section>
  );
}
