import { SIMILARITY_LEVEL_LABEL } from '@nckh/shared';
import { fmtDateTime } from '../lib/format.js';
import { Badge } from './ui.jsx';

const LEVEL_TONE = { NONE: 'green', REVIEW: 'amber', HIGH: 'red' };
const pct = (x) => `${Math.round((x ?? 0) * 100)}%`;
const isError = (c) => c.status === 'ERROR' || !c.level;

/** Ô mức (UI §4.13): null → Chưa kiểm tra; ERROR/level null → Chưa kiểm tra được; không bao giờ "Không trùng" */
export function SimilarityBadge({ similarity }) {
  if (!similarity) return <Badge>Chưa kiểm tra</Badge>;
  if (isError(similarity)) return <Badge>Chưa kiểm tra được</Badge>;
  return (
    <>
      <Badge tone={LEVEL_TONE[similarity.level]}>{SIMILARITY_LEVEL_LABEL[similarity.level]}</Badge>
      {similarity.isStale && <span className="ml-2 text-sm text-amber-900">Kết quả cũ – nội dung đã đổi sau lần kiểm này</span>}
    </>
  );
}

const Score = ({ label, value }) => (
  <div className="text-sm">
    <span>{label}: {pct(value)}</span>
    <div className="h-2 w-full rounded bg-slate-200" aria-hidden="true"><div className="h-2 rounded bg-slate-600" style={{ width: pct(value) }} /></div>
  </div>
);

function Match({ m }) {
  if (m.hidden) {
    return (
      <li className="rounded-md border border-slate-300 p-3">
        <p className="break-words">{m.note}</p>
        <Score label="Điểm tên" value={m.titleScore} /><Score label="Điểm nội dung" value={m.contentScore} />
        <Badge tone={LEVEL_TONE[m.level]}>{SIMILARITY_LEVEL_LABEL[m.level]}</Badge>
      </li>
    );
  }
  return (
    <li className="rounded-md border border-slate-300 p-3">
      <p className="break-words font-medium">{m.code} – {m.title}</p>
      <p className="text-sm text-slate-700">{m.academicYear}{m.field ? ` · ${m.field}` : ''}{m.status ? ` · ${m.status}` : ''}</p>
      <Score label="Điểm tên" value={m.titleScore} /><Score label="Điểm nội dung" value={m.contentScore} />
      <Badge tone={LEVEL_TONE[m.level]}>{SIMILARITY_LEVEL_LABEL[m.level]}</Badge>
      {m.matchedKeywords?.length > 0 && <p className="mt-1 break-words text-sm">Từ khóa trùng: {m.matchedKeywords.join(', ')}</p>}
    </li>
  );
}

/**
 * Panel kết quả kiểm tra trùng lặp (UI §4.13). check = SimilarityCheckView | null.
 * Vàng = Cần xem xét, đỏ = Nghi trùng cao; top 5 từ server; dòng ẩn chỉ có note + điểm.
 */
export function SimilarityPanel({ check }) {
  if (!check) return <p className="text-slate-700">Chưa kiểm tra lần nào.</p>;
  const err = isError(check);
  const box = err ? 'border-slate-400 bg-slate-50' : { NONE: 'border-green-500 bg-green-50', REVIEW: 'border-amber-500 bg-amber-50', HIGH: 'border-red-600 bg-red-50' }[check.level];
  return (
    <div className={`space-y-3 rounded-md border-2 p-3 ${box}`} data-testid="similarity-panel" data-level={err ? 'ERROR' : check.level}>
      <p className="flex flex-wrap items-center gap-2 font-bold">
        {err ? 'Chưa kiểm tra được' : SIMILARITY_LEVEL_LABEL[check.level]}
        <span className="text-sm font-normal text-slate-700">{fmtDateTime(check.createdAt)}</span>
      </p>
      {err && <p>{check.message ?? 'Chưa kiểm tra được'}. Hệ thống không kết luận hồ sơ có trùng hay không.</p>}
      {check.isStale && <p className="text-sm text-amber-900">Kết quả cũ – nội dung đã đổi sau lần kiểm này</p>}
      {!err && check.level === 'NONE' && <p>Không phát hiện đề tài tương tự đáng kể.</p>}
      {check.matches?.length > 0 && <ul className="space-y-2">{check.matches.slice(0, 5).map((m, i) => <Match key={m.code ?? i} m={m} />)}</ul>}
      {check.justification && (
        <div className="rounded bg-white p-2"><p className="font-medium">Giải trình của nhóm</p><p className="whitespace-pre-wrap break-words">{check.justification}</p></div>
      )}
      <details className="text-sm text-slate-700">
        <summary className="min-h-11 cursor-pointer">Chi tiết kỹ thuật</summary>
        <p>Thuật toán {check.algorithmVersion} · {check.corpusSize} hồ sơ đối chiếu</p>
        {check.thresholds && <p>Ngưỡng tên {pct(check.thresholds.titleReview)}/{pct(check.thresholds.titleHigh)}, nội dung {pct(check.thresholds.contentReview)}/{pct(check.thresholds.contentHigh)}</p>}
      </details>
    </div>
  );
}
