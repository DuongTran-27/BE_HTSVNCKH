import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { errorHandler } from './middlewares/errorHandler.js';
import { createRequireAuth, requirePasswordChanged } from './middlewares/auth.js';
import { createAuthService } from './modules/auth/service.js';
import { authRouter } from './modules/auth/routes.js';
import { notFound } from './lib/errors.js';
import { catalogRouters } from './modules/catalog/routes.js';
import { roundsRouter } from './modules/rounds/routes.js';
import { accountsRouter } from './modules/accounts/routes.js';
import { topicsRouter, meRouter } from './modules/topics/routes.js';
import { advisorRequestsRouter, lecturersRouter } from './modules/topics/advisorRoutes.js';
import { invitationsRouter } from './modules/topics/invitationRoutes.js';
import { repositoryRouter } from './modules/topics/repositoryRoutes.js';
import { defaultStorageFolder } from './lib/storage.js';
import { milestonesRouter, progressRouter, documentsRouter } from './modules/execution/routes.js';
import { notificationsRouter, cronRouter } from './modules/notifications/routes.js';
import { statsRouter } from './modules/stats/routes.js';
import { changeRequestRoutes } from './modules/changeRequests/routes.js';
import { buildOpenApi, swaggerHtml, swaggerInit } from './openapi/spec.js';

/**
 * Tạo ứng dụng với phụ thuộc được tiêm vào để test không cần database thật.
 * deps: { env, logger, authRepo, hasher, catalogRepo, roundRepo, accountRepo, checkDb }
 */
export const createApp = ({ env, logger, authRepo, hasher, catalogRepo, roundRepo, accountRepo, topicRepo, storage, genPassword, checkDb = async () => true }) => {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // sau proxy của Vercel/Render
  app.use(pinoHttp({ logger, genReqId: (req) => { const id = req.get('x-request-id'); return id && /^[\w-]{1,64}$/.test(id) ? id : randomUUID(); }, autoLogging: env.NODE_ENV !== 'test' }));
  if (env.ORIGIN_SECRET) {
    // Chỉ nhận request qua proxy Vercel (gắn header bí mật); gọi thẳng Render -> 404 chuẩn. Chỉ miễn đúng GET /api/health.
    const secret = Buffer.from(env.ORIGIN_SECRET);
    app.use((req, _res, next) => {
      if (req.method === 'GET' && req.path === '/api/health') return next();
      const got = Buffer.from(String(req.get('x-nckh-origin') ?? ''));
      if (got.length !== secret.length || !timingSafeEqual(got, secret)) throw notFound('Không tìm thấy đường dẫn');
      next();
    });
  }
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean), credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  const authService = createAuthService({ repo: authRepo, hasher, env });
  const requireAuth = createRequireAuth({ env, loadUser: authRepo.findUserById });

  app.get('/api/health', async (req, res) => {
    if (env.LOG_PROXY_HOPS) req.log.info({ ips: req.ips, xff: req.get('x-forwarded-for') }, 'proxy hops'); // tạm, gỡ sau khi đo (VAN_HANH §6.4 mục 3)
    const db = await checkDb().catch(() => false);
    res.status(db ? 200 : 503).json({ status: db ? 'ok' : 'degraded', db });
  });
  // NFR08: tài liệu API chỉ có ngoài production và khi ENABLE_SWAGGER bật; production rơi xuống 404 chuẩn.
  if (env.NODE_ENV !== 'production' && env.ENABLE_SWAGGER) {
    const doc = buildOpenApi();
    app.get('/api/openapi.json', (_req, res) => res.json(doc));
    app.get('/api/docs', (_req, res) => res.set('Content-Security-Policy', "default-src 'self'; script-src 'self' https://unpkg.com; style-src 'self' https://unpkg.com 'unsafe-inline'; img-src 'self' data:; connect-src 'self'").type('html').send(swaggerHtml));
    app.get('/api/docs/init.js', (_req, res) => res.type('js').send(swaggerInit));
  }
  app.use('/api/auth', authRouter({ authService, requireAuth, env }));

  // Router nghiệp vụ nhận `guard` và tự gắn đầu router (lib/router.js), mount ở tiền tố riêng.
  const guard = [requireAuth, requirePasswordChanged];
  const folder = defaultStorageFolder(env);
  if (catalogRepo) {
    for (const [prefix, router] of Object.entries(catalogRouters({ repo: catalogRepo, guard }))) app.use(`/api/${prefix}`, router);
  }
  if (roundRepo) app.use('/api/rounds', roundsRouter({ repo: roundRepo, guard }));
  if (accountRepo) app.use('/api/users', accountsRouter({ repo: accountRepo, hasher, guard, genPassword }));

  if (topicRepo) {
    const changeRequests = changeRequestRoutes({ repo: topicRepo, guard });
    app.use('/api/topics', topicsRouter({ repo: topicRepo, guard, logger, storage, folder, mountExtra: changeRequests.mountTopicRoutes }));
    app.use('/api/change-requests', changeRequests.router);
    app.use('/api/me', meRouter({ repo: topicRepo, guard }));
    app.use('/api/advisor-requests', advisorRequestsRouter({ repo: topicRepo, guard }));
    app.use('/api/lecturers', lecturersRouter({ repo: topicRepo, guard }));
    app.use('/api/invitations', invitationsRouter({ repo: topicRepo, guard }));
    app.use('/api/repository', repositoryRouter({ repo: topicRepo, guard }));
    app.use('/api/milestones', milestonesRouter({ repo: topicRepo, guard }));
    app.use('/api/documents', documentsRouter({ repo: topicRepo, guard, storage, folder, logger }));
    app.use('/api/progress', progressRouter({ repo: topicRepo, guard }));
    app.use('/api/notifications', notificationsRouter({ repo: topicRepo, guard }));
    app.use('/api/stats', statsRouter({ repo: topicRepo, guard }));
    app.use('/api/cron', cronRouter({ repo: topicRepo, env, logger })); // bộ lập lịch ngoài (FR13), không qua guard người dùng
  }

  app.use((_req, _res) => { throw notFound('Không tìm thấy đường dẫn'); });
  app.use(errorHandler(logger));
  return app;
};
