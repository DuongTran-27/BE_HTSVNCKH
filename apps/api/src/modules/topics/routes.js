import { topicCreateSchema, topicUpdateSchema, invitationCreateSchema, leaderTransferSchema, idSchema } from '@nckh/shared';
import { requireRole } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { notFound } from '../../lib/errors.js';
import { businessRouter } from '../../lib/router.js';
import { createTopicService } from './service.js';
import { createGroupService } from './groupService.js';

// Đã đứng sau requireAuth + requirePasswordChanged. ADMIN bị 403 ở requireRole (FR25); quyền theo quan hệ ở service.
export const topicsRouter = ({ repo, now, guard }) => {
  const svc = createTopicService({ repo, now });
  const group = createGroupService({ repo, now, getTopic: svc.get });
  const r = businessRouter(guard);
  const student = requireRole('STUDENT');
  r.param('id', (_req, _res, next, id) => {
    if (!idSchema.safeParse(id).success) throw notFound();
    next();
  });
  r.post('/', student, validate(topicCreateSchema), async (req, res) => {
    res.status(201).json(await svc.create(req.user, req.body, req.ip));
  });
  r.get('/:id', requireRole('STAFF', 'LECTURER', 'STUDENT'), async (req, res) => res.json(await svc.get(req.user, req.params.id)));
  r.put('/:id', student, validate(topicUpdateSchema), async (req, res) => {
    res.json(await svc.update(req.user, req.params.id, req.body, req.ip));
  });
  r.post('/:id/invitations', student, validate(invitationCreateSchema), async (req, res) => {
    res.status(201).json(await group.invite(req.user, req.params.id, req.body, req.ip));
  });
  r.post('/:id/leader', student, validate(leaderTransferSchema), async (req, res) => {
    res.json(await group.transferLeader(req.user, req.params.id, req.body, req.ip));
  });
  return r;
};
