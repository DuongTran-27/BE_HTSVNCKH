// Trang chủ theo vai trò (UI §2) và kiểm `next` chống open redirect (UI §1.2)
const HOME = { STUDENT: '/de-tai', LECTURER: '/de-nghi-huong-dan', STAFF: '/xet-duyet', ADMIN: '/quan-ly/tai-khoan' };

export const homePath = (role) => HOME[role] ?? '/';

/** Chỉ nhận đường dẫn nội bộ: bắt đầu bằng '/', không '//', không có '\'. Sai → null. */
export const safeNext = (next) => {
  if (typeof next !== 'string' || !next.startsWith('/') || next.startsWith('//') || next.includes('\\') || [...next].some((c) => c <= '\u001f' || c === '\u007f')) return null; // tab/CR/LF bị trình duyệt bỏ: '/\t/x' thành '//x'
  return next;
};
