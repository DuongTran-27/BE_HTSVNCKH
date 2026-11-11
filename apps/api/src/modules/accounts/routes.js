import { z } from 'zod';
import { USER_IMPORT_MAX_BYTES, userCreateSchema, userUpdateSchema, staffScopesSchema, userListQuerySchema, idSchema } from '@nckh/shared';
import { requireRole } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { createLimiter } from '../../middlewares/rateLimit.js';
import { notFound } from '../../lib/errors.js';
import { businessRouter } from '../../lib/router.js';
import { badRequest, forbidden } from '../../lib/errors.js';
import { singleFileUpload, drainThen } from '../../lib/multipart.js';
import { createAccountService } from './service.js';
import { createImportService } from './importService.js';

const importQuerySchema = z.object({ facultyId: idSchema });

// Quyền nền tảng của ADMIN (FR25); STAFF bị giới hạn theo phạm vi khoa trong service.
export const accountsRouter = ({ repo, hasher, guard, genPassword }) => {
  const svc = createAccountService({ repo, hasher, genPassword });
  const importSvc = createImportService({ repo, hasher, genPassword });
  const r = businessRouter(guard);
  const adminOrStaff = requireRole('ADMIN', 'STAFF');
  // Một limiter dùng chung cho tạo và reset: 30 / 15 phút / người dùng (QD_ZOD §4.6)
  const writeLimiter = createLimiter({ windowMs: 15 * 60e3, limit: 30, keyBy: 'user' });
  r.param('id', (_req, _res, next, id) => {
    if (!idSchema.safeParse(id).success) throw notFound();
    next();
  });
  r.use((req, _res, next) => {
    req.duplicateFields = { code: 'code', email: 'email' };
    next();
  });

  // Nhập CSV (API_GD2 §3.2): guard -> limiter -> vai trò -> phạm vi (chỉ từ query) -> multer -> service (nội dung file)
  const importLimiter = () => createLimiter({ windowMs: 15 * 60e3, limit: 10, keyBy: 'user' });
  const importScope = (req, _res, next) => {
    if (req.user.role === 'STAFF' && !req.user.staffFacultyIds.includes(req.validated.facultyId)) return drainThen(req, next, forbidden());
    next();
  };
  const upload = singleFileUpload({ fileSize: USER_IMPORT_MAX_BYTES, maxParts: 7, fieldSize: 1024 });
  // Whitelist đuôi .csv (QD_ZOD §4.3.5); nội dung được kiểm tiếp trong service
  const csvExt = (req, _res, next) => {
    if (!/\.csv$/i.test(req.file.originalname)) {
      throw badRequest('VALIDATION_ERROR', 'Dữ liệu không hợp lệ', { file: 'Loại file không được hỗ trợ' });
    }
    next();
  };
  const importChain = (limiter) => [limiter, adminOrStaff, validate(importQuerySchema, 'query'), importScope, upload, csvExt];
  r.post('/import/preview', ...importChain(importLimiter()), async (req, res) => {
    res.json(await importSvc.preview(req.user, req.validated.facultyId, req.file.buffer));
  });
  r.post('/import/confirm', ...importChain(importLimiter()), async (req, res) => {
    res.set('Cache-Control', 'no-store').json(await importSvc.confirm(req.user, req.validated.facultyId, req.file.buffer, req.ip));
  });

  r.get('/', adminOrStaff, validate(userListQuerySchema, 'query'), async (req, res) =>
    res.json(await svc.list(req.user, req.validated)),
  );
  r.get('/:id', adminOrStaff, async (req, res) => res.json(await svc.get(req.user, req.params.id)));
  r.post('/', writeLimiter, adminOrStaff, validate(userCreateSchema), async (req, res) => {
    res.set('Cache-Control', 'no-store').status(201).json(await svc.create(req.user, req.body, req.ip));
  });
  r.patch('/:id', adminOrStaff, validate(userUpdateSchema), async (req, res) => {
    res.json(await svc.update(req.user, req.params.id, req.body, req.ip));
  });
  r.delete('/:id', writeLimiter, requireRole('ADMIN'), async (req, res) => {
    await svc.remove(req.user, req.params.id, req.ip);
    res.status(204).end();
  });
  r.post('/:id/lock', adminOrStaff, async (req, res) => res.json(await svc.setLocked(req.user, req.params.id, true, req.ip)));
  r.post('/:id/unlock', adminOrStaff, async (req, res) => res.json(await svc.setLocked(req.user, req.params.id, false, req.ip)));
  r.post('/:id/reset-password', writeLimiter, adminOrStaff, async (req, res) => {
    res.set('Cache-Control', 'no-store').json(await svc.resetPassword(req.user, req.params.id, req.ip));
  });
  r.put('/:id/staff-scopes', requireRole('ADMIN'), validate(staffScopesSchema), async (req, res) => {
    res.json(await svc.setStaffScopes(req.user, req.params.id, req.body.facultyIds, req.ip));
  });
  return r;
};
