import { matchPath } from 'react-router';

// Trang chủ theo vai trò (UI §2) và kiểm `next` chống open redirect (UI §1.2)
const HOME = { STUDENT: '/de-tai', LECTURER: '/de-nghi-huong-dan', STAFF: '/xet-duyet', ADMIN: '/quan-ly/tai-khoan' };

export const homePath = (role) => HOME[role] ?? '/';

/** Chỉ nhận đường dẫn nội bộ: bắt đầu bằng '/', không '//', không có '\'. Sai → null. */
export const safeNext = (next) => {
  if (typeof next !== 'string' || !next.startsWith('/') || next.startsWith('//') || next.includes('\\') || [...next].some((c) => c <= '\u001f' || c === '\u007f')) return null; // tab/CR/LF bị trình duyệt bỏ: '/\t/x' thành '//x'
  return next;
};

const S = 'STUDENT';
const L = 'LECTURER';
const F = 'STAFF';
const A = 'ADMIN';
// [đường dẫn, vai trò được vào, tiêu đề] – UI §3
export const SCREENS = [
  ['de-tai', [S, L, F], 'Đề tài'],
  ['de-tai/moi', [S], 'Tạo đề tài'],
  ['de-tai/:id', [S, L, F], 'Chi tiết đề tài'],
  ['de-tai/:id/sua', [S], 'Soạn hồ sơ'],
  ['de-tai/:id/nhom', [S, L, F], 'Nhóm'],
  ['de-tai/:id/moi-gvhd', [S], 'Mời giảng viên hướng dẫn'],
  ['de-tai/:id/gui', [S], 'Gửi xét duyệt'],
  ['de-tai/:id/lich-su', [S, L, F], 'Lịch sử'],
  ['de-tai/:id/lan-gui/:seq', [S, L, F], 'Lần gửi'],
  ['de-tai/:id/so-sanh', [S, L, F], 'So sánh các lần gửi'],
  ['de-tai/:id/moc', [S, L, F], 'Mốc thực hiện'],
  ['de-tai/:id/tien-do', [S, L, F], 'Tiến độ'],
  ['de-tai/:id/tai-lieu', [S, L, F], 'Tài liệu'],
  ['de-tai/:id/yeu-cau', [S, L, F], 'Yêu cầu thay đổi'],
  ['yeu-cau', [S, L, F], 'Yêu cầu thay đổi'],
  ['lich-su-tham-gia', [S], 'Lịch sử tham gia'],
  ['lich-su-tham-gia/:topicId', [S], 'Phiên bản đã tham gia'],
  ['loi-moi', [S], 'Lời mời'],
  ['de-nghi-huong-dan', [L, F], 'Đề nghị hướng dẫn'],
  ['xet-duyet', [F], 'Xét duyệt'],
  ['xet-duyet/:id', [F], 'Màn xét duyệt'],
  ['quan-ly/tai-khoan', [A, F], 'Tài khoản'],
  ['quan-ly/tai-khoan/moi', [A, F], 'Tạo tài khoản'],
  ['quan-ly/tai-khoan/nhap-csv', [A, F], 'Nhập tài khoản từ CSV'],
  ['quan-ly/tai-khoan/:id', [A, F], 'Chi tiết tài khoản'],
  ['quan-ly/danh-muc/khoa', [A], 'Danh mục khoa'],
  ['quan-ly/danh-muc/nganh', [A, F], 'Danh mục ngành'],
  ['quan-ly/danh-muc/lop', [A, F], 'Danh mục lớp'],
  ['quan-ly/danh-muc/linh-vuc', [A, F], 'Danh mục lĩnh vực'],
  ['quan-ly/danh-muc/dong-nghia', [F], 'Từ đồng nghĩa'],
  ['quan-ly/dot', [F], 'Đợt'],
  ['quan-ly/dot/moi', [F], 'Tạo đợt'],
  ['quan-ly/dot/:id', [F], 'Chi tiết đợt'],
  ['thong-bao', [S, L, F, A], 'Thông báo'],
  ['thong-ke', [L, F], 'Thống kê'],
  ['kho', [S, L, F, A], 'Kho đề tài'],
  ['kho/:code', [S, L, F, A], 'Chi tiết kho đề tài'],
];

/** Vai trò có vào được đường dẫn này không (theo SCREENS; trang chung như /doi-mat-khau luôn được) */
export const canVisit = (role, path) => {
  const pathname = path.split(/[?#]/)[0];
  if (pathname === '/' || pathname === '/doi-mat-khau') return true;
  const screen = SCREENS.find(([p]) => matchPath(`/${p}`, pathname));
  return Boolean(screen?.[1].includes(role));
};

// Menu theo vai trò (UI §2). Chỉ để dẫn đường, backend vẫn kiểm quyền (FR25)
const STATS = { to: '/thong-ke', label: 'Thống kê' };
const YEU_CAU = { to: '/yeu-cau', label: 'Yêu cầu thay đổi' };
const KHO = { to: '/kho', label: 'Kho đề tài' };
export const MENU = {
  STUDENT: [{ to: '/de-tai', label: 'Đề tài của tôi' }, { to: '/loi-moi', label: 'Lời mời' }, YEU_CAU, { to: '/lich-su-tham-gia', label: 'Lịch sử tham gia' }, KHO],
  LECTURER: [{ to: '/de-nghi-huong-dan', label: 'Đề nghị hướng dẫn' }, { to: '/de-tai', label: 'Đề tài hướng dẫn' }, YEU_CAU, STATS, KHO],
  STAFF: [
    { to: '/xet-duyet', label: 'Xét duyệt' }, { to: '/de-tai', label: 'Đề tài' }, { to: '/de-nghi-huong-dan', label: 'Đề nghị hướng dẫn' },
    { to: '/quan-ly/dot', label: 'Đợt' }, { to: '/quan-ly/tai-khoan', label: 'Tài khoản' },
    { to: '/quan-ly/danh-muc/nganh', label: 'Danh mục' }, YEU_CAU, STATS, KHO,
  ],
  ADMIN: [{ to: '/quan-ly/tai-khoan', label: 'Tài khoản' }, { to: '/quan-ly/danh-muc/khoa', label: 'Danh mục' }, KHO],
};
