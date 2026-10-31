import { AppError } from '../lib/errors.js';

// Định dạng lỗi chuẩn, không lộ stack trace (NFR02)
export const errorHandler = (logger) => (err, req, res, _next) => {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'BAD_JSON', message: 'JSON không hợp lệ' } });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Dữ liệu gửi lên quá lớn' } });
  }
  logger?.error({ err, reqId: req.id }, 'Unhandled error');
  return res.status(500).json({ error: { code: 'INTERNAL', message: 'Lỗi hệ thống, vui lòng thử lại', requestId: req.id } });
};
