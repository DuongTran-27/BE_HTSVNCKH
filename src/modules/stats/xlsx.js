// Ghi file Excel cho FR39 (GD7 §10.3). Mọi thao tác với exceljs nằm trong file này để thay thư viện được (GD7 §12).
import ExcelJS from 'exceljs';

// Ký tự điều khiển (trừ tab, LF, CR) không hợp lệ trong XML – để nguyên sẽ làm file xlsx hỏng, nên bỏ đi
// eslint-disable-next-line no-control-regex
const XML_INVALID = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;
export const cleanCell = (v) => (typeof v === 'string' ? v.replace(XML_INVALID, '') : v);

// Chống formula injection: ô chuỗi luôn gán `string` thuần (kiểu "s"), không bao giờ `{ formula }`; Excel không tính ô chuỗi
// nên không cần tiền tố như CSV và dữ liệu giữ nguyên (G57). Số giữ kiểu số. Chỉ ghi, không đọc file người dùng.
const addSheet = (wb, name, columns, rows) => {
  const ws = wb.addWorksheet(name);
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 24 }));
  for (const row of rows) ws.addRow(Object.fromEntries(Object.entries(row).map(([k, v]) => [k, cleanCell(v)]))).commit();
  ws.commit();
};

// sheets: [{ name, columns: [{ key, header, width? }], rows }]; ghi stream thẳng vào `stream` (res), không giữ cả file trong bộ nhớ.
export const writeXlsx = async (stream, sheets) => {
  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ stream, useSharedStrings: false });
  for (const s of sheets) addSheet(wb, s.name, s.columns, s.rows);
  await wb.commit();
};
