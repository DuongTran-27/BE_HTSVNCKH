// Nhãn tiếng Việt của enum (API_GD2 §11); API không trả nhãn, frontend dùng các bảng này.

// Trạng thái lời mời / đề nghị (khớp enum RequestStatus của Prisma)
export const REQUEST_STATUS = Object.freeze({
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  DECLINED: 'DECLINED',
  WITHDRAWN: 'WITHDRAWN',
});
export const REQUEST_STATUS_LABEL = Object.freeze({
  PENDING: 'Chờ phản hồi',
  ACCEPTED: 'Đã chấp nhận',
  DECLINED: 'Đã từ chối',
  WITHDRAWN: 'Đã rút',
});

export const ROLE_LABEL = Object.freeze({
  ADMIN: 'Quản trị',
  STAFF: 'Cán bộ khoa',
  LECTURER: 'Giảng viên',
  STUDENT: 'Sinh viên',
});

export const SIMILARITY_LEVEL_LABEL = Object.freeze({
  NONE: 'Không cảnh báo',
  REVIEW: 'Cần xem xét',
  HIGH: 'Nghi trùng cao',
});

// Khóa trùng TRANSITIONS[].action (test đơn vị so khớp)
export const ACTION_LABEL = Object.freeze({
  REQUEST_ADVISOR: 'Gửi đề nghị hướng dẫn',
  ACCEPT_ADVISING: 'Nhận hướng dẫn',
  DECLINE_ADVISING: 'Từ chối hướng dẫn',
  WITHDRAW_ADVISOR_REQUEST: 'Rút đề nghị hướng dẫn',
  SUBMIT_FOR_REVIEW: 'Gửi xét duyệt',
  REQUEST_REVISION: 'Yêu cầu chỉnh sửa',
  RESUBMIT: 'Gửi lại sau chỉnh sửa',
  REJECT: 'Từ chối đề tài',
  APPROVE: 'Duyệt đề tài',
  CANCEL: 'Hủy đề tài',
  REQUEST_CLOSE: 'Đề nghị đóng đề tài',
  RETURN_TO_ADVISOR: 'Trả lại giảng viên',
  CONFIRM_CLOSE: 'Xác nhận đóng đề tài',
  CLOSE_EXPIRED: 'Đóng do quá hạn',
});

export const MILESTONE_EVAL_LABEL = Object.freeze({ PENDING: 'Chưa đánh giá', PASSED: 'Đạt', NEEDS_WORK: 'Cần bổ sung' });
export const DOCUMENT_STAGE_LABEL = Object.freeze({ PROPOSAL: 'Đề cương', MIDTERM: 'Giữa kỳ', FINAL: 'Cuối kỳ', OTHER: 'Khác' });

export const NOTIFICATION_TYPE_LABEL = Object.freeze({
  INVITATION_RECEIVED: 'Lời mời tham gia nhóm',
  INVITATION_ACCEPTED: 'Lời mời được chấp nhận',
  INVITATION_DECLINED: 'Lời mời bị từ chối',
  ADVISOR_REQUESTED: 'Đề nghị hướng dẫn',
  ADVISOR_ACCEPTED: 'Giảng viên nhận hướng dẫn',
  ADVISOR_DECLINED: 'Giảng viên từ chối hướng dẫn',
  ADVISOR_REQUEST_WITHDRAWN: 'Đề nghị hướng dẫn bị rút',
  REVIEW_DECIDED: 'Kết quả xét duyệt',
  MILESTONE_CREATED: 'Mốc mới',
  MILESTONE_REQUIRED_REMOVED: 'Mốc bị bỏ bắt buộc',
  MILESTONE_DUE_CHANGED: 'Đổi hạn mốc',
  DOCUMENT_SUBMITTED: 'Bài nộp mới',
  FEEDBACK_CREATED: 'Nhận xét mới',
  RESULT_ENTERED: 'Kết quả cuối',
  CLOSE_REQUESTED: 'Đề nghị đóng đề tài',
  CLOSE_RETURNED: 'Hồ sơ đóng bị trả lại',
  TOPIC_CLOSED: 'Đề tài đã đóng',
  MILESTONE_DUE_SOON: 'Sắp đến hạn mốc',
  MILESTONE_OVERDUE: 'Quá hạn mốc',
  ADVISOR_REQUEST_REMINDER: 'Nhắc phản hồi đề nghị hướng dẫn',
  CHANGE_REQUESTED: 'Yêu cầu thay đổi mới',
  CHANGE_TARGET_INVITED: 'Lời đề xuất cần bạn đồng ý',
  CHANGE_TARGET_ACCEPTED: 'Người được đề xuất đã đồng ý',
  CHANGE_DECIDED: 'Yêu cầu thay đổi đã có quyết định',
  CHANGE_WITHDRAWN: 'Yêu cầu thay đổi bị rút',
  ADVISOR_HANDOVER: 'Bàn giao bản nộp chờ nhận xét',
});

// GĐ6 (API_GD6 §2.7)
export const CHANGE_TYPE_LABEL = Object.freeze({
  TOPIC_CHANGE: 'Thay đổi sau duyệt', ADVISOR_CHANGE: 'Thay giảng viên', CANCEL: 'Hủy đề tài', LEAVE_GROUP: 'Rời nhóm',
});
export const CHANGE_STAGE_LABEL = Object.freeze({ TARGET: 'Chờ người được đề xuất đồng ý', STAFF: 'Chờ cán bộ khoa duyệt' });

// Tên cột chiều trong CSV thống kê (API_GD45 §9.2)
export const STATS_DIMENSION_LABEL = Object.freeze({
  lecturer: 'Giảng viên hướng dẫn', field: 'Lĩnh vực', status: 'Trạng thái', result: 'Kết quả', academicYear: 'Năm học', round: 'Đợt',
});
