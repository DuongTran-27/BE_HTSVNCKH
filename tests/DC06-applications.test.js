// TASK-DC-06 (FR32, FR33, FR03 – API_GD7 §4, G51, Vòng sửa 1 M3, m9): ứng tuyển, rút, duyệt/từ chối đơn, chốt nhóm.
// Test bắt buộc GD7 §4.6 #1–#11 + MINOR m2 của DC-05. DB test thật (trừ khối unit đầu).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { prisma, app, S, U, tok, seedBase, mkTopic, mkRound, CONTENT } from './t214-kit.js';
import { createApp } from '../src/app.js';
import { createAuthRepo } from '../src/modules/auth/prismaRepo.js';
import { createTopicRepo } from '../src/modules/topics/prismaRepo.js';
import { createRoundRepo } from '../src/modules/rounds/prismaRepo.js';
import { presentApplication } from '../src/modules/topics/applicationService.js';
import { FINALIZE_DECLINE_REASON } from '../src/modules/topics/recruitmentService.js';
import { signAccessToken } from '../src/lib/tokens.js';
import { fakeHasher, testEnv } from './helpers.js';

const as = (who) => ({ Authorization: `Bearer ${tok[who]}` });
const post = (who, url, body = {}, a = app) => request(a).post(url).set(as(who)).send(body);
const get = (who, url) => request(app).get(url).set(as(who));
const code = (r) => r.body.error?.code;
const LETTER = 'Em đã học Python và muốn tham gia đề tài này.';
const REASON = 'Chưa phù hợp yêu cầu của đề tài';
const apply = (sv, t, a = app) => post(sv, `/api/recruitments/${t.id}/applications`, { coverLetter: LETTER }, a);
const accept = (lec, id) => post(lec, `/api/applications/${id}/accept`);
const decline = (lec, id, reason = REASON) => post(lec, `/api/applications/${id}/decline`, { reason });
const withdraw = (sv, id) => post(sv, `/api/applications/${id}/withdraw`);
const act = (who, t, body) => post(who, `/api/topics/${t.id}/actions`, body);
const version = async (t) => (await prisma.topic.findUnique({ where: { id: t.id } })).version;
const finalize = async (lec, t, v) => act(lec, t, { action: 'FINALIZE_GROUP', version: v ?? (await version(t)) });
const unpublish = async (lec, t, v) => act(lec, t, { action: 'UNPUBLISH_RECRUITMENT', reason: 'Không đủ sinh viên phù hợp', version: v ?? (await version(t)) });
const topicOf = (t) => prisma.topic.findUnique({ where: { id: t.id } });
const live = (t) => prisma.topicMember.findMany({ where: { topicId: t.id, leftAt: null }, orderBy: { joinedAt: 'asc' } });
const appRow = (id) => prisma.topicApplication.findUnique({ where: { id } });
const notes = (who, type) => prisma.notification.findMany({ where: { userId: U[who].id, type } });

let n = 0;
const mkUser = async (role, extra = {}) => {
  const key = `${role.toLowerCase()}-dc06-${++n}`;
  U[key] = await prisma.user.create({ data: { code: key, email: `${key}@t.vn`, fullName: `Tên ${key}`, passwordHash: 'x', role, mustChangePassword: false, facultyId: S.F1.id, ...extra } });
  tok[key] = signAccessToken(U[key], { secret: testEnv.JWT_ACCESS_SECRET, ttlSeconds: 600 });
  if (role === 'STAFF') await prisma.staffScope.create({ data: { userId: U[key].id, facultyId: extra.facultyId ?? S.F1.id } });
  return key;
};
const mkUsers = (role, k) => Promise.all(Array.from({ length: k }, () => mkUser(role)));
let seq = 0;
const mkLecTopic = (lec, { round = S.round, status = 'RECRUITING', recruitSlots = 3 } = {}) => prisma.topic.create({
  data: {
    code: `DC06-${Date.now().toString(36)}-${++seq}`, ...CONTENT(), fieldId: S.field.id, roundId: round.id, facultyId: round.facultyId,
    status, origin: 'LECTURER', requirements: 'Biết Python', recruitSlots, advisings: { create: { lecturerId: U[lec].id } },
  },
});
// Đơn dựng thẳng DB (nhanh) – luồng HTTP của ứng tuyển có test riêng
const mkApp = (t, sv) => prisma.topicApplication.create({ data: { topicId: t.id, studentId: U[sv].id, coverLetter: LETTER } });
const mkMember = (t, sv, role = 'LEADER') => prisma.topicMember.create({ data: { topicId: t.id, userId: U[sv].id, role } });
const settle = (ps) => Promise.all(ps);

beforeAll(() => seedBase({ students: 1 }), 60000);
afterAll(() => prisma.$disconnect());

describe('presentApplication (§4.1) – không cần DB', () => {
  const a = {
    id: 'a1', status: 'PENDING', coverLetter: 'x', reason: null, createdAt: new Date(0), respondedAt: null, studentId: 's1', topicId: 't1',
    topic: { id: 't1', code: 'C', title: 'T', status: 'RECRUITING', advisings: [{ lecturerId: 'l1' }] },
    student: { id: 's1', code: 'SV1', fullName: 'A', class: { code: 'K1' }, email: 'lo@x.vn' },
  };
  it('GVHD hiện hành: ACCEPT, DECLINE; chính SV: WITHDRAW; người khác/không PENDING/không RECRUITING: không có; không lộ email', () => {
    expect(presentApplication(a, { id: 'l1', role: 'LECTURER' }).availableActions).toEqual(['ACCEPT', 'DECLINE']);
    expect(presentApplication(a, { id: 'l2', role: 'LECTURER' }).availableActions).toEqual([]);
    expect(presentApplication(a, { id: 's1', role: 'STUDENT' }).availableActions).toEqual(['WITHDRAW']);
    expect(presentApplication(a, { id: 'st', role: 'STAFF' }).availableActions).toEqual([]);
    expect(presentApplication({ ...a, status: 'ACCEPTED' }, { id: 's1', role: 'STUDENT' }).availableActions).toEqual([]);
    expect(presentApplication({ ...a, topic: { ...a.topic, status: 'HAS_ADVISOR' } }, { id: 'l1', role: 'LECTURER' }).availableActions).toEqual([]);
    const v = presentApplication(a, { id: 'l1', role: 'LECTURER' });
    expect(v.student).toEqual({ id: 's1', code: 'SV1', fullName: 'A', classCode: 'K1' });
  });
});

describe('§4.6 #1 luồng đủ', () => {
  it('2 SV ứng tuyển → GV duyệt cả 2 → chốt (đơn thứ 3 bị từ chối) → trưởng nhóm gửi xét duyệt → cán bộ duyệt; StatusHistory đủ', async () => {
    const lec = await mkUser('LECTURER');
    const [a, b, c] = await mkUsers('STUDENT', 3);
    const round = await mkRound(S.F1.id, 'Đợt DC06 luồng đủ', { minMembers: 2 });
    const t = await mkLecTopic(lec, { round, recruitSlots: 3 });

    const ra = await apply(a, t);
    expect(ra.status, JSON.stringify(ra.body)).toBe(201);
    expect(ra.body.application).toMatchObject({ status: 'PENDING', coverLetter: LETTER, topic: { id: t.id, status: 'RECRUITING', advisor: { fullName: U[lec].fullName } }, student: { code: a }, availableActions: ['WITHDRAW'] });
    const rb = await apply(b, t);
    const rc = await apply(c, t);
    expect([rb.status, rc.status]).toEqual([201, 201]);
    expect(await notes(lec, 'APPLICATION_RECEIVED')).toHaveLength(3);
    const log = await prisma.auditLog.findFirst({ where: { action: 'APPLICATION_CREATE', entityId: ra.body.application.id } });
    expect(log.after).toEqual({ topicId: t.id, coverLetterLength: LETTER.length }); // không ghi nội dung lời giới thiệu

    const box = await get(lec, `/api/topics/${t.id}/applications`);
    expect(box.status).toBe(200);
    expect(box.body.items.map((x) => [x.student.code, x.availableActions])).toEqual([[a, ['ACCEPT', 'DECLINE']], [b, ['ACCEPT', 'DECLINE']], [c, ['ACCEPT', 'DECLINE']]]);
    // chốt khi mới 0 thành viên (min 2) → GROUP_TOO_SMALL (#9 cũng có ca riêng)
    expect(code(await finalize(lec, t))).toBe('GROUP_TOO_SMALL');

    const x1 = await accept(lec, ra.body.application.id);
    expect(x1.status, JSON.stringify(x1.body)).toBe(200);
    expect(x1.body.application).toMatchObject({ status: 'ACCEPTED', availableActions: [] });
    expect(x1.body.topic).toMatchObject({ status: 'RECRUITING', acceptedCount: 1, members: [{ code: a, role: 'LEADER' }] });
    const x2 = await accept(lec, rb.body.application.id);
    expect(x2.body.topic.members.map((m) => [m.code, m.role])).toEqual([[a, 'LEADER'], [b, 'MEMBER']]);
    expect(await notes(a, 'APPLICATION_ACCEPTED')).toHaveLength(1);
    expect(await prisma.auditLog.count({ where: { action: 'MEMBER_JOIN', after: { path: ['topicId'], equals: t.id } } })).toBe(2);
    expect(await prisma.auditLog.count({ where: { action: 'APPLICATION_ACCEPT', entityId: { in: [ra.body.application.id, rb.body.application.id] } } })).toBe(2);
    // thành viên xem được đề tài; ứng viên chưa nhận vẫn 403 (#7)
    expect((await get(a, `/api/topics/${t.id}`)).status).toBe(200);
    expect((await get(c, `/api/topics/${t.id}`)).status).toBe(403);

    const f = await finalize(lec, t, x2.body.topic.version);
    expect(f.status, JSON.stringify(f.body)).toBe(200);
    expect(f.body.topic).toMatchObject({ status: 'HAS_ADVISOR', advisor: { id: U[lec].id } });
    expect(await appRow(rc.body.application.id)).toMatchObject({ status: 'DECLINED', reason: FINALIZE_DECLINE_REASON, decidedById: U[lec].id });
    expect(await notes(c, 'APPLICATION_DECLINED')).toHaveLength(1);
    expect((await notes(a, 'GROUP_FINALIZED')).length + (await notes(b, 'GROUP_FINALIZED')).length).toBe(2);
    expect(await prisma.auditLog.count({ where: { action: 'TOPIC_FINALIZE_GROUP', entityId: t.id } })).toBe(1);

    // Luồng cũ: trưởng nhóm gửi xét duyệt (FR05, FR06, FR17) → cán bộ duyệt
    expect((await act(b, t, { action: 'SUBMIT_FOR_REVIEW', version: f.body.topic.version })).status).toBe(403); // không phải trưởng nhóm
    const s = await act(a, t, { action: 'SUBMIT_FOR_REVIEW', version: f.body.topic.version });
    expect(s.status, JSON.stringify(s.body)).toBe(200);
    expect(s.body.topic.status).toBe('UNDER_REVIEW');
    const ap = await act('staff1', t, { action: 'APPROVE', submissionId: s.body.submission.id, version: s.body.topic.version });
    expect(ap.status, JSON.stringify(ap.body)).toBe(200);
    expect(ap.body.topic.status).toBe('IN_PROGRESS');
    const h = await prisma.statusHistory.findMany({ where: { topicId: t.id }, orderBy: { at: 'asc' }, select: { from: true, to: true, action: true } });
    expect(h.map((x) => `${x.from}>${x.to}:${x.action}`)).toEqual(['RECRUITING>HAS_ADVISOR:FINALIZE_GROUP', 'HAS_ADVISOR>UNDER_REVIEW:SUBMIT_FOR_REVIEW', 'UNDER_REVIEW>IN_PROGRESS:APPROVE']);
  });
});

describe('§4.3 ứng tuyển, rút đơn', () => {
  it('#6 ứng tuyển 2 lần 409 APPLICATION_EXISTS; ngoài hạn 409 REGISTRATION_CLOSED; SV khoa khác 404; đề tài không RECRUITING 404; lời giới thiệu ngắn 400; rút rồi ứng tuyển lại 201', async () => {
    const lec = await mkUser('LECTURER');
    const sv = await mkUser('STUDENT');
    const t = await mkLecTopic(lec);
    const first = await apply(sv, t);
    expect(first.status).toBe(201);
    expect([(await apply(sv, t)).status, code(await apply(sv, t))]).toEqual([409, 'APPLICATION_EXISTS']);
    const closed = await mkRound(S.F1.id, 'Đợt DC06 đã đóng', {}, -30, -1);
    expect(code(await apply(sv, await mkLecTopic(lec, { round: closed })))).toBe('REGISTRATION_CLOSED');
    expect((await apply('sF2', t)).status).toBe(404);
    expect((await apply(sv, await mkLecTopic(lec, { status: 'DRAFT' }))).status).toBe(404);
    const short = await post(sv, `/api/recruitments/${t.id}/applications`, { coverLetter: 'ngắn quá' });
    expect([short.status, Object.keys(short.body.error.details)]).toEqual([400, ['coverLetter']]);
    expect((await post(sv, `/api/recruitments/${t.id}/applications`, { coverLetter: LETTER, extra: 1 })).status).toBe(400);
    // rút → WITHDRAWN + AuditLog; rút lần 2 409; ứng tuyển lại được (index chỉ chặn PENDING)
    const w = await withdraw(sv, first.body.application.id);
    expect([w.status, w.body.application.status, w.body.application.availableActions]).toEqual([200, 'WITHDRAWN', []]);
    expect(code(await withdraw(sv, first.body.application.id))).toBe('APPLICATION_CLOSED');
    expect(await prisma.auditLog.count({ where: { action: 'APPLICATION_WITHDRAW', entityId: first.body.application.id } })).toBe(1);
    expect((await apply(sv, t)).status).toBe(201);
    expect(await prisma.topicApplication.count({ where: { topicId: t.id, studentId: U[sv].id } })).toBe(2);
  });

  it('SV đã đủ đề tài hoạt động trong đợt → 409 STUDENT_TOPIC_LIMIT; đã là thành viên → 409 ALREADY_MEMBER; nhóm nháp (không hoạt động) không chặn', async () => {
    const lec = await mkUser('LECTURER');
    const [busy, inDraft, member] = await mkUsers('STUDENT', 3);
    await mkTopic(busy, S.round, { status: 'IN_PROGRESS' });
    await mkTopic(inDraft);
    const t = await mkLecTopic(lec);
    await mkMember(t, member);
    expect(code(await apply(busy, t))).toBe('STUDENT_TOPIC_LIMIT');
    expect(code(await apply(member, t))).toBe('ALREADY_MEMBER');
    expect((await apply(inDraft, t)).status).toBe(201);
  });

  it('#10 (M3 BM) kiểm lại RECRUITING dưới khóa: đề tài chốt nhóm ngay sau bước kiểm sớm → 409 NOT_RECRUITING, không có đơn PENDING mồ côi', async () => {
    const lec = await mkUser('LECTURER');
    const [leader, sv] = await mkUsers('STUDENT', 2);
    const t = await mkLecTopic(lec);
    await mkMember(t, leader);
    // Chen FINALIZE_GROUP giữa bước kiểm sớm (đọc bảng tin) và transaction ứng tuyển
    const base = createTopicRepo(prisma);
    let hook = null;
    const racing = createApp({ env: testEnv, logger: undefined, authRepo: createAuthRepo(prisma), hasher: fakeHasher, roundRepo: createRoundRepo(prisma),
      topicRepo: { ...base, findRecruitment: async (...a) => { const r = await base.findRecruitment(...a); if (hook) { const h = hook; hook = null; await h(); } return r; } } });
    hook = async () => expect((await finalize(lec, t)).status).toBe(200);
    const r = await apply(sv, t, racing);
    expect([r.status, code(r)]).toEqual([409, 'NOT_RECRUITING']);
    expect((await topicOf(t)).status).toBe('HAS_ADVISOR');
    expect(await prisma.topicApplication.count({ where: { topicId: t.id } })).toBe(0);
    // tương tự với ngừng tuyển
    const t2 = await mkLecTopic(lec);
    hook = async () => expect((await unpublish(lec, t2)).status).toBe(200);
    expect(code(await apply(sv, t2, racing))).toBe('NOT_RECRUITING');
    expect(await prisma.topicApplication.count({ where: { topicId: t2.id } })).toBe(0);
  });

  it('#10 đồng thời: ứng tuyển ‖ FINALIZE_GROUP, ứng tuyển ‖ UNPUBLISH (3 lượt mỗi kiểu) → không còn đơn PENDING trên đề tài ≠ RECRUITING', async () => {
    const lec = await mkUser('LECTURER');
    for (const kind of ['FINALIZE', 'UNPUBLISH']) {
      for (let i = 0; i < 3; i++) {
        const [leader, sv] = await mkUsers('STUDENT', 2);
        const t = await mkLecTopic(lec);
        await mkMember(t, leader);
        const v = await version(t);
        const [ra, rf] = await settle([apply(sv, t), kind === 'FINALIZE' ? finalize(lec, t, v) : unpublish(lec, t, v)]);
        expect(rf.status, JSON.stringify(rf.body)).toBe(200); // ứng tuyển không đổi version → chốt/ngừng luôn thắng
        expect([201, 409, 404], JSON.stringify(ra.body)).toContain(ra.status); // 404: chốt xong trước bước kiểm sớm
        if (ra.status === 409) expect(code(ra)).toBe('NOT_RECRUITING');
        expect((await topicOf(t)).status).not.toBe('RECRUITING');
        expect(await prisma.topicApplication.count({ where: { topicId: t.id, status: 'PENDING' } }), `${kind} lượt ${i}`).toBe(0);
      }
    }
  });
});

describe('§4.4 duyệt, từ chối', () => {
  it('#2 đồng thời: còn 1 chỗ, GV duyệt 2 đơn cùng lúc (3 lượt) → đúng 1 ACCEPTED, bên kia 409 GROUP_FULL; số thành viên = recruitSlots', async () => {
    const lec = await mkUser('LECTURER');
    for (let i = 0; i < 3; i++) {
      const [leader, a, b] = await mkUsers('STUDENT', 3);
      const t = await mkLecTopic(lec, { recruitSlots: 2 });
      await mkMember(t, leader);
      const [pa, pb] = [await mkApp(t, a), await mkApp(t, b)];
      const rs = await settle([accept(lec, pa.id), accept(lec, pb.id)]);
      expect(rs.map((r) => r.status).sort(), JSON.stringify(rs.map((r) => r.body))).toEqual([200, 409]);
      expect(code(rs.find((r) => r.status === 409))).toBe('GROUP_FULL');
      expect(await live(t)).toHaveLength(2);
      expect(await prisma.topicApplication.count({ where: { topicId: t.id, status: 'ACCEPTED' } })).toBe(1);
    }
  });

  it('m2 (BM DC-05): cán bộ hạ maxMembers dưới recruitSlots → chỉ tiêu = min(recruitSlots, maxMembers), thông điệp nêu số thật', async () => {
    const lec = await mkUser('LECTURER');
    const [a, b, c] = await mkUsers('STUDENT', 3);
    const round = await mkRound(S.F1.id, 'Đợt DC06 max 2', { maxMembers: 2 });
    const t = await mkLecTopic(lec, { round, recruitSlots: 3 });
    const ids = [(await mkApp(t, a)).id, (await mkApp(t, b)).id, (await mkApp(t, c)).id];
    expect((await accept(lec, ids[0])).status).toBe(200);
    expect((await accept(lec, ids[1])).status).toBe(200);
    const r = await accept(lec, ids[2]);
    expect([r.status, code(r), r.body.error.message]).toEqual([409, 'GROUP_FULL', 'Nhóm đã đạt số lượng tối đa (2)']);
    expect(await live(t)).toHaveLength(2);
  });

  it('#3 đồng thời: 2 GV duyệt cùng 1 SV ở 2 đề tài, giới hạn 1 (3 lượt) → đúng 1 thành công, bên kia 409 STUDENT_TOPIC_LIMIT', async () => {
    const [l1, l2] = await mkUsers('LECTURER', 2);
    for (let i = 0; i < 3; i++) {
      const sv = await mkUser('STUDENT');
      const [t1, t2] = [await mkLecTopic(l1), await mkLecTopic(l2)];
      const [p1, p2] = [await mkApp(t1, sv), await mkApp(t2, sv)];
      const rs = await settle([accept(l1, p1.id), accept(l2, p2.id)]);
      expect(rs.map((r) => r.status).sort(), JSON.stringify(rs.map((r) => r.body))).toEqual([200, 409]);
      expect(code(rs.find((r) => r.status === 409))).toBe('STUDENT_TOPIC_LIMIT');
      expect(await prisma.topicMember.count({ where: { userId: U[sv].id, leftAt: null } })).toBe(1);
      // G51: đơn còn lại đã tự rút
      expect((await prisma.topicApplication.findMany({ where: { studentId: U[sv].id } })).map((x) => x.status).sort()).toEqual(['ACCEPTED', 'WITHDRAWN']);
    }
  });

  it('G51: được nhận và chạm giới hạn → đơn chờ khác cùng đợt tự rút + báo GVHD đề tài đó; đơn ở đợt khác giữ nguyên; giới hạn 2 thì chưa rút', async () => {
    const [l1, l2] = await mkUsers('LECTURER', 2);
    const sv = await mkUser('STUDENT');
    const other = await mkRound(S.F1.id, 'Đợt DC06 khác');
    const [t1, t2, t3] = [await mkLecTopic(l1), await mkLecTopic(l2), await mkLecTopic(l2, { round: other })];
    const [p1, p2, p3] = [await mkApp(t1, sv), await mkApp(t2, sv), await mkApp(t3, sv)];
    expect((await accept(l1, p1.id)).status).toBe(200);
    expect(await appRow(p2.id)).toMatchObject({ status: 'WITHDRAWN' });
    expect((await appRow(p2.id)).respondedAt).not.toBeNull();
    expect(await appRow(p3.id)).toMatchObject({ status: 'PENDING' });
    expect((await notes(l2, 'APPLICATION_WITHDRAWN')).map((x) => x.dedupeKey)).toEqual([`APPLICATION_WITHDRAWN:${p2.id}`]);
    expect(await prisma.auditLog.findFirst({ where: { action: 'APPLICATION_WITHDRAW', entityId: p2.id } })).toMatchObject({ actorId: U[l1].id, after: expect.objectContaining({ auto: true }) });
    // giới hạn kiểm trước trạng thái đơn (§4.4 bước 3 trước 4) – cùng mã bên thua của #3; từ chối đơn đã rút → APPLICATION_CLOSED
    expect(code(await accept(l2, p2.id))).toBe('STUDENT_TOPIC_LIMIT');
    expect(code(await decline(l2, p2.id))).toBe('APPLICATION_CLOSED');

    const wide = await mkRound(S.F1.id, 'Đợt DC06 giới hạn 2', { maxActiveTopicsPerStudent: 2 });
    const sv2 = await mkUser('STUDENT');
    const [w1, w2] = [await mkLecTopic(l1, { round: wide }), await mkLecTopic(l2, { round: wide })];
    const [q1, q2] = [await mkApp(w1, sv2), await mkApp(w2, sv2)];
    expect((await accept(l1, q1.id)).status).toBe(200);
    expect(await appRow(q2.id)).toMatchObject({ status: 'PENDING' });
    expect((await accept(l2, q2.id)).status).toBe(200); // SV ở 2 đề tài đúng giới hạn
  });

  it('#4 SV rút ‖ GV duyệt cùng đơn (4 lượt) → một bên thắng, bên kia 409 APPLICATION_CLOSED; rút thắng thì không có TopicMember', async () => {
    const lec = await mkUser('LECTURER');
    for (let i = 0; i < 4; i++) {
      const sv = await mkUser('STUDENT');
      const t = await mkLecTopic(lec);
      const p = await mkApp(t, sv);
      const [rw, ra] = await settle([withdraw(sv, p.id), accept(lec, p.id)]);
      expect([rw.status, ra.status].sort(), JSON.stringify([rw.body, ra.body])).toEqual([200, 409]);
      expect(code(rw.status === 409 ? rw : ra)).toBe('APPLICATION_CLOSED');
      const members = await prisma.topicMember.count({ where: { topicId: t.id, userId: U[sv].id } });
      expect(members).toBe(rw.status === 200 ? 0 : 1);
      expect((await appRow(p.id)).status).toBe(rw.status === 200 ? 'WITHDRAWN' : 'ACCEPTED');
    }
  });

  it('#5 duyệt ‖ FINALIZE_GROUP và duyệt ‖ UNPUBLISH (3 lượt mỗi kiểu) → bên thua 409; không có thành viên mới sau khi chốt/ngừng', async () => {
    const lec = await mkUser('LECTURER');
    for (const kind of ['FINALIZE', 'UNPUBLISH']) {
      for (let i = 0; i < 3; i++) {
        const [leader, sv] = await mkUsers('STUDENT', 2);
        const t = await mkLecTopic(lec);
        await mkMember(t, leader);
        const p = await mkApp(t, sv);
        const v = await version(t);
        const [ra, rf] = await settle([accept(lec, p.id), kind === 'FINALIZE' ? finalize(lec, t, v) : unpublish(lec, t, v)]);
        expect([ra.status, rf.status].sort(), JSON.stringify([ra.body, rf.body])).toEqual([200, 409]);
        const s = (await topicOf(t)).status;
        if (ra.status === 200) {
          expect(['CONCURRENT_UPDATE']).toContain(code(rf));
          expect([s, (await live(t)).length]).toEqual(['RECRUITING', 2]);
        } else {
          expect(code(ra)).toBe('NOT_RECRUITING');
          expect(s).toBe(kind === 'FINALIZE' ? 'HAS_ADVISOR' : 'DRAFT');
          expect(await live(t)).toHaveLength(kind === 'FINALIZE' ? 1 : 0);
          expect(await prisma.topicMember.count({ where: { topicId: t.id, userId: U[sv].id } })).toBe(0);
          expect((await appRow(p.id)).status).toBe('DECLINED');
        }
      }
    }
  });

  it('#11 (m9 BM) đồng thời chéo luồng cũ: GV duyệt đơn SV X ‖ nhóm cũ của X gửi REQUEST_ADVISOR, giới hạn 1 (3 lượt) → đúng một thành công, bên kia 409 STUDENT_TOPIC_LIMIT', async () => {
    const [l1, l2] = await mkUsers('LECTURER', 2);
    for (let i = 0; i < 3; i++) {
      const x = await mkUser('STUDENT');
      const old = await mkTopic(x); // nhóm cũ ở DRAFT (không hoạt động) → X vẫn ứng tuyển được
      const t = await mkLecTopic(l1);
      const p = await mkApp(t, x);
      const [ra, rq] = await settle([accept(l1, p.id), act(x, old, { action: 'REQUEST_ADVISOR', lecturerId: U[l2].id, version: 0 })]);
      expect([ra.status, rq.status].sort(), JSON.stringify([ra.body, rq.body])).toEqual([200, 409]);
      expect(code(ra.status === 409 ? ra : rq)).toBe('STUDENT_TOPIC_LIMIT');
      const active = await prisma.topic.count({ where: { id: { in: [t.id, old.id] }, status: { notIn: ['DRAFT'] }, members: { some: { userId: U[x].id, leftAt: null } } } });
      expect(active, `lượt ${i}`).toBe(1);
    }
  });

  it('từ chối: lý do bắt buộc 400; 200 DECLINED + lý do + thông báo + AuditLog; xử lý lại 409 APPLICATION_CLOSED; từ chối được đơn còn chờ khi đề tài không RECRUITING', async () => {
    const lec = await mkUser('LECTURER');
    const sv = await mkUser('STUDENT');
    const t = await mkLecTopic(lec);
    const p = await mkApp(t, sv);
    expect([(await decline(lec, p.id, '')).status, (await post(lec, `/api/applications/${p.id}/decline`, {})).status]).toEqual([400, 400]);
    const r = await decline(lec, p.id);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.application).toMatchObject({ status: 'DECLINED', reason: REASON, availableActions: [] });
    expect(await appRow(p.id)).toMatchObject({ decidedById: U[lec].id });
    expect((await notes(sv, 'APPLICATION_DECLINED')).map((x) => x.dedupeKey)).toEqual([`APPLICATION_DECLINED:${p.id}`]);
    expect(await prisma.auditLog.count({ where: { action: 'APPLICATION_DECLINE', entityId: p.id } })).toBe(1);
    expect(code(await decline(lec, p.id))).toBe('APPLICATION_CLOSED');
    expect(code(await accept(lec, p.id))).toBe('APPLICATION_CLOSED');
    // dữ liệu cũ: đơn chờ trên đề tài đã sang HAS_ADVISOR → duyệt 409 NOT_RECRUITING, từ chối vẫn được
    const sv2 = await mkUser('STUDENT');
    const t2 = await mkLecTopic(lec, { status: 'HAS_ADVISOR' });
    const p2 = await mkApp(t2, sv2);
    expect(code(await accept(lec, p2.id))).toBe('NOT_RECRUITING');
    expect((await decline(lec, p2.id)).status).toBe(200);
  });

  it('duyệt: SV bị khóa tài khoản sau khi ứng tuyển → 409 APPLICATION_CLOSED, không thêm thành viên; id lạ 404', async () => {
    const lec = await mkUser('LECTURER');
    const sv = await mkUser('STUDENT');
    const t = await mkLecTopic(lec);
    const p = await mkApp(t, sv);
    await prisma.user.update({ where: { id: U[sv].id }, data: { isLocked: true } });
    const r = await accept(lec, p.id);
    expect([r.status, code(r), r.body.error.message]).toEqual([409, 'APPLICATION_CLOSED', 'Sinh viên không còn đủ điều kiện']);
    expect(await live(t)).toHaveLength(0);
    expect((await appRow(p.id)).status).toBe('PENDING');
    expect((await accept(lec, 'khong-co-don-nay')).status).toBe(404);
  });
});

describe('§4.5 chốt nhóm', () => {
  it('#9 chốt khi dưới min → 409 GROUP_TOO_SMALL, trạng thái và đơn chờ giữ nguyên; SV/GV khác/cán bộ → 403; DRAFT → 409 INVALID_TRANSITION; sai version 409', async () => {
    const [lec, other] = await mkUsers('LECTURER', 2);
    const [a, b] = await mkUsers('STUDENT', 2);
    const round = await mkRound(S.F1.id, 'Đợt DC06 min 2', { minMembers: 2 });
    const t = await mkLecTopic(lec, { round });
    await mkMember(t, a);
    const p = await mkApp(t, b);
    const r = await finalize(lec, t);
    expect([r.status, code(r)]).toEqual([409, 'GROUP_TOO_SMALL']);
    expect((await topicOf(t)).status).toBe('RECRUITING');
    expect((await appRow(p.id)).status).toBe('PENDING');
    expect(await prisma.statusHistory.count({ where: { topicId: t.id } })).toBe(0);
    expect((await finalize(a, t)).status).toBe(403);
    expect((await finalize(other, t)).status).toBe(403);
    expect((await finalize('staff1', t)).status).toBe(403);
    expect((await finalize('admin', t)).status).toBe(403);
    expect(code(await finalize(lec, t, 99))).toBe('CONCURRENT_UPDATE');
    // m2 BM DC-06: body sai của FINALIZE_GROUP (thiếu/sai kiểu version) → 400 VALIDATION_ERROR tại version, không chuyển trạng thái
    for (const body of [{ action: 'FINALIZE_GROUP' }, { action: 'FINALIZE_GROUP', version: '0' }, { action: 'FINALIZE_GROUP', version: -1 }]) {
      const bad = await act(lec, t, body);
      expect([bad.status, code(bad), Object.keys(bad.body.error.details ?? {})], JSON.stringify(body)).toEqual([400, 'VALIDATION_ERROR', ['version']]);
    }
    expect((await topicOf(t)).status).toBe('RECRUITING');
    const draft = await mkLecTopic(lec, { status: 'DRAFT' });
    expect(code(await finalize(lec, draft))).toBe('INVALID_TRANSITION');
  });

  it('TopicDetail: GVHD thấy FINALIZE_GROUP trong availableActions ở RECRUITING (đã bật trong ENABLED_ACTIONS)', async () => {
    const lec = await mkUser('LECTURER');
    const t = await mkLecTopic(lec);
    expect((await get(lec, `/api/topics/${t.id}`)).body.topic.availableActions.sort()).toEqual(['FINALIZE_GROUP', 'UNPUBLISH_RECRUITMENT']);
  });
});

describe('§4.2 đọc đơn, quyền (#7, #8)', () => {
  it('#7 bảng tin của SV không có tên ứng viên, thành viên, số đơn; ứng viên GET /api/topics/:id → 403', async () => {
    const lec = await mkUser('LECTURER');
    const [m, x, y] = await mkUsers('STUDENT', 3);
    const t = await mkLecTopic(lec);
    await mkMember(t, m);
    await mkApp(t, x);
    expect((await apply(y, t)).status).toBe(201);
    for (const url of ['/api/recruitments', `/api/recruitments/${t.id}`]) {
      const r = await get(y, url);
      const text = JSON.stringify(r.body);
      for (const s of [m, x, U[m].id, U[x].id]) expect(text, url).not.toContain(s);
      expect(text).not.toMatch(/applicationCounts|"members"|"applications"/);
    }
    expect((await get(y, `/api/topics/${t.id}`)).status).toBe(403);
  });

  it('#8 GV khác, SV, ADMIN duyệt/từ chối/xem đơn → 403; SV khác rút đơn → 403; cán bộ: đọc trong phạm vi, không duyệt', async () => {
    const [lec, other] = await mkUsers('LECTURER', 2);
    const [sv, sv2] = await mkUsers('STUDENT', 2);
    const staffF2 = await mkUser('STAFF', { facultyId: S.F2.id });
    const t = await mkLecTopic(lec);
    const p = await mkApp(t, sv);
    for (const who of [other, sv, sv2, 'admin', 'staff1']) {
      expect((await accept(who, p.id)).status, who).toBe(403);
      expect((await decline(who, p.id)).status, who).toBe(403);
    }
    for (const who of [other, sv2, 'admin', 'staff1', lec]) expect((await withdraw(who, p.id)).status, who).toBe(403);
    for (const who of [other, sv, 'admin', staffF2]) expect((await get(who, `/api/topics/${t.id}/applications`)).status, who).toBe(403);
    expect((await get('admin', '/api/applications')).status).toBe(403);
    expect((await post('admin', `/api/recruitments/${t.id}/applications`, { coverLetter: LETTER })).status).toBe(403);
    expect((await post(lec, `/api/recruitments/${t.id}/applications`, { coverLetter: LETTER })).status).toBe(403);
    expect((await appRow(p.id)).status).toBe('PENDING');

    const staffView = await get('staff1', `/api/topics/${t.id}/applications`);
    expect([staffView.status, staffView.body.items.map((i) => [i.id, i.availableActions])]).toEqual([200, [[p.id, []]]]);
    // Hộp đơn chung theo vai trò
    const ids = async (who, qs = '') => (await get(who, `/api/applications${qs}`)).body.items.map((i) => i.id);
    expect(await ids(sv)).toEqual([p.id]);
    expect(await ids(sv2)).toEqual([]);
    expect(await ids(lec, `?topicId=${t.id}`)).toEqual([p.id]);
    expect(await ids(other)).toEqual([]);
    expect(await ids(staffF2)).toEqual([]);
    expect(await ids('staff1', `?topicId=${t.id}&status=PENDING`)).toEqual([p.id]);
    expect(await ids('staff1', `?topicId=${t.id}&status=ACCEPTED`)).toEqual([]);
    const mine = (await get(sv, '/api/applications')).body.items[0];
    expect(mine.student).toEqual({ id: U[sv].id, code: sv, fullName: U[sv].fullName, classCode: null });
    expect(JSON.stringify(mine)).not.toContain('@t.vn'); // không email (FR30)
    expect((await get(sv, '/api/applications?status=XYZ')).status).toBe(400);
  });
});
