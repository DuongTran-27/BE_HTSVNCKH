// Dùng: npm run eval:fr06 -w @nckh/api   (không cần DB; điểm tên mô phỏng pg_trgm bằng trigramSimilarity JS)
import { scoreAll, metrics, thresholds as th } from './lib.js';

const rows = scoreAll();
const pc = (x) => (x * 100).toFixed(1).padStart(5);
const line = (name, m) => `${name.padEnd(34)} TP=${String(m.tp).padStart(2)} FP=${String(m.fp).padStart(2)} FN=${String(m.fn).padStart(2)} TN=${String(m.tn).padStart(2)}  P=${pc(m.precision)}%  R=${pc(m.recall)}%  F1=${pc(m.f1)}%`;
const pos = rows.filter((r) => r.label).length;
console.log(`FR06 eval: ${rows.length} cặp (${pos} trùng, ${rows.length - pos} không trùng)\n`);

console.log('== Ngưỡng đang cấu hình ==');
console.log(line('Cần xem xét trở lên (REVIEW+)', metrics(rows, (r) => r.level !== 'NONE')));
console.log(line('Nghi trùng cao (HIGH)', metrics(rows, (r) => r.level === 'HIGH')));
console.log(`(titleReview=${th.titleReview} titleHigh=${th.titleHigh} contentReview=${th.contentReview} contentHigh=${th.contentHigh})\n`);

const sweep = (title, f) => {
  console.log(`== ${title} ==`);
  for (let t = 0.1; t <= 0.8001; t += 0.05) console.log(line(`ngưỡng ${t.toFixed(2)}`, metrics(rows, (r) => f(r, t))));
  console.log();
};
sweep('Chỉ điểm tên >= t', (r, t) => r.titleScore >= t);
sweep('Chỉ điểm nội dung >= t', (r, t) => r.contentScore >= t);
sweep('Hoặc: tên >= t+0.15 hoặc nội dung >= t (giữ chênh lệch 0.15 như cấu hình)', (r, t) => r.titleScore >= t + 0.15 || r.contentScore >= t);

console.log('== Theo loại cặp (REVIEW+): số cặp / số bị gắn cờ ==');
const kinds = [...new Set(rows.map((r) => r.kind))];
for (const k of kinds) {
  const g = rows.filter((r) => r.kind === k);
  console.log(`${k.padEnd(28)} label=${g[0].label} n=${String(g.length).padStart(2)} gắn cờ=${g.filter((r) => r.level !== 'NONE').length}`);
}

const show = (r) => `  ${r.id} [${r.kind}] tên=${r.titleScore} nd=${r.contentScore} mức=${r.level} - ${r.note}`;
const miss = rows.filter((r) => r.label && r.level === 'NONE');
const falsePos = rows.filter((r) => !r.label && r.level !== 'NONE');
console.log(`\n== FN ở REVIEW+ (bỏ sót): ${miss.length} ==`); miss.forEach((r) => console.log(show(r)));
console.log(`\n== FP ở REVIEW+ (báo nhầm): ${falsePos.length} ==`); falsePos.forEach((r) => console.log(show(r)));
const missHigh = rows.filter((r) => r.label && r.level !== 'HIGH');
console.log(`\n== Trùng nhưng không tới HIGH: ${missHigh.length} (chỉ để tham khảo) ==`);
