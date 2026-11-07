// FR06 T705: nạp bộ cặp gán nhãn, chạy engine thật (compare), tính precision/recall. Không cần DB.
import { readFileSync } from 'node:fs';
import { compare } from '../../src/modules/similarity/engine.js';
import { removeDiacritics } from '../../src/modules/similarity/text.js';
import { DEFAULT_ROUND_CONFIG } from '@nckh/shared';

const load = (f) => JSON.parse(readFileSync(new URL(f, import.meta.url), 'utf8'));
export const topics = load('./topics.json');
export const pairs = load('./pairs.json');
export const synonyms = load('./synonyms.json').map(([term, canonical]) => ({ term, canonical }));
export const thresholds = DEFAULT_ROUND_CONFIG.similarity;

const FIELDS = ['title', 'summary', 'objectives'];
const strip = (t) => ({ ...t, ...Object.fromEntries(FIELDS.map((f) => [f, removeDiacritics(t[f])])), keywords: t.keywords.map(removeDiacritics) });

// ref: id chuỗi, hoặc { of, strip?, ...ghi đè }
export const resolve = (ref, id) => {
  if (typeof ref === 'string') return { ...topics[ref], id };
  const { of, strip: s, ...over } = ref;
  const t = { ...topics[of], ...over };
  return { ...(s ? strip(t) : t), id };
};

// Mô phỏng kho thật: so A với B cùng kho nền (các chủ đề gốc còn lại) để IDF gần thực tế.
export const scorePair = (p) => {
  const a = resolve(p.a, 'A');
  const b = resolve(p.b, 'B');
  const skip = new Set([p.a, typeof p.b === 'string' ? p.b : p.b.of]);
  const background = Object.entries(topics).filter(([k]) => !skip.has(k)).map(([k, t]) => ({ ...t, id: k }));
  const r = compare({ candidate: a, corpus: [b, ...background], thresholds, synonyms, topK: 1000 });
  const m = r.matches.find((x) => x.topicId === 'B');
  return { titleScore: m.titleScore, contentScore: m.contentScore, level: m.level };
};

export const scoreAll = () => pairs.map((p) => ({ ...p, ...scorePair(p) }));

export const metrics = (rows, predict) => {
  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (const r of rows) {
    const y = predict(r);
    if (y && r.label) tp += 1; else if (y) fp += 1; else if (r.label) fn += 1; else tn += 1;
  }
  const precision = tp + fp ? tp / (tp + fp) : 1; // không dự đoán dương nào → quy ước 1
  const recall = tp + fn ? tp / (tp + fn) : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  return { tp, fp, fn, tn, precision, recall, f1 };
};
