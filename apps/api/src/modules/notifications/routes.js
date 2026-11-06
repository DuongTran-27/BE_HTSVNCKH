import { createHash, timingSafeEqual } from 'node:crypto';
import { notificationListQuerySchema, emptyBodySchema, idSchema } from '@nckh/shared';
import { validate } from '../../middlewares/validate.js';
import { createLimiter } from '../../middlewares/rateLimit.js';
import { notFound, unauthorized } from '../../lib/errors.js';
import { businessRouter } from '../../lib/router.js';
import { createNotificationService, createReminderService } from './service.js';
import { createSimilarityRecheckService } from '../similarity/recheck.js';

// FR13 (API_GD45 §8.1): mọi vai trò đã đăng nhập (kể cả ADMIN – danh sách rỗng), chỉ thông báo của chính mình. Không ghi AuditLog.
export const notificationsRouter = ({ repo, now, guard }) => {
  const svc = createNotificationService({ repo, now });
  const r = businessRouter(guard);
  r.param('id', (_req, _res, next, id) => {
    if (!idSchema.safeParse(id).success) throw notFound();
    next();
  });
  r.get('/', validate(notificationListQuerySchema, 'query'), async (req, res) => res.json(await svc.list(req.user, req.validated)));
  r.get('/unread-count', async (req, res) => res.json(await svc.unreadCount(req.user)));
  r.post('/read-all', validate(emptyBodySchema), async (req, res) => {
    await svc.markAllRead(req.user);
    res.status(204).end();
  });
  r.post('/:id/read', validate(emptyBodySchema), async (req, res) => {
    await svc.markRead(req.user, req.params.id);
    res.status(204).end();
  });
  return r;
};

const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest();

// Xác thực bộ lập lịch (§8.4): chưa cấu hình → 404 (coi như không có endpoint); so sánh thời gian hằng trên băm
// (độ dài bằng nhau). Không log/không đưa giá trị header vào lỗi.
export const requireCronSecret = (secret) => (req, _res, next) => {
  if (!secret) throw notFound('Không tìm thấy đường dẫn');
  const header = req.get('authorization') ?? '';
  const given = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!timingSafeEqual(sha256(given), sha256(secret))) throw unauthorized('Không có quyền gọi tác vụ định kỳ');
  next();
};

// Không qua guard người dùng: "guard" của router này là limiter theo IP + bí mật CRON_SECRET.
export const cronRouter = ({ repo, env, now, logger }) => {
  const reminders = createReminderService({ repo, now, logger });
  const rechecks = createSimilarityRecheckService({ repo, now, logger });
  const r = businessRouter([createLimiter({ windowMs: 15 * 60e3, limit: 10, keyBy: 'ip' }), requireCronSecret(env.CRON_SECRET)]);
  r.post('/reminders', async (_req, res) => {
    const out = await reminders.run();
    res.set('Cache-Control', 'no-store').json(out);
  });
  // G5 (API_GD6 §9.5): chạy lại FR06 cho lần gửi "chưa kiểm tra" (m5 reviews/T600-reviewer-v1.md)
  r.post('/similarity-rechecks', async (_req, res) => res.set('Cache-Control', 'no-store').json(await rechecks.run()));
  return r;
};
