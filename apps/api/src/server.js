import pino from 'pino';
import { loadEnv } from './config/env.js';
import { createApp } from './app.js';
import { prisma } from './lib/prisma.js';
import { createAuthRepo } from './modules/auth/prismaRepo.js';
import { createCatalogRepo } from './modules/catalog/prismaRepo.js';
import { createRoundRepo } from './modules/rounds/prismaRepo.js';
import { passwordHasher } from './lib/password.js';

const env = loadEnv();
const logger = pino({ level: env.NODE_ENV === 'production' ? 'info' : 'debug' });

const app = createApp({
  env,
  logger,
  authRepo: createAuthRepo(prisma),
  hasher: passwordHasher,
  catalogRepo: createCatalogRepo(prisma),
  roundRepo: createRoundRepo(prisma),
  checkDb: () => prisma.$queryRaw`SELECT 1`.then(() => true),
});

app.listen(env.PORT, () => logger.info(`API chạy tại cổng ${env.PORT}`));
