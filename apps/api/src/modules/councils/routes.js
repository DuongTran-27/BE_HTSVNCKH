import { councilCreateSchema, councilUpdateSchema, councilMembersSchema, councilAssignSchema, councilListQuerySchema, councilViewQuerySchema, reasonSchema, idSchema } from '@nckh/shared';
import { requireRole } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { notFound } from '../../lib/errors.js';
import { businessRouter } from '../../lib/router.js';
import { createLimiter } from '../../middlewares/rateLimit.js';
import { createCouncilService } from './service.js';

const checkId = (_req, _res, next, id) => {
  if (!idSchema.safeParse(id).success) throw notFound();
  next();
};
const writeLimiter = () => createLimiter({ windowMs: 15 * 60e3, limit: 30, keyBy: 'user' }); // GĐ7 §6: ghi 30/15 phút/user

// /api/councils (FR35 – API_GD7 §6). Ghi: STAFF; đọc: STAFF, LECTURER (thành viên). ADMIN 403 (FR25); phạm vi/quan hệ ở service.
export const councilsRouter = ({ repo, now, guard }) => {
  const svc = createCouncilService({ repo, now });
  const limiter = writeLimiter();
  const r = businessRouter(guard);
  const staff = requireRole('STAFF');
  r.param('id', checkId);
  r.get('/', requireRole('STAFF', 'LECTURER'), validate(councilListQuerySchema, 'query'), async (req, res) => res.json(await svc.list(req.user, req.validated)));
  r.get('/:id', requireRole('STAFF', 'LECTURER'), validate(councilViewQuerySchema, 'query'), async (req, res) => res.json(await svc.get(req.user, req.params.id, req.validated)));
  r.post('/', staff, limiter, validate(councilCreateSchema), async (req, res) => res.status(201).json(await svc.create(req.user, req.body, req.ip)));
  r.patch('/:id', staff, limiter, validate(councilUpdateSchema), async (req, res) => res.json(await svc.rename(req.user, req.params.id, req.body, req.ip)));
  r.put('/:id/members', staff, limiter, validate(councilMembersSchema), async (req, res) => res.json(await svc.setMembers(req.user, req.params.id, req.body, req.ip)));
  r.post('/:id/assignments', staff, limiter, validate(councilAssignSchema), async (req, res) => res.status(201).json(await svc.assign(req.user, req.params.id, req.body, req.ip)));
  return r;
};

// /api/council-assignments – DC-08 chỉ có hủy phân công (§6.4); đọc, chấm, chốt thuộc DC-09 (§7)
export const councilAssignmentsRouter = ({ repo, now, guard }) => {
  const svc = createCouncilService({ repo, now });
  const r = businessRouter(guard);
  r.param('id', checkId);
  r.post('/:id/cancel', requireRole('STAFF'), writeLimiter(), validate(reasonSchema), async (req, res) => res.json(await svc.cancelAssignment(req.user, req.params.id, req.body, req.ip)));
  return r;
};
