// T405 (FR27, API_GD45 §7): đóng đề tài REQUEST_CLOSE, RETURN_TO_ADVISOR, CONFIRM_CLOSE, CLOSE_EXPIRED. Unit + DB test thật.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { checkTransition } from '../src/modules/topics/stateMachine.js';
import { evaluateClose } from '../src/modules/topics/closeConditions.js';
import { createCloseService } from '../src/modules/topics/closeService.js';
import { topicActionSchema, ENABLED_ACTIONS } from '@nckh/shared';
import { prisma, S, U, seedBase, mkTopic, post, get, act, at, day } from './t214-kit.js';

const code = (r) => r.body.error?.code;
const gv = { id: 'g1', role: 'LECTURER' };
const cb = { id: 's1', role: 'STAFF' };
const expectCode = (fn, c) => expect(fn).toThrow(expect.objectContaining({ code: c }));

describe('checkTransition – nhánh đóng đề tài (unit)', () => {
  const close = (ctx) => checkTransition({ topic: { status: 'IN_PROGRESS' }, action: 'REQUEST_CLOSE', actor: gv, ctx: { isCurrentAdvisor: true, ...ctx } });
  it('NO_REQUIRED_MILESTONE khi tập mốc bắt buộc rỗng (G24); MILESTONES_NOT_PASSED kèm details', () => {
    expectCode(() => close({ requiredMilestoneCount: 0, requiredMilestonesPassed: false, hasFinalResult: true }), 'NO_REQUIRED_MILESTONE');
    try { close({ requiredMilestoneCount: 2, requiredMilestonesPassed: false, pendingMilestones: [{ id: 'm1', name: 'A' }], hasFinalResult: true }); } catch (e) {
      expect([e.code, e.details]).toEqual(['MILESTONES_NOT_PASSED', { milestones: [{ id: 'm1', name: 'A' }] }]);
    }
    expect(close({ requiredMilestoneCount: 1, requiredMilestonesPassed: true, hasFinalResult: true }).to).toBe('WAITING_CLOSE');
  });
  it('CLOSE_EXPIRED: ROUND_NOT_ENDED, CLOSE_CONDITIONS_MET, thiếu lý do, sai vai trò', () => {
    const base = { topic: { status: 'IN_PROGRESS' }, action: 'CLOSE_EXPIRED', actor: cb, reason: 'Hết hạn đợt' };
    expectCode(() => checkTransition({ ...base, ctx: { inStaffScope: true, roundEnded: false } }), 'ROUND_NOT_ENDED');
    expectCode(() => checkTransition({ ...base, ctx: { inStaffScope: true, roundEnded: true, closeConditionsMet: true } }), 'CLOSE_CONDITIONS_MET');
    expectCode(() => checkTransition({ ...base, reason: '', ctx: { inStaffScope: true, roundEnded: true } }), 'REASON_REQUIRED');
    expectCode(() => checkTransition({ ...base, actor: gv, ctx: { isCurrentAdvisor: true, roundEnded: true } }), 'FORBIDDEN');
    expect(checkTransition({ ...base, ctx: { inStaffScope: true, roundEnded: true, closeConditionsMet: false } }).to).toBe('CLOSED');
  });
  it('evaluateClose: G25 kết quả phải do GVHD hiện hành tạo, có nhận xét tổng kết', () => {
    const ms = [{ id: 'm1', name: 'A', evaluation: 'PASSED' }];
    expect(evaluateClose({ milestones: ms, result: { summary: 'Tốt', createdById: 'l1' }, advisorId: 'l1' })).toMatchObject({ closeConditionsMet: true, requiredMilestoneCount: 1 });
    expect(evaluateClose({ milestones: ms, result: { summary: 'Tốt', createdById: 'l0' }, advisorId: 'l1' }).hasFinalResult).toBe(false);
    expect(evaluateClose({ milestones: ms, result: { summary: '  ', createdById: 'l1' }, advisorId: 'l1' }).hasFinalResult).toBe(false);
    expect(evaluateClose({ milestones: [], result: null, advisorId: 'l1' })).toMatchObject({ requiredMilestonesPassed: false, requiredMilestoneCount: 0 });
  });
  it('schema: 4 nhánh mới; RETURN/CLOSE_EXPIRED bắt buộc lý do; CANCEL vẫn bị từ chối; ENABLED_ACTIONS không có CANCEL', () => {
    const p = (o) => topicActionSchema.safeParse({ version: 0, ...o }).success;
    expect([p({ action: 'REQUEST_CLOSE' }), p({ action: 'CONFIRM_CLOSE' }), p({ action: 'RETURN_TO_ADVISOR', reason: 'Thiếu minh chứng' }), p({ action: 'CLOSE_EXPIRED', reason: 'Hết hạn đợt' })]).toEqual([true, true, true, true]);
    expect([p({ action: 'RETURN_TO_ADVISOR' }), p({ action: 'CLOSE_EXPIRED', reason: 'abc' }), p({ action: 'CANCEL', reason: 'khong the huy' })]).toEqual([false, false, false]);
    expect(ENABLED_ACTIONS).not.toContain('CANCEL');
    expect(ENABLED_ACTIONS).toContain('CLOSE_EXPIRED');
  });
  it('kiểm lại điều kiện trong transaction: trước đạt, dưới khóa không đạt → ném lỗi, không ghi audit', async () => {
    const met = { requiredMilestoneCount: 1, requiredMilestonesPassed: true, hasFinalResult: true, closeConditionsMet: true };
    const audits = [];
    const repo = {
      findDetail: async () => ({ id: 't1', status: 'IN_PROGRESS', version: 0, facultyId: 'f', round: { endAt: new Date(0) }, members: [], advisings: [{ lecturerId: 'g1' }], advisorRequests: [] }),
      readCloseConditions: async () => met,
      applyClose: async (_args, extra) => extra({ closeConditions: async () => ({ ...met, requiredMilestonesPassed: false, closeConditionsMet: false }), audit: async (e) => audits.push(e) }),
    };
    const svc = createCloseService({ repo, getTopic: async () => ({}) });
    await expect(svc.act(gv, 't1', { action: 'REQUEST_CLOSE', version: 0 })).rejects.toMatchObject({ code: 'MILESTONES_NOT_PASSED' });
    expect(audits).toEqual([]);
  });
});

// ---------- DB ----------
let seq = 0;
let ended; // đợt đã hết hạn
const mkRunning = async ({ status = 'IN_PROGRESS', round = S.round, milestones = ['PASSED'], result = true } = {}) => {
  const leader = `s${++seq}`;
  const t = await mkTopic(leader, round, { status });
  await prisma.advising.create({ data: { topicId: t.id, lecturerId: U.lecA.id } });
  let i = 0;
  for (const evaluation of milestones) {
    await prisma.milestone.create({ data: { topicId: t.id, order: ++i, name: `Mốc ${i}`, output: 'PDF', dueAt: at(1), evaluation, createdById: U.lecA.id } });
  }
  if (result) await prisma.resultVersion.create({ data: { topicId: t.id, version: 1, result: 'GOOD', summary: 'Nhóm hoàn thành tốt mục tiêu.', createdById: U.lecA.id } });
  return { t, leader };
};
const history = (t) => prisma.statusHistory.findMany({ where: { topicId: t.id }, orderBy: [{ at: 'asc' }, { id: 'asc' }] });

beforeAll(async () => {
  await seedBase({ students: 60 });
  ended = await prisma.round.create({ data: { facultyId: S.F1.id, name: 'Đợt đã hết hạn', academicYear: '2025-2026', regOpenAt: at(-300), regCloseAt: at(-250), reviewDeadline: at(-200), endAt: new Date(Date.now() - day), config: {} } });
}, 60000);
afterAll(() => prisma.$disconnect());

describe('REQUEST_CLOSE', () => {
  it('GVHD gửi đóng khi đủ điều kiện → WAITING_CLOSE; StatusHistory + AuditLog; cán bộ thấy RETURN/CONFIRM và closeReadiness', async () => {
    const { t, leader } = await mkRunning();
    const before = (await get('lecA', `/api/topics/${t.id}`)).body.topic;
    expect(before.availableActions).toEqual(['REQUEST_CLOSE']);
    expect(before.closeReadiness).toEqual({ requiredMilestonesPassed: true, hasFinalResult: true, requiredMilestoneCount: 1, pendingMilestones: 0, requiredRemovedCount: 0 });
    expect(before.permissions).toMatchObject({ manageMilestones: true, giveFeedback: true, enterResult: true, readExecution: true, addProgress: false });
    const r = await act('lecA', t, { action: 'REQUEST_CLOSE' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.topic).toMatchObject({ status: 'WAITING_CLOSE', version: 1, currentResult: { version: 1, result: 'GOOD' } });
    expect((await history(t)).map((h) => [h.from, h.to, h.action])).toEqual([['IN_PROGRESS', 'WAITING_CLOSE', 'REQUEST_CLOSE']]);
    expect(await prisma.auditLog.count({ where: { action: 'TOPIC_REQUEST_CLOSE', entityId: t.id } })).toBe(1);
    const staff = (await get('staff1', `/api/topics/${t.id}`)).body.topic;
    expect(staff.availableActions).toEqual(['RETURN_TO_ADVISOR', 'CONFIRM_CLOSE']);
    expect(staff.closeReadiness).toMatchObject({ requiredMilestonesPassed: true });
    const sv = (await get(leader, `/api/topics/${t.id}`)).body.topic; // CAU_HOI #9: SV thấy kết quả ngay
    expect([sv.closeReadiness, sv.currentResult.result, sv.permissions.addProgress]).toEqual([null, 'GOOD', false]);
    expect(code(await post(leader, `/api/topics/${t.id}/progress`, { done: 'a', issues: '', nextPlan: 'b', percent: 10 }))).toBe('TOPIC_NOT_IN_PROGRESS');
  });

  it('409 NO_REQUIRED_MILESTONE (không mốc / chỉ mốc không bắt buộc), MILESTONES_NOT_PASSED kèm danh sách, NO_FINAL_RESULT', async () => {
    const { t: a } = await mkRunning({ milestones: [] });
    expect(code(await act('lecA', a, { action: 'REQUEST_CLOSE' }))).toBe('NO_REQUIRED_MILESTONE');
    await prisma.milestone.create({ data: { topicId: a.id, order: 1, name: 'Phụ', output: 'x', dueAt: at(1), required: false, evaluation: 'PASSED', createdById: U.lecA.id } });
    expect(code(await act('lecA', a, { action: 'REQUEST_CLOSE' }))).toBe('NO_REQUIRED_MILESTONE');
    const { t: b } = await mkRunning({ milestones: ['PASSED', 'NEEDS_WORK', 'PENDING'] });
    const rb = await act('lecA', b, { action: 'REQUEST_CLOSE' });
    expect([rb.status, code(rb), rb.body.error.details.milestones.map((m) => m.name)]).toEqual([409, 'MILESTONES_NOT_PASSED', ['Mốc 2', 'Mốc 3']]);
    const { t: c } = await mkRunning({ result: false });
    expect(code(await act('lecA', c, { action: 'REQUEST_CLOSE' }))).toBe('NO_FINAL_RESULT');
    for (const x of [a, b, c]) expect((await prisma.topic.findUnique({ where: { id: x.id } })).status).toBe('IN_PROGRESS');
    expect(await prisma.statusHistory.count({ where: { topicId: { in: [a.id, b.id, c.id] } } })).toBe(0);
  });

  it('G25: kết quả do GV cũ tạo không tính – NO_FINAL_RESULT', async () => {
    const { t } = await mkRunning({ result: false });
    await prisma.advising.updateMany({ where: { topicId: t.id }, data: { endAt: new Date() } });
    await prisma.advising.create({ data: { topicId: t.id, lecturerId: U.lecB.id } });
    await prisma.resultVersion.create({ data: { topicId: t.id, version: 1, result: 'GOOD', summary: 'Nhập bởi GV cũ trước khi thay.', createdById: U.lecA.id } });
    expect(code(await act('lecB', t, { action: 'REQUEST_CLOSE' }))).toBe('NO_FINAL_RESULT');
    expect((await get('lecB', `/api/topics/${t.id}`)).body.topic.closeReadiness.hasFinalResult).toBe(false);
  });

  it('403 vai trò/quan hệ sai; 409 sai trạng thái; 409 lệch version', async () => {
    const { t, leader } = await mkRunning();
    for (const who of [leader, 'lecB', 'staff1', 'staff2', 's60', 'admin']) expect((await act(who, t, { action: 'REQUEST_CLOSE' })).status, who).toBe(403);
    expect(code(await act('lecA', t, { action: 'REQUEST_CLOSE', version: 5 }))).toBe('CONCURRENT_UPDATE');
    const { t: w } = await mkRunning({ status: 'WAITING_CLOSE' });
    expect(code(await act('lecA', w, { action: 'REQUEST_CLOSE' }))).toBe('INVALID_TRANSITION');
  });

  it('đua thật: REQUEST_CLOSE ‖ tạo mốc bắt buộc mới – không bao giờ cả hai thành công', async () => {
    for (let i = 0; i < 6; i++) {
      const { t } = await mkRunning();
      const [c, m] = await Promise.all([
        act('lecA', t, { action: 'REQUEST_CLOSE' }),
        post('lecA', `/api/topics/${t.id}/milestones`, { name: 'Mốc thêm gấp', output: 'PDF', dueAt: at(5).toISOString() }),
      ]);
      expect(c.status === 200 && m.status === 201, `${c.status} ${m.status}`).toBe(false);
      const topic = await prisma.topic.findUnique({ where: { id: t.id } });
      const pending = await prisma.milestone.count({ where: { topicId: t.id, required: true, evaluation: { not: 'PASSED' } } });
      if (topic.status === 'WAITING_CLOSE') expect([pending, code(m)]).toEqual([0, 'TOPIC_NOT_IN_PROGRESS']);
      else expect([c.status, ['MILESTONES_NOT_PASSED', 'CONCURRENT_UPDATE']]).toEqual([409, expect.arrayContaining([code(c)])]);
    }
  });
});

describe('RETURN_TO_ADVISOR / CONFIRM_CLOSE', () => {
  it('cán bộ trả lại có lý do → IN_PROGRESS; kết quả, mốc giữ nguyên; GV không trả lại được', async () => {
    const { t } = await mkRunning({ status: 'WAITING_CLOSE' });
    expect((await act('staff1', t, { action: 'RETURN_TO_ADVISOR' })).status).toBe(400);
    expect((await act('lecA', t, { action: 'RETURN_TO_ADVISOR', reason: 'Thiếu minh chứng' })).status).toBe(403);
    expect((await act('staff2', t, { action: 'RETURN_TO_ADVISOR', reason: 'Thiếu minh chứng' })).status).toBe(403);
    const r = await act('staff1', t, { action: 'RETURN_TO_ADVISOR', reason: 'Thiếu minh chứng sản phẩm' });
    expect([r.status, r.body.topic.status]).toEqual([200, 'IN_PROGRESS']);
    const [h] = await history(t);
    expect([h.from, h.to, h.action, h.reason]).toEqual(['WAITING_CLOSE', 'IN_PROGRESS', 'RETURN_TO_ADVISOR', 'Thiếu minh chứng sản phẩm']);
    expect(await prisma.resultVersion.count({ where: { topicId: t.id, isCurrent: true } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'TOPIC_RETURN_TO_ADVISOR', entityId: t.id } })).toBe(1);
  });

  it('xác nhận đóng kiểm lại theo đánh giá hiện hành; đạt → CLOSED, không tạo kết quả mới, chỉ đọc, vào kho', async () => {
    const { t, leader } = await mkRunning({ status: 'WAITING_CLOSE' });
    await prisma.milestone.updateMany({ where: { topicId: t.id }, data: { evaluation: 'NEEDS_WORK' } }); // như FR22 mở lại mốc
    expect(code(await act('staff1', t, { action: 'CONFIRM_CLOSE' }))).toBe('MILESTONES_NOT_PASSED');
    await prisma.milestone.updateMany({ where: { topicId: t.id }, data: { evaluation: 'PASSED' } });
    expect((await act('lecA', t, { action: 'CONFIRM_CLOSE' })).status).toBe(403);
    expect((await act('staff2', t, { action: 'CONFIRM_CLOSE' })).status).toBe(403);
    const r = await act('staff1', t, { action: 'CONFIRM_CLOSE' });
    expect([r.status, r.body.topic.status, r.body.topic.closeReadiness, r.body.topic.availableActions]).toEqual([200, 'CLOSED', null, []]);
    expect(await prisma.resultVersion.count({ where: { topicId: t.id } })).toBe(1);
    expect((await history(t)).map((h) => h.action)).toEqual(['CONFIRM_CLOSE']);
    expect(code(await post('lecA', `/api/topics/${t.id}/results`, { result: 'EXCELLENT', summary: 'Sửa sau khi đóng không được.', expectedVersion: 1 }))).toBe('TOPIC_NOT_IN_PROGRESS');
    expect(code(await act('staff1', t, { action: 'CONFIRM_CLOSE', version: 1 }))).toBe('INVALID_TRANSITION');
    const repo = await get(leader, `/api/repository?q=${encodeURIComponent(t.title)}`);
    expect(repo.body.items.map((x) => x.code)).toContain(t.code);
  });
});

describe('CLOSE_EXPIRED', () => {
  it('đợt chưa hết hạn → ROUND_NOT_ENDED; đủ điều kiện → CLOSE_CONDITIONS_MET', async () => {
    const { t } = await mkRunning({ milestones: ['NEEDS_WORK'] });
    expect(code(await act('staff1', t, { action: 'CLOSE_EXPIRED', reason: 'Hết hạn đợt' }))).toBe('ROUND_NOT_ENDED');
    const { t: ok } = await mkRunning({ round: ended });
    expect(code(await act('staff1', ok, { action: 'CLOSE_EXPIRED', reason: 'Hết hạn đợt' }))).toBe('CLOSE_CONDITIONS_MET');
  });

  it('chưa đủ điều kiện, đợt hết hạn → CLOSED + ResultVersion FAIL mới (bản cũ hạ), StatusHistory có lý do; 403/400', async () => {
    const { t, leader } = await mkRunning({ round: ended, milestones: ['NEEDS_WORK'] });
    const view = (await get('staff1', `/api/topics/${t.id}`)).body.topic;
    expect([view.round.ended, view.availableActions]).toEqual([true, ['CLOSE_EXPIRED']]);
    expect((await act('staff1', t, { action: 'CLOSE_EXPIRED' })).status).toBe(400);
    for (const who of ['lecA', leader, 'staff2', 'admin']) expect((await act(who, t, { action: 'CLOSE_EXPIRED', reason: 'Hết hạn đợt' })).status, who).toBe(403);
    const r = await act('staff1', t, { action: 'CLOSE_EXPIRED', reason: 'Nhóm không hoàn thành mốc' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.topic).toMatchObject({ status: 'CLOSED', currentResult: { version: 2, result: 'FAIL' } });
    const rv = await prisma.resultVersion.findMany({ where: { topicId: t.id }, orderBy: { version: 'asc' } });
    expect(rv.map((x) => [x.version, x.result, x.isCurrent])).toEqual([[1, 'GOOD', false], [2, 'FAIL', true]]);
    expect([rv[1].summary, rv[1].reason, rv[1].createdById]).toEqual(['Đóng do hết hạn đợt: Nhóm không hoàn thành mốc', 'Nhóm không hoàn thành mốc', U.staff1.id]);
    const [h] = await history(t);
    expect([h.to, h.action, h.reason]).toEqual(['CLOSED', 'CLOSE_EXPIRED', 'Nhóm không hoàn thành mốc']);
    expect(await prisma.auditLog.count({ where: { entityId: { in: [t.id, rv[1].id] }, action: { in: ['TOPIC_CLOSE_EXPIRED', 'RESULT_CREATE'] } } })).toBe(2);
  });

  it('không có kết quả trước đó → FAIL version 1', async () => {
    const { t } = await mkRunning({ round: ended, milestones: [], result: false });
    expect((await act('staff1', t, { action: 'CLOSE_EXPIRED', reason: 'Không có sản phẩm' })).status).toBe(200);
    expect((await prisma.resultVersion.findMany({ where: { topicId: t.id } })).map((x) => [x.version, x.result, x.isCurrent])).toEqual([[1, 'FAIL', true]]);
  });
});

describe('MINOR m2 T404: tài liệu chưa READY', () => {
  it('nhận xét trên bản UPLOADING → 404', async () => {
    const { t, leader } = await mkRunning();
    const m = await prisma.milestone.findFirst({ where: { topicId: t.id } });
    const d = await prisma.document.create({ data: { topicId: t.id, milestoneId: m.id, stage: 'MIDTERM', kind: 'LINK', externalUrl: 'https://x.vn', fileName: 'L', version: 1, status: 'UPLOADING', uploadedById: U[leader].id } });
    expect((await post('lecA', `/api/documents/${d.id}/feedbacks`, { content: 'Nhận xét' })).status).toBe(404);
  });
});
