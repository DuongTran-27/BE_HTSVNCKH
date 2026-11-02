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

/**
 * Tạo ứng dụng với phụ thuộc được tiêm vào để test không cần database thật.
 * deps: { env, logger, authRepo, hasher, catalogRepo, roundRepo, checkDb }
 */
export const createApp = ({ env, logger, authRepo, hasher, catalogRepo, roundRepo, checkDb = async () => true }) => {
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
  if (catalogRepo) {
    for (const [prefix, router] of Object.entries(catalogRouters({ repo: catalogRepo, guard }))) app.use(`/api/${prefix}`, router);
  }
  if (roundRepo) app.use('/api/rounds', roundsRouter({ repo: roundRepo, guard }));

  app.use((_req, _res) => { throw notFound('Không tìm thấy đường dẫn'); });
  app.use(errorHandler(logger));
  return app;
};
