// TASK-DC-09 (FR36, FR37, FR27 – API_GD7 §1.1, §1.2, §7): chấm điểm (PUT my-score), chốt (finalize, COUNCIL_FINALIZE),
// AssignmentView ẩn điểm trước chốt, TopicDetail.defense/councilAccess. Test bắt buộc GD7 §7.6 #1–#11 (TC-FR36/37-xx),
// MINOR m1 BM DC-07 (trigger), m1/m2 BM DC-08 (đọc thành viên sau khóa Council; limiter dùng chung). DB test thật trừ khối unit.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { defenseScoreSchema, defenseFinalizeSchema } from '@nckh/shared';
import { prisma, S, U, tok, seedBase, mkTopic, as, at } from './t214-kit.js';
import { createApp } from '../src/app.js';
import { createAuthRepo } from '../src/modules/auth/prismaRepo.js';
import { createTopicRepo } from '../src/modules/topics/prismaRepo.js';
import { signAccessToken } from '../src/lib/tokens.js';
import { fakeHasher, testEnv } from './helpers.js';

const code = (r) => r.body.error?.code;
const MINUTES = 'Biên bản: đề tài đáp ứng yêu cầu nghiệm thu của hội đồng.';
const COMMENT = 'Nhận xét của thành viên hội đồng.';
// App mới mỗi test: limiter đếm trong bộ nhớ của app
let app;
beforeEach(() => { app = createApp({ env: testEnv, logger: undefined, authRepo: createAuthRepo(prisma), hasher: fakeHasher, topicRepo: createTopicRepo(prisma) }); });
const call = (m, who, url, body = {}) => request(app)[m](url).set(as(who)).send(body);
const get = (who, url) => request(app).get(url).set(as(who));
const score = (who, a, value, comment = COMMENT) => call('put', who, `/api/council-assignments/${a.id}/my-score`, { score: value, comment });
const finalize = (who, a, body = {}) => call('post', who, `/api/council-assignments/${a.id}/finalize`, { version: 0, minutes: MINUTES, ...body });
const view = (who, a) => get(who, `/api/council-assignments/${a.id}`);
const topic = async (who, t) => (await get(who, `/api/topics/${t.id}`)).body.topic;
const COUNCIL = { lecB: 'CHAIR', lecC: 'SECRETARY', lecD: 'MEMBER' };

let council;
let seq = 0;
// Đề tài Chờ bảo vệ (GVHD lecA, mốc Đạt, điểm quá trình 7.25), gán cho `council` (lecB CT, lecC TK, lecD UV)
const mkAssigned = async ({ c = council, assign = true } = {}) => {
  const leader = `s${++seq}`;
  const t = await mkTopic(leader, S.round, { status: 'WAITING_DEFENSE' });
  await prisma.advising.create({ data: { topicId: t.id, lecturerId: U.lecA.id } });
  await prisma.milestone.create({ data: { topicId: t.id, order: 1, name: 'Mốc 1', output: 'PDF', dueAt: at(5), evaluation: 'PASSED', createdById: U.lecA.id } });
  await prisma.processScore.create({ data: { topicId: t.id, lecturerId: U.lecA.id, score: '7.25', comment: 'Nhóm làm việc chăm chỉ, đủ điều kiện ra hội đồng.' } });
  const a = assign ? await prisma.councilAssignment.create({ data: { councilId: c.id, topicId: t.id, assignedById: U.staff1.id } }) : null;
  return { t, a, leader };
};
const seedScores = (a, pairs) => prisma.defenseScore.createMany({ data: Object.entries(pairs).map(([who, s]) => ({ assignmentId: a.id, memberId: U[who].id, score: s, comment: COMMENT })) });
const mkCouncil = (ms, name = 'Hội đồng CNPM 1') => prisma.council.create({
  data: { code: `HD-T-${++seq}`, name, facultyId: S.F1.id, roundId: S.round.id, createdById: U.staff1.id, members: { create: Object.entries(ms).map(([k, role]) => ({ lecturerId: U[k].id, role })) } },
});

beforeAll(async () => {
  await seedBase({ students: 60 });
  for (const k of ['lecD', 'lecE']) {
    U[k] = await prisma.user.create({ data: { code: k, email: `${k}@t.vn`, fullName: `Tên ${k}`, passwordHash: 'x', role: 'LECTURER', mustChangePassword: false, facultyId: S.F1.id } });
    tok[k] = signAccessToken(U[k], { secret: testEnv.JWT_ACCESS_SECRET, ttlSeconds: 600 });
  }
  council = await mkCouncil(COUNCIL);
}, 60000);
afterAll(() => prisma.$disconnect());

describe('Unit – schema chấm/chốt (shared)', () => {
  it('TC-FR36-01 (§7.6 #8) điểm 11 / -1 / 7.333 / "8" → lỗi tại score; 0, 10, 7.25 hợp lệ; nhận xét 10..5000', () => {
    const err = (b) => { const r = defenseScoreSchema.safeParse(b); return r.success ? null : r.error.issues.map((i) => i.path.join('.')); };
    for (const s of [11, -1, 7.333, '8']) expect(err({ score: s, comment: COMMENT }), String(s)).toEqual(['score']);
    for (const s of [0, 10, 7.25]) expect(err({ score: s, comment: COMMENT })).toBeNull();
    expect(err({ score: 8, comment: 'ngắn' })).toEqual(['comment']);
    expect(err({ score: 8, comment: COMMENT, x: 1 })).not.toBeNull();
    expect(defenseFinalizeSchema.safeParse({ version: 0, minutes: 'ngắn quá' }).success).toBe(false);
    expect(defenseFinalizeSchema.safeParse({ version: 0, minutes: MINUTES }).success).toBe(true);
  });
});

describe('§7.3 chấm điểm – PUT my-score', () => {
  it('TC-FR36-02 thành viên chấm: 200 AssignmentView, sửa điểm (upsert), AuditLog DEFENSE_SCORE_SET before/after không ghi nhận xét, không thông báo', async () => {
    const { a } = await mkAssigned();
    const notes = await prisma.notification.count();
    const r = await score('lecD', a, 7.5);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.assignment).toMatchObject({ id: a.id, myRole: 'MEMBER', myScore: { score: '7.50', comment: COMMENT }, scoredCount: 1, memberCount: 3, scores: [], availableActions: ['SCORE'] });
    const r2 = await score('lecD', a, 6, 'Đã xem lại báo cáo, hạ điểm.');
    expect(r2.body.assignment.myScore).toMatchObject({ score: '6.00', comment: 'Đã xem lại báo cáo, hạ điểm.' });
    expect(await prisma.defenseScore.count({ where: { assignmentId: a.id } })).toBe(1);
    const logs = await prisma.auditLog.findMany({ where: { action: 'DEFENSE_SCORE_SET', actorId: U.lecD.id, after: { path: ['assignmentId'], equals: a.id } }, orderBy: [{ at: 'asc' }, { id: 'asc' }] });
    expect(logs.map((l) => [l.before, l.after.score])).toEqual([[null, '7.50'], [{ score: '7.50' }, '6.00']]);
    expect(JSON.stringify(logs.map((l) => [l.before, l.after]))).not.toContain('hạ điểm');
    expect(await prisma.notification.count()).toBe(notes);
  });

  it('TC-FR36-03 (§7.6 #8) điểm 11 / -1 / 7.333 qua API → 400 VALIDATION_ERROR tại score, không lưu', async () => {
    const { a } = await mkAssigned();
    for (const s of [11, -1, 7.333]) {
      const r = await score('lecD', a, s);
      expect([r.status, code(r), Object.keys(r.body.error.details)], String(s)).toEqual([400, 'VALIDATION_ERROR', ['score']]);
    }
    expect(await prisma.defenseScore.count({ where: { assignmentId: a.id } })).toBe(0);
  });

  it('TC-FR36-04 phân công đã hủy / đã chốt → 409 ASSIGNMENT_DECIDED; đề tài không Chờ bảo vệ → 409 NOT_WAITING_DEFENSE; id lạ → 404', async () => {
    const { a } = await mkAssigned();
    await prisma.councilAssignment.update({ where: { id: a.id }, data: { cancelledAt: new Date(), cancelReason: 'Hủy để kiểm thử' } });
    const r = await score('lecD', a, 8);
    expect([r.status, code(r), r.body.error.message]).toEqual([409, 'ASSIGNMENT_DECIDED', 'Phân công đã bị hủy']);
    const { a: d } = await mkAssigned();
    await prisma.councilAssignment.update({ where: { id: d.id }, data: { decidedAt: new Date(), decidedById: U.lecC.id, finalScore: 7, decision: 'PASSED', minutes: MINUTES } });
    expect(code(await score('lecD', d, 8))).toBe('ASSIGNMENT_DECIDED');
    const { t, a: w } = await mkAssigned();
    await prisma.topic.update({ where: { id: t.id }, data: { status: 'IN_PROGRESS' } });
    expect(code(await score('lecD', w, 8))).toBe('NOT_WAITING_DEFENSE');
    expect((await score('lecD', { id: 'khong-co' }, 8)).status).toBe(404);
  });

  it('TC-FR36-05 (§7.6 #9) SV, GVHD, GV ngoài HĐ, cán bộ, ADMIN gọi my-score → 403, không lưu điểm', async () => {
    const { a, leader } = await mkAssigned();
    for (const who of [leader, 'lecA', 'lecE', 'staff1', 'admin']) expect((await score(who, a, 8)).status, who).toBe(403);
    expect(await prisma.defenseScore.count({ where: { assignmentId: a.id } })).toBe(0);
  });

  it('TC-FR36-06 limiter my-score 60/15 phút/user → lần thứ 61 nhận 429', async () => {
    const { a } = await mkAssigned();
    for (let i = 0; i < 60; i++) expect((await score('lecD', a, 11)).status).toBe(400);
    expect(code(await score('lecD', a, 8))).toBe('RATE_LIMITED');
  });
});

describe('§7.1, §7.2 đọc phân công', () => {
  it('TC-FR36-07 (§7.6 #7) ủy viên đọc trước chốt: scores [] (chỉ myScore, scoredCount); chủ tịch, cán bộ thấy đủ; sau chốt mọi thành viên thấy đủ', async () => {
    const { a } = await mkAssigned();
    await seedScores(a, { lecB: 8, lecC: 7 });
    expect((await score('lecD', a, 6)).status).toBe(200);
    const m = (await view('lecD', a)).body.assignment;
    expect(m).toMatchObject({ myRole: 'MEMBER', scores: [], myScore: { score: '6.00' }, scoredCount: 3, memberCount: 3, processScore: { score: '7.25' }, topic: { status: 'WAITING_DEFENSE', advisor: { fullName: U.lecA.fullName } } });
    const chair = (await view('lecB', a)).body.assignment;
    expect([chair.myRole, chair.availableActions]).toEqual(['CHAIR', ['SCORE', 'FINALIZE']]);
    expect(chair.scores.map((s) => [s.member.role, s.member.fullName, s.score])).toEqual([['CHAIR', U.lecB.fullName, '8.00'], ['SECRETARY', U.lecC.fullName, '7.00'], ['MEMBER', U.lecD.fullName, '6.00']]);
    const staff = (await view('staff1', a)).body.assignment;
    expect([staff.myRole, staff.scores.length, staff.availableActions, staff.myScore]).toEqual([null, 3, [], null]);
    expect((await finalize('lecC', a)).status).toBe(200);
    const after = (await view('lecD', a)).body.assignment;
    expect([after.scores.length, after.finalScore, after.decision, after.minutes, after.decidedBy, after.availableActions]).toEqual([3, '7.00', 'PASSED', MINUTES, { fullName: U.lecC.fullName }, []]);
  });

  it('TC-FR36-08 GET /api/council-assignments: GV thấy phân công hội đồng mình, lọc status; cán bộ theo khoa; GV ngoài/cán bộ khoa khác rỗng; SV/ADMIN 403; xem chi tiết người ngoài 403', async () => {
    const c2 = await mkCouncil({ lecE: 'CHAIR', lecC: 'SECRETARY', lecB: 'MEMBER' }, 'Hội đồng riêng');
    const { a } = await mkAssigned({ c: c2 });
    const { a: closed } = await mkAssigned({ c: c2 });
    await prisma.councilAssignment.update({ where: { id: closed.id }, data: { decidedAt: new Date(), decidedById: U.lecE.id, finalScore: 8, decision: 'PASSED', minutes: MINUTES } });
    const ids = async (who, qs = '') => (await get(who, `/api/council-assignments?pageSize=100${qs}`)).body.items.map((x) => x.id);
    expect(await ids('lecE')).toEqual([a.id, closed.id]);
    expect(await ids('lecE', '&status=OPEN')).toEqual([a.id]);
    expect(await ids('lecE', '&status=DECIDED')).toEqual([closed.id]);
    expect(await ids('lecE', '&status=CANCELLED')).toEqual([]);
    expect(await ids('lecD')).not.toContain(a.id);
    expect(await ids('staff1')).toEqual(expect.arrayContaining([a.id, closed.id]));
    expect(await ids('staff2')).toEqual([]);
    for (const who of ['s1', 'admin']) expect((await get(who, '/api/council-assignments')).status, who).toBe(403);
    expect((await get('lecE', '/api/council-assignments?status=ABC')).status).toBe(400);
    for (const who of ['lecD', 'lecA', 'staff2', 'admin', 's1']) expect((await view(who, a)).status, who).toBe(403);
    expect((await view('lecE', { id: 'khong-co' })).status).toBe(404);
    // m1 BM DC-09 (G62): phân công đã hủy → thành viên/chủ tịch 403, cán bộ trong phạm vi vẫn 200
    await prisma.councilAssignment.update({ where: { id: a.id }, data: { cancelledAt: new Date(), cancelReason: 'Hủy để kiểm thử' } });
    for (const who of ['lecE', 'lecC', 'lecB']) expect((await view(who, a)).status, who).toBe(403);
    const sv = await view('staff1', a);
    expect([sv.status, !!sv.body.assignment.cancelledAt]).toEqual([200, true]);
    // đề tài CLOSED + phân công đã chốt: thành viên vẫn đọc nhưng không thấy điểm quá trình; cán bộ vẫn thấy
    await prisma.topic.update({ where: { id: closed.topicId }, data: { status: 'CLOSED' } });
    const cm = await view('lecE', closed), cs = await view('staff1', closed);
    expect([cm.status, cm.body.assignment.processScore]).toEqual([200, null]);
    expect(cs.body.assignment.processScore).toMatchObject({ score: '7.25' });
  });
});

describe('§7.4 chốt – POST finalize', () => {
  it('TC-FR37-01 (§7.6 #1, #10) 3 thành viên chấm 8 / 7.5 / 6.75 → thư ký chốt: 7.42 PASSED, GOOD nguồn COUNCIL, WAITING_CLOSE; cán bộ CONFIRM_CLOSE → CLOSED, vào kho', async () => {
    const { t, a, leader } = await mkAssigned();
    for (const [who, s] of [['lecB', 8], ['lecC', 7.5], ['lecD', 6.75]]) expect((await score(who, a, s)).status).toBe(200);
    const r = await finalize('lecC', a);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.assignment).toMatchObject({ finalScore: '7.42', decision: 'PASSED', minutes: MINUTES, decidedBy: { fullName: U.lecC.fullName }, availableActions: [] });
    expect(r.body.topic).toMatchObject({ status: 'WAITING_CLOSE', version: 1, currentResult: { result: 'GOOD', source: 'COUNCIL', version: 1 }, councilAccess: { assignmentId: a.id, role: 'SECRETARY' } });
    const rv = await prisma.resultVersion.findMany({ where: { topicId: t.id } });
    expect(rv.map((x) => [x.result, x.source, x.isCurrent, x.summary, x.createdById])).toEqual([['GOOD', 'COUNCIL', true, MINUTES, U.lecC.id]]);
    expect((await prisma.councilAssignment.findUnique({ where: { id: a.id } })).finalScore.toFixed(2)).toBe('7.42');
    const sh = await prisma.statusHistory.findMany({ where: { topicId: t.id } });
    expect(sh.map((h) => [h.action, h.from, h.to, h.actorId])).toEqual([['COUNCIL_FINALIZE', 'WAITING_DEFENSE', 'WAITING_CLOSE', U.lecC.id]]);
    const audit = await prisma.auditLog.findFirst({ where: { action: 'COUNCIL_FINALIZE', entityId: a.id } });
    expect(audit.after).toMatchObject({ finalScore: '7.42', decision: 'PASSED', result: 'GOOD', status: 'WAITING_CLOSE' });
    expect(await prisma.auditLog.count({ where: { action: 'RESULT_CREATE', actorId: U.lecC.id, entityId: rv[0].id } })).toBe(1);
    const n = (who, type) => prisma.notification.count({ where: { userId: U[who].id, type, link: `/de-tai/${t.id}` } });
    expect([await n(leader, 'DEFENSE_DECIDED'), await n('lecA', 'DEFENSE_DECIDED'), await n('lecB', 'DEFENSE_DECIDED'), await n('lecD', 'DEFENSE_DECIDED'), await n('lecC', 'DEFENSE_DECIDED')]).toEqual([1, 1, 1, 1, 0]);
    expect(await prisma.notification.count({ where: { userId: U.staff1.id, type: 'CLOSE_REQUESTED', dedupeKey: `CLOSE_REQUESTED:${t.id}:v1` } })).toBe(1);
    // SV xem kết quả bảo vệ (UC07): defense DECIDED có điểm từng thành viên
    const st = await topic(leader, t);
    expect(st.defense).toMatchObject({ assignmentId: a.id, state: 'DECIDED', finalScore: '7.42', decision: 'PASSED', council: { code: council.code, name: council.name } });
    expect(st.defense.scores.map((s) => s.score)).toEqual(['8.00', '7.50', '6.75']);
    expect(st.councilAccess).toBeNull();
    // #10: GVHD chưa nhập kết quả – cán bộ đóng bằng kết quả hội đồng
    const close = await call('post', 'staff1', `/api/topics/${t.id}/actions`, { action: 'CONFIRM_CLOSE', version: 1 });
    expect(close.status, JSON.stringify(close.body)).toBe(200);
    expect(close.body.topic.status).toBe('CLOSED');
    expect((await get(leader, `/api/repository/${t.code}`)).status).toBe(200);
  });

  it('TC-FR37-02 (§7.6 #2) trung bình 4.99 → FAILED, kết quả FAIL; đóng → không vào kho', async () => {
    const { t, a } = await mkAssigned();
    await seedScores(a, { lecB: 5, lecC: 4.99, lecD: 4.98 });
    const r = await finalize('lecB', a);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect([r.body.assignment.finalScore, r.body.assignment.decision, r.body.topic.currentResult.result]).toEqual(['4.99', 'FAILED', 'FAIL']);
    expect((await call('post', 'staff1', `/api/topics/${t.id}/actions`, { action: 'CONFIRM_CLOSE', version: 1 })).status).toBe(200);
    expect((await get('s1', `/api/repository/${t.code}`)).status).toBe(404);
  });

  it('TC-FR37-03 quy đổi theo defenseGrades của đợt: 9.00 → EXCELLENT; 7.00 → GOOD; 5.00 → PASS (biên)', async () => {
    for (const [vals, want] of [[[9, 9, 9], 'EXCELLENT'], [[7, 7, 7], 'GOOD'], [[5, 5, 5], 'PASS']]) {
      const { a } = await mkAssigned();
      await seedScores(a, { lecB: vals[0], lecC: vals[1], lecD: vals[2] });
      const r = await finalize('lecC', a);
      expect([r.status, r.body.topic?.currentResult?.result], want).toEqual([200, want]);
    }
  });

  it('TC-FR37-04 (§7.6 #3) thiếu 1 điểm → 409 SCORES_INCOMPLETE có missing; ủy viên chốt → 403; sai version → CONCURRENT_UPDATE; không đổi gì', async () => {
    const { t, a } = await mkAssigned();
    await seedScores(a, { lecB: 8, lecC: 7 });
    const r = await finalize('lecC', a);
    expect([r.status, code(r), r.body.error.details]).toEqual([409, 'SCORES_INCOMPLETE', { missing: [{ fullName: U.lecD.fullName, role: 'MEMBER' }] }]);
    await seedScores(a, { lecD: 6 });
    expect((await finalize('lecD', a)).status).toBe(403);
    expect(code(await finalize('lecB', a, { version: 3 }))).toBe('CONCURRENT_UPDATE');
    expect((await prisma.topic.findUnique({ where: { id: t.id } })).status).toBe('WAITING_DEFENSE');
    expect(await prisma.resultVersion.count({ where: { topicId: t.id } })).toBe(0);
    expect((await prisma.councilAssignment.findUnique({ where: { id: a.id } })).decidedAt).toBeNull();
    // Chốt lại sau khi đã chốt → 409
    expect((await finalize('lecB', a)).status).toBe(200);
    expect(code(await finalize('lecC', a, { version: 1 }))).toBe('ASSIGNMENT_DECIDED');
  });

  it('TC-FR37-05 (§7.6 #9) SV, GVHD, GV ngoài HĐ, cán bộ, ADMIN gọi finalize → 403; minutes ngắn → 400', async () => {
    const { t, a, leader } = await mkAssigned();
    await seedScores(a, { lecB: 8, lecC: 7, lecD: 6 });
    for (const who of [leader, 'lecA', 'lecE', 'staff1', 'admin']) expect((await finalize(who, a)).status, who).toBe(403);
    expect(Object.keys((await finalize('lecC', a, { minutes: 'ngắn' })).body.error.details)).toEqual(['minutes']);
    expect((await prisma.topic.findUnique({ where: { id: t.id } })).status).toBe('WAITING_DEFENSE');
  });

  it('TC-FR37-06 kết quả GVHD đã có → hạ isCurrent, bản COUNCIL version 2 là hiện hành', async () => {
    const { t, a } = await mkAssigned();
    await prisma.resultVersion.create({ data: { topicId: t.id, version: 1, result: 'EXCELLENT', summary: 'Kết quả cũ', source: 'ADVISOR', createdById: U.lecA.id } });
    await seedScores(a, { lecB: 6, lecC: 6, lecD: 6 });
    expect((await finalize('lecC', a)).status).toBe(200);
    const rv = await prisma.resultVersion.findMany({ where: { topicId: t.id }, orderBy: { version: 'asc' } });
    expect(rv.map((x) => [x.version, x.result, x.source, x.isCurrent])).toEqual([[1, 'EXCELLENT', 'ADVISOR', false], [2, 'PASS', 'COUNCIL', true]]);
  });
});

describe('§7.6 đồng thời', () => {
  it('TC-FR37-07 (§7.6 #4) chủ tịch và thư ký chốt cùng lúc → đúng 1 thành công, bên kia 409; đúng 1 ResultVersion COUNCIL, 1 StatusHistory', async () => {
    for (let i = 0; i < 4; i++) {
      const { t, a } = await mkAssigned();
      await seedScores(a, { lecB: 8, lecC: 7, lecD: 6 });
      const rs = await Promise.all([finalize('lecB', a), finalize('lecC', a)]);
      expect(rs.map((r) => r.status).sort(), JSON.stringify(rs.map((r) => r.body))).toEqual([200, 409]);
      expect(['CONCURRENT_UPDATE', 'ASSIGNMENT_DECIDED', 'INVALID_TRANSITION']).toContain(code(rs.find((r) => r.status === 409)));
      expect(await prisma.resultVersion.count({ where: { topicId: t.id, source: 'COUNCIL' } })).toBe(1);
      expect(await prisma.statusHistory.count({ where: { topicId: t.id, action: 'COUNCIL_FINALIZE' } })).toBe(1);
    }
  });

  it('TC-FR37-08 (§7.6 #5) ủy viên sửa điểm ‖ thư ký chốt → điểm mới vào trung bình hoặc sửa nhận 409 ASSIGNMENT_DECIDED; finalScore = trung bình điểm trong DB', async () => {
    const seen = new Set();
    for (let i = 0; i < 5; i++) {
      const { a } = await mkAssigned();
      await seedScores(a, { lecB: 8, lecC: 7, lecD: 6 });
      const [s, f] = await Promise.all([score('lecD', a, 9), finalize('lecC', a)]);
      expect(f.status, JSON.stringify(f.body)).toBe(200);
      expect([200, 409], JSON.stringify(s.body)).toContain(s.status);
      if (s.status === 409) expect(code(s)).toBe('ASSIGNMENT_DECIDED');
      const db = await prisma.defenseScore.findMany({ where: { assignmentId: a.id } });
      const avg = Math.round((db.reduce((x, d) => x + Number(d.score), 0) / 3) * 100) / 100;
      expect(Number((await prisma.councilAssignment.findUnique({ where: { id: a.id } })).finalScore)).toBe(avg);
      expect(Number(db.find((d) => d.memberId === U.lecD.id).score)).toBe(s.status === 200 ? 9 : 6);
      seen.add(s.status);
    }
    expect(seen.size).toBeGreaterThan(0);
  });

  it('TC-FR37-09 (§7.6 #11) cán bộ RETURN_FROM_DEFENSE ‖ thư ký chốt → đúng một thành công, trạng thái nhất quán', async () => {
    for (let i = 0; i < 4; i++) {
      const { t, a } = await mkAssigned();
      await seedScores(a, { lecB: 8, lecC: 7, lecD: 6 });
      const [ret, fin] = await Promise.all([
        call('post', 'staff1', `/api/topics/${t.id}/actions`, { action: 'RETURN_FROM_DEFENSE', version: 0, reason: 'Nhóm cần bổ sung báo cáo' }),
        finalize('lecC', a),
      ]);
      expect([ret.status, fin.status].sort(), JSON.stringify([ret.body, fin.body])).toEqual([200, 409]);
      const tp = await prisma.topic.findUnique({ where: { id: t.id } });
      const as2 = await prisma.councilAssignment.findUnique({ where: { id: a.id } });
      const rv = await prisma.resultVersion.count({ where: { topicId: t.id, source: 'COUNCIL' } });
      if (ret.status === 200) expect([tp.status, !!as2.cancelledAt, !!as2.decidedAt, rv]).toEqual(['IN_PROGRESS', true, false, 0]);
      else expect([tp.status, !!as2.cancelledAt, !!as2.decidedAt, rv]).toEqual(['WAITING_CLOSE', false, true, 1]);
    }
  });

  it('TC-FR36-09 (§6.6 #6, m1 BM DC-08) đổi thành viên trước (giữ Council FOR UPDATE) → người bị bỏ chấm sau nhận 403, không có điểm', async () => {
    const c = await mkCouncil(COUNCIL, 'Hội đồng đổi thành viên');
    const { a } = await mkAssigned({ c });
    let onLocked;
    const locked = new Promise((r) => { onLocked = r; });
    // Mô phỏng phần khóa của PUT members (§6.2): Council FOR UPDATE → thay lecD bằng lecE → commit
    const changing = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Council" WHERE id = ${c.id} FOR UPDATE`;
      onLocked();
      await new Promise((r) => setTimeout(r, 400));
      await tx.councilMember.delete({ where: { councilId_lecturerId: { councilId: c.id, lecturerId: U.lecD.id } } });
      await tx.councilMember.create({ data: { councilId: c.id, lecturerId: U.lecE.id, role: 'MEMBER' } });
    }, { timeout: 10000 });
    await locked;
    const [r] = await Promise.all([score('lecD', a, 8), changing]);
    expect([r.status, code(r)], JSON.stringify(r.body)).toEqual([403, 'FORBIDDEN']);
    expect(await prisma.defenseScore.count({ where: { assignmentId: a.id } })).toBe(0);
    expect((await score('lecE', a, 8)).status).toBe(200);
  });
});

describe('§7.5 TopicDetail.defense, councilAccess', () => {
  it('TC-FR37-10 WAITING_ASSIGNMENT → ASSIGNED (SV/GVHD scores [], chủ tịch/cán bộ thấy) ; councilAccess chỉ cho thành viên HĐ; đề tài chưa ra hội đồng → null', async () => {
    const { t, leader } = await mkAssigned({ assign: false });
    expect((await topic(leader, t)).defense).toEqual({ assignmentId: null, council: null, state: 'WAITING_ASSIGNMENT', finalScore: null, decision: null, decidedAt: null, scores: [] });
    const a = await prisma.councilAssignment.create({ data: { councilId: council.id, topicId: t.id, assignedById: U.staff1.id } });
    await seedScores(a, { lecB: 8 });
    const sv = await topic(leader, t);
    expect([sv.defense.state, sv.defense.assignmentId, sv.defense.scores, sv.councilAccess]).toEqual(['ASSIGNED', a.id, [], null]);
    expect((await topic('lecA', t)).defense.scores).toEqual([]);
    const member = await topic('lecD', t);
    expect([member.councilAccess, member.defense.scores]).toEqual([{ assignmentId: a.id, role: 'MEMBER' }, []]);
    expect((await topic('lecB', t)).defense.scores.map((s) => s.score)).toEqual(['8.00']);
    expect((await topic('lecB', t)).councilAccess).toEqual({ assignmentId: a.id, role: 'CHAIR' });
    expect((await topic('staff1', t)).defense.scores).toHaveLength(1);
    const running = await mkTopic(`s${++seq}`, S.round, { status: 'IN_PROGRESS' });
    expect((await topic('staff1', running)).defense).toBeNull();
  });
});

describe('Trigger (m1 BM DC-07) và limiter dùng chung (m2 BM DC-08)', () => {
  it('TC-FR37-11 (§7.6 #6) sửa điểm sau chốt bằng SQL → trigger từ chối; chuyển điểm sang phân công khác; đổi đề tài/hội đồng của phân công mở → từ chối', async () => {
    const { a } = await mkAssigned();
    await seedScores(a, { lecB: 8, lecC: 7, lecD: 6 });
    expect((await finalize('lecC', a)).status).toBe(200);
    await expect(prisma.$executeRaw`UPDATE "DefenseScore" SET score = 10 WHERE "assignmentId" = ${a.id}`).rejects.toThrow(/Điểm đã khóa/);
    // Điểm của phân công đã chốt không được chuyển sang phân công mở (trước đây chỉ xét NEW."assignmentId")
    const { t: t2, a: open } = await mkAssigned();
    await expect(prisma.$executeRaw`UPDATE "DefenseScore" SET "assignmentId" = ${open.id} WHERE "assignmentId" = ${a.id} AND "memberId" = ${U.lecB.id}`).rejects.toThrow(/chuyển điểm/);
    await seedScores(open, { lecB: 5 });
    await expect(prisma.$executeRaw`UPDATE "DefenseScore" SET "memberId" = ${U.lecE.id} WHERE "assignmentId" = ${open.id}`).rejects.toThrow(/chuyển điểm/);
    const { t: t3 } = await mkAssigned({ assign: false });
    await expect(prisma.$executeRaw`UPDATE "CouncilAssignment" SET "topicId" = ${t3.id} WHERE id = ${open.id}`).rejects.toThrow(/Không được đổi/);
    const c2 = await mkCouncil({ lecE: 'CHAIR', lecC: 'SECRETARY', lecB: 'MEMBER' }, 'Hội đồng khác');
    await expect(prisma.$executeRaw`UPDATE "CouncilAssignment" SET "councilId" = ${c2.id} WHERE id = ${open.id}`).rejects.toThrow(/Không được đổi/);
    // Sửa điểm của chính mình khi còn mở vẫn được
    expect(await prisma.$executeRaw`UPDATE "DefenseScore" SET score = 5.5 WHERE "assignmentId" = ${open.id}`).toBe(1);
    expect((await prisma.councilAssignment.findUnique({ where: { id: open.id } })).topicId).toBe(t2.id);
  });

  it('TC-FR35-20 (m2 BM DC-08) /api/councils và /api/council-assignments dùng chung limiter ghi 30/15 phút/user', async () => {
    const c = await call('post', 'staff1', '/api/councils', { roundId: S.round.id, name: 'Hội đồng đếm limiter', members: [{ lecturerId: U.lecB.id, role: 'CHAIR' }, { lecturerId: U.lecC.id, role: 'SECRETARY' }, { lecturerId: U.lecD.id, role: 'MEMBER' }] });
    expect(c.status).toBe(201); // 1
    const { a } = await mkAssigned();
    for (let i = 0; i < 14; i++) expect((await call('patch', 'staff1', `/api/councils/${c.body.council.id}`, { name: 'Sai version', version: 99 })).status).toBe(409); // 15
    for (let i = 0; i < 15; i++) expect((await call('post', 'staff1', `/api/council-assignments/${a.id}/cancel`, { reason: 'ab' })).status).toBe(400); // 30
    expect(code(await call('post', 'staff1', `/api/council-assignments/${a.id}/cancel`, { reason: 'Lý do hợp lệ đủ dài' }))).toBe('RATE_LIMITED');
    expect(code(await call('patch', 'staff1', `/api/councils/${c.body.council.id}`, { name: 'Sai version', version: 99 }))).toBe('RATE_LIMITED');
  });
});
