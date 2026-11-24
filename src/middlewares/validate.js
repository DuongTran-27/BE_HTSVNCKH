import { badRequest } from '../lib/errors.js';

// Backend kiểm tra độc lập với frontend (dùng chung schema Zod)
export const validate = (schema, source = 'body') => (req, _res, next) => {
  const parsed = schema.safeParse(req[source]);
  if (!parsed.success) {
    const fields = Object.fromEntries(parsed.error.issues.slice(0, 50).map((i) => [i.path.join('.') || '_', i.message]));
    throw badRequest('VALIDATION_ERROR', 'Dữ liệu không hợp lệ', fields);
  }
  if (source === 'body') req.body = parsed.data;
  else req.validated = parsed.data;
  next();
};
