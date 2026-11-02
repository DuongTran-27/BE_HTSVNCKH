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
