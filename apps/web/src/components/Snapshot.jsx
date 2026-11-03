import { ACTION_LABEL } from '@nckh/shared';
import { fmtDateTime } from '../lib/format.js';
import { Badge } from './ui.jsx';

const Block = ({ title, children }) => (
  <div><h3 className="font-bold">{title}</h3><div className="whitespace-pre-wrap break-words text-slate-800">{children}</div></div>
);

/** Nội dung bất biến của một lần gửi (payload, FR17) */
export function SnapshotBody({ payload }) {
  return (
    <div className="space-y-3">
      <h2 className="break-words text-lg font-bold">{payload.title}</h2>
      <Block title="Tóm tắt">{payload.summary || '—'}</Block>
      <Block title="Mục tiêu">{payload.objectives || '—'}</Block>
      <Block title="Lĩnh vực">{payload.fieldName || '—'}</Block>
      <div><h3 className="font-bold">Từ khóa</h3><div className="flex flex-wrap gap-1">{payload.keywords?.length ? payload.keywords.map((k) => <Badge key={k}>{k}</Badge>) : '—'}</div></div>
    </div>
  );
}

/** Quyết định của cán bộ; decision null -> "Chưa xử lý" */
export function DecisionBox({ decision, title = 'Quyết định' }) {
  return (
    <div className="rounded-md border border-slate-300 p-3" data-testid="decision-box">
      <h3 className="font-bold">{title}</h3>
      {decision ? (
        <>
          <p>{ACTION_LABEL[decision.action] ?? decision.action}</p>
          {decision.reason && <p className="whitespace-pre-wrap break-words">Lý do: {decision.reason}</p>}
          <p className="text-sm text-slate-700">{decision.decidedBy?.fullName} · {fmtDateTime(decision.decidedAt)}</p>
        </>
      ) : <p>Chưa xử lý</p>}
    </div>
  );
}
