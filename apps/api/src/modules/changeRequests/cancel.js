// FR20 – đề nghị và quyết định hủy (API_GD6 §4). Handler loại CANCEL của khung yêu cầu thay đổi (service.js).
import { TOPIC_STATUS } from '@nckh/shared';
import { conflict } from '../../lib/errors.js';
import { checkTransition } from '../topics/stateMachine.js';
import { topicName } from '../notifications/notify.js';

export const cancel = {
  // §4.1: trưởng nhóm hoặc GVHD hiện hành; cán bộ không tự tạo (G38)
  canCreate: (rel, user) => (user.role === 'STUDENT' && rel.isLeader) || (user.role === 'LECTURER' && rel.isCurrentAdvisor),
  // IN_PROGRESS là nguồn duy nhất của CANCEL trong TRANSITIONS
  checkStatus: (status) => {
    if (status !== TOPIC_STATUS.IN_PROGRESS) throw conflict('INVALID_TRANSITION', 'Chỉ đề nghị hủy được khi đề tài đang thực hiện');
  },
  prepare: async (_o, t, _body, user) => ({ payload: { topicStatus: t.status, requesterRole: user.role } }),
  // §4.2: chuyển trạng thái trong CÙNG transaction duyệt; trạng thái đọc dưới khóa (G39: đề nghị không tự đóng, duyệt muộn → 409)
  async apply(o, cr, { lock, user, reason }) {
    const transition = checkTransition({ topic: lock, action: 'CANCEL', actor: user, reason, ctx: { inStaffScope: true } });
    await o.applyTransition({ topic: lock, transition, actor: user, reason }); // StatusHistory qua recordStatus
    return { decidedTitle: (x) => `Đề tài ${topicName(x)} đã bị hủy` };
  },
};
