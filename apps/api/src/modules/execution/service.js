// Mốc thực hiện FR09 (API_GD45 §3). Quyền: đọc = canReadExecution; ghi = GVHD hiện hành hoặc cán bộ trong phạm vi khoa, khi IN_PROGRESS.
import { MILESTONE_MAX_PER_TOPIC } from '@nckh/shared';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { relations, canReadExecution } from '../topics/service.js';
import { topicName } from '../notifications/notify.js';

const iso = (d) => d.toISOString();
const invalid = (details) => badRequest('VALIDATION_ERROR', 'Dữ liệu không hợp lệ', details);

export const presentMilestone = (m, n) => {
  const doc = m.documents?.[0];
  return {
    id: m.id, topicId: m.topicId, order: m.order, name: m.name, output: m.output, dueAt: iso(m.dueAt), required: m.required,
    evaluation: m.evaluation, version: m.version, isOverdue: m.evaluation !== 'PASSED' && n > m.dueAt,
    latestDocument: doc ? { id: doc.id, version: doc.version, uploadedAt: iso(doc.uploadedAt), isLate: doc.isLate } : null,
    dueChangeCount: m._count?.dueChanges ?? 0,
    reopenCount: m._count?.reopens ?? 0,
    lastReopen: m.reopens?.[0] ? { reason: m.reopens[0].reason, reopenedAt: iso(m.reopens[0].reopenedAt), reopenedBy: { fullName: m.reopens[0].reopenedBy.fullName } } : null, createdAt: iso(m.createdAt),
  };
};
const presentDueChange = (c) => ({
  id: c.id, oldDueAt: iso(c.oldDueAt), newDueAt: iso(c.newDueAt), reason: c.reason,
  changedBy: { id: c.changedBy.id, fullName: c.changedBy.fullName, role: c.changedBy.role }, changedAt: iso(c.changedAt),
});

const presentReopen = (r) => ({ id: r.id, reason: r.reason, reopenedBy: { id: r.reopenedBy.id, fullName: r.reopenedBy.fullName }, reopenedAt: iso(r.reopenedAt) });

export const createMilestoneService = ({ repo, now = () => new Date() }) => {
  // Thứ tự §1.1: tải đề tài → quyền đọc (403) → quyền ghi (403) → trạng thái (409)
  const load = async (user, topicId, { write, advisorOnly = false }) => {
    const t = await repo.findExecTopic(topicId);
    if (!t) throw notFound();
    const rel = relations({ ...t, advisorRequests: [] }, user);
    if (!canReadExecution(t, rel)) throw forbidden();
    if (write && advisorOnly) { // FR22: chỉ GVHD hiện hành; cán bộ cũng bị 403
      if (user.role !== 'LECTURER' || !rel.isCurrentAdvisor) throw forbidden('Chỉ giảng viên hướng dẫn hiện hành được mở lại mốc');
      if (t.status !== 'IN_PROGRESS') throw conflict('TOPIC_NOT_IN_PROGRESS', 'Chỉ thực hiện được khi đề tài đang thực hiện');
    } else if (write) {
      const ok = (user.role === 'LECTURER' && rel.isCurrentAdvisor) || (user.role === 'STAFF' && rel.inStaffScope);
      if (!ok) throw forbidden('Chỉ giảng viên hướng dẫn hoặc cán bộ khoa được quản lý mốc');
      if (t.status !== 'IN_PROGRESS') throw conflict('TOPIC_NOT_IN_PROGRESS', 'Chỉ thực hiện được khi đề tài đang thực hiện');
    }
    return t;
  };
  const topicIdOf = async (id) => {
    const topicId = await repo.findMilestoneTopicId(id);
    if (!topicId) throw notFound();
    return topicId;
  };
  const view = async (id) => presentMilestone(await repo.viewMilestone(id), now());
  const stale = () => conflict('CONCURRENT_UPDATE', 'Mốc vừa được người khác cập nhật, vui lòng tải lại');
  // Nhánh LECTURER: kiểm lại GVHD hiện hành dưới khóa Topic (API_GD6 §1.2); cán bộ không phụ thuộc Advising
  const lockOpts = (user) => (user.role === 'LECTURER' ? { advisorId: user.id } : {});

  return {
    async list(user, topicId) {
      await load(user, topicId, { write: false });
      return { items: (await repo.listMilestones(topicId)).map((m) => presentMilestone(m, now())) };
    },

    async create(user, topicId, body, ip) {
      await load(user, topicId, { write: true });
      if (new Date(body.dueAt) <= now()) throw invalid({ dueAt: 'Hạn phải sau thời điểm hiện tại' });
      const id = await repo.writeMilestone(topicId, async (o) => {
        if ((await o.countMilestones(topicId)) >= MILESTONE_MAX_PER_TOPIC) throw conflict('MILESTONE_LIMIT', `Đề tài đã đủ số mốc tối đa (${MILESTONE_MAX_PER_TOPIC})`);
        const m = await o.create({
          topicId, order: (await o.maxOrder(topicId)) + 1, name: body.name, output: body.output, dueAt: new Date(body.dueAt),
          required: body.required, evaluation: 'PENDING', version: 0, createdById: user.id,
        });
        await o.audit({ actorId: user.id, action: 'MILESTONE_CREATE', entityType: 'Milestone', entityId: m.id, before: null, after: { topicId, order: m.order, name: m.name, output: m.output, dueAt: m.dueAt, required: m.required }, ip });
        // Thành viên + GVHD (GVHD tự tạo thì notify bỏ người gây sự kiện)
        await o.notify({ topicId, to: ['members', 'advisor'], actorId: user.id, type: 'MILESTONE_CREATED', key: `MILESTONE_CREATED:${m.id}`, link: `/de-tai/${topicId}/moc`, title: (x) => `Mốc mới "${m.name}" – đề tài ${topicName(x)}` });
        return m.id;
      }, lockOpts(user));
      return { milestone: await view(id) };
    },

    async update(user, id, body, ip) {
      const topicId = await topicIdOf(id);
      await load(user, topicId, { write: true });
      await repo.writeMilestone(topicId, async (o) => {
        const m = await o.findMilestone(id);
        const data = Object.fromEntries(['name', 'output', 'required'].filter((k) => body[k] !== undefined).map((k) => [k, body[k]]));
        // m3: bỏ cờ bắt buộc khi chưa Đạt thì đánh dấu thời điểm (đếm có index); bật lại thì xóa dấu
        if (body.required === false && m.required && m.evaluation !== 'PASSED') data.requiredRemovedAt = now();
        if (body.required === true) data.requiredRemovedAt = null;
        const changed = Object.keys(data).some((k) => k !== 'requiredRemovedAt' && data[k] !== m[k]);
        if (!changed) { // không đổi giá trị: không tăng version, không audit; vẫn kiểm version
          if (m.version !== body.version) throw stale();
          return;
        }
        if (!(await o.updateVersioned(id, body.version, data))) throw stale();
        const pick = (x) => ({ name: x.name, output: x.output, required: x.required });
        await o.audit({ actorId: user.id, action: 'MILESTONE_UPDATE', entityType: 'Milestone', entityId: id, before: pick(m), after: pick({ ...m, ...data }), ip });
        if (data.requiredRemovedAt) { // m3: bỏ bắt buộc khi chưa Đạt → báo cán bộ khoa; version sau cập nhật phân biệt từng lần
          await o.notify({ topicId, to: ['staff'], actorId: user.id, type: 'MILESTONE_REQUIRED_REMOVED', key: `MILESTONE_REQUIRED_REMOVED:${id}:v${body.version + 1}`, link: `/de-tai/${topicId}/moc`, title: (x) => `Mốc "${m.name}" được bỏ bắt buộc khi chưa Đạt – đề tài ${topicName(x)}` });
        }
      }, lockOpts(user));
      return { milestone: await view(id) };
    },

    async changeDue(user, id, body, ip) {
      const topicId = await topicIdOf(id);
      await load(user, topicId, { write: true });
      const newDueAt = new Date(body.newDueAt);
      if (newDueAt <= now()) throw invalid({ newDueAt: 'Hạn mới phải sau thời điểm hiện tại' });
      const change = await repo.writeMilestone(topicId, async (o) => {
        const m = await o.findMilestone(id); // oldDueAt lấy từ dòng đã khóa, không từ client
        if (newDueAt.getTime() === m.dueAt.getTime()) throw invalid({ newDueAt: 'Hạn mới phải khác hạn cũ' });
        if (!(await o.updateVersioned(id, body.version, { dueAt: newDueAt }))) throw stale();
        const c = await o.createDueChange({ milestoneId: id, oldDueAt: m.dueAt, newDueAt, reason: body.reason, changedById: user.id, changedAt: now() });
        await o.audit({ actorId: user.id, action: 'MILESTONE_DUE_CHANGE', entityType: 'Milestone', entityId: id, before: { dueAt: m.dueAt }, after: { dueAt: newDueAt, reason: body.reason }, ip });
        await o.notify({ topicId, to: ['members', 'advisor'], actorId: user.id, type: 'MILESTONE_DUE_CHANGED', key: `MILESTONE_DUE_CHANGED:${c.id}`, link: `/de-tai/${topicId}/moc`, title: (x) => `Hạn mốc "${m.name}" đã thay đổi – đề tài ${topicName(x)}` });
        return c;
      }, lockOpts(user));
      return {
        milestone: await view(id),
        dueChange: presentDueChange({ ...change, changedBy: { id: user.id, fullName: user.fullName, role: user.role } }),
      };
    },

    // FR22 (API_GD6 §8): mở lại mốc đã Đạt → Cần bổ sung, bắt buộc lý do; kiểm lại GVHD + IN_PROGRESS dưới khóa Topic
    async reopen(user, id, body, ip) {
      const topicId = await topicIdOf(id);
      await load(user, topicId, { write: true, advisorOnly: true });
      const r = await repo.writeMilestone(topicId, async (o) => {
        const m = await o.findMilestone(id);
        if (!(await o.reopenPassed(id, body.version))) {
          if (m.evaluation !== 'PASSED') throw conflict('MILESTONE_NOT_PASSED', 'Chỉ mở lại được mốc đã Đạt');
          throw stale();
        }
        const row = await o.createReopen({ milestoneId: id, reason: body.reason, reopenedById: user.id, reopenedAt: now() });
        await o.audit({ actorId: user.id, action: 'MILESTONE_REOPEN', entityType: 'Milestone', entityId: id, before: { evaluation: 'PASSED', version: m.version }, after: { evaluation: 'NEEDS_WORK', version: m.version + 1, reason: body.reason }, ip });
        await o.notify({ topicId, to: ['members'], actorId: user.id, type: 'MILESTONE_REOPENED', key: `MILESTONE_REOPENED:${row.id}`, link: `/de-tai/${topicId}/moc`, title: (x) => `Mốc "${m.name}" được mở lại – đề tài ${topicName(x)}` });
        return row;
      }, lockOpts(user));
      return { milestone: await view(id), reopen: presentReopen(r) };
    },

    async listReopens(user, id) {
      await load(user, await topicIdOf(id), { write: false });
      return { items: (await repo.listReopens(id)).map(presentReopen) };
    },

    async listDueChanges(user, id) {
      await load(user, await topicIdOf(id), { write: false });
      return { items: (await repo.listDueChanges(id)).map(presentDueChange) };
    },
  };
};
