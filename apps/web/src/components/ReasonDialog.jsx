import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { reasonSchema } from '@nckh/shared';
import { applyServerErrors } from '../lib/forms.js';
import { FormField } from './FormField.jsx';
import { btnDanger, btnGhost } from './ui.jsx';

/** Hộp nhập lý do bắt buộc (reasonSchema 5–2000). onSubmit(reason) ném ApiError → hiện lỗi dưới ô hoặc ở hộp */
export function ReasonDialog({ title, message, label = 'Lý do', confirmLabel, onSubmit, onCancel }) {
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(reasonSchema), defaultValues: { reason: '' },
  });
  const submit = async ({ reason }) => {
    try {
      await onSubmit(reason);
    } catch (err) {
      if (!err.sessionExpired) setError('root', { message: applyServerErrors(err, setError, ['reason']).join(' ') || undefined });
    }
  };
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <form role="dialog" aria-modal="true" aria-label={title} noValidate onSubmit={handleSubmit(submit)} className="w-full max-w-md space-y-3 rounded-lg bg-white p-4 shadow-lg">
        <h2 className="text-lg font-bold">{title}</h2>
        {message && <p className="text-slate-700">{message}</p>}
        <FormField label={label} error={errors.reason?.message}><textarea rows={4} {...register('reason')} /></FormField>
        {errors.root?.message && <p role="alert" className="text-sm text-red-700 break-words">{errors.root.message}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onCancel} className={btnGhost}>Hủy</button>
          <button type="submit" disabled={isSubmitting} className={btnDanger}>{isSubmitting ? 'Đang xử lý…' : confirmLabel}</button>
        </div>
      </form>
    </div>
  );
}
