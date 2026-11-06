// Đọc snapshot hồ sơ và lịch sử trạng thái (FR17, API_GD2 §8.4). Chỉ đọc.
import { forbidden, notFound } from '../../lib/errors.js';
import { presentMatches, isUnchecked, justificationMissing } from '../similarity/service.js';
import { relations, canReadExecution, versionReader } from './service.js';

const iso = (d) => d.toISOString();
const sameSet = (a, b) => ({ added: b.filter((k) => !a.includes(k)), removed: a.filter((k) => !b.includes(k)) });

// Hồ sơ chờ chỉ STAFF thấy chi tiết: đi qua presentMatches theo vai trò người xem
const checkView = (c, role) => {
  if (c.status !== 'OK') return { id: c.id, status: c.status, level: null, matches: [], justification: c.justification ?? null, createdAt: iso(c.createdAt), message: 'Chưa kiểm tra được' };
  return {
    id: c.id, status: c.status, level: c.level, createdAt: iso(c.createdAt), algorithmVersion: c.algorithmVersion, corpusSize: c.corpusSize,
    justification: c.justification ?? null, justificationMissing: justificationMissing(c), matches: presentMatches(Array.isArray(c.matches) ? c.matches : [], role),
  };
};

export const createSnapshotService = ({ repo }) => {
  // Quyền đọc §8.4: thành viên, GVHD hiện hành, GV cũ được cấp quyền đọc, STAFF trong phạm vi khoa (GV được đề nghị chưa có quyền)
  const load = async (user, id) => {
    const t = await repo.findDetail(id);
    if (!t) throw notFound();
    const rel = relations(t, user);
    if (!canReadExecution(t, rel)) throw forbidden();
    return t;
  };
  // Snapshot: thêm người đã rời nhóm, chỉ bản tạo trong khoảng là thành viên (FR21, API_GD6 §5.4)
  const reader = async (user, id) => {
    const t = await repo.findDetail(id);
    if (!t) throw notFound();
    const can = versionReader(t, relations(t, user));
    if (!can) throw forbidden();
    return can;
  };
  const brief = (s) => ({ seq: s.seq, createdAt: iso(s.createdAt), payload: s.payload });

  return {
    async list(user, id) {
      const can = await reader(user, id);
      const rows = (await repo.listSubmissions(id)).filter((s) => can(s.createdAt));
      return {
        items: rows.map((s) => ({
          id: s.id, seq: s.seq, createdAt: iso(s.createdAt), createdBy: { fullName: s.createdBy.fullName },
          similarityLevel: s.similarityCheck?.status === 'OK' ? s.similarityCheck.level : null,
          similarityStatus: s.similarityCheck?.status ?? null, unchecked: isUnchecked(s), // G5 §9.5
          decision: s.decision ? { action: s.decision.action, decidedAt: iso(s.decision.decidedAt) } : null,
        })),
      };
    },

    async get(user, id, seq) {
      const can = await reader(user, id);
      const [s] = await repo.findSubmissions(id, [seq]);
      if (!s) throw notFound();
      if (!can(s.createdAt)) throw forbidden();
      const ids = s.payload.documentIds ?? [];
      const docs = ids.length ? await repo.findDocumentBriefs(ids) : [];
      // G5 §9.5: ai cho phép gửi khi chưa kiểm tra (bất biến trong payload); GV không thấy lý do
      const b = s.payload.similarityBypassId ? await repo.findBypass(s.payload.similarityBypassId) : null;
      return {
        submission: {
          id: s.id, seq: s.seq, createdAt: iso(s.createdAt), createdBy: { id: s.createdBy.id, fullName: s.createdBy.fullName },
          payload: { ...s.payload, documents: docs.map((d) => ({ id: d.id, fileName: d.fileName, kind: d.kind, version: d.version, uploadedAt: iso(d.uploadedAt) })) },
          similarityCheck: s.similarityCheck ? checkView(s.similarityCheck, user.role) : null,
          unchecked: isUnchecked(s),
          similarityBypass: b ? { reason: user.role === 'LECTURER' ? null : b.reason, grantedBy: { fullName: b.grantedBy.fullName }, createdAt: iso(b.createdAt) } : null,
          decision: s.decision
            ? { action: s.decision.action, reason: s.decision.reason, decidedBy: { fullName: s.decision.decidedBy.fullName }, decidedAt: iso(s.decision.decidedAt) }
            : null,
        },
      };
    },

    async diff(user, id, { from, to }) {
      const can = await reader(user, id);
      const rows = await repo.findSubmissions(id, [from, to]);
      const a = rows.find((s) => s.seq === from);
      const b = rows.find((s) => s.seq === to);
      if (!a || !b) throw notFound();
      if (!can(a.createdAt) || !can(b.createdAt)) throw forbidden();
      const p = a.payload;
      const q = b.payload;
      return {
        from: brief(a), to: brief(b),
        changes: {
          title: p.title !== q.title, summary: p.summary !== q.summary, objectives: p.objectives !== q.objectives, fieldId: (p.fieldId ?? null) !== (q.fieldId ?? null),
          keywords: sameSet(p.keywords ?? [], q.keywords ?? []),
          documents: [...(p.documentIds ?? [])].sort().join() !== [...(q.documentIds ?? [])].sort().join(),
        },
      };
    },

    async history(user, id) {
      await load(user, id);
      const rows = await repo.listStatusHistory(id);
      return { items: rows.map((h) => ({ from: h.from, to: h.to, action: h.action, actor: { fullName: h.actor.fullName, role: h.actor.role }, reason: h.reason, at: iso(h.at) })) };
    },
  };
};
