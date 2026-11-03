import { Link, useLocation, useParams } from 'react-router';
import { fmtDateTime } from '../../lib/format.js';
import { useSubmission, useSubmissions, useTopic } from '../../lib/queries.js';
import { DecisionBox, SnapshotBody } from '../../components/Snapshot.jsx';
import { SimilarityPanel } from '../../components/SimilarityPanel.jsx';
import { ReviewActions } from '../../components/ReviewActions.jsx';
import { QueryBox } from '../../components/ui.jsx';

// R17 – FR07, FR17. Quyết định luôn gắn với lần gửi mới nhất của đề tài (latestSubmission)
export function ReviewPage() {
  const { id } = useParams();
  const topic = useTopic(id);
  const seq = topic.data?.latestSubmission?.seq;
  const sub = useSubmission(id, seq, !!seq);
  const prev = useSubmission(id, seq ? seq - 1 : undefined, seq > 1);
  const list = useSubmissions(id, !!seq);
  const back = useLocation().state?.from ?? '/xet-duyet';

  return (
    <section>
      <Link to={back} className="inline-flex min-h-11 items-center text-blue-800 underline">← Hàng chờ xét duyệt</Link>
      <QueryBox query={topic}>
        {(t) => (!t.latestSubmission
          ? <p role="note" className="rounded-md bg-amber-50 p-3">Hồ sơ chưa được gửi xét duyệt lần nào.</p>
          : (
            <QueryBox query={sub}>
              {(s) => (
                <div className="space-y-4">
                  <header>
                    <p className="text-sm text-slate-700">{t.code}</p>
                    <h1 className="text-xl font-bold">Xét duyệt – lần gửi {s.seq}</h1>
                    <p className="text-sm text-slate-700">
                      Gửi lúc {fmtDateTime(s.createdAt)} bởi {s.createdBy?.fullName} · Hạn xét duyệt {fmtDateTime(t.round.reviewDeadline)}
                      {list.data && ` · Tổng ${list.data.length} lần gửi`}
                    </p>
                    <p className="space-x-4">
                      {s.seq > 1 && <Link to={`/de-tai/${id}/so-sanh?from=${s.seq - 1}&to=${s.seq}`} className="text-blue-800 underline">So sánh với lần gửi trước</Link>}
                      <Link to={`/de-tai/${id}/lich-su`} className="text-blue-800 underline">Lịch sử</Link>
                    </p>
                  </header>
                  {t.status !== 'UNDER_REVIEW' && <p role="note" className="rounded-md bg-blue-50 p-3">Hồ sơ không còn ở trạng thái chờ xét duyệt.</p>}
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-3">
                      <SnapshotBody payload={s.payload} />
                      <div>
                        <h3 className="font-bold">Nhóm</h3>
                        <ul className="list-disc pl-5">{t.members.map((m) => <li key={m.userId}>{m.fullName} ({m.code}){m.role === 'LEADER' && ' – trưởng nhóm'}</li>)}</ul>
                        <p>GVHD: {t.advisor?.fullName ?? 'Chưa có'}</p>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <h3 className="font-bold">Kiểm tra trùng lặp</h3>
                      <SimilarityPanel check={s.similarityCheck} />
                      {s.seq > 1 && prev.data && <DecisionBox decision={prev.data.decision} title="Quyết định lần trước" />}
                      {s.decision && <DecisionBox decision={s.decision} />}
                      <ReviewActions topic={t} submission={s} backTo={back} />
                    </div>
                  </div>
                </div>
              )}
            </QueryBox>
          ))}
      </QueryBox>
    </section>
  );
}
