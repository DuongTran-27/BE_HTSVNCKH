// T404 (FR12, API_GD45 §6): nhận xét bản nộp + đánh giá mốc, nhận xét tiến độ (khóa FR10), kết quả cuối có phiên bản. DB test thật.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { prisma, S, U, seedBase, mkTopic, post, get, as, app, day } from './t214-kit.js';

const patch = (who, url, body) => request(app).patch(url).set(as(who)).send(body);
const code = (r) => r.body.error?.code;
let seq = 0;
const mkRunning = async (extra = {}) => {
  const leader = `s${++seq}`;
  const t = await mkTopic(leader, S.round, { status: 'IN_PROGRESS', ...extra });
  await prisma.advising.create({ data: { topicId: t.id, lecturerId: U.lecA.id } });
  return { t, leader };
};
const mkMilestone = (t, o = {}) => prisma.milestone.create({ data: { topicId: t.id, order: 1, name: 'Giữa kỳ', output: 'Báo cáo', dueAt: new Date(Date.now() + day), createdById: U.lecA.id, ...o } });
const mkDoc = (t, leader, o = {}) => prisma.document.create({
  data: { topicId: t.id, stage: o.milestoneId ? 'MIDTERM' : 'PROPOSAL', kind: 'LINK', externalUrl: 'https://x.vn', fileName: 'L', version: 1, status: 'READY', uploadedById: U[leader].id, ...o },
});
const fbDoc = (who, d, body) => post(who, `/api/documents/${d.id}/feedbacks`, { content: 'Nhận xét', ...body });
const fbProg = (who, id, content = 'Tốt, tiếp tục') => post(who, `/api/progress/${id}/feedbacks`, { content });
const mkProgress = (t, leader) => prisma.progressUpdate.create({ data: { topicId: t.id, authorId: U[leader].id, done: 'a', issues: '', nextPlan: 'b', percent: 40 } });
const result = (who, t, o = {}) => post(who, `/api/topics/${t.id}/results`, { result: 'GOOD', summary: 'Nhóm hoàn thành tốt mục tiêu đề ra.', expectedVersion: 0, ...o });

beforeAll(() => seedBase({ students: 60 }), 60000);
afterAll(() => prisma.$disconnect());

describe('POST /api/documents/:id/feedbacks', () => {
  it('GVHD nhận xét gắn đúng bản nộp (kể cả bản cũ), không đổi mốc; AuditLog', async () => {
    const { t, leader } = await mkRunning();
    const m = await mkMilestone(t);
    const d1 = await mkDoc(t, leader, { milestoneId: m.id });
    await mkDoc(t, leader, { milestoneId: m.id, version: 2 });
    const r = await fbDoc('lecA', d1);
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.feedback).toMatchObject({ target: 'DOCUMENT', documentId: d1.id, documentVersion: 1, milestoneId: m.id, evaluation: null, lecturer: { id: U.lecA.id } });
    expect(r.body.milestone).toMatchObject({ id: m.id, evaluation: 'PENDING', version: 0 });
    expect(await prisma.auditLog.count({ where: { action: 'FEEDBACK_CREATE', entityId: r.body.feedback.id } })).toBe(1);
  });

  it('đánh giá mốc Cần bổ sung → Đạt trên bản mới nhất; khóa lạc quan; sau Đạt thì 409', async () => {
    const { t, leader } = await mkRunning();
    const m = await mkMilestone(t);
    const d = await mkDoc(t, leader, { milestoneId: m.id });
    const r1 = await fbDoc('lecA', d, { evaluation: 'NEEDS_WORK', milestoneVersion: 0 });
    expect([r1.status, r1.body.milestone.evaluation, r1.body.milestone.version, r1.body.feedback.evaluation]).toEqual([201, 'NEEDS_WORK', 1, 'NEEDS_WORK']);
    const stale = await fbDoc('lecA', d, { evaluation: 'PASSED', milestoneVersion: 0 });
    expect([stale.status, code(stale)]).toEqual([409, 'CONCURRENT_UPDATE']);
    const r2 = await fbDoc('lecA', d, { evaluation: 'PASSED', milestoneVersion: 1 });
    expect([r2.status, r2.body.milestone.evaluation]).toEqual([201, 'PASSED']);
    const r3 = await fbDoc('lecA', d, { evaluation: 'NEEDS_WORK', milestoneVersion: 2 });
    expect([r3.status, code(r3)]).toEqual([409, 'MILESTONE_ALREADY_PASSED']);
    expect((await fbDoc('lecA', d)).status).toBe(201); // nhận xét không đánh giá vẫn được
    const a = await prisma.auditLog.findMany({ where: { action: 'MILESTONE_EVALUATE', entityId: m.id }, orderBy: [{ at: 'asc' }, { id: 'asc' }] });
    expect(a.map((x) => [x.before.evaluation, x.after.evaluation])).toEqual([['PENDING', 'NEEDS_WORK'], ['NEEDS_WORK', 'PASSED']]);
    expect(await prisma.feedback.count({ where: { documentId: d.id } })).toBe(3); // lỗi 409 không tạo nhận xét
  });

  it('409 STALE_DOCUMENT khi đánh giá trên bản cũ; 400 đánh giá đề cương/thiếu milestoneVersion/giá trị lạ', async () => {
    const { t, leader } = await mkRunning();
    const m = await mkMilestone(t);
    const d1 = await mkDoc(t, leader, { milestoneId: m.id });
    await mkDoc(t, leader, { milestoneId: m.id, version: 2 });
    const r = await fbDoc('lecA', d1, { evaluation: 'PASSED', milestoneVersion: 0 });
    expect([r.status, code(r)]).toEqual([409, 'STALE_DOCUMENT']);
    expect((await prisma.milestone.findUnique({ where: { id: m.id } })).evaluation).toBe('PENDING');
    const p = await mkDoc(t, leader, { stage: 'PROPOSAL' });
    const r2 = await fbDoc('lecA', p, { evaluation: 'PASSED', milestoneVersion: 0 });
    expect([r2.status, r2.body.error.details?.evaluation]).toEqual([400, 'Chỉ đánh giá được tài liệu của mốc']);
    for (const b of [{ evaluation: 'PASSED' }, { evaluation: 'PENDING', milestoneVersion: 0 }, { content: ' ' }, { content: 'x'.repeat(2001) }, { lecturerId: 'x' }]) {
      expect((await fbDoc('lecA', d1, b)).status, JSON.stringify(b)).toBe(400);
    }
    expect((await fbDoc('lecA', p)).status).toBe(201); // nhận xét đề cương không đánh giá: được
  });

  it('403: SV thành viên, cán bộ, GV khác, GV cũ, SV ngoài, ADMIN; 404 tài liệu không có', async () => {
    const { t, leader } = await mkRunning();
    await prisma.advising.create({ data: { topicId: t.id, lecturerId: U.lecC.id, endAt: new Date() } });
    const d = await mkDoc(t, leader);
    for (const who of [leader, 'staff1', 'lecB', 'lecC', 's60', 'admin']) expect((await fbDoc(who, d)).status, who).toBe(403);
    expect(await prisma.feedback.count({ where: { documentId: d.id } })).toBe(0);
    expect((await fbDoc('lecA', { id: 'khongco123' })).status).toBe(404);
  });

  it('409 TOPIC_NOT_IN_PROGRESS khi chờ đóng/đã đóng', async () => {
    for (const status of ['WAITING_CLOSE', 'CLOSED']) {
      const { t, leader } = await mkRunning({ status });
      const r = await fbDoc('lecA', await mkDoc(t, leader));
      expect([r.status, code(r)], status).toEqual([409, 'TOPIC_NOT_IN_PROGRESS']);
    }
  });
});

describe('POST /api/progress/:id/feedbacks (khóa tiến độ FR10)', () => {
  it('nhận xét khóa bản tiến độ; nhận xét lần hai giữ lockedAt; SV sửa sau đó 409 PROGRESS_LOCKED', async () => {
    const { t, leader } = await mkRunning();
    const p = await mkProgress(t, leader);
    const r = await fbProg('lecA', p.id);
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.feedback).toMatchObject({ target: 'PROGRESS', progressUpdateId: p.id, documentId: null, documentVersion: null });
    expect(r.body.progress.lockedAt).not.toBeNull();
    expect(r.body.progress.feedbacks).toHaveLength(1);
    const r2 = await fbProg('lecA', p.id, 'Thêm ý');
    expect([r2.status, r2.body.progress.lockedAt, r2.body.progress.feedbacks.length]).toEqual([201, r.body.progress.lockedAt, 2]);
    const e = await patch(leader, `/api/progress/${p.id}`, { percent: 90 });
    expect([e.status, code(e)]).toEqual([409, 'PROGRESS_LOCKED']);
    expect(await prisma.auditLog.count({ where: { action: 'FEEDBACK_CREATE', after: { path: ['progressUpdateId'], equals: p.id } } })).toBe(2);
  });

  it('403 vai trò sai, 409 sai trạng thái, 400 nội dung rỗng, 404', async () => {
    const { t, leader } = await mkRunning();
    const p = await mkProgress(t, leader);
    for (const who of [leader, 'staff1', 'lecB', 's60', 'admin']) expect((await fbProg(who, p.id)).status, who).toBe(403);
    expect((await fbProg('lecA', p.id, '')).status).toBe(400);
    expect((await fbProg('lecA', 'khongco123')).status).toBe(404);
    expect((await prisma.progressUpdate.findUnique({ where: { id: p.id } })).lockedAt).toBeNull();
    await prisma.topic.update({ where: { id: t.id }, data: { status: 'WAITING_CLOSE' } });
    expect(code(await fbProg('lecA', p.id))).toBe('TOPIC_NOT_IN_PROGRESS');
  });

  it('đua thật nhận xét ‖ sửa tiến độ qua HTTP: không có bản sửa sau khi đã nhận xét', async () => {
    for (let i = 0; i < 12; i++) {
      const { t, leader } = await mkRunning();
      const p = (await post(leader, `/api/topics/${t.id}/progress`, { done: 'a', nextPlan: 'b', percent: 40 })).body.progress;
      const [e, f] = await Promise.all([patch(leader, `/api/progress/${p.id}`, { percent: 99 }), fbProg('lecA', p.id)]);
      expect(f.status, JSON.stringify(f.body)).toBe(201);
      const row = await prisma.progressUpdate.findUnique({ where: { id: p.id } });
      expect(row.lockedAt).not.toBeNull();
      if (e.status === 409) {
        expect([code(e), row.percent]).toEqual(['PROGRESS_LOCKED', 40]);
        expect(f.body.progress.percent).toBe(40);
      } else {
        expect([e.status, row.percent]).toEqual([200, 99]);
        // progress của nhận xét đọc TRONG transaction khóa: sửa thắng thì phải commit trước khi khóa (không dùng so updatedAt/lockedAt vì hai nguồn đồng hồ khác nhau)
        expect(f.body.progress.percent).toBe(99);
      }
    }
  });
});

describe('PATCH /api/progress/:id không đổi giá trị (MINOR T402)', () => {
  it('200, không ghi AuditLog, không đổi updatedAt', async () => {
    const { t, leader } = await mkRunning();
    const p = (await post(leader, `/api/topics/${t.id}/progress`, { done: 'a', nextPlan: 'b', percent: 40 })).body.progress;
    const r = await patch(leader, `/api/progress/${p.id}`, { percent: 40, done: 'a' });
    expect([r.status, r.body.progress.updatedAt]).toEqual([200, p.updatedAt]);
    expect(await prisma.auditLog.count({ where: { action: 'PROGRESS_UPDATE', entityId: p.id } })).toBe(0);
    await patch(leader, `/api/progress/${p.id}`, { percent: 40, done: 'c' });
    const a = await prisma.auditLog.findFirst({ where: { action: 'PROGRESS_UPDATE', entityId: p.id } });
    expect([a.before.done, a.after.done]).toEqual(['a', 'c']);
  });
});

describe('GET /api/topics/:id/feedbacks', () => {
  it('lọc theo bản nộp/mốc/tiến độ, mới nhất trước; thành viên, GVHD, cán bộ đọc; người ngoài/ADMIN 403', async () => {
    const { t, leader } = await mkRunning();
    const m = await mkMilestone(t);
    const d = await mkDoc(t, leader, { milestoneId: m.id });
    const p = await mkProgress(t, leader);
    await fbDoc('lecA', d, { content: 'một' });
    await fbDoc('lecA', d, { content: 'hai' });
    await fbProg('lecA', p.id, 'ba');
    for (const who of [leader, 'lecA', 'staff1']) {
      const r = await get(who, `/api/topics/${t.id}/feedbacks?pageSize=2`);
      expect([r.status, r.body.total, r.body.items.map((f) => f.content)], who).toEqual([200, 3, ['ba', 'hai']]);
    }
    expect((await get(leader, `/api/topics/${t.id}/feedbacks?documentId=${d.id}`)).body.total).toBe(2);
    expect((await get(leader, `/api/topics/${t.id}/feedbacks?milestoneId=${m.id}`)).body.total).toBe(2);
    expect((await get(leader, `/api/topics/${t.id}/feedbacks?progressUpdateId=${p.id}`)).body.items.map((f) => f.content)).toEqual(['ba']);
    for (const who of ['s60', 'lecB', 'staff2', 'admin']) expect((await get(who, `/api/topics/${t.id}/feedbacks`)).status, who).toBe(403);
  });
});

describe('Kết quả cuối /api/topics/:id/results', () => {
  it('GVHD nhập nhiều lần = nhiều phiên bản, chỉ một bản hiện hành; SV thấy ngay (CAU_HOI #9); AuditLog', async () => {
    const { t, leader } = await mkRunning();
    const r1 = await result('lecA', t);
    expect(r1.status, JSON.stringify(r1.body)).toBe(201);
    expect(r1.body.result).toMatchObject({ version: 1, result: 'GOOD', isCurrent: true, reason: null, createdBy: { id: U.lecA.id, role: 'LECTURER' } });
    const r2 = await result('lecA', t, { result: 'EXCELLENT', expectedVersion: 1 });
    expect([r2.status, r2.body.result.version]).toEqual([201, 2]);
    const g = await get(leader, `/api/topics/${t.id}/results`);
    expect(g.status).toBe(200);
    expect(g.body.current).toMatchObject({ version: 2, result: 'EXCELLENT' });
    expect(g.body.items.map((x) => [x.version, x.isCurrent])).toEqual([[2, true], [1, false]]);
    const a = await prisma.auditLog.findFirst({ where: { action: 'RESULT_CREATE', entityId: r2.body.result.id } });
    expect([a.before, a.after]).toEqual([{ result: 'GOOD', version: 1 }, { result: 'EXCELLENT', version: 2 }]);
  });

  it('409 CONCURRENT_UPDATE khi expectedVersion lệch; hai GV gửi cùng lúc chỉ một bản thắng', async () => {
    const { t } = await mkRunning();
    expect(code(await result('lecA', t, { expectedVersion: 1 }))).toBe('CONCURRENT_UPDATE');
    const rs = await Promise.all([result('lecA', t), result('lecA', t, { result: 'PASS' })]);
    expect(rs.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await prisma.resultVersion.count({ where: { topicId: t.id } })).toBe(1);
  });

  it('400 thiếu/ngắn nhận xét tổng kết, kết quả ngoài thang; 403 vai trò sai; 409 sai trạng thái; đọc được khi đã đóng', async () => {
    const { t, leader } = await mkRunning();
    for (const o of [{ summary: 'ngắn' }, { summary: undefined }, { result: 'B' }, { expectedVersion: -1 }]) expect((await result('lecA', t, o)).status, JSON.stringify(o)).toBe(400);
    for (const who of [leader, 'staff1', 'lecB', 's60', 'admin']) expect((await result(who, t)).status, who).toBe(403);
    for (const who of ['s60', 'lecB', 'admin']) expect((await get(who, `/api/topics/${t.id}/results`)).status, who).toBe(403);
    expect((await get(leader, `/api/topics/${t.id}/results`)).body).toEqual({ current: null, items: [] });
    for (const status of ['WAITING_CLOSE', 'CLOSED']) {
      const x = await mkRunning({ status });
      expect(code(await result('lecA', x.t)), status).toBe('TOPIC_NOT_IN_PROGRESS');
      expect((await get(x.leader, `/api/topics/${x.t.id}/results`)).status).toBe(200);
    }
  });
});
