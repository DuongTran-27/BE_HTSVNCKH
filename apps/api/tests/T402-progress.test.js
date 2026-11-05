// T402 (FR10, API_GD45 §4): tiến độ tự khai, khóa sau nhận xét. DB test thật.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { prisma, S, U, seedBase, mkTopic, addMember, post, get, as, app } from './t214-kit.js';

const patch = (who, url, body) => request(app).patch(url).set(as(who)).send(body);
let seq = 0;
const mkRunning = async (extra = {}) => {
  const t = await mkTopic(`s${++seq}`, S.round, { status: 'IN_PROGRESS', ...extra });
  await prisma.advising.create({ data: { topicId: t.id, lecturerId: U.lecA.id } });
  return { t, leader: `s${seq}` };
};
const body = (o = {}) => ({ done: 'Đã làm', issues: 'Khó khăn', nextPlan: 'Kế hoạch', percent: 40, ...o });
const mk = (who, t, o) => post(who, `/api/topics/${t.id}/progress`, body(o));

beforeAll(() => seedBase({ students: 40 }), 60000);
afterAll(() => prisma.$disconnect());

describe('POST /api/topics/:id/progress', () => {
  it('thành viên SV tạo được: tác giả, selfReported, issues mặc định rỗng, AuditLog', async () => {
    const { t, leader } = await mkRunning();
    await addMember(t, 's40');
    const r = await mk('s40', t);
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.progress).toMatchObject({ percent: 40, selfReported: true, lockedAt: null, feedbacks: [], author: { id: U.s40.id, code: 's40' } });
    const r2 = await post(leader, `/api/topics/${t.id}/progress`, { done: 'a', nextPlan: 'b', percent: 0 });
    expect([r2.status, r2.body.progress.issues]).toEqual([201, '']);
    expect(await prisma.auditLog.count({ where: { action: 'PROGRESS_CREATE', entityId: r.body.progress.id } })).toBe(1);
  });

  it('403: GVHD, cán bộ, SV ngoài nhóm, GV khác, ADMIN', async () => {
    const { t } = await mkRunning();
    for (const who of ['lecA', 'staff1', 's39', 'lecB', 'admin']) expect((await mk(who, t)).status, who).toBe(403);
    expect(await prisma.progressUpdate.count({ where: { topicId: t.id } })).toBe(0);
  });

  it('409 TOPIC_NOT_IN_PROGRESS ở mọi trạng thái khác', async () => {
    for (const status of ['HAS_ADVISOR', 'WAITING_CLOSE', 'CLOSED']) {
      const { t, leader } = await mkRunning({ status });
      const r = await mk(leader, t);
      expect([r.status, r.body.error.code], status).toEqual([409, 'TOPIC_NOT_IN_PROGRESS']);
    }
  });

  it('400: percent ngoài 0–100 hoặc không nguyên, thiếu done/nextPlan; 404 đề tài không có', async () => {
    const { t, leader } = await mkRunning();
    for (const o of [{ percent: 101 }, { percent: -1 }, { percent: 10.5 }, { percent: '50' }, { done: ' ' }, { nextPlan: '' }]) expect((await mk(leader, t, o)).status, JSON.stringify(o)).toBe(400);
    expect((await post(leader, '/api/topics/khongco123/progress', body())).status).toBe(404);
  });
});

describe('GET /api/topics/:id/progress', () => {
  it('đọc: thành viên, GVHD, cán bộ; phân trang mới nhất trước; người ngoài/ADMIN 403', async () => {
    const { t, leader } = await mkRunning();
    for (const n of [10, 20, 30]) await mk(leader, t, { percent: n });
    const lec = await prisma.progressUpdate.findFirst({ where: { topicId: t.id }, orderBy: { createdAt: 'asc' } });
    await prisma.feedback.create({ data: { topicId: t.id, progressUpdateId: lec.id, lecturerId: U.lecA.id, content: 'Tốt' } });
    for (const who of [leader, 'lecA', 'staff1']) {
      const r = await get(who, `/api/topics/${t.id}/progress?pageSize=2`);
      expect(r.status, who).toBe(200);
      expect([r.body.total, r.body.items.map((p) => p.percent)]).toEqual([3, [30, 20]]);
    }
    const all = await get(leader, `/api/topics/${t.id}/progress`);
    expect(all.body.items[2].feedbacks).toMatchObject([{ content: 'Tốt', lecturer: { fullName: U.lecA.fullName } }]);
    for (const who of ['s39', 'lecB', 'staff2', 'admin']) expect((await get(who, `/api/topics/${t.id}/progress`)).status, who).toBe(403);
  });

  it('đọc được khi đề tài đã đóng', async () => {
    const { t, leader } = await mkRunning({ status: 'CLOSED' });
    expect((await get(leader, `/api/topics/${t.id}/progress`)).status).toBe(200);
  });
});

describe('PATCH /api/progress/:id', () => {
  it('chính tác giả sửa được một phần; AuditLog before/after', async () => {
    const { t, leader } = await mkRunning();
    const p = (await mk(leader, t)).body.progress;
    const r = await patch(leader, `/api/progress/${p.id}`, { percent: 70 });
    expect([r.status, r.body.progress.percent, r.body.progress.done]).toEqual([200, 70, 'Đã làm']);
    const a = await prisma.auditLog.findFirst({ where: { action: 'PROGRESS_UPDATE', entityId: p.id } });
    expect([a.before.percent, a.after.percent]).toEqual([40, 70]);
  });

  it('403: thành viên khác (kể cả trưởng nhóm khi không phải tác giả), GVHD, cán bộ, ngoài nhóm, ADMIN', async () => {
    const { t, leader } = await mkRunning();
    await addMember(t, 's38');
    const p = (await mk('s38', t)).body.progress;
    for (const who of [leader, 'lecA', 'staff1', 's39', 'admin']) expect((await patch(who, `/api/progress/${p.id}`, { percent: 1 })).status, who).toBe(403);
  });

  it('409 PROGRESS_LOCKED sau khi bị khóa; 409 sai trạng thái; 400 body rỗng/trường lạ; 404', async () => {
    const { t, leader } = await mkRunning();
    const p = (await mk(leader, t)).body.progress;
    expect((await patch(leader, `/api/progress/${p.id}`, {})).status).toBe(400);
    expect((await patch(leader, `/api/progress/${p.id}`, { percent: 5, authorId: 'x' })).status).toBe(400);
    await prisma.progressUpdate.update({ where: { id: p.id }, data: { lockedAt: new Date() } });
    const r = await patch(leader, `/api/progress/${p.id}`, { percent: 5 });
    expect([r.status, r.body.error.code]).toEqual([409, 'PROGRESS_LOCKED']);
    expect((await prisma.progressUpdate.findUnique({ where: { id: p.id } })).percent).toBe(40);
    const q = (await mk(leader, t)).body.progress;
    await prisma.topic.update({ where: { id: t.id }, data: { status: 'WAITING_CLOSE' } });
    expect((await patch(leader, `/api/progress/${q.id}`, { percent: 5 })).body.error.code).toBe('TOPIC_NOT_IN_PROGRESS');
    expect((await patch(leader, '/api/progress/khongco123', { percent: 5 })).status).toBe(404);
  });

  it('sửa || khóa đồng thời (nhận xét thật qua HTTP): không có bản sửa sau khi đã khóa', async () => {
    for (let i = 0; i < 12; i++) {
      const { t, leader } = await mkRunning();
      const p = (await mk(leader, t)).body.progress;
      const [r, f] = await Promise.all([
        patch(leader, `/api/progress/${p.id}`, { percent: 99 }),
        post('lecA', `/api/progress/${p.id}/feedbacks`, { content: 'Tốt, tiếp tục' }), // khóa qua nhận xét §6.2
      ]);
      expect(f.status, JSON.stringify(f.body)).toBe(201);
      const row = await prisma.progressUpdate.findUnique({ where: { id: p.id } });
      expect(row.lockedAt).not.toBeNull();
      if (r.status === 409) {
        expect([r.body.error.code, row.percent]).toEqual(['PROGRESS_LOCKED', 40]);
        expect(f.body.progress.percent).toBe(40);
      } else {
        expect([r.status, row.percent]).toEqual([200, 99]);
        expect(f.body.progress.percent).toBe(99); // sửa phải commit trước khi khóa
      }
    }
  });
});
