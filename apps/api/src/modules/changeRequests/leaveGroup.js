// FR21 – rời nhóm sau duyệt (API_GD6 §5.2). Handler loại LEAVE_GROUP của khung yêu cầu thay đổi (service.js).
import { effectiveRoundConfig } from '@nckh/shared';
import { conflict, forbidden } from '../../lib/errors.js';

const notRunning = () => conflict('TOPIC_NOT_IN_PROGRESS', 'Chỉ rời nhóm qua yêu cầu khi đề tài đang thực hiện');
const leaderErr = () => conflict('LEADER_CANNOT_LEAVE', 'Trưởng nhóm cần chuyển quyền trưởng nhóm trước khi rời nhóm');

// Đếm lại thành viên hiện hành bằng câu riêng sau khóa Topic; còn lại sau khi rời phải ≥ minMembers của đợt
const assertMin = async (o, topicId, count) => {
  const min = effectiveRoundConfig((await o.roundOfTopic(topicId)).config).minMembers;
  if (count - 1 < min) throw conflict('GROUP_TOO_SMALL', `Nhóm phải còn ít nhất ${min} thành viên sau khi rời`);
};

export const leaveGroup = {
  // Chỉ thành viên cho chính mình; trưởng nhóm → 409 ở prepare (dưới khóa)
  canCreate: (rel, user) => user.role === 'STUDENT' && rel.isMember,
  checkStatus: (status) => {
    if (status !== 'IN_PROGRESS') throw notRunning();
  },
  // Unique index một PENDING mỗi người rời (§2.6) → kiểm trùng theo người
  pendingScope: (user) => ({ targetUserId: user.id }),
  async prepare(o, t, _body, user, at) {
    const members = await o.currentMembers(t.id);
    const me = members.find((m) => m.userId === user.id);
    if (!me) throw forbidden();
    if (me.role === 'LEADER') throw leaderErr();
    await assertMin(o, t.id, members.length);
    return {
      targetUserId: user.id, targetAcceptedAt: at, // không có bước người đích: vào thẳng stage STAFF
      payload: { member: { userId: user.id, code: me.user.code, fullName: me.user.fullName }, memberCountBefore: members.length },
    };
  },
  // §5.2 hiệu lực. Phạm vi khoa của cán bộ đã kiểm ở service.approve TRƯỚC handler (MINOR T602-reviewer m2)
  async apply(o, cr, { lock, user, at, ip }) {
    if (lock.status !== 'IN_PROGRESS') throw notRunning();
    const leaverId = cr.payload.member.userId;
    const members = await o.currentMembers(cr.topicId);
    const me = members.find((m) => m.userId === leaverId);
    if (!me || me.role === 'LEADER') throw conflict('STALE_CHANGE_REQUEST', 'Thành viên không còn ở trạng thái rời được, vui lòng tạo yêu cầu mới');
    await assertMin(o, cr.topicId, members.length);
    await o.endMembership(cr.topicId, leaverId, at);
    await o.bumpTopicVersion(cr.topicId);
    await o.audit({ actorId: user.id, action: 'MEMBER_LEAVE', entityType: 'Topic', entityId: cr.topicId, before: { userId: leaverId, role: me.role }, after: { leftAt: at.toISOString(), changeRequestId: cr.id }, ip });
    // Người rời đã mất quyền xem đề tài → link hộp yêu cầu (§11b)
    return { decidedExtra: [{ userIds: [leaverId], link: '/yeu-cau' }] };
  },
};
