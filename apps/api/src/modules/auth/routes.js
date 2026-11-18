import { Router } from 'express';
import { loginSchema, changePasswordSchema } from '@nckh/shared';
import { validate } from '../../middlewares/validate.js';
import { createLimiter } from '../../middlewares/rateLimit.js';
import { notFound } from '../../lib/errors.js';
import { OAUTH_COOKIE, OAUTH_TTL_SECONDS } from './ssoService.js';

export const REFRESH_COOKIE = 'nckh_rt';

export const authRouter = ({ authService, ssoService, requireAuth, env }) => {
  const r = Router();
  // Cookie chỉ gửi tới /api/auth; cùng domain nhờ rewrite /api của Vercel (NFR01)
  const cookieOpts = {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 86400e3,
  };
  // Không đếm lần đăng nhập đúng: sinh viên chung NAT không chặn nhau; dò mật khẩu từng tài khoản đã có TEMP_LOCKED
  const loginLimiter = createLimiter({ windowMs: 15 * 60e3, limit: 20, keyBy: 'ip', skipSuccessfulRequests: true });
  const changePasswordLimiter = createLimiter({ windowMs: 15 * 60e3, limit: 5, keyBy: 'user' });

  // Rộng rãi: nhiều tab/SPA cùng NAT làm mới phiên thường xuyên; chỉ chặn lạm dụng
  const sessionLimiter = () => createLimiter({ windowMs: 15 * 60e3, limit: 300, keyBy: 'ip' });
  const refreshLimiter = sessionLimiter();
  const logoutLimiter = sessionLimiter();

  // SSO Google (FR28, API_GD7 §8): start mức phiên 300/15 phút/IP; callback chỉ đếm lần thất bại (luôn 302 nên tự báo qua res.locals)
  const ssoStartLimiter = sessionLimiter();
  const ssoCallbackLimiter = createLimiter({
    windowMs: 15 * 60e3, limit: 20, keyBy: 'ip', skipSuccessfulRequests: true,
    requestWasSuccessful: (_req, res) => res.locals.ssoOk === true,
  });
  const oauthCookieOpts = { httpOnly: true, secure: env.NODE_ENV === 'production', sameSite: 'lax', path: '/api/auth/google' };
  // Tắt → 404 chuẩn, trước limiter để không lộ header RateLimit
  const ssoOn = (_req, _res, next) => { if (!ssoService.enabled) throw notFound('Không tìm thấy đường dẫn'); next(); };

  const send = (res, issued) => {
    res.cookie(REFRESH_COOKIE, issued.refreshToken, cookieOpts);
    res.json({ accessToken: issued.accessToken, user: issued.user });
  };

  r.post('/login', loginLimiter, validate(loginSchema), async (req, res) => {
    send(res, await authService.login({ ...req.body, userAgent: req.get('user-agent') }));
  });

  r.post('/refresh', refreshLimiter, async (req, res) => {
    try {
      send(res, await authService.refresh({ refreshToken: req.cookies?.[REFRESH_COOKIE], userAgent: req.get('user-agent') }));
    } catch (e) {
      // Chỉ phiên không hợp lệ (401) mới xóa cookie; 409 hết lock_timeout giữ nguyên phiên để client thử lại
      if (e?.status === 401) res.clearCookie(REFRESH_COOKIE, { path: cookieOpts.path });
      throw e;
    }
  });

  r.post('/logout', logoutLimiter, async (req, res) => {
    await authService.logout({ refreshToken: req.cookies?.[REFRESH_COOKIE] });
    res.clearCookie(REFRESH_COOKIE, { path: cookieOpts.path });
    res.status(204).end();
  });

  r.post('/change-password', requireAuth, changePasswordLimiter, validate(changePasswordSchema), async (req, res) => {
    await authService.changePassword({ userId: req.user.id, ...req.body, refreshToken: req.cookies?.[REFRESH_COOKIE] });
    res.status(204).end();
  });

  r.get('/providers', (_req, res) => res.json({ google: ssoService.enabled }));

  r.get('/google/start', ssoOn, ssoStartLimiter, (req, res) => {
    const { url, cookie } = ssoService.start(req.query.next);
    res.cookie(OAUTH_COOKIE, cookie, { ...oauthCookieOpts, maxAge: OAUTH_TTL_SECONDS * 1000 });
    res.redirect(302, url);
  });

  r.get('/google/callback', ssoOn, ssoCallbackLimiter, async (req, res) => {
    const stateCookie = req.cookies?.[OAUTH_COOKIE];
    res.clearCookie(OAUTH_COOKIE, { path: oauthCookieOpts.path }); // dùng một lần, kể cả khi lỗi
    const out = await ssoService.callback({ query: req.query, stateCookie, ip: req.ip, userAgent: req.get('user-agent') });
    if (out.error) return res.redirect(302, `${ssoService.appUrl}/dang-nhap?sso_error=${out.error}`);
    res.locals.ssoOk = true;
    res.cookie(REFRESH_COOKIE, out.issued.refreshToken, cookieOpts);
    // Đích cố định trên PUBLIC_APP_URL; token không lên URL, FE gọi /refresh. `next` chỉ là tham số đã mã hóa.
    res.redirect(302, `${ssoService.appUrl}/dang-nhap/google${out.next ? `?next=${encodeURIComponent(out.next)}` : ''}`);
  });

  r.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));
  return r;
};
