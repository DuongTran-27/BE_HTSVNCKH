// T606 (FR22, API_GD6 §8): mở lại mốc đã Đạt + MINOR m6 T600 (dựng GV cũ bằng fixture) + m1/m2 T605. DB test thật.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { CHANGE_TYPE, milestoneReopenSchema } from '@nckh/shared';
import { createApp } from '../src/app.js';
import { createAuthRepo } from '../src/modules/auth/prismaRepo.js';
import { createTopicRepo } from '../src/modules/topics/prismaRepo.js';
import { createExecutionRepo } from '../src/modules/execution/prismaRepo.js';
import { createMilestoneService } from '../src/modules/execution/service.js';
import { TYPES } from '../src/modules/changeRequests/service.js';
import { fakeHasher, testEnv } from './helpers.js';
import { prisma, S, U, seedBase, mkTopic, addMember, CONTENT, post, get, act, at, day, app } from './t214-kit.js';

const code = (r) => r.body.error?.code;
const REASON = 'Phát hiện thiếu số liệu thực nghiệm';
const SECRET = 'secret-gia-cho-test-'.padEnd(48, 'x'); // bí mật giả, chỉ dùng trong test
const cronApp = () => createApp({ env: { ...testEnv, CRON_SECRET: SECRET }, logger: undefined, authRepo: createAuthRepo(prisma), hasher: fakeHasher, topicRepo: createTopicRepo(prisma) });
let seq = 0;
// Đề tài đang thực hiện: trưởng nhóm + 1 thành viên + lecA là GVHD; một mốc bắt buộc (mặc định PASSED)
const mkRunning = async ({ status = 'IN_PROGRESS', evaluation = 'PASSED', result = false } = {}) => {
  const leader = `s${++seq}`;
  const t = await mkTopic(leader, S.round, { status });
  const member = `s${++seq}`;
  await addMember(t, member);
  await prisma.advising.create({ data: { topicId: t.id, lecturerId: U.lecA.id } });
  const m = await prisma.milestone.create({ data: { topicId: t.id, order: 1, name: 'Giữa kỳ', output: 'Báo cáo', dueAt: at(5), evaluation, createdById: U.lecA.id } });
  if (result) await prisma.resultVersion.create({ data: { topicId: t.id, version: 1, result: 'GOOD', summary: 'Nhóm hoàn thành tốt mục tiêu.', createdById: U.lecA.id } });
  return { t, leader, member, m };
};
const reopen = (who, m, body = {}) => post(who, `/api/milestones/${m.id}/reopen`, { version: 0, reason: REASON, ...body });
const rawErr = (sql) => prisma.$executeRawUnsafe(sql).then(() => null, (e) => e.message);

beforeAll(() => seedBase({ students: 150 }), 60000);
afterAll(() => prisma.$disconnect());

describe('schema', () => {
  it('milestoneReopenSchema: lý do trim 5..2000, version nguyên ≥ 0, không nhận khóa lạ', () => {
    expect(milestoneReopenSchema.safeParse({ version: 0, reason: '  đủ dài  ' }).data).toEqual({ version: 0, reason: 'đủ dài' });
    for (const bad of [{ version: 0, reason: 'ngắn' }, { version: 0 }, { reason: REASON }, { version: -1, reason: REASON }, { version: 0, reason: REASON, evaluation: 'PASSED' }, { version: 0, reason: 'x'.repeat(2001) }]) {
      expect(milestoneReopenSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });
});

describe('POST /api/milestones/:id/reopen', () => {
  it('ca 1: GVHD mở lại mốc Đạt → NEEDS_WORK, version +1, bản ghi MilestoneReopen, AuditLog, thông báo thành viên, view + danh sách', async () => {
    const { t, leader, member, m } = await mkRunning();
    const r = await reopen('lecA', m);
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.milestone).toMatchObject({ id: m.id, evaluation: 'NEEDS_WORK', version: 1, reopenCount: 1, lastReopen: { reason: REASON, reopenedBy: { fullName: U.lecA.fullName } } });
    expect(r.body.reopen).toMatchObject({ reason: REASON, reopenedBy: { id: U.lecA.id, fullName: U.lecA.fullName } });
    const rows = await prisma.milestoneReopen.findMany({ where: { milestoneId: m.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: r.body.reopen.id, reopenedById: U.lecA.id, reason: REASON });
    expect(await prisma.auditLog.findFirst({ where: { action: 'MILESTONE_REOPEN', entityId: m.id } })).toMatchObject({
      actorId: U.lecA.id, before: { evaluation: 'PASSED', version: 0 }, after: { evaluation: 'NEEDS_WORK', version: 1, reason: REASON },
    });
    const ns = await prisma.notification.findMany({ where: { type: 'MILESTONE_REOPENED', dedupeKey: `MILESTONE_REOPENED:${rows[0].id}` }, include: { user: { select: { code: true } } } });
    expect(ns.map((n) => n.user.code).sort()).toEqual([leader, member].sort()); // người mở lại không tự nhận
    expect(ns[0].link).toBe(`/de-tai/${t.id}/moc`);
    expect((await get(leader, `/api/topics/${t.id}/milestones`)).body.items[0]).toMatchObject({ evaluation: 'NEEDS_WORK', reopenCount: 1 });
    // lần hai: Đạt lại rồi mở lại → danh sách giảm dần, count 2
    await prisma.milestone.update({ where: { id: m.id }, data: { evaluation: 'PASSED', version: { increment: 1 } } });
    const r2 = await reopen('lecA', m, { version: 2, reason: 'Lần hai: dữ liệu chưa khớp' });
    expect(r2.status).toBe(201);
    expect(r2.body.milestone).toMatchObject({ reopenCount: 2, lastReopen: { reason: 'Lần hai: dữ liệu chưa khớp' } });
    const list = await get(member, `/api/milestones/${m.id}/reopens`);
    expect(list.body.items.map((x) => x.reason)).toEqual(['Lần hai: dữ liệu chưa khớp', REASON]);
    expect((await get('lecB', `/api/milestones/${m.id}/reopens`)).status).toBe(403); // không đọc được đề tài
    expect((await get('staff1', `/api/milestones/${m.id}/reopens`)).status).toBe(200);
  });

  it('ca 2: mốc PENDING/NEEDS_WORK → 409 MILESTONE_NOT_PASSED; lý do ngắn/thiếu → 400; version cũ → 409 CONCURRENT_UPDATE; lỗi thì không ghi gì', async () => {
    for (const evaluation of ['PENDING', 'NEEDS_WORK']) {
      const { m } = await mkRunning({ evaluation });
      const r = await reopen('lecA', m);
      expect([r.status, code(r)]).toEqual([409, 'MILESTONE_NOT_PASSED']);
    }
    const { m } = await mkRunning();
    expect((await reopen('lecA', m, { reason: 'ngắn' })).status).toBe(400);
    expect((await reopen('lecA', m, { reason: undefined })).status).toBe(400);
    expect((await reopen('lecA', m, { version: undefined })).status).toBe(400);
    const stale = await reopen('lecA', m, { version: 7 });
    expect([stale.status, code(stale)]).toEqual([409, 'CONCURRENT_UPDATE']);
    expect((await get('lecA', '/api/milestones/khong-ton-tai/reopens')).status).toBe(404);
    expect((await reopen('lecA', { id: 'khong-ton-tai' })).status).toBe(404);
    expect(await prisma.milestoneReopen.count({ where: { milestoneId: m.id } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: 'MILESTONE_REOPEN', entityId: m.id } })).toBe(0);
    expect((await prisma.milestone.findUnique({ where: { id: m.id } })).evaluation).toBe('PASSED');
  });

  it('ca 3: SV, cán bộ, GV khác, GV cũ (fixture Advising, có/không quyền đọc), ADMIN → 403; không đăng nhập 401; đề tài WAITING_CLOSE → 409', async () => {
    const { t, leader, member, m } = await mkRunning();
    for (const who of [leader, member, 'staff1', 'staff2', 'lecB', 'admin']) {
      const r = await reopen(who, m);
      expect([who, r.status]).toEqual([who, 403]);
    }
    expect((await request(app).post(`/api/milestones/${m.id}/reopen`).send({ version: 0, reason: REASON })).status).toBe(401);
    // m6 T600: GV cũ dựng trực tiếp bằng Advising (không phụ thuộc T601) – lecA hết hạn, lecB thành GVHD
    await prisma.advising.updateMany({ where: { topicId: t.id, endAt: null }, data: { endAt: new Date() } });
    await prisma.advising.create({ data: { topicId: t.id, lecturerId: U.lecB.id } });
    expect((await reopen('lecA', m)).status).toBe(403);
    await prisma.advising.updateMany({ where: { topicId: t.id, lecturerId: U.lecA.id }, data: { readOnlyGranted: true } });
    expect((await reopen('lecA', m)).status).toBe(403); // đọc được nhưng không ghi
    expect((await get('lecA', `/api/milestones/${m.id}/reopens`)).status).toBe(200);
    expect((await reopen('lecB', m)).status).toBe(201); // GVHD mới
    const w = await mkRunning({ status: 'WAITING_CLOSE' });
    const r = await reopen('lecA', w.m);
    expect([r.status, code(r)]).toEqual([409, 'TOPIC_NOT_IN_PROGRESS']);
    expect(await prisma.milestoneReopen.count({ where: { milestoneId: w.m.id } })).toBe(0);
  });

  it('kiểm lại GVHD dưới khóa: quan hệ đọc trước đã cũ (GV vừa bị thay) → 403, không ghi', async () => {
    const { t, m } = await mkRunning();
    await prisma.advising.updateMany({ where: { topicId: t.id, endAt: null }, data: { endAt: new Date() } });
    await prisma.advising.create({ data: { topicId: t.id, lecturerId: U.lecB.id } });
    const real = createExecutionRepo(prisma);
    // findExecTopic trả ảnh chụp cũ (lecA còn là GVHD) như khi duyệt thay GV commit giữa lúc đọc và lúc khóa
    const stale = { ...real, findExecTopic: async (id) => ({ ...(await real.findExecTopic(id)), advisings: [{ lecturerId: U.lecA.id }] }) };
    const svc = createMilestoneService({ repo: stale });
    await expect(svc.reopen({ id: U.lecA.id, role: 'LECTURER', staffFacultyIds: [] }, m.id, { version: 0, reason: REASON }, '127.0.0.1')).rejects.toMatchObject({ status: 403 });
    expect((await prisma.milestone.findUnique({ where: { id: m.id } })).evaluation).toBe('PASSED');
    expect(await prisma.milestoneReopen.count({ where: { milestoneId: m.id } })).toBe(0);
  });

  it('ca 4: sau khi mở lại, REQUEST_CLOSE → 409 MILESTONES_NOT_PASSED; permissions.reopenMilestone chỉ GVHD khi IN_PROGRESS', async () => {
    const { t, leader, m } = await mkRunning({ result: true });
    expect((await get('lecA', `/api/topics/${t.id}`)).body.topic.permissions.reopenMilestone).toBe(true);
    for (const who of [leader, 'staff1', 'lecB']) expect((await get(who, `/api/topics/${t.id}`)).body.topic?.permissions.reopenMilestone ?? false, who).toBe(false);
    expect((await reopen('lecA', m)).status).toBe(201);
    const c = await act('lecA', t, { action: 'REQUEST_CLOSE' });
    expect([c.status, code(c)]).toEqual([409, 'MILESTONES_NOT_PASSED']);
    expect((await prisma.topic.findUnique({ where: { id: t.id } })).status).toBe('IN_PROGRESS');
    const w = await mkRunning({ status: 'WAITING_CLOSE' });
    expect((await get('lecA', `/api/topics/${w.t.id}`)).body.topic.permissions.reopenMilestone).toBe(false);
  });

  it('ca 5: đua thật mở lại ‖ REQUEST_CLOSE – không bao giờ WAITING_CLOSE với mốc bắt buộc chưa Đạt', async () => {
    for (let i = 0; i < 6; i++) {
      const { t, m } = await mkRunning({ result: true });
      const [o, c] = await Promise.all([reopen('lecA', m), act('lecA', t, { action: 'REQUEST_CLOSE' })]);
      const topic = await prisma.topic.findUnique({ where: { id: t.id } });
      const ms = await prisma.milestone.findUnique({ where: { id: m.id } });
      if (topic.status === 'WAITING_CLOSE') {
        expect([o.status, code(o), ms.evaluation]).toEqual([409, 'TOPIC_NOT_IN_PROGRESS', 'PASSED']);
      } else {
        expect([o.status, c.status, ms.evaluation]).toEqual([201, 409, 'NEEDS_WORK']);
        expect(['MILESTONES_NOT_PASSED', 'CONCURRENT_UPDATE']).toContain(code(c));
      }
    }
  });

  it('đua thật: hai lần mở lại cùng version → đúng một 201, một 409; đúng một bản ghi', async () => {
    for (let i = 0; i < 4; i++) {
      const { m } = await mkRunning();
      const rs = await Promise.all([reopen('lecA', m), reopen('lecA', m)]);
      expect(rs.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(['MILESTONE_NOT_PASSED', 'CONCURRENT_UPDATE']).toContain(code(rs.find((r) => r.status === 409)));
      expect(await prisma.milestoneReopen.count({ where: { milestoneId: m.id } })).toBe(1);
      expect(await prisma.auditLog.count({ where: { action: 'MILESTONE_REOPEN', entityId: m.id } })).toBe(1);
    }
  });

  it('ca 6: cron sau mở lại – mốc đã có bản nộp trước đó và hạn trong cửa sổ → nhắc MILESTONE_DUE_SOON; chưa mở lại thì không', async () => {
    const { t, leader, member, m } = await mkRunning({ evaluation: 'NEEDS_WORK' });
    await prisma.document.create({ data: { topicId: t.id, milestoneId: m.id, stage: 'MIDTERM', kind: 'LINK', externalUrl: 'https://x.vn', fileName: 'L', version: 1, status: 'READY', uploadedById: U[leader].id, uploadedAt: new Date(Date.now() - 2 * day) } });
    await prisma.milestone.update({ where: { id: m.id }, data: { dueAt: at(1), evaluation: 'PASSED', version: 5 } });
    const run = () => request(cronApp()).post('/api/cron/reminders').set('Authorization', `Bearer ${SECRET}`);
    const keyed = (type) => prisma.notification.count({ where: { type, dedupeKey: { contains: m.id } } });
    await prisma.milestone.update({ where: { id: m.id }, data: { evaluation: 'NEEDS_WORK' } }); // chưa mở lại thật: có bản nộp, không có nhận xét → không chờ nộp
    expect((await run()).status).toBe(200);
    expect(await keyed('MILESTONE_DUE_SOON')).toBe(0);
    await prisma.milestone.update({ where: { id: m.id }, data: { evaluation: 'PASSED' } });
    expect((await reopen('lecA', m, { version: 5 })).status).toBe(201);
    expect((await run()).status).toBe(200);
    const ns = await prisma.notification.findMany({ where: { type: 'MILESTONE_DUE_SOON', dedupeKey: { contains: m.id } }, include: { user: { select: { code: true } } } });
    expect(ns.map((n) => n.user.code).sort()).toEqual([leader, member].sort());
  });
});

describe('migration fr22_milestone_reopen', () => {
  it('bảng chỉ-thêm (UPDATE/DELETE/TRUNCATE bị chặn), có trigger + index + RLS', async () => {
    const { m } = await mkRunning();
    expect((await reopen('lecA', m)).status).toBe(201);
    expect(await rawErr(`UPDATE "MilestoneReopen" SET reason = 'x'`)).toMatch(/chỉ cho phép thêm mới/);
    expect(await rawErr(`DELETE FROM "MilestoneReopen"`)).toMatch(/chỉ cho phép thêm mới/);
    expect(await rawErr(`TRUNCATE "MilestoneReopen"`)).toMatch(/chỉ cho phép thêm mới/);
    const trg = (await prisma.$queryRaw`SELECT tgname FROM pg_trigger WHERE NOT tgisinternal`).map((r) => r.tgname);
    for (const n of ['milestone_reopen_immutable', 'milestone_reopen_no_truncate']) expect(trg, n).toContain(n);
    const idx = (await prisma.$queryRaw`SELECT indexname FROM pg_indexes WHERE tablename = 'MilestoneReopen'`).map((r) => r.indexname);
    expect(idx).toContain('MilestoneReopen_milestoneId_reopenedAt_idx');
    const [{ rls }] = await prisma.$queryRaw`SELECT relrowsecurity AS rls FROM pg_class WHERE relname = 'MilestoneReopen'`;
    expect(rls).toBe(true);
  });
});

describe('MINOR m1 T605 – đếm pending trước precheck FR06', () => {
  it('đã có TOPIC_CHANGE đang chờ: yêu cầu thứ hai 409 CHANGE_REQUEST_PENDING và KHÔNG chạy FR06 (không thêm SimilarityCheck)', async () => {
    const { t, leader } = await mkRunning();
    const body = (title) => ({ type: 'TOPIC_CHANGE', reason: 'Điều chỉnh hướng nghiên cứu', changes: { title } });
    const c1 = await post(leader, `/api/topics/${t.id}/change-requests`, body(CONTENT().title));
    expect(c1.status, JSON.stringify(c1.body)).toBe(201);
    expect(await prisma.similarityCheck.count({ where: { topicId: t.id } })).toBe(1);
    const c2 = await post(leader, `/api/topics/${t.id}/change-requests`, body(CONTENT().title));
    expect([c2.status, code(c2)]).toEqual([409, 'CHANGE_REQUEST_PENDING']);
    expect(await prisma.similarityCheck.count({ where: { topicId: t.id } })).toBe(1);
    expect(await prisma.changeRequest.count({ where: { topicId: t.id } })).toBe(1);
  });
});

describe('MINOR m2 T605 – TYPES phủ đủ enum ChangeType', () => {
  it('Object.keys(TYPES) bằng các giá trị ChangeType (shared) và enum Postgres', async () => {
    expect(Object.keys(TYPES).sort()).toEqual(Object.values(CHANGE_TYPE).sort());
    const pg = (await prisma.$queryRaw`SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'ChangeType'`).map((r) => r.enumlabel);
    expect(Object.keys(TYPES).sort()).toEqual(pg.sort());
  });
});
