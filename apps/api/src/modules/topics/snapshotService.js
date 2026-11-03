// Đọc snapshot hồ sơ và lịch sử trạng thái (FR17, API_GD2 §8.4). Chỉ đọc.
import { forbidden, notFound } from '../../lib/errors.js';
import { presentMatches } from '../similarity/service.js';
import { relations } from './service.js';

const iso = (d) => d.toISOString();
const sameSet = (a, b) => ({ added: b.filter((k) => !a.includes(k)), removed: a.filter((k) => !b.includes(k)) });

// Hồ sơ chờ chỉ STAFF thấy chi tiết: đi qua presentMatches theo vai trò người xem
const checkView = (c, role) => {
  if (c.status !== 'OK') return { id: c.id, status: c.status, level: null, matches: [], justification: c.justification ?? null, createdAt: iso(c.createdAt), message: 'Chưa kiểm tra được' };
  return {
    id: c.id, status: c.status, level: c.level, createdAt: iso(c.createdAt), algorithmVersion: c.algorithmVersion, corpusSize: c.corpusSize,
    justification: c.justification ?? null, matches: presentMatches(Array.isArray(c.matches) ? c.matches : [], role),
  };
};

export const createSnapshotService = ({ repo }) => {
  // Quyền đọc §8.4: thành viên, GVHD hiện hành, STAFF trong phạm vi khoa (GV được đề nghị chưa có quyền)
  const load = async (user, id) => {
    const t = await repo.findDetail(id);
    if (!t) throw notFound();
    const rel = relations(t, user);
    if (!(rel.isMember || rel.isCurrentAdvisor || rel.inStaffScope)) throw forbidden();
    return t;
  };
  const brief = (s) => ({ seq: s.seq, createdAt: iso(s.createdAt), payload: s.payload });

  return {
    async list(user, id) {
      await load(user, id);
      const rows = await repo.listSubmissions(id);
      return {
        items: rows.map((s) => ({
          id: s.id, seq: s.seq, createdAt: iso(s.createdAt), createdBy: { fullName: s.createdBy.fullName },
          similarityLevel: s.similarityCheck?.status === 'OK' ? s.similarityCheck.level : null,
          decision: s.decision ? { action: s.decision.action, decidedAt: iso(s.decision.decidedAt) } : null,
        })),
      };
    },

    async get(user, id, seq) {
      await load(user, id);
      const [s] = await repo.findSubmissions(id, [seq]);
      if (!s) throw notFound();
      return {
        submission: {
          id: s.id, seq: s.seq, createdAt: iso(s.createdAt), createdBy: { id: s.createdBy.id, fullName: s.createdBy.fullName },
          payload: s.payload,
          similarityCheck: s.similarityCheck ? checkView(s.similarityCheck, user.role) : null,
          decision: s.decision
            ? { action: s.decision.action, reason: s.decision.reason, decidedBy: { fullName: s.decision.decidedBy.fullName }, decidedAt: iso(s.decision.decidedAt) }
            : null,
        },
      };
    },

    async diff(user, id, { from, to }) {
      await load(user, id);
      const rows = await repo.findSubmissions(id, [from, to]);
      const a = rows.find((s) => s.seq === from);
      const b = rows.find((s) => s.seq === to);
      if (!a || !b) throw notFound();
      const p = a.payload;
      const q = b.payload;
      return {
        from: brief(a), to: brief(b),
        changes: {
          title: p.title !== q.title, summary: p.summary !== q.summary, objectives: p.objectives !== q.objectives, fieldId: (p.fieldId ?? null) !== (q.fieldId ?? null),
          keywords: sameSet(p.keywords ?? [], q.keywords ?? []),
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
