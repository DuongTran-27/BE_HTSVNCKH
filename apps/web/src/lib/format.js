// Giờ Việt Nam cố định +07:00 (không có giờ mùa hè) – UI §1.4, CLAUDE.md quy tắc 8
const TZ = 'Asia/Ho_Chi_Minh';
const OFFSET_MS = 7 * 3600 * 1000;

export const fmtDateTime = (iso) => (iso
  ? new Date(iso).toLocaleString('vi-VN', { timeZone: TZ, hour12: false, dateStyle: 'short', timeStyle: 'short' })
  : '');

/** ISO bất kỳ -> giá trị cho <input type="datetime-local"> theo giờ Việt Nam */
export const toLocalInput = (iso) => (iso ? new Date(new Date(iso).getTime() + OFFSET_MS).toISOString().slice(0, 16) : '');

/** 'YYYY-MM-DDTHH:mm' (giờ VN) -> ISO có +07:00; rỗng giữ rỗng để schema báo lỗi */
export const fromLocalInput = (v) => (v ? `${v}:00+07:00` : '');

/** Tải chuỗi CSV xuống máy (đã qua toCsv) */
export const downloadCsv = (text, filename) => {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

export const qs = (params) => {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v !== undefined && v !== null && v !== '' && p.set(k, v));
  const s = p.toString();
  return s ? `?${s}` : '';
};
