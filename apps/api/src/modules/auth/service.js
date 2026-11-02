// FR01: đăng nhập, làm mới phiên (xoay vòng + phát hiện dùng lại), đăng xuất, đổi mật khẩu.
import { randomUUID } from 'node:crypto';
import { unauthorized, badRequest, AppError } from '../../lib/errors.js';
import { sha256, newOpaqueToken, signAccessToken } from '../../lib/tokens.js';

export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;

export const createAuthService = ({ repo, hasher, env, now = () => new Date() }) => {
  const issueTokens = async (user, { family = randomUUID(), userAgent } = {}) => {
    const refreshToken = newOpaqueToken();
    const record = await repo.createRefreshToken({
      userId: user.id,
      tokenHash: sha256(refreshToken),
      family,
      userAgent: userAgent ?? null,
      expiresAt: new Date(now().getTime() + env.REFRESH_TOKEN_TTL_DAYS * 86400e3),
    });
    const accessToken = signAccessToken(user, { secret: env.JWT_ACCESS_SECRET, ttlSeconds: env.ACCESS_TOKEN_TTL_SECONDS });
    return { accessToken, refreshToken, refreshRecord: record, user: publicUser(user) };
  };

  return {
    async login({ identifier, password, userAgent }) {
      const user = await repo.findUserByIdentifier(identifier.trim().toLowerCase());
      // Thông báo chung, không tiết lộ tài khoản có tồn tại hay không
      const generic = unauthorized('Mã/email hoặc mật khẩu không đúng');
      if (!user) throw generic;
      if (user.isLocked) throw new AppError(403, 'ACCOUNT_LOCKED', 'Tài khoản đã bị khóa');
      if (user.lockedUntil && user.lockedUntil > now()) {
        throw new AppError(429, 'TEMP_LOCKED', 'Đăng nhập sai quá nhiều lần, vui lòng thử lại sau');
      }
      const ok = await hasher.verify(user.passwordHash, password);
      if (!ok) {
        const failed = user.failedLogins + 1;
        const lock = failed >= MAX_FAILED_LOGINS;
        await repo.updateUser(user.id, {
          failedLogins: lock ? 0 : failed,
          lockedUntil: lock ? new Date(now().getTime() + LOCK_MINUTES * 60e3) : user.lockedUntil,
        });
        throw generic;
      }
      if (user.failedLogins || user.lockedUntil) await repo.updateUser(user.id, { failedLogins: 0, lockedUntil: null });
      return issueTokens(user, { userAgent });
    },

    async refresh({ refreshToken, userAgent }) {
      if (!refreshToken) throw unauthorized();
      const record = await repo.findRefreshTokenByHash(sha256(refreshToken));
      if (!record) throw unauthorized();
      if (record.revokedAt) {
        // Token đã dùng/thu hồi bị đem dùng lại → nghi bị đánh cắp: thu hồi cả họ phiên
        await repo.revokeFamily(record.family, now());
        throw unauthorized('Phiên đã bị thu hồi, vui lòng đăng nhập lại');
      }
      if (record.expiresAt <= now()) throw unauthorized('Phiên đã hết hạn');
      const user = await repo.findUserById(record.userId);
      if (!user || user.isLocked) {
        await repo.revokeFamily(record.family, now());
        throw unauthorized();
      }
      // Tạo token mới TRƯỚC rồi mới xoay token cũ có điều kiện (revokedAt còn null): nếu logout/refresh khác
      // đã thu hồi token cũ trong lúc này thì thu hồi cả họ (gồm token vừa tạo) – tránh phiên hồi sinh sau logout (BUG-002).
      const issued = await issueTokens(user, { family: record.family, userAgent });
      if (!(await repo.revokeToken(record.id, now(), issued.refreshRecord.id))) {
        await repo.revokeFamily(record.family, now());
        throw unauthorized('Phiên đã bị thu hồi, vui lòng đăng nhập lại');
      }
      return issued;
    },

    async logout({ refreshToken }) {
      if (!refreshToken) return;
      const record = await repo.findRefreshTokenByHash(sha256(refreshToken));
      if (!record) return;
      // Kể cả token đã xoay vòng: thu hồi cả họ để token mới hơn (refresh chạy song song) cũng chết (BUG-002).
      // Gọi hai lần (T205): lệnh UPDATE đầu lấy snapshot trước khi refresh song song commit token mới N, chờ khóa
      // dòng token cũ rồi bỏ qua nó (CAS đã thu hồi) và không thấy N; lệnh thứ hai có snapshot mới nên thấy N.
      await repo.revokeFamily(record.family, now());
      await repo.revokeFamily(record.family, now());
    },

    async changePassword({ userId, currentPassword, newPassword, refreshToken }) {
      const user = await repo.findUserById(userId);
      if (!user) throw unauthorized();
      if (!(await hasher.verify(user.passwordHash, currentPassword))) {
        throw badRequest('WRONG_PASSWORD', 'Mật khẩu hiện tại không đúng');
      }
      if (currentPassword === newPassword) throw badRequest('SAME_PASSWORD', 'Mật khẩu mới phải khác mật khẩu cũ');
      await repo.updateUser(userId, { passwordHash: await hasher.hash(newPassword), mustChangePassword: false });
      // Thu hồi mọi phiên khác, giữ phiên hiện tại
      const current = refreshToken ? await repo.findRefreshTokenByHash(sha256(refreshToken)) : null;
      await repo.revokeAllForUser(userId, now(), current?.family ?? null);
    },
  };
};

export const publicUser = (u) => ({
  id: u.id, code: u.code, email: u.email, fullName: u.fullName, role: u.role,
  facultyId: u.facultyId ?? null, mustChangePassword: u.mustChangePassword,
});
