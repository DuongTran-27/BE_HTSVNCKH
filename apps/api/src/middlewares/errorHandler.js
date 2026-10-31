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
  // Lỗi 4xx khác của body-parser/http-errors (content-encoding lạ, gzip hỏng...): lỗi phía client,
  // trả đúng status, thông điệp cố định (không lộ message gốc), không ghi log error (QD_ZOD §4.2)
  if (err?.expose && err.status >= 400 && err.status < 500) {
    logger?.warn({ reqId: req.id, type: err.type, status: err.status }, 'Client error');
    return err.status === 415
      ? res.status(415).json({ error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Định dạng dữ liệu gửi lên không được hỗ trợ' } })
      : res.status(err.status).json({ error: { code: 'BAD_REQUEST', message: 'Yêu cầu không hợp lệ' } });
  }
  logger?.error({ err, reqId: req.id }, 'Unhandled error');
  return res.status(500).json({ error: { code: 'INTERNAL', message: 'Lỗi hệ thống, vui lòng thử lại', requestId: req.id } });
};
