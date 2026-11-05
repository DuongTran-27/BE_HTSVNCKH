import { Link } from 'react-router';
import { btnPrimary } from './ui.jsx';
import { AdvisingActions } from './AdvisingActions.jsx';
import { StudentActions } from './StudentActions.jsx';
import { CLOSE_ACTIONS, CloseActions } from './CloseActions.jsx';

const STUDENT = ['REQUEST_ADVISOR', 'WITHDRAW_ADVISOR_REQUEST', 'SUBMIT_FOR_REVIEW', 'RESUBMIT'];

/**
 * Thanh hành động R6 (UI §5.1). Nút lấy từ topic.availableActions của server, không tự suy.
 * T306: action GV; T305: action SV; T307: nút "Xét duyệt" dẫn sang R17; T406: đóng đề tài (FR27). Action chưa có UI thì bỏ qua.
 */
export function TopicActionBar({ topic }) {
  const advising = topic.availableActions.filter((a) => a === 'ACCEPT_ADVISING' || a === 'DECLINE_ADVISING');
  const student = topic.availableActions.filter((a) => STUDENT.includes(a));
  const review = topic.availableActions.includes('APPROVE');
  const close = topic.availableActions.filter((a) => CLOSE_ACTIONS.includes(a));
  if (advising.length === 0 && student.length === 0 && !review && close.length === 0) return null;
  return (
    <div className="mt-4 flex flex-wrap gap-2 max-sm:sticky max-sm:bottom-0 max-sm:bg-white max-sm:py-2" role="group" aria-label="Hành động">
      {advising.length > 0 && <AdvisingActions topic={topic} actions={advising} />}
      {review && <Link to={`/xet-duyet/${topic.id}`} className={btnPrimary}>Xét duyệt</Link>}
      {student.length > 0 && <StudentActions topic={topic} actions={student} />}
      {close.length > 0 && <CloseActions topic={topic} actions={close} />}
    </div>
  );
}
