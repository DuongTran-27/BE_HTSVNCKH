import { applicationListQuerySchema, emptyBodySchema, reasonSchema, idSchema } from '@nckh/shared';
import { requireRole } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { notFound } from '../../lib/errors.js';
import { businessRouter } from '../../lib/router.js';
import { createLimiter } from '../../middlewares/rateLimit.js';
import { createTopicService } from './service.js';
import { createApplicationService } from './applicationService.js';

// /api/applications – hộp đơn ứng tuyển (FR32, FR33 – API_GD7 §4.2–4.4). ADMIN 403 (FR25); quyền theo quan hệ ở service.
export const applicationsRouter = ({ repo, now, guard }) => {
  const svc = createApplicationService({ repo, now, getTopic: createTopicService({ repo, now }).get });
  const decideLimiter = createLimiter({ windowMs: 15 * 60e3, limit: 60, keyBy: 'user' });
  const r = businessRouter(guard);
  const lecturer = requireRole('LECTURER');
  r.param('id', (_req, _res, next, id) => {
    if (!idSchema.safeParse(id).success) throw notFound();
    next();
  });
  r.get('/', requireRole('STAFF', 'LECTURER', 'STUDENT'), validate(applicationListQuerySchema, 'query'), async (req, res) => res.json(await svc.list(req.user, req.validated)));
  r.post('/:id/withdraw', requireRole('STUDENT'), validate(emptyBodySchema), async (req, res) => res.json(await svc.withdraw(req.user, req.params.id, req.ip)));
  r.post('/:id/accept', lecturer, decideLimiter, validate(emptyBodySchema), async (req, res) => res.json(await svc.accept(req.user, req.params.id, req.ip)));
  r.post('/:id/decline', lecturer, decideLimiter, validate(reasonSchema), async (req, res) => res.json(await svc.decline(req.user, req.params.id, req.body, req.ip)));
  return r;
};
