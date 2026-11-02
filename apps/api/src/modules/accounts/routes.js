import { userCreateSchema, userUpdateSchema, staffScopesSchema, userListQuerySchema, idSchema } from '@nckh/shared';
import { requireRole } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { createLimiter } from '../../middlewares/rateLimit.js';
import { notFound } from '../../lib/errors.js';
import { businessRouter } from '../../lib/router.js';
import { createAccountService } from './service.js';

// Quyền nền tảng của ADMIN (FR25); STAFF bị giới hạn theo phạm vi khoa trong service.
export const accountsRouter = ({ repo, hasher, guard, genPassword }) => {
  const svc = createAccountService({ repo, hasher, genPassword });
  const r = businessRouter(guard);
  const adminOrStaff = requireRole('ADMIN', 'STAFF');
  // Một limiter dùng chung cho tạo và reset: 30 / 15 phút / người dùng (QD_ZOD §4.6)
  const writeLimiter = createLimiter({ windowMs: 15 * 60e3, limit: 30, keyBy: 'user' });
  r.param('id', (_req, _res, next, id) => {
    if (!idSchema.safeParse(id).success) throw notFound();
    next();
  });
  r.use((req, _res, next) => {
    req.duplicateFields = { code: 'code', email: 'email' };
    next();
  });

  r.get('/', adminOrStaff, validate(userListQuerySchema, 'query'), async (req, res) =>
    res.json(await svc.list(req.user, req.validated)),
  );
  r.get('/:id', adminOrStaff, async (req, res) => res.json(await svc.get(req.user, req.params.id)));
  r.post('/', writeLimiter, adminOrStaff, validate(userCreateSchema), async (req, res) => {
    res.set('Cache-Control', 'no-store').status(201).json(await svc.create(req.user, req.body, req.ip));
  });
  r.patch('/:id', adminOrStaff, validate(userUpdateSchema), async (req, res) => {
    res.json(await svc.update(req.user, req.params.id, req.body, req.ip));
  });
  r.post('/:id/lock', adminOrStaff, async (req, res) => res.json(await svc.setLocked(req.user, req.params.id, true, req.ip)));
  r.post('/:id/unlock', adminOrStaff, async (req, res) => res.json(await svc.setLocked(req.user, req.params.id, false, req.ip)));
  r.post('/:id/reset-password', writeLimiter, adminOrStaff, async (req, res) => {
    res.set('Cache-Control', 'no-store').json(await svc.resetPassword(req.user, req.params.id, req.ip));
  });
  r.put('/:id/staff-scopes', requireRole('ADMIN'), validate(staffScopesSchema), async (req, res) => {
    res.json(await svc.setStaffScopes(req.user, req.params.id, req.body.facultyIds, req.ip));
  });
  return r;
};
