import { useState } from 'react';
import { Link } from 'react-router';
import { FINAL_RESULT_LABEL, TOPIC_STATUS_LABEL } from '@nckh/shared';
import { useAuth } from '../../lib/auth.js';
import { fmtDateTime } from '../../lib/format.js';
import { Badge } from '../../components/ui.jsx';
import { useSimilarityLatest } from '../../lib/queries.js';
import { ExecTabs, TopicQuery } from '../../components/ExecShell.jsx';
import { ResultSection } from '../../components/ResultSection.jsx';
import { TopicActionBar } from '../../components/TopicActionBar.jsx';
import { SimilarityBadge, SimilarityPanel } from '../../components/SimilarityPanel.jsx';

const NOTICE_STATUSES = ['DRAFT', 'WAITING_ADVISOR', 'HAS_ADVISOR'];
const Block = ({ title, children }) => (
  <div><h2 className="font-bold">{title}</h2><div className="whitespace-pre-wrap break-words text-slate-800">{children}</div></div>
);

// R6 – API_GD2 §5.1
export function TopicDetailPage() {
  return <section><TopicQuery>{(t) => <TopicDetail topic={t} />}</TopicQuery></section>;
}

function TopicDetail({ topic: t }) {
  const { user } = useAuth();
  const sub = t.latestSubmission;
  const decision = sub?.decision;
  const showReason = (t.status === 'NEEDS_REVISION' || t.status === 'REJECTED') && decision;
  // UI §5.3 ngoại lệ 2: GV chưa là GVHD không đọc được lịch sử (API §8.4)
  const canHistory = !(user.role === 'LECTURER' && t.advisor?.id !== user.id);
  const max = t.round.effectiveConfig?.maxMembers;
  const [showSim, setShowSim] = useState(false);
  const sim = useSimilarityLatest(t.id, showSim);
  return (
    <div className="space-y-4">
      <header>
        <p className="text-sm text-slate-700">{t.code}</p>
        <h1 className="break-words text-xl font-bold">{t.title || '(Chưa đặt tên)'}</h1>
        <p className="mt-1 space-x-2 text-sm">
          <Badge>{TOPIC_STATUS_LABEL[t.status] ?? t.status}</Badge>
          <span>{t.round.name} – {t.round.academicYear}</span>
          {t.field && <span>· {t.field.name}</span>}
          {t.currentResult && <span>· Kết quả: {FINAL_RESULT_LABEL[t.currentResult.result]}</span>}
        </p>
        <div className="mt-2"><ExecTabs topic={t} /></div>
      </header>

      {showReason && (
        <div role="note" className="rounded-md border-2 border-amber-500 bg-amber-50 p-3">
          <p className="font-bold">{t.status === 'REJECTED' ? 'Đề tài bị từ chối' : 'Cần chỉnh sửa'}</p>
          <p className="whitespace-pre-wrap break-words">{decision.reason}</p>
          <p className="mt-1 text-sm text-slate-700">{decision.decidedBy?.fullName} · {fmtDateTime(decision.decidedAt)}</p>
        </div>
      )}
      {t.status === 'WAITING_ADVISOR' && t.pendingAdvisorRequest && (
        <p role="note" className="rounded-md bg-blue-50 p-3">
          Đang chờ {t.pendingAdvisorRequest.lecturer.fullName} phản hồi – {t.pendingAdvisorRequest.pendingDays} ngày
        </p>
      )}
      {t.round.registrationOpen === false && NOTICE_STATUSES.includes(t.status) && (
        <p role="note" className="rounded-md bg-amber-50 p-3 text-amber-900">Đã hết thời gian đăng ký của đợt – không gửi đề nghị/gửi xét duyệt được</p>
      )}
      {t.status === 'WAITING_CLOSE' && (
        <p role="note" className="rounded-md bg-blue-50 p-3">Đang chờ cán bộ khoa xác nhận đóng đề tài – không sửa được mốc, tiến độ, tài liệu, kết quả.</p>
      )}
      {t.status === 'UNDER_REVIEW' && sub && (
        <p role="note" className="rounded-md bg-blue-50 p-3">
          Đang chờ cán bộ xét duyệt – lần gửi {sub.seq} lúc {fmtDateTime(sub.createdAt)}; hạn xét duyệt {fmtDateTime(t.round.reviewDeadline)}
        </p>
      )}

      <Block title="Tóm tắt">{t.summary || '—'}</Block>
      <Block title="Mục tiêu">{t.objectives || '—'}</Block>
      <div>
        <h2 className="font-bold">Từ khóa</h2>
        <div className="flex flex-wrap gap-1">{t.keywords.length ? t.keywords.map((k) => <Badge key={k}>{k}</Badge>) : '—'}</div>
      </div>
      <Block title="Giảng viên hướng dẫn">{t.advisor?.fullName ?? 'Chưa có'}</Block>
      <div>
        <h2 className="font-bold">Nhóm ({t.members.length}{max ? `/${max}` : ''})</h2>
        <ul className="list-disc pl-5">
          {t.members.map((m) => <li key={m.userId}>{m.fullName} ({m.code}){m.role === 'LEADER' && ' – trưởng nhóm'}</li>)}
        </ul>
        <Link to={`/de-tai/${t.id}/nhom`} className="text-blue-800 underline">Quản lý nhóm</Link>
      </div>
      <div>
        <h2 className="font-bold">Kiểm tra trùng lặp</h2>
        <SimilarityBadge similarity={t.latestSimilarity} />
        {t.latestSimilarity && (
          <button type="button" className="ml-2 min-h-11 text-blue-800 underline" aria-expanded={showSim} onClick={() => setShowSim((v) => !v)}>
            {showSim ? 'Ẩn chi tiết' : 'Xem chi tiết'}
          </button>
        )}
        {showSim && <div className="mt-2">{sim.isPending ? <p role="status">Đang tải…</p> : sim.isError ? <p role="alert" className="text-red-800">{sim.error.message}</p> : <SimilarityPanel check={sim.data} />}</div>}
      </div>
      <p className="space-x-4">
        {sub && <Link to={`/de-tai/${t.id}/lan-gui/${sub.seq}`} className="text-blue-800 underline">Lần gửi gần nhất (lần {sub.seq})</Link>}
        {canHistory && <Link to={`/de-tai/${t.id}/lich-su`} className="text-blue-800 underline">Lịch sử</Link>}
        {t.permissions?.edit && <Link to={`/de-tai/${t.id}/sua`} className="text-blue-800 underline">Sửa hồ sơ</Link>}
      </p>
      <ResultSection topic={t} />
      <TopicActionBar topic={t} />
    </div>
  );
}
