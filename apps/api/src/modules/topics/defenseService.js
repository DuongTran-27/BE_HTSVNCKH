// Điểm quá trình và đề nghị ra hội đồng (FR34), trả về đang thực hiện (FR35) – API_GD7 §5.1–5.4.
// Chuyển trạng thái chỉ qua checkTransition + applyTransition; điều kiện kiểm sớm rồi kiểm lại dưới khóa Topic.
import { MIN_PROCESS_SCORE } from '@nckh/shared';
import { conflict, forbidden, notFound } from '../../lib/errors.js';
import { checkTransition } from './stateMachine.js';
import { relations, canView } from './service.js';
import { topicName } from '../notifications/notify.js';

export const DEFENSE_ACTIONS = ['REQUEST_DEFENSE', 'RETURN_FROM_DEFENSE'];
const CONCURRENT = () => conflict('CONCURRENT_UPDATE', 'Dữ liệu vừa được người khác cập nhật, vui lòng tải lại');

// Điều kiện mốc dùng chung với đóng đề tài (evaluateClose), rồi báo cáo tổng kết (§5.1)
const assertReady = (cond, hasFinalReport) => {
  if (cond.requiredMilestoneCount === 0) throw conflict('NO_REQUIRED_MILESTONE', 'Đề tài chưa có mốc bắt buộc nào');
  if (!cond.requiredMilestonesPassed) throw conflict('MILESTONES_NOT_PASSED', 'Còn mốc bắt buộc chưa Đạt', { milestones: cond.pendingMilestones });
  if (!hasFinalReport) throw conflict('NO_FINAL_REPORT', 'Nhóm chưa nộp báo cáo tổng kết');
};

export const createDefenseService = ({ repo, getTopic, now = () => new Date() }) => {
  const request = async (t, rel, user, body, ip) => {
    const transition = checkTransition({ topic: t, action: body.action, actor: user, ctx: rel });
    if (body.version !== t.version) throw CONCURRENT();
    // §5.2 (G52): điểm < 5 không chuyển, không lưu; GV nhập Không đạt và gửi đóng theo FR27
    if (body.processScore < MIN_PROCESS_SCORE) throw conflict('PROCESS_SCORE_TOO_LOW', 'Điểm quá trình dưới 5,0 – đề tài không đủ điều kiện ra hội đồng');
    assertReady(await repo.readCloseConditions(t.id), await repo.readFinalReport(t.id));
    await repo.applyDefense({ topic: { id: t.id, version: body.version }, transition, actor: user }, async (o) => {
      // Dưới khóa Topic: GVHD hiện hành đọc lại (thay GV FR19 khóa cùng dòng – API_GD6 §1.2), điều kiện mốc + báo cáo
      const cond = await o.closeConditions(t.id);
      if (cond.advisorId !== user.id) throw forbidden('Bạn không còn là giảng viên hướng dẫn hiện hành của đề tài');
      assertReady(cond, await o.hasFinalReport(t.id));
      const ps = await o.createProcessScore({ topicId: t.id, lecturerId: user.id, score: body.processScore, comment: body.processComment });
      await o.audit({ actorId: user.id, action: 'TOPIC_REQUEST_DEFENSE', entityType: 'Topic', entityId: t.id, before: { status: t.status }, after: { status: transition.to, processScore: body.processScore, processScoreId: ps.id }, ip });
      await o.notify({ topicId: t.id, to: ['staff', 'members'], actorId: user.id, type: 'DEFENSE_REQUESTED', key: `DEFENSE_REQUESTED:${t.id}:v${body.version + 1}`, link: `/de-tai/${t.id}`, title: (x) => `Giảng viên hướng dẫn đề nghị đề tài ${topicName(x)} ra hội đồng nghiệm thu` });
    });
    return getTopic(user, t.id);
  };

  const returnBack = async (t, rel, user, body, ip) => {
    const transition = checkTransition({ topic: t, action: body.action, actor: user, reason: body.reason, ctx: rel });
    if (body.version !== t.version) throw CONCURRENT();
    const at = now();
    await repo.applyDefense({ topic: { id: t.id, version: body.version }, transition, actor: user, reason: body.reason }, async (o) => {
      const cancelled = await o.cancelOpenAssignments(t.id, at, body.reason);
      const councilMembers = cancelled.length ? await o.councilMemberIds(cancelled.map((a) => a.councilId)) : [];
      await o.audit({ actorId: user.id, action: 'TOPIC_RETURN_FROM_DEFENSE', entityType: 'Topic', entityId: t.id, before: { status: t.status }, after: { status: transition.to, reason: body.reason, cancelledAssignments: cancelled.map((a) => a.id) }, ip });
      await o.notify({ topicId: t.id, to: ['advisor', 'members'], userIds: councilMembers, actorId: user.id, type: 'DEFENSE_RETURNED', key: `DEFENSE_RETURNED:${t.id}:v${body.version + 1}`, link: `/de-tai/${t.id}`, title: (x) => `Cán bộ khoa trả đề tài ${topicName(x)} về đang thực hiện` });
    });
    return getTopic(user, t.id);
  };

  return {
    async act(user, topicId, body, ip) {
      const t = await repo.findDetail(topicId);
      if (!t) throw notFound();
      const rel = relations(t, user);
      if (!canView(t, rel)) throw forbidden(); // trước checkTransition để không lộ trạng thái (API_GD2 §8.1)
      return (body.action === 'REQUEST_DEFENSE' ? request : returnBack)(t, rel, user, body, ip);
    },
  };
};
