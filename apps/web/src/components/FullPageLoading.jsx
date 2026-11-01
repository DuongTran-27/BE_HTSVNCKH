import { useEffect, useState } from 'react';

// Màn tải toàn trang lúc khởi động (UI §1.1); > 5 s thì báo máy chủ đang khởi động (Render ngủ, NFR10)
export function FullPageLoading() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setSlow(true), 5000);
    return () => clearTimeout(id);
  }, []);
  return (
    <div role="status" className="flex min-h-screen flex-col items-center justify-center gap-3 p-4 text-center">
      <p className="text-xl font-bold text-blue-800">NCKH Khoa CNTT</p>
      <p className="text-slate-700">Đang tải…</p>
      {slow && <p className="text-sm text-slate-600">Máy chủ đang khởi động, vui lòng chờ…</p>}
    </div>
  );
}

export function FullPageOffline({ onRetry }) {
  return (
    <div role="alert" className="flex min-h-screen flex-col items-center justify-center gap-3 p-4 text-center">
      <p className="text-xl font-bold text-blue-800">NCKH Khoa CNTT</p>
      <p className="text-slate-700">Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.</p>
      <button type="button" onClick={onRetry} className="min-h-11 rounded-md bg-blue-700 px-4 text-white">Thử lại</button>
    </div>
  );
}
