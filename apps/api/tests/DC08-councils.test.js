// TASK-DC-08 (FR35, FR24, FR25 – API_GD7 §1.1, §1.2, §6): hội đồng – lập, đổi tên/thành viên, gán đề tài (tất cả hoặc không),
// hủy phân công, xung đột lợi ích, quan hệ isCouncilMember trong canView/canReadExecution, councilAssigned ở GET /api/topics.
// Test bắt buộc GD7 §6.6 #1–#8 (TC-FR35-xx). DB test thật (trừ khối unit schema đầu).
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { councilCreateSchema, councilAssignSchema } from '@nckh/shared';
import { prisma, S, U, tok, seedBase, mkTopic, mkRound, as, at } from './t214-kit.js';
import { createApp } from '../src/app.js';
import { createAuthRepo } from '../src/modules/auth/prismaRepo.js';
import { createTopicRepo } from '../src/modules/topics/prismaRepo.js';
import { createMemoryStorage } from '../src/lib/storage.js';
import { signAccessToken } from '../src/lib/tokens.js';
import { fakeHasher, testEnv } from './helpers.js';

const code = (r) => r.body.error?.code;
const REASON = 'Phân công nhầm hội đồng, gán lại sau';
// App mới mỗi test: limiter ghi 30/15 phút/user (GĐ7 §6) đếm trong bộ nhớ của app; storage bộ nhớ cho download-url
let app;
beforeEach(() => { app = createApp({ env: testEnv, logger: undefined, authRepo: createAuthRepo(prisma), hasher: fakeHasher, topicRepo: createTopicRepo(prisma), storage: createMemoryStorage() }); });
const call = (m, who, url, body = {}) => request(app)[m](url).set(as(who)).send(body);
const post = (who, url, body) => call('post', who, url, body);
const put = (who, url, body) => call('put', who, url, body);
const patch = (who, url, body) => call('patch', who, url, body);
const get = (who, url) => request(app).get(url).set(as(who));
const act = (who, t, body) => post(who, `/api/topics/${t.id}/actions`, { version: 0, ...body });
const notes = (who, type) => prisma.notification.count({ where: { userId: U[who].id, type } });
const members = (chair, secretary, ...rest) => [{ lecturerId: U[chair].id, role: 'CHAIR' }, { lecturerId: U[secretary].id, role: 'SECRETARY' }, ...rest.map((k) => ({ lecturerId: U[k].id, role: 'MEMBER' }))];
const create = (who, ms, o = {}) => post(who, '/api/councils', { roundId: S.round.id, name: 'Hội đồng CNPM 1', members: ms, ...o });
const mkCouncil = async (...keys) => {
  const r = await create('staff1', members(...keys));
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body.council;
};
const assign = (who, c, topics) => post(who, `/api/councils/${c.id}/assignments`, { topicIds: topics.map((t) => t.id) });
const openOf = (t) => prisma.councilAssignment.findMany({ where: { topicId: t.id, decidedAt: null, cancelledAt: null } });

let seq = 0;
// Đề tài Chờ bảo vệ, GVHD `lec`; mốc Đạt + báo cáo tổng kết dạng FILE (tải qua FR24)
const mkDefense = async ({ lec = 'lecA', round = S.round, status = 'WAITING_DEFENSE' } = {}) => {
  const leader = `s${++seq}`;
  const t = await mkTopic(leader, round, { status });
  await prisma.advising.create({ data: { topicId: t.id, lecturerId: U[lec].id } });
  const ms = await prisma.milestone.create({ data: { topicId: t.id, order: 1, name: 'Mốc 1', output: 'PDF', dueAt: at(5), evaluation: 'PASSED', createdById: U[lec].id } });
  const doc = await prisma.document.create({ data: { topicId: t.id, milestoneId: ms.id, stage: 'FINAL', kind: 'FILE', version: 1, fileName: 'bao-cao.pdf', publicId: `f/${t.id}`, status: 'READY', uploadedById: U[leader].id } });
  return { t, leader, ms, doc };
};

beforeAll(async () => {
  await seedBase({ students: 40 });
  // Thêm GV khoa F1 cho hội đồng 5 ủy viên; một GV bị khóa
  for (const k of ['lecD', 'lecE', 'lecF', 'lecG', 'lecH', 'lecLocked']) {
    U[k] = await prisma.user.create({ data: { code: k, email: `${k}@t.vn`, fullName: `Tên ${k}`, passwordHash: 'x', role: 'LECTURER', mustChangePassword: false, facultyId: S.F1.id, isLocked: k === 'lecLocked' } });
    tok[k] = signAccessToken(U[k], { secret: testEnv.JWT_ACCESS_SECRET, ttlSeconds: 600 });
  }
}, 60000);
afterAll(() => prisma.$disconnect());

describe('Unit – schema hội đồng (packages/shared)', () => {
  const ids = (n) => Array.from({ length: n }, (_, i) => `l${i}`);
  const ms = (c, s, m) => [...ids(c).map((id) => ({ lecturerId: `c${id}`, role: 'CHAIR' })), ...ids(s).map((id) => ({ lecturerId: `s${id}`, role: 'SECRETARY' })), ...ids(m).map((id) => ({ lecturerId: `m${id}`, role: 'MEMBER' }))];
  const err = (members) => {
    const r = councilCreateSchema.safeParse({ roundId: 'r', name: 'Hội đồng', members });
    return r.success ? null : r.error.issues.map((i) => i.path.join('.'));
  };
  it('TC-FR35-01 cơ cấu: 1 CT + 1 TK + 1–5 UV hợp lệ; 2 CT / thiếu TK / 0 UV / 6 UV / trùng GV → lỗi tại members', () => {
    expect([err(ms(1, 1, 1)), err(ms(1, 1, 5))]).toEqual([null, null]);
    for (const bad of [ms(2, 1, 1), ms(1, 0, 1), ms(1, 1, 0), ms(1, 1, 6), [...ms(1, 1, 1), { lecturerId: 'ml0', role: 'MEMBER' }]]) expect(err(bad)).toEqual(['members']);
  });
  it('gán: 1..50 đề tài, không trùng', () => {
    expect(councilAssignSchema.safeParse({ topicIds: [] }).success).toBe(false);
    expect(councilAssignSchema.safeParse({ topicIds: ['a', 'a'] }).success).toBe(false);
    expect(councilAssignSchema.safeParse({ topicIds: ids(51) }).success).toBe(false);
    expect(councilAssignSchema.safeParse({ topicIds: ids(50) }).success).toBe(true);
  });
});

describe('§6.2 tạo, sửa hội đồng', () => {
  it('TC-FR35-02 tạo: 201, mã HD-2026-001 từ sequence, thành viên theo vai trò, AuditLog COUNCIL_CREATE, thông báo từng thành viên', async () => {
    const r = await create('staff1', members('lecB', 'lecC', 'lecD'));
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.council).toMatchObject({
      code: 'HD-2026-001', name: 'Hội đồng CNPM 1', version: 0, locked: false, assignments: [],
      round: { id: S.round.id, academicYear: '2026-2027' },
      members: [{ lecturerId: U.lecB.id, fullName: U.lecB.fullName, role: 'CHAIR' }, { lecturerId: U.lecC.id, role: 'SECRETARY' }, { lecturerId: U.lecD.id, role: 'MEMBER' }],
    });
    expect((await create('staff1', members('lecB', 'lecC', 'lecE'))).body.council.code).toBe('HD-2026-002');
    const audit = await prisma.auditLog.findFirst({ where: { action: 'COUNCIL_CREATE', entityId: r.body.council.id } });
    expect([audit.actorId, audit.after.code, audit.after.members.length]).toEqual([U.staff1.id, 'HD-2026-001', 3]);
    expect(await prisma.notification.count({ where: { type: 'COUNCIL_MEMBER_ADDED', link: `/hoi-dong/${r.body.council.id}` } })).toBe(3);
  });

  it('TC-FR35-03 (§6.6 #1) 2 chủ tịch / thiếu thư ký / trùng GV / GV khoa khác / 6 ủy viên / GV bị khóa / không phải GV → 400 tại members', async () => {
    const bodies = [
      members('lecB', 'lecC', 'lecD').map((m, i) => (i === 1 ? { ...m, role: 'CHAIR' } : m)),
      members('lecB', 'lecC', 'lecD').filter((m) => m.role !== 'SECRETARY'),
      members('lecB', 'lecC', 'lecB'),
      members('lecB', 'lecC', 'lecF2'),
      members('lecB', 'lecC', 'lecD', 'lecE', 'lecF', 'lecG', 'lecH', 'lecA'),
      members('lecB', 'lecC', 'lecLocked'),
      members('lecB', 'lecC', 's1'),
    ];
    for (const [i, b] of bodies.entries()) {
      const r = await create('staff1', b);
      expect([r.status, code(r), Object.keys(r.body.error.details)], `ca ${i}`).toEqual([400, 'VALIDATION_ERROR', ['members']]);
    }
    expect((await create('staff1', members('lecB', 'lecC', 'lecF2'))).body.error.details.members).toBe('Giảng viên không hợp lệ');
    // Đợt không tồn tại → 400 roundId; tên ngắn → 400 name
    expect(Object.keys((await create('staff1', members('lecB', 'lecC', 'lecD'), { roundId: 'khong-co' })).body.error.details)).toEqual(['roundId']);
    expect(Object.keys((await create('staff1', members('lecB', 'lecC', 'lecD'), { name: 'ab' })).body.error.details)).toEqual(['name']);
  });

  it('PATCH đổi tên: 200 version + 1, AuditLog COUNCIL_UPDATE; sai version → 409 CONCURRENT_UPDATE', async () => {
    const c = await mkCouncil('lecB', 'lecC', 'lecD');
    const r = await patch('staff1', `/api/councils/${c.id}`, { name: 'Hội đồng HTTT', version: 0 });
    expect([r.status, r.body.council?.name, r.body.council?.version]).toEqual([200, 'Hội đồng HTTT', 1]);
    expect(code(await patch('staff1', `/api/councils/${c.id}`, { name: 'Tên khác nữa', version: 0 }))).toBe('CONCURRENT_UPDATE');
    expect((await prisma.auditLog.findFirst({ where: { action: 'COUNCIL_UPDATE', entityId: c.id } })).before).toEqual({ name: 'Hội đồng CNPM 1' });
  });

  it('PUT members: thay toàn bộ, version + 1, AuditLog before/after, thông báo người thêm/bớt; sai version → CONCURRENT_UPDATE; đã có điểm → COUNCIL_LOCKED', async () => {
    const c = await mkCouncil('lecB', 'lecC', 'lecD');
    const r = await put('staff1', `/api/councils/${c.id}/members`, { members: members('lecB', 'lecC', 'lecE', 'lecF'), version: 0 });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect([r.body.council.version, r.body.council.members.map((m) => m.lecturerId)]).toEqual([1, [U.lecB.id, U.lecC.id, ...[U.lecE.id, U.lecF.id].sort()]]);
    const audit = await prisma.auditLog.findFirst({ where: { action: 'COUNCIL_MEMBERS_SET', entityId: c.id } });
    expect([audit.before.members.length, audit.after.members.length]).toEqual([3, 4]);
    const key = `:${c.id}:v1`;
    expect(await prisma.notification.count({ where: { type: 'COUNCIL_MEMBER_REMOVED', userId: U.lecD.id, dedupeKey: `COUNCIL_MEMBER_REMOVED${key}` } })).toBe(1);
    expect(await prisma.notification.count({ where: { type: 'COUNCIL_MEMBER_ADDED', dedupeKey: `COUNCIL_MEMBER_ADDED${key}` } })).toBe(2);
    expect(code(await put('staff1', `/api/councils/${c.id}/members`, { members: members('lecB', 'lecC', 'lecD'), version: 0 }))).toBe('CONCURRENT_UPDATE');
    // Có điểm bảo vệ → không đổi thành viên được
    const { t } = await mkDefense();
    expect((await assign('staff1', c, [t])).status).toBe(201);
    const [a] = await openOf(t);
    await prisma.defenseScore.create({ data: { assignmentId: a.id, memberId: U.lecB.id, score: 7, comment: 'Chấm thử nghiệm' } });
    const locked = await put('staff1', `/api/councils/${c.id}/members`, { members: members('lecB', 'lecC', 'lecD'), version: 1 });
    expect([locked.status, code(locked)]).toEqual([409, 'COUNCIL_LOCKED']);
    expect((await get('staff1', `/api/councils/${c.id}`)).body.council).toMatchObject({ locked: true, assignments: [{ scoredCount: 1, memberCount: 4 }] });
  });
});

describe('§6.3 gán đề tài', () => {
  it('TC-FR35-04 gán 2 đề tài: 201, phân công mở, AuditLog COUNCIL_ASSIGN mỗi đề tài, thông báo HĐ + GVHD + nhóm; CouncilView có đề tài', async () => {
    const c = await mkCouncil('lecB', 'lecC', 'lecD');
    const a = await mkDefense();
    const b = await mkDefense();
    const r = await assign('staff1', c, [a.t, b.t]);
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.council.assignments.map((x) => x.topic.id).sort()).toEqual([a.t.id, b.t.id].sort());
    expect(r.body.council.assignments[0]).toMatchObject({ advisor: { fullName: U.lecA.fullName }, scoredCount: 0, memberCount: 3, finalScore: null, decision: null, cancelledAt: null });
    expect(await prisma.auditLog.count({ where: { action: 'COUNCIL_ASSIGN', after: { path: ['councilId'], equals: c.id } } })).toBe(2);
    const n = (who, t) => prisma.notification.count({ where: { userId: U[who].id, type: 'COUNCIL_ASSIGNED', link: `/de-tai/${t.id}` } });
    expect([await n('lecB', a.t), await n('lecD', a.t), await n('lecA', a.t), await n(a.leader, a.t), await n('staff1', a.t)]).toEqual([1, 1, 1, 1, 0]);
  });

  it('TC-FR35-05 (§6.6 #2) GVHD là ủy viên → 409 CONFLICT_OF_INTEREST, details.conflicts đúng; không đề tài nào được gán (tất cả hoặc không)', async () => {
    const c = await mkCouncil('lecB', 'lecC', 'lecD');
    const ok = await mkDefense({ lec: 'lecA' });
    const bad = await mkDefense({ lec: 'lecD' });
    const r = await assign('staff1', c, [ok.t, bad.t]);
    expect([r.status, code(r)]).toEqual([409, 'CONFLICT_OF_INTEREST']);
    expect(r.body.error.details.conflicts).toEqual([{ topicCode: bad.t.code, lecturerName: U.lecD.fullName }]);
    expect(r.body.error.message).toContain(`${U.lecD.fullName} là GVHD của đề tài ${bad.t.code}`);
    expect([(await openOf(ok.t)).length, (await openOf(bad.t)).length]).toEqual([0, 0]);
    expect(await prisma.auditLog.count({ where: { action: 'COUNCIL_ASSIGN', after: { path: ['councilId'], equals: c.id } } })).toBe(0);
  });

  it('TC-FR35-06 sai trạng thái → 409 NOT_WAITING_DEFENSE (topicCodes); khác đợt/khoa → 400 topicIds; đã gán → 409 TOPIC_ALREADY_ASSIGNED; tất cả hoặc không', async () => {
    const c = await mkCouncil('lecB', 'lecC', 'lecD');
    const ok = await mkDefense();
    const running = await mkDefense({ status: 'IN_PROGRESS' });
    const r = await assign('staff1', c, [ok.t, running.t]);
    expect([r.status, code(r), r.body.error.details]).toEqual([409, 'NOT_WAITING_DEFENSE', { topicCodes: [running.t.code] }]);
    const other = await mkDefense({ round: await mkRound(S.F1.id, 'Đợt khác') });
    const r2 = await assign('staff1', c, [ok.t, other.t]);
    expect([r2.status, Object.keys(r2.body.error.details)]).toEqual([400, ['topicIds']]);
    expect((await assign('staff1', c, [{ id: 'khong-co' }])).status).toBe(400);
    expect((await openOf(ok.t)).length).toBe(0);
    expect((await assign('staff1', c, [ok.t])).status).toBe(201);
    const c2 = await mkCouncil('lecE', 'lecF', 'lecG');
    const fresh = await mkDefense();
    const dup = await assign('staff1', c2, [fresh.t, ok.t]);
    expect([dup.status, code(dup), dup.body.error.details]).toEqual([409, 'TOPIC_ALREADY_ASSIGNED', { topicCodes: [ok.t.code] }]);
    expect((await openOf(fresh.t)).length).toBe(0);
  });

  it('TC-FR35-07 (§6.6 #4) đồng thời: gán cùng đề tài vào 2 hội đồng → đúng 1 thành công, bên kia 409 TOPIC_ALREADY_ASSIGNED', async () => {
    const c1 = await mkCouncil('lecB', 'lecC', 'lecD');
    const c2 = await mkCouncil('lecE', 'lecF', 'lecG');
    for (let i = 0; i < 4; i++) {
      const { t } = await mkDefense();
      const rs = await Promise.all([assign('staff1', c1, [t]), assign('staff1', c2, [t])]);
      expect(rs.map((r) => r.status).sort(), JSON.stringify(rs.map((r) => r.body))).toEqual([201, 409]);
      expect(code(rs.find((r) => r.status === 409))).toBe('TOPIC_ALREADY_ASSIGNED');
      expect((await openOf(t)).length).toBe(1);
    }
  });

  it('TC-FR35-08 (§6.6 #3) đổi thành viên thêm GVHD của đề tài đã gán → 409 CONFLICT_OF_INTEREST, thành viên không đổi', async () => {
    const c = await mkCouncil('lecB', 'lecC', 'lecD');
    const { t } = await mkDefense({ lec: 'lecA' });
    expect((await assign('staff1', c, [t])).status).toBe(201);
    const r = await put('staff1', `/api/councils/${c.id}/members`, { members: members('lecB', 'lecC', 'lecD', 'lecA'), version: 0 });
    expect([r.status, code(r), r.body.error.details.conflicts]).toEqual([409, 'CONFLICT_OF_INTEREST', [{ topicCode: t.code, lecturerName: U.lecA.fullName }]]);
    expect(await prisma.councilMember.count({ where: { councilId: c.id } })).toBe(3);
  });

  it('TC-FR35-09 (§6.6 #5) yêu cầu thay GV (FR19) khi Chờ bảo vệ → 409 INVALID_TRANSITION (không tạo được xung đột sau khi gán)', async () => {
    const { t, leader } = await mkDefense();
    for (const who of [leader, 'staff1']) {
      const r = await post(who, `/api/topics/${t.id}/change-requests`, { type: 'ADVISOR_CHANGE', reason: 'Muốn đổi giảng viên', newLecturerId: U.lecB.id });
      expect([r.status, code(r)], who).toEqual([409, 'INVALID_TRANSITION']);
    }
    expect(await prisma.changeRequest.count({ where: { topicId: t.id } })).toBe(0);
  });
});

describe('§6.4 hủy phân công', () => {
  it('TC-FR35-10 mở, chưa điểm → 200 cancelledAt + lý do, AuditLog COUNCIL_UNASSIGN, thông báo HĐ; có điểm → ASSIGNMENT_HAS_SCORES; đã hủy/đã chốt → ASSIGNMENT_DECIDED', async () => {
    const c = await mkCouncil('lecB', 'lecC', 'lecD');
    const { t } = await mkDefense();
    expect((await assign('staff1', c, [t])).status).toBe(201);
    const [a] = await openOf(t);
    expect((await post('staff2', `/api/council-assignments/${a.id}/cancel`, { reason: REASON })).status).toBe(403);
    expect(code(await post('staff1', `/api/council-assignments/${a.id}/cancel`, { reason: 'ab' }))).toBe('VALIDATION_ERROR');
    const r = await post('staff1', `/api/council-assignments/${a.id}/cancel`, { reason: REASON });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.council.assignments[0]).toMatchObject({ id: a.id, cancelledAt: expect.any(String) });
    expect((await prisma.councilAssignment.findUnique({ where: { id: a.id } })).cancelReason).toBe(REASON);
    expect((await prisma.auditLog.findFirst({ where: { action: 'COUNCIL_UNASSIGN', entityId: a.id } })).after).toMatchObject({ reason: REASON, topicId: t.id });
    expect([await notes('lecB', 'COUNCIL_UNASSIGNED'), await notes('lecD', 'COUNCIL_UNASSIGNED')]).toEqual([1, 1]);
    expect(code(await post('staff1', `/api/council-assignments/${a.id}/cancel`, { reason: REASON }))).toBe('ASSIGNMENT_DECIDED');
    // Cán bộ xem được phân công đã hủy khi includeCancelled; mặc định ẩn
    expect((await get('staff1', `/api/councils/${c.id}`)).body.council.assignments).toEqual([]);
    expect((await get('staff1', `/api/councils/${c.id}?includeCancelled=true`)).body.council.assignments).toHaveLength(1);
    // Gán lại → có điểm → không hủy được
    expect((await assign('staff1', c, [t])).status).toBe(201);
    const [b] = await openOf(t);
    await prisma.defenseScore.create({ data: { assignmentId: b.id, memberId: U.lecC.id, score: 8, comment: 'Đã chấm' } });
    expect(code(await post('staff1', `/api/council-assignments/${b.id}/cancel`, { reason: REASON }))).toBe('ASSIGNMENT_HAS_SCORES');
    // Đã chốt
    const { t: t2 } = await mkDefense();
    const decided = await prisma.councilAssignment.create({ data: { councilId: c.id, topicId: t2.id, assignedById: U.staff1.id, decidedAt: new Date(), decidedById: U.lecB.id, finalScore: 7, decision: 'PASSED', minutes: 'Đã chốt' } });
    expect(code(await post('staff1', `/api/council-assignments/${decided.id}/cancel`, { reason: REASON }))).toBe('ASSIGNMENT_DECIDED');
    expect((await post('staff1', '/api/council-assignments/khong-co/cancel', { reason: REASON })).status).toBe(404);
  });
});

describe('§6.6 #6 đồng thời: đổi thành viên ‖ chấm điểm', () => {
  it('TC-FR35-11 chấm trước (giữ Council FOR SHARE như §7.3) → đổi thành viên chờ khóa rồi nhận 409 COUNCIL_LOCKED', async () => {
    const c = await mkCouncil('lecB', 'lecC', 'lecD');
    const { t } = await mkDefense();
    expect((await assign('staff1', c, [t])).status).toBe(201);
    const [a] = await openOf(t);
    let onLocked;
    const locked = new Promise((r) => { onLocked = r; });
    // Mô phỏng phần khóa của PUT my-score (DC-09): Council FOR SHARE → ghi DefenseScore → commit
    const scoring = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Council" WHERE id = ${c.id} FOR SHARE`;
      onLocked();
      await new Promise((r) => setTimeout(r, 400));
      await tx.defenseScore.create({ data: { assignmentId: a.id, memberId: U.lecD.id, score: 6, comment: 'Chấm trong lúc đổi' } });
    }, { timeout: 10000 });
    await locked;
    const r = await put('staff1', `/api/councils/${c.id}/members`, { members: members('lecB', 'lecC', 'lecE'), version: 0 });
    await scoring;
    expect([r.status, code(r)]).toEqual([409, 'COUNCIL_LOCKED']);
    expect((await prisma.councilMember.findMany({ where: { councilId: c.id } })).map((m) => m.lecturerId)).toContain(U.lecD.id);
  });

  it('TC-FR35-12 đổi trước → người bị bỏ mất quyền ngay (403 đọc hội đồng và đề tài); chấm sau phải đọc lại thành viên dưới khóa (DC-09)', async () => {
    const c = await mkCouncil('lecB', 'lecC', 'lecD');
    const { t } = await mkDefense();
    expect((await assign('staff1', c, [t])).status).toBe(201);
    expect((await get('lecD', `/api/topics/${t.id}`)).status).toBe(200);
    expect((await put('staff1', `/api/councils/${c.id}/members`, { members: members('lecB', 'lecC', 'lecE'), version: 0 })).status).toBe(200);
    expect([(await get('lecD', `/api/topics/${t.id}`)).status, (await get('lecD', `/api/councils/${c.id}`)).status]).toEqual([403, 403]);
    expect((await get('lecE', `/api/topics/${t.id}`)).status).toBe(200);
  });
});

describe('§6.6 #7 quan hệ isCouncilMember: chỉ đọc', () => {
  it('TC-FR35-13 thành viên HĐ đọc chi tiết, tài liệu, mốc, nhận xét, lịch sử, download-url (AuditLog DOCUMENT_DOWNLOAD); mọi endpoint ghi 403', async () => {
    const c = await mkCouncil('lecB', 'lecC', 'lecD');
    const { t, ms, doc } = await mkDefense();
    // Trước khi gán: không đọc được
    expect((await get('lecD', `/api/topics/${t.id}`)).status).toBe(403);
    expect((await assign('staff1', c, [t])).status).toBe(201);
    const d = await get('lecD', `/api/topics/${t.id}`);
    expect(d.status).toBe(200);
    expect([d.body.topic.availableActions, d.body.topic.permissions.readExecution, d.body.topic.permissions.edit, d.body.topic.permissions.giveFeedback]).toEqual([[], true, false, false]);
    for (const url of [`/api/topics/${t.id}/documents?stage=FINAL`, `/api/topics/${t.id}/milestones`, `/api/topics/${t.id}/feedbacks`, `/api/topics/${t.id}/results`, `/api/topics/${t.id}/status-history`, `/api/topics/${t.id}/progress`]) {
      expect((await get('lecD', url)).status, url).toBe(200);
    }
    expect((await get('lecD', `/api/topics/${t.id}/documents?stage=FINAL`)).body.items.map((x) => x.id)).toEqual([doc.id]);
    const dl = await request(app).post(`/api/documents/${doc.id}/download-url`).set(as('lecD')).send({});
    expect(dl.status, JSON.stringify(dl.body)).toBe(200);
    expect(await prisma.auditLog.count({ where: { action: 'DOCUMENT_DOWNLOAD', entityId: doc.id, actorId: U.lecD.id } })).toBe(1);

    const pg = await prisma.progressUpdate.create({ data: { topicId: t.id, authorId: (await prisma.topicMember.findFirst({ where: { topicId: t.id } })).userId, done: 'a', issues: '', nextPlan: 'b', percent: 50 } });
    const writes = [
      ['PUT', `/api/topics/${t.id}`, { version: 0, title: 'Sửa trái phép' }],
      ['POST', `/api/topics/${t.id}/actions`, { action: 'RETURN_FROM_DEFENSE', version: 0, reason: REASON }],
      ['POST', `/api/topics/${t.id}/documents`, {}],
      ['POST', `/api/topics/${t.id}/documents/links`, { stage: 'FINAL', milestoneId: ms.id, title: 'Bản sửa', url: 'https://github.com/x/z' }],
      ['POST', `/api/documents/${doc.id}/feedbacks`, { content: 'Nhận xét trái phép' }],
      ['POST', `/api/progress/${pg.id}/feedbacks`, { content: 'Nhận xét trái phép' }],
      ['POST', `/api/topics/${t.id}/milestones`, { name: 'Mốc mới', output: 'PDF', dueAt: at(10).toISOString() }],
      ['PATCH', `/api/milestones/${ms.id}`, { version: 0, name: 'Đổi tên' }],
      ['POST', `/api/milestones/${ms.id}/reopen`, { reason: REASON, version: 0 }],
      ['POST', `/api/topics/${t.id}/results`, { result: 'GOOD', summary: 'Kết quả nhập trái phép bởi hội đồng.', expectedVersion: 0 }],
      ['POST', `/api/topics/${t.id}/change-requests`, { type: 'CANCEL', reason: REASON }],
      ['POST', `/api/topics/${t.id}/similarity-checks`, {}],
    ];
    for (const [m, url, body] of writes) {
      const r = await request(app)[m.toLowerCase()](url).set(as('lecD')).send(body);
      expect(r.status, `${m} ${url} ${JSON.stringify(r.body)}`).toBe(403);
    }
    expect(await prisma.auditLog.count({ where: { actorId: U.lecD.id, action: { not: 'DOCUMENT_DOWNLOAD' } } })).toBe(0);
  });

  it('TC-FR35-14 sau hủy phân công → đọc 403; phân công đã chốt vẫn đọc; đề tài CLOSED → 403 (G62)', async () => {
    const c = await mkCouncil('lecB', 'lecC', 'lecD');
    const { t, doc } = await mkDefense();
    expect((await assign('staff1', c, [t])).status).toBe(201);
    const [a] = await openOf(t);
    expect((await post('staff1', `/api/council-assignments/${a.id}/cancel`, { reason: REASON })).status).toBe(200);
    for (const url of [`/api/topics/${t.id}`, `/api/topics/${t.id}/documents?stage=FINAL`, `/api/topics/${t.id}/milestones`]) expect((await get('lecB', url)).status, url).toBe(403);
    expect((await request(app).post(`/api/documents/${doc.id}/download-url`).set(as('lecB')).send({})).status).toBe(403);
    // Phân công đã chốt (không hủy) vẫn cho đọc tới khi đề tài đóng
    const { t: t2 } = await mkDefense({ status: 'WAITING_CLOSE' });
    await prisma.councilAssignment.create({ data: { councilId: c.id, topicId: t2.id, assignedById: U.staff1.id, decidedAt: new Date(), decidedById: U.lecB.id, finalScore: 8, decision: 'PASSED', minutes: 'Đã chốt' } });
    expect((await get('lecC', `/api/topics/${t2.id}`)).status).toBe(200);
    await prisma.topic.update({ where: { id: t2.id }, data: { status: 'CLOSED' } });
    for (const url of [`/api/topics/${t2.id}`, `/api/topics/${t2.id}/documents?stage=FINAL`]) expect((await get('lecC', url)).status, url).toBe(403);
  });
});

describe('§6.5 đọc + §6.6 #8 quyền', () => {
  it('TC-FR35-15 GET /api/councils: cán bộ theo phạm vi khoa, GV chỉ hội đồng mình là thành viên, assignmentCount; SV/ADMIN 403', async () => {
    const c = await mkCouncil('lecE', 'lecF', 'lecH');
    const { t } = await mkDefense();
    expect((await assign('staff1', c, [t])).status).toBe(201);
    const mine = await get('lecH', '/api/councils');
    expect(mine.status).toBe(200);
    expect(mine.body.items.map((x) => x.id)).toContain(c.id);
    expect(mine.body.items.every((x) => x.members.some((m) => m.lecturerId === U.lecH.id))).toBe(true);
    expect(mine.body.items.find((x) => x.id === c.id)).toMatchObject({ assignmentCount: 1, locked: false });
    expect(mine.body.items.find((x) => x.id === c.id).assignments).toBeUndefined();
    expect((await get('lecA', '/api/councils')).body.total).toBe(0);
    expect((await get('staff2', '/api/councils')).body.total).toBe(0);
    const all = await get('staff1', `/api/councils?q=${encodeURIComponent(c.code)}`);
    expect(all.body.items.map((x) => x.id)).toEqual([c.id]);
    for (const who of ['s1', 'admin']) expect((await get(who, '/api/councils')).status, who).toBe(403);
  });

  it('TC-FR35-16 (§6.6 #8) GV ngoài hội đồng, SV, cán bộ khoa khác, ADMIN: đọc/ghi hội đồng và đề tài được gán → 403', async () => {
    const c = await mkCouncil('lecB', 'lecC', 'lecD');
    const { t, leader } = await mkDefense();
    const { t: t2 } = await mkDefense();
    expect((await assign('staff1', c, [t])).status).toBe(201);
    const [a] = await openOf(t);
    expect((await get('lecD', `/api/councils/${c.id}`)).status).toBe(200);
    for (const who of ['lecE', leader, 'staff2', 'admin']) {
      expect((await get(who, `/api/councils/${c.id}`)).status, `get ${who}`).toBe(403);
      expect((await create(who, members('lecB', 'lecC', 'lecD'))).status, `create ${who}`).toBe(403);
      expect((await patch(who, `/api/councils/${c.id}`, { name: 'Tên mới hội đồng', version: 0 })).status, `patch ${who}`).toBe(403);
      expect((await put(who, `/api/councils/${c.id}/members`, { members: members('lecB', 'lecC', 'lecE'), version: 0 })).status, `put ${who}`).toBe(403);
      expect((await assign(who, c, [t2])).status, `assign ${who}`).toBe(403);
      expect((await post(who, `/api/council-assignments/${a.id}/cancel`, { reason: REASON })).status, `cancel ${who}`).toBe(403);
    }
    // Thành viên hội đồng (LECTURER) không ghi được hội đồng
    expect((await assign('lecB', c, [t2])).status).toBe(403);
    // GV ngoài hội đồng, cán bộ khoa khác không đọc được đề tài được gán
    for (const who of ['lecE', 'staff2', 'admin']) expect((await get(who, `/api/topics/${t.id}`)).status, who).toBe(403);
    expect((await get('staff1', '/api/councils/khong-co')).status).toBe(404);
  });

  it('TC-FR35-19 limiter ghi 30/15 phút/user → lần thứ 31 nhận 429', async () => {
    const c = await mkCouncil('lecB', 'lecC', 'lecD'); // lần ghi 1
    for (let i = 0; i < 29; i++) expect((await patch('staff1', `/api/councils/${c.id}`, { name: 'Tên sai version', version: 99 })).status).toBe(409);
    expect(code(await patch('staff1', `/api/councils/${c.id}`, { name: 'Tên sai version', version: 99 }))).toBe('RATE_LIMITED');
  });

  it('TC-FR35-17 GET /api/topics?status=WAITING_DEFENSE&councilAssigned=…: cán bộ lọc được, item có defenseCouncil; vai trò khác → 400; GV không thấy đề tài hội đồng (G49)', async () => {
    const c = await mkCouncil('lecB', 'lecC', 'lecD');
    const { t: assigned } = await mkDefense();
    const { t: free } = await mkDefense();
    expect((await assign('staff1', c, [assigned])).status).toBe(201);
    const ids = async (v) => (await get('staff1', `/api/topics?status=WAITING_DEFENSE&councilAssigned=${v}&pageSize=100`)).body.items;
    const no = await ids('false');
    const yes = await ids('true');
    expect([no.some((x) => x.id === free.id), no.some((x) => x.id === assigned.id)]).toEqual([true, false]);
    expect(yes.find((x) => x.id === assigned.id).defenseCouncil).toEqual({ id: c.id, code: c.code });
    expect(no.find((x) => x.id === free.id).defenseCouncil).toBeNull();
    for (const who of ['lecA', 's1']) {
      const r = await get(who, '/api/topics?councilAssigned=false');
      expect([r.status, Object.keys(r.body.error?.details ?? {})], who).toEqual([400, ['councilAssigned']]);
    }
    expect((await get('staff1', '/api/topics?councilAssigned=abc')).status).toBe(400);
    const lec = (await get('lecA', '/api/topics?pageSize=100')).body.items;
    expect(lec.find((x) => x.id === assigned.id)).not.toHaveProperty('defenseCouncil');
    expect((await get('lecB', '/api/topics?pageSize=100')).body.items.some((x) => x.id === assigned.id)).toBe(false);
  });
});

describe('§1.1 hành động trên đề tài: thành viên HĐ không có hành động ghi', () => {
  it('TC-FR35-18 act() bởi chủ tịch trên đề tài được gán → 403 (RETURN_FROM_DEFENSE chỉ cán bộ)', async () => {
    const c = await mkCouncil('lecB', 'lecC', 'lecD');
    const { t } = await mkDefense();
    expect((await assign('staff1', c, [t])).status).toBe(201);
    expect((await act('lecB', t, { action: 'RETURN_FROM_DEFENSE', reason: REASON })).status).toBe(403);
    expect((await prisma.topic.findUnique({ where: { id: t.id } })).status).toBe('WAITING_DEFENSE');
  });
});
