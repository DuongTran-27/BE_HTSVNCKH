import pino from 'pino';

// Không ghi token/CRON_SECRET/cookie vào log (pino-http log cả header của request). Có test: tests/T601-change-requests.test.js
export const LOG_REDACT = ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'];
export const createLogger = (env, destination) =>
  pino({ level: env.NODE_ENV === 'production' ? 'info' : 'debug', redact: LOG_REDACT }, destination);
