import { unauthorized, forbidden } from '../lib/errors.js';
import { verifyAccessToken } from '../lib/tokens.js';
import { publicUser } from '../modules/auth/service.js';

// Nạp lại user mỗi request để tài khoản bị khóa bị chặn ngay ở lần gọi kế tiếp (FR01)
export const createRequireAuth = ({ env, loadUser }) => async (req, _res, next) => {
  const header = req.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw unauthorized();
  let payload;
  try { payload = verifyAccessToken(token, env.JWT_ACCESS_SECRET); } catch { throw unauthorized(); }
  const user = await loadUser(payload.sub);
  if (!user || user.isLocked) throw unauthorized();
  req.user = publicUser(user);
  next();
};

// Phân quyền theo vai trò; quyền theo quan hệ đề tài kiểm tra trong service (FR25)
export const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user || !roles.includes(req.user.role)) throw forbidden();
  next();
};
