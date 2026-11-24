import { invitationListQuerySchema, idSchema } from '@nckh/shared';
import { requireRole } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { notFound } from '../../lib/errors.js';
import { businessRouter } from '../../lib/router.js';
import { createGroupService } from './groupService.js';

// /api/invitations – STUDENT; quyền theo quan hệ ở groupService (dùng chung với topicsRouter).
export const invitationsRouter = ({ repo, now, guard }) => {
  const svc = createGroupService({ repo, now });
  const r = businessRouter(guard);
  r.use(requireRole('STUDENT'));
  r.param('id', (_req, _res, next, id) => {
    if (!idSchema.safeParse(id).success) throw notFound();
    next();
  });
  r.get('/', validate(invitationListQuerySchema, 'query'), async (req, res) => res.json(await svc.list(req.user, req.validated)));
  r.post('/:id/accept', async (req, res) => res.json(await svc.accept(req.user, req.params.id, req.ip)));
  r.post('/:id/decline', async (req, res) => res.json(await svc.close(req.user, req.params.id, 'DECLINED', req.ip)));
  r.post('/:id/cancel', async (req, res) => res.json(await svc.close(req.user, req.params.id, 'WITHDRAWN', req.ip)));
  return r;
};
