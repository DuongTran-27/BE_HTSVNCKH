// Trang chủ theo vai trò (UI §2) và kiểm `next` chống open redirect (UI §1.2)
const HOME = { STUDENT: '/de-tai', LECTURER: '/de-nghi-huong-dan', STAFF: '/xet-duyet', ADMIN: '/quan-ly/tai-khoan' };

export const homePath = (role) => HOME[role] ?? '/';

/** Chỉ nhận đường dẫn nội bộ: bắt đầu bằng '/', không '//', không có '\'. Sai → null. */
export const safeNext = (next) => {
  if (typeof next !== 'string' || !next.startsWith('/') || next.startsWith('//') || next.includes('\\') || [...next].some((c) => c <= '\u001f' || c === '\u007f')) return null; // tab/CR/LF bị trình duyệt bỏ: '/\t/x' thành '//x'
  return next;
};

// Chờ ROLE_LABEL của shared (T206); đổi sang import khi có
export const ROLE_LABEL = { STUDENT: 'Sinh viên', LECTURER: 'Giảng viên', STAFF: 'Cán bộ khoa', ADMIN: 'Quản trị viên' };

// Menu theo vai trò (UI §2). Chỉ để dẫn đường, backend vẫn kiểm quyền (FR25)
const KHO = { to: '/kho', label: 'Kho đề tài' };
export const MENU = {
  STUDENT: [{ to: '/de-tai', label: 'Đề tài của tôi' }, { to: '/loi-moi', label: 'Lời mời' }, KHO],
  LECTURER: [{ to: '/de-nghi-huong-dan', label: 'Đề nghị hướng dẫn' }, { to: '/de-tai', label: 'Đề tài hướng dẫn' }, KHO],
  STAFF: [
    { to: '/xet-duyet', label: 'Xét duyệt' }, { to: '/de-tai', label: 'Đề tài' }, { to: '/de-nghi-huong-dan', label: 'Đề nghị hướng dẫn' },
    { to: '/quan-ly/dot', label: 'Đợt' }, { to: '/quan-ly/tai-khoan', label: 'Tài khoản' },
    { to: '/quan-ly/danh-muc/nganh', label: 'Danh mục' }, KHO,
  ],
  ADMIN: [{ to: '/quan-ly/tai-khoan', label: 'Tài khoản' }, { to: '/quan-ly/danh-muc/khoa', label: 'Danh mục' }, KHO],
};
