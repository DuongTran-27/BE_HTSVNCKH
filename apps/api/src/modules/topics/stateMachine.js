// Kiểm tra một thao tác chuyển trạng thái có hợp lệ không (mục 5 đặc tả). Hàm thuần, không đụng DB.
import { findTransition, countWords, DEFAULT_ROUND_CONFIG } from '@nckh/shared';
import { AppError, forbidden, badRequest, conflict } from '../../lib/errors.js';
import { recordStatus } from '../audit/service.js';
import { withLockTx } from '../../lib/tx.js';

/**
 * ctx (do service tính sẵn từ DB):
 *  isLeader, isRequestedLecturer, isCurrentAdvisor, inStaffScope,
 *  similarity: {status, level} | null, requiredMilestonesPassed, hasFinalResult, cfg
 */
export const checkTransition = ({ topic, action, actor, reason, justification, ctx = {}, skipSimilarity = false }) => {
  const t = findTransition(action);
  if (!t) throw badRequest('UNKNOWN_ACTION', 'Thao tác không tồn tại');
  if (topic.status !== t.from) {
    throw conflict('INVALID_TRANSITION', `Không thể thực hiện thao tác này khi đề tài đang ở trạng thái hiện tại`);
  }
  if (!t.actors.includes(actor.role)) throw forbidden();
  if (t.leaderOnly && !ctx.isLeader) throw forbidden('Chỉ trưởng nhóm được thực hiện');
  if (t.requestedLecturerOnly && !ctx.isRequestedLecturer) throw forbidden('Bạn không phải giảng viên được đề nghị');
  if (t.currentAdvisorOnly && !ctx.isCurrentAdvisor) throw forbidden('Chỉ giảng viên hướng dẫn hiện hành');
  if (actor.role === 'STAFF' && !ctx.inStaffScope) throw forbidden('Đề tài không thuộc khoa bạn quản lý');
  if (t.reasonRequired && (!reason || reason.trim().length < 5)) {
    throw badRequest('REASON_REQUIRED', 'Thao tác này bắt buộc nhập lý do');
  }

  if (t.needsSimilarity && !skipSimilarity) { // skipSimilarity: bước kiểm rẻ trước khi chạy thuật toán (API_GD2 §8.2)
    const cfg = ctx.cfg ?? DEFAULT_ROUND_CONFIG;
    const sim = ctx.similarity;
    // Lỗi kiểm tra không bao giờ được coi là "không trùng" (FR06)
    if (!sim || sim.status !== 'OK') {
      throw new AppError(409, 'SIMILARITY_NOT_CHECKED', 'Chưa kiểm tra được trùng lặp, vui lòng thử lại');
    }
    if (sim.level === 'HIGH' && countWords(justification ?? '') < cfg.similarity.minJustificationWords) {
      throw badRequest('JUSTIFICATION_REQUIRED', `Hồ sơ nghi trùng cao, cần giải trình tối thiểu ${cfg.similarity.minJustificationWords} từ`);
    }
  }

  if (action === 'REQUEST_CLOSE' || action === 'CONFIRM_CLOSE') {
    // Luôn xét theo đánh giá hiện hành (FR22, FR27)
    if (!ctx.requiredMilestonesPassed) throw conflict('MILESTONES_NOT_PASSED', 'Còn mốc bắt buộc chưa Đạt');
    if (!ctx.hasFinalResult) throw conflict('NO_FINAL_RESULT', 'GVHD chưa nhập kết quả cuối và nhận xét tổng kết');
  }
  return t;
};

/**
 * Áp dụng chuyển trạng thái trong transaction, có khóa lạc quan theo topic.version
 * để hai người bấm cùng lúc không ghi đè nhau. Ghi lịch sử (FR15).
 */
export const applyTransition = async (prisma, { topic, transition, actor, reason, extra }) =>
  withLockTx(prisma, async (tx) => { // lock_timeout đặt TRƯỚC updateMany (API_GD2 §1.8)
    const updated = await tx.topic.updateMany({
      where: { id: topic.id, version: topic.version, status: transition.from },
      data: { status: transition.to, version: { increment: 1 } },
    });
    if (updated.count !== 1) throw conflict('CONCURRENT_UPDATE', 'Đề tài vừa được người khác cập nhật, vui lòng tải lại');
    await recordStatus(tx, { topicId: topic.id, from: transition.from, to: transition.to, action: transition.action, actorId: actor.id, reason });
    if (extra) await extra(tx);
    return tx.topic.findUnique({ where: { id: topic.id } });
  });
