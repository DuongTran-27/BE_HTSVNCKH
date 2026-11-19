// FR14 (API_GD45 §9): JSON và CSV cùng đi qua computeStats – không có code đếm thứ hai.
import { TOPIC_STATUS_LABEL, TOPIC_ORIGIN_LABEL, FINAL_RESULT_LABEL, STATS_DIMENSION_LABEL, toCsv } from '@nckh/shared';
import { forbidden, badRequest } from '../../lib/errors.js';

const MAX_ROWS = 1000;
const MAX_EXPORT_TOPICS = 5000; // FR39 (GD7 §10.3): trần số dòng sheet "Danh sách đề tài"
const EMPTY_LABEL = { lecturer: 'Chưa có giảng viên hướng dẫn', field: 'Chưa chọn lĩnh vực', result: 'Chưa có kết quả chính thức' };
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
    // FR39 (GD7 §10.3): sheet 1 từ đúng computeStats (cùng cột CSV), sheet 2 từ cùng statsWhere (repo.listTopicsForExport).
    // Trần được kiểm bằng `total` trước khi đọc danh sách để không bao giờ cắt cụt im lặng.
    async buildXlsxSheets(user, q) {
      const { rows, total } = await computeStats(user, q);
      if (total > MAX_EXPORT_TOPICS) throw badRequest('VALIDATION_ERROR', 'Quá nhiều đề tài, hãy thu hẹp bộ lọc');
      const topics = await repo.listTopicsForExport(scopeOf(user, q), q, MAX_EXPORT_TOPICS);
      return [
        { name: 'Thống kê', columns: [{ key: 'label', header: STATS_DIMENSION_LABEL[q.groupBy], width: 40 }, { key: 'count', header: 'Số đề tài' }], rows },
        {
          name: 'Danh sách đề tài',
          columns: [
            { key: 'code', header: 'Mã', width: 16 }, { key: 'title', header: 'Tên đề tài', width: 50 }, { key: 'status', header: 'Trạng thái' },
            { key: 'round', header: 'Đợt' }, { key: 'academicYear', header: 'Năm học' }, { key: 'field', header: 'Lĩnh vực' },
            { key: 'lecturer', header: 'GVHD hiện hành' }, { key: 'memberCount', header: 'Số thành viên' }, { key: 'origin', header: 'Nguồn' },
            { key: 'result', header: 'Kết quả' }, { key: 'defenseScore', header: 'Điểm bảo vệ' },
          ],
          rows: topics.map((t) => ({
            code: t.code, title: t.title, status: TOPIC_STATUS_LABEL[t.status] ?? t.status, round: t.roundName, academicYear: t.academicYear,
            field: t.fieldName ?? '', lecturer: t.lecturerName ?? '', memberCount: t.memberCount, origin: TOPIC_ORIGIN_LABEL[t.origin] ?? t.origin,
            result: t.result ? (FINAL_RESULT_LABEL[t.result] ?? t.result) : '', defenseScore: t.defenseScore ?? null,
          })),
        },
      ];
    },
    async exportCsv(user, q) {
      const { rows } = await computeStats(user, q);
      return toCsv(rows, [{ key: 'label', header: STATS_DIMENSION_LABEL[q.groupBy] }, { key: 'count', header: 'Số đề tài' }]);
    },
  };
};
