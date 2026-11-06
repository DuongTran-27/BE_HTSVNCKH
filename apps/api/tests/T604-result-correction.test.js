// T604 (FR23, API_GD6 §7): sửa sai kết quả bằng phiên bản mới; ảnh hưởng thống kê và kho /api/repository (MINOR 2 reviews/T213b-reviewer-v1.md). DB test thật.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma, S, U, seedBase, mkTopic, addMember, post, get } from './t214-kit.js';

const code = (r) => r.body.error?.code;
const SUM = 'Nhóm hoàn thành tốt các mục tiêu đề ra.';
const REASON = 'Nhập nhầm kết quả khi đóng';
let seq = 0;
// Đề tài có kết quả v1; lecA là GVHD, thành viên: trưởng nhóm + 1 thành viên
const mkClosed = async ({ status = 'CLOSED', result = 'GOOD', title } = {}) => {
  const leader = `s${++seq}`;
  const t = await mkTopic(leader, S.round, { status, ...(title && { title }) });
  const member = `s${++seq}`;
  await addMember(t, member);
  await prisma.advising.create({ data: { topicId: t.id, lecturerId: U.lecA.id } });
  await prisma.resultVersion.create({ data: { topicId: t.id, version: 1, result, summary: SUM, createdById: U.lecA.id } });
  return { t, leader, member };
};
const fix = (who, t, body) => post(who, `/api/topics/${t.id}/result-corrections`, { result: 'PASS', reason: REASON, expectedVersion: 1, ...body });
const versions = (t) => prisma.resultVersion.findMany({ where: { topicId: t.id }, orderBy: { version: 'asc' } });
const repoCodes = async (qs = '') => (await get('admin', `/api/repository?pageSize=100${qs}`)).body.items.map((i) => i.code);
const resultRows = async () => Object.fromEntries((await get('staff1', '/api/stats?groupBy=result')).body.rows.map((x) => [x.key, x.count]));

beforeAll(async () => { await seedBase({ students: 30 }); }, 60000);
afterAll(() => prisma.$disconnect());

describe('POST /api/topics/:id/result-corrections', () => {
  it('GOOD -> PASS: hai phiên bản, đúng một isCurrent, giữ nhận xét, AuditLog; thống kê đổi theo', async () => {
    const { t } = await mkClosed();
    const before = await resultRows();
    const r = await fix('staff1', t, {});
    expect(r.status).toBe(201);
    expect(r.body.result).toMatchObject({ version: 2, result: 'PASS', reason: REASON, isCurrent: true, summary: SUM, createdBy: { role: 'STAFF' } });
    const vs = await versions(t);
    expect(vs.map((v) => [v.version, v.result, v.isCurrent])).toEqual([[1, 'GOOD', false], [2, 'PASS', true]]);
    const a = await prisma.auditLog.findFirst({ where: { action: 'RESULT_CORRECT', entityId: vs[1].id } });
    expect(a).toMatchObject({ actorId: U.staff1.id, before: { version: 1, result: 'GOOD' }, after: { version: 2, result: 'PASS', reason: REASON } });
    const after = await resultRows();
    expect([(after.GOOD ?? 0) - (before.GOOD ?? 0), (after.PASS ?? 0) - (before.PASS ?? 0)]).toEqual([-1, 1]);
    expect((await get('staff1', '/api/stats/export.csv?groupBy=result')).status).toBe(200);
    const list = await get('lecA', `/api/topics/${t.id}/results`);
    expect(list.body.items).toHaveLength(2);
    expect(list.body.current.version).toBe(2);
  });

  it('chỉ đổi nhận xét tổng kết (cùng result) vẫn hợp lệ', async () => {
    const { t } = await mkClosed();
    const r = await fix('staff1', t, { result: 'GOOD', summary: 'Nhận xét tổng kết đã được chỉnh lại.' });
    expect(r.status).toBe(201);
    expect(r.body.result.summary).toBe('Nhận xét tổng kết đã được chỉnh lại.');
  });

  it('kho: GOOD -> FAIL rời kho (list, chi tiết 404, q không rò); FAIL -> PASS vào kho', async () => {
    const { t } = await mkClosed({ title: 'Hệ thống nhận dạng xyzzyquux' });
    expect(await repoCodes('&q=xyzzyquux')).toEqual([t.code]);
    expect((await get('s1', `/api/repository/${t.code}`)).status).toBe(200);
    expect((await fix('staff1', t, { result: 'FAIL' })).status).toBe(201);
    expect(await repoCodes()).not.toContain(t.code);
    expect(await repoCodes('&q=xyzzyquux')).toEqual([]);
    expect((await get('s1', `/api/repository/${t.code}`)).status).toBe(404);
    expect((await fix('staff1', t, { result: 'PASS', expectedVersion: 2 })).status).toBe(201);
    expect(await repoCodes('&q=xyzzyquux')).toEqual([t.code]);
    expect((await get('s1', `/api/repository/${t.code}`)).status).toBe(200);
  });

  it('thiếu/ngắn lý do 400; kết quả giống hiện hành 400; expectedVersion cũ 409', async () => {
    const { t } = await mkClosed();
    expect((await fix('staff1', t, { reason: undefined })).status).toBe(400);
    expect((await fix('staff1', t, { reason: 'ab' })).status).toBe(400);
    const same = await fix('staff1', t, { result: 'GOOD' });
    expect([same.status, code(same), same.body.error.details?._]).toEqual([400, 'VALIDATION_ERROR', 'Kết quả mới phải khác kết quả hiện hành']);
    const stale = await fix('staff1', t, { expectedVersion: 0 });
    expect([stale.status, code(stale)]).toEqual([409, 'CONCURRENT_UPDATE']);
    expect(await versions(t)).toHaveLength(1);
  });

  it('IN_PROGRESS / WAITING_CLOSE: 409 TOPIC_NOT_CLOSED', async () => {
    for (const status of ['IN_PROGRESS', 'WAITING_CLOSE']) {
      const { t } = await mkClosed({ status });
      const r = await fix('staff1', t, {});
      expect([r.status, code(r)], status).toEqual([409, 'TOPIC_NOT_CLOSED']);
    }
  });

  it('GVHD, sinh viên, cán bộ khoa khác, ADMIN: 403; chưa đăng nhập 401', async () => {
    const { t, leader } = await mkClosed();
    for (const who of ['lecA', leader, 'staff2', 'admin']) expect((await fix(who, t, {})).status, who).toBe(403);
    expect((await post('nobody', `/api/topics/${t.id}/result-corrections`, {})).status).toBe(401);
    expect(await versions(t)).toHaveLength(1);
  });

  it('đồng thời hai lần sửa cùng expectedVersion: một 201, một 409; đúng một isCurrent', async () => {
    const { t } = await mkClosed();
    const rs = await Promise.all([fix('staff1', t, { result: 'PASS' }), fix('staff1', t, { result: 'FAIL' })]);
    expect(rs.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(rs.find((r) => r.status === 409).body.error.code).toBe('CONCURRENT_UPDATE');
    const vs = await versions(t);
    expect(vs).toHaveLength(2);
    expect(vs.filter((v) => v.isCurrent)).toHaveLength(1);
  });

  it('thông báo: thành viên + GVHD nhận đúng một RESULT_CORRECTED; gọi lại (409) không thêm', async () => {
    const { t, leader, member } = await mkClosed();
    await fix('staff1', t, {});
    await fix('staff1', t, {});
    const ns = await prisma.notification.findMany({ where: { type: 'RESULT_CORRECTED', link: `/de-tai/${t.id}` } });
    expect(ns.map((n) => n.userId).sort()).toEqual([U[leader].id, U[member].id, U.lecA.id].sort());
    expect(ns.every((n) => !n.title.includes(REASON))).toBe(true);
  });

  it('permissions.correctResult chỉ cho cán bộ trong phạm vi khi CLOSED', async () => {
    const { t } = await mkClosed();
    expect((await get('staff1', `/api/topics/${t.id}`)).body.topic.permissions.correctResult).toBe(true);
    expect((await get('lecA', `/api/topics/${t.id}`)).body.topic.permissions.correctResult).toBe(false);
    const p = await mkClosed({ status: 'IN_PROGRESS' });
    expect((await get('staff1', `/api/topics/${p.t.id}`)).body.topic.permissions.correctResult).toBe(false);
  });
});
