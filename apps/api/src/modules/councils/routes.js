import { councilCreateSchema, councilUpdateSchema, councilMembersSchema, councilAssignSchema, councilListQuerySchema, councilViewQuerySchema, reasonSchema, idSchema,
  assignmentListQuerySchema, defenseScoreSchema, defenseFinalizeSchema } from '@nckh/shared';
import { requireRole } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { notFound } from '../../lib/errors.js';
import { businessRouter } from '../../lib/router.js';
import { createLimiter } from '../../middlewares/rateLimit.js';
import { createCouncilService } from './service.js';
import { createTopicService } from '../topics/service.js';

const checkId = (_req, _res, next, id) => {
  if (!idSchema.safeParse(id).success) throw notFound();
  next();
};
// /api/councils (FR35 – API_GD7 §6). Ghi: STAFF; đọc: STAFF, LECTURER (thành viên). ADMIN 403 (FR25); phạm vi/quan hệ ở service.
const councilsRouter = ({ svc, limiter, guard }) => {
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

// /api/council-assignments: đọc, chấm, chốt (FR36, FR37 – §7), hủy phân công (§6.4)
const councilAssignmentsRouter = ({ svc, limiter, guard }) => {
  const r = businessRouter(guard);
  const read = requireRole('STAFF', 'LECTURER');
  const lecturer = requireRole('LECTURER');
  r.param('id', checkId);
  r.get('/', read, validate(assignmentListQuerySchema, 'query'), async (req, res) => res.json(await svc.listAssignments(req.user, req.validated)));
  r.get('/:id', read, async (req, res) => res.json(await svc.getAssignment(req.user, req.params.id)));
  r.put('/:id/my-score', lecturer, createLimiter({ windowMs: 15 * 60e3, limit: 60, keyBy: 'user' }), validate(defenseScoreSchema), async (req, res) => res.json(await svc.setMyScore(req.user, req.params.id, req.body, req.ip)));
  r.post('/:id/finalize', lecturer, limiter, validate(defenseFinalizeSchema), async (req, res) => res.json(await svc.finalize(req.user, req.params.id, req.body, req.ip)));
  r.post('/:id/cancel', requireRole('STAFF'), limiter, validate(reasonSchema), async (req, res) => res.json(await svc.cancelAssignment(req.user, req.params.id, req.body, req.ip)));
  return r;
};

// Hai router dùng chung MỘT limiter ghi: GĐ7 §6 "ghi 30/15 phút/user" tính tổng (m2 BM DC-08). Chấm điểm có limiter riêng 60/15 (§7.3)
export const councilRouters = ({ repo, now, guard }) => {
  const svc = createCouncilService({ repo, now, getTopic: createTopicService({ repo, now }).get });
  const limiter = createLimiter({ windowMs: 15 * 60e3, limit: 30, keyBy: 'user' });
  return { councils: councilsRouter({ svc, limiter, guard }), assignments: councilAssignmentsRouter({ svc, limiter, guard }) };
};
