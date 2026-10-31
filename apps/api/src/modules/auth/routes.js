import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { loginSchema, changePasswordSchema } from '@nckh/shared';
import { validate } from '../../middlewares/validate.js';

export const REFRESH_COOKIE = 'nckh_rt';

export const authRouter = ({ authService, requireAuth, env }) => {
  const r = Router();
  // Cookie chỉ gửi tới /api/auth; cùng domain nhờ rewrite /api của Vercel (NFR01)
  const cookieOpts = {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 86400e3,
  };
  const loginLimiter = rateLimit({ windowMs: 15 * 60e3, limit: 20, standardHeaders: true, legacyHeaders: false });

  const send = (res, issued) => {
    res.cookie(REFRESH_COOKIE, issued.refreshToken, cookieOpts);
    res.json({ accessToken: issued.accessToken, user: issued.user });
  };

  r.post('/login', loginLimiter, validate(loginSchema), async (req, res) => {
    send(res, await authService.login({ ...req.body, userAgent: req.get('user-agent') }));
  });

  r.post('/refresh', async (req, res) => {
    try {
      send(res, await authService.refresh({ refreshToken: req.cookies?.[REFRESH_COOKIE], userAgent: req.get('user-agent') }));
    } catch (e) {
      res.clearCookie(REFRESH_COOKIE, { path: cookieOpts.path });
      throw e;
    }
  });

  r.post('/logout', async (req, res) => {
    await authService.logout({ refreshToken: req.cookies?.[REFRESH_COOKIE] });
    res.clearCookie(REFRESH_COOKIE, { path: cookieOpts.path });
    res.status(204).end();
  });

  r.post('/change-password', requireAuth, validate(changePasswordSchema), async (req, res) => {
    await authService.changePassword({ userId: req.user.id, ...req.body, refreshToken: req.cookies?.[REFRESH_COOKIE] });
    res.status(204).end();
  });

  r.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));
  return r;
};
