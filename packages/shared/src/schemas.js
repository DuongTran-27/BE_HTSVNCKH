import { z } from 'zod';
import { DEFAULT_ROUND_CONFIG as C } from './enums.js';

export const countWords = (s = '') => s.trim().split(/\s+/).filter(Boolean).length;

const keywords = z.array(z.string().trim().min(1).max(60)).max(C.maxKeywords, `Tối đa ${C.maxKeywords} từ khóa`);

// Lưu nháp: cho phép thiếu trường (FR05)
export const topicDraftSchema = z.object({
  title: z.string().trim().max(300).optional().default(''),
  summary: z.string().trim().max(5000).optional().default(''),
  objectives: z.string().trim().max(3000).optional().default(''),
  keywords: keywords.optional().default([]),
  fieldId: z.string().optional().nullable(),
});

// Trước khi gửi: đủ trường bắt buộc (FR05). minWords lấy từ cấu hình đợt.
export const topicSubmitSchema = (cfg = C) => z.object({
  title: z.string().trim().min(10, 'Tên đề tài tối thiểu 10 ký tự').max(300),
  summary: z.string().trim().refine((s) => countWords(s) >= cfg.minSummaryWords, `Tóm tắt tối thiểu ${cfg.minSummaryWords} từ`),
  objectives: z.string().trim().min(20, 'Mục tiêu tối thiểu 20 ký tự'),
  keywords: z.array(z.string().trim().min(1)).min(cfg.minKeywords, `Cần ít nhất ${cfg.minKeywords} từ khóa`).max(cfg.maxKeywords, `Tối đa ${cfg.maxKeywords} từ khóa`),
  fieldId: z.string({ required_error: 'Chọn lĩnh vực' }).min(1, 'Chọn lĩnh vực'),
});

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'Nhập mã hoặc email'),
  password: z.string().min(1, 'Nhập mật khẩu'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự')
    .regex(/[A-Za-z]/, 'Cần có chữ').regex(/\d/, 'Cần có số'),
});

export const reasonSchema = z.object({ reason: z.string().trim().min(5, 'Lý do tối thiểu 5 ký tự').max(2000) });
