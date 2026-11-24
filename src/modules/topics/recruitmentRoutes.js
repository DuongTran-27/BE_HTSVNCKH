import { recruitmentListQuerySchema, applicationCreateSchema, idSchema } from '@nckh/shared';
import { requireRole } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { notFound } from '../../lib/errors.js';
import { businessRouter } from '../../lib/router.js';
import { createRecruitmentService } from './recruitmentService.js';
import { createApplicationService } from './applicationService.js';
import { createLimiter } from '../../middlewares/rateLimit.js';

// /api/recruitments – bảng tin đề tài GV đang tuyển (FR31, API_GD7 §4.2). ADMIN 403 (FR25); phạm vi khoa ở service.
export const recruitmentsRouter = ({ repo, now, guard }) => {
  const svc = createRecruitmentService({ repo, now });
  const r = businessRouter(guard);
  const reader = requireRole('STAFF', 'LECTURER', 'STUDENT');
  r.get('/', reader, validate(recruitmentListQuerySchema, 'query'), async (req, res) => res.json(await svc.list(req.user, req.validated)));
  r.get('/:topicId', reader, async (req, res) => {
    if (!idSchema.safeParse(req.params.topicId).success) throw notFound();
    res.json(await svc.get(req.user, req.params.topicId));
  });
  // FR32 ứng tuyển (§4.3)
  const apps = createApplicationService({ repo, now });
  const applyLimiter = createLimiter({ windowMs: 15 * 60e3, limit: 30, keyBy: 'user' });
  r.post('/:topicId/applications', requireRole('STUDENT'), applyLimiter, validate(applicationCreateSchema), async (req, res) => {
    if (!idSchema.safeParse(req.params.topicId).success) throw notFound();
    res.status(201).json(await apps.apply(req.user, req.params.topicId, req.body, req.ip));
  });
  return r;
};
