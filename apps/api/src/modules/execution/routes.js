import { milestoneCreateSchema, milestoneUpdateSchema, milestoneDueChangeSchema, progressCreateSchema, progressUpdateSchema, paginationQuery, idSchema } from '@nckh/shared';
import { requireRole } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { notFound } from '../../lib/errors.js';
import { businessRouter } from '../../lib/router.js';
import { createLimiter } from '../../middlewares/rateLimit.js';
import { createMilestoneService } from './service.js';
import { createProgressService } from './progressService.js';

// ADMIN bị 403 ở requireRole (FR25); STUDENT đọc được, ghi bị 403 ở service (không phải GVHD/cán bộ).
const roles = requireRole('STAFF', 'LECTURER', 'STUDENT');

// Route con của /api/topics/:id (gắn vào topicsRouter, đã sau guard + param :id hợp lệ)
export const mountTopicMilestoneRoutes = (r, { repo, now }) => {
  const svc = createMilestoneService({ repo, now });
  r.get('/:id/milestones', roles, async (req, res) => res.json(await svc.list(req.user, req.params.id)));
  r.post('/:id/milestones', roles, validate(milestoneCreateSchema), async (req, res) => res.status(201).json(await svc.create(req.user, req.params.id, req.body, req.ip)));
};

export const milestonesRouter = ({ repo, now, guard }) => {
  const svc = createMilestoneService({ repo, now });
  const r = businessRouter(guard);
  r.param('id', (_req, _res, next, id) => {
    if (!idSchema.safeParse(id).success) throw notFound();
    next();
  });
  r.patch('/:id', roles, validate(milestoneUpdateSchema), async (req, res) => res.json(await svc.update(req.user, req.params.id, req.body, req.ip)));
  r.get('/:id/due-changes', roles, async (req, res) => res.json(await svc.listDueChanges(req.user, req.params.id)));
  r.post('/:id/due-changes', roles, validate(milestoneDueChangeSchema), async (req, res) => res.status(201).json(await svc.changeDue(req.user, req.params.id, req.body, req.ip)));
  return r;
};

// FR10: route con của /api/topics/:id (limiter 30/15 phút/người dùng khi ghi) và /api/progress/:id
export const mountTopicProgressRoutes = (r, { repo }) => {
  const svc = createProgressService({ repo });
  const limiter = createLimiter({ windowMs: 15 * 60e3, limit: 30, keyBy: 'user' });
  r.get('/:id/progress', roles, validate(paginationQuery, 'query'), async (req, res) => res.json(await svc.list(req.user, req.params.id, req.validated)));
  r.post('/:id/progress', roles, limiter, validate(progressCreateSchema), async (req, res) => res.status(201).json(await svc.create(req.user, req.params.id, req.body, req.ip)));
};

export const progressRouter = ({ repo, guard }) => {
  const svc = createProgressService({ repo });
  const r = businessRouter(guard);
  r.param('id', (_req, _res, next, id) => {
    if (!idSchema.safeParse(id).success) throw notFound();
    next();
  });
  r.patch('/:id', roles, createLimiter({ windowMs: 15 * 60e3, limit: 30, keyBy: 'user' }), validate(progressUpdateSchema), async (req, res) => res.json(await svc.update(req.user, req.params.id, req.body, req.ip)));
  return r;
};
