import { AdvisingActions } from './AdvisingActions.jsx';

/**
 * Thanh hành động R6 (UI §5.1). Nút lấy từ topic.availableActions của server, không tự suy.
 * Chủ T306: action GV. T305 gắn thêm action SV, T307 gắn nút "Xét duyệt" vào đây; action chưa có UI thì bỏ qua.
 */
export function TopicActionBar({ topic }) {
  const advising = topic.availableActions.filter((a) => a === 'ACCEPT_ADVISING' || a === 'DECLINE_ADVISING');
  if (advising.length === 0) return null;
  return (
    <div className="mt-4 flex flex-wrap gap-2 max-sm:sticky max-sm:bottom-0 max-sm:bg-white max-sm:py-2" role="group" aria-label="Hành động">
      <AdvisingActions topic={topic} actions={advising} />
    </div>
  );
}
