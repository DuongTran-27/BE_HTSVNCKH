import { Link } from 'react-router';
import { useAuth } from '../lib/auth.js';
import { homePath } from '../lib/nav.js';

function Notice({ title }) {
  const { user } = useAuth();
  return (
    <section className="py-8 text-center">
      <h1 className="text-xl font-bold">{title}</h1>
      <Link to={homePath(user?.role)} className="mt-4 inline-flex min-h-11 items-center rounded-md bg-blue-700 px-4 font-medium text-white">
        Về trang chủ
      </Link>
    </section>
  );
}

export const Forbidden = () => <Notice title="Bạn không có quyền truy cập trang này" />;
export const NotFound = () => <Notice title="Không tìm thấy trang" />;
