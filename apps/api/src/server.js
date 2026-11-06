import { loadEnv } from './config/env.js';
import { createApp } from './app.js';
import { prisma } from './lib/prisma.js';
import { createAuthRepo } from './modules/auth/prismaRepo.js';
import { createCatalogRepo } from './modules/catalog/prismaRepo.js';
import { createRoundRepo } from './modules/rounds/prismaRepo.js';
import { createAccountRepo } from './modules/accounts/prismaRepo.js';
import { createTopicRepo } from './modules/topics/prismaRepo.js';
import { passwordHasher } from './lib/password.js';
import { createCloudinaryStorage, createMemoryStorage } from './lib/storage.js';
import { createLogger } from './lib/logger.js';

const env = loadEnv();
const logger = createLogger(env); // redact header bí mật: lib/logger.js
if (env.NODE_ENV === 'production' && !env.CRON_SECRET) logger.warn('Chưa có CRON_SECRET: endpoint nhắc hạn /api/cron/reminders bị tắt');

// Có CLOUDINARY_URL (SDK tự đọc) thì dùng Cloudinary thật; dev/test không có thì dùng kho giả trong bộ nhớ (production bắt buộc có: env.js)
let storage;
if (env.CLOUDINARY_URL) {
  const { v2: cloudinary } = await import('cloudinary');
  storage = createCloudinaryStorage({ cloudinary });
} else {
  logger.warn('Chưa có CLOUDINARY_URL: dùng kho file giả trong bộ nhớ (chỉ dành cho phát triển)');
  storage = createMemoryStorage();
}

const app = createApp({
  env,
  storage,
  logger,
  authRepo: createAuthRepo(prisma),
  hasher: passwordHasher,
  catalogRepo: createCatalogRepo(prisma),
  roundRepo: createRoundRepo(prisma),
  accountRepo: createAccountRepo(prisma),
  topicRepo: createTopicRepo(prisma),
  checkDb: () => prisma.$queryRaw`SELECT 1`.then(() => true),
});

app.listen(env.PORT, () => logger.info(`API chạy tại cổng ${env.PORT}`));
