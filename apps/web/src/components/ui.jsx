import { useState } from 'react';

export const btn = 'inline-flex min-h-11 items-center justify-center rounded-md px-4 font-medium disabled:opacity-60';
export const btnPrimary = `${btn} bg-blue-700 text-white`;
export const btnGhost = `${btn} border border-slate-300 bg-white`;
export const btnDanger = `${btn} bg-red-700 text-white`;

/** Trạng thái đang tải / lỗi (error.message từ API) / dữ liệu; empty: nội dung khi rỗng (UI §6) */
export function QueryBox({ query, empty, isEmpty, children }) {
  if (query.isPending) return <p role="status" className="text-slate-700">Đang tải…</p>;
  if (query.isError) {
    return (
      <div role="alert" className="rounded-md bg-red-50 p-3 text-red-800">
        <p className="break-words">{query.error.message}</p>
        <button type="button" onClick={() => query.refetch()} className={`${btnGhost} mt-2`}>Thử lại</button>
      </div>
    );
  }
  if (empty && isEmpty?.(query.data)) return <p className="text-slate-700">{empty}</p>;
  return children(query.data);
}

export function Badge({ children, tone = 'slate' }) {
  const t = { slate: 'bg-slate-200 text-slate-800', green: 'bg-green-100 text-green-900', amber: 'bg-amber-100 text-amber-900', red: 'bg-red-100 text-red-900' }[tone];
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${t}`}>{children}</span>;
}

export function ConfirmDialog({ title, message, confirmLabel = 'Xác nhận', danger, busy, error, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-md rounded-lg bg-white p-4 shadow-lg">
        <h2 className="text-lg font-bold">{title}</h2>
        <p className="mt-2 text-slate-700">{message}</p>
        {error && <p role="alert" className="mt-2 text-sm text-red-700 break-words">{error}</p>}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onCancel} className={btnGhost}>Hủy</button>
          <button type="button" onClick={onConfirm} disabled={busy} className={danger ? btnDanger : btnPrimary}>{busy ? 'Đang xử lý…' : confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

/** Hộp mật khẩu tạm (UI §4.20): chỉ giữ ở props/state cục bộ của trang gọi, không vào cache */
export function TempPasswordBox({ password, onClose }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div role="alertdialog" aria-label="Mật khẩu tạm" className="rounded-md border border-amber-400 bg-amber-50 p-4">
      <h2 className="font-bold">Mật khẩu tạm</h2>
      <p className="mt-2 break-all rounded bg-white p-2 font-mono text-lg" data-testid="temp-password">{password}</p>
      <p className="mt-2 text-sm text-red-800">Mật khẩu chỉ hiện một lần. Người dùng phải đổi mật khẩu ở lần đăng nhập đầu.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={copy} className={btnGhost}>{copied ? 'Đã sao chép' : 'Sao chép'}</button>
        <button type="button" onClick={onClose} className={btnPrimary}>Đóng</button>
      </div>
    </div>
  );
}

export function Pager({ page, pageSize, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className={btnGhost}>Trang trước</button>
      <span>Trang {page}/{pages} ({total} mục)</span>
      <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} className={btnGhost}>Trang sau</button>
    </div>
  );
}

/** Nhóm checkbox chọn nhiều theo id; value là mảng id */
export function CheckGroup({ legend, options, value = [], onChange, error }) {
  const toggle = (id) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium text-slate-800">{legend}</legend>
      <div className="flex flex-wrap gap-x-4">
        {options.map((o) => (
          <label key={o.id} className="inline-flex min-h-11 items-center gap-2">
            <input type="checkbox" checked={value.includes(o.id)} onChange={() => toggle(o.id)} className="size-5" />
            {o.label}
          </label>
        ))}
      </div>
      {error && <p className="mt-1 text-sm text-red-700 break-words">{error}</p>}
    </fieldset>
  );
}

/** <select> đồng bộ nhãn tiếng Việt; options: [{value,label}] */
export const opt = (items, valueKey = 'id', label = (i) => i.name) => items.map((i) => ({ value: i[valueKey], label: label(i) }));
export function Options({ options, placeholder }) {
  return (
    <>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </>
  );
}

/** Lỗi cấp form (errors.root) – hiện trên nút gửi (UI §6) */
export const FormError = ({ error }) => (error ? <p role="alert" className="text-sm text-red-700 break-words">{error}</p> : null);
