import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().optional(),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET tối thiểu 32 ký tự'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().default(900),      // 15 phút (FR01)
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(7),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  ENABLE_SWAGGER: z.stringbool().default(false), // coerce.boolean biến "false" thành true
  CLOUDINARY_URL: z.string().optional(),
  CLOUDINARY_FOLDER: z.string().trim().min(1).max(100).optional(), // mặc định nckh/<NODE_ENV> (storage.js)
  CRON_SECRET: z.string().optional(),
}).refine((e) => e.NODE_ENV !== 'production' || !!e.CLOUDINARY_URL, { message: 'Production cần CLOUDINARY_URL', path: ['CLOUDINARY_URL'] });

export const loadEnv = (source = process.env) => {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Cấu hình môi trường không hợp lệ – ${msg}`);
  }
  return parsed.data;
};
