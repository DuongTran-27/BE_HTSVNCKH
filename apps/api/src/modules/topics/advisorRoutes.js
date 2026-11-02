import { advisorRequestListQuerySchema, lecturerListQuerySchema } from '@nckh/shared';
import { requireRole } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { businessRouter } from '../../lib/router.js';
import { createTopicService } from './service.js';
import { createAdvisorService } from './advisorService.js';

// Đã đứng sau requireAuth + requirePasswordChanged. ADMIN bị 403 ở requireRole (FR25).
export const advisorServiceFor = ({ repo, now }) =>
  createAdvisorService({ repo, now, getTopic: createTopicService({ repo, now }).get });

export const advisorRequestsRouter = ({ repo, now, guard }) => {
  const svc = advisorServiceFor({ repo, now });
  const r = businessRouter(guard);
  r.get('/', requireRole('LECTURER', 'STUDENT', 'STAFF'), validate(advisorRequestListQuerySchema, 'query'), async (req, res) => res.json(await svc.listRequests(req.user, req.validated)));
  return r;
};

export const lecturersRouter = ({ repo, now, guard }) => {
  const svc = advisorServiceFor({ repo, now });
  const r = businessRouter(guard);
  r.get('/', requireRole('LECTURER', 'STUDENT', 'STAFF'), validate(lecturerListQuerySchema, 'query'), async (req, res) => res.json(await svc.listLecturers(req.user, req.validated)));
  return r;
};
