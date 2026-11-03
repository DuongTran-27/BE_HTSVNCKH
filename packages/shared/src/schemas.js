import { z } from 'zod';
import { isoDateTime } from './catalog.js';
import { DEFAULT_ROUND_CONFIG as C, TOPIC_STATUS, FINAL_RESULT } from './enums.js';

// Thông điệp mặc định tiếng Việt; có hiệu lực cho cả api vì chỉ có một bản zod (QD_ZOD §2)
z.config(z.locales.vi());

export const countWords = (s = '') => s.trim().split(/\s+/).filter(Boolean).length;

// Mức .max() dùng chung cho nháp và gửi (QD_ZOD §5.1, §5.8)
const title = z.string().trim().max(300);
const objectives = z.string().trim().max(3000);
const keyword = z.string().trim().min(1).max(60);
const fieldId = z.string({ error: 'Chọn lĩnh vực' }).max(64);
export const SUMMARY_MAX = 5000;
// Trần cứng của nháp = trần maxKeywords của đợt (API_GD2 §11); kiểm theo đợt ở service và topicSubmitSchema(cfg)
export const KEYWORDS_HARD_MAX = 10;
const password = z.string().max(128);

// Lưu nháp: cho phép thiếu trường (FR05)
export const topicDraftSchema = z.object({
  title: title.optional().default(''),
  summary: z.string().trim().max(SUMMARY_MAX).optional().default(''),
  objectives: objectives.optional().default(''),
  keywords: z.array(keyword).max(KEYWORDS_HARD_MAX, `Tối đa ${KEYWORDS_HARD_MAX} từ khóa`).optional().default([]),
  fieldId: fieldId.optional().nullable(),
});

// Trước khi gửi: đủ trường bắt buộc (FR05). minWords lấy từ cấu hình đợt.
export const topicSubmitSchema = (cfg = C) => z.object({
  title: title.min(10, 'Tên đề tài tối thiểu 10 ký tự'),
  // abort: không đếm từ trên chuỗi quá dài (QD_ZOD §5.9b)
  summary: z.string().trim().max(SUMMARY_MAX, { error: `Tóm tắt tối đa ${SUMMARY_MAX} ký tự`, abort: true })
    .refine((s) => countWords(s) >= cfg.minSummaryWords, `Tóm tắt tối thiểu ${cfg.minSummaryWords} từ`),
  objectives: objectives.min(20, 'Mục tiêu tối thiểu 20 ký tự'),
  keywords: z.array(keyword).min(cfg.minKeywords, `Cần ít nhất ${cfg.minKeywords} từ khóa`).max(cfg.maxKeywords, `Tối đa ${cfg.maxKeywords} từ khóa`),
  fieldId: fieldId.min(1, 'Chọn lĩnh vực'),
});

// API_GD2 §5.1: tạo = nháp + roundId; sửa = nháp + version (PUT thay toàn bộ)
export const topicCreateSchema = topicDraftSchema.extend({ roundId: z.string().trim().min(1).max(64) });
export const topicUpdateSchema = topicDraftSchema.extend({ version: z.int().min(0) });

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'Nhập mã hoặc email').max(300),
  password: password.min(1, 'Nhập mật khẩu'),
});

export const changePasswordSchema = z.object({
  currentPassword: password.min(1),
  newPassword: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự').max(128)
    .regex(/[A-Za-z]/, 'Cần có chữ').regex(/\d/, 'Cần có số'),
});

export const reasonSchema = z.object({ reason: z.string().trim().min(5, 'Lý do tối thiểu 5 ký tự').max(2000) });

// API_GD2 §5.3–5.4: lời mời mời theo mã sinh viên; đổi trưởng nhóm kèm version
export const invitationCreateSchema = z.object({ inviteeCode: z.string().trim().min(1, 'Nhập mã sinh viên').max(64) });
export const leaderTransferSchema = z.object({ userId: z.string().trim().min(1).max(64), version: z.int().min(0) });
export const invitationListQuerySchema = z.object({
  status: z.enum(['PENDING', 'ACCEPTED', 'DECLINED', 'WITHDRAWN']).optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// API_GD2 §6, §8.1. T210 tạo union với nhánh FR16; T212a thêm nhánh gửi/gửi lại/xét duyệt.
const version = z.int().min(0);
export const topicActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('REQUEST_ADVISOR'), version, lecturerId: z.string().trim().min(1).max(64) }),
  z.object({ action: z.literal('ACCEPT_ADVISING'), version }),
  z.object({ action: z.literal('WITHDRAW_ADVISOR_REQUEST'), version }),
  reasonSchema.extend({ action: z.literal('DECLINE_ADVISING'), version }),
  // T212a (§8.1): gửi/gửi lại kèm giải trình tùy chọn; quyết định xét duyệt gắn đúng snapshot
  ...['SUBMIT_FOR_REVIEW', 'RESUBMIT'].map((a) => z.object({ action: z.literal(a), version, justification: z.string().trim().max(5000, 'Giải trình tối đa 5000 ký tự').optional() })),
  ...['REQUEST_REVISION', 'REJECT'].map((a) => reasonSchema.extend({ action: z.literal(a), version, submissionId: z.string().trim().min(1).max(64) })),
  z.object({ action: z.literal('APPROVE'), version, submissionId: z.string().trim().min(1).max(64) }),
]);
// Body rỗng (POST similarity-checks): thiếu body coi như {}, trường thừa bị từ chối
export const emptyBodySchema = z.preprocess((v) => v ?? {}, z.strictObject({}));
// FR17: số thứ tự snapshot và so sánh hai snapshot (API_GD2 §8.4)
export const submissionSeqSchema = z.coerce.number().int().min(1).max(10000);
export const submissionDiffQuerySchema = z.object({ from: submissionSeqSchema, to: submissionSeqSchema })
  .refine((v) => v.from !== v.to, { message: 'Hai phiên bản phải khác nhau', path: ['to'] });
const reqStatus = z.enum(['PENDING', 'ACCEPTED', 'DECLINED', 'WITHDRAWN']);
const pageQuery = { page: z.coerce.number().int().min(1).max(10000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) };
export const advisorRequestListQuerySchema = z.object({ status: reqStatus.optional(), roundId: z.string().max(64).optional(), ...pageQuery });
export const lecturerListQuerySchema = z.object({ roundId: z.string().trim().min(1).max(64), q: z.string().trim().max(200).optional(), ...pageQuery });

// FR08: danh sách đề tài theo phạm vi (API_GD2 §9.1). Chuỗi rỗng coi như không lọc.
const emptyToUndef = (v) => (v === '' ? undefined : v);
const opt = (s) => z.preprocess(emptyToUndef, s.optional());
export const TOPIC_SORTS = ['updatedAt_desc', 'updatedAt_asc', 'code_asc', 'title_asc'];
export const topicListQuerySchema = z.object({
  roundId: opt(z.string().trim().max(64)),
  academicYear: opt(z.string().max(9).regex(/^\d{4}-\d{4}$/, 'Năm học dạng 2026-2027')),
  fieldId: opt(z.string().trim().max(64)),
  lecturerId: opt(z.string().trim().max(64)),
  status: opt(z.enum(Object.values(TOPIC_STATUS))),
  result: opt(z.enum(Object.values(FINAL_RESULT))),
  q: opt(z.string().trim().max(200)),
  sort: z.preprocess(emptyToUndef, z.enum(TOPIC_SORTS).default('updatedAt_desc')),
  ...pageQuery,
});
// FR08: kho chung (API_GD2 §9.2) – chỉ kết quả đạt
export const REPOSITORY_RESULTS = ['EXCELLENT', 'GOOD', 'PASS'];
export const repositoryQuerySchema = z.object({
  academicYear: topicListQuerySchema.shape.academicYear,
  fieldId: topicListQuerySchema.shape.fieldId,
  result: opt(z.enum(REPOSITORY_RESULTS)),
  q: topicListQuerySchema.shape.q,
  ...pageQuery,
});

// FR09 (API_GD45 §3.2). Sửa mốc không có dueAt: đổi hạn qua milestoneDueChangeSchema để luôn có lịch sử.
const msName = z.string().trim().min(1, 'Nhập tên mốc').max(300);
const msOutput = z.string().trim().min(1, 'Nhập đầu ra yêu cầu').max(2000);
export const milestoneCreateSchema = z.object({ name: msName, output: msOutput, dueAt: isoDateTime, required: z.boolean().default(true) });
export const milestoneUpdateSchema = z.strictObject({ version, name: msName.optional(), output: msOutput.optional(), required: z.boolean().optional() })
  .refine((v) => v.name !== undefined || v.output !== undefined || v.required !== undefined, { message: 'Cần ít nhất một trường để sửa', path: ['name'] });
export const milestoneDueChangeSchema = reasonSchema.extend({ version, newDueAt: isoDateTime });
