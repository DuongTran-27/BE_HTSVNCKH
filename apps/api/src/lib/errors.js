export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
export const badRequest = (code, msg, details) => new AppError(400, code, msg, details);
export const unauthorized = (msg = 'Phiên đăng nhập không hợp lệ') => new AppError(401, 'UNAUTHORIZED', msg);
export const forbidden = (msg = 'Bạn không có quyền thực hiện thao tác này') => new AppError(403, 'FORBIDDEN', msg);
export const notFound = (msg = 'Không tìm thấy') => new AppError(404, 'NOT_FOUND', msg);
export const conflict = (code, msg, details) => new AppError(409, code, msg, details);
