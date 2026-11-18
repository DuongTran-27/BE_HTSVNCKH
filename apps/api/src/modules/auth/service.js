// FR01: đăng nhập, làm mới phiên (xoay vòng + phát hiện dùng lại), đăng xuất, đổi mật khẩu.
import { randomUUID } from 'node:crypto';
import { unauthorized, badRequest, AppError } from '../../lib/errors.js';
import { sha256, newOpaqueToken, signAccessToken } from '../../lib/tokens.js';

export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;

// Cấp refresh token (họ mới nếu không truyền `family`) + access token. Dùng chung cho đăng nhập mật khẩu, refresh và SSO
// (API_GD7 §8.2); gọi trong transaction đã khóa SHARE dòng User (`r` là repo trên tx).
export const issueTokens = async (r, user, { env, now = () => new Date(), family = randomUUID(), userAgent } = {}) => {
  const refreshToken = newOpaqueToken();
  const record = await r.createRefreshToken({
    userId: user.id,
    tokenHash: sha256(refreshToken),
    family,
    userAgent: userAgent ?? null,
    expiresAt: new Date(now().getTime() + env.REFRESH_TOKEN_TTL_DAYS * 86400e3),
  });
  const accessToken = signAccessToken(user, { secret: env.JWT_ACCESS_SECRET, ttlSeconds: env.ACCESS_TOKEN_TTL_SECONDS });
  return { accessToken, refreshToken, refreshRecord: record, user: publicUser(user) };
};

export const createAuthService = ({ repo, hasher, env, now = () => new Date() }) => {

  // Hash giả cùng tham số Argon2id: tài khoản không tồn tại vẫn tốn một lần verify (chống dò tài khoản qua thời gian)
  let dummyHash;

  return {
    async login({ identifier, password, userAgent }) {
      const user = await repo.findUserByIdentifier(identifier.trim().toLowerCase());
      // Thông báo chung, không tiết lộ tài khoản có tồn tại hay không
      const generic = unauthorized('Mã/email hoặc mật khẩu không đúng');
      if (!user) {
        // Băm lỗi thì bỏ cache để lần sau thử lại, không 500 vĩnh viễn
        dummyHash ??= hasher.hash(newOpaqueToken()).catch((e) => { dummyHash = undefined; throw e; });
        await hasher.verify(await dummyHash, password);
        throw generic;
      }
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
      // Cấp token dưới khóa SHARE dòng User và kiểm lại: reset/khóa/đổi mật khẩu commit trong lúc băm Argon2 thì từ chối
      const issued = await repo.transaction(async (r) => {
        await r.lockUser(user.id, true);
        const fresh = await r.findUserById(user.id);
        if (!fresh || fresh.isLocked || fresh.passwordHash !== user.passwordHash) return null;
        return issueTokens(r, fresh, { env, now, userAgent });
      });
      if (!issued) throw generic;
      return issued;
    },

    // Refresh và logout cùng họ phiên chạy TUẦN TỰ nhờ khóa tư vấn theo họ (repo.withFamilyLock): đóng khe hai lần xoay
    // xen kẽ (T205). Việc thu hồi họ phải COMMIT trước khi từ chối, nên trong khóa chỉ trả `deny`, ném lỗi sau khi commit.
    async refresh({ refreshToken, userAgent }) {
      if (!refreshToken) throw unauthorized();
      const hash = sha256(refreshToken);
      const first = await repo.findRefreshTokenByHash(hash);
      if (!first) throw unauthorized();
      const out = await repo.withFamilyLock(first.family, async (r) => {
        const record = await r.findRefreshTokenByHash(hash); // đọc lại dưới khóa
        if (!record) return { deny: 'Phiên đăng nhập không hợp lệ' };
        if (record.revokedAt) {
          // Token đã dùng/thu hồi bị đem dùng lại → nghi bị đánh cắp: thu hồi cả họ phiên
          await r.revokeFamily(record.family, now());
          return { deny: 'Phiên đã bị thu hồi, vui lòng đăng nhập lại' };
        }
        if (record.expiresAt <= now()) return { deny: 'Phiên đã hết hạn' };
        await r.lockUser(record.userId, true); // chặn reset/khóa/đổi mật khẩu thu hồi hụt token đang cấp
        const user = await r.findUserById(record.userId);
        if (!user || user.isLocked) {
          await r.revokeFamily(record.family, now());
          return { deny: 'Phiên đăng nhập không hợp lệ' };
        }
        // Tạo token mới rồi xoay token cũ có điều kiện (revokedAt còn null); thất bại (vd khóa tài khoản thu hồi
        // giữa chừng) thì thu hồi cả họ, kể cả token vừa tạo (BUG-002).
        const issued = await issueTokens(r, user, { env, now, family: record.family, userAgent });
        if (!(await r.revokeToken(record.id, now(), issued.refreshRecord.id))) {
          await r.revokeFamily(record.family, now());
          return { deny: 'Phiên đã bị thu hồi, vui lòng đăng nhập lại' };
        }
        return { issued };
      });
      if (out.deny) throw unauthorized(out.deny);
      return out.issued;
    },

    async logout({ refreshToken }) {
      if (!refreshToken) return;
      const record = await repo.findRefreshTokenByHash(sha256(refreshToken));
      if (!record) return;
      // Kể cả token đã xoay vòng: thu hồi cả họ để token mới hơn cũng chết (BUG-002). Dưới khóa họ, mọi lần xoay
      // đã commit trước hoặc chờ sau, nên một UPDATE đủ.
      await repo.withFamilyLock(record.family, (r) => r.revokeFamily(record.family, now()));
    },

    async changePassword({ userId, currentPassword, newPassword, refreshToken }) {
      const user = await repo.findUserById(userId);
      if (!user) throw unauthorized();
      if (!(await hasher.verify(user.passwordHash, currentPassword))) {
        throw badRequest('WRONG_PASSWORD', 'Mật khẩu hiện tại không đúng');
      }
      if (currentPassword === newPassword) throw badRequest('SAME_PASSWORD', 'Mật khẩu mới phải khác mật khẩu cũ');
      const newHash = await hasher.hash(newPassword);
      const current = refreshToken ? await repo.findRefreshTokenByHash(sha256(refreshToken)) : null;
      // Cập nhật + thu hồi phiên khác trong một transaction khóa dòng User: refresh đang cấp token phải xong trước
      const changed = await repo.transaction(async (r) => {
        await r.lockUser(userId, false);
        const fresh = await r.findUserById(userId);
        if (!fresh || fresh.passwordHash !== user.passwordHash) return false; // mật khẩu vừa bị đổi/reset song song
        await r.updateUser(userId, { passwordHash: newHash, mustChangePassword: false });
        await r.revokeAllForUser(userId, now(), current?.family ?? null); // giữ phiên hiện tại
        return true;
      });
      if (!changed) throw badRequest('WRONG_PASSWORD', 'Mật khẩu hiện tại không đúng');
    },
  };
};

export const publicUser = (u) => ({
  id: u.id, code: u.code, email: u.email, fullName: u.fullName, role: u.role,
  facultyId: u.facultyId ?? null, mustChangePassword: u.mustChangePassword,
  staffFacultyIds: u.role === 'STAFF' ? (u.staffScopes ?? []).map((s) => s.facultyId) : [],
});
