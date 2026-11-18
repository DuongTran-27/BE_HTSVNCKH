import { z } from 'zod';

// SSO Google (FR28, API_GD7 §8.1): tùy chọn; chuỗi rỗng coi như thiếu để "tắt êm" thay vì làm server không khởi động.
const optional = (t) => z.preprocess((v) => (v === '' ? undefined : v), t.optional());
const DOMAIN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
export const GOOGLE_ENV_KEYS = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_ALLOWED_DOMAINS', 'PUBLIC_APP_URL'];

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().optional(),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET tối thiểu 32 ký tự'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().max(900).default(900), // ≤ 15 phút (FR01)
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().max(30).default(7), // đặc tả không nêu; trần 30 ngày để phiên bị đánh cắp không sống vô hạn
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  ENABLE_SWAGGER: z.stringbool().default(false), // coerce.boolean biến "false" thành true
  CLOUDINARY_URL: z.string().optional(),
  CLOUDINARY_FOLDER: z.string().trim().min(1).max(100).optional(), // mặc định nckh/<NODE_ENV> (storage.js)
  CRON_SECRET: z.string().min(32, 'CRON_SECRET tối thiểu 32 ký tự').optional(), // thiếu thì /api/cron trả 404
  ORIGIN_SECRET: z.string().min(32, 'ORIGIN_SECRET tối thiểu 32 ký tự').optional(), // header x-nckh-origin do proxy Vercel gắn (T706)
  GOOGLE_CLIENT_ID: optional(z.string().trim().min(1)),
  GOOGLE_CLIENT_SECRET: optional(z.string().min(1)),
  // Danh sách tên miền, cách nhau bằng dấu phẩy (SV và GV có thể khác tên miền – m4 BM)
  GOOGLE_ALLOWED_DOMAINS: optional(z.string().transform((v) => v.split(',').map((d) => d.trim().toLowerCase()).filter(Boolean))
    .pipe(z.array(z.string().regex(DOMAIN, 'Tên miền không hợp lệ')).min(1))),
  // URL trang web (Vercel), là gốc của redirect_uri Google và đích chuyển hướng sau SSO
  PUBLIC_APP_URL: optional(z.url({ protocol: /^https?$/ }).refine((v) => !v.endsWith('/'), 'PUBLIC_APP_URL không có dấu / ở cuối')),
  LOG_PROXY_HOPS: z.stringbool().default(false), // tạm: log req.ips/x-forwarded-for ở /api/health để đo số hop
}).refine((e) => e.NODE_ENV !== 'production' || !!e.CLOUDINARY_URL, { message: 'Production cần CLOUDINARY_URL', path: ['CLOUDINARY_URL'] })
  .refine((e) => e.NODE_ENV !== 'production' || !!e.ORIGIN_SECRET, { message: 'Production cần ORIGIN_SECRET', path: ['ORIGIN_SECRET'] })
  .refine((e) => e.NODE_ENV !== 'production' || !e.PUBLIC_APP_URL || e.PUBLIC_APP_URL.startsWith('https://'), { message: 'Production cần PUBLIC_APP_URL https', path: ['PUBLIC_APP_URL'] });

// Tên biến Google còn thiếu (rỗng = SSO bật). Chỉ trả tên, không bao giờ trả giá trị.
export const missingGoogleEnv = (env) => GOOGLE_ENV_KEYS.filter((k) => !env[k]);

export const loadEnv = (source = process.env) => {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Cấu hình môi trường không hợp lệ – ${msg}`);
  }
  return parsed.data;
};
