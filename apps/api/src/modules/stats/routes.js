import { statsQuerySchema, formatVnDate } from '@nckh/shared';
import { validate } from '../../middlewares/validate.js';
import { requireRole } from '../../middlewares/auth.js';
import { createLimiter } from '../../middlewares/rateLimit.js';
import { businessRouter } from '../../lib/router.js';
import { writeXlsx } from './xlsx.js';
import { createStatsService } from './service.js';

// FR14 (API_GD45 §9.2): chỉ STAFF và LECTURER; phạm vi dữ liệu kiểm trong service. Chỉ đọc nên không ghi AuditLog.
export const statsRouter = ({ repo, guard, now = () => new Date() }) => {
  const svc = createStatsService({ repo });
  const r = businessRouter(guard);
  const roles = requireRole('STAFF', 'LECTURER');
  const query = validate(statsQuerySchema, 'query');
  r.get('/', roles, createLimiter({ windowMs: 15 * 60e3, limit: 60, keyBy: 'user' }), query, async (req, res) => {
    res.set('Cache-Control', 'no-store').json(await svc.computeStats(req.user, req.validated));
  });
  r.get('/export.csv', roles, createLimiter({ windowMs: 15 * 60e3, limit: 30, keyBy: 'user' }), query, async (req, res) => {
    const csv = await svc.exportCsv(req.user, req.validated);
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="thong-ke-${req.validated.groupBy}-${formatVnDate(now())}.csv"`,
      'Cache-Control': 'no-store',
    }).send(csv);
  });
  // FR39 (GD7 §10.3): cùng quyền, bộ lọc và limiter (30/15 phút) với CSV; lỗi (403/400 quá trần) xảy ra trước khi ghi byte nào.
  r.get('/export.xlsx', roles, createLimiter({ windowMs: 15 * 60e3, limit: 30, keyBy: 'user' }), query, async (req, res) => {
    const sheets = await svc.buildXlsxSheets(req.user, req.validated);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="thong-ke-${req.validated.groupBy}-${formatVnDate(now())}.xlsx"`,
      'Cache-Control': 'no-store',
    });
    await writeXlsx(res, sheets);
  });
  return r;
};
