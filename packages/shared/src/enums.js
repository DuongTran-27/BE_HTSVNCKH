// Danh mục giá trị dùng chung frontend + backend (khớp enum trong Prisma).
export const ROLES = Object.freeze({
  ADMIN: 'ADMIN',       // Quản trị hệ thống, không có quyền nghiệp vụ (FR25)
  STAFF: 'STAFF',       // Cán bộ khoa
  LECTURER: 'LECTURER', // Giảng viên
  STUDENT: 'STUDENT',   // Sinh viên
});

export const TOPIC_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  WAITING_ADVISOR: 'WAITING_ADVISOR',
  HAS_ADVISOR: 'HAS_ADVISOR',
  UNDER_REVIEW: 'UNDER_REVIEW',
  NEEDS_REVISION: 'NEEDS_REVISION',
  REJECTED: 'REJECTED',
  IN_PROGRESS: 'IN_PROGRESS',
  CANCELLED: 'CANCELLED',
  WAITING_CLOSE: 'WAITING_CLOSE',
  CLOSED: 'CLOSED',
});

export const TOPIC_STATUS_LABEL = Object.freeze({
  DRAFT: 'Nháp',
  WAITING_ADVISOR: 'Chờ GVHD',
  HAS_ADVISOR: 'Đã có GVHD',
  UNDER_REVIEW: 'Chờ xét duyệt',
  NEEDS_REVISION: 'Cần chỉnh sửa',
  REJECTED: 'Bị từ chối',
  IN_PROGRESS: 'Đang thực hiện',
  CANCELLED: 'Đã hủy',
  WAITING_CLOSE: 'Chờ đóng',
  CLOSED: 'Đã đóng',
});

// "Đề tài hoạt động" theo mục 1 của đặc tả
export const INACTIVE_STATUSES = Object.freeze(['DRAFT', 'REJECTED', 'CANCELLED', 'CLOSED']);
export const isActiveStatus = (s) => !INACTIVE_STATUSES.includes(s);

export const FINAL_RESULT = Object.freeze({
  EXCELLENT: 'EXCELLENT',
  GOOD: 'GOOD',
  PASS: 'PASS',
  FAIL: 'FAIL',
});
export const FINAL_RESULT_LABEL = Object.freeze({
  EXCELLENT: 'Xuất sắc', GOOD: 'Tốt', PASS: 'Đạt', FAIL: 'Không đạt',
});

export const SIMILARITY_LEVEL = Object.freeze({ NONE: 'NONE', REVIEW: 'REVIEW', HIGH: 'HIGH' });

// Tham số mặc định theo mục 8 của đặc tả; mỗi đợt có thể ghi đè.
export const DEFAULT_ROUND_CONFIG = Object.freeze({
  minMembers: 1,
  maxMembers: 5,
  maxActiveTopicsPerStudent: 1,
  maxTopicsPerLecturer: 5,
  advisorReminderDays: 3,
  dueReminderDays: 3,
  minSummaryWords: 100,
  minKeywords: 3,
  maxKeywords: 5,
  maxFileSizeMB: 10,
  allowedFileTypes: ['pdf', 'docx', 'pptx', 'xlsx'],
  similarity: { titleReview: 0.5, titleHigh: 0.7, contentReview: 0.35, contentHigh: 0.55, minJustificationWords: 50 },
});
