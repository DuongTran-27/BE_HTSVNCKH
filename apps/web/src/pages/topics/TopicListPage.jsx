import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { FINAL_RESULT_LABEL, TOPIC_STATUS_LABEL } from '@nckh/shared';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.js';
import { fmtDateTime, qs } from '../../lib/format.js';
import { useCatalog } from '../../lib/queries.js';
import { pickEnum, pickPage, pickYear, useUrlParams } from '../../lib/urlParams.js';
import { DebouncedInput, FilterSelect } from '../../components/ListFilters.jsx';
import { SimilarityLevelCell } from '../../components/SimilarityPanel.jsx';
import { Badge, Pager, QueryBox, btnGhost, btnPrimary } from '../../components/ui.jsx';

const TITLE = { STUDENT: 'Đề tài của tôi', LECTURER: 'Đề tài hướng dẫn', STAFF: 'Đề tài của khoa' };
const SORTS = { updatedAt_desc: 'Mới cập nhật', updatedAt_asc: 'Cập nhật cũ nhất', code_asc: 'Mã đề tài', title_asc: 'Tên đề tài' };
const toOptions = (labels) => Object.entries(labels).map(([value, label]) => ({ value, label }));
const STUCK = ['DRAFT', 'WAITING_ADVISOR', 'HAS_ADVISOR'];

// R4 – API_GD2 §9.1. Lọc, sắp xếp, phân trang ở server; trạng thái nằm trên URL
export function TopicListPage() {
  const { user } = useAuth();
  const here = useLocation();
  const u = useUrlParams();
  const isStaff = user?.role === 'STAFF';
  const isStudent = user?.role === 'STUDENT';
  const params = {
    roundId: u.get('roundId'), academicYear: pickYear(u.get('academicYear')), fieldId: u.get('fieldId'),
    lecturerId: isStaff ? u.get('lecturerId') : '',
    status: pickEnum(u.get('status'), Object.keys(TOPIC_STATUS_LABEL)), result: pickEnum(u.get('result'), Object.keys(FINAL_RESULT_LABEL)),
    q: u.get('q').slice(0, 200), sort: pickEnum(u.get('sort'), Object.keys(SORTS)), page: pickPage(u.get('page')),
  };
  const rounds = useQuery({ queryKey: ['rounds', 'all'], queryFn: async () => (await api('/rounds?pageSize=100')).items });
  const fields = useCatalog('fields');
  const [lecturerQ, setLecturerQ] = useState(''); // UI §4.4: ô tìm kiếm gọi API `q`, không giới hạn 100 GV đầu
  const lecturers = useQuery({ queryKey: ['users', 'lecturers-filter', lecturerQ], enabled: isStaff, queryFn: async () => (await api(`/users${qs({ role: 'LECTURER', q: lecturerQ, pageSize: 50 })}`)).items });
  const lecturerOptions = (lecturers.data ?? []).map((l) => ({ value: l.id, label: `${l.code} – ${l.fullName}` }));
  // GV đang lọc (từ URL) có thể không nằm trong kết quả tìm → vẫn giữ làm lựa chọn để ô chọn khớp bộ lọc
  if (params.lecturerId && !lecturerOptions.some((o) => o.value === params.lecturerId)) lecturerOptions.unshift({ value: params.lecturerId, label: 'Giảng viên đang lọc' });
  const invitations = useQuery({ queryKey: ['invitations', 'banner'], enabled: isStudent, queryFn: () => api('/invitations?status=PENDING&pageSize=1') });
  const query = useQuery({
    queryKey: ['topics', 'list', params],
    queryFn: () => api(`/topics${qs({ ...params, pageSize: 20 })}`),
    placeholderData: keepPreviousData,
  });
  const pending = invitations.data?.total ?? 0;
  const yearBad = u.get('academicYear') && !params.academicYear;
  const filters = (
    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <DebouncedInput label="Tìm kiếm" value={params.q} onCommit={(v) => u.set('q', v)} placeholder="Mã, tên, từ khóa" />
      <FilterSelect label="Đợt" value={params.roundId} onChange={(v) => u.set('roundId', v)} placeholder="Mọi đợt"
        options={(rounds.data ?? []).map((r) => ({ value: r.id, label: `${r.name} (${r.academicYear})` }))} />
      <div>
        <DebouncedInput label="Năm học" value={u.get('academicYear')} onCommit={(v) => u.set('academicYear', v)} placeholder="2026-2027" maxLength={9} />
        {yearBad && <p className="mt-1 text-sm text-red-700">Năm học dạng 2026-2027</p>}
      </div>
      <FilterSelect label="Lĩnh vực" value={params.fieldId} onChange={(v) => u.set('fieldId', v)} placeholder="Mọi lĩnh vực"
        options={(fields.data ?? []).map((f) => ({ value: f.id, label: f.name }))} />
      {isStaff && (
        <div>
          <DebouncedInput label="Tìm giảng viên" value={lecturerQ} onCommit={setLecturerQ} placeholder="Mã hoặc họ tên" />
          <FilterSelect label="Giảng viên hướng dẫn" value={params.lecturerId} onChange={(v) => u.set('lecturerId', v)} placeholder="Mọi giảng viên" options={lecturerOptions} />
        </div>
      )}
      <FilterSelect label="Trạng thái" value={params.status} onChange={(v) => u.set('status', v)} placeholder="Mọi trạng thái" options={toOptions(TOPIC_STATUS_LABEL)} />
      <FilterSelect label="Kết quả" value={params.result} onChange={(v) => u.set('result', v)} placeholder="Mọi kết quả" options={toOptions(FINAL_RESULT_LABEL)} />
      <FilterSelect label="Sắp xếp" value={params.sort} onChange={(v) => u.set('sort', v)} placeholder="Mới cập nhật" options={toOptions(SORTS)} />
    </div>
  );
  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">{TITLE[user?.role] ?? 'Đề tài'}</h1>
        {isStudent && <Link to="/de-tai/moi" className={btnPrimary}>Tạo đề tài</Link>}
      </div>
      {isStudent && pending > 0 && (
        <p role="status" className="mt-3 rounded-md bg-blue-50 p-3 text-blue-900">
          Bạn có {pending} lời mời đang chờ. <Link to="/loi-moi" className="font-medium underline">Xem lời mời</Link>
        </p>
      )}
      {isStaff && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={btnGhost} onClick={() => u.set('status', 'WAITING_ADVISOR')}>Đề tài chờ GVHD</button>
          <button type="button" className={btnGhost} onClick={() => u.set('status', 'HAS_ADVISOR')}>Đề tài đã có GVHD chưa gửi</button>
        </div>
      )}
      {isStaff ? filters : <details className="mt-3" open={u.any}><summary className="min-h-11 cursor-pointer font-medium">Lọc</summary>{filters}</details>}
      {u.any && <button type="button" className={`${btnGhost} mt-2`} onClick={u.clear}>Xóa bộ lọc</button>}
      <div className="mt-3">
        <QueryBox query={query} empty={u.any ? 'Không có đề tài nào khớp bộ lọc.' : 'Chưa có đề tài nào.'} isEmpty={(d) => d.items.length === 0}>
          {(d) => (
            <>
              <ul className="space-y-2">
                {d.items.map((t) => (
                  <li key={t.id} className="rounded-md border border-slate-300 p-3">
                    <Link to={`/de-tai/${t.id}`} state={{ from: here.pathname + here.search }} className="break-words font-medium text-blue-800 underline">{t.code} – {t.title}</Link>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                      <Badge>{TOPIC_STATUS_LABEL[t.status]}</Badge>
                      {t.round?.registrationOpen === false && STUCK.includes(t.status) && <Badge tone="amber">Đã đóng đăng ký</Badge>}
                      {t.result && <Badge tone="green">{FINAL_RESULT_LABEL[t.result] ?? t.result}</Badge>}
                    </p>
                    <p className="mt-1 break-words text-sm text-slate-700">
                      {t.round?.name} · {t.field?.name} · GVHD: {t.advisor?.fullName ?? 'Chưa có'} · Trưởng nhóm: {t.leader?.fullName} · {t.memberCount} thành viên
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                      <span>Trùng lặp: <SimilarityLevelCell level={t.latestSimilarityLevel} status={t.latestSimilarityStatus} unchecked={t.latestSubmission?.unchecked} /></span>
                      <span>Cập nhật {fmtDateTime(t.updatedAt)}</span>
                    </p>
                  </li>
                ))}
              </ul>
              <Pager page={d.page} pageSize={d.pageSize} total={d.total} onPage={(p) => u.set('page', p > 1 ? String(p) : '')} />
            </>
          )}
        </QueryBox>
      </div>
    </section>
  );
}
