import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { randomUUID } from 'node:crypto';
import { errorHandler } from './middlewares/errorHandler.js';
import { createRequireAuth, requirePasswordChanged } from './middlewares/auth.js';
import { createAuthService } from './modules/auth/service.js';
import { authRouter } from './modules/auth/routes.js';
import { notFound } from './lib/errors.js';
import { catalogRouters } from './modules/catalog/routes.js';
import { roundsRouter } from './modules/rounds/routes.js';
import { accountsRouter } from './modules/accounts/routes.js';
import { topicsRouter } from './modules/topics/routes.js';
import { advisorRequestsRouter, lecturersRouter } from './modules/topics/advisorRoutes.js';
import { invitationsRouter } from './modules/topics/invitationRoutes.js';
import { repositoryRouter } from './modules/topics/repositoryRoutes.js';
import { defaultStorageFolder } from './lib/storage.js';
import { milestonesRouter, progressRouter, documentsRouter } from './modules/execution/routes.js';
import { notificationsRouter, cronRouter } from './modules/notifications/routes.js';

/**
 * Tạo ứng dụng với phụ thuộc được tiêm vào để test không cần database thật.
 * deps: { env, logger, authRepo, hasher, catalogRepo, roundRepo, accountRepo, checkDb }
 */
export const createApp = ({ env, logger, authRepo, hasher, catalogRepo, roundRepo, accountRepo, topicRepo, storage, genPassword, checkDb = async () => true }) => {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // sau proxy của Vercel/Render
  app.use(pinoHttp({ logger, genReqId: (req) => req.get('x-request-id') ?? randomUUID(), autoLogging: env.NODE_ENV !== 'test' }));
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN.split(','), credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  const authService = createAuthService({ repo: authRepo, hasher, env });
  const requireAuth = createRequireAuth({ env, loadUser: authRepo.findUserById });

  app.get('/api/health', async (_req, res) => {
    const db = await checkDb().catch(() => false);
    res.status(db ? 200 : 503).json({ status: db ? 'ok' : 'degraded', db });
  });
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
    app.use('/api/topics', topicsRouter({ repo: topicRepo, guard, logger, storage, folder }));
    app.use('/api/advisor-requests', advisorRequestsRouter({ repo: topicRepo, guard }));
    app.use('/api/lecturers', lecturersRouter({ repo: topicRepo, guard }));
    app.use('/api/invitations', invitationsRouter({ repo: topicRepo, guard }));
    app.use('/api/repository', repositoryRouter({ repo: topicRepo, guard }));
    app.use('/api/milestones', milestonesRouter({ repo: topicRepo, guard }));
    app.use('/api/documents', documentsRouter({ repo: topicRepo, guard, storage, folder, logger }));
    app.use('/api/progress', progressRouter({ repo: topicRepo, guard }));
    app.use('/api/notifications', notificationsRouter({ repo: topicRepo, guard }));
    app.use('/api/cron', cronRouter({ repo: topicRepo, env, logger })); // bộ lập lịch ngoài (FR13), không qua guard người dùng
  }

  app.use((_req, _res) => { throw notFound('Không tìm thấy đường dẫn'); });
  app.use(errorHandler(logger));
  return app;
};
