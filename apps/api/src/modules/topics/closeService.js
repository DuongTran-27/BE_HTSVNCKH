// Đóng đề tài FR27 (API_GD45 §7.3): REQUEST_CLOSE, RETURN_TO_ADVISOR, CONFIRM_CLOSE, CLOSE_EXPIRED.
// Chuyển trạng thái chỉ qua checkTransition + applyTransition; điều kiện đóng kiểm sớm rồi kiểm lại dưới khóa Topic.
import { conflict, forbidden, notFound } from '../../lib/errors.js';
import { checkTransition } from './stateMachine.js';
import { relations, canView } from './service.js';

export const CLOSE_ACTIONS = ['REQUEST_CLOSE', 'RETURN_TO_ADVISOR', 'CONFIRM_CLOSE', 'CLOSE_EXPIRED'];
const NEEDS_CONDITIONS = ['REQUEST_CLOSE', 'CONFIRM_CLOSE', 'CLOSE_EXPIRED'];
const ASSUME_MET = { requiredMilestoneCount: 1, requiredMilestonesPassed: true, hasFinalResult: true, roundEnded: true, closeConditionsMet: false };

export const createCloseService = ({ repo, getTopic, now = () => new Date() }) => ({
  async act(user, topicId, body, ip) {
    const t = await repo.findDetail(topicId);
    if (!t) throw notFound();
    const rel = relations(t, user);
    if (!canView(t, rel)) throw forbidden(); // trước checkTransition để không lộ trạng thái (§1.1)
    const roundEnded = now() >= t.round.endAt;
    const check = (topic, cond) => checkTransition({ topic, action: body.action, actor: user, reason: body.reason, ctx: { ...rel, ...cond, roundEnded } });
    // Thứ tự §1.1: quyền/trạng thái/lý do (ctx giả định đạt) → version → điều kiện đóng thật
    checkTransition({ topic: t, action: body.action, actor: user, reason: body.reason, ctx: { ...rel, ...ASSUME_MET } });
    if (body.version !== t.version) throw conflict('CONCURRENT_UPDATE', 'Dữ liệu vừa được người khác cập nhật, vui lòng tải lại');
    const needs = NEEDS_CONDITIONS.includes(body.action);
    const transition = check(t, needs ? await repo.readCloseConditions(t.id) : {}); // bước 5: trả lỗi sớm, chưa khóa

    await repo.applyClose({ topic: { id: t.id, version: body.version }, transition, actor: user, reason: body.reason }, async (o) => {
      // FR27.3: kiểm lại ngay lúc đóng, sau khi updateMany đã giữ khóa Topic (§7.2); sai → rollback
      const cond = needs ? await o.closeConditions(t.id) : {};
      if (needs) check({ status: transition.from }, cond);
      let after = { status: transition.to, reason: body.reason ?? null };
      if (body.action === 'CLOSE_EXPIRED') {
        const cur = await o.currentResult(t.id);
        if (cur) await o.demoteResult(cur.id);
        const version = (await o.maxResultVersion(t.id)) + 1;
        const row = await o.createResult({ topicId: t.id, version, result: 'FAIL', summary: `Đóng do hết hạn đợt: ${body.reason}`, reason: body.reason, isCurrent: true, createdById: user.id });
        await o.audit({ actorId: user.id, action: 'RESULT_CREATE', entityType: 'ResultVersion', entityId: row.id, before: cur && { result: cur.result, version: cur.version }, after: { result: 'FAIL', version }, ip });
        after = { ...after, result: 'FAIL', resultVersion: version };
      }
      await o.audit({ actorId: user.id, action: `TOPIC_${body.action}`, entityType: 'Topic', entityId: t.id, before: { status: t.status }, after, ip });
    });
    return getTopic(user, topicId);
  },
});
