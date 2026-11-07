// FR14 (API_GD45 §9): JSON và CSV cùng đi qua computeStats – không có code đếm thứ hai.
import { TOPIC_STATUS_LABEL, FINAL_RESULT_LABEL, STATS_DIMENSION_LABEL, toCsv } from '@nckh/shared';
import { forbidden, badRequest } from '../../lib/errors.js';

const MAX_ROWS = 1000;
const EMPTY_LABEL = { lecturer: 'Chưa có GVHD', field: 'Chưa chọn lĩnh vực', result: 'Chưa có kết quả chính thức' };
const labelOf = (groupBy, key, name) => {
  if (key === null) return EMPTY_LABEL[groupBy] ?? '';
  if (groupBy === 'status') return TOPIC_STATUS_LABEL[key] ?? key;
  if (groupBy === 'result') return FINAL_RESULT_LABEL[key] ?? key;
  return name;
};

export const createStatsService = ({ repo }) => {
  const scopeOf = (user, q) => {
    if (user.role === 'STAFF') {
      const facultyIds = user.staffFacultyIds ?? [];
      if (q.facultyId && !facultyIds.includes(q.facultyId)) throw forbidden();
      return { facultyIds };
    }
    if (user.role === 'LECTURER') {
      if (q.facultyId) throw badRequest('VALIDATION_ERROR', 'Dữ liệu không hợp lệ', { facultyId: 'Giảng viên không lọc theo khoa' });
      return { lecturerId: user.id };
    }
    throw forbidden(); // STUDENT, ADMIN (FR25) – route đã chặn, đây là lớp thứ hai
  };

  const computeStats = async (user, q) => {
    const raw = await repo.groupTopics(q.groupBy, scopeOf(user, q), q);
    const rows = raw.map((r) => ({ key: r.key ?? null, label: labelOf(q.groupBy, r.key ?? null, r.name), count: r.count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'vi'));
    // §9: total = số đề tài khớp bộ lọc, nên tính trước khi cắt MAX_ROWS
    return { groupBy: q.groupBy, total: rows.reduce((s, r) => s + r.count, 0), rows: rows.slice(0, MAX_ROWS) };
  };

  return {
    computeStats,
    async exportCsv(user, q) {
      const { rows } = await computeStats(user, q);
      return toCsv(rows, [{ key: 'label', header: STATS_DIMENSION_LABEL[q.groupBy] }, { key: 'count', header: 'Số đề tài' }]);
    },
  };
};
