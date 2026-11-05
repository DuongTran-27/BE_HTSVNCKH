// Nhận xét, đánh giá mốc, kết quả cuối FR12 (API_GD45 §6). Ghi: chỉ GVHD hiện hành, IN_PROGRESS; đọc: canReadExecution.
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { relations } from '../topics/service.js';
import { presentMilestone } from './service.js';
import { presentProgress } from './progressService.js';

const iso = (d) => d.toISOString();

export const presentFeedback = (f) => ({
  id: f.id, target: f.progressUpdateId ? 'PROGRESS' : 'DOCUMENT', documentId: f.documentId, documentVersion: f.document?.version ?? null,
  milestoneId: f.milestoneId, progressUpdateId: f.progressUpdateId, content: f.content, evaluation: f.evaluation,
  lecturer: { id: f.lecturer.id, fullName: f.lecturer.fullName }, createdAt: iso(f.createdAt),
});
export const presentResult = (r) => ({
  id: r.id, version: r.version, result: r.result, summary: r.summary, reason: r.reason, isCurrent: r.isCurrent,
  createdBy: { id: r.createdBy.id, fullName: r.createdBy.fullName, role: r.createdBy.role }, createdAt: iso(r.createdAt),
});

export const createFeedbackService = ({ repo, now = () => new Date() }) => {
  // Thứ tự §1.1: tải đề tài → quyền đọc (403) → quyền ghi (403) → trạng thái (409)
  const load = async (user, topicId, { write }) => {
    const t = await repo.findExecTopic(topicId);
    if (!t) throw notFound();
    const rel = relations({ ...t, advisorRequests: [] }, user);
    if (!(rel.isMember || rel.isCurrentAdvisor || (rel.inStaffScope && t.status !== 'DRAFT'))) throw forbidden();
    if (write) {
      if (user.role !== 'LECTURER' || !rel.isCurrentAdvisor) throw forbidden('Chỉ giảng viên hướng dẫn hiện hành được nhận xét, đánh giá');
      if (t.status !== 'IN_PROGRESS') throw conflict('TOPIC_NOT_IN_PROGRESS', 'Chỉ thực hiện được khi đề tài đang thực hiện');
    }
  };
  const stale = () => conflict('CONCURRENT_UPDATE', 'Dữ liệu vừa được người khác cập nhật, vui lòng tải lại');

  return {
    async createForDocument(user, documentId, body, ip) {
      const d = await repo.findDocument(documentId);
      if (!d) throw notFound();
      await load(user, d.topicId, { write: true });
      if (body.evaluation && !d.milestoneId) throw badRequest('VALIDATION_ERROR', 'Dữ liệu không hợp lệ', { evaluation: 'Chỉ đánh giá được tài liệu của mốc' });
      const f = await repo.writeFeedback(d.topicId, async (o) => {
        if (body.evaluation) {
          if ((await o.latestDocVersion(d.topicId, d.milestoneId)) !== d.version) throw conflict('STALE_DOCUMENT', 'Chỉ đánh giá mốc trên bản nộp mới nhất');
          const m = await o.findMilestone(d.milestoneId);
          if (m.evaluation === 'PASSED') throw conflict('MILESTONE_ALREADY_PASSED', 'Mốc đã Đạt; muốn thay đổi cần mở lại mốc');
          if (!(await o.updateVersioned(m.id, body.milestoneVersion, { evaluation: body.evaluation }))) throw stale();
          await o.audit({ actorId: user.id, action: 'MILESTONE_EVALUATE', entityType: 'Milestone', entityId: m.id, before: { evaluation: m.evaluation }, after: { evaluation: body.evaluation, documentId: d.id }, ip });
        }
        const row = await o.createFeedback({ topicId: d.topicId, documentId: d.id, milestoneId: d.milestoneId, lecturerId: user.id, content: body.content, evaluation: body.evaluation ?? null });
        await o.audit({ actorId: user.id, action: 'FEEDBACK_CREATE', entityType: 'Feedback', entityId: row.id, before: null, after: { topicId: d.topicId, documentId: d.id, milestoneId: d.milestoneId, evaluation: row.evaluation }, ip });
        return row;
      });
      const m = d.milestoneId ? presentMilestone(await repo.viewMilestone(d.milestoneId), now()) : null;
      return { feedback: presentFeedback(f), milestone: m };
    },

    async createForProgress(user, progressId, body, ip) {
      const meta = await repo.findProgressMeta(progressId);
      if (!meta) throw notFound();
      await load(user, meta.topicId, { write: true });
      return repo.writeFeedback(meta.topicId, async (o) => {
        await o.lockProgress(progressId, now()); // đã khóa thì giữ nguyên lockedAt cũ
        const row = await o.createFeedback({ topicId: meta.topicId, progressUpdateId: progressId, lecturerId: user.id, content: body.content });
        await o.audit({ actorId: user.id, action: 'FEEDBACK_CREATE', entityType: 'Feedback', entityId: row.id, before: null, after: { topicId: meta.topicId, progressUpdateId: progressId }, ip });
        // Đọc trong transaction: đúng nội dung đã bị khóa cùng nhận xét này
        return { feedback: presentFeedback(row), progress: presentProgress(await o.viewProgressTx(progressId)) };
      });
    },

    async list(user, topicId, q) {
      await load(user, topicId, { write: false });
      const where = { topicId, ...(q.documentId && { documentId: q.documentId }), ...(q.milestoneId && { milestoneId: q.milestoneId }), ...(q.progressUpdateId && { progressUpdateId: q.progressUpdateId }) };
      const { items, total } = await repo.listFeedbacks(where, { skip: (q.page - 1) * q.pageSize, take: q.pageSize });
      return { items: items.map(presentFeedback), page: q.page, pageSize: q.pageSize, total };
    },

    async createResult(user, topicId, body, ip) {
      await load(user, topicId, { write: true });
      const r = await repo.writeFeedback(topicId, async (o) => {
        const cur = await o.currentResult(topicId);
        if ((cur?.version ?? 0) !== body.expectedVersion) throw stale();
        const version = (await o.maxResultVersion(topicId)) + 1;
        if (cur) await o.demoteResult(cur.id);
        const row = await o.createResult({ topicId, version, result: body.result, summary: body.summary, reason: null, isCurrent: true, createdById: user.id });
        await o.audit({ actorId: user.id, action: 'RESULT_CREATE', entityType: 'ResultVersion', entityId: row.id, before: cur && { result: cur.result, version: cur.version }, after: { result: row.result, version }, ip });
        return row;
      });
      return { result: presentResult(r) };
    },

    async listResults(user, topicId) {
      await load(user, topicId, { write: false });
      const items = (await repo.listResults(topicId)).map(presentResult);
      return { current: items.find((r) => r.isCurrent) ?? null, items };
    },
  };
};
