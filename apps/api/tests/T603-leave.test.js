// T603 (FR21, API_GD6 §5): rời nhóm trước/sau duyệt, quyền đọc theo khoảng là thành viên; MINOR m5 reviews/T601-bao-mat-v1.md. DB test thật.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { prisma, S, U, tok, seedBase, mkTopic, mkRound, addMember, mkInvite } from './t214-kit.js';
import { createApp } from '../src/app.js';
import { createAuthRepo } from '../src/modules/auth/prismaRepo.js';
import { createTopicRepo } from '../src/modules/topics/prismaRepo.js';
import { createMemoryStorage } from '../src/lib/storage.js';
import { signAccessToken } from '../src/lib/tokens.js';
import { inWindows } from '../src/modules/topics/service.js';
import { fakeHasher, testEnv } from './helpers.js';

// App riêng có kho file bộ nhớ (link tải FR24)
const app = createApp({ env: testEnv, logger: undefined, authRepo: createAuthRepo(prisma), hasher: fakeHasher, topicRepo: createTopicRepo(prisma), storage: createMemoryStorage() });
const as = (who) => ({ Authorization: `Bearer ${tok[who]}` });
const post = (who, url, body = {}) => request(app).post(url).set(as(who)).send(body);
const get = (who, url) => request(app).get(url).set(as(who));
const code = (r) => r.body.error?.code;
const REASON = 'Em chuyển sang hướng nghiên cứu khác';
const sec = 1000;
const ago = (s) => new Date(Date.now() - s * sec);

// Người dùng mới mỗi test: limiter 30/15 phút/người của §2.3 không bị dồn
let n = 0;
const mkUser = async (role, extra = {}) => {
  const key = `${role.toLowerCase()}-t603-${++n}`;
  U[key] = await prisma.user.create({ data: { code: key, email: `${key}@t.vn`, fullName: `Tên ${key}`, passwordHash: 'x', role, mustChangePassword: false, facultyId: S.F1.id, ...extra } });
  tok[key] = signAccessToken(U[key], { secret: testEnv.JWT_ACCESS_SECRET, ttlSeconds: 600 });
  if (role === 'STAFF') await prisma.staffScope.create({ data: { userId: U[key].id, facultyId: S.F1.id } });
  return key;
};
// Nhóm: trưởng nhóm + k thành viên thường
const mkGroup = async ({ status = 'IN_PROGRESS', k = 1, round = S.round } = {}) => {
  const leader = await mkUser('STUDENT');
  const t = await mkTopic(leader, round, { status });
  const ms = [];
  for (let i = 0; i < k; i++) {
    ms.push(await mkUser('STUDENT'));
    await addMember(t, ms[i]);
  }
  return { t, leader, ms };
};
const leave = (who, t, version = 0) => post(who, `/api/topics/${t.id}/leave`, { version });
const createLeave = (who, t, o = {}) => post(who, `/api/topics/${t.id}/change-requests`, { type: 'LEAVE_GROUP', reason: REASON, ...o });
const approve = (who, id) => post(who, `/api/change-requests/${id}/approve`, {});
const live = (t, who) => prisma.topicMember.findFirst({ where: { topicId: t.id, userId: U[who].id, leftAt: null } });
const version = async (t) => (await prisma.topic.findUnique({ where: { id: t.id } })).version;
const mkSub = (t, who, seq, createdAt, title = `Tên bản ${seq}`) => prisma.submission.create({
  data: { topicId: t.id, seq, createdById: U[who].id, createdAt, payload: { title, summary: 's', objectives: 'o', keywords: ['k'], documentIds: [] } },
});
const mkDoc = (t, who, v, uploadedAt) => prisma.document.create({
  data: { topicId: t.id, stage: 'PROPOSAL', kind: 'FILE', fileName: `v${v}.pdf`, publicId: `t603/${t.id}/v${v}.pdf`, version: v, status: 'READY', uploadedById: U[who].id, uploadedAt },
});

beforeAll(() => seedBase({ students: 2 }), 60000);
afterAll(() => prisma.$disconnect());

describe('inWindows – biên khoảng [joinedAt, leftAt) (§5.4)', () => {
  const w = [{ joinedAt: new Date(1000), leftAt: new Date(2000) }, { joinedAt: new Date(5000), leftAt: new Date(6000) }];
  it('joinedAt được, leftAt không, khoảng giữa không', () => {
    expect([1000, 1999, 2000, 999, 3000, 5000, 6000].map((x) => inWindows(new Date(x), w))).toEqual([true, true, false, false, false, true, false]);
    expect(inWindows(new Date(1500), [])).toBe(false);
  });
});

describe('FR21 trước duyệt – POST /api/topics/:id/leave (§5.1, ca 1–2)', () => {
  it('ca 1: rời ở DRAFT, WAITING_ADVISOR, UNDER_REVIEW → 200; mất quyền ngay, không còn trong danh sách; AuditLog + MEMBER_LEFT', async () => {
    for (const status of ['DRAFT', 'WAITING_ADVISOR', 'UNDER_REVIEW']) {
      const { t, leader, ms: [m] } = await mkGroup({ status });
      const lec = await mkUser('LECTURER');
      await prisma.advising.create({ data: { topicId: t.id, lecturerId: U[lec].id } });
      const before = (await get(m, `/api/topics/${t.id}`)).body.topic.permissions;
      expect([before.leave, before.requestLeave], status).toEqual([true, false]);
      const r = await leave(m, t);
      expect([r.status, r.body], status).toEqual([200, { left: true, topicId: t.id }]);
      expect((await get(m, `/api/topics/${t.id}`)).status, status).toBe(403);
      expect((await get(m, '/api/topics')).body.items.map((x) => x.id)).not.toContain(t.id);
      expect(await live(t, m)).toBeNull();
      expect(await version(t)).toBe(1);
      const a = await prisma.auditLog.findFirst({ where: { action: 'MEMBER_LEAVE', entityId: t.id } });
      expect(a).toMatchObject({ actorId: U[m].id, before: { userId: U[m].id, role: 'MEMBER' } });
      const notes = await prisma.notification.findMany({ where: { type: 'MEMBER_LEFT', dedupeKey: { startsWith: 'MEMBER_LEFT:' }, userId: { in: [U[leader].id, U[lec].id, U[m].id] } } });
      expect(notes.map((x) => x.userId).sort()).toEqual([U[leader].id, U[lec].id].sort());
      expect(notes[0].link).toBe(`/de-tai/${t.id}/nhom`);
    }
  });

  it('ca 2: trưởng nhóm 409 LEADER_CANNOT_LEAVE; IN_PROGRESS/WAITING_CLOSE 409 LEAVE_NEEDS_APPROVAL; CLOSED/REJECTED/CANCELLED 409 TOPIC_NOT_EDITABLE', async () => {
    const d = await mkGroup({ status: 'DRAFT' });
    expect(code(await leave(d.leader, d.t))).toBe('LEADER_CANNOT_LEAVE');
    expect((await get(d.leader, `/api/topics/${d.t.id}`)).body.topic.permissions.leave).toBe(false);
    for (const [status, err] of [['IN_PROGRESS', 'LEAVE_NEEDS_APPROVAL'], ['WAITING_CLOSE', 'LEAVE_NEEDS_APPROVAL'], ['CLOSED', 'TOPIC_NOT_EDITABLE'], ['REJECTED', 'TOPIC_NOT_EDITABLE'], ['CANCELLED', 'TOPIC_NOT_EDITABLE']]) {
      const { t, ms: [m] } = await mkGroup({ status });
      const r = await leave(m, t);
      expect([r.status, code(r)], status).toEqual([409, err]);
      expect(await live(t, m), status).not.toBeNull();
    }
    expect(await prisma.auditLog.count({ where: { action: 'MEMBER_LEAVE', entityId: d.t.id } })).toBe(0);
  });

  it('GĐ7 (TASK-DC-01): RECRUITING rời tự do (PRE_APPROVAL_STATUSES); WAITING_DEFENSE 409 LEAVE_NEEDS_APPROVAL như đề tài đã duyệt', async () => {
    const r = await mkGroup({ status: 'RECRUITING' });
    expect((await get(r.ms[0], `/api/topics/${r.t.id}`)).body.topic.permissions.leave).toBe(true);
    expect((await leave(r.ms[0], r.t)).status).toBe(200);
    expect(await live(r.t, r.ms[0])).toBeNull();
    const d = await mkGroup({ status: 'WAITING_DEFENSE' });
    const res = await leave(d.ms[0], d.t);
    expect([res.status, code(res)]).toEqual([409, 'LEAVE_NEEDS_APPROVAL']);
    expect(await live(d.t, d.ms[0])).not.toBeNull();
  });

  it('403/400/409: SV ngoài, GV, cán bộ, ADMIN 403; version lệch 409 CONCURRENT_UPDATE; body sai 400', async () => {
    const { t, ms: [m] } = await mkGroup({ status: 'DRAFT' });
    const outsider = await mkUser('STUDENT');
    const staff = await mkUser('STAFF');
    for (const who of [outsider, 'lecA', staff, 'admin']) expect((await leave(who, t)).status, who).toBe(403);
    expect(code(await leave(m, t, 5))).toBe('CONCURRENT_UPDATE');
    expect((await post(m, `/api/topics/${t.id}/leave`, {})).status).toBe(400);
    expect((await post(m, `/api/topics/${t.id}/leave`, { version: 0, userId: U[outsider].id })).status).toBe(400);
    expect(await live(t, m)).not.toBeNull();
  });

  it('ca 5: đồng thời rời ‖ REQUEST_ADVISOR (min 2) – đúng một bên thắng, không có trạng thái lệch', async () => {
    const round = await mkRound(S.F1.id, 'Đợt min 2', { minMembers: 2 });
    for (let i = 0; i < 3; i++) {
      const { t, leader, ms: [m] } = await mkGroup({ status: 'DRAFT', round });
      const lec = await mkUser('LECTURER');
      const [a, b] = await Promise.all([leave(m, t), post(leader, `/api/topics/${t.id}/actions`, { action: 'REQUEST_ADVISOR', lecturerId: U[lec].id, version: 0 })]);
      expect([a.status, b.status].filter((s) => s === 200), JSON.stringify([a.body, b.body])).toHaveLength(1);
      const x = await prisma.topic.findUnique({ where: { id: t.id }, include: { members: { where: { leftAt: null } } } });
      if (b.status === 200) expect([x.status, x.members.length, code(a)]).toEqual(['WAITING_ADVISOR', 2, 'CONCURRENT_UPDATE']);
      else expect([x.status, x.members.length]).toEqual(['DRAFT', 1]);
    }
  });
});

describe('FR21 sau duyệt – LEAVE_GROUP (§5.2, ca 3–4)', () => {
  it('tạo → cán bộ duyệt: stage STAFF, payload §2.1; rời hiệu lực, tăng version, AuditLog, CHANGE_DECIDED cho người rời link /yeu-cau', async () => {
    const { t, leader, ms: [m] } = await mkGroup({ k: 1 });
    const lec = await mkUser('LECTURER');
    await prisma.advising.create({ data: { topicId: t.id, lecturerId: U[lec].id } });
    const staff = await mkUser('STAFF');
    const p = (await get(m, `/api/topics/${t.id}`)).body.topic.permissions;
    expect([p.leave, p.requestLeave]).toEqual([false, true]);
    const c = await createLeave(m, t);
    expect(c.status, JSON.stringify(c.body)).toBe(201);
    expect(c.body.changeRequest).toMatchObject({
      type: 'LEAVE_GROUP', status: 'PENDING', stage: 'STAFF', target: { id: U[m].id },
      payload: { member: { userId: U[m].id, code: U[m].code, fullName: U[m].fullName }, memberCountBefore: 2 }, availableActions: ['WITHDRAW'],
    });
    expect(c.body.changeRequest.targetAcceptedAt).not.toBeNull();
    const id = c.body.changeRequest.id;
    expect(await prisma.notification.count({ where: { dedupeKey: `CHANGE_TARGET_INVITED:${id}` } })).toBe(0);
    expect(code(await createLeave(m, t))).toBe('CHANGE_REQUEST_PENDING');
    // Người rời không tự đồng ý/từ chối được (không có bước đích)
    expect(code(await post(m, `/api/change-requests/${id}/accept`))).toBe('CHANGE_REQUEST_CLOSED');
    const v0 = await version(t);
    const r = await approve(staff, id);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.changeRequest.status).toBe('ACCEPTED');
    expect(r.body.topic.members.map((x) => x.userId)).toEqual([U[leader].id]);
    expect(await live(t, m)).toBeNull();
    expect(await version(t)).toBe(v0 + 1);
    expect(await prisma.auditLog.findFirst({ where: { action: 'MEMBER_LEAVE', entityId: t.id } })).toMatchObject({ actorId: U[staff].id, before: { userId: U[m].id, role: 'MEMBER' } });
    const notes = await prisma.notification.findMany({ where: { dedupeKey: `CHANGE_DECIDED:${id}` }, select: { userId: true, link: true } });
    expect(notes).toEqual(expect.arrayContaining([{ userId: U[m].id, link: '/yeu-cau' }, { userId: U[leader].id, link: `/de-tai/${t.id}/yeu-cau` }, { userId: U[lec].id, link: `/de-tai/${t.id}/yeu-cau` }]));
    // Mất quyền: chi tiết 403; vẫn xem yêu cầu của chính mình
    expect((await get(m, `/api/topics/${t.id}`)).status).toBe(403);
    expect((await get(m, `/api/change-requests/${id}`)).status).toBe(200);
  });

  it('ca 3: nhóm còn đúng min → tạo 409 GROUP_TOO_SMALL; tăng min sau khi tạo → duyệt 409 GROUP_TOO_SMALL, yêu cầu vẫn PENDING', async () => {
    const round = await mkRound(S.F1.id, 'Đợt min 2 – ca 3', { minMembers: 2 });
    const a = await mkGroup({ round, k: 1 });
    expect(code(await createLeave(a.ms[0], a.t))).toBe('GROUP_TOO_SMALL');
    const b = await mkGroup({ round, k: 2 });
    const staff = await mkUser('STAFF');
    const id = (await createLeave(b.ms[0], b.t)).body.changeRequest.id;
    await prisma.round.update({ where: { id: round.id }, data: { config: { ...round.config, minMembers: 3 } } });
    expect(code(await approve(staff, id))).toBe('GROUP_TOO_SMALL');
    expect((await prisma.changeRequest.findUnique({ where: { id } })).status).toBe('PENDING');
    expect(await live(b.t, b.ms[0])).not.toBeNull();
  });

  it('ca 4: đồng thời duyệt hai người rời khi chỉ còn một suất trên min → đúng một thành công, bên kia 409 GROUP_TOO_SMALL', async () => {
    const round = await mkRound(S.F1.id, 'Đợt min 2 – ca 4', { minMembers: 2 });
    const { t, ms } = await mkGroup({ round, k: 2 });
    const [s1, s2] = [await mkUser('STAFF'), await mkUser('STAFF')];
    const i1 = (await createLeave(ms[0], t)).body.changeRequest.id;
    const i2 = (await createLeave(ms[1], t)).body.changeRequest.id; // mỗi người rời một PENDING riêng
    const rs = await Promise.all([approve(s1, i1), approve(s2, i2)]);
    expect(rs.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(code(rs.find((r) => r.status === 409))).toBe('GROUP_TOO_SMALL');
    expect(await prisma.topicMember.count({ where: { topicId: t.id, leftAt: null } })).toBe(2);
  });

  it('sai trạng thái/vai trò: trưởng nhóm 409 LEADER_CANNOT_LEAVE; không IN_PROGRESS 409 TOPIC_NOT_IN_PROGRESS; SV ngoài, GV, cán bộ, ADMIN 403', async () => {
    const { t, leader, ms: [m] } = await mkGroup({ k: 2 });
    expect(code(await createLeave(leader, t))).toBe('LEADER_CANNOT_LEAVE');
    const outsider = await mkUser('STUDENT');
    const staff = await mkUser('STAFF');
    await prisma.advising.create({ data: { topicId: t.id, lecturerId: U.lecB.id } });
    for (const who of [outsider, 'lecB', staff, 'admin']) expect((await createLeave(who, t)).status, who).toBe(403);
    for (const status of ['WAITING_CLOSE', 'UNDER_REVIEW', 'CLOSED']) {
      const g = await mkGroup({ status, k: 2 });
      expect(code(await createLeave(g.ms[0], g.t)), status).toBe('TOPIC_NOT_IN_PROGRESS');
    }
    expect(await prisma.changeRequest.count({ where: { topicId: t.id } })).toBe(0);
    expect(await live(t, m)).not.toBeNull();
  });

  it('duyệt: cán bộ khoa khác/GV/SV 403 (kiểm phạm vi trước handler – MINOR T602-reviewer m2); người rời đã thành trưởng nhóm → 409 STALE; đề tài hết IN_PROGRESS → 409 TOPIC_NOT_IN_PROGRESS', async () => {
    const { t, leader, ms: [m] } = await mkGroup({ k: 2 });
    const id = (await createLeave(m, t)).body.changeRequest.id;
    for (const who of ['staff2', 'lecA', leader, m, 'admin']) expect((await approve(who, id)).status, who).toBe(403);
    expect(await live(t, m)).not.toBeNull();
    const staff = await mkUser('STAFF');
    expect((await post(leader, `/api/topics/${t.id}/leader`, { userId: U[m].id, version: await version(t) })).status).toBe(200);
    expect(code(await approve(staff, id))).toBe('STALE_CHANGE_REQUEST');
    const g = await mkGroup({ k: 2 });
    const id2 = (await createLeave(g.ms[0], g.t)).body.changeRequest.id;
    await prisma.topic.update({ where: { id: g.t.id }, data: { status: 'WAITING_CLOSE' } });
    expect(code(await approve(staff, id2))).toBe('TOPIC_NOT_IN_PROGRESS');
    expect(await live(g.t, g.ms[0])).not.toBeNull();
  });
});

describe('FR21 quyền đọc theo khoảng là thành viên (§5.4, ca 6–8)', () => {
  it('ca 6: snapshot trong khoảng 200, sau khi rời 403; diff 1↔2 403; tài liệu lọc + link tải theo khoảng; mọi endpoint khác 403', async () => {
    const { t, leader, ms: [m] } = await mkGroup({ k: 2 });
    await prisma.topicMember.updateMany({ where: { topicId: t.id, userId: U[m].id }, data: { joinedAt: ago(100) } });
    await mkSub(t, leader, 1, ago(50));
    const dIn = await mkDoc(t, leader, 1, ago(40));
    await prisma.feedback.create({ data: { topicId: t.id, documentId: dIn.id, lecturerId: U.lecA.id, content: 'Nhận xét bí mật' } });
    const staff = await mkUser('STAFF');
    const id = (await createLeave(m, t)).body.changeRequest.id;
    expect((await approve(staff, id)).status).toBe(200);
    await mkSub(t, leader, 2, new Date(Date.now() + 1000));
    const dOut = await mkDoc(t, leader, 2, new Date(Date.now() + 1000));

    const list = await get(m, `/api/topics/${t.id}/submissions`);
    expect([list.status, list.body.items.map((x) => x.seq)]).toEqual([200, [1]]);
    expect((await get(m, `/api/topics/${t.id}/submissions/1`)).status).toBe(200);
    expect((await get(m, `/api/topics/${t.id}/submissions/2`)).status).toBe(403);
    expect((await get(m, `/api/topics/${t.id}/submissions/9`)).status).toBe(404);
    expect((await get(m, `/api/topics/${t.id}/submission-diff?from=1&to=2`)).status).toBe(403);
    const docs = await get(m, `/api/topics/${t.id}/documents`);
    expect([docs.status, docs.body.items.map((x) => [x.id, x.feedbackCount])]).toEqual([200, [[dIn.id, null]]]);
    const ok = await post(m, `/api/documents/${dIn.id}/download-url`);
    expect([ok.status, typeof ok.body.url]).toEqual([200, 'string']);
    expect(await prisma.auditLog.count({ where: { action: 'DOCUMENT_DOWNLOAD', entityId: dIn.id, actorId: U[m].id } })).toBe(1); // FR24 vẫn ghi
    expect((await post(m, `/api/documents/${dOut.id}/download-url`)).status).toBe(403);
    for (const url of [`/api/topics/${t.id}`, `/api/topics/${t.id}/status-history`, `/api/topics/${t.id}/milestones`, `/api/topics/${t.id}/progress`,
      `/api/topics/${t.id}/feedbacks`, `/api/topics/${t.id}/results`, `/api/topics/${t.id}/change-requests`, `/api/topics/${t.id}/similarity-checks/latest`]) {
      expect((await get(m, url)).status, url).toBe(403);
    }
    // Đối chứng: thành viên hiện hành đọc đủ
    expect((await get(leader, `/api/topics/${t.id}/submissions`)).body.items.map((x) => x.seq)).toEqual([2, 1]);
    // SV chưa từng là thành viên: 403 ở mọi endpoint đọc phiên bản
    const outsider = await mkUser('STUDENT');
    expect((await get(outsider, `/api/topics/${t.id}/submissions`)).status).toBe(403);
    expect((await get(outsider, `/api/topics/${t.id}/documents`)).status).toBe(403);
    expect((await post(outsider, `/api/documents/${dIn.id}/download-url`)).status).toBe(403);
  });

  it('ca 7: rời (DRAFT) → được mời lại → rời lần hai: hai khoảng, đọc được cả hai, không đọc khoảng giữa', async () => {
    const { t, leader, ms: [m] } = await mkGroup({ status: 'DRAFT', k: 1 });
    expect((await leave(m, t, 0)).status).toBe(200);
    const inv = await mkInvite(t, m);
    expect((await post(m, `/api/invitations/${inv.id}/accept`)).status).toBe(200);
    expect((await leave(m, t, await version(t))).status).toBe(200);
    const rows = await prisma.topicMember.findMany({ where: { topicId: t.id, userId: U[m].id }, orderBy: { joinedAt: 'asc' } });
    expect(rows).toHaveLength(2);
    const mid = (a, b) => new Date((a.getTime() + b.getTime()) / 2);
    await mkSub(t, leader, 1, mid(rows[0].joinedAt, rows[0].leftAt), 'Tên khoảng 1');
    await mkSub(t, leader, 2, mid(rows[0].leftAt, rows[1].joinedAt), 'Tên khoảng giữa');
    await mkSub(t, leader, 3, mid(rows[1].joinedAt, rows[1].leftAt), 'Tên khoảng 2');
    await mkSub(t, leader, 4, new Date(Date.now() + 1000), 'Tên sau khi rời');
    expect((await get(m, `/api/topics/${t.id}/submissions`)).body.items.map((x) => x.seq)).toEqual([3, 1]);
    for (const [s, st] of [[1, 200], [2, 403], [3, 200], [4, 403]]) expect((await get(m, `/api/topics/${t.id}/submissions/${s}`)).status, `seq ${s}`).toBe(st);
    expect((await get(m, `/api/topics/${t.id}/submission-diff?from=1&to=3`)).status).toBe(200);
    expect((await get(m, `/api/topics/${t.id}/submission-diff?from=1&to=2`)).status).toBe(403);
    const past = (await get(m, '/api/me/past-topics')).body.items.find((x) => x.topicId === t.id);
    expect(past).toMatchObject({ code: t.code, title: 'Tên khoảng 2', submissionCount: 2, documentCount: 0 });
    expect(past.windows).toHaveLength(2);
  });

  it('ca 8: GET /api/me/past-topics – title từ snapshot trong khoảng, null nếu không có; không gồm đề tài đang là thành viên; GV/cán bộ/ADMIN 403', async () => {
    const me = await mkUser('STUDENT');
    const a = await mkGroup({ status: 'DRAFT', k: 0 });
    await addMember(a.t, me);
    expect((await leave(me, a.t)).status).toBe(200);
    const b = await mkGroup({ status: 'DRAFT', k: 0 });
    await prisma.topicMember.create({ data: { topicId: b.t.id, userId: U[me].id, role: 'MEMBER', joinedAt: ago(100), leftAt: ago(10) } });
    await mkSub(b.t, b.leader, 1, ago(50), 'Tên lúc còn ở nhóm');
    await mkSub(b.t, b.leader, 2, ago(5), 'Tên đổi sau khi rời');
    await mkDoc(b.t, b.leader, 1, ago(40));
    await mkDoc(b.t, b.leader, 2, ago(1));
    const c = await mkGroup({ status: 'DRAFT', k: 0 }); // đang là thành viên (đã rời rồi vào lại) → không liệt kê
    await prisma.topicMember.create({ data: { topicId: c.t.id, userId: U[me].id, role: 'MEMBER', joinedAt: ago(100), leftAt: ago(90) } });
    await addMember(c.t, me);
    const r = await get(me, '/api/me/past-topics');
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(2);
    const by = Object.fromEntries(r.body.items.map((x) => [x.topicId, x]));
    expect(by[a.t.id]).toMatchObject({ title: null, submissionCount: 0, documentCount: 0 });
    expect(by[b.t.id]).toMatchObject({ code: b.t.code, title: 'Tên lúc còn ở nhóm', submissionCount: 1, documentCount: 1 });
    expect(by[b.t.id].windows).toHaveLength(1);
    expect(by[c.t.id]).toBeUndefined();
    expect((await get(me, '/api/me/past-topics?pageSize=1')).body).toMatchObject({ page: 1, pageSize: 1, total: 2 });
    for (const who of ['lecA', 'staff1', 'admin']) expect((await get(who, '/api/me/past-topics')).status, who).toBe(403);
  });
});

describe('MINOR m5 reviews/T601-bao-mat-v1.md – người tạo mất quan hệ không rút được yêu cầu', () => {
  it('trưởng nhóm tạo CANCEL, chuyển quyền rồi rời nhóm (LEAVE_GROUP) → rút 403; cán bộ tạo ADVISOR_CHANGE rồi mất phạm vi khoa → rút 403', async () => {
    const { t, leader, ms: [m] } = await mkGroup({ k: 2 });
    const lec = await mkUser('LECTURER');
    await prisma.advising.create({ data: { topicId: t.id, lecturerId: U[lec].id } });
    const staff = await mkUser('STAFF');
    const cancelId = (await post(leader, `/api/topics/${t.id}/change-requests`, { type: 'CANCEL', reason: 'Nhóm không thể tiếp tục đề tài' })).body.changeRequest.id;
    expect((await post(leader, `/api/topics/${t.id}/leader`, { userId: U[m].id, version: await version(t) })).status).toBe(200);
    const leaveId = (await createLeave(leader, t)).body.changeRequest.id;
    expect((await approve(staff, leaveId)).status).toBe(200);
    expect((await post(leader, `/api/change-requests/${cancelId}/withdraw`)).status).toBe(403);
    expect((await prisma.changeRequest.findUnique({ where: { id: cancelId } })).status).toBe('PENDING');
    expect((await post(m, `/api/change-requests/${cancelId}/withdraw`)).status).toBe(403); // không phải người tạo

    const staffX = await mkUser('STAFF');
    const lecNew = await mkUser('LECTURER');
    const ac = await post(staffX, `/api/topics/${t.id}/change-requests`, { type: 'ADVISOR_CHANGE', reason: 'GVHD đi công tác dài hạn', newLecturerId: U[lecNew].id });
    expect(ac.status, JSON.stringify(ac.body)).toBe(201);
    await prisma.staffScope.deleteMany({ where: { userId: U[staffX].id } });
    expect((await post(staffX, `/api/change-requests/${ac.body.changeRequest.id}/withdraw`)).status).toBe(403);
    // Đối chứng: người tạo còn quan hệ rút được
    const g = await mkGroup({ k: 2 });
    const own = (await createLeave(g.ms[0], g.t)).body.changeRequest.id;
    expect((await post(g.ms[0], `/api/change-requests/${own}/withdraw`)).status).toBe(200);
  });
});
