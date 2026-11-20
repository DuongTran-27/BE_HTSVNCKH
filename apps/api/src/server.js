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
import { missingGoogleEnv, missingSmtpEnv } from './config/env.js';
import { setEmailOutbox } from './modules/notifications/notify.js';
import { dispatchEmails } from './modules/notifications/email.js';

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

// SSO Google tùy chọn (FR28): thiếu biến → tắt, chỉ log TÊN biến thiếu
const missingGoogle = missingGoogleEnv(env);
let google;
if (missingGoogle.length) logger.warn({ missing: missingGoogle }, 'Đăng nhập Google tắt: thiếu biến môi trường');
else {
  const { OAuth2Client } = await import('google-auth-library');
  google = new OAuth2Client({ clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET });
}

// Email thông báo tùy chọn (FR29, API_GD7 §9): thiếu biến → tắt, log TÊN biến thiếu một lần. Chỉ chạy ở đây, không trong app.js (test không gửi ngầm).
const missingSmtp = missingSmtpEnv(env);
if (missingSmtp.length) logger.info({ missing: missingSmtp }, 'Email thông báo tắt: thiếu biến môi trường');
else {
  const { default: nodemailer } = await import('nodemailer');
  const secure = env.SMTP_SECURE ?? env.SMTP_PORT === 465;
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST, port: env.SMTP_PORT, secure,
    requireTLS: !secure, // cổng 587: bắt buộc STARTTLS, máy chủ không hỗ trợ thì báo lỗi thay vì gửi SMTP_PASS không mã hóa (DC-20 bao-mat m1)
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    // Máy chủ mail treo không được giữ một lượt gửi quá ngưỡng coi là treo (15 phút) → tránh gửi trùng (review DC-04 bao-mat m2)
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 30_000,
  });
  setEmailOutbox(true);
  const send = () => dispatchEmails({ prisma, transport, from: env.SMTP_FROM, appUrl: env.PUBLIC_APP_URL, logger })
    .catch((e) => logger.error({ errName: e?.name }, 'Bộ gửi email thông báo lỗi'));
  setInterval(send, 60_000);
}

const app = createApp({
  google,
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
