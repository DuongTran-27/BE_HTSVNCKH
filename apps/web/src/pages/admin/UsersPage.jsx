import { Link, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ROLE_LABEL } from '@nckh/shared';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.js';
import { qs } from '../../lib/format.js';
import { useCatalog, useScopedFaculties } from '../../lib/queries.js';
import { Badge, Options, Pager, QueryBox, btnGhost, btnPrimary, opt } from '../../components/ui.jsx';
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
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-xl font-bold">Tài khoản</h1>
        <Link to="/quan-ly/tai-khoan/moi" className={btnPrimary}>Tạo tài khoản</Link>
        <Link to="/quan-ly/tai-khoan/nhap-csv" className={btnGhost}>Nhập CSV</Link>
      </div>
      <form className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5" onSubmit={(e) => e.preventDefault()} aria-label="Bộ lọc tài khoản">
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
      {filtered && <button type="button" className={`${btnGhost} mt-2`} onClick={() => setSp({})}>Xóa bộ lọc</button>}
      <div className="mt-3">
        <QueryBox query={query} empty={filtered ? 'Không có tài khoản phù hợp' : 'Chưa có tài khoản nào'} isEmpty={(d) => d.items.length === 0}>
          {(d) => (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
                  <thead><tr className="border-b bg-slate-100">
                    {['Mã', 'Họ tên', 'Email', 'Vai trò', 'Khoa', 'Lớp', 'Trạng thái'].map((h) => <th key={h} scope="col" className="p-2">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {d.items.map((u) => (
                      <tr key={u.id} className="border-b">
                        <td className="p-2"><Link className="text-blue-800 underline" to={`/quan-ly/tai-khoan/${u.id}`}>{u.code}</Link></td>
                        <td className="p-2 break-words">{u.fullName}</td>
                        <td className="p-2 break-all">{u.email}</td>
                        <td className="p-2">{ROLE_LABEL[u.role]}</td>
                        <td className="p-2">{facName[u.facultyId] ?? ''}</td>
                        <td className="p-2">{clsCode[u.classId] ?? ''}</td>
                        <td className="p-2 space-x-1">
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
