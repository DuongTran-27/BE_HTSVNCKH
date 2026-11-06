import { Link, NavLink, useParams } from 'react-router';
import { TOPIC_STATUS_LABEL } from '@nckh/shared';
import { useTopic } from '../lib/queries.js';
import { EXEC_STATUSES } from '../lib/execution.js';
import { QueryBox, btnGhost } from './ui.jsx';

/** Tải đề tài theo :id; 403/404 hiện tại chỗ (UI §4.6), lỗi khác qua QueryBox */
export function TopicQuery({ children }) {
  const { id } = useParams();
  const query = useTopic(id);
  const status = query.error?.status;
  if (status === 403 || status === 404) {
    return (
      <div role="alert" className="rounded-md bg-red-50 p-3 text-red-800">
        <p>{status === 403 ? 'Bạn không có quyền xem đề tài này' : 'Không tìm thấy đề tài'}</p>
        <Link to="/de-tai" className={`${btnGhost} mt-2`}>Về danh sách đề tài</Link>
      </div>
    );
  }
  return <QueryBox query={query}>{children}</QueryBox>;
}

const tab = ({ isActive }) => `inline-flex min-h-11 items-center rounded-md px-3 ${isActive ? 'bg-blue-700 text-white' : 'border border-slate-300 bg-white'}`;

/** Tab thực hiện của đề tài (UI §2.7). Hiện theo permissions.readExecution của server */
export function ExecTabs({ topic: t }) {
  if (!t.permissions?.readExecution) return null;
  const exec = EXEC_STATUSES.includes(t.status);
  const base = `/de-tai/${t.id}`;
  return (
    <nav aria-label="Thực hiện đề tài" className="flex flex-wrap gap-2">
      <NavLink end to={base} className={tab}>Thông tin</NavLink>
      {exec && <NavLink to={`${base}/moc`} className={tab}>Mốc</NavLink>}
      {exec && <NavLink to={`${base}/tien-do`} className={tab}>Tiến độ</NavLink>}
      <NavLink to={`${base}/tai-lieu`} className={tab}>Tài liệu</NavLink>
      <NavLink to={`${base}/yeu-cau`} className={tab}>Yêu cầu</NavLink>
    </nav>
  );
}

/** Khung chung của tab Mốc / Tiến độ / Tài liệu */
export function ExecShell({ title, children }) {
  return (
    <section>
      <TopicQuery>
        {(t) => (
          <div className="space-y-4">
            <header className="space-y-2">
              <p className="break-words text-sm text-slate-700">{t.code} · {TOPIC_STATUS_LABEL[t.status] ?? t.status}</p>
              <h1 className="break-words text-xl font-bold">{title}</h1>
              <ExecTabs topic={t} />
            </header>
            {children(t)}
          </div>
        )}
      </TopicQuery>
    </section>
  );
}
