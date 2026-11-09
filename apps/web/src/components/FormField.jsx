import { cloneElement, useId } from 'react';

// Ô nhập ≥ 16 px (iOS không tự phóng to), vùng chạm ≥ 44 px (UI §8)
export const inputClass = 'block w-full min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2 text-base shadow-sm transition-colors '
  + 'placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-3 focus:ring-blue-600/20 '
  + 'disabled:bg-slate-100 aria-invalid:border-red-600 aria-invalid:ring-red-600/20';

/**
 * Nhãn trên ô + ô (children, một phần tử) + lỗi ngay dưới ô (NFR07).
 * Ví dụ: <FormField label="Mật khẩu" error={errors.password?.message}><input type="password" {...register('password')} /></FormField>
 */
export function FormField({ label, error, hint, children, className = '' }) {
  const autoId = useId();
  const id = children.props.id ?? autoId;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-800">{label}</label>
      {cloneElement(children, {
        id,
        className: children.props.className ?? inputClass,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy,
      })}
      {hint && <p id={hintId} className="mt-1 text-sm text-slate-600">{hint}</p>}
      {error && <p id={errorId} className="mt-1 text-sm text-red-700 break-words">{error}</p>}
    </div>
  );
}
