import { milestoneCreateSchema, milestoneUpdateSchema, milestoneDueChangeSchema, idSchema } from '@nckh/shared';
import { requireRole } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { notFound } from '../../lib/errors.js';
import { businessRouter } from '../../lib/router.js';
import { createMilestoneService } from './service.js';

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
