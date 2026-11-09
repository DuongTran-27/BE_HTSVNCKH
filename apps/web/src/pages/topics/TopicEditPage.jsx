import { useEffect, useState } from 'react';
import { Link, useBlocker, useLocation, useNavigate, useParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { countWords, topicDraftSchema } from '@nckh/shared';
import { api } from '../../lib/api.js';
import { applyServerErrors } from '../../lib/forms.js';
import { useCatalog, useSimilarityLatest } from '../../lib/queries.js';
import { SUBMIT_FIELDS, submitProblems, topicToForm } from '../../lib/topicForm.js';
import { toast } from '../../lib/toast.js';
import { useCooldown } from '../../lib/useCooldown.js';
import { FormField, inputClass } from '../../components/FormField.jsx';
import { SimilarityPanel } from '../../components/SimilarityPanel.jsx';
import { ConfirmDialog, Options, QueryBox, btnGhost, btnPrimary, useDialogA11y } from '../../components/ui.jsx';

const FIELD_NAMES = ['title', 'summary', 'objectives', 'keywords', 'fieldId'];

// R7 – UI §4.7. Chỉ dựng form khi đã có dữ liệu; tải lại ngầm không được unmount form (mất chữ đang nhập).
export function TopicEditPage() {
  const { id } = useParams();
  const query = useQuery({ queryKey: ['topic', id], queryFn: async () => (await api(`/topics/${id}`)).topic });
  if (query.data) return <EditForm topic={query.data} />;
  return <section><QueryBox query={query}>{() => null}</QueryBox></section>;
}

function KeywordsInput({ value, max, onChange, error }) {
  const [text, setText] = useState('');
  const add = () => {
    const k = text.trim().replace(/,$/, '').trim();
    if (k && !value.includes(k) && value.length < max) onChange([...value, k]);
    setText('');
  };
  return (
    <FormField label="Từ khóa" error={error} hint={`${value.length}/${max} từ khóa. Nhấn Enter hoặc dấu phẩy để thêm.`}>
      <input type="text" value={text} disabled={value.length >= max} onChange={(e) => setText(e.target.value)} onBlur={add}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } }} />
    </FormField>
  );
}

// Không có Esc: phải chọn một trong hai để không mất/ghi đè dữ liệu ngoài ý muốn
function ConflictDialog({ onTakeNew, onKeepMine }) {
  const ref = useDialogA11y();
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div ref={ref} role="dialog" aria-modal="true" aria-label="Hồ sơ vừa được cập nhật" className="w-full max-w-md space-y-3 rounded-lg bg-white p-4 shadow-lg">
        <h2 className="text-lg font-semibold">Hồ sơ vừa được thành viên khác cập nhật</h2>
        <p>Chọn tải bản mới (bỏ thay đổi của bạn) hoặc giữ nội dung của bạn rồi lưu lại để ghi đè.</p>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onTakeNew} className={btnGhost}>Tải bản mới (bỏ thay đổi của tôi)</button>
          <button type="button" onClick={onKeepMine} className={btnPrimary}>Giữ nội dung của tôi</button>
        </div>
      </div>
    </div>
  );
}

function EditForm({ topic }) {
  const { id } = topic;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const incomplete = useLocation().state?.incomplete;
  // R7: giá trị ban đầu nạp đúng một lần. Về sau chỉ `topic.version` đọc từ cache được cập nhật, không đụng ô đang nhập.
  const [initial] = useState(() => topicToForm(topic));
  const { register, handleSubmit, setError, setValue, reset, watch, formState: { errors, isDirty } } = useForm({
    resolver: zodResolver(topicDraftSchema), defaultValues: initial,
  });
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [formError, setFormError] = useState('');
  const [check, setCheck] = useState(null);
  const cd = useCooldown();
  const fields = useCatalog('fields');
  const latest = useSimilarityLatest(id, topic.permissions?.checkSimilarity);
  const cfg = topic.round.effectiveConfig;
  const values = watch();
  const problems = submitProblems(values, cfg);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => isDirty && currentLocation.pathname !== nextLocation.pathname);

  useEffect(() => {
    if (!topic.permissions?.edit) {
      toast('Chỉ sửa được hồ sơ ở trạng thái Nháp hoặc Cần chỉnh sửa', { type: 'error' });
      navigate(`/de-tai/${id}`, { replace: true });
    }
  }, [topic.permissions?.edit, id, navigate]);
  useEffect(() => { if (incomplete) applyServerErrors({ code: 'TOPIC_INCOMPLETE', details: incomplete }, setError, FIELD_NAMES); }, [incomplete, setError]);
  useEffect(() => {
    if (!isDirty) return undefined;
    const h = (e) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [isDirty]);

  /** PUT đủ mọi trường (API §5.1). Ném lại lỗi sau khi đã xử lý để "Kiểm tra trước" dừng. */
  const save = async (v) => {
    setFormError('');
    try {
      const r = await api(`/topics/${id}`, { method: 'PUT', body: { ...v, fieldId: v.fieldId || null, version: topic.version } });
      qc.setQueryData(['topic', id], r.topic);
      qc.invalidateQueries({ queryKey: ['similarity-latest', id] });
      qc.invalidateQueries({ queryKey: ['topics'] });
      reset(topicToForm(r.topic));
      toast('Đã lưu nháp', { type: 'success' });
      return r.topic;
    } catch (err) {
      if (err.sessionExpired) throw err;
      if (err.code === 'CONCURRENT_UPDATE') { qc.invalidateQueries({ queryKey: ['topic', id] }); setConflict(true); }
      else if (err.code === 'TOPIC_NOT_EDITABLE') { toast(err.message, { type: 'error' }); qc.invalidateQueries({ queryKey: ['topic', id] }); navigate(`/de-tai/${id}`, { replace: true }); }
      else setFormError(applyServerErrors(err, setError, FIELD_NAMES).join(' '));
      throw err;
    }
  };
  const onSave = handleSubmit(async (v) => { setBusy(true); try { await save(v); } catch { /* đã hiển thị */ } finally { setBusy(false); } });
  const onCheck = handleSubmit(async (v) => {
    setBusy(true);
    try {
      if (isDirty) await save(v); // API §7.1 so nội dung đã lưu
      const r = await api(`/topics/${id}/similarity-checks`, { method: 'POST' });
      setCheck(r.similarityCheck);
      qc.invalidateQueries({ queryKey: ['similarity-latest', id] });
      qc.invalidateQueries({ queryKey: ['topic', id] });
      qc.invalidateQueries({ queryKey: ['topics'] });
    } catch (err) {
      if (err.status === 429) cd.start(err.retryAfter);
      if (!err.sessionExpired && err.code !== 'CONCURRENT_UPDATE' && err.code !== 'TOPIC_NOT_EDITABLE' && err.code !== 'VALIDATION_ERROR') setFormError(err.message);
    } finally { setBusy(false); }
  });
  const keepMine = async () => { await qc.refetchQueries({ queryKey: ['topic', id] }); setConflict(false); };
  const takeNew = async () => {
    await qc.refetchQueries({ queryKey: ['topic', id] });
    const data = qc.getQueryData(['topic', id]);
    if (data) reset(topicToForm(data));
    setConflict(false);
  };

  const options = fields.data ?? [];
  const inactiveField = topic.field && !options.some((f) => f.id === topic.field.id) && fields.data ? topic.field : null;
  const fieldValue = values.fieldId;
  const showInactive = inactiveField && fieldValue === inactiveField.id;
  const words = countWords(values.summary);

  return (
    <section>
      <p data-testid="topic-code" className="text-sm text-slate-700">{topic.code}</p>
      <h1 className="text-2xl font-semibold">Soạn hồ sơ</h1>
      <form noValidate onSubmit={onSave} className="mt-4 max-w-2xl space-y-4 rounded-xl border border-slate-300 bg-white p-4 shadow-sm sm:p-5">
        <FormField label="Tên đề tài" error={errors.title?.message}><input type="text" {...register('title')} /></FormField>
        <FormField label="Tóm tắt" error={errors.summary?.message} hint={`${words}/${cfg.minSummaryWords} từ`}><textarea rows={6} {...register('summary')} /></FormField>
        <FormField label="Mục tiêu" error={errors.objectives?.message}><textarea rows={4} {...register('objectives')} /></FormField>
        <KeywordsInput value={values.keywords ?? []} max={cfg.maxKeywords} error={errors.keywords?.message ?? Object.entries(errors.keywords ?? {}).map(([, e]) => e?.message).find(Boolean)}
          onChange={(k) => setValue('keywords', k, { shouldDirty: true, shouldValidate: true })} />
        {values.keywords?.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="Danh sách từ khóa">
            {values.keywords.map((k) => (
              <li key={k} className="inline-flex items-center gap-1 rounded bg-slate-200 px-2 py-1 text-sm">
                {k}
                <button type="button" aria-label={`Xóa từ khóa ${k}`} className="min-h-6 px-1" onClick={() => setValue('keywords', values.keywords.filter((x) => x !== k), { shouldDirty: true })}>×</button>
              </li>
            ))}
          </ul>
        )}
        <FormField label="Lĩnh vực" error={errors.fieldId?.message ?? (showInactive ? 'Lĩnh vực này đã ngừng dùng, hãy chọn lĩnh vực khác trước khi lưu' : undefined)}>
          <select {...register('fieldId')} className={inputClass}>
            <Options placeholder="Chọn lĩnh vực" options={[...(inactiveField ? [{ value: inactiveField.id, label: `${inactiveField.name} (Ngừng dùng)` }] : []), ...options.map((f) => ({ value: f.id, label: f.name }))]} />
          </select>
        </FormField>

        <div className="rounded-xl border border-slate-300 bg-white p-4 shadow-sm">
          <h2 className="font-bold">Đủ điều kiện gửi</h2>
          <ul className="mt-1 space-y-1 text-sm">
            {SUBMIT_FIELDS.map(([k, label]) => (
              <li key={k} className={problems[k] ? 'text-red-800' : 'text-green-800'}>{problems[k] ? 'Chưa đạt' : 'Đạt'} – {label}{problems[k] ? `: ${problems[k]}` : ''}</li>
            ))}
          </ul>
        </div>

        {formError && <p role="alert" className="break-words rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">{formError}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={busy} className={btnPrimary}>{busy ? 'Đang xử lý…' : 'Lưu nháp'}</button>
          {topic.permissions?.checkSimilarity && (
            <button type="button" disabled={busy || cd.active} onClick={onCheck} className={btnGhost}>Kiểm tra trước</button>
          )}
          <Link to={`/de-tai/${id}`} className={btnGhost}>Về chi tiết</Link>
        </div>
        {cd.active && <p role="status" className="text-sm text-amber-900">{cd.message}</p>}
      </form>

      {topic.permissions?.checkSimilarity && (check || latest.data) && (
        <div className="mt-4 max-w-2xl"><h2 className="mb-2 font-bold">Kết quả kiểm tra trùng lặp</h2><SimilarityPanel check={check ?? latest.data} /></div>
      )}

      {conflict && <ConflictDialog onTakeNew={takeNew} onKeepMine={keepMine} />}
      {blocker.state === 'blocked' && (
        <ConfirmDialog title="Rời trang?" message="Bạn có thay đổi chưa lưu. Rời trang sẽ mất các thay đổi này." confirmLabel="Rời trang" danger
          onConfirm={() => blocker.proceed()} onCancel={() => blocker.reset()} />
      )}
    </section>
  );
}
