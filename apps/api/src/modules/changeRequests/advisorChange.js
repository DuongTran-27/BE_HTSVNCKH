// FR19 – thay giảng viên (API_GD6 §3). Handler loại ADVISOR_CHANGE của khung yêu cầu thay đổi (service.js).
import { ADVISOR_CHANGE_STATUSES, effectiveRoundConfig } from '@nckh/shared';
import { badRequest, conflict } from '../../lib/errors.js';
import { topicName } from '../notifications/notify.js';

const wrongStatus = () => conflict('INVALID_TRANSITION', 'Không thể thay giảng viên ở trạng thái hiện tại');
const stale = (msg = 'Đề tài đã thay đổi sau khi tạo yêu cầu, vui lòng tạo yêu cầu mới') => conflict('STALE_CHANGE_REQUEST', msg);

// Kiểm sau khóa User GV, đếm bằng câu riêng (FR16 "tại thời điểm nhận")
const assertQuota = async (o, lecturerId, topicId) => {
  const round = await o.roundOfTopic(topicId);
  if ((await o.countLecturerActive(lecturerId, round.id)) >= effectiveRoundConfig(round.config).maxTopicsPerLecturer) {
    throw conflict('LECTURER_QUOTA_EXCEEDED', 'Giảng viên đã đủ hạn mức hướng dẫn trong đợt');
  }
};

export const advisorChange = {
  // §3.2: trưởng nhóm hoặc cán bộ trong phạm vi khoa (FR19.1)
  canCreate: (rel, user) => (user.role === 'STUDENT' && rel.isLeader) || (user.role === 'STAFF' && rel.inStaffScope),
  checkStatus: (status) => {
    if (!ADVISOR_CHANGE_STATUSES.includes(status)) throw wrongStatus();
  },
  // Chạy dưới khóa Topic: payload.from đọc từ DB, không tin client
  async prepare(o, t, body) {
    const cur = await o.currentAdvising(t.id);
    if (!cur) throw wrongStatus();
    const lec = await o.findUser(body.newLecturerId);
    if (!lec || lec.role !== 'LECTURER' || lec.isLocked || lec.facultyId !== t.facultyId || lec.id === cur.lecturerId) {
      throw badRequest('VALIDATION_ERROR', 'Dữ liệu không hợp lệ', { newLecturerId: 'Giảng viên không hợp lệ' });
    }
    return {
      targetUserId: lec.id,
      payload: { from: { lecturerId: cur.lecturerId, fullName: cur.lecturer.fullName }, to: { lecturerId: lec.id, fullName: lec.fullName }, topicStatus: t.status },
    };
  },
  // §3.3: kiểm sớm khi GV mới đồng ý
  async onAccept(o, cr, user) {
    await o.lockUsers([user.id]);
    await assertQuota(o, user.id, cr.topicId);
  },
  // §3.4: hiệu lực, sau khóa Topic và cập nhật có điều kiện yêu cầu; lỗi → rollback cả yêu cầu
  async apply(o, cr, { lock, user, at, ip }) {
    if (!ADVISOR_CHANGE_STATUSES.includes(lock.status)) throw wrongStatus();
    const { from, to } = cr.payload;
    const cur = await o.currentAdvising(cr.topicId);
    if (cur?.lecturerId !== from.lecturerId) throw stale();
    await o.lockUsers([to.lecturerId]); // thứ tự Topic → User
    const lec = await o.findUser(to.lecturerId);
    // MINOR m2 T601-bao-mat: GV có thể đã chuyển khoa giữa lúc tạo và lúc duyệt
    if (!lec || lec.isLocked || lec.role !== 'LECTURER' || lec.facultyId !== cr.topic.facultyId) throw stale('Giảng viên mới không còn hoạt động');
    await assertQuota(o, to.lecturerId, cr.topicId);
    await o.endAdvising(cr.topicId, at);
    await o.createAdvising({ topicId: cr.topicId, lecturerId: to.lecturerId, startAt: at });
    await o.bumpTopicVersion(cr.topicId);
    // G36: người nhận xét suy ra từ Advising hiện hành → bản nộp chờ tự hiện ở GV mới; chỉ ghi danh sách + báo
    const pendingDocumentIds = await o.pendingDocumentIds(cr.topicId);
    await o.audit({ actorId: user.id, action: 'ADVISOR_CHANGE_APPLY', entityType: 'Topic', entityId: cr.topicId, before: { lecturerId: from.lecturerId }, after: { lecturerId: to.lecturerId, pendingDocumentIds, changeRequestId: cr.id }, ip });
    if (pendingDocumentIds.length) {
      await o.notify({ topicId: cr.topicId, userIds: [to.lecturerId], actorId: user.id, type: 'ADVISOR_HANDOVER', key: `ADVISOR_HANDOVER:${cr.id}`, link: `/de-tai/${cr.topicId}/tai-lieu`, title: (x) => `Bạn nhận ${pendingDocumentIds.length} bản nộp chờ nhận xét – đề tài ${topicName(x)}` });
    }
    // Người nhận thêm của CHANGE_DECIDED: GV cũ, link hộp yêu cầu vì đã mất quyền xem đề tài
    return { decidedExtra: [{ userIds: [from.lecturerId], link: '/yeu-cau' }] };
  },
};
