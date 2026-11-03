// Kho đề tài chung (FR08, API_GD2 §9.2): chỉ đề tài CLOSED có kết quả hiện hành đạt; chỉ các trường FR08.
import { REPOSITORY_RESULTS } from '@nckh/shared';
import { notFound } from '../../lib/errors.js';

const inRepo = (result) => ({ status: 'CLOSED', results: { some: { isCurrent: true, result: result ?? { in: REPOSITORY_RESULTS } } } });
const base = (t) => ({ code: t.code, title: t.title, field: t.field ? { name: t.field.name } : null, academicYear: t.round.academicYear, result: t.results[0]?.result ?? null });

export const createRepositoryService = ({ repo }) => ({
  async list(q) {
    const and = [inRepo(q.result)];
    if (q.fieldId) and.push({ fieldId: q.fieldId });
    if (q.academicYear) and.push({ round: { academicYear: q.academicYear } });
    if (q.q) and.push({ id: { in: await repo.searchIds(q.q) } });
    const { total, rows } = await repo.listRepository({ where: { AND: and }, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize });
    // summaryExcerpt: 300 ký tự đầu (theo code point để không cắt đôi ký tự)
    return { items: rows.map((t) => { const { code, title, field, academicYear, result } = base(t); return { code, title, summaryExcerpt: [...t.summary].slice(0, 300).join(''), field, academicYear, result }; }), page: q.page, pageSize: q.pageSize, total };
  },
  async get(code) {
    const t = await repo.findRepositoryItem({ code, ...inRepo() });
    if (!t) throw notFound();
    return { topic: { ...base(t), summary: t.summary } };
  },
});
