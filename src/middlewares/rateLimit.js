import rateLimit from 'express-rate-limit';
import { AppError } from '../lib/errors.js';

// Factory duy nhất cho mọi limiter (QD_ZOD §4.2): 429 đi qua errorHandler với mã chuẩn, tiếng Việt.
// keyBy 'ip': gộp IPv6 theo /56; keyBy 'user': theo req.user.id, phải đứng sau requireAuth.
// v8 cấm đặt cùng lúc ipv6Subnet và keyGenerator (ERR_ERL_IPV6SUBNET_OR_KEYGENERATOR) nên tách hai nhánh.
// shortcut: store trong bộ nhớ chỉ đúng với 1 instance, đổi sang store/khóa dùng chung khi scale ngang.
// requestWasSuccessful: tùy chọn, cho route luôn trả 302 (callback SSO) tự báo lần nào thành công (n1 BM DC-00 v2).
export const createLimiter = ({ windowMs, limit, keyBy, skipSuccessfulRequests = false, requestWasSuccessful }) => {
  if (keyBy !== 'ip' && keyBy !== 'user') throw new Error(`createLimiter: keyBy không hợp lệ: ${keyBy}`);
  return rateLimit({
    windowMs,
    limit,
    skipSuccessfulRequests,
    ...(requestWasSuccessful && { requestWasSuccessful }),
    standardHeaders: true,
    legacyHeaders: false,
    ...(keyBy === 'ip' ? { ipv6Subnet: 56 } : { keyGenerator: (req) => req.user.id }),
    handler: (_req, _res, next) => next(new AppError(429, 'RATE_LIMITED', 'Thao tác quá nhiều lần, vui lòng thử lại sau')),
  });
};
