// Xử lý văn bản tiếng Việt + tiếng Anh cho FR06 (mục 3 đặc tả).

export const removeDiacritics = (s) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');

// Chữ thường, NFC, bỏ dấu câu, gộp khoảng trắng. Giữ dấu tiếng Việt.
export const normalize = (s = '') =>
  s.normalize('NFC').toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Từ dừng phổ biến (rút gọn, mở rộng được). Không chứa từ chuyên môn.
export const STOPWORDS = new Set([
  'và', 'của', 'cho', 'các', 'những', 'một', 'là', 'với', 'trong', 'trên', 'theo', 'để', 'được', 'có', 'không',
  'này', 'đó', 'khi', 'từ', 'đến', 'về', 'như', 'nhằm', 'bằng', 'tại', 'thì', 'mà', 'nên', 'cũng', 'đã', 'sẽ',
  'đang', 'hay', 'hoặc', 'nhiều', 'ra', 'vào', 'lại', 'qua', 'việc', 'nhất', 'rất', 'giúp', 'đề', 'tài', 'nghiên', 'cứu',
  'the', 'a', 'an', 'of', 'and', 'or', 'for', 'to', 'in', 'on', 'with', 'by', 'is', 'are', 'using', 'based',
]);

// Từ điển đồng nghĩa: cụm dài thay trước; dạng chuẩn nối bằng "_" để thành 1 token.
export const applySynonyms = (text, synonyms = []) => {
  if (!synonyms.length) return text;
  // Cả dạng chuẩn cũng phải quy về cùng token, nếu không "học sâu" gốc sẽ lệch với "deep learning" đã thay.
  const pairs = synonyms.flatMap(({ term, canonical }) => [{ term, canonical }, { term: canonical, canonical }]);
  const sorted = pairs
    .map(({ term, canonical }) => ({ term: normalize(term), canonical: normalize(canonical).replace(/\s+/g, '_') }))
    .filter((x) => x.term)
    .sort((a, b) => b.term.length - a.term.length);
  let out = ` ${text} `;
  for (const { term, canonical } of sorted) {
    for (let k = 0; k < 2; k += 1) out = out.split(` ${term} `).join(` ${canonical} `);
  }
  return out.trim();
};

// Âm tiết đơn + cặp âm tiết liền nhau (sau khi bỏ từ dừng).
export const tokenize = (text, synonyms = []) => {
  const words = applySynonyms(normalize(text), synonyms).split(' ').filter((w) => w && !STOPWORDS.has(w));
  const grams = [...words];
  for (let i = 0; i < words.length - 1; i += 1) grams.push(`${words.at(i)} ${words.at(i + 1)}`);
  return grams;
};

// Mô phỏng pg_trgm.similarity() – dùng cho test và khi không có database.
const trigramsOfWord = (w) => {
  const padded = `  ${w} `;
  const out = [];
  for (let i = 0; i < padded.length - 2; i += 1) out.push(padded.slice(i, i + 3));
  return out;
};
export const trigramSet = (s) => {
  const set = new Set();
  removeDiacritics(normalize(s)).split(' ').filter(Boolean)
    .forEach((w) => trigramsOfWord(w).forEach((t) => set.add(t)));
  return set;
};
export const trigramSimilarity = (a, b) => {
  const A = trigramSet(a), B = trigramSet(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter += 1;
  return inter / (A.size + B.size - inter);
};
