// T214 (FR02–FR08, FR16, FR17, NFR05, NFR06): luồng GĐ2 viết từ đặc tả API_GD2, chỉ qua HTTP + Prisma (không mock service).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  prisma, S, U, seedBase, mkRound, mkTopic, addMember, mkInvite, mkWaiting, topicOf, at, post, put, get, act, as,
} from './t214-kit.js';
import request from 'supertest';
import { app } from './t214-kit.js';

beforeAll(() => seedBase({ students: 40 }), 60000);
afterAll(() => prisma.$disconnect());

const history = (t) => prisma.statusHistory.findMany({ where: { topicId: t.id }, orderBy: { at: 'asc' } });
const FULL = (suffix) => ({
  title: `Nghiên cứu hệ thống gợi ý học liệu ${suffix}`, summary: 'xây dựng hệ thống gợi ý', objectives: 'Đạt độ chính xác gợi ý trên chín mươi phần trăm',
  keywords: ['gợi ý', 'học liệu'], fieldId: S.field.id,
});

// Gây lỗi thật ở DB (trigger ném exception) để kiểm rollback mà không mock service. NFR05: "giả lập lỗi giữa transaction".
async function withFault(table, fn) {
  await prisma.$executeRawUnsafe('CREATE OR REPLACE FUNCTION t214_fail() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION \'T214 fault\'; END $$ LANGUAGE plpgsql');
  await prisma.$executeRawUnsafe(`CREATE TRIGGER t214_fault BEFORE INSERT ON "${table}" FOR EACH ROW EXECUTE FUNCTION t214_fail()`);
  try { return await fn(); } finally { await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS t214_fault ON "${table}"`); }
}

describe('TC-FR05-F1 luồng đầy đủ từ tạo nhóm đến duyệt', () => {
  it('tạo -> mời -> chấp nhận -> đề nghị -> GV nhận -> gửi -> cán bộ duyệt; StatusHistory đủ bước, snapshot bất biến', async () => {
    const created = await post('s1', '/api/topics', { roundId: S.round.id, ...FULL('F1') });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    let topic = created.body.topic;
    expect(topic).toMatchObject({ status: 'DRAFT', version: 0 });
    expect(topic.code).toMatch(/^NCKH-2026-\d{4}$/);

    const inv = await post('s1', `/api/topics/${topic.id}/invitations`, { inviteeCode: 's2' });
    expect(inv.status).toBe(201);
    expect((await post('s2', `/api/invitations/${inv.body.invitation.id}/accept`)).status).toBe(200);
    topic = (await get('s1', `/api/topics/${topic.id}`)).body.topic;
    expect(topic.members.map((m) => m.code).sort()).toEqual(['s1', 's2']);
    expect(topic.version).toBe(1);

    let r = await act('s1', topic, { action: 'REQUEST_ADVISOR', lecturerId: U.lecA.id, version: topic.version });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.topic.status).toBe('WAITING_ADVISOR');
    r = await act('lecA', topic, { action: 'ACCEPT_ADVISING', version: r.body.topic.version });
    expect(r.body.topic).toMatchObject({ status: 'HAS_ADVISOR', advisor: { id: U.lecA.id } });

    r = await act('s1', topic, { action: 'SUBMIT_FOR_REVIEW', version: r.body.topic.version });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.topic.status).toBe('UNDER_REVIEW');
    const sub = r.body.submission;
    expect(sub.seq).toBe(1);

    // sau khi gửi, sửa nội dung đề tài không đổi snapshot (FR17)
    await prisma.topic.update({ where: { id: topic.id }, data: { title: 'Tiêu đề đã bị đổi sau khi gửi' } });
    const snap = await get('lecA', `/api/topics/${topic.id}/submissions/1`);
    expect(snap.status).toBe(200);
    expect(snap.body.submission.payload.title).toBe(FULL('F1').title);

    r = await act('staff1', topic, { action: 'APPROVE', submissionId: sub.id, version: r.body.topic.version });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.topic.status).toBe('IN_PROGRESS');
    expect((await history(topic)).map((h) => `${h.from}>${h.to}`)).toEqual([
      'DRAFT>WAITING_ADVISOR', 'WAITING_ADVISOR>HAS_ADVISOR', 'HAS_ADVISOR>UNDER_REVIEW', 'UNDER_REVIEW>IN_PROGRESS',
    ]);
    const dec = await prisma.reviewDecision.findUnique({ where: { submissionId: sub.id } });
    expect(dec).toMatchObject({ action: 'APPROVE', decidedById: U.staff1.id });
  });

  it('TC-FR07-F2 REQUEST_REVISION rồi RESUBMIT tạo snapshot thứ 2; quyết định cũ gắn snapshot 1; STALE_SUBMISSION khi dùng snapshot cũ', async () => {
    const t = await mkTopic('s3', S.round, { status: 'HAS_ADVISOR' });
    await prisma.advising.create({ data: { topicId: t.id, lecturerId: U.lecA.id } });
    let r = await act('s3', t, { action: 'SUBMIT_FOR_REVIEW', version: 0 });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const s1 = r.body.submission;
    r = await act('staff1', t, { action: 'REQUEST_REVISION', submissionId: s1.id, reason: 'Bổ sung phương pháp', version: r.body.topic.version });
    expect(r.body.topic.status).toBe('NEEDS_REVISION');
    expect(r.body.topic.latestSubmission.decision).toMatchObject({ action: 'REQUEST_REVISION', reason: 'Bổ sung phương pháp' });
    r = await act('s3', t, { action: 'RESUBMIT', version: r.body.topic.version });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.submission.seq).toBe(2);
    const stale = await act('staff1', t, { action: 'APPROVE', submissionId: s1.id, version: r.body.topic.version });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('STALE_SUBMISSION');
    const diff = await get('staff1', `/api/topics/${t.id}/submission-diff?from=1&to=2`);
    expect(diff.status).toBe(200);
  });
});

describe('NFR05 rollback khi lỗi giữa transaction (lỗi DB thật, không mock)', () => {
  it('TC-NFR05-01 accept lời mời: lỗi khi tạo TopicMember -> lời mời vẫn PENDING, version không tăng, không AuditLog', async () => {
    const t = await mkTopic('s10');
    const inv = await mkInvite(t, 's11');
    const res = await withFault('TopicMember', () => post('s11', `/api/invitations/${inv.id}/accept`));
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect((await prisma.invitation.findUnique({ where: { id: inv.id } })).status).toBe('PENDING');
    expect((await topicOf(t)).version).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: 'INVITATION_ACCEPT', entityId: inv.id } })).toBe(0);
    // sau khi hết lỗi, thao tác chạy lại được bình thường
    expect((await post('s11', `/api/invitations/${inv.id}/accept`)).status).toBe(200);
  });

  it('TC-NFR05-02 REQUEST_ADVISOR: lỗi khi tạo AdvisorRequest -> vẫn Nháp, lời mời còn PENDING, không StatusHistory', async () => {
    const t = await mkTopic('s12');
    const inv = await mkInvite(t, 's13');
    const res = await withFault('AdvisorRequest', () => act('s12', t, { action: 'REQUEST_ADVISOR', lecturerId: U.lecA.id }));
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(await topicOf(t)).toMatchObject({ status: 'DRAFT', version: 0 });
    expect((await prisma.invitation.findUnique({ where: { id: inv.id } })).status).toBe('PENDING');
    expect(await history(t)).toHaveLength(0);
  });

  it('TC-NFR05-03 ACCEPT_ADVISING: lỗi khi tạo Advising -> vẫn WAITING_ADVISOR, request vẫn PENDING', async () => {
    const t = await mkWaiting('s14', 'lecB');
    const res = await withFault('Advising', () => act('lecB', t, { action: 'ACCEPT_ADVISING' }));
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(await topicOf(t)).toMatchObject({ status: 'WAITING_ADVISOR', version: 0 });
    expect(await prisma.advisorRequest.count({ where: { topicId: t.id, status: 'PENDING' } })).toBe(1);
    expect(await history(t)).toHaveLength(0);
  });

  it('TC-NFR05-04 SUBMIT_FOR_REVIEW: lỗi khi tạo Submission -> vẫn HAS_ADVISOR, không Submission, không StatusHistory', async () => {
    const t = await mkTopic('s15', S.round, { status: 'HAS_ADVISOR' });
    await prisma.advising.create({ data: { topicId: t.id, lecturerId: U.lecA.id } });
    const res = await withFault('Submission', () => act('s15', t, { action: 'SUBMIT_FOR_REVIEW' }));
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(await topicOf(t)).toMatchObject({ status: 'HAS_ADVISOR', version: 0 });
    expect(await prisma.submission.count({ where: { topicId: t.id } })).toBe(0);
    expect(await history(t)).toHaveLength(0);
  });

  it('TC-NFR05-05 APPROVE: lỗi khi tạo ReviewDecision -> vẫn UNDER_REVIEW, không StatusHistory', async () => {
    const t = await mkTopic('s16', S.round, { status: 'UNDER_REVIEW' });
    const sub = await prisma.submission.create({ data: { topicId: t.id, seq: 1, createdById: U.s16.id, payload: { title: 'x' } } });
    const res = await withFault('ReviewDecision', () => act('staff1', t, { action: 'APPROVE', submissionId: sub.id }));
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(await topicOf(t)).toMatchObject({ status: 'UNDER_REVIEW', version: 0 });
    expect(await history(t)).toHaveLength(0);
    expect(await prisma.reviewDecision.count({ where: { submissionId: sub.id } })).toBe(0);
  });

  it('TC-NFR05-06 lỗi không rò thông tin nội bộ: thông điệp tiếng Việt, không stack, không tên trigger/bảng', async () => {
    const t = await mkWaiting('s17', 'lecB');
    const res = await withFault('Advising', () => act('lecB', t, { action: 'ACCEPT_ADVISING' }));
    expect(res.body.error.message).toMatch(/[ăâêôơưđáàảãạ]/i);
    expect(JSON.stringify(res.body)).not.toMatch(/T214 fault|stack|prisma|Advising"/i);
  });
});

describe('NFR06 hạn tính theo giờ server, bất kể giờ máy khách', () => {
  const skew = { Date: 'Mon, 01 Jan 2035 00:00:00 GMT', 'X-Client-Time': '2035-01-01T00:00:00+07:00', 'X-Now': '2035-01-01T00:00:00Z' };
  const send = (who, t, body) => request(app).post(`/api/topics/${t.id}/actions`).query({ now: '2020-01-01T00:00:00Z' }).set(as(who)).set(skew).send({ version: 0, ...body });

  it('TC-NFR06-01 đợt đã đóng theo giờ server: máy khách báo năm 2020 hay 2035 vẫn 409 REGISTRATION_CLOSED', async () => {
    const closed = await mkRound(S.F1.id, 'Đã đóng', {}, -30, -1);
    const t = await mkTopic('s20', closed);
    const r = await send('s20', t, { action: 'REQUEST_ADVISOR', lecturerId: U.lecA.id });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('REGISTRATION_CLOSED');
    expect((await topicOf(t)).status).toBe('DRAFT');
  });

  it('TC-NFR06-02 đợt chưa mở theo giờ server: máy khách báo đã mở vẫn bị từ chối', async () => {
    const notYet = await mkRound(S.F1.id, 'Chưa mở', {}, 1, 30);
    const t = await mkTopic('s21', notYet);
    const r = await send('s21', t, { action: 'REQUEST_ADVISOR', lecturerId: U.lecA.id });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('REGISTRATION_CLOSED');
  });

  it('TC-NFR06-03 đợt đang mở: máy khách báo 2035 (quá hạn theo máy khách) vẫn qua', async () => {
    const t = await mkTopic('s22');
    const r = await send('s22', t, { action: 'REQUEST_ADVISOR', lecturerId: U.lecA.id });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
  });

  it('TC-NFR06-04 nộp sát hạn: hạn còn vài giây thì qua, sau khi hạn trôi qua thì bị từ chối (cùng một đợt)', async () => {
    const close = new Date(Date.now() + 4000);
    const edge = await prisma.round.create({ data: { facultyId: S.F1.id, name: 'Sát hạn', academicYear: '2026-2027', regOpenAt: at(-1), regCloseAt: close, reviewDeadline: at(60), endAt: at(200), config: { minSummaryWords: 3, minKeywords: 1 } } });
    const [a, b] = [await mkTopic('s23', edge), await mkTopic('s24', edge)];
    expect((await send('s23', a, { action: 'REQUEST_ADVISOR', lecturerId: U.lecA.id })).status).toBe(200);
    await new Promise((r) => setTimeout(r, Math.max(0, close.getTime() - Date.now()) + 300));
    const late = await send('s24', b, { action: 'REQUEST_ADVISOR', lecturerId: U.lecA.id });
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('REGISTRATION_CLOSED');
  }, 15000);

  it('TC-NFR06-05 SUBMIT_FOR_REVIEW sau hạn đăng ký bị chặn, RESUBMIT không bị chặn theo hạn (G2)', async () => {
    const closed = await mkRound(S.F1.id, 'Đã đóng 2', {}, -30, -1);
    const adv = async (leader, status) => {
      const t = await mkTopic(leader, closed, { status });
      await prisma.advising.create({ data: { topicId: t.id, lecturerId: U.lecA.id } });
      return t;
    };
    const t1 = await adv('s25', 'HAS_ADVISOR');
    const r1 = await send('s25', t1, { action: 'SUBMIT_FOR_REVIEW' });
    expect(r1.status).toBe(409);
    expect(r1.body.error.code).toBe('REGISTRATION_CLOSED');
    const t2 = await adv('s26', 'NEEDS_REVISION');
    const r2 = await send('s26', t2, { action: 'RESUBMIT' });
    expect(r2.status, JSON.stringify(r2.body)).toBe(200);
  });

  it('TC-NFR06-06 mốc có offset +07:00 lưu đúng thời điểm và trả ISO UTC; mốc không offset bị từ chối', async () => {
    const body = {
      facultyId: S.F1.id, name: 'Đợt múi giờ', academicYear: '2031-2032', regOpenAt: '2031-12-01T00:00:00+07:00',
      regCloseAt: '2031-12-30T23:59:59+07:00', reviewDeadline: '2032-01-15T00:00:00+07:00', endAt: '2032-06-30T00:00:00+07:00',
    };
    const ok = await post('staff1', '/api/rounds', body);
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    expect(ok.body.round.regOpenAt).toBe('2031-11-30T17:00:00.000Z');
    expect(ok.body.round.regCloseAt).toBe('2031-12-30T16:59:59.000Z');
    const bad = await post('staff1', '/api/rounds', { ...body, name: 'Không offset', regOpenAt: '2031-12-01T00:00:00' });
    expect(bad.status).toBe(400);
  });

  it('TC-NFR06-07 mọi cột thời gian trong DB là timestamptz', async () => {
    const rows = await prisma.$queryRawUnsafe(
      "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public' AND data_type='timestamp without time zone' AND table_name <> '_prisma_migrations'",
    );
    expect(rows).toEqual([]);
  });
});

describe('MINOR T208-2 accept kiểm lại người được mời', () => {
  // BUG đề xuất BUG-T214-A (MINOR 2 T208): accept không kiểm lại khoa người được mời.
  it('TC-FR03-F3 SV đổi sang khoa khác sau khi được mời thì accept bị từ chối, không tạo thành viên, không đổi version', async () => {
    const t = await mkTopic('s30');
    const inv = await mkInvite(t, 's31');
    await prisma.user.update({ where: { id: U.s31.id }, data: { facultyId: S.F2.id } });
    try {
      const r = await post('s31', `/api/invitations/${inv.id}/accept`);
      expect([400, 403, 409], `status thực tế ${r.status}`).toContain(r.status);
      expect(await prisma.topicMember.count({ where: { topicId: t.id, userId: U.s31.id } })).toBe(0);
      expect((await topicOf(t)).version).toBe(0);
      expect((await prisma.invitation.findUnique({ where: { id: inv.id } })).status).not.toBe('ACCEPTED');
    } finally {
      await prisma.user.update({ where: { id: U.s31.id }, data: { facultyId: S.F1.id } });
    }
  });

  it('TC-FR03-F4 SV bị khóa sau khi được mời: accept 401/403 và không tạo thành viên', async () => {
    const t = await mkTopic('s32');
    const inv = await mkInvite(t, 's33');
    await prisma.user.update({ where: { id: U.s33.id }, data: { isLocked: true } });
    const r = await post('s33', `/api/invitations/${inv.id}/accept`);
    expect([401, 403]).toContain(r.status);
    expect(await prisma.topicMember.count({ where: { topicId: t.id, userId: U.s33.id } })).toBe(0);
  });

  it('TC-FR25-F5 accept lời mời của người khác -> 403; id lạ -> 404; ADMIN -> 403', async () => {
    const t = await mkTopic('s34');
    const inv = await mkInvite(t, 's35');
    for (const who of ['s36', 'admin', 'lecA', 'staff1']) expect((await post(who, `/api/invitations/${inv.id}/accept`)).status, who).toBe(403);
    expect((await post('s35', '/api/invitations/khong-co/accept')).status).toBe(404);
  });
});

describe('FR06 đọc kết quả tương tự theo vai trò (MINOR 1, 3 T211)', () => {
  const CONTENT = {
    title: 'Ứng dụng học sâu nhận diện khuôn mặt điểm danh sinh viên',
    summary: 'Xây dựng hệ thống điểm danh tự động bằng camera trong lớp học, sử dụng mô hình học sâu để nhận diện khuôn mặt sinh viên và ghi nhận chuyên cần vào cơ sở dữ liệu theo thời gian thực.',
    objectives: 'Đạt độ chính xác nhận diện trên 95 phần trăm trong điều kiện ánh sáng lớp học',
  };
  let mine;
  beforeAll(async () => {
    await mkTopic('s40', S.round, { ...CONTENT, keywords: ['trí tuệ nhân tạo', 'điểm danh'], status: 'CLOSED' });
    await mkTopic('s39', S.round, { ...CONTENT, keywords: ['học sâu'], status: 'HAS_ADVISOR' }); // hồ sơ chờ của nhóm khác
    mine = await mkTopic('s38', S.round, { ...CONTENT, keywords: ['AI', 'trí tuệ nhân tạo', 'điểm danh'], status: 'HAS_ADVISOR' });
    await prisma.advising.create({ data: { topicId: mine.id, lecturerId: U.lecA.id } });
    await prisma.synonym.create({ data: { term: 'ai', canonical: 'trí tuệ nhân tạo' } });
    expect((await post('s38', `/api/topics/${mine.id}/similarity-checks`)).status).toBe(200);
  });

  it('TC-FR06-01 GVHD gọi latest: 200 và dòng hồ sơ chờ của nhóm khác bị ẩn (hidden, không lộ mã/tên)', async () => {
    const r = await get('lecA', `/api/topics/${mine.id}/similarity-checks/latest`);
    expect(r.status).toBe(200);
    const hidden = r.body.similarityCheck.matches.filter((m) => m.hidden);
    expect(hidden.length).toBeGreaterThan(0);
    for (const m of hidden) expect(m).not.toHaveProperty('code');
    expect(JSON.stringify(hidden)).not.toMatch(/"(topicId|title|code|status)"/);
  });

  it('TC-FR06-02 STAFF khoa khác 403; STAFF trong phạm vi thấy đầy đủ; ADMIN 403; SV khác nhóm 403', async () => {
    const url = `/api/topics/${mine.id}/similarity-checks/latest`;
    expect((await get('staff2', url)).status).toBe(403);
    expect((await get('admin', url)).status).toBe(403);
    expect((await get('s1', url)).status).toBe(403);
    expect((await get('lecB', url)).status).toBe(403);
    const ok = await get('staff1', url);
    expect(ok.status).toBe(200);
    expect(ok.body.similarityCheck.matches.every((m) => !m.hidden)).toBe(true);
  });

  it('TC-FR06-03 STAFF trong phạm vi nhưng đề tài còn DRAFT -> 403 (FR08/G6)', async () => {
    const d = await mkTopic('s37', S.round, { status: 'DRAFT' });
    expect((await get('staff1', `/api/topics/${d.id}/similarity-checks/latest`)).status).toBe(403);
    expect((await get('staff1', `/api/topics/${d.id}`)).status).toBe(403);
  });

  // BUG đề xuất BUG-T214-B (MINOR 3 T211): matchedKeywords chứa cả hai từ khóa đồng nghĩa.
  it('TC-FR06-04 matchedKeywords không dư khi hai từ khóa của hồ sơ là đồng nghĩa (AI = trí tuệ nhân tạo)', async () => {
    const r = await get('staff1', `/api/topics/${mine.id}/similarity-checks/latest`);
    const closed = r.body.similarityCheck.matches.find((m) => m.status === 'CLOSED');
    expect(closed.matchedKeywords).toContain('điểm danh');
    const hits = closed.matchedKeywords.filter((k) => ['AI', 'trí tuệ nhân tạo'].includes(k));
    expect(hits, `matchedKeywords=${JSON.stringify(closed.matchedKeywords)}`).toHaveLength(1);
  });

  it('TC-FR06-05 phản hồi không lộ errorMessage nội bộ, thành viên, tóm tắt của đề tài khác', async () => {
    const r = await get('s38', `/api/topics/${mine.id}/similarity-checks/latest`);
    expect(JSON.stringify(r.body)).not.toMatch(/errorMessage|summary|members|s39|s40/);
  });
});

describe('FR25 kiểm quyền backend cho các endpoint GĐ2 chính', () => {
  it('TC-FR25-F6 ADMIN nhận 403 ở mọi endpoint nghiệp vụ đề tài/nhóm; chưa đăng nhập 401', async () => {
    const t = await mkTopic('s5');
    const urls = [['get', `/api/topics/${t.id}`], ['get', '/api/topics'], ['get', '/api/invitations'], ['get', '/api/advisor-requests'],
      ['post', `/api/topics/${t.id}/invitations`], ['post', `/api/topics/${t.id}/actions`], ['post', `/api/topics/${t.id}/similarity-checks`]];
    for (const [m, u] of urls) {
      expect((await request(app)[m](u).set(as('admin')).send({})).status, `${m} ${u}`).toBe(403);
      expect((await request(app)[m](u).send({})).status, `${m} ${u} (không token)`).toBe(401);
    }
  });

  it('TC-FR16-F7 chỉ GV được đề nghị mới nhận; GV khác / SV / STAFF -> 403 và không đổi trạng thái', async () => {
    const t = await mkWaiting('s6', 'lecA');
    for (const who of ['lecB', 's6', 'staff1', 'admin']) expect((await act(who, t, { action: 'ACCEPT_ADVISING' })).status, who).toBe(403);
    expect((await topicOf(t)).status).toBe('WAITING_ADVISOR');
  });

  it('TC-FR16-F8 GV từ chối cần lý do; có lý do thì về Nháp, AdvisorRequest DECLINED; trưởng nhóm rút được', async () => {
    const t = await mkWaiting('s7', 'lecA');
    const noReason = await act('lecA', t, { action: 'DECLINE_ADVISING' });
    expect(noReason.status).toBe(400);
    const ok = await act('lecA', t, { action: 'DECLINE_ADVISING', reason: 'Quá tải hướng dẫn' });
    expect(ok.status).toBe(200);
    expect(ok.body.topic.status).toBe('DRAFT');
    expect(await prisma.advisorRequest.findFirst({ where: { topicId: t.id } })).toMatchObject({ status: 'DECLINED', reason: 'Quá tải hướng dẫn' });
    const w = await mkWaiting('s8', 'lecA');
    const wr = await act('s8', w, { action: 'WITHDRAW_ADVISOR_REQUEST' });
    expect(wr.body.topic.status).toBe('DRAFT');
  });

  it('TC-FR03-F9 thành viên không phải trưởng nhóm không gửi được đề nghị; PUT hồ sơ cần đúng version', async () => {
    const t = await mkTopic('s9');
    await addMember(t, 's4');
    expect((await act('s4', t, { action: 'REQUEST_ADVISOR', lecturerId: U.lecA.id })).status).toBe(403);
    const stale = await put('s9', `/api/topics/${t.id}`, { ...FULL('F9'), version: 7 });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('CONCURRENT_UPDATE');
    const ok = await put('s9', `/api/topics/${t.id}`, { ...FULL('F9'), version: 0 });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.topic.version).toBe(1);
  });
});

