// T201: phần thuần logic của scripts/db-test.js (chọn trình, so kỳ vọng K1–K7) + kiểm K1–K7 trên DB test thật.
import { describe, it, expect, vi } from 'vitest';
import { pickDriver, CHECKS, urlFor } from '../scripts/db-test.js';

describe('pickDriver', () => {
  it('ép bằng biến thì dùng đúng trình, không dò docker', () => {
    const probe = vi.fn();
    for (const d of ['docker', 'embedded', 'external']) expect(pickDriver(d, probe)).toBe(d);
    expect(probe).not.toHaveBeenCalled();
  });
  it('giá trị biến sai → lỗi', () => {
    expect(() => pickDriver('abc', () => ({ status: 0 }))).toThrow(/không hợp lệ/);
  });
  it('docker info thoát 0 → docker', () => {
    expect(pickDriver(undefined, () => ({ status: 0 }))).toBe('docker');
  });
  it('docker info thoát ≠0, hết giờ hoặc không có lệnh → embedded', () => {
    expect(pickDriver(undefined, () => ({ status: 1 }))).toBe('embedded');
    expect(pickDriver('', () => ({ status: null, error: Object.assign(new Error('t'), { code: 'ETIMEDOUT' }) }))).toBe('embedded');
    expect(pickDriver(undefined, () => ({ status: null, error: Object.assign(new Error('x'), { code: 'ENOENT' }) }))).toBe('embedded');
  });
});

describe('CHECKS K1–K7', () => {
  const judge = (id, rows, db = 'nckh_test') => CHECKS.find((k) => k.id === id && k.db === db).judge(rows)[0];
  it('đủ 8 phép (K4 ở hai DB)', () => {
    expect(CHECKS.map((k) => k.id)).toEqual(['K1', 'K2', 'K3', 'K4', 'K4', 'K5', 'K6', 'K7']);
  });
  it('K1 chỉ nhận bản 16', () => {
    expect(judge('K1', [{ v: 160014 }])).toBe(true);
    expect(judge('K1', [{ v: 150010 }])).toBe(false);
    expect(judge('K1', [{ v: 170000 }])).toBe(false);
  });
  it('K2, K3 so giá trị chính xác', () => {
    expect(judge('K2', [{ v: 'Asia/Ho_Chi_Minh' }])).toBe(true);
    expect(judge('K2', [{ v: 'Asia/Bangkok' }])).toBe(false);
    expect(judge('K3', [{ v: 'UTF8' }])).toBe(true);
    expect(judge('K3', [{ v: 'WIN1258' }])).toBe(false);
  });
  it('K4 cần đủ pg_trgm và unaccent ở mỗi DB', () => {
    const both = [{ extname: 'pg_trgm', extversion: '1.6' }, { extname: 'unaccent', extversion: '1.1' }];
    expect(judge('K4', both)).toBe(true);
    expect(judge('K4', both, 'template1')).toBe(true);
    expect(judge('K4', both.slice(0, 1), 'template1')).toBe(false);
    expect(judge('K4', [])).toBe(false);
  });
  it('K5, K6 kiểm bỏ dấu cả chữ Đ', () => {
    expect(judge('K5', [{ v: 'De tai Nghien cuu' }])).toBe(true);
    expect(judge('K5', [{ v: 'Đe tai Nghien cuu' }])).toBe(false);
    expect(judge('K6', [{ v: 1 }])).toBe(true);
    expect(judge('K6', [{ v: 0.82 }])).toBe(false);
    expect(judge('K6', [])).toBe(false);
  });
  it('K7 chỉ ghi nhận nhưng phải có một dòng', () => {
    expect(judge('K7', [{ datcollate: 'C', datctype: 'C', low: 'Đề' }])).toBe(true);
    expect(judge('K7', [])).toBe(false);
  });
});

// Chạy THẬT trên DB test (DATABASE_URL từ .env.test hoặc CI). Không có cơ chế skip:
// DB chưa bật thì test FAIL kèm hướng dẫn, để không bao giờ "xanh" mà chưa kiểm DB.
describe('DB test thật: pg_trgm, unaccent, timezone (K1–K7)', () => {
  it.each(CHECKS.map((k) => [`${k.id} ${k.label}`, k]))('%s', async (_name, k) => {
    const { PrismaClient } = await import('@prisma/client');
    const client = new PrismaClient({ datasourceUrl: urlFor(new URL(process.env.DATABASE_URL), k.db) });
    try {
      const rows = await client.$queryRawUnsafe(k.sql).catch((e) => {
        throw new Error(`Không truy vấn được DB test (${k.db}). Chạy "npm run db:test:up" rồi "npm run db:test:reset". Lỗi gốc: ${e.message}`);
      });
      const [pass, shown] = k.judge(rows);
      expect(pass, `${k.id} = ${shown}`).toBe(true);
    } finally { await client.$disconnect(); }
  });
});
