// FR28: đăng nhập Google – Authorization Code + PKCE phía server (API_GD7 §8). Chỉ vào tài khoản đã có (G54),
// ADMIN chỉ dùng mật khẩu (G60). `google` là OAuth2Client của google-auth-library (test tiêm bản giả, không gọi mạng).
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { ssoCallbackQuerySchema } from '@nckh/shared';
import { missingGoogleEnv } from '../../config/env.js';
import { issueTokens } from './service.js';

export const OAUTH_COOKIE = 'nckh_oauth';
export const OAUTH_TTL_SECONDS = 600;
const NEXT_MAX = 512;

const random = () => randomBytes(32).toString('base64url');
const sameString = (a, b) => {
  const x = Buffer.from(String(a ?? '')), y = Buffer.from(String(b ?? ''));
  return x.length === y.length && timingSafeEqual(x, y);
};
// `next` chỉ là đường nội bộ để FE quay lại; sai dạng thì bỏ (m3 BM). Server không bao giờ chuyển hướng tới nó.
export const safeNext = (v) =>
  typeof v === 'string' && v.length <= NEXT_MAX && v.startsWith('/') && !v.startsWith('//') && !v.includes('\\') ? v : undefined;

export const createSsoService = ({ repo, env, google, logger, now = () => new Date() }) => {
  const enabled = missingGoogleEnv(env).length === 0;
  if (enabled && !google) throw new Error('SSO Google bật nhưng thiếu OAuth2Client');
  // Khóa dẫn xuất riêng: cookie trạng thái không bao giờ hợp lệ như access token và ngược lại
  const stateKey = createHmac('sha256', env.JWT_ACCESS_SECRET).update('oauth-state').digest();
  const redirectUri = `${env.PUBLIC_APP_URL}/api/auth/google/callback`;
  const domains = env.GOOGLE_ALLOWED_DOMAINS ?? [];

  const fail = (code, emailDomain) => {
    logger?.info({ ssoError: code, emailDomain }, 'Đăng nhập Google thất bại');
    return { error: code };
  };

  return {
    enabled,
    appUrl: env.PUBLIC_APP_URL,

    start(nextRaw) {
      const state = random(), nonce = random(), codeVerifier = random();
      const next = safeNext(nextRaw);
      const cookie = jwt.sign({ state, nonce, codeVerifier, ...(next && { next }) }, stateKey, { algorithm: 'HS256', expiresIn: OAUTH_TTL_SECONDS });
      const url = google.generateAuthUrl({
        response_type: 'code',
        scope: 'openid email profile',
        redirect_uri: redirectUri,
        state,
        nonce,
        code_challenge: createHash('sha256').update(codeVerifier).digest('base64url'),
        code_challenge_method: 'S256',
        prompt: 'select_account',
        ...(domains.length === 1 && { hd: domains[0] }), // chỉ là gợi ý cho màn chọn tài khoản, không phải kiểm tra
      });
      return { url, cookie };
    },

    // Trả { error: MÃ } hoặc { issued, next }. Không ném lỗi nghiệp vụ: route luôn 302 về trang.
    async callback({ query, stateCookie, ip, userAgent }) {
      const q = ssoCallbackQuerySchema.safeParse(query);
      if (!q.success) return fail('STATE_MISMATCH');
      if (q.data.error) return fail('CANCELLED');
      let saved;
      try { saved = jwt.verify(String(stateCookie ?? ''), stateKey, { algorithms: ['HS256'] }); } catch { return fail('STATE_MISMATCH'); }
      if (!q.data.code || !q.data.state || !sameString(q.data.state, saved.state)) return fail('STATE_MISMATCH');

      let payload;
      try {
        const { tokens } = await google.getToken({ code: q.data.code, codeVerifier: saved.codeVerifier, redirect_uri: redirectUri });
        if (!tokens?.id_token) throw new Error('Thiếu id_token');
        payload = (await google.verifyIdToken({ idToken: tokens.id_token, audience: env.GOOGLE_CLIENT_ID })).getPayload();
      } catch (e) {
        logger?.warn({ ssoError: 'GOOGLE_ERROR', errName: e?.name }, 'Không đổi được mã Google lấy ID token'); // không log thông điệp Google
        return { error: 'GOOGLE_ERROR' };
      }
      if (!payload || !sameString(payload.nonce, saved.nonce)) return fail('STATE_MISMATCH');

      const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : '';
      const emailDomain = email.slice(email.lastIndexOf('@') + 1) || undefined;
      if (payload.email_verified !== true) return fail('EMAIL_NOT_VERIFIED', emailDomain);
      // hd do Google ký chứng nhận tài khoản Workspace; đuôi email phải đúng hd (chặn x@truong.vn.attacker.com)
      if (!email.includes('@') || typeof payload.hd !== 'string' || !domains.includes(payload.hd) || emailDomain !== payload.hd) {
        return fail('DOMAIN_NOT_ALLOWED', emailDomain);
      }

      const found = await repo.findUsersByEmailInsensitive(email);
      if (found.length > 1) logger?.error({ emailDomain, count: found.length }, 'SSO: nhiều tài khoản trùng email (không phân biệt hoa thường)');
      if (found.length !== 1) return fail('NO_ACCOUNT', emailDomain);
      const [user] = found;
      if (user.role === 'ADMIN') return fail('PASSWORD_ONLY', emailDomain);
      const blocked = (u) => !u || u.isLocked || (u.lockedUntil && u.lockedUntil > now()) || u.role === 'ADMIN';
      if (blocked(user)) return fail('ACCOUNT_LOCKED', emailDomain);

      // Như đăng nhập mật khẩu (m1 BM): khóa SHARE dòng User, đọc lại, rồi mới cấp phiên; khóa tài khoản song song
      // hoặc chờ phiên này commit rồi thu hồi, hoặc commit trước và phiên này thấy isLocked.
      const issued = await repo.transaction(async (r) => {
        await r.lockUser(user.id, true);
        const fresh = await r.findUserById(user.id);
        if (blocked(fresh)) return null;
        const out = await issueTokens(r, fresh, { env, now, userAgent });
        await r.recordAudit({ actorId: fresh.id, action: 'LOGIN_SSO', entityType: 'User', entityId: fresh.id, after: { provider: 'google' }, ip });
        return out;
      });
      if (!issued) return fail('ACCOUNT_LOCKED', emailDomain);
      return { issued, next: saved.next };
    },
  };
};
