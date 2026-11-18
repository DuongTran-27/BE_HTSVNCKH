import { recruitmentListQuerySchema, idSchema } from '@nckh/shared';
import { requireRole } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { notFound } from '../../lib/errors.js';
import { businessRouter } from '../../lib/router.js';
import { createRecruitmentService } from './recruitmentService.js';

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
  return r;
};
