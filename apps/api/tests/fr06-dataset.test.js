import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { pairs, topics, scorePair, scoreAll, metrics, synonyms } from './fr06-eval/lib.js';

// TC-FR06-90..93: dữ liệu thực nghiệm hợp lệ (không đo chất lượng engine - việc đó là `npm run eval:fr06`).
describe('FR06 bộ thực nghiệm', () => {
  it('TC-FR06-90 có >= 100 cặp, id duy nhất, nhãn 0/1, cân bằng 30-70%', () => {
    expect(pairs.length).toBeGreaterThanOrEqual(100);
    expect(new Set(pairs.map((p) => p.id)).size).toBe(pairs.length);
    pairs.forEach((p) => { expect([0, 1]).toContain(p.label); expect(p.note?.length).toBeGreaterThan(5); expect(p.kind).toBeTruthy(); });
    const pos = pairs.filter((p) => p.label).length / pairs.length;
    expect(pos).toBeGreaterThanOrEqual(0.3);
    expect(pos).toBeLessThanOrEqual(0.7);
  });
  it('TC-FR06-91 mọi tham chiếu chủ đề tồn tại và đủ trường', () => {
    const ids = (r) => (typeof r === 'string' ? r : r.of);
    pairs.forEach((p) => { expect(topics[ids(p.a)]).toBeDefined(); expect(topics[ids(p.b)]).toBeDefined(); });
    Object.values(topics).forEach((t) => { expect(t.title && t.summary && t.objectives).toBeTruthy(); expect(t.keywords.length).toBeGreaterThan(0); });
  });
  it('TC-FR06-92 có đủ các nhóm ca khó', () => {
    const kinds = new Set(pairs.map((p) => p.kind));
    ['khong-dau', 'dong-nghia', 'doi-thu-tu', 'dien-dat-lai', 'loi-go', 'cung-linh-vuc-khac-de-tai'].forEach((k) => expect(kinds).toContain(k));
  });
  it('TC-FR06-93 engine chạy được trên mọi cặp, điểm trong [0,1], level hợp lệ, tất định, recall >= 80% ở REVIEW+ (ngưỡng đặc tả mục 3; điểm tên là mô phỏng JS của pg_trgm)', () => {
    pairs.forEach((p) => {
      const s = scorePair(p);
      expect(s.titleScore).toBeGreaterThanOrEqual(0); expect(s.titleScore).toBeLessThanOrEqual(1);
      expect(s.contentScore).toBeGreaterThanOrEqual(0); expect(s.contentScore).toBeLessThanOrEqual(1);
    });
    expect(scorePair(pairs[0])).toEqual(scorePair(pairs[0]));
    const rows = scoreAll();
    rows.forEach((r) => expect(['NONE', 'REVIEW', 'HIGH']).toContain(r.level));
    expect(metrics(rows, (r) => r.level !== 'NONE').recall).toBeGreaterThanOrEqual(0.8);
  });
  it('TC-FR06-94 synonyms.json khớp SYNONYMS trong prisma/seed.js (đọc văn bản, không import seed)', () => {
    const src = readFileSync(new URL('../prisma/seed.js', import.meta.url), 'utf8');
    const block = src.match(/const SYNONYMS = \[([\s\S]*?)\r?\n\];/)?.[1];
    expect(block).toBeTruthy();
    const seeded = [...block.matchAll(/\[\s*'([^']+)'\s*,\s*'([^']+)'\s*\]/g)].map((m) => ({ term: m[1], canonical: m[2] }));
    expect(seeded.length).toBeGreaterThan(0);
    expect(synonyms).toEqual(seeded);
  });
});
