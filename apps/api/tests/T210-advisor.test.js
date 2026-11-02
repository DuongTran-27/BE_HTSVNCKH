// T210 (FR16, FR03, FR25, FR15): đề nghị hướng dẫn trên DB test thật. Dữ liệu riêng, resetData ở beforeAll.
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../src/app.js';
import { createAuthRepo } from '../src/modules/auth/prismaRepo.js';
import { createTopicRepo } from '../src/modules/topics/prismaRepo.js';
import { withLockTx } from '../src/lib/tx.js';
import { signAccessToken } from '../src/lib/tokens.js';
import { fakeHasher, testEnv } from './helpers.js';
import { resetData } from './db.js';

const prisma = new PrismaClient();
const app = createApp({ env: testEnv, logger: undefined, authRepo: createAuthRepo(prisma), hasher: fakeHasher, topicRepo: createTopicRepo(prisma) });

let F1, F2, field, round, round2, lecRound, closedRound, otherRound;
const U = {};
const tok = {};
const as = (who) => ({ Authorization: `Bearer ${tok[who]}` });
const post = (who, url, body) => request(app).post(url).set(as(who)).send(body);
const get = (who, url) => request(app).get(url).set(as(who));
const act = (who, t, body) => post(who, `/api/topics/${t.id}/actions`, { version: 0, ...body });
const day = 86400000;
const at = (d) => new Date(Date.now() + d * day);
const cfg = { minSummaryWords: 3, minKeywords: 1 };
const mkRound = (facultyId, name, config = {}, open = -1, close = 30) =>
  prisma.round.create({ data: { facultyId, name, academicYear: '2026-2027', regOpenAt: at(open), regCloseAt: at(close), reviewDeadline: at(60), endAt: at(200), config: { ...cfg, ...config } } });
let seq = 0;
const mkTopic = (leader, r = round, extra = {}) =>
  prisma.topic.create({
    data: {
      code: `T210-${++seq}`, title: 'Hệ thống quản lý nghiên cứu', summary: 'tóm tắt đủ từ', objectives: 'Mục tiêu nghiên cứu của đề tài',
      keywords: ['web'], fieldId: field.id, roundId: r.id, facultyId: r.facultyId, status: 'DRAFT',
      members: { create: { userId: U[leader].id, role: 'LEADER' } }, ...extra,
    },
  });
const addMember = (t, who) => prisma.topicMember.create({ data: { topicId: t.id, userId: U[who].id, role: 'MEMBER' } });
const reqs = (topicId) => prisma.advisorRequest.findMany({ where: { topicId }, orderBy: { id: 'asc' } });
const topicOf = (t) => prisma.topic.findUnique({ where: { id: t.id } });
// đề tài đang chờ GVHD với một đề nghị PENDING
const mkWaiting = async (leader, lec, r = round) => {
  const t = await mkTopic(leader, r, { status: 'WAITING_ADVISOR' });
  await prisma.advisorRequest.create({ data: { topicId: t.id, lecturerId: U[lec].id } });
  return t;
};
const mkAdvised = async (leader, lec, r = round) => {
  const t = await mkTopic(leader, r, { status: 'HAS_ADVISOR' });
  await prisma.advising.create({ data: { topicId: t.id, lecturerId: U[lec].id } });
  return t;
};

beforeAll(async () => {
  await resetData(prisma);
  F1 = await prisma.faculty.create({ data: { code: 'CNTT', name: 'Công nghệ thông tin' } });
  F2 = await prisma.faculty.create({ data: { code: 'KT', name: 'Kinh tế' } });
  field = await prisma.field.create({ data: { code: 'AI', name: 'AI' } });
  round = await mkRound(F1.id, 'Mặc định');
  round2 = await mkRound(F1.id, 'Tối thiểu 2 thành viên', { minMembers: 2 });
  lecRound = await mkRound(F1.id, 'GV tối đa 1', { maxTopicsPerLecturer: 1 });
  closedRound = await mkRound(F1.id, 'Đã đóng', {}, -30, -1);
  otherRound = await mkRound(F2.id, 'Khoa khác');
  const mk = async (key, role, facultyId, extra = {}) => {
    U[key] = await prisma.user.create({ data: { code: key, email: `${key}@t.vn`, fullName: `Tên ${key}`, passwordHash: 'x', role, mustChangePassword: false, facultyId, ...extra } });
    tok[key] = signAccessToken(U[key], { secret: testEnv.JWT_ACCESS_SECRET, ttlSeconds: 600 });
  };
  await mk('admin', 'ADMIN');
  await mk('staff1', 'STAFF', F1.id);
  await mk('staff2', 'STAFF', F2.id);
  for (const k of ['lecA', 'lecB', 'lecC', 'lecLocked']) await mk(k, 'LECTURER', F1.id, k === 'lecLocked' ? { isLocked: true } : {});
  await mk('lecF2', 'LECTURER', F2.id);
  for (let i = 1; i <= 40; i++) await mk(`s${i}`, 'STUDENT', F1.id);
  await prisma.staffScope.createMany({ data: [{ userId: U.staff1.id, facultyId: F1.id }, { userId: U.staff2.id, facultyId: F2.id }] });
});

describe('REQUEST_ADVISOR', () => {
  it('trưởng nhóm gửi: WAITING_ADVISOR, version+1, StatusHistory, AdvisorRequest PENDING, lời mời PENDING -> WITHDRAWN, AuditLog', async () => {
    const t = await mkTopic('s1');
    const inv = await prisma.invitation.create({ data: { topicId: t.id, inviteeId: U.s2.id } });
    const r = await act('s1', t, { action: 'REQUEST_ADVISOR', lecturerId: U.lecA.id });
    expect(r.status).toBe(200);
    expect(r.body.topic).toMatchObject({ status: 'WAITING_ADVISOR', version: 1, pendingAdvisorRequest: { lecturer: { id: U.lecA.id } } });
    expect(r.body.topic.availableActions).toEqual(['WITHDRAW_ADVISOR_REQUEST']);
    expect((await reqs(t.id)).map((x) => x.status)).toEqual(['PENDING']);
    const i = await prisma.invitation.findUnique({ where: { id: inv.id } });
    expect(i.status).toBe('WITHDRAWN');
    expect(i.respondedAt).toBeTruthy();
    expect(await prisma.statusHistory.findMany({ where: { topicId: t.id } })).toMatchObject([{ from: 'DRAFT', to: 'WAITING_ADVISOR', action: 'REQUEST_ADVISOR', actorId: U.s1.id }]);
    expect(await prisma.auditLog.count({ where: { action: 'ADVISOR_REQUEST_CREATE', actorId: U.s1.id } })).toBeGreaterThan(0);
    // lời mời đã rút: người được mời không chấp nhận được nữa
    expect((await post('s2', `/api/invitations/${inv.id}/accept`, {})).body.error.code).toBe('INVITATION_CLOSED');
  });

  it('403: thành viên không phải trưởng nhóm, người ngoài (không lộ trạng thái), GV, STAFF, ADMIN; 404; 401', async () => {
    const t = await mkTopic('s3');
    await addMember(t, 's4');
    const body = { action: 'REQUEST_ADVISOR', lecturerId: U.lecA.id };
    for (const who of ['s4', 's5', 'lecA', 'staff1', 'admin']) expect((await act(who, t, body)).status, who).toBe(403);
    expect((await post('s3', '/api/topics/khong-co/actions', { version: 0, ...body })).status).toBe(404);
    expect((await request(app).post(`/api/topics/${t.id}/actions`).send({ version: 0, ...body })).status).toBe(401);
    expect((await topicOf(t)).status).toBe('DRAFT');
  });

  it('sai trạng thái -> 409 INVALID_TRANSITION; action ngoài union -> 400; version lệch -> 409 CONCURRENT_UPDATE', async () => {
    const w = await mkWaiting('s6', 'lecA');
    const r = await act('s6', w, { action: 'REQUEST_ADVISOR', lecturerId: U.lecA.id });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('INVALID_TRANSITION');
    expect((await act('s6', w, { action: 'CANCEL' })).status).toBe(400);
    const t = await mkTopic('s7');
    const stale = await post('s7', `/api/topics/${t.id}/actions`, { action: 'REQUEST_ADVISOR', lecturerId: U.lecA.id, version: 9 });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('CONCURRENT_UPDATE');
  });

  it('ngoài thời gian đăng ký -> 409 REGISTRATION_CLOSED (MINOR T209)', async () => {
    const t = await mkTopic('s8', closedRound);
    const r = await act('s8', t, { action: 'REQUEST_ADVISOR', lecturerId: U.lecA.id });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('REGISTRATION_CLOSED');
    expect((await topicOf(t)).status).toBe('DRAFT');
  });

  it('hồ sơ thiếu trường -> 400 TOPIC_INCOMPLETE kèm details theo trường', async () => {
    const t = await mkTopic('s9', round, { title: 'ngắn', fieldId: null, keywords: [] });
    const r = await act('s9', t, { action: 'REQUEST_ADVISOR', lecturerId: U.lecA.id });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('TOPIC_INCOMPLETE');
    expect(Object.keys(r.body.error.details).sort()).toEqual(['fieldId', 'keywords', 'title']);
  });

  it('lecturerId không hợp lệ (SV, GV khoa khác, GV bị khóa, không tồn tại) -> 400 tại lecturerId', async () => {
    const t = await mkTopic('s10');
    for (const id of [U.s11.id, U.lecF2.id, U.lecLocked.id, 'khong-co']) {
      const r = await act('s10', t, { action: 'REQUEST_ADVISOR', lecturerId: id });
      expect(r.status, id).toBe(400);
      expect(r.body.error.details).toHaveProperty('lecturerId');
    }
  });

  it('GROUP_TOO_SMALL khi thiếu thành viên tối thiểu của đợt; đủ thì gửi được', async () => {
    const t = await mkTopic('s12', round2);
    const r = await act('s12', t, { action: 'REQUEST_ADVISOR', lecturerId: U.lecA.id });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('GROUP_TOO_SMALL');
    await addMember(t, 's13');
    expect((await act('s12', t, { action: 'REQUEST_ADVISOR', lecturerId: U.lecA.id })).status).toBe(200);
  });

  it('STUDENT_TOPIC_LIMIT: thành viên đã có đề tài hoạt động trong đợt; rollback toàn bộ; Nháp/đợt khác không tính', async () => {
    await mkWaiting('s14', 'lecA'); // s14 có đề tài hoạt động
    const t = await mkTopic('s15');
    await addMember(t, 's14');
    const inv = await prisma.invitation.create({ data: { topicId: t.id, inviteeId: U.s16.id } });
    const r = await act('s15', t, { action: 'REQUEST_ADVISOR', lecturerId: U.lecA.id });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatchObject({ code: 'STUDENT_TOPIC_LIMIT', details: { codes: ['s14'] } });
    expect(await topicOf(t)).toMatchObject({ status: 'DRAFT', version: 0 });
    expect(await reqs(t.id)).toHaveLength(0);
    expect(await prisma.statusHistory.count({ where: { topicId: t.id } })).toBe(0);
    expect((await prisma.invitation.findUnique({ where: { id: inv.id } })).status).toBe('PENDING');
    // đề tài hoạt động ở đợt khác không tính
    const o = await mkRound(F1.id, 'Đợt khác');
    const other = await mkTopic('s17', o, { status: 'UNDER_REVIEW' });
    expect(other.id).toBeTruthy();
    const t2 = await mkTopic('s17');
    expect((await act('s17', t2, { action: 'REQUEST_ADVISOR', lecturerId: U.lecA.id })).status).toBe(200);
  });

  it('đồng thời: hai đề tài chung một thành viên cùng gửi -> đúng một thành công (khóa User)', async () => {
    for (let i = 0; i < 3; i++) {
      const c = `s${20 + i}`;
      const x = await mkTopic(`s${23 + i * 2}`);
      const y = await mkTopic(`s${24 + i * 2}`);
      await addMember(x, c);
      await addMember(y, c);
      const rs = await Promise.all([
        act(`s${23 + i * 2}`, x, { action: 'REQUEST_ADVISOR', lecturerId: U.lecA.id }),
        act(`s${24 + i * 2}`, y, { action: 'REQUEST_ADVISOR', lecturerId: U.lecB.id }),
      ]);
      expect(rs.map((r) => r.status).sort(), `vòng ${i}`).toEqual([200, 409]);
      expect(rs.find((r) => r.status === 409).body.error.code).toBe('STUDENT_TOPIC_LIMIT');
    }
  });

  it('kịch bản §5.5: chấp nhận lời mời vào X trước khi X gửi -> X đọc lại thấy thành viên mới và bị chặn', async () => {
    await mkWaiting('s29', 'lecA'); // s30 sẽ có đề tài hoạt động
    const x = await mkTopic('s19');
    const inv = await prisma.invitation.create({ data: { topicId: x.id, inviteeId: U.s29.id } });
    // s29 đã có đề tài hoạt động: kiểm sớm chặn ở accept; ghi thành viên trực tiếp để mô phỏng kiểm sớm lọt
    expect((await post('s29', `/api/invitations/${inv.id}/accept`, {})).body.error.code).toBe('STUDENT_TOPIC_LIMIT');
    await prisma.topicMember.create({ data: { topicId: x.id, userId: U.s29.id, role: 'MEMBER' } });
    const r = await act('s19', x, { action: 'REQUEST_ADVISOR', lecturerId: U.lecB.id });
    expect(r.body.error).toMatchObject({ code: 'STUDENT_TOPIC_LIMIT', details: { codes: ['s29'] } });
  });
});

describe('ACCEPT_ADVISING / DECLINE_ADVISING / WITHDRAW_ADVISOR_REQUEST', () => {
  it('GV được đề nghị nhận: HAS_ADVISOR, Advising, request ACCEPTED, StatusHistory, AuditLog', async () => {
    const t = await mkWaiting('s30', 'lecA');
    const r = await act('lecA', t, { action: 'ACCEPT_ADVISING' });
    expect(r.status).toBe(200);
    expect(r.body.topic).toMatchObject({ status: 'HAS_ADVISOR', version: 1, advisor: { id: U.lecA.id }, pendingAdvisorRequest: null });
    expect((await reqs(t.id))[0]).toMatchObject({ status: 'ACCEPTED' });
    expect((await reqs(t.id))[0].respondedAt).toBeTruthy();
    expect(await prisma.advising.count({ where: { topicId: t.id, lecturerId: U.lecA.id, endAt: null } })).toBe(1);
    expect(await prisma.statusHistory.count({ where: { topicId: t.id, action: 'ACCEPT_ADVISING', actorId: U.lecA.id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'ADVISOR_REQUEST_ACCEPT', actorId: U.lecA.id } })).toBeGreaterThan(0);
  });

  it('403: GV khác, trưởng nhóm, STAFF, ADMIN; 409 sai trạng thái', async () => {
    const t = await mkWaiting('s31', 'lecA');
    for (const who of ['lecB', 's31', 'staff1', 'admin']) expect((await act(who, t, { action: 'ACCEPT_ADVISING' })).status, who).toBe(403);
    const d = await mkTopic('s32');
    expect((await act('lecA', d, { action: 'ACCEPT_ADVISING' })).status).toBe(403); // chưa liên quan -> 403, không lộ trạng thái
    const h = await mkAdvised('s33', 'lecA');
    expect((await act('lecA', h, { action: 'ACCEPT_ADVISING' })).body.error.code).toBe('INVALID_TRANSITION');
  });

  it('từ chối: bắt buộc lý do; DRAFT, request DECLINED kèm lý do, StatusHistory có reason', async () => {
    const t = await mkWaiting('s34', 'lecA');
    expect((await act('lecA', t, { action: 'DECLINE_ADVISING' })).status).toBe(400);
    expect((await act('lecA', t, { action: 'DECLINE_ADVISING', reason: 'ngắn' })).status).toBe(400);
    const r = await act('lecA', t, { action: 'DECLINE_ADVISING', reason: 'Không đúng chuyên môn' });
    expect(r.status).toBe(200);
    expect(r.body.topic).toEqual({ id: t.id, code: t.code, status: 'DRAFT', version: 1 }); // tóm lược: không title/summary
    // GV không còn thấy tên đề tài đã từ chối trong danh sách
    const li = (await get('lecA', '/api/advisor-requests?status=DECLINED')).body.items.find((i) => i.topic.id === t.id);
    expect(li.topic).toEqual({ id: t.id, code: t.code, round: { id: round.id, name: round.name } });
    expect((await reqs(t.id))[0]).toMatchObject({ status: 'DECLINED', reason: 'Không đúng chuyên môn' });
    expect((await prisma.statusHistory.findFirst({ where: { topicId: t.id, action: 'DECLINE_ADVISING' } })).reason).toBe('Không đúng chuyên môn');
    expect(await prisma.advising.count({ where: { topicId: t.id } })).toBe(0);
    // sau khi bị từ chối có thể gửi lại cho GV khác
    expect((await post('s34', `/api/topics/${t.id}/actions`, { action: 'REQUEST_ADVISOR', lecturerId: U.lecB.id, version: r.body.topic.version })).status).toBe(200);
  });

  it('trưởng nhóm rút: DRAFT, request WITHDRAWN; thành viên thường và GV không rút được', async () => {
    const t = await mkWaiting('s35', 'lecA');
    await addMember(t, 's36');
    for (const who of ['s36', 'lecA', 'staff1']) expect((await act(who, t, { action: 'WITHDRAW_ADVISOR_REQUEST' })).status, who).toBe(403);
    const r = await act('s35', t, { action: 'WITHDRAW_ADVISOR_REQUEST' });
    expect(r.status).toBe(200);
    expect(r.body.topic.status).toBe('DRAFT');
    expect((await reqs(t.id))[0].status).toBe('WITHDRAWN');
    expect((await act('s35', t, { action: 'WITHDRAW_ADVISOR_REQUEST', version: 1 })).body.error.code).toBe('INVALID_TRANSITION');
  });

  it('hạn mức GV kiểm tại thời điểm nhận: đủ hạn mức -> 409 LECTURER_QUOTA_EXCEEDED, rollback', async () => {
    await mkAdvised('s37', 'lecB', lecRound);
    const t = await mkWaiting('s38', 'lecB', lecRound);
    const r = await act('lecB', t, { action: 'ACCEPT_ADVISING' });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('LECTURER_QUOTA_EXCEEDED');
    expect(await topicOf(t)).toMatchObject({ status: 'WAITING_ADVISOR', version: 0 });
    expect((await reqs(t.id))[0].status).toBe('PENDING');
    expect(await prisma.advising.count({ where: { topicId: t.id } })).toBe(0);
  });

  it('đồng thời: GV còn 1 suất nhận hai đề tài khác nhau -> đúng một thành công', async () => {
    for (let i = 0; i < 3; i++) {
      const lec = ['lecA', 'lecB', 'lecC'][i];
      const r1 = await prisma.round.create({ data: { facultyId: F1.id, name: `Đua ${i}`, academicYear: '2026-2027', regOpenAt: at(-1), regCloseAt: at(30), reviewDeadline: at(60), endAt: at(200), config: { ...cfg, maxTopicsPerLecturer: 1 } } });
      const x = await mkWaiting('s1', lec, r1); // đợt riêng mỗi vòng nên dùng lại SV được
      const y = await mkWaiting('s2', lec, r1);
      const rs = await Promise.all([act(lec, x, { action: 'ACCEPT_ADVISING' }), act(lec, y, { action: 'ACCEPT_ADVISING' })]);
      expect(rs.map((r) => r.status).sort(), `vòng ${i}`).toEqual([200, 409]);
      expect(rs.find((r) => r.status === 409).body.error.code).toBe('LECTURER_QUOTA_EXCEEDED');
      expect(await prisma.advising.count({ where: { lecturerId: U[lec].id, endAt: null, topic: { roundId: r1.id } } })).toBe(1);
    }
  }, 30000);
});

describe('applyTransition qua withLockTx', () => {
  it('tx khác giữ khóa Topic > 3s -> 409 CONCURRENT_UPDATE, không phải 500', async () => {
    const t = await mkTopic('s39');
    let release;
    const hold = new Promise((r) => { release = r; });
    let locked;
    const gotLock = new Promise((r) => { locked = r; });
    const holder = withLockTx(prisma, async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Topic" WHERE id = ${t.id} FOR NO KEY UPDATE`;
      locked();
      await hold;
    });
    await gotLock;
    const res = await act('s39', t, { action: 'REQUEST_ADVISOR', lecturerId: U.lecA.id });
    release();
    await holder;
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONCURRENT_UPDATE');
    expect((await topicOf(t)).status).toBe('DRAFT');
  }, 20000);
});

describe('GET /api/advisor-requests', () => {
  let t1, t2;
  beforeAll(async () => {
    const r = await prisma.round.create({ data: { facultyId: F1.id, name: 'Đợt danh sách', academicYear: '2026-2027', regOpenAt: at(-1), regCloseAt: at(30), reviewDeadline: at(60), endAt: at(200), config: cfg } });
    t1 = await mkWaiting('s40', 'lecC', r);
    t2 = await mkWaiting('s39', 'lecC', r);
    await prisma.advisorRequest.updateMany({ where: { topicId: t1.id }, data: { createdAt: at(-4) } });
    t1.roundId = r.id;
  });

  it('GV thấy đề nghị gửi tới mình, cũ trước (createdAt ASC), pendingDays, round', async () => {
    const r = await get('lecC', `/api/advisor-requests?roundId=${t1.roundId}`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ page: 1, pageSize: 20, total: 2 });
    expect(r.body.items.map((i) => i.topic.id)).toEqual([t1.id, t2.id]);
    expect(r.body.items[0]).toMatchObject({ status: 'PENDING', pendingDays: 4, lecturer: { id: U.lecC.id }, topic: { code: t1.code, round: { name: 'Đợt danh sách' } } });
    expect((await get('lecC', `/api/advisor-requests?roundId=${t1.roundId}&status=ACCEPTED`)).body.total).toBe(0);
    expect((await get('lecA', `/api/advisor-requests?roundId=${t1.roundId}`)).body.total).toBe(0);
  });

  it('SV chỉ thấy của đề tài mình; STAFF theo phạm vi; ADMIN 403; query sai 400', async () => {
    expect((await get('s40', `/api/advisor-requests?roundId=${t1.roundId}`)).body.items.map((i) => i.topic.id)).toEqual([t1.id]);
    expect((await get('staff1', `/api/advisor-requests?roundId=${t1.roundId}`)).body.total).toBe(2);
    expect((await get('staff2', `/api/advisor-requests?roundId=${t1.roundId}`)).body.total).toBe(0);
    expect((await get('admin', '/api/advisor-requests')).status).toBe(403);
    expect((await get('lecC', '/api/advisor-requests?status=XYZ')).status).toBe(400);
  });
});

describe('GET /api/lecturers', () => {
  it('trả GV không khóa của khoa, activeTopicCount/maxTopics/isFull; lọc q; không lộ email', async () => {
    const r = await get('s1', `/api/lecturers?roundId=${lecRound.id}`);
    expect(r.status).toBe(200);
    const byCode = Object.fromEntries(r.body.items.map((i) => [i.code, i]));
    expect(Object.keys(byCode).sort()).toEqual(['lecA', 'lecB', 'lecC']); // không có lecLocked, lecF2
    expect(byCode.lecB).toMatchObject({ activeTopicCount: 1, maxTopics: 1, isFull: true });
    expect(byCode.lecC).toMatchObject({ isFull: false });
    expect(r.body.items[0].email).toBeUndefined();
    expect((await get('lecA', `/api/lecturers?roundId=${lecRound.id}&q=lecb`)).body.items.map((i) => i.code)).toEqual(['lecB']);
    expect((await get('staff1', `/api/lecturers?roundId=${lecRound.id}`)).status).toBe(200);
  });

  it('khoa khác / STAFF ngoài phạm vi 403; ADMIN 403; đợt lạ 404; thiếu roundId 400', async () => {
    expect((await get('s1', `/api/lecturers?roundId=${otherRound.id}`)).status).toBe(403);
    expect((await get('staff2', `/api/lecturers?roundId=${round.id}`)).status).toBe(403);
    expect((await get('admin', `/api/lecturers?roundId=${round.id}`)).status).toBe(403);
    expect((await get('s1', '/api/lecturers?roundId=khong-co')).status).toBe(404);
    expect((await get('s1', '/api/lecturers')).status).toBe(400);
  });
});
