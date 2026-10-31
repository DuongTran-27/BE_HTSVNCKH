import { describe, it, expect } from 'vitest';
import { toCsv, escapeCell } from '../src/lib/csv.js';

describe('Xuất CSV (FR14)', () => {
  it('có BOM UTF-8 để Excel hiển thị tiếng Việt', () => {
    expect(toCsv([], [{ key: 'a', header: 'Tên đề tài' }]).charCodeAt(0)).toBe(0xfeff);
  });
  it('chống CSV injection', () => {
    expect(escapeCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(escapeCell('+1')).toBe("'+1");
    expect(escapeCell('@SUM')).toBe("'@SUM");
  });
  it('bọc ô có dấu phẩy, xuống dòng, ngoặc kép', () => {
    expect(escapeCell('a, b')).toBe('"a, b"');
    expect(escapeCell('dòng 1\ndòng 2')).toBe('"dòng 1\ndòng 2"');
  });
  it('số dòng khớp dữ liệu', () => {
    const csv = toCsv([{ a: 1 }, { a: 2 }], [{ key: 'a', header: 'A' }]);
    expect(csv.slice(1).split('\r\n')).toEqual(['A', '1', '2']);
  });
});
