import { AppError } from '../lib/errors.js';

// Lỗi Prisma nhận diện theo hình dạng (name/code), không import lớp để lỗi giả trong test cũng khớp.
const isPrismaError = (e) => typeof e?.name === 'string' && e.name.startsWith('PrismaClient');
const isLockContention = (e) =>
  (e.code === 'P2010' && e.meta?.code === '55P03') ||
  e.code === 'P2034' ||
  ((e.code === undefined || e.code === 'P2010') && /55P03|lock timeout/i.test(String(e.message)));

// P2002 -> details { trường-request: 'Đã tồn tại' } nếu MỌI cột trong meta.target ánh xạ được qua req.duplicateFields
const duplicateDetails = (req, err) => {
  const target = [].concat(err.meta?.target ?? []);
  const map = req.duplicateFields;
  if (!map || !target.length || !target.every((c) => map[c])) return undefined;
  return Object.fromEntries(target.map((c) => [map[c], 'Đã tồn tại']));
};

// Định dạng lỗi chuẩn, không lộ stack trace (NFR02)
export const errorHandler = (logger) => (err, req, res, next) => {
  // Lỗi khi đã gửi header (vd. đang stream file Excel): không ghi JSON được nữa – ghi log rồi để Express hủy kết nối
  if (res.headersSent) {
    logger?.error({ err, reqId: req.id }, 'Error after headers sent');
    return next(err);
  }
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (isPrismaError(err)) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: { code: 'DUPLICATE', message: 'Dữ liệu đã tồn tại', details: duplicateDetails(req, err) } });
    }
    if (err.code === 'P2025') return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Không tìm thấy' } });
    // Khóa ngoại: bản ghi được tham chiếu không còn (vd. người thực hiện bị xóa khi request đang chạy) – đã rollback
    if (err.code === 'P2003') {
      return res.status(409).json({ error: { code: 'REFERENCE_CHANGED', message: 'Dữ liệu liên quan vừa thay đổi, vui lòng tải lại' } });
    }
    if (err.code === 'P2028') { // transaction hết hạn / hết maxWait: quá tải, không phải xung đột dữ liệu (đã rollback)
      logger?.warn({ reqId: req.id, code: err.code }, 'Transaction hết hạn');
      return res.status(503).json({ error: { code: 'SERVICE_BUSY', message: 'Hệ thống đang bận, vui lòng thử lại sau' } });
    }
    if (isLockContention(err)) {
      return res.status(409).json({
        error: { code: 'CONCURRENT_UPDATE', message: 'Dữ liệu vừa được người khác cập nhật, vui lòng tải lại' },
      });
    }
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
