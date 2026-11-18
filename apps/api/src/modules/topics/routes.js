import { topicCreateSchema, topicUpdateSchema, invitationCreateSchema, leaderTransferSchema, leaveTopicSchema, paginationQuery, topicActionSchema, emptyBodySchema, idSchema, submissionSeqSchema, submissionDiffQuerySchema, topicListQuerySchema, similarityBypassCreateSchema, applicationListQuerySchema, ENABLED_ACTIONS, findTransition } from '@nckh/shared';
import { requireRole } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { businessRouter } from '../../lib/router.js';
import { createTopicService } from './service.js';
import { createLimiter } from '../../middlewares/rateLimit.js';
import { createAdvisorService } from './advisorService.js';
import { createReviewService, REVIEW_ACTIONS } from './reviewService.js';
import { createCloseService, CLOSE_ACTIONS } from './closeService.js';
import { createGroupService } from './groupService.js';
import { createSnapshotService } from './snapshotService.js';
import { createListService } from './listService.js';
import { createSimilarityService } from './similarityService.js';
import { createSimilarityBypassService } from './similarityBypassService.js';
import { createRecruitmentService, RECRUIT_ACTIONS } from './recruitmentService.js';
import { createApplicationService } from './applicationService.js';
import { mountTopicMilestoneRoutes, mountTopicProgressRoutes, mountTopicDocumentRoutes, mountTopicFeedbackRoutes } from '../execution/routes.js';

// Đã đứng sau requireAuth + requirePasswordChanged. ADMIN bị 403 ở requireRole (FR25); quyền theo quan hệ ở service.
export const topicsRouter = ({ repo, now, guard, logger, storage, folder, mountExtra }) => {
  const svc = createTopicService({ repo, now });
  const advisor = createAdvisorService({ repo, now, getTopic: svc.get });
  const review = createReviewService({ repo, now, getTopic: svc.get, logger });
  const lister = createListService({ repo, now });
  const close = createCloseService({ repo, now, getTopic: svc.get });
  const actionLimiter = createLimiter({ windowMs: 15 * 60e3, limit: 30, keyBy: 'user' });
  const group = createGroupService({ repo, now, getTopic: svc.get });
  const snapshots = createSnapshotService({ repo });
  const similarity = createSimilarityService({ repo });
  const bypass = createSimilarityBypassService({ repo });
  const recruit = createRecruitmentService({ repo, now, getTopic: svc.get });
  const similarityLimiter = createLimiter({ windowMs: 15 * 60e3, limit: 10, keyBy: 'user' });
  const r = businessRouter(guard);
  const student = requireRole('STUDENT');
  r.param('id', (_req, _res, next, id) => {
    if (!idSchema.safeParse(id).success) throw notFound();
    next();
  });
  const studentOrLecturer = requireRole('STUDENT', 'LECTURER'); // GĐ7 §3.1–3.2: GV tạo/sửa/kiểm tra trước nháp đề tài công bố
  r.post('/', studentOrLecturer, validate(topicCreateSchema), async (req, res) => {
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
  // FR33 ứng viên của đề tài (API_GD7 §4.2): GVHD hiện hành, cán bộ trong phạm vi
  const applications = createApplicationService({ repo, now });
  r.get('/:id/applications', reader, validate(applicationListQuerySchema, 'query'), async (req, res) => res.json(await applications.listForTopic(req.user, req.params.id, req.validated)));
  r.get('/:id/status-history', reader, async (req, res) => res.json(await snapshots.history(req.user, req.params.id)));
  r.put('/:id', studentOrLecturer, validate(topicUpdateSchema), async (req, res) => {
    res.json(await svc.update(req.user, req.params.id, req.body, req.ip));
  });
  r.post('/:id/invitations', student, validate(invitationCreateSchema), async (req, res) => {
    res.status(201).json(await group.invite(req.user, req.params.id, req.body, req.ip));
  });
  r.post('/:id/leader', student, validate(leaderTransferSchema), async (req, res) => {
    res.json(await group.transferLeader(req.user, req.params.id, req.body, req.ip));
  });
  r.post('/:id/leave', student, validate(leaveTopicSchema), async (req, res) => res.json(await group.leave(req.user, req.params.id, req.body, req.ip)));
  r.get('/:id/similarity-checks/latest', requireRole('STAFF', 'LECTURER', 'STUDENT'), async (req, res) => res.json(await similarity.latest(req.user, req.params.id)));
  r.post('/:id/similarity-checks', studentOrLecturer, similarityLimiter, validate(emptyBodySchema), async (req, res) => res.json(await similarity.check(req.user, req.params.id, req.ip)));
  // G5 (API_GD6 §9.2): cán bộ cho phép gửi khi FR06 lỗi; phạm vi khoa ở service
  r.post('/:id/similarity-bypasses', requireRole('STAFF'), validate(similarityBypassCreateSchema), async (req, res) => res.status(201).json(await bypass.grant(req.user, req.params.id, req.body, req.ip)));
  // Endpoint chuyển trạng thái chung (§8.1); T210: nhánh FR16, T212a: gửi/xét duyệt; T405: đóng đề tài. Vai trò kiểm bằng TRANSITIONS.
  // m1 DC-01: action nội bộ (CANCEL, COUNCIL_FINALIZE) hoặc chưa có endpoint bị chặn tại đây, không chỉ dựa vào nhánh của topicActionSchema
  const enabledOnly = (req, _res, next) => {
    const a = req.body?.action;
    if (findTransition(a) && !ENABLED_ACTIONS.includes(a)) throw badRequest('UNKNOWN_ACTION', 'Thao tác không gọi được trực tiếp');
    next();
  };
  r.post('/:id/actions', requireRole('STUDENT', 'LECTURER', 'STAFF'), actionLimiter, enabledOnly, validate(topicActionSchema), async (req, res) => {
    const a = req.body.action;
    const svcFor = REVIEW_ACTIONS.includes(a) ? review : CLOSE_ACTIONS.includes(a) ? close : RECRUIT_ACTIONS.includes(a) ? recruit : advisor;
    res.json(await svcFor.act(req.user, req.params.id, req.body, req.ip));
  });
  mountTopicMilestoneRoutes(r, { repo, now });
  mountTopicProgressRoutes(r, { repo });
  mountTopicDocumentRoutes(r, { repo, storage, folder, now, logger });
  mountTopicFeedbackRoutes(r, { repo, now });
  mountExtra?.(r); // GĐ6: yêu cầu thay đổi, quyền đọc GV cũ (changeRequests/routes.js)
  return r;
};

// GET /api/me/past-topics – SV đã rời nhóm (FR21, API_GD6 §5.4)
export const meRouter = ({ repo, now, guard }) => {
  const group = createGroupService({ repo, now });
  const r = businessRouter(guard);
  r.get('/past-topics', requireRole('STUDENT'), validate(paginationQuery, 'query'), async (req, res) => res.json(await group.pastTopics(req.user, req.validated)));
  return r;
};
