import pino from 'pino';

// Không ghi token/CRON_SECRET/cookie vào log (pino-http log cả header của request). Có test: tests/T601-change-requests.test.js
export const LOG_REDACT = ['req.headers.authorization', 'req.headers.cookie', 'req.headers["x-nckh-origin"]', 'res.headers["set-cookie"]'];
// Bỏ query của callback Google khỏi log request: chứa `code` và `state` (review TASK-DC-03 bao-mat m1)
export const logReq = (req) => {
  if (req.url?.startsWith('/api/auth/google/callback')) {
    req.url = req.url.split('?')[0];
    delete req.query;
  }
  return req;
};
export const createLogger = (env, destination) =>
  pino({ level: env.NODE_ENV === 'production' ? 'info' : 'debug', redact: LOG_REDACT }, destination);
