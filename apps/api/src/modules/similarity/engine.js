// TF-IDF + cosine thuần JavaScript (không cần Python service).
import { createHash } from 'node:crypto';
import { tokenize, trigramSimilarity } from './text.js';

export const ALGORITHM_VERSION = 'tfidf-bigram-v1+trgm';

// Nội dung đem so: tóm tắt + mục tiêu + từ khóa (từ khóa nhân trọng số 2)
export const contentOf = (t) =>
  [t.summary ?? '', t.objectives ?? '', ...(t.keywords ?? []), ...(t.keywords ?? [])].join(' ');

export const contentHash = (t) =>
  createHash('sha256').update(JSON.stringify([t.title, t.summary, t.objectives, t.keywords])).digest('hex');

const termFreq = (tokens) => {
  const tf = new Map();
  tokens.forEach((x) => tf.set(x, (tf.get(x) ?? 0) + 1));
  const n = tokens.length || 1;
  for (const [k, v] of tf) tf.set(k, v / n);
  return tf;
};

export const buildIdf = (docsTokens) => {
  const df = new Map();
  docsTokens.forEach((tokens) => new Set(tokens).forEach((x) => df.set(x, (df.get(x) ?? 0) + 1)));
  const N = docsTokens.length;
  const idf = new Map();
  for (const [k, v] of df) idf.set(k, Math.log((N + 1) / (v + 1)) + 1);
  return { idf, N };
};

const vectorize = (tokens, idf) => {
  const vec = new Map();
  for (const [k, tf] of termFreq(tokens)) vec.set(k, tf * (idf.get(k) ?? 1));
  return vec;
};

export const cosine = (a, b) => {
  let dot = 0, na = 0, nb = 0;
  for (const [k, v] of a) { na += v * v; if (b.has(k)) dot += v * b.get(k); }
  for (const v of b.values()) nb += v * v;
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
};

export const levelOf = (titleScore, contentScore, th) => {
  if (titleScore >= th.titleHigh || contentScore >= th.contentHigh) return 'HIGH';
  if (titleScore >= th.titleReview || contentScore >= th.contentReview) return 'REVIEW';
  return 'NONE';
};

const round3 = (x) => Math.round(x * 1000) / 1000;
const RANK = { NONE: 0, REVIEW: 1, HIGH: 2 };

/**
 * So một hồ sơ với kho.
 * corpus: [{id, code, title, summary, objectives, keywords, titleScore?}]
 *   titleScore có sẵn nếu đã tính bằng pg_trgm trong database; nếu không, tính bằng JS.
 */
export const compare = ({ candidate, corpus, thresholds, synonyms = [], topK = 5 }) => {
  const candTokens = tokenize(contentOf(candidate), synonyms);
  const corpusTokens = corpus.map((d) => tokenize(contentOf(d), synonyms));
  const { idf } = buildIdf([candTokens, ...corpusTokens]);
  const candVec = vectorize(candTokens, idf);

  const scored = corpus.map((d, i) => {
    const titleScore = d.titleScore ?? trigramSimilarity(candidate.title, d.title);
    const contentScore = cosine(candVec, vectorize(corpusTokens.at(i), idf));
    return {
      topicId: d.id,
      code: d.code,
      titleScore: round3(titleScore),
      contentScore: round3(contentScore),
      level: levelOf(titleScore, contentScore, thresholds),
    };
  });
  scored.sort((a, b) => Math.max(b.titleScore, b.contentScore) - Math.max(a.titleScore, a.contentScore));
  const matches = scored.slice(0, topK);
  const level = matches.reduce((acc, m) => (RANK[m.level] > RANK[acc] ? m.level : acc), 'NONE');
  return { level, matches, corpusSize: corpus.length, algorithmVersion: ALGORITHM_VERSION };
};
