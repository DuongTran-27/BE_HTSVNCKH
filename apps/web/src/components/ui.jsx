import { useEffect, useRef, useState } from 'react';
import { AlertCircle, ChevronLeft, ChevronRight, Inbox, KeyRound, Loader2 } from 'lucide-react';

export const btn = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium shadow-sm transition-colors '
  + 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:pointer-events-none disabled:opacity-50';
export const btnPrimary = `${btn} bg-blue-700 text-white hover:bg-blue-800`;
export const btnGhost = `${btn} border border-slate-300 bg-white text-slate-800 hover:bg-slate-100`;
export const btnDanger = `${btn} bg-red-700 text-white hover:bg-red-800`;
export const card = 'rounded-xl border border-slate-300 bg-white p-4 shadow-sm sm:p-5';
export const tableFrame = 'overflow-x-auto rounded-xl border border-slate-300 bg-white shadow-sm';
/** Chữ tắt cho ô avatar: chữ đầu của 2 từ cuối họ tên ("Nguyễn Thị Minh Anh" → "MA") */
export const initials = (name = '') => name.trim().split(/\s+/).slice(-2).map((w) => w[0]).join('').toUpperCase();

/** Đầu trang: tiêu đề + mô tả ngắn bên trái, nút thao tác chính bên phải */
export function PageHeader({ title, description, children }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="break-words text-2xl font-semibold">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

/** Trạng thái đang tải / lỗi (error.message từ API) / dữ liệu; empty: nội dung khi rỗng (UI §6) */
export function QueryBox({ query, empty, isEmpty, children }) {
  if (query.isPending) return <p role="status" className="flex items-center gap-2 py-6 text-slate-600"><Loader2 aria-hidden="true" className="size-4 animate-spin" />Đang tải…</p>;
  if (query.isError) {
    return (
      <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
        <p className="flex items-start gap-2 break-words"><AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{query.error.message}</p>
        <button type="button" onClick={() => query.refetch()} className={`${btnGhost} mt-2`}>Thử lại</button>
      </div>
    );
  }
  if (empty && isEmpty?.(query.data)) return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-slate-600">
      <Inbox aria-hidden="true" className="size-8 text-slate-400" />
      <p>{empty}</p>
    </div>
  );
  return children(query.data);
}

/** Màu nhãn trạng thái đề tài: chờ người khác = blue, cần sinh viên xử lý = amber, đang chạy = green, kết thúc xấu = red */
export const STATUS_TONE = {
  WAITING_ADVISOR: 'blue', HAS_ADVISOR: 'blue', UNDER_REVIEW: 'blue', WAITING_CLOSE: 'blue',
  NEEDS_REVISION: 'amber', IN_PROGRESS: 'green', REJECTED: 'red',
};

export function Badge({ children, tone = 'slate' }) {
  const t = {
    slate: 'bg-slate-100 text-slate-700 ring-slate-500/20', green: 'bg-green-50 text-green-800 ring-green-600/20',
    amber: 'bg-amber-50 text-amber-900 ring-amber-600/25', red: 'bg-red-50 text-red-800 ring-red-600/20',
    blue: 'bg-blue-50 text-blue-800 ring-blue-700/20',
  }[tone];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${t}`}>{children}</span>;
}

const FOCUSABLE = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Hộp thoại truy cập được: focus vào phần tử đầu tiên khi mở, Tab/Shift+Tab xoay vòng trong hộp,
 * Esc gọi onEscape (bỏ qua nếu không truyền), đóng thì trả focus về nút đã mở. Trả ref gắn vào hộp.
 */
export function useDialogA11y(onEscape) {
  const ref = useRef(null);
  const esc = useRef(onEscape);
  esc.current = onEscape;
  useEffect(() => {
    const box = ref.current;
    const opener = document.activeElement;
    box?.querySelector(FOCUSABLE)?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape' && esc.current) { e.preventDefault(); esc.current(); return; }
      if (e.key !== 'Tab' || !box) return;
      const items = [...box.querySelectorAll(FOCUSABLE)];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (!box.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); if (opener?.isConnected) opener.focus(); };
  }, []);
  return ref;
}

export function ConfirmDialog({ title, message, confirmLabel = 'Xác nhận', danger, busy, error, onConfirm, onCancel }) {
  const ref = useDialogA11y(onCancel);
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-slate-600">{message}</p>
        {error && <p role="alert" className="mt-2 text-sm text-red-700 break-words">{error}</p>}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
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
    <div role="alertdialog" aria-label="Mật khẩu tạm" className="rounded-xl border border-amber-300 bg-amber-50 p-5">
      <h2 className="flex items-center gap-2 font-semibold"><KeyRound aria-hidden="true" className="size-4" />Mật khẩu tạm</h2>
      <p className="mt-2 break-all rounded-md border border-amber-200 bg-white p-3 font-mono text-lg tracking-wider" data-testid="temp-password">{password}</p>
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
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
      <span className="text-slate-600">Trang {page}/{pages} ({total} mục)</span>
      <div className="flex gap-2">
        <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className={btnGhost}><ChevronLeft aria-hidden="true" className="size-4" />Trang trước</button>
        <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} className={btnGhost}>Trang sau<ChevronRight aria-hidden="true" className="size-4" /></button>
      </div>
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
            <input type="checkbox" checked={value.includes(o.id)} onChange={() => toggle(o.id)} className="size-5 accent-blue-700" />
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
