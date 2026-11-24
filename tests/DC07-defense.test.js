// TASK-DC-07 (FR34, FR27, FR35 phần trả về – API_GD7 §2.2–2.4, §5, Vòng sửa 1 M4, M6): điểm quá trình, REQUEST_DEFENSE,
// RETURN_FROM_DEFENSE, requireDefense/DEFENSE_REQUIRED, ResultVersion.source/COUNCIL_RESULT_LOCKED, SQL thô dc_council.
// Test bắt buộc GD7 §5.6 #1–#9 + MINOR DC-06 m1 (UPDATE … RETURNING). DB test thật (trừ khối unit đầu).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { prisma, S, U, tok, seedBase, mkTopic, mkRound, CONTENT, post, get, act, at, day } from './t214-kit.js';
import { createApp } from '../src/app.js';
import { createAuthRepo } from '../src/modules/auth/prismaRepo.js';
import { createTopicRepo } from '../src/modules/topics/prismaRepo.js';
import { createRoundRepo } from '../src/modules/rounds/prismaRepo.js';
import { createDefenseService } from '../src/modules/topics/defenseService.js';
import { createCloseService } from '../src/modules/topics/closeService.js';
import { evaluateClose, defenseRequired } from '../src/modules/topics/closeConditions.js';
import { fakeHasher, testEnv } from './helpers.js';

const code = (r) => r.body.error?.code;
const COMMENT = 'Nhóm làm việc đều đặn, hoàn thành các mốc đúng hạn.';
const REASON = 'Báo cáo tổng kết cần bổ sung phần thực nghiệm';
const defend = (who, t, o = {}) => act(who, t, { action: 'REQUEST_DEFENSE', processScore: 7.25, processComment: COMMENT, ...o });
const giveBack = (who, t, o = {}) => act(who, t, { action: 'RETURN_FROM_DEFENSE', reason: REASON, ...o });
const topicOf = (t) => prisma.topic.findUnique({ where: { id: t.id } });
const scoresOf = (t) => prisma.processScore.findMany({ where: { topicId: t.id } });
const notes = (who, type, t) => prisma.notification.count({ where: { userId: U[who].id, type, ...(t && { link: `/de-tai/${t.id}` }) } });
const immutable = /chỉ cho phép thêm mới/;

let seq = 0;
// Đề tài đang thực hiện, GVHD lecA; mốc bắt buộc theo `milestones`; `final`: có báo cáo tổng kết (FINAL, READY) gắn mốc cuối
const mkRunning = async ({ round = S.round, status = 'IN_PROGRESS', milestones = ['PASSED'], final = true, lec = 'lecA' } = {}) => {
  const leader = `s${++seq}`;
  const t = await mkTopic(leader, round, { status });
  await prisma.advising.create({ data: { topicId: t.id, lecturerId: U[lec].id } });
  const ms = [];
  for (const [i, evaluation] of milestones.entries()) {
    ms.push(await prisma.milestone.create({ data: { topicId: t.id, order: i + 1, name: `Mốc ${i + 1}`, output: 'PDF', dueAt: at(5), evaluation, createdById: U[lec].id } }));
  }
  if (final && ms.length) {
    await prisma.document.create({ data: { topicId: t.id, milestoneId: ms.at(-1).id, stage: 'FINAL', kind: 'LINK', version: 1, fileName: 'Báo cáo tổng kết', externalUrl: 'https://github.com/x/y', status: 'READY', uploadedById: U[leader].id } });
  }
  return { t, leader, ms };
};
const mkCouncil = () => prisma.council.create({
  data: {
    code: `HD-T-${++seq}`, facultyId: S.F1.id, roundId: S.round.id, name: 'Hội đồng thử', createdById: U.staff1.id,
    members: { create: [{ lecturerId: U.lecB.id, role: 'CHAIR' }, { lecturerId: U.lecC.id, role: 'SECRETARY' }] },
  },
});
// Kết quả hội đồng chốt (DC-09 chưa có endpoint): dựng thẳng DB đúng hình dạng §7.4 bước 6
const councilResult = (t, result) => prisma.resultVersion.create({ data: { topicId: t.id, version: 1, result, summary: 'Biên bản hội đồng nghiệm thu đề tài.', source: 'COUNCIL', createdById: U.lecB.id } });

beforeAll(() => seedBase({ students: 70 }), 60000);
afterAll(() => prisma.$disconnect());

describe('Unit – kiểm lại dưới khóa, hasFinalResult/defenseRequired (không cần DB)', () => {
  const met = { requiredMilestoneCount: 1, requiredMilestonesPassed: true, pendingMilestones: [], advisorId: 'g1' };
  const lec = { id: 'g1', role: 'LECTURER' };
  const topic = { id: 't1', status: 'IN_PROGRESS', version: 0, facultyId: 'f', round: { endAt: new Date(Date.now() + day) }, members: [], advisings: [{ lecturerId: 'g1' }], advisorRequests: [] };
  const body = { action: 'REQUEST_DEFENSE', version: 0, processScore: 7.25, processComment: COMMENT };
  const svcWith = (under, created) => createDefenseService({
    repo: {
      findDetail: async () => topic, readCloseConditions: async () => met, readFinalReport: async () => true,
      applyDefense: async (_a, extra) => extra({ ...under, createProcessScore: async (d) => { created.push(d); return { id: 'p1' }; }, audit: async () => {}, notify: async () => {} }),
    },
    getTopic: async () => ({}),
  });
  it('REQUEST_DEFENSE: báo cáo mất / GV bị thay / mốc bị mở lại dưới khóa → lỗi, không tạo ProcessScore', async () => {
    const created = [];
    await expect(svcWith({ closeConditions: async () => met, hasFinalReport: async () => false }, created).act(lec, 't1', body)).rejects.toMatchObject({ code: 'NO_FINAL_REPORT' });
    await expect(svcWith({ closeConditions: async () => ({ ...met, advisorId: 'g2' }), hasFinalReport: async () => true }, created).act(lec, 't1', body)).rejects.toMatchObject({ status: 403 });
    await expect(svcWith({ closeConditions: async () => ({ ...met, requiredMilestonesPassed: false }), hasFinalReport: async () => true }, created).act(lec, 't1', body)).rejects.toMatchObject({ code: 'MILESTONES_NOT_PASSED' });
    expect(created).toEqual([]);
  });
  it('REQUEST_CLOSE: kết quả đổi thành GOOD dưới khóa khi đợt bắt buộc hội đồng → DEFENSE_REQUIRED, không ghi audit', async () => {
    const audits = [];
    const cond = (result) => ({ requiredMilestoneCount: 1, requiredMilestonesPassed: true, hasFinalResult: true, advisorId: 'g1', currentResult: { result, source: 'ADVISOR' } });
    const svc = createCloseService({
      repo: {
        findDetail: async () => ({ ...topic, round: { endAt: new Date(Date.now() + day), config: { requireDefense: true } } }),
        readCloseConditions: async () => cond('FAIL'),
        applyClose: async (_a, extra) => extra({ closeConditions: async () => cond('GOOD'), audit: async (e) => audits.push(e) }),
      },
      getTopic: async () => ({}),
    });
    await expect(svc.act(lec, 't1', { action: 'REQUEST_CLOSE', version: 0 })).rejects.toMatchObject({ code: 'DEFENSE_REQUIRED' });
    expect(audits).toEqual([]);
  });
  it('hasFinalResult nhận nguồn COUNCIL dù người tạo không phải GVHD (§5.5); defenseRequired chỉ khi bật và kết quả ≠ FAIL, nguồn ≠ COUNCIL', () => {
    const ms = [{ id: 'm', name: 'A', evaluation: 'PASSED' }];
    expect(evaluateClose({ milestones: ms, result: { summary: 'Biên bản', createdById: 'hd', source: 'COUNCIL' }, advisorId: 'g1' }).hasFinalResult).toBe(true);
    expect(evaluateClose({ milestones: ms, result: { summary: 'Biên bản', createdById: 'hd', source: 'ADVISOR' }, advisorId: 'g1' }).hasFinalResult).toBe(false);
    expect(evaluateClose({ milestones: ms, result: { summary: '  ', createdById: 'hd', source: 'COUNCIL' }, advisorId: 'g1' }).hasFinalResult).toBe(false);
    const on = { requireDefense: true };
    expect([
      defenseRequired(on, { result: 'GOOD', source: 'ADVISOR' }), defenseRequired(on, { result: 'FAIL', source: 'ADVISOR' }),
      defenseRequired(on, { result: 'GOOD', source: 'COUNCIL' }), defenseRequired({ requireDefense: false }, { result: 'GOOD', source: 'ADVISOR' }), defenseRequired(on, null),
    ]).toEqual([true, false, false, false, false]);
  });
});

describe('§5.6 #1 REQUEST_DEFENSE đủ điều kiện', () => {
  it('điểm 7,25 → WAITING_DEFENSE; ProcessScore 7.25; StatusHistory, AuditLog, thông báo; TopicDetail.processScore; SV/GV không ghi được nữa', async () => {
    const { t, leader, ms } = await mkRunning();
    const r = await defend('lecA', t);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.topic).toMatchObject({ status: 'WAITING_DEFENSE', version: 1, availableActions: [], processScore: { score: '7.25', comment: COMMENT, lecturer: { fullName: U.lecA.fullName } } });
    expect((await scoresOf(t)).map((p) => [p.score.toFixed(2), p.lecturerId])).toEqual([['7.25', U.lecA.id]]);
    expect((await prisma.statusHistory.findMany({ where: { topicId: t.id } })).map((h) => [h.from, h.to, h.action, h.actorId])).toEqual([['IN_PROGRESS', 'WAITING_DEFENSE', 'REQUEST_DEFENSE', U.lecA.id]]);
    expect((await prisma.auditLog.findFirst({ where: { action: 'TOPIC_REQUEST_DEFENSE', entityId: t.id } })).after).toMatchObject({ status: 'WAITING_DEFENSE', processScore: 7.25 });
    expect([await notes('staff1', 'DEFENSE_REQUESTED', t), await notes(leader, 'DEFENSE_REQUESTED', t), await notes('staff2', 'DEFENSE_REQUESTED', t), await notes('lecA', 'DEFENSE_REQUESTED', t)]).toEqual([1, 1, 0, 0]);
    // Cán bộ thấy nút trả về; SV thấy điểm quá trình (canReadExecution)
    const staff = (await get('staff1', `/api/topics/${t.id}`)).body.topic;
    expect([staff.availableActions, staff.processScore.score, staff.closeReadiness?.requiredMilestonesPassed]).toEqual([['RETURN_FROM_DEFENSE'], '7.25', true]);
    const sv = (await get(leader, `/api/topics/${t.id}`)).body.topic;
    expect([sv.availableActions, sv.processScore.score, sv.permissions.uploadMilestone, sv.permissions.addProgress]).toEqual([[], '7.25', false, false]);
    // FR34: từ Chờ bảo vệ, SV không nộp/sửa được gì; GVHD không nhận xét/nhập kết quả.
    // Nộp tài liệu: bước kiểm sớm có sẵn (T403) trả TOPIC_NOT_EDITABLE cho mọi trạng thái không nộp được (như WAITING_CLOSE/CLOSED) – xem báo cáo
    const link = await post(leader, `/api/topics/${t.id}/documents/links`, { stage: 'FINAL', milestoneId: ms[0].id, title: 'Bản sửa', url: 'https://github.com/x/z' });
    expect([link.status, code(link)]).toEqual([409, 'TOPIC_NOT_EDITABLE']);
    expect(code(await post(leader, `/api/topics/${t.id}/progress`, { done: 'a', issues: '', nextPlan: 'b', percent: 90 }))).toBe('TOPIC_NOT_IN_PROGRESS');
    expect(code(await post('lecA', `/api/topics/${t.id}/results`, { result: 'GOOD', summary: 'Nhóm hoàn thành tốt.', expectedVersion: 0 }))).toBe('TOPIC_NOT_IN_PROGRESS');
    expect(await prisma.document.count({ where: { topicId: t.id } })).toBe(1);
  });

  it('GVHD ở Đang thực hiện có REQUEST_DEFENSE trong availableActions (bật trong ENABLED_ACTIONS)', async () => {
    const { t, leader } = await mkRunning();
    expect((await get('lecA', `/api/topics/${t.id}`)).body.topic.availableActions).toContain('REQUEST_DEFENSE');
    expect((await get(leader, `/api/topics/${t.id}`)).body.topic.processScore).toBeNull();
  });
});

describe('§5.6 #2 điều kiện', () => {
  it('4,99 → 409 PROCESS_SCORE_TOO_LOW, không lưu điểm; thiếu báo cáo FINAL → NO_FINAL_REPORT; mốc chưa Đạt → MILESTONES_NOT_PASSED; không mốc → NO_REQUIRED_MILESTONE', async () => {
    const { t: a } = await mkRunning();
    const low = await defend('lecA', a, { processScore: 4.99 });
    expect([low.status, code(low)]).toEqual([409, 'PROCESS_SCORE_TOO_LOW']);
    const { t: b } = await mkRunning({ final: false });
    expect(code(await defend('lecA', b))).toBe('NO_FINAL_REPORT');
    // Bản FINAL chưa xác minh (UPLOADING) không tính
    const ms = await prisma.milestone.findFirst({ where: { topicId: b.id } });
    await prisma.document.create({ data: { topicId: b.id, milestoneId: ms.id, stage: 'FINAL', kind: 'FILE', version: 1, fileName: 'x.pdf', publicId: `p-${b.id}`, status: 'UPLOADING', uploadedById: U.lecA.id } });
    expect(code(await defend('lecA', b))).toBe('NO_FINAL_REPORT');
    const { t: c } = await mkRunning({ milestones: ['PASSED', 'NEEDS_WORK'] });
    const rc = await defend('lecA', c);
    expect([code(rc), rc.body.error.details.milestones.map((m) => m.name)]).toEqual(['MILESTONES_NOT_PASSED', ['Mốc 2']]);
    const { t: d } = await mkRunning({ milestones: [] });
    expect(code(await defend('lecA', d))).toBe('NO_REQUIRED_MILESTONE');
    for (const x of [a, b, c, d]) {
      expect((await topicOf(x)).status).toBe('IN_PROGRESS');
      expect(await scoresOf(x)).toEqual([]);
    }
    expect(await prisma.statusHistory.count({ where: { topicId: { in: [a.id, b.id, c.id, d.id] } } })).toBe(0);
    // Biên đúng 5,00 được ra hội đồng
    expect((await defend('lecA', a, { processScore: 5 })).status).toBe(200);
  });

  it('403 vai trò/quan hệ sai (SV, GV khác, cán bộ, ADMIN); 409 sai trạng thái; 409 lệch version', async () => {
    const { t, leader } = await mkRunning();
    for (const who of [leader, 'lecB', 'staff1', 'staff2', 'admin', 'sF2']) expect((await defend(who, t)).status, who).toBe(403);
    expect(code(await defend('lecA', t, { version: 3 }))).toBe('CONCURRENT_UPDATE');
    const { t: w } = await mkRunning({ status: 'WAITING_CLOSE' });
    expect(code(await defend('lecA', w))).toBe('INVALID_TRANSITION');
    expect(await scoresOf(t)).toEqual([]);
  });
});

describe('§5.6 #3 điểm sai định dạng', () => {
  it('10,001 / 5,555 / "abc" / thiếu → 400 VALIDATION_ERROR tại processScore; nhận xét ngắn → tại processComment', async () => {
    const { t } = await mkRunning();
    for (const processScore of [10.001, 5.555, 'abc', -1, undefined]) {
      const r = await defend('lecA', t, { processScore });
      expect([r.status, code(r), Object.keys(r.body.error.details)], String(processScore)).toEqual([400, 'VALIDATION_ERROR', ['processScore']]);
    }
    const r = await defend('lecA', t, { processComment: 'quá ngắn' });
    expect([r.status, Object.keys(r.body.error.details)]).toEqual([400, ['processComment']]);
    expect(code(await act('staff1', t, { action: 'RETURN_FROM_DEFENSE', reason: 'x'.repeat(2001) }))).toBe('VALIDATION_ERROR');
    expect([(await topicOf(t)).status, await scoresOf(t)]).toEqual(['IN_PROGRESS', []]);
  });
});

describe('§5.6 #4 requireDefense (đợt)', () => {
  it('bật: REQUEST_CLOSE với kết quả GOOD → 409 DEFENSE_REQUIRED; FAIL → 200. Tắt (mặc định): GOOD → 200', async () => {
    const round = await mkRound(S.F1.id, 'Đợt bắt buộc hội đồng', { requireDefense: true });
    const result = (t, r) => prisma.resultVersion.create({ data: { topicId: t.id, version: 1, result: r, summary: 'Nhận xét tổng kết của GVHD.', createdById: U.lecA.id } });
    const { t: good } = await mkRunning({ round });
    await result(good, 'GOOD');
    const r = await act('lecA', good, { action: 'REQUEST_CLOSE' });
    expect([r.status, code(r)]).toEqual([409, 'DEFENSE_REQUIRED']);
    expect([(await topicOf(good)).status, await prisma.statusHistory.count({ where: { topicId: good.id } })]).toEqual(['IN_PROGRESS', 0]);
    // Lối đúng: đề nghị ra hội đồng
    expect((await defend('lecA', good)).status).toBe(200);
    const { t: fail } = await mkRunning({ round });
    await result(fail, 'FAIL');
    expect((await act('lecA', fail, { action: 'REQUEST_CLOSE' })).status).toBe(200);
    const { t: off } = await mkRunning();
    await result(off, 'GOOD');
    expect((await act('lecA', off, { action: 'REQUEST_CLOSE' })).status).toBe(200);
    expect((await get('staff1', `/api/rounds/${round.id}`)).body.round.effectiveConfig).toMatchObject({ requireDefense: true, defenseGrades: { excellent: 9, good: 7, pass: 5 } });
  });
});

describe('§5.6 #5 RETURN_FROM_DEFENSE', () => {
  it('thiếu/ngắn lý do → 400 REASON_REQUIRED; 403 GVHD/SV/cán bộ khoa khác/ADMIN; 409 sai trạng thái/version', async () => {
    const { t, leader } = await mkRunning();
    expect((await defend('lecA', t)).status).toBe(200);
    for (const body of [{ action: 'RETURN_FROM_DEFENSE', version: 1 }, { action: 'RETURN_FROM_DEFENSE', version: 1, reason: 'abc' }]) {
      const r = await act('staff1', t, body);
      expect([r.status, code(r)]).toEqual([400, 'REASON_REQUIRED']);
    }
    for (const who of ['lecA', leader, 'staff2', 'admin', 'lecB']) expect((await giveBack(who, t, { version: 1 })).status, who).toBe(403);
    expect(code(await giveBack('staff1', t, { version: 0 }))).toBe('CONCURRENT_UPDATE');
    const { t: run } = await mkRunning();
    expect(code(await giveBack('staff1', run))).toBe('INVALID_TRANSITION');
    expect((await topicOf(t)).status).toBe('WAITING_DEFENSE');
  });

  it('có phân công mở → cancelledAt + lý do, điểm đã chấm giữ lại; phân công đã chốt không đổi; IN_PROGRESS; thông báo GVHD, nhóm, thành viên HĐ; HĐ không đọc được đề tài', async () => {
    const { t, leader } = await mkRunning();
    expect((await defend('lecA', t)).status).toBe(200);
    const council = await mkCouncil();
    // Phân công đã chốt của lần trước thuộc hội đồng khác (thành viên lecF2) – m4 BM DC-07: tách quyền đọc của hai phân công
    const older = await prisma.council.create({ data: { code: `HD-T-${++seq}`, facultyId: S.F1.id, roundId: S.round.id, name: 'Hội đồng lần trước', createdById: U.staff1.id, members: { create: [{ lecturerId: U.lecF2.id, role: 'CHAIR' }] } } });
    const decided = await prisma.councilAssignment.create({ data: { councilId: older.id, topicId: t.id, assignedById: U.staff1.id, decidedAt: new Date(Date.now() - day), decidedById: U.lecF2.id, finalScore: 4, decision: 'FAILED', minutes: 'Lần trước' } });
    const open = await prisma.councilAssignment.create({ data: { councilId: council.id, topicId: t.id, assignedById: U.staff1.id } });
    await prisma.defenseScore.create({ data: { assignmentId: open.id, memberId: U.lecB.id, score: 6.5, comment: 'Đã chấm trước khi trả' } });
    // m4 BM DC-07: phân công mở → thành viên hội đồng đọc được (isCouncilMember, DC-08)
    for (const who of ['lecB', 'lecC']) expect((await get(who, `/api/topics/${t.id}`)).status, who).toBe(200);
    const r = await giveBack('staff1', t, { version: 1 });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.topic).toMatchObject({ status: 'IN_PROGRESS', version: 2 });
    const o = await prisma.councilAssignment.findUnique({ where: { id: open.id } });
    expect([o.cancelledAt !== null, o.cancelReason, o.decidedAt]).toEqual([true, REASON, null]);
    expect((await prisma.councilAssignment.findUnique({ where: { id: decided.id } })).cancelledAt).toBeNull();
    expect(await prisma.defenseScore.count({ where: { assignmentId: open.id } })).toBe(1);
    expect((await prisma.statusHistory.findFirst({ where: { topicId: t.id, action: 'RETURN_FROM_DEFENSE' } })).reason).toBe(REASON);
    expect((await prisma.auditLog.findFirst({ where: { action: 'TOPIC_RETURN_FROM_DEFENSE', entityId: t.id } })).after).toMatchObject({ status: 'IN_PROGRESS', cancelledAssignments: [open.id] });
    for (const who of ['lecA', leader, 'lecB', 'lecC']) expect(await notes(who, 'DEFENSE_RETURNED', t), who).toBe(1);
    expect(await notes('staff1', 'DEFENSE_RETURNED', t)).toBe(0);
    // Phân công đã hủy: thành viên hội đồng mất quyền đọc (isCouncilMember xét cancelledAt); phân công đã chốt (không hủy) vẫn đọc (GD7 §1.1)
    for (const who of ['lecB', 'lecC']) expect((await get(who, `/api/topics/${t.id}`)).status, who).toBe(403);
    expect((await get('lecF2', `/api/topics/${t.id}`)).status).toBe(200);
    // Đề nghị lại → phân công mới được phép (bản cũ đã hủy)
    expect((await defend('lecA', t, { version: 2, processScore: 8 })).status).toBe(200);
    expect((await scoresOf(t)).map((p) => p.score.toFixed(2)).sort()).toEqual(['7.25', '8.00']);
    await prisma.councilAssignment.create({ data: { councilId: council.id, topicId: t.id, assignedById: U.staff1.id } });
  });
});

describe('§5.6 #6 + §2.3 – SQL thô dc_council', () => {
  it('ProcessScore: sửa/xóa/TRUNCATE bằng SQL bị trigger từ chối', async () => {
    const { t } = await mkRunning();
    expect((await defend('lecA', t)).status).toBe(200);
    const [p] = await scoresOf(t);
    await expect(prisma.processScore.update({ where: { id: p.id }, data: { score: 9 } })).rejects.toThrow(immutable);
    await expect(prisma.processScore.delete({ where: { id: p.id } })).rejects.toThrow(immutable);
    await expect(prisma.$executeRawUnsafe('TRUNCATE "ProcessScore"')).rejects.toThrow(immutable);
    expect((await scoresOf(t))[0].score.toFixed(2)).toBe('7.25');
  });

  it('CouncilAssignment đã chốt/hủy bất biến, không xóa; DefenseScore khóa sau chốt/hủy, không xóa; partial unique; sequence', async () => {
    const { t } = await mkRunning({ status: 'WAITING_DEFENSE' });
    const council = await mkCouncil();
    const a = await prisma.councilAssignment.create({ data: { councilId: council.id, topicId: t.id, assignedById: U.staff1.id } });
    const s = await prisma.defenseScore.create({ data: { assignmentId: a.id, memberId: U.lecB.id, score: 7, comment: 'Ổn' } });
    await prisma.defenseScore.update({ where: { id: s.id }, data: { score: 7.5 } }); // phân công mở: sửa được (FR36)
    await expect(prisma.defenseScore.delete({ where: { id: s.id } })).rejects.toThrow(/DefenseScore không được xóa/);
    await expect(prisma.councilAssignment.create({ data: { councilId: council.id, topicId: t.id, assignedById: U.staff1.id } })).rejects.toMatchObject({ code: 'P2002' });
    await expect(prisma.councilAssignment.delete({ where: { id: a.id } })).rejects.toThrow(/CouncilAssignment không được xóa/);
    await prisma.councilAssignment.update({ where: { id: a.id }, data: { decidedAt: new Date(), decidedById: U.lecC.id, finalScore: 7.5, decision: 'PASSED' } });
    await expect(prisma.councilAssignment.update({ where: { id: a.id }, data: { finalScore: 9 } })).rejects.toThrow(/Phân công đã chốt hoặc đã hủy/);
    await expect(prisma.defenseScore.update({ where: { id: s.id }, data: { score: 9 } })).rejects.toThrow(/Điểm đã khóa/);
    await expect(prisma.defenseScore.create({ data: { assignmentId: a.id, memberId: U.lecC.id, score: 9, comment: 'Muộn' } })).rejects.toThrow(/Điểm đã khóa/);
    await expect(prisma.councilMember.create({ data: { councilId: council.id, lecturerId: U.lecA.id, role: 'CHAIR' } })).rejects.toMatchObject({ code: 'P2002' });
    await expect(prisma.councilMember.create({ data: { councilId: council.id, lecturerId: U.lecA.id, role: 'SECRETARY' } })).rejects.toMatchObject({ code: 'P2002' });
    await prisma.councilMember.create({ data: { councilId: council.id, lecturerId: U.lecA.id, role: 'MEMBER' } }); // nhiều ủy viên được
    const [{ v }] = await prisma.$queryRaw`SELECT nextval('council_code_seq')::int AS v`;
    expect(v).toBeGreaterThan(0);
  });

  it('pg_indexes/pg_trigger có đủ đối tượng §2.3; RLS bật trên 5 bảng mới; ResultVersion.source mặc định ADVISOR', async () => {
    const idx = Object.fromEntries((await prisma.$queryRaw`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public'`).map((r) => [r.indexname, r.indexdef]));
    expect(idx.council_one_chair).toMatch(/^CREATE UNIQUE INDEX .*"CouncilMember".* WHERE \(role = 'CHAIR'/);
    expect(idx.council_one_secretary).toMatch(/^CREATE UNIQUE INDEX .*"CouncilMember".* WHERE \(role = 'SECRETARY'/);
    expect(idx.council_assignment_one_open).toMatch(/^CREATE UNIQUE INDEX .*"CouncilAssignment".*"decidedAt" IS NULL.*"cancelledAt" IS NULL/);
    const trg = (await prisma.$queryRaw`SELECT t.tgname, c.relname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE NOT t.tgisinternal`).map((r) => `${r.relname}.${r.tgname}`);
    expect(trg).toEqual(expect.arrayContaining(['ProcessScore.process_score_append_only', 'ProcessScore.process_score_no_truncate', 'CouncilAssignment.council_assignment_guarded', 'DefenseScore.defense_score_guarded']));
    const rls = await prisma.$queryRaw`SELECT relname FROM pg_class WHERE relname IN ('ProcessScore', 'Council', 'CouncilMember', 'CouncilAssignment', 'DefenseScore') AND relrowsecurity`;
    expect(rls.map((r) => r.relname).sort()).toEqual(['Council', 'CouncilAssignment', 'CouncilMember', 'DefenseScore', 'ProcessScore']);
    const { t } = await mkRunning();
    expect((await prisma.resultVersion.create({ data: { topicId: t.id, version: 1, result: 'PASS', summary: 'x', createdById: U.lecA.id } })).source).toBe('ADVISOR');
  });
});

describe('§5.6 #7 đồng thời REQUEST_DEFENSE ‖ thay GV (FR19 duyệt)', () => {
  it('đúng một bên thành công; không có ProcessScore của GV cũ sau Advising.endAt', async () => {
    for (let i = 0; i < 4; i++) {
      const { t, leader } = await mkRunning();
      const c = await post(leader, `/api/topics/${t.id}/change-requests`, { type: 'ADVISOR_CHANGE', reason: 'GVHD đi công tác dài hạn', newLecturerId: U.lecB.id });
      expect(c.status, JSON.stringify(c.body)).toBe(201);
      const id = c.body.changeRequest.id;
      expect((await post('lecB', `/api/change-requests/${id}/accept`)).status).toBe(200);
      const [d, a] = await Promise.all([defend('lecA', t), post('staff1', `/api/change-requests/${id}/approve`, {})]);
      expect([d.status, a.status].filter((s) => s === 200), `${d.status} ${code(d)} / ${a.status} ${code(a)}`).toHaveLength(1);
      const old = await prisma.advising.findFirst({ where: { topicId: t.id, lecturerId: U.lecA.id } });
      const late = (await scoresOf(t)).filter((p) => old.endAt && p.createdAt >= old.endAt);
      expect(late).toEqual([]);
      const st = (await topicOf(t)).status;
      if (d.status === 200) expect([st, old.endAt, (await scoresOf(t)).length]).toEqual(['WAITING_DEFENSE', null, 1]);
      else expect([st, old.endAt !== null, (await scoresOf(t)).length]).toEqual(['IN_PROGRESS', true, 0]);
    }
  });
});

describe('§5.6 #8–#9 kết quả hội đồng (M4 BM)', () => {
  it('#8 hội đồng chốt FAIL → cán bộ RETURN_TO_ADVISOR → GVHD POST /results GOOD → 409 COUNCIL_RESULT_LOCKED; kết quả vẫn FAIL nguồn COUNCIL', async () => {
    const { t } = await mkRunning({ status: 'WAITING_CLOSE' });
    await councilResult(t, 'FAIL');
    expect((await act('staff1', t, { action: 'RETURN_TO_ADVISOR', reason: 'Bổ sung minh chứng thực nghiệm' })).status).toBe(200);
    for (const expectedVersion of [1, 0]) {
      const r = await post('lecA', `/api/topics/${t.id}/results`, { result: 'GOOD', summary: 'GV muốn sửa thành Tốt.', expectedVersion });
      expect([r.status, code(r)]).toEqual([409, 'COUNCIL_RESULT_LOCKED']);
    }
    const g = (await get('lecA', `/api/topics/${t.id}/results`)).body;
    expect([g.items.length, g.current.result, g.current.source]).toEqual([1, 'FAIL', 'COUNCIL']);
    expect((await get('lecA', `/api/topics/${t.id}`)).body.topic.currentResult).toMatchObject({ result: 'FAIL', source: 'COUNCIL' });
    // GVHD gửi đóng bằng kết quả hội đồng (hasFinalResult nhận nguồn COUNCIL)
    expect((await act('lecA', t, { action: 'REQUEST_CLOSE', version: 1 })).status).toBe(200);
  });

  it('#9 requireDefense bật, hội đồng chốt GOOD → trả lại → GVHD REQUEST_CLOSE 200 (không DEFENSE_REQUIRED) → cán bộ CONFIRM_CLOSE 200', async () => {
    const round = await mkRound(S.F1.id, 'Đợt bắt buộc HĐ #9', { requireDefense: true });
    const { t } = await mkRunning({ round, status: 'WAITING_CLOSE' });
    await councilResult(t, 'GOOD');
    expect((await act('staff1', t, { action: 'RETURN_TO_ADVISOR', reason: 'Bổ sung minh chứng thực nghiệm' })).status).toBe(200);
    const r = await act('lecA', t, { action: 'REQUEST_CLOSE', version: 1 });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect((await act('staff1', t, { action: 'CONFIRM_CLOSE', version: 2 })).status).toBe(200);
    expect((await topicOf(t)).status).toBe('CLOSED');
  });
});

describe('§5.5 ResultVersion.source', () => {
  it('GVHD ghi ADVISOR; FR23 cán bộ sửa ghi STAFF; CLOSE_EXPIRED ghi STAFF', async () => {
    const { t } = await mkRunning();
    const r = await post('lecA', `/api/topics/${t.id}/results`, { result: 'GOOD', summary: 'Nhóm hoàn thành tốt.', expectedVersion: 0 });
    expect([r.status, r.body.result.source]).toEqual([201, 'ADVISOR']);
    const { t: closed } = await mkRunning({ status: 'CLOSED' });
    await prisma.resultVersion.create({ data: { topicId: closed.id, version: 1, result: 'GOOD', summary: 'Tốt', createdById: U.lecA.id } });
    const fix = await post('staff1', `/api/topics/${closed.id}/result-corrections`, { result: 'PASS', reason: 'Nhập nhầm mức kết quả', expectedVersion: 1 });
    expect([fix.status, fix.body.result?.source], JSON.stringify(fix.body)).toEqual([201, 'STAFF']);
    const ended = await prisma.round.create({ data: { facultyId: S.F1.id, name: 'Đợt hết hạn DC07', academicYear: '2025-2026', regOpenAt: at(-300), regCloseAt: at(-250), reviewDeadline: at(-200), endAt: new Date(Date.now() - day), config: {} } });
    const { t: exp } = await mkRunning({ round: ended, milestones: ['PENDING'] });
    expect((await act('staff1', exp, { action: 'CLOSE_EXPIRED', reason: 'Hết hạn đợt, không gia hạn' })).status).toBe(200);
    expect((await prisma.resultVersion.findFirst({ where: { topicId: exp.id, isCurrent: true } })).source).toBe('STAFF');
  });
});

// MINOR m1 (reviews/TASK-DC-06-bao-mat-v1.md): audit + thông báo theo dòng thật sự cập nhật (UPDATE … RETURNING)
describe('MINOR DC-06 m1 – đơn bị rút ngay trước câu cập nhật không bị ghi/báo sai', () => {
  const base = createTopicRepo(prisma);
  let hook = null;
  const fire = async () => { if (hook) { const h = hook; hook = null; await h(); } };
  const racing = createApp({
    env: testEnv, logger: undefined, authRepo: createAuthRepo(prisma), hasher: fakeHasher, roundRepo: createRoundRepo(prisma),
    topicRepo: {
      ...base,
      applyRecruitment: (args, extra) => base.applyRecruitment(args, (o) => extra({ ...o, declinePendingApplications: async (...a) => { await fire(); return o.declinePendingApplications(...a); } })),
      appTx: (fn) => base.appTx((o) => fn({ ...o, withdrawOtherPending: async (...a) => { await fire(); return o.withdrawOtherPending(...a); } })),
    },
  });
  const rpost = (who, url, body = {}) => request(racing).post(url).set({ Authorization: `Bearer ${tok[who]}` }).send(body);
  const mkLec = (lec, status = 'RECRUITING') => prisma.topic.create({
    data: { code: `DC07-${Date.now().toString(36)}-${++seq}`, ...CONTENT(), fieldId: S.field.id, roundId: S.round.id, facultyId: S.F1.id, status, origin: 'LECTURER', recruitSlots: 3, advisings: { create: { lecturerId: U[lec].id } } },
  });
  const mkApp = (t, sv) => prisma.topicApplication.create({ data: { topicId: t.id, studentId: U[sv].id, coverLetter: 'Em muốn tham gia đề tài này.' } });
  // SV tự rút qua kết nối khác (tự commit) – dòng đơn không bị tx kia khóa
  const selfWithdraw = (app) => async () => { await prisma.topicApplication.updateMany({ where: { id: app.id, status: 'PENDING' }, data: { status: 'WITHDRAWN' } }); };

  it('FINALIZE_GROUP và UNPUBLISH: đơn SV vừa tự rút giữ WITHDRAWN, không bị báo "từ chối", không tính vào audit', async () => {
    for (const action of ['FINALIZE_GROUP', 'UNPUBLISH_RECRUITMENT']) {
      const t = await mkLec('lecB');
      const lead = `s${++seq}`;
      await prisma.topicMember.create({ data: { topicId: t.id, userId: U[lead].id, role: 'LEADER' } });
      const [x, y] = [`s${++seq}`, `s${++seq}`];
      const ax = await mkApp(t, x);
      const ay = await mkApp(t, y);
      hook = selfWithdraw(ax);
      const r = await rpost('lecB', `/api/topics/${t.id}/actions`, { action, version: 0, reason: 'Không đủ sinh viên phù hợp' });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      const rows = await prisma.topicApplication.findMany({ where: { id: { in: [ax.id, ay.id] } }, orderBy: { id: 'asc' } });
      expect(Object.fromEntries(rows.map((a) => [a.studentId, a.status]))).toEqual({ [U[x].id]: 'WITHDRAWN', [U[y].id]: 'DECLINED' });
      expect([await notes(x, 'APPLICATION_DECLINED'), await notes(y, 'APPLICATION_DECLINED')], action).toEqual([0, 1]);
      expect((await prisma.auditLog.findFirst({ where: { action: `TOPIC_${action}`, entityId: t.id } })).after.declinedApplications).toBe(1);
    }
  });

  it('G51 khi duyệt: đơn khác SV vừa tự rút không bị ghi "tự rút" lần hai, GVHD đề tài kia không bị báo', async () => {
    const [t1, t2, t3] = [await mkLec('lecB'), await mkLec('lecC'), await mkLec('lecA')];
    const sv = `s${++seq}`;
    const a1 = await mkApp(t1, sv);
    const a2 = await mkApp(t2, sv);
    const a3 = await mkApp(t3, sv);
    hook = selfWithdraw(a2);
    expect((await rpost('lecB', `/api/applications/${a1.id}/accept`)).status).toBe(200);
    expect([(await prisma.topicApplication.findUnique({ where: { id: a2.id } })).status, (await prisma.topicApplication.findUnique({ where: { id: a3.id } })).status]).toEqual(['WITHDRAWN', 'WITHDRAWN']);
    expect([await notes('lecC', 'APPLICATION_WITHDRAWN', t2), await notes('lecA', 'APPLICATION_WITHDRAWN', t3)]).toEqual([0, 1]);
    const auto = await prisma.auditLog.findMany({ where: { action: 'APPLICATION_WITHDRAW', entityId: { in: [a2.id, a3.id] } } });
    expect(auto.map((x) => x.entityId)).toEqual([a3.id]);
  });
});
