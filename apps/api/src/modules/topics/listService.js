// Danh sách đề tài theo phạm vi vai trò (FR08, FR25, API_GD2 §9.1). Phạm vi áp ở WHERE, trước phân trang và total.
const iso = (d) => d.toISOString();
const SORTS = {
  updatedAt_desc: [{ updatedAt: 'desc' }, { id: 'asc' }],
  updatedAt_asc: [{ updatedAt: 'asc' }, { id: 'asc' }],
  code_asc: [{ code: 'asc' }],
  title_asc: [{ title: 'asc' }, { id: 'asc' }],
};

export const createListService = ({ repo, now = () => new Date() }) => {
  const scopeOf = (user) => {
    if (user.role === 'STUDENT') return { members: { some: { userId: user.id, leftAt: null } } };
    if (user.role === 'LECTURER') return { advisings: { some: { lecturerId: user.id, endAt: null } } };
    if (user.role === 'STAFF') return { facultyId: { in: user.staffFacultyIds ?? [] }, status: { not: 'DRAFT' } };
    return { id: { in: [] } }; // ADMIN và vai trò lạ: không có phạm vi nghiệp vụ
  };

  const present = (t) => {
    const n = now();
    const adv = t.advisings[0];
    const leader = t.members.find((m) => m.role === 'LEADER');
    const sub = t.submissions[0];
    const sim = t.similarityChecks[0];
    return {
      id: t.id, code: t.code, title: t.title, status: t.status, version: t.version,
      round: { id: t.round.id, name: t.round.name, academicYear: t.round.academicYear, regCloseAt: iso(t.round.regCloseAt), reviewDeadline: iso(t.round.reviewDeadline), registrationOpen: t.round.regOpenAt <= n && n < t.round.regCloseAt },
      field: t.field ? { id: t.field.id, name: t.field.name } : null,
      advisor: adv ? { id: adv.lecturer.id, fullName: adv.lecturer.fullName } : null,
      leader: leader ? { code: leader.user.code, fullName: leader.user.fullName } : null,
      memberCount: t.members.length,
      latestSubmission: sub ? { seq: sub.seq, createdAt: iso(sub.createdAt) } : null,
      result: t.status === 'CLOSED' ? (t.results[0]?.result ?? null) : null, // G27: kết quả chính thức chỉ khi đã đóng
      latestSimilarityLevel: sim?.status === 'OK' ? sim.level : null,
      updatedAt: iso(t.updatedAt),
    };
  };

  return {
    async list(user, q) {
      const and = [scopeOf(user)];
      for (const k of ['roundId', 'fieldId', 'status']) if (q[k]) and.push({ [k]: q[k] });
      if (q.academicYear) and.push({ round: { academicYear: q.academicYear } });
      if (q.lecturerId) and.push({ advisings: { some: { lecturerId: q.lecturerId, endAt: null } } });
      if (q.result) and.push({ status: 'CLOSED', results: { some: { isCurrent: true, result: q.result } } }); // G27, cùng định nghĩa với thống kê
      if (q.q) and.push({ id: { in: await repo.searchIds(q.q) } });
      const { total, rows } = await repo.list({ where: { AND: and }, orderBy: SORTS[q.sort], skip: (q.page - 1) * q.pageSize, take: q.pageSize });
      return { items: rows.map(present), page: q.page, pageSize: q.pageSize, total };
    },
  };
};
