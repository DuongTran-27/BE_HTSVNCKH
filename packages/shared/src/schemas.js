import { z } from 'zod';
import { isoDateTime, idSchema } from './catalog.js';
import { DEFAULT_ROUND_CONFIG as C, TOPIC_STATUS, FINAL_RESULT, DOCUMENT_STAGES, STATS_GROUP_BY, CHANGE_TYPE, CHANGE_STAGE } from './enums.js';

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
  // T405 (API_GD45 §7.1): đóng đề tài; CANCEL không gọi qua /actions – chỉ khi cán bộ duyệt đề nghị hủy (API_GD6 §4)
  ...['REQUEST_CLOSE', 'CONFIRM_CLOSE'].map((a) => z.object({ action: z.literal(a), version })),
  ...['RETURN_TO_ADVISOR', 'CLOSE_EXPIRED'].map((a) => reasonSchema.extend({ action: z.literal(a), version })),
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

// FR10 (API_GD45 §4.2): % tự khai 0–100; sửa = partial, strict, ít nhất một trường
const pgDone = z.string().trim().min(1, 'Nhập việc đã làm').max(3000);
const pgIssues = z.string().trim().max(3000);
const pgNext = z.string().trim().min(1, 'Nhập kế hoạch tiếp theo').max(3000);
const pgPercent = z.int({ error: 'Phần trăm phải là số nguyên' }).min(0, 'Từ 0 đến 100').max(100, 'Từ 0 đến 100');
export const progressCreateSchema = z.object({ done: pgDone, issues: pgIssues.default(''), nextPlan: pgNext, percent: pgPercent });
export const progressUpdateSchema = z.strictObject({ done: pgDone.optional(), issues: pgIssues.optional(), nextPlan: pgNext.optional(), percent: pgPercent.optional() })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Cần ít nhất một trường để sửa', path: ['done'] });

// FR11 (API_GD45 §5.2–5.4). Field văn bản của multipart và JSON nộp link dùng chung phần stage/milestoneId.
const docStage = z.enum(DOCUMENT_STAGES, { error: 'Chọn loại tài liệu' });
const stageMilestone = (v, ctx) => {
  if ((v.stage === 'PROPOSAL') !== (v.milestoneId === undefined)) {
    ctx.addIssue({ code: 'custom', path: ['milestoneId'], message: v.stage === 'PROPOSAL' ? 'Đề cương không gắn với mốc' : 'Chọn mốc cho tài liệu này' });
  }
};
export const documentUploadFieldsSchema = z.object({ stage: docStage, milestoneId: idSchema.optional() }).superRefine(stageMilestone);
export const documentLinkSchema = z.object({
  stage: docStage,
  milestoneId: idSchema.optional(),
  title: z.string().trim().min(1, 'Nhập tên tài liệu').max(200),
  url: z.string().trim().max(2000).pipe(z.url({ protocol: /^https$/, error: 'Chỉ nhận đường dẫn https' }))
    // zod 4 vẫn chạy refine khi z.url đã báo lỗi → new URL('abc') ném TypeError (thành 500); lỗi đó đã có issue của z.url
    .refine((u) => { try { const x = new URL(u); return !x.username && !x.password; } catch { return true; } }, 'Đường dẫn không được chứa tài khoản/mật khẩu'),
}).superRefine(stageMilestone);
export const documentListQuerySchema = z.object({
  milestoneId: idSchema.optional(),
  stage: docStage.optional(),
  latestOnly: z.enum(['true', 'false']).default('false'),
});

// FR12 (API_GD45 §6): nhận xét bản nộp (kèm đánh giá mốc), nhận xét tiến độ, kết quả cuối có phiên bản
const fbContent = z.string().trim().min(1, 'Nhập nội dung nhận xét').max(2000);
export const documentFeedbackSchema = z.strictObject({
  content: fbContent,
  evaluation: z.enum(['PASSED', 'NEEDS_WORK'], { error: 'Đánh giá là Đạt hoặc Cần bổ sung' }).optional(),
  milestoneVersion: version.optional(),
}).refine((v) => v.evaluation === undefined || v.milestoneVersion !== undefined, { message: 'Thiếu phiên bản mốc', path: ['milestoneVersion'] });
export const progressFeedbackSchema = z.strictObject({ content: fbContent });
export const feedbackListQuerySchema = z.object({
  documentId: idSchema.optional(),
  milestoneId: idSchema.optional(),
  progressUpdateId: idSchema.optional(),
  ...pageQuery,
});
export const finalResultSchema = z.strictObject({
  result: z.enum(Object.values(FINAL_RESULT), { error: 'Chọn kết quả theo thang của khoa' }),
  summary: z.string().trim().min(20, 'Nhận xét tổng kết tối thiểu 20 ký tự').max(5000),
  expectedVersion: version,
});

// FR13 (API_GD45 §8.1): unread 'true' = chỉ chưa đọc, 'false' = chỉ đã đọc, bỏ trống = tất cả
export const notificationListQuerySchema = z.object({ unread: z.enum(['true', 'false']).optional(), ...pageQuery });

// FR14 (API_GD45 §9.2): khóa lặp thành mảng → 400; facultyId chỉ STAFF (service kiểm)
const L = topicListQuerySchema.shape;
export const statsQuerySchema = z.object({
  groupBy: z.enum(STATS_GROUP_BY, { error: 'Chọn chiều thống kê' }),
  roundId: L.roundId, academicYear: L.academicYear, fieldId: L.fieldId, lecturerId: L.lecturerId, result: L.result,
  status: opt(z.enum(Object.values(TOPIC_STATUS).filter((s) => s !== 'DRAFT'))),
  facultyId: opt(z.string().trim().max(64)),
});

// GĐ6 (API_GD6 §2.7): khung yêu cầu thay đổi. Mỗi loại một nhánh; đã có ADVISOR_CHANGE (T601), CANCEL (T602); T603 (LEAVE_GROUP), T605 (TOPIC_CHANGE) thêm nhánh.
const crReason = z.string().trim().min(5, 'Lý do tối thiểu 5 ký tự').max(2000);
export const changeRequestCreateSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('ADVISOR_CHANGE'), reason: crReason, newLecturerId: idSchema }),
  z.strictObject({ type: z.literal('CANCEL'), reason: crReason }), // T602 (FR20)
], { error: 'Loại yêu cầu không hợp lệ' });
export const changeRequestApproveSchema = z.preprocess((v) => v ?? {}, z.strictObject({ reason: crReason.optional() }));
export const changeRequestDeclineSchema = z.strictObject({ reason: crReason });
export const changeRequestListQuerySchema = z.object({
  status: opt(reqStatus),
  type: opt(z.enum(Object.values(CHANGE_TYPE))),
  stage: opt(z.enum(Object.values(CHANGE_STAGE))),
  roundId: opt(z.string().trim().max(64)),
  topicId: opt(z.string().trim().max(64)),
  ...pageQuery,
});
export const formerAdvisorAccessSchema = z.strictObject({ granted: z.boolean({ error: 'Chọn cấp hoặc thu hồi quyền' }), reason: crReason });
