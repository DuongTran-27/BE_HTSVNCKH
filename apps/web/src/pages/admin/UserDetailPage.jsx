import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ROLE_LABEL, userUpdateSchema } from '@nckh/shared';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.js';
import { fmtDateTime } from '../../lib/format.js';
import { applyServerErrors } from '../../lib/forms.js';
import { useCatalog, useScopedFaculties } from '../../lib/queries.js';
import { toast } from '../../lib/toast.js';
import { FormField } from '../../components/FormField.jsx';
import { KeyRound, Lock, LockOpen } from 'lucide-react';
import { Badge, CheckGroup, ConfirmDialog, Options, PageHeader, QueryBox, TempPasswordBox, btnGhost, btnPrimary, card, opt } from '../../components/ui.jsx';

const FIELDS = ['email', 'fullName', 'classId', 'facultyId'];

// Chỉ gửi trường đã đổi (PATCH cần ít nhất 1); chuỗi rỗng coi như không đổi
const pickChanged = (v, target) => {
  const out = {};
  for (const k of FIELDS) {
    if (v[k] !== undefined && v[k] !== '' && v[k] !== (target[k] ?? '')) out[k] = v[k];
  }
  return out;
};

const CONFIRM = {
  lock: ['Khóa tài khoản', 'Khóa sẽ đăng xuất mọi phiên đăng nhập của người này. Tiếp tục?', 'Khóa'],
  unlock: ['Mở khóa tài khoản', 'Cho phép người này đăng nhập lại?', 'Mở khóa'],
  reset: ['Đặt lại mật khẩu', 'Tạo mật khẩu tạm mới, mật khẩu cũ mất hiệu lực và mọi phiên bị đăng xuất. Tiếp tục?', 'Đặt lại'],
};

// R20 – API_GD2 §3.2
export function UserDetailPage() {
  const { id } = useParams();
  const query = useQuery({ queryKey: ['users', 'detail', id], queryFn: () => api(`/users/${id}`) });
  return (
    <section>
      <PageHeader title="Chi tiết tài khoản" />
      <div>
        {/* key theo dữ liệu: form điền lại sau khi lưu/khóa */}
        <QueryBox query={query}>{(d) => <UserDetail key={JSON.stringify(d.user)} user={d.user} />}</QueryBox>
      </div>
    </section>
  );
}

function UserDetail({ user: target }) {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(null); // 'lock' | 'unlock' | 'reset'
  const [confirmError, setConfirmError] = useState('');
  const [tempPassword, setTempPassword] = useState(null); // state cục bộ, không vào cache
  const [formError, setFormError] = useState('');
  const [scopes, setScopes] = useState(target.staffFacultyIds ?? []);
  const [scopeError, setScopeError] = useState('');
  const isSelf = me.id === target.id;
  const isAdmin = me.role === 'ADMIN';
  const faculties = useScopedFaculties(me);
  const allFaculties = useCatalog('faculties');
  const classes = useCatalog('classes');
  const { register, handleSubmit, setError, formState: { errors, isSubmitting, isDirty } } = useForm({
    resolver: (v, c, o) => zodResolver(userUpdateSchema)(pickChanged(v, target), c, o),
    defaultValues: { email: target.email, fullName: target.fullName, classId: target.classId ?? '', facultyId: target.facultyId ?? '' },
  });

  const refresh = (user) => {
    qc.setQueryData(['users', 'detail', target.id], { user });
    qc.invalidateQueries({ queryKey: ['users'] });
  };
  const onSave = async (values) => {
    setFormError('');
    try {
      refresh((await api(`/users/${target.id}`, { method: 'PATCH', body: pickChanged(values, target) })).user);
      toast('Đã lưu thông tin tài khoản', { type: 'success' });
    } catch (err) {
      if (!err.sessionExpired) setFormError(applyServerErrors(err, setError, FIELDS).join(' '));
    }
  };
  const act = useMutation({
    // Mật khẩu tạm đi thẳng vào state cục bộ, mutation trả null để không nằm trong MutationCache (review T304 m1)
    mutationFn: async (kind) => {
      const res = await api(`/users/${target.id}/${kind === 'reset' ? 'reset-password' : kind}`, { method: 'POST' });
      if (kind !== 'reset') return res;
      setTempPassword(res.temporaryPassword);
      return null;
    },
    onSuccess: (res, kind) => {
      setConfirm(null);
      if (kind !== 'reset') { refresh(res.user); toast(kind === 'lock' ? 'Đã khóa tài khoản' : 'Đã mở khóa tài khoản', { type: 'success' }); }
    },
    onError: (err) => !err.sessionExpired && setConfirmError(err.message),
  });
  const saveScopes = useMutation({
    mutationFn: () => api(`/users/${target.id}/staff-scopes`, { method: 'PUT', body: { facultyIds: scopes } }),
    onSuccess: (res) => { setScopeError(''); refresh(res.user); toast('Đã lưu phạm vi khoa', { type: 'success' }); },
    onError: (err) => !err.sessionExpired && setScopeError(err.message),
  });

  const classOptions = (classes.data ?? []).filter((c) => c.id === target.classId || c.isActive !== false);
  const ask = (kind) => { setConfirmError(''); setConfirm(kind); };

  return (
    <div className="space-y-4">
      <div className={`${card} flex flex-wrap items-start gap-4`}>
      <span aria-hidden="true" className="grid size-14 shrink-0 place-items-center rounded-full bg-blue-100 text-lg font-semibold text-blue-800">{target.fullName.trim().split(/\s+/).slice(-2).map((w) => w[0]).join('').toUpperCase()}</span>
      <div className="min-w-0 flex-1">
      <p className="break-words text-lg font-semibold">{target.fullName}</p>
      <p className="break-all text-sm text-slate-600">{target.email}</p>
      <dl className="mt-3 grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[8rem_1fr]">
        <dt className="text-slate-500">Mã</dt><dd>{target.code}</dd>
        <dt className="text-slate-500">Vai trò</dt><dd>{ROLE_LABEL[target.role]}</dd>
        <dt className="text-slate-500">Trạng thái</dt>
        <dd className="space-x-1">
          {target.isLocked ? <Badge tone="red">Đã khóa</Badge> : <Badge tone="green">Hoạt động</Badge>}
          {target.mustChangePassword && <Badge tone="amber">Chờ đổi mật khẩu</Badge>}
        </dd>
        <dt className="text-slate-500">Tạo lúc</dt><dd>{fmtDateTime(target.createdAt)}</dd>
      </dl>
      </div>
      {!isSelf && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnGhost} onClick={() => ask(target.isLocked ? 'unlock' : 'lock')}>
            {target.isLocked ? <LockOpen aria-hidden="true" className="size-4" /> : <Lock aria-hidden="true" className="size-4" />}{target.isLocked ? 'Mở khóa' : 'Khóa'}
          </button>
          <button type="button" className={btnGhost} onClick={() => ask('reset')}><KeyRound aria-hidden="true" className="size-4" />Đặt lại mật khẩu</button>
        </div>
      )}
      </div>

      {tempPassword && <TempPasswordBox password={tempPassword} onClose={() => setTempPassword(null)} />}

      {confirm && (
        <ConfirmDialog title={CONFIRM[confirm][0]} message={CONFIRM[confirm][1]} confirmLabel={CONFIRM[confirm][2]} danger={confirm !== 'unlock'}
          busy={act.isPending} error={confirmError} onConfirm={() => act.mutate(confirm)} onCancel={() => setConfirm(null)} />
      )}

      <form onSubmit={handleSubmit(onSave)} noValidate className={`${card} max-w-xl space-y-4`} aria-label="Sửa tài khoản">
        <h2 className="font-semibold">Thông tin tài khoản</h2>
        <FormField label="Email" error={errors.email?.message}><input type="email" {...register('email')} /></FormField>
        <FormField label="Họ tên" error={errors.fullName?.message}><input {...register('fullName')} /></FormField>
        {target.role === 'STUDENT' && (
          <FormField label="Lớp" error={errors.classId?.message}>
            <select {...register('classId')}><Options options={opt(classOptions, 'id', (c) => c.code)} /></select>
          </FormField>
        )}
        {isAdmin && target.role !== 'ADMIN' && (
          <FormField label="Khoa" error={errors.facultyId?.message}>
            <select {...register('facultyId')}><Options options={opt(faculties.data ?? [])} /></select>
          </FormField>
        )}
        {formError && <p role="alert" className="text-sm text-red-700 break-words">{formError}</p>}
        <button type="submit" disabled={isSubmitting || !isDirty} className={btnPrimary}>{isSubmitting ? 'Đang lưu…' : 'Lưu thay đổi'}</button>
      </form>

      {isAdmin && target.role === 'STAFF' && (
        <div className="max-w-xl space-y-2 rounded-xl border border-slate-300 bg-white p-4 shadow-sm">
          <h2 className="font-semibold">Phạm vi khoa</h2>
          <p className="text-sm text-amber-900">Lưu sẽ thay toàn bộ phạm vi.</p>
          <CheckGroup legend="Khoa phụ trách" value={scopes} onChange={setScopes} options={(allFaculties.data ?? []).map((f) => ({ id: f.id, label: f.name }))} />
          {scopeError && <p role="alert" className="text-sm text-red-700 break-words">{scopeError}</p>}
          <button type="button" className={btnPrimary} disabled={saveScopes.isPending || scopes.length === 0} onClick={() => saveScopes.mutate()}>Lưu phạm vi</button>
        </div>
      )}
    </div>
  );
}
