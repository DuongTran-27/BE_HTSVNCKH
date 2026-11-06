import { milestoneCreateSchema, milestoneUpdateSchema, milestoneDueChangeSchema, milestoneReopenSchema, progressCreateSchema, progressUpdateSchema, paginationQuery, idSchema, documentUploadFieldsSchema, documentLinkSchema, documentListQuerySchema, emptyBodySchema, documentFeedbackSchema, progressFeedbackSchema, feedbackListQuerySchema, finalResultSchema, resultCorrectionSchema } from '@nckh/shared';
import { requireRole } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { notFound, badRequest } from '../../lib/errors.js';
import { drainThen } from '../../lib/multipart.js';
import { documentUpload, contentMatches, extOf, unsupported } from '../../lib/upload.js';
import { businessRouter } from '../../lib/router.js';
import { createLimiter } from '../../middlewares/rateLimit.js';
import { createMilestoneService } from './service.js';
import { createProgressService } from './progressService.js';
import { createDocumentService } from './documentService.js';
import { createFeedbackService } from './feedbackService.js';

// ADMIN bị 403 ở requireRole (FR25); STUDENT đọc được, ghi bị 403 ở service (không phải GVHD/cán bộ).
const roles = requireRole('STAFF', 'LECTURER', 'STUDENT');

// Route con của /api/topics/:id (gắn vào topicsRouter, đã sau guard + param :id hợp lệ)
export const mountTopicMilestoneRoutes = (r, { repo, now }) => {
  const svc = createMilestoneService({ repo, now });
  r.get('/:id/milestones', roles, async (req, res) => res.json(await svc.list(req.user, req.params.id)));
  r.post('/:id/milestones', roles, validate(milestoneCreateSchema), async (req, res) => res.status(201).json(await svc.create(req.user, req.params.id, req.body, req.ip)));
};

export const milestonesRouter = ({ repo, now, guard }) => {
  const svc = createMilestoneService({ repo, now });
  const r = businessRouter(guard);
  r.param('id', (_req, _res, next, id) => {
    if (!idSchema.safeParse(id).success) throw notFound();
    next();
  });
  r.patch('/:id', roles, validate(milestoneUpdateSchema), async (req, res) => res.json(await svc.update(req.user, req.params.id, req.body, req.ip)));
  r.get('/:id/due-changes', roles, async (req, res) => res.json(await svc.listDueChanges(req.user, req.params.id)));
  r.post('/:id/due-changes', roles, validate(milestoneDueChangeSchema), async (req, res) => res.status(201).json(await svc.changeDue(req.user, req.params.id, req.body, req.ip)));
  r.post('/:id/reopen', roles, validate(milestoneReopenSchema), async (req, res) => res.status(201).json(await svc.reopen(req.user, req.params.id, req.body, req.ip)));
  r.get('/:id/reopens', roles, async (req, res) => res.json(await svc.listReopens(req.user, req.params.id)));
  return r;
};

// FR10: route con của /api/topics/:id (limiter 30/15 phút/người dùng khi ghi) và /api/progress/:id
export const mountTopicProgressRoutes = (r, { repo }) => {
  const svc = createProgressService({ repo });
  const limiter = createLimiter({ windowMs: 15 * 60e3, limit: 30, keyBy: 'user' });
  r.get('/:id/progress', roles, validate(paginationQuery, 'query'), async (req, res) => res.json(await svc.list(req.user, req.params.id, req.validated)));
  r.post('/:id/progress', roles, limiter, validate(progressCreateSchema), async (req, res) => res.status(201).json(await svc.create(req.user, req.params.id, req.body, req.ip)));
};

export const progressRouter = ({ repo, guard }) => {
  const svc = createProgressService({ repo });
  const r = businessRouter(guard);
  r.param('id', (_req, _res, next, id) => {
    if (!idSchema.safeParse(id).success) throw notFound();
    next();
  });
  r.patch('/:id', roles, createLimiter({ windowMs: 15 * 60e3, limit: 30, keyBy: 'user' }), validate(progressUpdateSchema), async (req, res) => res.json(await svc.update(req.user, req.params.id, req.body, req.ip)));
  const fb = createFeedbackService({ repo });
  r.post('/:id/feedbacks', roles, validate(progressFeedbackSchema), async (req, res) => res.status(201).json(await fb.createForProgress(req.user, req.params.id, req.body, req.ip)));
  return r;
};

// FR11/FR24 – tài liệu (API_GD45 §5). Thứ tự upload bắt buộc (QD_ZOD §4.3.3): limiter → quyền/trạng thái chỉ từ :id → multer → nội dung → validate → handler.
const uploadLimiter = () => createLimiter({ windowMs: 15 * 60e3, limit: 20, keyBy: 'user' });
const student = requireRole('STUDENT');

export const mountTopicDocumentRoutes = (r, { repo, storage, folder, now, logger }) => {
  const svc = createDocumentService({ repo, storage, folder, now, logger });
  const limiter = uploadLimiter(); // chung bộ đếm cho upload và link
  const precheck = async (req, _res, next) => {
    try {
      req.topicCfg = (await svc.precheck(req.user, req.params.id)).cfg;
      next();
    } catch (e) {
      drainThen(req, next, e); // trả lỗi sau khi bỏ thân đang gửi (tránh ECONNRESET, BUG-008)
    }
  };
  // Link: thân JSON đã đọc xong nên không cần drain
  const precheckLink = (req, _res, next) => svc.precheck(req.user, req.params.id).then(() => next(), next);
  const checkContent = (req, _res, next) => {
    if (!req.file) return next(req.fileRejected ? unsupported() : badRequest('VALIDATION_ERROR', 'Dữ liệu không hợp lệ', { file: 'Chọn file để tải lên' }));
    if (!contentMatches(extOf(req.file.originalname), req.file.buffer)) return next(unsupported());
    next();
  };
  r.get('/:id/documents', roles, validate(documentListQuerySchema, 'query'), async (req, res) => res.json(await svc.list(req.user, req.params.id, req.validated)));
  r.post('/:id/documents', student, limiter, precheck, documentUpload, checkContent, validate(documentUploadFieldsSchema), async (req, res) =>
    res.status(201).json(await svc.upload(req.user, req.params.id, { file: req.file, fields: req.body }, req.topicCfg, req.ip)));
  r.post('/:id/documents/links', student, limiter, precheckLink, validate(documentLinkSchema), async (req, res) =>
    res.status(201).json(await svc.addLink(req.user, req.params.id, req.body, req.ip)));
};

export const documentsRouter = ({ repo, storage, folder, now, logger, guard }) => {
  const svc = createDocumentService({ repo, storage, folder, now, logger });
  const r = businessRouter(guard);
  r.param('id', (_req, _res, next, id) => {
    if (!idSchema.safeParse(id).success) throw notFound();
    next();
  });
  r.post('/:id/download-url', roles, createLimiter({ windowMs: 15 * 60e3, limit: 60, keyBy: 'user' }), validate(emptyBodySchema), async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(await svc.downloadUrl(req.user, req.params.id, req.ip));
  });
  const fb = createFeedbackService({ repo, now });
  r.post('/:id/feedbacks', roles, validate(documentFeedbackSchema), async (req, res) => res.status(201).json(await fb.createForDocument(req.user, req.params.id, req.body, req.ip)));
  return r;
};

// FR12 (API_GD45 §6.3, §6.4): route con của /api/topics/:id
export const mountTopicFeedbackRoutes = (r, { repo, now }) => {
  const svc = createFeedbackService({ repo, now });
  r.get('/:id/feedbacks', roles, validate(feedbackListQuerySchema, 'query'), async (req, res) => res.json(await svc.list(req.user, req.params.id, req.validated)));
  r.get('/:id/results', roles, async (req, res) => res.json(await svc.listResults(req.user, req.params.id)));
  r.post('/:id/result-corrections', requireRole('STAFF'), validate(resultCorrectionSchema), async (req, res) => res.status(201).json(await svc.correctResult(req.user, req.params.id, req.body, req.ip)));
  r.post('/:id/results', roles, validate(finalResultSchema), async (req, res) => res.status(201).json(await svc.createResult(req.user, req.params.id, req.body, req.ip)));
};
