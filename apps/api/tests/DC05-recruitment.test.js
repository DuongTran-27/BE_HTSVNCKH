// TASK-DC-05 (FR31, FR06, FR16, FR03 – API_GD7 §3, §4.2): GV công bố đề tài tuyển SV, ngừng tuyển, bảng tin;
// MINOR m1/m2 của DC-01. Test bắt buộc GD7 §3.5 #1–#9. DB test thật.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { prisma, app, S, U, tok, seedBase, mkTopic, mkRound, addMember, mkInvite, CONTENT } from './t214-kit.js';
import { createApp } from '../src/app.js';
import { createAuthRepo } from '../src/modules/auth/prismaRepo.js';
import { createTopicRepo } from '../src/modules/topics/prismaRepo.js';
import { createRoundRepo } from '../src/modules/rounds/prismaRepo.js';
import { assertPublishable, UNPUBLISH_DECLINE_REASON } from '../src/modules/topics/recruitmentService.js';
import { signAccessToken } from '../src/lib/tokens.js';
import { fakeHasher, testEnv } from './helpers.js';

const as = (who) => ({ Authorization: `Bearer ${tok[who]}` });
const post = (who, url, body = {}, a = app) => request(a).post(url).set(as(who)).send(body);
const put = (who, url, body) => request(app).put(url).set(as(who)).send(body);
const get = (who, url) => request(app).get(url).set(as(who));
const code = (r) => r.body.error?.code;
const act = (who, t, body, a = app) => post(who, `/api/topics/${t.id}/actions`, { version: 0, ...body }, a);
const publish = (who, t, o = {}, a = app) => act(who, t, { action: 'PUBLISH_RECRUITMENT', ...o }, a);
const REASON = 'Không đủ sinh viên phù hợp trong đợt này';
const status = async (t) => (await prisma.topic.findUnique({ where: { id: t.id } })).status;
const longJustification = Array.from({ length: 60 }, (_, i) => `giải${i}`).join(' ');
// FR06 lỗi giả lập: kho so không tải được
const broken = createApp({ env: testEnv, logger: undefined, authRepo: createAuthRepo(prisma), hasher: fakeHasher, topicRepo: { ...createTopicRepo(prisma), loadCorpus: async () => { throw new Error('boom'); } }, roundRepo: createRoundRepo(prisma) });

// Người dùng mới mỗi test: limiter 30/15 phút/người và hạn mức GV không bị dồn giữa các test
let n = 0;
const mkUser = async (role, extra = {}) => {
  const key = `${role.toLowerCase()}-dc05-${++n}`;
  U[key] = await prisma.user.create({ data: { code: key, email: `${key}@t.vn`, fullName: `Tên ${key}`, passwordHash: 'x', role, mustChangePassword: false, facultyId: S.F1.id, ...extra } });
  tok[key] = signAccessToken(U[key], { secret: testEnv.JWT_ACCESS_SECRET, ttlSeconds: 600 });
  if (role === 'STAFF') await prisma.staffScope.create({ data: { userId: U[key].id, facultyId: extra.facultyId ?? S.F1.id } });
  return key;
};
let seq = 0;
// Nháp GV công bố đủ trường (dựng thẳng DB); status khác để dựng RECRUITING
const mkLecTopic = async (lec, { round = S.round, status = 'DRAFT', recruitSlots = 3, ...extra } = {}) => {
  const t = await prisma.topic.create({
    data: {
      code: `DC05-${Date.now().toString(36)}-${++seq}`, ...CONTENT(), fieldId: S.field.id, roundId: round.id, facultyId: round.facultyId,
      status, origin: 'LECTURER', requirements: 'Biết Python', recruitSlots, advisings: { create: { lecturerId: U[lec].id } }, ...extra,
    },
  });
  return t;
};
const live = (t) => prisma.topicMember.findMany({ where: { topicId: t.id, leftAt: null } });

beforeAll(() => seedBase({ students: 2 }), 60000);
afterAll(() => prisma.$disconnect());

describe('assertPublishable (§3.3 bước 2) – không cần DB', () => {
  const base = { title: 'Đề tài đủ dài để công bố', summary: 'một hai ba', objectives: 'Mục tiêu đủ hai mươi ký tự', keywords: ['k'], fieldId: 'f1', round: { config: { minSummaryWords: 3, minKeywords: 1 } } };
  it('đủ trường + recruitSlots trong 1..maxMembers → không ném', () => {
    expect(() => assertPublishable({ ...base, recruitSlots: 5 })).not.toThrow();
  });
  it('thiếu recruitSlots, vượt maxMembers, tóm tắt ngắn → TOPIC_INCOMPLETE với khóa theo trường', () => {
    const err = (t) => { try { assertPublishable(t); } catch (e) { return [e.code, Object.keys(e.details).sort()]; } return null; };
    expect(err({ ...base, recruitSlots: null })).toEqual(['TOPIC_INCOMPLETE', ['recruitSlots']]);
    expect(err({ ...base, recruitSlots: 6 })).toEqual(['TOPIC_INCOMPLETE', ['recruitSlots']]);
    expect(err({ ...base, summary: 'ngắn', recruitSlots: 2 })).toEqual(['TOPIC_INCOMPLETE', ['summary']]);
  });
});

describe('§3.1–3.2 tạo và sửa nháp GV', () => {
  it('#1 GV tạo nháp → sửa → công bố: DRAFT → RECRUITING, Advising của GV, không TopicMember, StatusHistory PUBLISH_RECRUITMENT, AuditLog', async () => {
    const lec = await mkUser('LECTURER');
    const c = await post(lec, '/api/topics', { roundId: S.round.id, title: 'Nháp của giảng viên' });
    expect(c.status, JSON.stringify(c.body)).toBe(201);
    const t = c.body.topic;
    expect(t).toMatchObject({ status: 'DRAFT', origin: 'LECTURER', requirements: '', recruitSlots: null, acceptedCount: 0, members: [], advisor: { id: U[lec].id }, applicationCounts: { pending: 0 } });
    expect(t.permissions).toMatchObject({ edit: true, checkSimilarity: true, invite: false });
    expect(t.availableActions).toEqual(['PUBLISH_RECRUITMENT']);
    expect(await prisma.topicMember.count({ where: { topicId: t.id } })).toBe(0);
    expect(await prisma.advising.findMany({ where: { topicId: t.id }, select: { lecturerId: true, endAt: true } })).toEqual([{ lecturerId: U[lec].id, endAt: null }]);
    expect(await prisma.auditLog.findFirst({ where: { action: 'TOPIC_CREATE', entityId: t.id } })).toMatchObject({ actorId: U[lec].id, after: expect.objectContaining({ origin: 'LECTURER' }) });

    const body = { version: 0, ...CONTENT(), fieldId: S.field.id, requirements: '  Biết React  ', recruitSlots: 2 };
    const u = await put(lec, `/api/topics/${t.id}`, body);
    expect(u.status, JSON.stringify(u.body)).toBe(200);
    expect(u.body.topic).toMatchObject({ version: 1, requirements: 'Biết React', recruitSlots: 2, title: body.title });
    // bỏ trống = giữ nguyên
    const u2 = await put(lec, `/api/topics/${t.id}`, { ...body, version: 1, requirements: undefined, recruitSlots: undefined });
    expect(u2.body.topic).toMatchObject({ version: 2, requirements: 'Biết React', recruitSlots: 2 });
    expect((await post(lec, `/api/topics/${t.id}/similarity-checks`)).status).toBe(200); // "Kiểm tra trước" mở cho GV (§3.2)

    const p = await publish(lec, t, { version: 2 });
    expect(p.status, JSON.stringify(p.body)).toBe(200);
    expect(p.body.topic).toMatchObject({ status: 'RECRUITING', version: 3, availableActions: ['UNPUBLISH_RECRUITMENT'] });
    expect(p.body.topic.permissions.edit).toBe(false);
    expect(p.body.similarityCheck.status).toBe('OK');
    expect(await prisma.statusHistory.findMany({ where: { topicId: t.id }, select: { from: true, to: true, action: true, actorId: true } }))
      .toEqual([{ from: 'DRAFT', to: 'RECRUITING', action: 'PUBLISH_RECRUITMENT', actorId: U[lec].id }]);
    expect(await prisma.submission.count({ where: { topicId: t.id } })).toBe(0); // không tạo snapshot
    expect(await prisma.auditLog.count({ where: { action: 'TOPIC_PUBLISH_RECRUITMENT', entityId: t.id } })).toBe(1);
    // RECRUITING: GV không sửa được nữa
    expect(code(await put(lec, `/api/topics/${t.id}`, { ...body, version: 3 }))).toBe('TOPIC_NOT_EDITABLE');
  });

  it('tạo: STAFF, ADMIN 403; GV đợt khoa khác 403; đợt đã đóng đăng ký 409', async () => {
    const lec = await mkUser('LECTURER');
    expect((await post('staff1', '/api/topics', { roundId: S.round.id })).status).toBe(403);
    expect((await post('admin', '/api/topics', { roundId: S.round.id })).status).toBe(403);
    const f2 = await mkRound(S.F2.id, 'Đợt khoa khác DC05');
    expect((await post(lec, '/api/topics', { roundId: f2.id })).status).toBe(403);
    const closed = await mkRound(S.F1.id, 'Đợt đã đóng DC05', {}, -30, -1);
    expect(code(await post(lec, '/api/topics', { roundId: closed.id }))).toBe('REGISTRATION_CLOSED');
  });

  it('sửa: GV khác 403; recruitSlots > maxMembers 400; #7 SV gửi requirements/recruitSlots trong PUT đề tài của mình → 400 tại trường', async () => {
    const [lec, other] = [await mkUser('LECTURER'), await mkUser('LECTURER')];
    const t = await mkLecTopic(lec);
    const body = { version: 0, ...CONTENT(), fieldId: S.field.id };
    expect((await put(other, `/api/topics/${t.id}`, body)).status).toBe(403);
    expect((await put('s1', `/api/topics/${t.id}`, body)).status).toBe(403);
    const big = await put(lec, `/api/topics/${t.id}`, { ...body, recruitSlots: 6 });
    expect([big.status, code(big), Object.keys(big.body.error.details)]).toEqual([400, 'VALIDATION_ERROR', ['recruitSlots']]);
    const sv = await mkUser('STUDENT');
    const mine = await mkTopic(sv);
    for (const extra of [{ requirements: 'Biết Java' }, { recruitSlots: 2 }]) {
      const r = await put(sv, `/api/topics/${mine.id}`, { ...body, ...extra });
      expect([r.status, code(r), Object.keys(r.body.error.details)]).toEqual([400, 'VALIDATION_ERROR', Object.keys(extra)]);
    }
    expect((await prisma.topic.findUnique({ where: { id: mine.id } })).version).toBe(0);
    const ok = await put(sv, `/api/topics/${mine.id}`, body);
    expect([ok.status, ok.body.topic.origin, ok.body.topic.applicationCounts]).toEqual([200, 'STUDENT', null]);
  });
});

describe('§3.3 công bố', () => {
  it('#2 thiếu recruitSlots / tóm tắt ngắn → 400 TOPIC_INCOMPLETE có khóa recruitSlots; không chạy FR06', async () => {
    const lec = await mkUser('LECTURER');
    const t = await mkLecTopic(lec, { recruitSlots: null, summary: 'ngắn' });
    const r = await publish(lec, t);
    expect([r.status, code(r)]).toEqual([400, 'TOPIC_INCOMPLETE']);
    expect(Object.keys(r.body.error.details).sort()).toEqual(['recruitSlots', 'summary']);
    expect(await prisma.similarityCheck.count({ where: { topicId: t.id } })).toBe(0);
    expect(await status(t)).toBe('DRAFT');
  });

  it('#3 FR06 HIGH không giải trình → 400 JUSTIFICATION_REQUIRED, có giải trình → 200 và lưu giải trình; FR06 lỗi → 409 SIMILARITY_NOT_CHECKED', async () => {
    const lec = await mkUser('LECTURER');
    const t = await mkLecTopic(lec);
    const sv = await mkUser('STUDENT');
    await mkTopic(sv, S.round, { status: 'IN_PROGRESS', title: t.title, summary: t.summary, objectives: t.objectives, keywords: t.keywords }); // trùng hẳn
    const r = await publish(lec, t);
    expect([r.status, code(r), r.body.error.details.similarityCheck.level]).toEqual([400, 'JUSTIFICATION_REQUIRED', 'HIGH']);
    expect(await status(t)).toBe('DRAFT');
    const ok = await publish(lec, t, { justification: longJustification });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    const last = await prisma.similarityCheck.findFirst({ where: { topicId: t.id }, orderBy: { createdAt: 'desc' } });
    expect([last.level, last.justification]).toEqual(['HIGH', longJustification]);

    const t2 = await mkLecTopic(lec);
    const e = await publish(lec, t2, {}, broken);
    expect([e.status, code(e), e.body.error.details.similarityCheck.status]).toEqual([409, 'SIMILARITY_NOT_CHECKED', 'ERROR']);
    expect(await status(t2)).toBe('DRAFT');
    expect((await prisma.similarityCheck.findFirst({ where: { topicId: t2.id } })).status).toBe('ERROR'); // lỗi vẫn được lưu
  });

  it('ngoài thời gian đăng ký 409 REGISTRATION_CLOSED; sai version 409 CONCURRENT_UPDATE; đã đủ hạn mức 409 LECTURER_QUOTA_EXCEEDED (DRAFT không tính)', async () => {
    const lec = await mkUser('LECTURER');
    const closed = await mkRound(S.F1.id, 'Đợt đóng DC05 công bố', {}, -30, -1);
    expect(code(await publish(lec, await mkLecTopic(lec, { round: closed })))).toBe('REGISTRATION_CLOSED');
    const round = await mkRound(S.F1.id, 'Đợt hạn mức DC05', { maxTopicsPerLecturer: 1 });
    const a = await mkLecTopic(lec, { round });
    expect(code(await publish(lec, a, { version: 5 }))).toBe('CONCURRENT_UPDATE');
    await mkLecTopic(lec, { round }); // nháp khác không chiếm hạn mức
    expect((await publish(lec, a)).status).toBe(200);
    const b = await mkLecTopic(lec, { round });
    const r = await publish(lec, b);
    expect([r.status, code(r)]).toEqual([409, 'LECTURER_QUOTA_EXCEEDED']);
    expect(await status(b)).toBe('DRAFT');
    expect(await prisma.statusHistory.count({ where: { topicId: b.id } })).toBe(0);
  });

  it.each([1, 2, 3])('#4 đồng thời (lượt %i): GV còn 1 suất công bố 2 đề tài cùng lúc → đúng một RECRUITING, bên kia 409 LECTURER_QUOTA_EXCEEDED', async () => {
    const lec = await mkUser('LECTURER');
    const round = await mkRound(S.F1.id, `Đợt đồng thời DC05 ${n}`, { maxTopicsPerLecturer: 1 });
    const [a, b] = [await mkLecTopic(lec, { round }), await mkLecTopic(lec, { round })];
    const rs = await Promise.all([publish(lec, a), publish(lec, b)]);
    expect(rs.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(code(rs.find((r) => r.status === 409))).toBe('LECTURER_QUOTA_EXCEEDED');
    expect(await prisma.topic.count({ where: { id: { in: [a.id, b.id] }, status: 'RECRUITING' } })).toBe(1);
  });

  it('#5 SV, GV khác, cán bộ, ADMIN gọi PUBLISH → 403; GV PUBLISH đề tài SV ở DRAFT → 409 INVALID_TRANSITION; trạng thái không đổi', async () => {
    const [lec, other, staff] = [await mkUser('LECTURER'), await mkUser('LECTURER'), await mkUser('STAFF')];
    const t = await mkLecTopic(lec);
    for (const who of ['s1', other, staff, 'admin']) expect((await publish(who, t)).status, who).toBe(403);
    expect(await status(t)).toBe('DRAFT');
    // Đề tài SV ở DRAFT có Advising của GV (không xảy ra qua luồng thật – phòng thủ nhiều lớp §0)
    const sv = await mkUser('STUDENT');
    const st = await mkTopic(sv, S.round, { advisings: { create: { lecturerId: U[lec].id } } });
    const r = await publish(lec, st);
    expect([r.status, code(r)]).toEqual([409, 'INVALID_TRANSITION']);
    expect(await status(st)).toBe('DRAFT');
    expect((await publish(lec, await mkTopic(sv))).status).toBe(403); // đề tài SV không có quan hệ
    // sai trạng thái: đang tuyển thì không công bố lại
    const rec = await mkLecTopic(lec, { status: 'RECRUITING' });
    expect(code(await publish(lec, rec))).toBe('INVALID_TRANSITION');
  });

  it.each([1, 2])('#9 đồng thời (lượt %i, m9 BM): PUBLISH ‖ ACCEPT_ADVISING của cùng GV còn 1 suất → đúng một thành công, bên kia 409 LECTURER_QUOTA_EXCEEDED', async () => {
    const lec = await mkUser('LECTURER');
    const round = await mkRound(S.F1.id, `Đợt m9a DC05 ${n}`, { maxTopicsPerLecturer: 1 });
    const a = await mkLecTopic(lec, { round });
    const sv = await mkUser('STUDENT');
    const w = await mkTopic(sv, round, { status: 'WAITING_ADVISOR', advisorRequests: { create: { lecturerId: U[lec].id } } });
    const rs = await Promise.all([publish(lec, a), act(lec, w, { action: 'ACCEPT_ADVISING' })]);
    expect(rs.map((r) => r.status).sort(), JSON.stringify(rs.map((r) => r.body.error))).toEqual([200, 409]);
    expect(code(rs.find((r) => r.status === 409))).toBe('LECTURER_QUOTA_EXCEEDED');
    expect(await prisma.advising.count({ where: { lecturerId: U[lec].id, endAt: null, topic: { status: { in: ['RECRUITING', 'HAS_ADVISOR'] } } } })).toBe(1);
  });

  it('#9 đồng thời (m9 BM): PUBLISH ‖ cán bộ duyệt thay GV (FR19) sang GV này → đúng một thành công, bên kia 409 LECTURER_QUOTA_EXCEEDED', async () => {
    const [lec, oldLec, staff] = [await mkUser('LECTURER'), await mkUser('LECTURER'), await mkUser('STAFF')];
    const round = await mkRound(S.F1.id, 'Đợt m9b DC05', { maxTopicsPerLecturer: 1 });
    const a = await mkLecTopic(lec, { round });
    const sv = await mkUser('STUDENT');
    const run = await mkTopic(sv, round, { status: 'IN_PROGRESS', advisings: { create: { lecturerId: U[oldLec].id } } });
    const c = await post(sv, `/api/topics/${run.id}/change-requests`, { type: 'ADVISOR_CHANGE', reason: 'GVHD đi công tác dài hạn', newLecturerId: U[lec].id });
    expect(c.status, JSON.stringify(c.body)).toBe(201);
    expect((await post(lec, `/api/change-requests/${c.body.changeRequest.id}/accept`)).status).toBe(200);
    const rs = await Promise.all([publish(lec, a), post(staff, `/api/change-requests/${c.body.changeRequest.id}/approve`, {})]);
    expect(rs.map((r) => r.status).sort(), JSON.stringify(rs.map((r) => r.body.error))).toEqual([200, 409]);
    expect(code(rs.find((r) => r.status === 409))).toBe('LECTURER_QUOTA_EXCEEDED');
    // nháp của GV (nếu PUBLISH thua) vẫn có Advising nhưng không tính hạn mức
    expect(await prisma.advising.count({ where: { lecturerId: U[lec].id, endAt: null, topic: { status: { not: 'DRAFT' } } } })).toBe(1);
  });

  it('#8 FR06 của hồ sơ SV khác cùng đợt so với đề tài RECRUITING: có trong top 5, dòng hidden: true với SV; cán bộ thấy mã', async () => {
    const lec = await mkUser('LECTURER');
    const rec = await mkLecTopic(lec, { status: 'RECRUITING' });
    const sv = await mkUser('STUDENT');
    const mine = await mkTopic(sv, S.round, { title: rec.title, summary: rec.summary, objectives: rec.objectives, keywords: rec.keywords });
    const r = await post(sv, `/api/topics/${mine.id}/similarity-checks`);
    expect(r.status).toBe(200);
    const m = r.body.similarityCheck.matches;
    expect(m.length).toBeLessThanOrEqual(5);
    const hit = m.find((x) => x.hidden && x.level === 'HIGH');
    expect(hit).toBeTruthy();
    expect(JSON.stringify(m)).not.toContain(rec.code);
    const row = await prisma.similarityCheck.findFirst({ where: { topicId: mine.id }, orderBy: { createdAt: 'desc' } });
    expect(row.matches.map((x) => x.topicId)).toContain(rec.id);
  });
});

describe('§3.4 ngừng tuyển', () => {
  it('#6 thiếu lý do → 400 REASON_REQUIRED; chưa có thành viên → 200, đơn chờ bị từ chối + thông báo, StatusHistory có lý do', async () => {
    const lec = await mkUser('LECTURER');
    const t = await mkLecTopic(lec, { status: 'RECRUITING' });
    for (const reason of [undefined, '   ', 'abc']) {
      const r = await act(lec, t, { action: 'UNPUBLISH_RECRUITMENT', reason });
      expect([r.status, code(r)]).toEqual([400, 'REASON_REQUIRED']);
    }
    const sv = await mkUser('STUDENT');
    const ap = await prisma.topicApplication.create({ data: { topicId: t.id, studentId: U[sv].id, coverLetter: 'Em rất quan tâm đề tài này ạ' } });
    const old = await prisma.topicApplication.create({ data: { topicId: t.id, studentId: U[sv].id, coverLetter: 'Đơn cũ đã rút trước đó', status: 'WITHDRAWN' } });
    // GV đang hướng dẫn thấy số đơn chờ; SV ứng viên không xem được chi tiết đề tài (§1.1 isApplicant)
    expect((await get(lec, `/api/topics/${t.id}`)).body.topic.applicationCounts).toEqual({ pending: 1 });
    expect((await get(sv, `/api/topics/${t.id}`)).status).toBe(403);
    const r = await act(lec, t, { action: 'UNPUBLISH_RECRUITMENT', reason: REASON });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.topic).toMatchObject({ status: 'DRAFT', version: 1, applicationCounts: { pending: 0 }, availableActions: ['PUBLISH_RECRUITMENT'] });
    expect(await prisma.topicApplication.findUnique({ where: { id: ap.id } })).toMatchObject({ status: 'DECLINED', reason: UNPUBLISH_DECLINE_REASON, decidedById: U[lec].id, respondedAt: expect.any(Date) });
    expect((await prisma.topicApplication.findUnique({ where: { id: old.id } })).status).toBe('WITHDRAWN');
    expect(await prisma.notification.findMany({ where: { userId: U[sv].id }, select: { type: true, dedupeKey: true } })).toEqual([{ type: 'APPLICATION_DECLINED', dedupeKey: `APPLICATION_DECLINED:${ap.id}` }]);
    expect(await prisma.statusHistory.findMany({ where: { topicId: t.id }, select: { from: true, to: true, action: true, reason: true } }))
      .toEqual([{ from: 'RECRUITING', to: 'DRAFT', action: 'UNPUBLISH_RECRUITMENT', reason: REASON }]);
    expect(await prisma.auditLog.findFirst({ where: { action: 'TOPIC_UNPUBLISH_RECRUITMENT', entityId: t.id } })).toMatchObject({ after: expect.objectContaining({ removedMembers: 0, declinedApplications: 1 }) });
    // Sửa rồi công bố lại được như đề tài mới
    expect((await put(lec, `/api/topics/${t.id}`, { version: 1, title: t.title, summary: t.summary, objectives: t.objectives, keywords: t.keywords, fieldId: t.fieldId })).status).toBe(200);
    expect((await publish(lec, t, { version: 2 })).status).toBe(200);
  });

  it('#6 có 1 thành viên, minMembers = 2: 200, thành viên có leftAt + AuditLog MEMBER_REMOVE + thông báo; SV đó vào đề tài khác được (suất giải phóng); GET đề tài 403', async () => {
    const lec = await mkUser('LECTURER');
    const round = await mkRound(S.F1.id, 'Đợt min 2 DC05', { minMembers: 2 });
    const t = await mkLecTopic(lec, { round, status: 'RECRUITING' });
    const sv = await mkUser('STUDENT');
    await prisma.topicMember.create({ data: { topicId: t.id, userId: U[sv].id, role: 'LEADER' } });
    expect((await get(sv, `/api/topics/${t.id}`)).body.topic).toMatchObject({ acceptedCount: 1, applicationCounts: null });
    // Đề tài khác mời SV: đang ở đề tài RECRUITING (hoạt động) nên chưa nhận được
    const leader2 = await mkUser('STUDENT');
    const other = await mkTopic(leader2, round);
    const inv = await mkInvite(other, sv);
    expect(code(await post(sv, `/api/invitations/${inv.id}/accept`))).toBe('STUDENT_TOPIC_LIMIT');
    // Thành viên, cán bộ không ngừng tuyển được
    for (const who of [sv, 'staff1']) expect((await act(who, t, { action: 'UNPUBLISH_RECRUITMENT', reason: REASON })).status, who).toBe(403);

    const r = await act(lec, t, { action: 'UNPUBLISH_RECRUITMENT', reason: REASON });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.topic).toMatchObject({ status: 'DRAFT', members: [], acceptedCount: 0 });
    expect(await live(t)).toEqual([]);
    const m = await prisma.topicMember.findFirst({ where: { topicId: t.id, userId: U[sv].id } });
    expect(m.leftAt).toBeInstanceOf(Date);
    expect(await prisma.auditLog.findFirst({ where: { action: 'MEMBER_REMOVE', entityId: m.id } })).toMatchObject({ actorId: U[lec].id, after: { reason: REASON, leftAt: m.leftAt.toISOString() } });
    expect(await prisma.notification.count({ where: { userId: U[sv].id, type: 'RECRUITMENT_CANCELLED' } })).toBe(1);
    expect((await get(sv, `/api/topics/${t.id}`)).status).toBe(403);
    const acc = await post(sv, `/api/invitations/${inv.id}/accept`);
    expect(acc.status, JSON.stringify(acc.body)).toBe(200);
    expect(await prisma.topicMember.count({ where: { topicId: other.id, userId: U[sv].id, leftAt: null } })).toBe(1);
  });

  it('sai trạng thái: ngừng tuyển đề tài DRAFT → 409 INVALID_TRANSITION; sai version → 409', async () => {
    const lec = await mkUser('LECTURER');
    expect(code(await act(lec, await mkLecTopic(lec), { action: 'UNPUBLISH_RECRUITMENT', reason: REASON }))).toBe('INVALID_TRANSITION');
    expect(code(await act(lec, await mkLecTopic(lec, { status: 'RECRUITING' }), { action: 'UNPUBLISH_RECRUITMENT', reason: REASON, version: 3 }))).toBe('CONCURRENT_UPDATE');
  });
});

describe('§4.2 bảng tin GET /api/recruitments(/:topicId)', () => {
  let lec, rec, draft, f2Rec, lecF2;
  beforeAll(async () => {
    lec = await mkUser('LECTURER');
    rec = await mkLecTopic(lec, { status: 'RECRUITING', title: 'Bảng tin: hệ thống gợi ý môn học', keywords: ['gợi ý'], summary: 'x '.repeat(400).trim() });
    draft = await mkLecTopic(lec);
    lecF2 = await mkUser('LECTURER', { facultyId: S.F2.id });
    const roundF2 = await mkRound(S.F2.id, 'Đợt khoa 2 DC05');
    f2Rec = await mkLecTopic(lecF2, { round: roundF2, status: 'RECRUITING' });
    await addMember(rec, 's1');
  });

  it('SV cùng khoa thấy đề tài đang tuyển, không thấy nháp/khoa khác; không có tên ứng viên, thành viên, số đơn; myApplication của chính SV', async () => {
    const sv = await mkUser('STUDENT');
    const other = await mkUser('STUDENT');
    await prisma.topicApplication.create({ data: { topicId: rec.id, studentId: U[other].id, coverLetter: 'Đơn của người khác, không được lộ' } });
    const ap = await prisma.topicApplication.create({ data: { topicId: rec.id, studentId: U[sv].id, coverLetter: 'Đơn của em đang chờ duyệt ạ' } });
    const r = await get(sv, '/api/recruitments?pageSize=100');
    expect(r.status).toBe(200);
    const ids = r.body.items.map((i) => i.topicId);
    expect(ids).toContain(rec.id);
    expect(ids).not.toContain(draft.id);
    expect(ids).not.toContain(f2Rec.id);
    const item = r.body.items.find((i) => i.topicId === rec.id);
    expect(Object.keys(item).sort()).toEqual(['acceptedCount', 'code', 'field', 'lecturer', 'myApplication', 'recruitSlots', 'round', 'summaryExcerpt', 'title', 'topicId']);
    expect(item).toMatchObject({ acceptedCount: 1, recruitSlots: 3, lecturer: { id: U[lec].id }, myApplication: { id: ap.id, status: 'PENDING' }, round: { id: S.round.id, registrationOpen: true } });
    expect(item.summaryExcerpt.length).toBe(300);
    expect(JSON.stringify(r.body)).not.toContain(U[other].id);
    expect(JSON.stringify(r.body)).not.toContain(U.s1.id);
    // Chi tiết
    const d = await get(sv, `/api/recruitments/${rec.id}`);
    expect(d.status).toBe(200);
    expect(d.body.recruitment).toMatchObject({ topicId: rec.id, requirements: 'Biết Python', keywords: ['gợi ý'], objectives: rec.objectives, myApplication: { id: ap.id } });
    expect(JSON.stringify(d.body)).not.toContain(U.s1.id);
    // Không RECRUITING / khác khoa / không tồn tại → 404
    for (const id of [draft.id, f2Rec.id, 'khong-ton-tai']) expect((await get(sv, `/api/recruitments/${id}`)).status, id).toBe(404);
  });

  it('GV, cán bộ trong phạm vi xem được (myApplication null); cán bộ khoa khác không thấy; ADMIN 403; lọc q, lecturerId, roundId', async () => {
    const g = await get(lec, '/api/recruitments?pageSize=100');
    expect(g.body.items.find((i) => i.topicId === rec.id).myApplication).toBeNull();
    expect((await get('staff1', `/api/recruitments/${rec.id}`)).status).toBe(200);
    expect((await get('staff2', `/api/recruitments/${rec.id}`)).status).toBe(404);
    expect((await get('staff2', '/api/recruitments')).body.items.map((i) => i.topicId)).toEqual([f2Rec.id]);
    expect((await get(lecF2, '/api/recruitments')).body.items.map((i) => i.topicId)).toEqual([f2Rec.id]);
    expect((await get('admin', '/api/recruitments')).status).toBe(403);
    expect((await get('admin', `/api/recruitments/${rec.id}`)).status).toBe(403);
    expect((await get('s2', '/api/recruitments?q=gợi ý')).body.items.map((i) => i.topicId)).toEqual([rec.id]);
    expect((await get('s2', `/api/recruitments?lecturerId=${U[lec].id}`)).body.items.map((i) => i.topicId)).toEqual([rec.id]);
    expect((await get('s2', `/api/recruitments?roundId=${S.round.id}&q=khong-co-ten-nay`)).body).toMatchObject({ items: [], total: 0, page: 1, pageSize: 20 });
    expect((await get('s2', `/api/recruitments?q=${'a'.repeat(201)}`)).status).toBe(400);
  });
});

describe('MINOR DC-01', () => {
  it('m1: action nội bộ/chưa có endpoint gọi qua /actions → 400 UNKNOWN_ACTION ở handler', async () => {
    const lec = await mkUser('LECTURER');
    const staff = await mkUser('STAFF');
    const t = await mkLecTopic(lec, { status: 'RECRUITING' });
    for (const [who, body] of [[staff, { action: 'CANCEL', reason: REASON }], [lec, { action: 'COUNCIL_FINALIZE' }], [lec, { action: 'FINALIZE_GROUP' }], [lec, { action: 'REQUEST_DEFENSE' }]]) {
      const r = await act(who, t, body);
      expect([r.status, code(r)], body.action).toEqual([400, 'UNKNOWN_ACTION']);
    }
    expect(await status(t)).toBe('RECRUITING');
    expect(code(await act(lec, t, { action: 'KHONG_CO' }))).toBe('VALIDATION_ERROR'); // chuỗi lạ vẫn do schema chặn
  });

  it('m2: G45 – PATCH đợt làm đề tài RECRUITING không còn đủ trường → 409 ROUND_CONFIG_BLOCKS_TOPICS', async () => {
    const lec = await mkUser('LECTURER');
    const round = await mkRound(S.F1.id, 'Đợt G45 DC05');
    const rec = await mkLecTopic(lec, { round, status: 'RECRUITING' }); // tóm tắt 8 từ, 1 từ khóa
    await mkLecTopic(lec, { round }); // nháp: GV sửa được, không chặn
    const r = await request(app).patch(`/api/rounds/${round.id}`).set(as('staff1')).send({ config: { minSummaryWords: 20, minKeywords: 1 } });
    expect([r.status, code(r), r.body.error?.details.codes]).toEqual([409, 'ROUND_CONFIG_BLOCKS_TOPICS', [rec.code]]);
  });
});
