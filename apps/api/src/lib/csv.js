// Xuất CSV cho Excel: UTF-8 có BOM + chống CSV injection (FR14).
const BOM = '\uFEFF';
const DANGEROUS = /^[=+\-@\t\r]/;

export const escapeCell = (value) => {
  if (value === null || value === undefined) return '';
  let s = value instanceof Date ? value.toISOString() : String(value);
  if (DANGEROUS.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
};

/** columns: [{key, header}] */
export const toCsv = (rows, columns) => {
  const head = columns.map((c) => escapeCell(c.header)).join(',');
  const body = rows.map((r) => columns.map((c) => escapeCell(r[c.key])).join(','));
  return BOM + [head, ...body].join('\r\n');
};
