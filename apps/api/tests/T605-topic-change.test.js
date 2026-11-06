// T605 (FR18, API_GD6 §6, §10): thay đổi sau duyệt (TOPIC_CHANGE), chặn đổi tham số đợt làm đề tài kẹt (G45),
// tên đề tài trong ChangeRequestView cho người không còn quan hệ (m1 reviews/T603-bao-mat-v1.md). DB test thật.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { prisma, app, S, U, tok, seedBase, mkTopic, mkRound, addMember, CONTENT, activeCount } from './t214-kit.js';
import { createApp } from '../src/app.js';
import { createAuthRepo } from '../src/modules/auth/prismaRepo.js';
import { createTopicRepo } from '../src/modules/topics/prismaRepo.js';
import { signAccessToken } from '../src/lib/tokens.js';
import { fakeHasher, testEnv } from './helpers.js';

const as = (who) => ({ Authorization: `Bearer ${tok[who]}` });
const post = (who, url, body = {}, a = app) => request(a).post(url).set(as(who)).send(body);
const get = (who, url) => request(app).get(url).set(as(who));
const patch = (who, url, body) => request(app).patch(url).set(as(who)).send(body);
const code = (r) => r.body.error?.code;
const REASON = 'Điều chỉnh hướng nghiên cứu theo góp ý';
// FR06 lỗi giả lập: kho so không tải được
const broken = createApp({ env: testEnv, logger: undefined, authRepo: createAuthRepo(prisma), hasher: fakeHasher, topicRepo: { ...createTopicRepo(prisma), loadCorpus: async () => { throw new Error('boom'); } } });

// Người dùng mới mỗi test: limiter 30/15 phút/người của §2.3 và limiter FR06 10/15 phút không bị dồn
let n = 0;
const mkUser = async (role, extra = {}) => {
  const key = `${role.toLowerCase()}-t605-${++n}`;
  U[key] = await prisma.user.create({ data: { code: key, email: `${key}@t.vn`, fullName: `Tên ${key}`, passwordHash: 'x', role, mustChangePassword: false, facultyId: S.F1.id, ...extra } });
  tok[key] = signAccessToken(U[key], { secret: testEnv.JWT_ACCESS_SECRET, ttlSeconds: 600 });
  if (role === 'STAFF') await prisma.staffScope.create({ data: { userId: U[key].id, facultyId: S.F1.id } });
  return key;
};
// Đề tài đang thực hiện: trưởng nhóm + k thành viên + GVHD
const mkGroup = async ({ status = 'IN_PROGRESS', k = 0, round = S.round } = {}) => {
  const leader = await mkUser('STUDENT');
  const t = await mkTopic(leader, round, { status });
  const ms = [];
  for (let i = 0; i < k; i++) {
    ms.push(await mkUser('STUDENT'));
    await addMember(t, ms[i]);
  }
  const lec = await mkUser('LECTURER');
  await prisma.advising.create({ data: { topicId: t.id, lecturerId: U[lec].id } });
  return { t, leader, ms, lec };
};
const create = (who, t, o = {}, a = app) => post(who, `/api/topics/${t.id}/change-requests`, { type: 'TOPIC_CHANGE', reason: REASON, ...o }, a);
const cr = (verb) => (who, id, body = {}) => post(who, `/api/change-requests/${id}/${verb}`, body);
const approve = cr('approve');
const accept = cr('accept');
const decline = cr('decline');
const topic = (t) => prisma.topic.findUnique({ where: { id: t.id } });
const pick = (x) => ({ title: x.title, summary: x.summary, objectives: x.objectives, keywords: x.keywords, fieldId: x.fieldId, version: x.version });
const OBJ = 'Mục tiêu mới đủ dài để đạt yêu cầu tối thiểu';
const longJustification = Array.from({ length: 60 }, (_, i) => `giải${i}`).join(' ');

beforeAll(() => seedBase({ students: 2 }), 60000);
afterAll(() => prisma.$disconnect());

describe('FR18 – tạo và duyệt (§6.2, §6.4; ca 1, 3)', () => {
  it('ca 1: đổi objectives + lĩnh vực → duyệt: nội dung đổi, version +1, không chạy FR06, không Submission/StatusHistory, AuditLog before/after', async () => {
    const { t, leader, lec } = await mkGroup();
    const staff = await mkUser('STAFF');
    const f2 = await prisma.field.create({ data: { code: `F605-${++n}`, name: 'An toàn thông tin' } });
    expect((await get(leader, `/api/topics/${t.id}`)).body.topic.permissions.requestTopicChange).toBe(true);
    // keywords giống hiện tại bị bỏ khỏi payload
    const c = await create(leader, t, { changes: { objectives: OBJ, fieldId: f2.id, keywords: t.keywords } });
    expect(c.status, JSON.stringify(c.body)).toBe(201);
    expect(c.body.changeRequest).toMatchObject({
      type: 'TOPIC_CHANGE', status: 'PENDING', stage: 'STAFF', target: null, similarityCheck: null, availableActions: ['WITHDRAW'],
      payload: { before: { objectives: t.objectives, fieldId: S.field.id, fieldName: S.field.name }, after: { objectives: OBJ, fieldId: f2.id, fieldName: f2.name }, addMember: null },
    });
    expect(Object.keys(c.body.changeRequest.payload.before).sort()).toEqual(['fieldId', 'fieldName', 'objectives']);
    expect(await prisma.similarityCheck.count({ where: { topicId: t.id } })).toBe(0);
    expect((await topic(t)).objectives).toBe(t.objectives); // chưa duyệt thì chưa đổi
    const id = c.body.changeRequest.id;
    const a = await approve(staff, id, { reason: 'Đồng ý điều chỉnh' });
    expect(a.status, JSON.stringify(a.body)).toBe(200);
    expect(a.body.changeRequest).toMatchObject({ status: 'ACCEPTED', decisionReason: 'Đồng ý điều chỉnh', decidedBy: { id: U[staff].id } });
    expect(a.body.topic).toMatchObject({ status: 'IN_PROGRESS', objectives: OBJ, field: { id: f2.id }, version: 1 });
    expect(pick(await topic(t))).toEqual({ ...pick(t), objectives: OBJ, fieldId: f2.id, version: 1 });
    expect(await prisma.submission.count({ where: { topicId: t.id } })).toBe(0);
    expect(await prisma.statusHistory.count({ where: { topicId: t.id } })).toBe(0);
    expect(await prisma.similarityCheck.count({ where: { topicId: t.id } })).toBe(0);
    const log = await prisma.auditLog.findFirst({ where: { action: 'TOPIC_CHANGE_APPLY', entityId: t.id } });
    expect(log).toMatchObject({ actorId: U[staff].id, before: { objectives: t.objectives, fieldId: S.field.id, title: t.title }, after: { objectives: OBJ, fieldId: f2.id, changeRequestId: id } });
    expect(log.after.summaryDigest).toMatchObject({ words: 8 });
    expect(await prisma.auditLog.count({ where: { action: { in: ['CHANGE_REQUEST_CREATE', 'CHANGE_REQUEST_APPROVE'] }, entityId: id } })).toBe(2);
    const notes = await prisma.notification.findMany({ where: { dedupeKey: `CHANGE_DECIDED:${id}` } });
    expect(notes.map((x) => x.userId).sort()).toEqual([U[leader].id, U[lec].id].sort());
  });

  it('ca 3: cán bộ từ chối có lý do → hồ sơ giữ nguyên; rút cũng giữ nguyên', async () => {
    const { t, leader } = await mkGroup();
    const staff = await mkUser('STAFF');
    const id = (await create(leader, t, { changes: { objectives: OBJ } })).body.changeRequest.id;
    expect((await decline(staff, id, {})).status).toBe(400);
    const d = await decline(staff, id, { reason: 'Mục tiêu mới chưa phù hợp' });
    expect([d.status, d.body.changeRequest.status]).toEqual([200, 'DECLINED']);
    expect(code(await approve(staff, id))).toBe('CHANGE_REQUEST_CLOSED');
    const id2 = (await create(leader, t, { changes: { objectives: OBJ } })).body.changeRequest.id;
    expect((await post(leader, `/api/change-requests/${id2}/withdraw`)).status).toBe(200);
    expect(pick(await topic(t))).toEqual(pick(t));
  });

  it('kiểm khi tạo: không có thay đổi thực sự 400 `_`; body rỗng 400; hồ sơ sau gộp không đạt 400 TOPIC_INCOMPLETE; lĩnh vực ngừng dùng 400; trùng loại 409', async () => {
    const { t, leader } = await mkGroup();
    const r1 = await create(leader, t, { changes: { objectives: t.objectives } });
    expect([r1.status, code(r1), r1.body.error.details]).toEqual([400, 'VALIDATION_ERROR', { _: 'Yêu cầu phải có ít nhất một thay đổi' }]);
    const r2 = await create(leader, t, {});
    expect([r2.status, r2.body.error.details._]).toEqual([400, 'Yêu cầu phải có ít nhất một thay đổi']);
    expect((await create(leader, t, { changes: { title: 'ngắn' } })).status).toBe(400); // tĩnh: title ≥ 10
    expect((await create(leader, t, { changes: { status: 'CLOSED' } })).status).toBe(400); // strict
    const r3 = await create(leader, t, { changes: { keywords: [] } }); // minKeywords = 1 của đợt
    expect([r3.status, code(r3), Object.keys(r3.body.error.details)]).toEqual([400, 'TOPIC_INCOMPLETE', ['keywords']]);
    const off = await prisma.field.create({ data: { code: `OFF-${++n}`, name: 'Cũ', isActive: false } });
    const r4 = await create(leader, t, { changes: { fieldId: off.id } });
    expect([r4.status, r4.body.error.details]).toEqual([400, { 'changes.fieldId': 'Lĩnh vực không tồn tại hoặc đã ngừng dùng' }]);
    expect((await create(leader, t, { changes: { objectives: OBJ } })).status).toBe(201);
    expect(code(await create(leader, t, { changes: { objectives: `${OBJ} khác` } }))).toBe('CHANGE_REQUEST_PENDING');
    expect(await prisma.changeRequest.count({ where: { topicId: t.id } })).toBe(1);
  });
});

describe('FR18 – FR06 khi đổi tên/tóm tắt (§6.2; ca 2)', () => {
  it('đổi tên → FR06 chạy trên nội dung gộp, dòng kiểm gắn yêu cầu, cán bộ xem kết quả; duyệt không chạy lại FR06', async () => {
    const { t, leader } = await mkGroup();
    const staff = await mkUser('STAFF');
    const title = CONTENT().title;
    const c = await create(leader, t, { changes: { title } });
    expect(c.status, JSON.stringify(c.body)).toBe(201);
    const rows = await prisma.similarityCheck.findMany({ where: { topicId: t.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'OK', level: 'NONE' });
    const row = await prisma.changeRequest.findUnique({ where: { id: c.body.changeRequest.id } });
    expect(row.similarityCheckId).toBe(rows[0].id);
    expect(c.body.changeRequest.similarityCheck).toMatchObject({ id: rows[0].id, status: 'OK', level: 'NONE' });
    expect(await prisma.auditLog.count({ where: { action: 'SIMILARITY_CHECK', entityId: rows[0].id } })).toBe(1);
    const v = await get(staff, `/api/change-requests/${row.id}`);
    expect(v.body.changeRequest).toMatchObject({ similarityCheck: { id: rows[0].id, level: 'NONE' }, payload: { before: { title: t.title }, after: { title } } });
    expect((await approve(staff, row.id)).status).toBe(200);
    expect((await topic(t)).title).toBe(title);
    expect(await prisma.similarityCheck.count({ where: { topicId: t.id } })).toBe(1);
  });

  it('nghi trùng cao không giải trình → 400 JUSTIFICATION_REQUIRED (kèm kết quả), không có yêu cầu; đủ giải trình → 201', async () => {
    const { t, leader } = await mkGroup();
    const other = await mkUser('STUDENT');
    const copy = CONTENT();
    await mkTopic(other, S.round, { status: 'CLOSED', ...copy });
    const changes = { title: copy.title, summary: copy.summary, objectives: copy.objectives, keywords: copy.keywords };
    const r = await create(leader, t, { changes, justification: 'ngắn quá' });
    expect([r.status, code(r)], JSON.stringify(r.body)).toEqual([400, 'JUSTIFICATION_REQUIRED']);
    expect(r.body.error.details.similarityCheck).toMatchObject({ status: 'OK', level: 'HIGH', justificationRequired: true });
    expect(await prisma.changeRequest.count({ where: { topicId: t.id } })).toBe(0);
    const ok = await create(leader, t, { changes, justification: longJustification });
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    expect(ok.body.changeRequest.similarityCheck).toMatchObject({ level: 'HIGH', justification: longJustification });
  });

  it('FR06 lỗi → 409 SIMILARITY_NOT_CHECKED, không bao giờ coi là không trùng, KHÔNG tạo yêu cầu; lưu dòng ERROR', async () => {
    const { t, leader } = await mkGroup();
    const r = await create(leader, t, { changes: { summary: 'một hai ba bốn năm sáu bảy tám chín mười' } }, broken);
    expect([r.status, code(r)]).toEqual([409, 'SIMILARITY_NOT_CHECKED']);
    expect(r.body.error.details.similarityCheck).toMatchObject({ status: 'ERROR', level: null, matches: [] });
    expect(JSON.stringify(r.body)).not.toContain('boom');
    expect(await prisma.changeRequest.count({ where: { topicId: t.id } })).toBe(0);
    expect(await prisma.similarityCheck.count({ where: { topicId: t.id, status: 'ERROR' } })).toBe(1);
    // chỉ đổi objectives: không chạy FR06 nên kho so lỗi không ảnh hưởng
    expect((await create(leader, t, { changes: { objectives: OBJ } }, broken)).status).toBe(201);
  });
});

describe('FR18 – kiểm lại khi duyệt (§6.4)', () => {
  it('nội dung đổi sau khi tạo → 409 STALE_CHANGE_REQUEST; tham số đợt tăng → 409 TOPIC_INCOMPLETE; trạng thái đổi → 409 TOPIC_NOT_IN_PROGRESS; yêu cầu vẫn PENDING', async () => {
    const staff = await mkUser('STAFF');
    const a = await mkGroup();
    const idA = (await create(a.leader, a.t, { changes: { objectives: OBJ } })).body.changeRequest.id;
    await prisma.topic.update({ where: { id: a.t.id }, data: { objectives: 'Mục tiêu do thay đổi khác ghi đè' } });
    expect(code(await approve(staff, idA))).toBe('STALE_CHANGE_REQUEST');

    const round = await mkRound(S.F1.id, 'Đợt T605 tăng tham số');
    const b = await mkGroup({ round });
    const idB = (await create(b.leader, b.t, { changes: { objectives: OBJ } })).body.changeRequest.id;
    await prisma.round.update({ where: { id: round.id }, data: { config: { minSummaryWords: 50, minKeywords: 1 } } });
    const rb = await approve(staff, idB);
    expect([rb.status, code(rb)]).toEqual([409, 'TOPIC_INCOMPLETE']);

    const c = await mkGroup();
    const idC = (await create(c.leader, c.t, { changes: { objectives: OBJ } })).body.changeRequest.id;
    await prisma.topic.update({ where: { id: c.t.id }, data: { status: 'WAITING_CLOSE' } });
    expect(code(await approve(staff, idC))).toBe('TOPIC_NOT_IN_PROGRESS');

    for (const [id, x] of [[idA, a], [idB, b], [idC, c]]) {
      expect((await prisma.changeRequest.findUnique({ where: { id } })).status).toBe('PENDING');
      expect((await topic(x.t)).version).toBe(0);
    }
    expect(await prisma.auditLog.count({ where: { action: 'TOPIC_CHANGE_APPLY', entityId: { in: [a.t.id, b.t.id, c.t.id] } } })).toBe(0);
  });
});

describe('FR18 – thêm thành viên (§6.2–6.4; ca 4, 5)', () => {
  it('ca 4: SV đồng ý → duyệt: thành viên mới, MEMBER_ADD, CHANGE_DECIDED gửi cả người mới', async () => {
    const { t, leader } = await mkGroup();
    const staff = await mkUser('STAFF');
    const x = await mkUser('STUDENT');
    const c = await create(leader, t, { addMemberCode: U[x].code.toUpperCase() });
    expect(c.status, JSON.stringify(c.body)).toBe(201);
    expect(c.body.changeRequest).toMatchObject({ stage: 'TARGET', target: { id: U[x].id }, payload: { before: {}, after: {}, addMember: { userId: U[x].id, code: U[x].code, fullName: U[x].fullName } } });
    expect(await prisma.notification.count({ where: { userId: U[x].id, dedupeKey: `CHANGE_TARGET_INVITED:${c.body.changeRequest.id}` } })).toBe(1);
    const id = c.body.changeRequest.id;
    expect(code(await approve(staff, id))).toBe('CHANGE_NOT_READY');
    // SV đích xem yêu cầu qua ChangeRequestView (tên hiện tại), không xem chi tiết đề tài (MINOR m1 T600)
    const v = await get(x, `/api/change-requests/${id}`);
    expect([v.status, v.body.changeRequest.topic.title, v.body.changeRequest.availableActions]).toEqual([200, t.title, ['ACCEPT', 'DECLINE']]);
    expect((await get(x, `/api/topics/${t.id}`)).status).toBe(403);
    expect((await accept(x, id)).status).toBe(200);
    const a = await approve(staff, id);
    expect(a.status, JSON.stringify(a.body)).toBe(200);
    expect(a.body.topic.members.map((m) => m.userId)).toEqual([U[leader].id, U[x].id]);
    expect((await topic(t)).version).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'MEMBER_ADD', entityId: t.id } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: U[x].id, dedupeKey: `CHANGE_DECIDED:${id}`, link: `/de-tai/${t.id}/yeu-cau` } })).toBe(1);
    expect((await get(x, `/api/topics/${t.id}`)).status).toBe(200);
  });

  it('ca 4: SV không hợp lệ 400; nhóm đủ max lúc tạo/lúc duyệt 409 GROUP_FULL; SV đã có đề tài hoạt động lúc đồng ý/lúc duyệt 409 STUDENT_TOPIC_LIMIT; lỗi thì yêu cầu vẫn PENDING', async () => {
    const staff = await mkUser('STAFF');
    const round = await mkRound(S.F1.id, 'Đợt T605 max 2', { maxMembers: 2 });
    const { t, leader } = await mkGroup({ round });
    const locked = await mkUser('STUDENT', { isLocked: true });
    const otherFaculty = await mkUser('STUDENT', { facultyId: S.F2.id });
    for (const bad of ['khong-ton-tai', U[locked].code, U[otherFaculty].code, U[leader].code, 'lecA']) {
      const r = await create(leader, t, { addMemberCode: bad });
      expect([r.status, r.body.error?.details], bad).toEqual([400, { addMemberCode: 'Không tìm thấy sinh viên phù hợp' }]);
    }
    // Lúc duyệt nhóm đã đủ max (thành viên vào bằng đường khác)
    const x = await mkUser('STUDENT');
    const id = (await create(leader, t, { addMemberCode: U[x].code })).body.changeRequest.id;
    await accept(x, id);
    const y = await mkUser('STUDENT');
    await addMember(t, y);
    expect(code(await approve(staff, id))).toBe('GROUP_FULL');
    expect((await prisma.changeRequest.findUnique({ where: { id } })).status).toBe('PENDING');
    expect(await prisma.topicMember.count({ where: { topicId: t.id, userId: U[x].id } })).toBe(0);
    await post(leader, `/api/change-requests/${id}/withdraw`);
    expect(code(await create(leader, t, { addMemberCode: U[x].code }))).toBe('GROUP_FULL'); // kiểm sớm lúc tạo

    // STUDENT_TOPIC_LIMIT lúc đồng ý (đã có đề tài hoạt động) và lúc duyệt (có đề tài hoạt động sau khi đồng ý)
    const g = await mkGroup();
    const z = await mkUser('STUDENT');
    await mkTopic(z, S.round, { status: 'IN_PROGRESS' });
    const idZ = (await create(g.leader, g.t, { addMemberCode: U[z].code })).body.changeRequest.id;
    const rz = await accept(z, idZ);
    expect([rz.status, code(rz), rz.body.error.details]).toEqual([409, 'STUDENT_TOPIC_LIMIT', { codes: [U[z].code] }]);
    expect((await prisma.changeRequest.findUnique({ where: { id: idZ } })).targetAcceptedAt).toBeNull();
    await post(g.leader, `/api/change-requests/${idZ}/withdraw`);
    const w = await mkUser('STUDENT');
    const idW = (await create(g.leader, g.t, { addMemberCode: U[w].code })).body.changeRequest.id;
    expect((await accept(w, idW)).status).toBe(200);
    await mkTopic(w, S.round, { status: 'WAITING_ADVISOR' });
    expect(code(await approve(staff, idW))).toBe('STUDENT_TOPIC_LIMIT');
    expect((await prisma.changeRequest.findUnique({ where: { id: idW } })).status).toBe('PENDING');
    expect(await activeCount(w)).toBe(1);
  });

  it('ca 5 đồng thời: duyệt thêm X ‖ đề tài khác của X gửi REQUEST_ADVISOR (maxActiveTopicsPerStudent = 1) – X có tối đa một đề tài hoạt động', async () => {
    for (let i = 0; i < 3; i++) {
      const staff = await mkUser('STAFF');
      const { t, leader } = await mkGroup();
      const x = await mkUser('STUDENT');
      const b = await mkTopic(x, S.round); // DRAFT, X là trưởng nhóm
      const id = (await create(leader, t, { addMemberCode: U[x].code })).body.changeRequest.id;
      expect((await accept(x, id)).status).toBe(200);
      const lec = await mkUser('LECTURER');
      const [ra, rb] = await Promise.all([approve(staff, id), post(x, `/api/topics/${b.id}/actions`, { action: 'REQUEST_ADVISOR', lecturerId: U[lec].id, version: 0 })]);
      expect([ra.status, rb.status].filter((s) => s === 200), JSON.stringify([ra.body, rb.body])).toHaveLength(1);
      expect([ra, rb].find((r) => r.status !== 200).body.error.code).toBe('STUDENT_TOPIC_LIMIT');
      expect(await activeCount(x)).toBe(1);
    }
  });
});

describe('FR18 – đồng thời và quyền (ca 6, 7)', () => {
  it('ca 6: hai cán bộ duyệt cùng lúc → một 200, một 409 CHANGE_REQUEST_CLOSED; nội dung đổi đúng một lần', async () => {
    const { t, leader } = await mkGroup();
    const [s1, s2] = [await mkUser('STAFF'), await mkUser('STAFF')];
    const id = (await create(leader, t, { changes: { objectives: OBJ } })).body.changeRequest.id;
    const rs = await Promise.all([approve(s1, id), approve(s2, id)]);
    expect(rs.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(code(rs.find((r) => r.status === 409))).toBe('CHANGE_REQUEST_CLOSED');
    expect((await topic(t)).version).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'TOPIC_CHANGE_APPLY', entityId: t.id } })).toBe(1);
  });

  it('ca 7: không phải trưởng nhóm / GV / cán bộ / ADMIN tạo 403; trạng thái khác IN_PROGRESS 409; cán bộ khoa khác duyệt 403', async () => {
    const { t, leader, ms: [m], lec } = await mkGroup({ k: 1 });
    const staff = await mkUser('STAFF');
    for (const who of [m, lec, staff, 'staff2', 'sF2']) expect((await create(who, t, { changes: { objectives: OBJ } })).status, who).toBe(403);
    expect((await create('admin', t, { changes: { objectives: OBJ } })).status).toBe(403);
    for (const status of ['HAS_ADVISOR', 'UNDER_REVIEW', 'WAITING_CLOSE', 'CLOSED']) {
      const g = await mkGroup({ status });
      expect((await get(g.leader, `/api/topics/${g.t.id}`)).body.topic.permissions.requestTopicChange, status).toBe(false);
      const r = await create(g.leader, g.t, { changes: { objectives: OBJ } });
      expect([r.status, code(r)], status).toEqual([409, 'TOPIC_NOT_IN_PROGRESS']);
    }
    const id = (await create(leader, t, { changes: { objectives: OBJ } })).body.changeRequest.id;
    for (const who of ['staff2', m, lec, 'admin']) expect((await approve(who, id)).status, who).toBe(403);
    expect((await prisma.changeRequest.findUnique({ where: { id } })).status).toBe('PENDING');
    expect(await prisma.similarityCheck.count({ where: { topicId: t.id } })).toBe(0);
  });
});

describe('m1 T603-bao-mat: người không còn quan hệ không thấy tên hiện tại (FR18, §5.4)', () => {
  it('người đã rời thấy tên snapshot trong khoảng của họ (hoặc null), không thấy tên mới sau FR18; thành viên hiện hành thấy tên mới', async () => {
    const { t, leader, ms: [m, m2], lec } = await mkGroup({ k: 2 });
    const staff = await mkUser('STAFF');
    // snapshot seq 1 khi m, m2 còn là thành viên
    const sub = await prisma.submission.create({ data: { topicId: t.id, seq: 1, createdById: U[leader].id, payload: { title: 'Tên lúc còn trong nhóm', summary: 's', objectives: 'o', keywords: ['k'], documentIds: [] } } });
    const leaveIds = [];
    for (const who of [m, m2]) {
      const c = await post(who, `/api/topics/${t.id}/change-requests`, { type: 'LEAVE_GROUP', reason: REASON });
      expect(c.status, JSON.stringify(c.body)).toBe(201);
      expect((await approve(staff, c.body.changeRequest.id)).status).toBe(200);
      leaveIds.push(c.body.changeRequest.id);
    }
    // m2: snapshot duy nhất nằm ngoài khoảng của m2 → null
    await prisma.topicMember.updateMany({ where: { topicId: t.id, userId: U[m2].id }, data: { joinedAt: new Date(sub.createdAt.getTime() + 1) } });
    const newTitle = `Tên mới sau thay đổi ${CONTENT().title}`;
    const c = await create(leader, t, { changes: { title: newTitle } });
    expect(c.status, JSON.stringify(c.body)).toBe(201);
    expect((await approve(staff, c.body.changeRequest.id)).status).toBe(200);
    expect((await topic(t)).title).toBe(newTitle);

    const one = await get(m, `/api/change-requests/${leaveIds[0]}`);
    expect([one.status, one.body.changeRequest.topic]).toEqual([200, { id: t.id, code: t.code, title: 'Tên lúc còn trong nhóm' }]);
    const list = await get(m, '/api/change-requests');
    expect(list.body.items.map((x) => x.topic.title)).toEqual(['Tên lúc còn trong nhóm']);
    expect(JSON.stringify(list.body)).not.toContain(newTitle);
    expect((await get(m2, `/api/change-requests/${leaveIds[1]}`)).body.changeRequest.topic.title).toBeNull();
    // Người có quan hệ hiện hành thấy tên mới
    for (const who of [leader, lec, staff]) {
      expect((await get(who, `/api/change-requests/${leaveIds[0]}`)).body.changeRequest.topic.title, who).toBe(newTitle);
    }
  });

  it('GV cũ không được cấp quyền đọc → null; được cấp → tên hiện tại; SV đích đã từ chối → null', async () => {
    const { t, leader, lec } = await mkGroup();
    const staff = await mkUser('STAFF');
    const lec2 = await mkUser('LECTURER');
    const c = await post(leader, `/api/topics/${t.id}/change-requests`, { type: 'ADVISOR_CHANGE', reason: REASON, newLecturerId: U[lec2].id });
    const id = c.body.changeRequest.id;
    await accept(lec2, id);
    expect((await approve(staff, id)).status).toBe(200);
    expect((await get(lec, `/api/change-requests/${id}`)).body.changeRequest.topic.title).toBeNull();
    expect((await request(app).put(`/api/topics/${t.id}/former-advisors/${U[lec].id}/read-access`).set(as(staff)).send({ granted: true, reason: 'Cho phép đọc lại' })).status).toBe(200);
    expect((await get(lec, `/api/change-requests/${id}`)).body.changeRequest.topic.title).toBe(t.title);
    const x = await mkUser('STUDENT');
    const idX = (await create(leader, t, { addMemberCode: U[x].code })).body.changeRequest.id;
    expect((await get(x, `/api/change-requests/${idX}`)).body.changeRequest.topic.title).toBe(t.title);
    const d = await decline(x, idX, { reason: 'Em không tham gia được' });
    expect([d.status, d.body.changeRequest.topic.title]).toEqual([200, null]);
    expect((await get(x, '/api/change-requests')).body.items.map((i) => i.topic.title)).toEqual([null]);
  });
});

describe('G45 – PATCH đợt làm đề tài kẹt (§10, INFO 12)', () => {
  it('tăng minSummaryWords khi có đề tài HAS_ADVISOR/WAITING_ADVISOR không còn đạt → 409 kèm mã, không ghi; vẫn đạt → 200; chỉ đổi tham số khác → 200', async () => {
    const round = await mkRound(S.F1.id, 'Đợt T605 G45');
    const has = await mkGroup({ status: 'HAS_ADVISOR', round }); // tóm tắt 8 từ, 1 từ khóa
    const waiting = await mkGroup({ status: 'WAITING_ADVISOR', round });
    for (const status of ['DRAFT', 'NEEDS_REVISION', 'UNDER_REVIEW', 'IN_PROGRESS']) await mkGroup({ status, round }); // không chặn
    const url = `/api/rounds/${round.id}`;
    const r = await patch('staff1', url, { config: { minSummaryWords: 20, minKeywords: 1 } });
    expect([r.status, code(r)]).toEqual([409, 'ROUND_CONFIG_BLOCKS_TOPICS']);
    expect([[...r.body.error.details.codes].sort(), r.body.error.details.total]).toEqual([[has.t.code, waiting.t.code].sort(), 2]);
    expect(r.body.error.message).toContain('2 đề tài');
    expect((await prisma.round.findUnique({ where: { id: round.id } })).config).toEqual({ minSummaryWords: 3, minKeywords: 1 });
    expect(await prisma.auditLog.count({ where: { action: 'ROUND_UPDATE', entityId: round.id } })).toBe(0);
    expect(code(await patch('staff1', url, { config: { minSummaryWords: 3, minKeywords: 2 } }))).toBe('ROUND_CONFIG_BLOCKS_TOPICS');
    // vẫn đạt
    const ok = await patch('staff1', url, { config: { minSummaryWords: 8, minKeywords: 1 } });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    // tham số khác, tham số hồ sơ giữ nguyên → không quét
    const ok2 = await patch('staff1', url, { config: { minSummaryWords: 8, minKeywords: 1, maxFileSizeMB: 5 } });
    expect([ok2.status, ok2.body.round?.effectiveConfig.maxFileSizeMB], JSON.stringify(ok2.body)).toEqual([200, 5]);
    expect((await patch('staff1', url, { name: 'Đổi tên đợt' })).status).toBe(200);
  });

  it('đề tài đã không đạt từ trước không chặn việc nới tham số; quá 50 đề tài chỉ trả 50 mã + total', async () => {
    const round = await mkRound(S.F1.id, 'Đợt T605 G45 nới', { minSummaryWords: 3 });
    const stuck = await mkGroup({ status: 'HAS_ADVISOR', round });
    await prisma.topic.update({ where: { id: stuck.t.id }, data: { summary: 'một' } }); // không đạt cả cấu hình cũ lẫn mới
    expect((await patch('staff1', `/api/rounds/${round.id}`, { config: { minSummaryWords: 2, minKeywords: 1 } })).status).toBe(200);
    const big = await mkRound(S.F1.id, 'Đợt T605 G45 lớn');
    const leader = await mkUser('STUDENT');
    for (let i = 0; i < 51; i++) await mkTopic(leader, big, { status: 'HAS_ADVISOR' });
    const r = await patch('staff1', `/api/rounds/${big.id}`, { config: { minSummaryWords: 100, minKeywords: 1 } });
    expect([r.status, r.body.error.details.codes.length, r.body.error.details.total]).toEqual([409, 50, 51]);
  });
});
