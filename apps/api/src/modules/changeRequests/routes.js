// Yêu cầu thay đổi (API_GD6 §2–§3). ADMIN 403 ở requireRole (FR25); quyền theo quan hệ ở service.
import { changeRequestCreateSchema, changeRequestApproveSchema, changeRequestDeclineSchema, changeRequestListQuerySchema, formerAdvisorAccessSchema, emptyBodySchema, paginationQuery, idSchema } from '@nckh/shared';
import { requireRole } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { notFound } from '../../lib/errors.js';
import { businessRouter } from '../../lib/router.js';
import { createLimiter } from '../../middlewares/rateLimit.js';
import { createTopicService } from '../topics/service.js';
import { createChangeRequestService } from './service.js';

const roles = requireRole('STAFF', 'LECTURER', 'STUDENT');
const validId = (_req, _res, next, id) => {
  if (!idSchema.safeParse(id).success) throw notFound();
  next();
};

// Một limiter 30/15 phút/người dùng chung cho mọi endpoint ghi của §2.3 (route con của /api/topics và /api/change-requests)
export const changeRequestRoutes = ({ repo, now, guard }) => {
  const svc = createChangeRequestService({ repo, now, getTopic: createTopicService({ repo, now }).get });
  const limiter = createLimiter({ windowMs: 15 * 60e3, limit: 30, keyBy: 'user' });
  // §6.2: limiter FR06 10/15 phút áp thêm khi TOPIC_CHANGE có đổi tên/tóm tắt (có thể chạy thuật toán)
  const fr06Limiter = createLimiter({ windowMs: 15 * 60e3, limit: 10, keyBy: 'user' });
  const fr06Limit = (req, res, next) => (req.body.changes?.title !== undefined || req.body.changes?.summary !== undefined ? fr06Limiter(req, res, next) : next());

  // Route con của /api/topics/:id (đã sau guard + param :id hợp lệ)
  const mountTopicRoutes = (r) => {
    r.get('/:id/change-requests', roles, validate(paginationQuery, 'query'), async (req, res) => res.json(await svc.listForTopic(req.user, req.params.id, req.validated)));
    r.post('/:id/change-requests', roles, limiter, validate(changeRequestCreateSchema), fr06Limit, async (req, res) => res.status(201).json(await svc.create(req.user, req.params.id, req.body, req.ip)));
    r.put('/:id/former-advisors/:lecturerId/read-access', requireRole('STAFF'), validate(formerAdvisorAccessSchema), async (req, res) => {
      if (!idSchema.safeParse(req.params.lecturerId).success) throw notFound();
      res.json(await svc.setFormerAdvisorAccess(req.user, req.params.id, req.params.lecturerId, req.body, req.ip));
    });
  };

  const router = businessRouter(guard);
  router.param('id', validId);
  router.get('/', roles, validate(changeRequestListQuerySchema, 'query'), async (req, res) => res.json(await svc.list(req.user, req.validated)));
  router.get('/:id', roles, async (req, res) => res.json(await svc.get(req.user, req.params.id)));
  router.post('/:id/accept', roles, limiter, validate(emptyBodySchema), async (req, res) => res.json(await svc.accept(req.user, req.params.id, req.ip)));
  router.post('/:id/decline', roles, limiter, validate(changeRequestDeclineSchema), async (req, res) => res.json(await svc.decline(req.user, req.params.id, req.body, req.ip)));
  router.post('/:id/withdraw', roles, limiter, validate(emptyBodySchema), async (req, res) => res.json(await svc.withdraw(req.user, req.params.id, req.ip)));
  router.post('/:id/approve', roles, limiter, validate(changeRequestApproveSchema), async (req, res) => res.json(await svc.approve(req.user, req.params.id, req.body, req.ip)));
  return { router, mountTopicRoutes };
};
