// Cập nhật tiến độ FR10 (API_GD45 §4). SV thành viên thêm; chỉ tác giả sửa; khóa khi GVHD nhận xét (lockedAt, T404).
import { conflict, forbidden, notFound } from '../../lib/errors.js';
import { relations, canReadExecution } from '../topics/service.js';

const iso = (d) => d.toISOString();
const FIELDS = ['done', 'issues', 'nextPlan', 'percent'];

export const presentProgress = (p) => ({
  id: p.id, topicId: p.topicId, author: { id: p.author.id, code: p.author.code, fullName: p.author.fullName },
  done: p.done, issues: p.issues, nextPlan: p.nextPlan, percent: p.percent, selfReported: true,
  lockedAt: p.lockedAt ? iso(p.lockedAt) : null, createdAt: iso(p.createdAt), updatedAt: iso(p.updatedAt),
  feedbacks: (p.feedbacks ?? []).map((f) => ({ id: f.id, content: f.content, lecturer: { fullName: f.lecturer.fullName }, createdAt: iso(f.createdAt) })),
});

export const createProgressService = ({ repo }) => {
  // Thứ tự §1.1: tải đề tài → quyền đọc (403) → quyền ghi (403) → trạng thái (409)
  const load = async (user, topicId, { write, authorId }) => {
    const t = await repo.findExecTopic(topicId);
    if (!t) throw notFound();
    const rel = relations({ ...t, advisorRequests: [] }, user);
    if (!canReadExecution(t, rel)) throw forbidden();
    if (write) {
      if (user.role !== 'STUDENT' || !rel.isMember) throw forbidden('Chỉ sinh viên trong nhóm được cập nhật tiến độ');
      if (authorId && authorId !== user.id) throw forbidden('Chỉ tác giả được sửa bản cập nhật này');
      if (t.status !== 'IN_PROGRESS') throw conflict('TOPIC_NOT_IN_PROGRESS', 'Chỉ thực hiện được khi đề tài đang thực hiện');
    }
  };
  const locked = () => conflict('PROGRESS_LOCKED', 'Cập nhật tiến độ đã được giảng viên hướng dẫn nhận xét, không sửa được nữa');
  const pick = (x) => Object.fromEntries(FIELDS.map((k) => [k, x[k]]));

  return {
    async list(user, topicId, { page, pageSize }) {
      await load(user, topicId, { write: false });
      const { items, total } = await repo.listProgress(topicId, { skip: (page - 1) * pageSize, take: pageSize });
      return { items: items.map(presentProgress), page, pageSize, total };
    },

    async create(user, topicId, body, ip) {
      await load(user, topicId, { write: true });
      const id = await repo.writeProgress(topicId, async (o) => {
        const p = await o.createProgress({ topicId, authorId: user.id, ...pick(body) });
        await o.audit({ actorId: user.id, action: 'PROGRESS_CREATE', entityType: 'ProgressUpdate', entityId: p.id, before: null, after: { topicId, ...pick(p) }, ip });
        return p.id;
      });
      return { progress: presentProgress(await repo.viewProgress(id)) };
    },

    async update(user, id, body, ip) {
      const meta = await repo.findProgressMeta(id);
      if (!meta) throw notFound();
      await load(user, meta.topicId, { write: true, authorId: meta.authorId });
      await repo.writeProgress(meta.topicId, async (o) => {
        const before = await o.findProgress(id);
        if (before.lockedAt) throw locked();
        const data = Object.fromEntries(FIELDS.filter((k) => body[k] !== undefined && body[k] !== before[k]).map((k) => [k, body[k]]));
        if (!Object.keys(data).length) return; // không đổi giá trị: không ghi, không audit (như PATCH mốc)
        if (!(await o.updateProgressUnlocked(id, data))) throw locked();
        await o.audit({ actorId: user.id, action: 'PROGRESS_UPDATE', entityType: 'ProgressUpdate', entityId: id, before: pick(before), after: pick({ ...before, ...data }), ip });
      });
      return { progress: presentProgress(await repo.viewProgress(id)) };
    },
  };
};
