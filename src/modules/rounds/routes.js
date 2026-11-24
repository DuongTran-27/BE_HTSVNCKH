import { roundCreateSchema, roundUpdateSchema, roundListQuerySchema, idSchema } from '@nckh/shared';
import { requireRole } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { notFound } from '../../lib/errors.js';
import { businessRouter } from '../../lib/router.js';
import { createRoundService } from './service.js';

// Đã đứng sau requireAuth + requirePasswordChanged (app.js). ADMIN bị 403 ở requireRole (FR25).
export const roundsRouter = ({ repo, now, guard }) => {
  const svc = createRoundService({ repo, now });
  const r = businessRouter(guard);
  const readers = requireRole('STAFF', 'LECTURER', 'STUDENT');
  const staff = requireRole('STAFF');
  r.param('id', (_req, _res, next, id) => {
    if (!idSchema.safeParse(id).success) throw notFound();
    next();
  });

  r.get('/', readers, validate(roundListQuerySchema, 'query'), async (req, res) => {
    res.json(await svc.list(req.user, req.validated));
  });
  r.get('/:id', readers, async (req, res) => res.json(await svc.get(req.user, req.params.id)));
  r.post('/', staff, validate(roundCreateSchema), async (req, res) => {
    res.status(201).json(await svc.create(req.user, req.body, req.ip));
  });
  r.patch('/:id', staff, validate(roundUpdateSchema), async (req, res) => {
    res.json(await svc.update(req.user, req.params.id, req.body, req.ip));
  });
  return r;
};
