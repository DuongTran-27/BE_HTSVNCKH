import { topicCreateSchema, topicUpdateSchema, invitationCreateSchema, leaderTransferSchema, topicActionSchema, emptyBodySchema, idSchema, submissionSeqSchema, submissionDiffQuerySchema, topicListQuerySchema } from '@nckh/shared';
import { requireRole } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { notFound } from '../../lib/errors.js';
import { businessRouter } from '../../lib/router.js';
import { createTopicService } from './service.js';
import { createLimiter } from '../../middlewares/rateLimit.js';
import { createAdvisorService } from './advisorService.js';
import { createReviewService, REVIEW_ACTIONS } from './reviewService.js';
import { createGroupService } from './groupService.js';
import { createSnapshotService } from './snapshotService.js';
import { createListService } from './listService.js';
import { createSimilarityService } from './similarityService.js';
import { mountTopicMilestoneRoutes, mountTopicProgressRoutes, mountTopicDocumentRoutes, mountTopicFeedbackRoutes } from '../execution/routes.js';

// Đã đứng sau requireAuth + requirePasswordChanged. ADMIN bị 403 ở requireRole (FR25); quyền theo quan hệ ở service.
export const topicsRouter = ({ repo, now, guard, logger, storage, folder }) => {
  const svc = createTopicService({ repo, now });
  const advisor = createAdvisorService({ repo, now, getTopic: svc.get });
  const review = createReviewService({ repo, now, getTopic: svc.get, logger });
  const lister = createListService({ repo, now });
  const actionLimiter = createLimiter({ windowMs: 15 * 60e3, limit: 30, keyBy: 'user' });
  const group = createGroupService({ repo, now, getTopic: svc.get });
  const snapshots = createSnapshotService({ repo });
  const similarity = createSimilarityService({ repo });
  const similarityLimiter = createLimiter({ windowMs: 15 * 60e3, limit: 10, keyBy: 'user' });
  const r = businessRouter(guard);
  const student = requireRole('STUDENT');
  r.param('id', (_req, _res, next, id) => {
    if (!idSchema.safeParse(id).success) throw notFound();
    next();
  });
  r.post('/', student, validate(topicCreateSchema), async (req, res) => {
    res.status(201).json(await svc.create(req.user, req.body, req.ip));
  });
  r.get('/', requireRole('STAFF', 'LECTURER', 'STUDENT'), validate(topicListQuerySchema, 'query'), async (req, res) => res.json(await lister.list(req.user, req.validated)));
  r.get('/:id', requireRole('STAFF', 'LECTURER', 'STUDENT'), async (req, res) => res.json(await svc.get(req.user, req.params.id)));
  const reader = requireRole('STAFF', 'LECTURER', 'STUDENT');
  // FR17: đọc snapshot / lịch sử; quyền theo quan hệ ở service
  r.get('/:id/submissions', reader, async (req, res) => res.json(await snapshots.list(req.user, req.params.id)));
  r.get('/:id/submissions/:seq', reader, async (req, res) => {
    const seq = submissionSeqSchema.safeParse(req.params.seq);
    if (!seq.success) throw notFound();
    res.json(await snapshots.get(req.user, req.params.id, seq.data));
  });
  r.get('/:id/submission-diff', reader, validate(submissionDiffQuerySchema, 'query'), async (req, res) => res.json(await snapshots.diff(req.user, req.params.id, req.validated)));
  r.get('/:id/status-history', reader, async (req, res) => res.json(await snapshots.history(req.user, req.params.id)));
  r.put('/:id', student, validate(topicUpdateSchema), async (req, res) => {
    res.json(await svc.update(req.user, req.params.id, req.body, req.ip));
  });
  r.post('/:id/invitations', student, validate(invitationCreateSchema), async (req, res) => {
    res.status(201).json(await group.invite(req.user, req.params.id, req.body, req.ip));
  });
  r.post('/:id/leader', student, validate(leaderTransferSchema), async (req, res) => {
    res.json(await group.transferLeader(req.user, req.params.id, req.body, req.ip));
  });
  r.get('/:id/similarity-checks/latest', requireRole('STAFF', 'LECTURER', 'STUDENT'), async (req, res) => res.json(await similarity.latest(req.user, req.params.id)));
  r.post('/:id/similarity-checks', student, similarityLimiter, validate(emptyBodySchema), async (req, res) => res.json(await similarity.check(req.user, req.params.id, req.ip)));
  // Endpoint chuyển trạng thái chung (§8.1); T210: nhánh FR16, T212a: gửi/xét duyệt. Vai trò kiểm bằng TRANSITIONS.
  r.post('/:id/actions', requireRole('STUDENT', 'LECTURER', 'STAFF'), actionLimiter, validate(topicActionSchema), async (req, res) => {
    const svcFor = REVIEW_ACTIONS.includes(req.body.action) ? review : advisor;
    res.json(await svcFor.act(req.user, req.params.id, req.body, req.ip));
  });
  mountTopicMilestoneRoutes(r, { repo, now });
  mountTopicProgressRoutes(r, { repo });
  mountTopicDocumentRoutes(r, { repo, storage, folder, now, logger });
  mountTopicFeedbackRoutes(r, { repo, now });
  return r;
};
