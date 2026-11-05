import { useState } from 'react';
import { Link } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MILESTONE_EVAL_LABEL, milestoneCreateSchema, milestoneDueChangeSchema, milestoneUpdateSchema } from '@nckh/shared';
import { api } from '../../lib/api.js';
import { fmtDateTime, fromLocalInput, toLocalInput } from '../../lib/format.js';
import { execSubmit, useMilestones } from '../../lib/execution.js';
import { toast } from '../../lib/toast.js';
import { ExecShell } from '../../components/ExecShell.jsx';
import { FormField } from '../../components/FormField.jsx';
import { Badge, FormError, QueryBox, btnGhost, btnPrimary } from '../../components/ui.jsx';

export const EVAL_TONE = { PENDING: 'slate', PASSED: 'green', NEEDS_WORK: 'amber' };

// Tab Mốc – FR09 (API_GD45 §3). Tạo/sửa/đổi hạn khi permissions.manageMilestones (GVHD hiện hành, cán bộ trong phạm vi)
export function MilestonesPage() {
  return <ExecShell title="Mốc thực hiện">{(t) => <Milestones topic={t} />}</ExecShell>;
}

function Milestones({ topic: t }) {
  const q = useMilestones(t.id);
  const [creating, setCreating] = useState(false);
  return (
    <div className="space-y-4">
      {t.permissions?.manageMilestones && (creating
        ? <MilestoneForm topic={t} onDone={() => setCreating(false)} />
        : <button type="button" className={btnPrimary} onClick={() => setCreating(true)}>Thêm mốc</button>)}
      <QueryBox query={q} empty="Chưa có mốc thực hiện nào." isEmpty={(d) => d.length === 0}>
        {(items) => <ul className="space-y-3">{items.map((m) => <MilestoneCard key={m.id} topic={t} m={m} />)}</ul>}
      </QueryBox>
    </div>
  );
}

function MilestoneCard({ topic: t, m }) {
  const [mode, setMode] = useState(null); // 'edit' | 'due' | 'history'
  const toggle = (x) => setMode((v) => (v === x ? null : x));
  const d = m.latestDocument;
  return (
    <li className="space-y-2 rounded-md border border-slate-300 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="break-words font-bold">{m.order}. {m.name}</h2>
        <Badge tone={EVAL_TONE[m.evaluation]}>{MILESTONE_EVAL_LABEL[m.evaluation] ?? m.evaluation}</Badge>
        <Badge>{m.required ? 'Bắt buộc' : 'Không bắt buộc'}</Badge>
        {m.isOverdue && <Badge tone="red">Quá hạn</Badge>}
      </div>
      <p className="whitespace-pre-wrap break-words"><span className="font-medium">Đầu ra yêu cầu:</span> {m.output}</p>
      <p>Hạn: {fmtDateTime(m.dueAt)}{m.dueChangeCount > 0 && ` · đã đổi hạn ${m.dueChangeCount} lần`}</p>
      <p>
        Bản nộp mới nhất: {d ? <>phiên bản {d.version} lúc {fmtDateTime(d.uploadedAt)} {d.isLate && <Badge tone="red">Nộp muộn</Badge>}</> : 'chưa nộp'}
        {' · '}<Link to={`/de-tai/${t.id}/tai-lieu`} className="text-blue-800 underline">Tài liệu</Link>
      </p>
      <div className="flex flex-wrap gap-2">
        {t.permissions?.manageMilestones && <button type="button" className={btnGhost} aria-expanded={mode === 'edit'} onClick={() => toggle('edit')}>Sửa mốc</button>}
        {t.permissions?.manageMilestones && <button type="button" className={btnGhost} aria-expanded={mode === 'due'} onClick={() => toggle('due')}>Đổi hạn</button>}
        {m.dueChangeCount > 0 && <button type="button" className={btnGhost} aria-expanded={mode === 'history'} onClick={() => toggle('history')}>Lịch sử đổi hạn</button>}
      </div>
      {mode === 'edit' && <MilestoneForm topic={t} m={m} onDone={() => setMode(null)} />}
      {mode === 'due' && <DueChangeForm topic={t} m={m} onDone={() => setMode(null)} />}
      {mode === 'history' && <DueHistory m={m} />}
    </li>
  );
}

// datetime-local hiểu là giờ Việt Nam → ISO +07:00 (UI §1.4)
const createResolver = (v, c, o) => zodResolver(milestoneCreateSchema)({ ...v, dueAt: fromLocalInput(v.dueAt) }, c, o);
const dueResolver = (v, c, o) => zodResolver(milestoneDueChangeSchema)({ ...v, newDueAt: fromLocalInput(v.newDueAt) }, c, o);

/** Tạo mốc (m rỗng) hoặc sửa tên/đầu ra/cờ bắt buộc (không đổi hạn ở đây – §3.2) */
function MilestoneForm({ topic, m, onDone }) {
  const qc = useQueryClient();
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm({
    resolver: m ? zodResolver(milestoneUpdateSchema) : createResolver,
    defaultValues: m ? { name: m.name, output: m.output, required: m.required, version: m.version } : { name: '', output: '', dueAt: '', required: true },
  });
  const submit = (body) => execSubmit(qc, topic.id, setError, ['name', 'output', 'dueAt', 'required'], async () => {
    await api(m ? `/milestones/${m.id}` : `/topics/${topic.id}/milestones`, { method: m ? 'PATCH' : 'POST', body });
    toast(m ? 'Đã cập nhật mốc' : 'Đã thêm mốc', { type: 'success' });
    onDone();
  });
  return (
    <form noValidate onSubmit={handleSubmit(submit)} className="max-w-xl space-y-3 rounded-md bg-slate-50 p-3" aria-label={m ? 'Sửa mốc' : 'Thêm mốc'}>
      <FormField label="Tên mốc" error={errors.name?.message}><input type="text" {...register('name')} /></FormField>
      <FormField label="Đầu ra yêu cầu" error={errors.output?.message}><textarea rows={3} {...register('output')} /></FormField>
      {!m && <FormField label="Hạn (giờ Việt Nam)" error={errors.dueAt?.message}><input type="datetime-local" {...register('dueAt')} /></FormField>}
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" className="size-5" {...register('required')} /> Mốc bắt buộc</label>
      {m?.required && <p className="text-sm text-amber-800">Bỏ cờ bắt buộc của mốc chưa Đạt sẽ được báo cho cán bộ khoa.</p>}
      <FormError error={errors.root?.message} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={isSubmitting} className={btnPrimary}>{isSubmitting ? 'Đang xử lý…' : 'Lưu'}</button>
        <button type="button" onClick={onDone} className={btnGhost}>Hủy</button>
      </div>
    </form>
  );
}

function DueChangeForm({ topic, m, onDone }) {
  const qc = useQueryClient();
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm({
    resolver: dueResolver, defaultValues: { newDueAt: toLocalInput(m.dueAt), reason: '', version: m.version },
  });
  const submit = (body) => execSubmit(qc, topic.id, setError, ['newDueAt', 'reason'], async () => {
    await api(`/milestones/${m.id}/due-changes`, { method: 'POST', body });
    toast('Đã đổi hạn mốc', { type: 'success' });
    onDone();
  });
  return (
    <form noValidate onSubmit={handleSubmit(submit)} className="max-w-xl space-y-3 rounded-md bg-slate-50 p-3" aria-label="Đổi hạn mốc">
      <FormField label="Hạn mới (giờ Việt Nam)" error={errors.newDueAt?.message}><input type="datetime-local" {...register('newDueAt')} /></FormField>
      <FormField label="Lý do đổi hạn" error={errors.reason?.message}><textarea rows={3} {...register('reason')} /></FormField>
      <FormError error={errors.root?.message} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={isSubmitting} className={btnPrimary}>{isSubmitting ? 'Đang xử lý…' : 'Đổi hạn'}</button>
        <button type="button" onClick={onDone} className={btnGhost}>Hủy</button>
      </div>
    </form>
  );
}

function DueHistory({ m }) {
  const q = useQuery({ queryKey: ['due-changes', m.id], queryFn: async () => (await api(`/milestones/${m.id}/due-changes`)).items });
  return (
    <QueryBox query={q} empty="Chưa đổi hạn lần nào." isEmpty={(d) => d.length === 0}>
      {(items) => (
        <ul className="space-y-2 text-sm">
          {items.map((c) => (
            <li key={c.id} className="break-words rounded-md bg-slate-50 p-2">
              {fmtDateTime(c.oldDueAt)} → {fmtDateTime(c.newDueAt)} · {c.changedBy?.fullName} · {fmtDateTime(c.changedAt)}
              <p className="whitespace-pre-wrap">Lý do: {c.reason}</p>
            </li>
          ))}
        </ul>
      )}
    </QueryBox>
  );
}
