// Đo FR06 với điểm tên từ pg_trgm thật của PostgreSQL (cùng biểu thức prismaRepo.loadCorpus), thay mô phỏng JS.
// Chỉ SELECT hàm, không đọc/ghi bảng. Số liệu in ra dùng cho báo cáo khoa học (TRUY_VET §5 hạn chế 1).
import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { pairs, resolve, scoreAll, metrics } from './fr06-eval/lib.js';

const prisma = new PrismaClient();
afterAll(() => prisma.$disconnect());

const pgTitleScore = async (a, b) => {
  const [{ s }] = await prisma.$queryRaw`SELECT similarity(lower(immutable_unaccent(${b})), lower(immutable_unaccent(${a})))::float8 AS s`;
  return Math.round(s * 1000) / 1000; // engine làm tròn điểm 3 chữ số
};

describe('FR06 với pg_trgm thật', () => {
  it('TC-FR06-95 điểm tên pg_trgm: recall REVIEW+ vẫn >= 80%; in so sánh với mô phỏng JS', async () => {
    const pg = {};
    for (const p of pairs) pg[p.id] = await pgTitleScore(resolve(p.a, 'A').title, resolve(p.b, 'B').title);
    const js = scoreAll();
    const real = scoreAll(pg);
    const diffs = js.map((r, i) => Math.abs(r.titleScore - real[i].titleScore));
    const changed = real.filter((r, i) => r.level !== js[i].level);
    const pc = (x) => `${(x * 100).toFixed(1)}%`;
    const show = (name, rows, f) => { const m = metrics(rows, f); return `${name}: TP=${m.tp} FP=${m.fp} FN=${m.fn} TN=${m.tn} P=${pc(m.precision)} R=${pc(m.recall)}`; };
    console.info([
      `FR06 pg_trgm thật – ${pairs.length} cặp`,
      `Chênh điểm tên |pg − JS|: trung bình ${(diffs.reduce((a, b) => a + b, 0) / diffs.length).toFixed(3)}, lớn nhất ${Math.max(...diffs).toFixed(3)}; số cặp đổi mức: ${changed.length}${changed.length ? ` (${changed.map((r) => r.id).join(', ')})` : ''}`,
      show('JS  REVIEW+', js, (r) => r.level !== 'NONE'), show('pg  REVIEW+', real, (r) => r.level !== 'NONE'),
      show('JS  HIGH   ', js, (r) => r.level === 'HIGH'), show('pg  HIGH   ', real, (r) => r.level === 'HIGH'),
    ].join('\n'));
    real.forEach((r) => expect(['NONE', 'REVIEW', 'HIGH']).toContain(r.level));
    expect(metrics(real, (r) => r.level !== 'NONE').recall).toBeGreaterThanOrEqual(0.8);
  }, 60000);
});
