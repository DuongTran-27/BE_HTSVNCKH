// T208 (FR03, FR25, FR15): lời mời, nhóm, trưởng nhóm trên DB test thật. Dữ liệu riêng, resetData ở beforeAll.
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { TRANSITIONS, findTransition } from '@nckh/shared';
import { createApp } from '../src/app.js';
import { createAuthRepo } from '../src/modules/auth/prismaRepo.js';
import { createTopicRepo } from '../src/modules/topics/prismaRepo.js';
import { GD2_ACTIONS } from '../src/modules/topics/service.js';
import { withLockTx, LOCK_TIMEOUT } from '../src/lib/tx.js';
import { signAccessToken } from '../src/lib/tokens.js';
import { fakeHasher, testEnv } from './helpers.js';
import { resetData } from './db.js';

const prisma = new PrismaClient();
const app = createApp({ env: testEnv, logger: undefined, authRepo: createAuthRepo(prisma), hasher: fakeHasher, topicRepo: createTopicRepo(prisma) });

let F1, F2, round, smallRound;
const U = {};
const tok = {};
const as = (who) => ({ Authorization: `Bearer ${tok[who]}` });
const post = (who, url, body) => request(app).post(url).set(as(who)).send(body);
const get = (who, url) => request(app).get(url).set(as(who));
const day = 86400000;
const at = (d) => new Date(Date.now() + d * day);
const mkRound = (facultyId, name, config = {}) =>
  prisma.round.create({ data: { facultyId, name, academicYear: '2026-2027', regOpenAt: at(-1), regCloseAt: at(30), reviewDeadline: at(60), endAt: at(200), config } });
const mkTopic = async (leader, r = round, status = 'DRAFT') => {
  const t = await prisma.topic.create({
    data: { code: `T208-${Math.random().toString(36).slice(2, 10)}`, title: 'Đề tài', summary: '', objectives: '', keywords: [], roundId: r.id, facultyId: r.facultyId, status, members: { create: { userId: U[leader].id, role: 'LEADER' } } },
  });
  return t;
};
const invite = (topic, code) => prisma.invitation.create({ data: { topicId: topic.id, inviteeId: U[code].id } });
const members = (topicId) => prisma.topicMember.findMany({ where: { topicId, leftAt: null }, orderBy: { id: 'asc' } });
const audits = (action) => prisma.auditLog.findMany({ where: { action } });

beforeAll(async () => {
  await resetData(prisma);
  F1 = await prisma.faculty.create({ data: { code: 'CNTT', name: 'Công nghệ thông tin' } });
  F2 = await prisma.faculty.create({ data: { code: 'KT', name: 'Kinh tế' } });
  round = await mkRound(F1.id, 'Mặc định (tối đa 5)');
  smallRound = await mkRound(F1.id, 'Nhóm tối đa 2', { maxMembers: 2 });
  const mk = async (key, role, facultyId, extra = {}) => {
    U[key] = await prisma.user.create({ data: { code: key, email: `${key}@t.vn`, fullName: key, passwordHash: 'x', role, mustChangePassword: false, facultyId, ...extra } });
    tok[key] = signAccessToken(U[key], { secret: testEnv.JWT_ACCESS_SECRET, ttlSeconds: 600 });
  };
  await mk('admin', 'ADMIN');
  await mk('staff1', 'STAFF', F1.id);
  await mk('lect', 'LECTURER', F1.id);
  for (let i = 1; i <= 24; i++) await mk(`s${i}`, 'STUDENT', F1.id);
  await mk('sF2', 'STUDENT', F2.id);
  await mk('sLocked', 'STUDENT', F1.id, { isLocked: true });
});

describe('MINOR T209: GD2_ACTIONS đối chiếu TRANSITIONS', () => {
  it('mọi action GĐ2 tồn tại trong TRANSITIONS', () => {
    const all = TRANSITIONS.map((t) => t.action);
    for (const a of GD2_ACTIONS) {
      expect(all).toContain(a);
      expect(findTransition(a)).toBeTruthy();
    }
  });
});

describe('withLockTx', () => {
  it('lock_timeout = 3s trong tx, và không rò ra ngoài tx', async () => {
    const inside = await withLockTx(prisma, async (tx) => (await tx.$queryRaw`SELECT current_setting('lock_timeout') AS v`)[0].v);
    expect(inside).toBe(LOCK_TIMEOUT);
    const outside = (await prisma.$queryRaw`SELECT current_setting('lock_timeout') AS v`)[0].v;
    expect(outside).not.toBe(LOCK_TIMEOUT);
  });

  it('tx khác giữ khóa Topic quá 3s -> 409 CONCURRENT_UPDATE, không phải 500', async () => {
    const t = await mkTopic('s1');
    let release;
    const hold = new Promise((r) => { release = r; });
    let locked;
    const gotLock = new Promise((r) => { locked = r; });
    const holder = withLockTx(prisma, async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Topic" WHERE id = ${t.id} FOR NO KEY UPDATE`;
      locked();
      await hold;
    });
    await gotLock;
    const res = await post('s1', `/api/topics/${t.id}/invitations`, { inviteeCode: 's2' });
    release();
    await holder;
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONCURRENT_UPDATE');
  }, 20000);
});

describe('POST /api/topics/:id/invitations', () => {
  it('trưởng nhóm mời theo mã SV: 201, PENDING, AuditLog; không đổi thành viên', async () => {
    const t = await mkTopic('s1');
    const r = await post('s1', `/api/topics/${t.id}/invitations`, { inviteeCode: 's2' });
    expect(r.status).toBe(201);
    expect(r.body.invitation).toMatchObject({ status: 'PENDING', invitee: { code: 's2' }, topic: { id: t.id, code: t.code } });
    expect(await members(t.id)).toHaveLength(1);
    const log = (await audits('INVITATION_CREATE')).find((a) => a.entityId === r.body.invitation.id);
    expect(log).toMatchObject({ actorId: U.s1.id });
  });

  it('403: thành viên không phải trưởng nhóm, người ngoài, GV, STAFF, ADMIN; 404 id lạ; 401', async () => {
    const t = await mkTopic('s3');
    await prisma.topicMember.create({ data: { topicId: t.id, userId: U.s4.id, role: 'MEMBER' } });
    for (const who of ['s4', 's5', 'lect', 'staff1', 'admin']) {
      expect((await post(who, `/api/topics/${t.id}/invitations`, { inviteeCode: 's6' })).status, who).toBe(403);
    }
    expect((await post('s3', '/api/topics/khong-co/invitations', { inviteeCode: 's6' })).status).toBe(404);
    expect((await request(app).post(`/api/topics/${t.id}/invitations`).send({ inviteeCode: 's6' })).status).toBe(401);
  });

  it('409 TOPIC_NOT_EDITABLE khi không còn Nháp', async () => {
    const t = await mkTopic('s7', round, 'WAITING_ADVISOR');
    const r = await post('s7', `/api/topics/${t.id}/invitations`, { inviteeCode: 's8' });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('TOPIC_NOT_EDITABLE');
  });

  it('400 một thông điệp chung: mã lạ, khoa khác, tài khoản khóa, không phải SV', async () => {
    const t = await mkTopic('s9');
    for (const code of ['khong-co', 'sF2', 'sLocked', 'lect', 'admin']) {
      const r = await post('s9', `/api/topics/${t.id}/invitations`, { inviteeCode: code });
      expect(r.status, code).toBe(400);
      expect(r.body.error.details.inviteeCode).toBe('Không tìm thấy sinh viên phù hợp');
    }
    expect((await post('s9', `/api/topics/${t.id}/invitations`, {})).status).toBe(400);
  });

  it('409 ALREADY_MEMBER: đã là thành viên, tự mời mình, đã có lời mời PENDING', async () => {
    const t = await mkTopic('s10');
    await prisma.topicMember.create({ data: { topicId: t.id, userId: U.s11.id, role: 'MEMBER' } });
    await invite(t, 's12');
    for (const code of ['s11', 's10', 's12']) {
      const r = await post('s10', `/api/topics/${t.id}/invitations`, { inviteeCode: code });
      expect(r.status, code).toBe(409);
      expect(r.body.error.code).toBe('ALREADY_MEMBER');
    }
  });

  it('409 GROUP_FULL: thành viên + lời mời chờ đạt tối đa của đợt', async () => {
    const t = await mkTopic('s13', smallRound);
    expect((await post('s13', `/api/topics/${t.id}/invitations`, { inviteeCode: 's14' })).status).toBe(201);
    const r = await post('s13', `/api/topics/${t.id}/invitations`, { inviteeCode: 's15' });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('GROUP_FULL');
  });

  it('mời đồng thời: không vượt tối đa (khóa Topic)', async () => {
    const t = await mkTopic('s16', smallRound); // còn 1 chỗ
    const rs = await Promise.all(['s17', 's18', 's19', 's20'].map((c) => post('s16', `/api/topics/${t.id}/invitations`, { inviteeCode: c })));
    expect(rs.filter((r) => r.status === 201)).toHaveLength(1);
    for (const r of rs.filter((x) => x.status !== 201)) expect(r.body.error.code).toBe('GROUP_FULL');
    expect(await prisma.invitation.count({ where: { topicId: t.id, status: 'PENDING' } })).toBe(1);
  });
});

describe('GET /api/invitations', () => {
  it('liệt kê lời mời của mình, lọc status, phân trang; không lộ tóm tắt; GV/ADMIN 403', async () => {
    const t = await mkTopic('s21');
    const i1 = await invite(t, 's22');
    const t2 = await mkTopic('s23');
    await invite(t2, 's22');
    await prisma.invitation.update({ where: { id: i1.id }, data: { status: 'DECLINED' } });
    const r = await get('s22', '/api/invitations');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ page: 1, pageSize: 20, total: 2 });
    const item = r.body.items.find((i) => i.topic.id === t2.id);
    expect(item.topic).toMatchObject({ code: t2.code, round: { id: round.id }, leader: { code: 's23' }, memberCount: 1 });
    expect(item.topic.summary).toBeUndefined();
    expect((await get('s22', '/api/invitations?status=PENDING')).body.total).toBe(1);
    expect((await get('s22', '/api/invitations?pageSize=1&page=2')).body.items).toHaveLength(1);
    expect((await get('s21', '/api/invitations')).body.total).toBe(0);
    expect((await get('lect', '/api/invitations')).status).toBe(403);
    expect((await get('admin', '/api/invitations')).status).toBe(403);
    expect((await get('s22', '/api/invitations?status=XYZ')).status).toBe(400);
  });
});

describe('POST /api/invitations/:id/accept', () => {
  it('chấp nhận: ACCEPTED, tạo TopicMember MEMBER, tăng version, AuditLog', async () => {
    const t = await mkTopic('s1', round);
    const inv = await invite(t, 's24');
    const r = await post('s24', `/api/invitations/${inv.id}/accept`, {});
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ topicId: t.id, invitation: { status: 'ACCEPTED' } });
    expect(r.body.invitation.respondedAt).toBeTruthy();
    expect((await members(t.id)).map((m) => [m.userId, m.role])).toEqual([[U.s1.id, 'LEADER'], [U.s24.id, 'MEMBER']]);
    expect((await prisma.topic.findUnique({ where: { id: t.id } })).version).toBe(1);
    expect((await audits('INVITATION_ACCEPT')).some((a) => a.entityId === inv.id && a.actorId === U.s24.id)).toBe(true);
  });

  it('403: người khác (kể cả trưởng nhóm) chấp nhận hộ; 404 id lạ', async () => {
    const t = await mkTopic('s2');
    const inv = await invite(t, 's3');
    expect((await post('s2', `/api/invitations/${inv.id}/accept`, {})).status).toBe(403);
    expect((await post('s5', `/api/invitations/${inv.id}/accept`, {})).status).toBe(403);
    expect((await post('lect', `/api/invitations/${inv.id}/accept`, {})).status).toBe(403);
    expect((await post('s3', '/api/invitations/khong-co/accept', {})).status).toBe(404);
    expect((await prisma.invitation.findUnique({ where: { id: inv.id } })).status).toBe('PENDING');
  });

  it('409 INVITATION_CLOSED: lời mời đã xử lý hoặc đề tài rời Nháp; rollback, không tăng version', async () => {
    const t = await mkTopic('s4');
    const done = await invite(t, 's5');
    await prisma.invitation.update({ where: { id: done.id }, data: { status: 'DECLINED' } });
    expect((await post('s5', `/api/invitations/${done.id}/accept`, {})).body.error.code).toBe('INVITATION_CLOSED');

    const t2 = await mkTopic('s6', round, 'WAITING_ADVISOR');
    const inv = await invite(t2, 's7');
    const r = await post('s7', `/api/invitations/${inv.id}/accept`, {});
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('INVITATION_CLOSED');
    expect((await prisma.invitation.findUnique({ where: { id: inv.id } })).status).toBe('PENDING');
    expect((await prisma.topic.findUnique({ where: { id: t2.id } })).version).toBe(0);
  });

  it('409 GROUP_FULL khi nhóm đã đủ (rollback cả lời mời lẫn version)', async () => {
    const t = await mkTopic('s8', smallRound);
    await prisma.topicMember.create({ data: { topicId: t.id, userId: U.s9.id, role: 'MEMBER' } });
    const inv = await invite(t, 's10');
    const r = await post('s10', `/api/invitations/${inv.id}/accept`, {});
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('GROUP_FULL');
    expect((await prisma.invitation.findUnique({ where: { id: inv.id } })).status).toBe('PENDING');
    expect((await prisma.topic.findUnique({ where: { id: t.id } })).version).toBe(0);
  });

  it('409 STUDENT_TOPIC_LIMIT khi SV đã có đề tài hoạt động trong đợt; đề tài Nháp/đợt khác không tính', async () => {
    const other = await mkRound(F1.id, 'Đợt khác');
    const draftOnly = await mkTopic('s11');
    await invite(draftOnly, 's12'); // s12 chưa có đề tài hoạt động
    const active = await mkTopic('s12', round, 'UNDER_REVIEW');
    const t = await mkTopic('s13', round);
    const inv = await invite(t, 's12');
    const r = await post('s12', `/api/invitations/${inv.id}/accept`, {});
    expect(r.status).toBe(409);
    expect(r.body.error).toMatchObject({ code: 'STUDENT_TOPIC_LIMIT', details: { codes: ['s12'] } });
    expect(active.id).toBeTruthy();
    // đề tài hoạt động ở đợt khác không tính
    const inOther = await mkTopic('s14', other);
    await prisma.topic.update({ where: { id: inOther.id }, data: { status: 'UNDER_REVIEW' } });
    await prisma.topicMember.create({ data: { topicId: inOther.id, userId: U.s15.id, role: 'MEMBER' } });
    const t3 = await mkTopic('s16');
    const inv3 = await invite(t3, 's15');
    expect((await post('s15', `/api/invitations/${inv3.id}/accept`, {})).status).toBe(200);
  });

  it('accept đồng thời hai lời mời cuối cùng: chỉ một thắng (GROUP_FULL)', async () => {
    const t = await mkTopic('s17', smallRound);
    const a = await invite(t, 's18');
    const b = await invite(t, 's19');
    const rs = await Promise.all([post('s18', `/api/invitations/${a.id}/accept`, {}), post('s19', `/api/invitations/${b.id}/accept`, {})]);
    expect(rs.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await members(t.id)).toHaveLength(2);
  });
});

describe('decline / cancel', () => {
  it('decline: người được mời, DECLINED, không đổi version/thành viên, AuditLog', async () => {
    const t = await mkTopic('s20');
    const inv = await invite(t, 's21');
    expect((await post('s20', `/api/invitations/${inv.id}/decline`, {})).status).toBe(403);
    const r = await post('s21', `/api/invitations/${inv.id}/decline`, {});
    expect(r.status).toBe(200);
    expect(r.body.invitation.status).toBe('DECLINED');
    expect((await prisma.topic.findUnique({ where: { id: t.id } })).version).toBe(0);
    expect(await members(t.id)).toHaveLength(1);
    expect((await audits('INVITATION_DECLINE')).some((a) => a.entityId === inv.id)).toBe(true);
    expect((await post('s21', `/api/invitations/${inv.id}/decline`, {})).body.error.code).toBe('INVITATION_CLOSED');
  });

  it('cancel: chỉ trưởng nhóm; WITHDRAWN; người được mời/người ngoài/GV 403; sau đó accept bị 409', async () => {
    const t = await mkTopic('s22');
    const inv = await invite(t, 's23');
    for (const who of ['s23', 's24', 'lect', 'admin']) expect((await post(who, `/api/invitations/${inv.id}/cancel`, {})).status, who).toBe(403);
    const r = await post('s22', `/api/invitations/${inv.id}/cancel`, {});
    expect(r.status).toBe(200);
    expect(r.body.invitation.status).toBe('WITHDRAWN');
    expect((await post('s23', `/api/invitations/${inv.id}/accept`, {})).body.error.code).toBe('INVITATION_CLOSED');
    expect(await members(t.id)).toHaveLength(1);
    expect((await audits('INVITATION_CANCEL')).some((a) => a.entityId === inv.id)).toBe(true);
  });

  it('cancel ‖ accept đồng thời: đúng một bên thắng, trạng thái nhất quán với TopicMember', async () => {
    for (let i = 0; i < 5; i++) {
      const t = await mkTopic('s1');
      const inv = await invite(t, 's2');
      const rs = await Promise.all([post('s1', `/api/invitations/${inv.id}/cancel`, {}), post('s2', `/api/invitations/${inv.id}/accept`, {})]);
      expect(rs.map((r) => r.status).sort()).toEqual([200, 409]);
      const status = (await prisma.invitation.findUnique({ where: { id: inv.id } })).status;
      expect(await members(t.id)).toHaveLength(status === 'ACCEPTED' ? 2 : 1);
    }
  });
});

describe('POST /api/topics/:id/leader', () => {
  const setup = async (leader, member) => {
    const t = await mkTopic(leader);
    await prisma.topicMember.create({ data: { topicId: t.id, userId: U[member].id, role: 'MEMBER' } });
    return t;
  };
  const leaders = async (id) => (await members(id)).filter((m) => m.role === 'LEADER');

  it('trưởng nhóm chuyển cho thành viên: đúng một LEADER, version +1, AuditLog, trả TopicDetail', async () => {
    const t = await setup('s3', 's4');
    const r = await post('s3', `/api/topics/${t.id}/leader`, { userId: U.s4.id, version: 0 });
    expect(r.status).toBe(200);
    expect(r.body.topic.version).toBe(1);
    expect(r.body.topic.members.find((m) => m.role === 'LEADER').userId).toBe(U.s4.id);
    expect((await leaders(t.id)).map((m) => m.userId)).toEqual([U.s4.id]);
    const log = (await audits('LEADER_TRANSFER')).find((a) => a.entityId === t.id);
    expect(log).toMatchObject({ before: { leaderUserId: U.s3.id }, after: { leaderUserId: U.s4.id } });
    // trưởng nhóm cũ không còn quyền
    expect((await post('s3', `/api/topics/${t.id}/leader`, { userId: U.s3.id, version: 1 })).status).toBe(403);
  });

  it('403 vai trò/quan hệ sai; 404; 401', async () => {
    const t = await setup('s5', 's6');
    for (const who of ['s6', 's7', 'lect', 'staff1', 'admin']) expect((await post(who, `/api/topics/${t.id}/leader`, { userId: U.s6.id, version: 0 })).status, who).toBe(403);
    expect((await post('s5', '/api/topics/khong-co/leader', { userId: U.s6.id, version: 0 })).status).toBe(404);
    expect((await request(app).post(`/api/topics/${t.id}/leader`).send({ userId: U.s6.id, version: 0 })).status).toBe(401);
    expect((await leaders(t.id)).map((m) => m.userId)).toEqual([U.s5.id]);
  });

  it('409 CONCURRENT_UPDATE khi version lệch; 400 khi đích không phải thành viên hoặc là chính mình', async () => {
    const t = await setup('s8', 's9');
    const stale = await post('s8', `/api/topics/${t.id}/leader`, { userId: U.s9.id, version: 5 });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('CONCURRENT_UPDATE');
    for (const userId of [U.s10.id, U.s8.id]) {
      const r = await post('s8', `/api/topics/${t.id}/leader`, { userId, version: 0 });
      expect(r.status).toBe(400);
      expect(r.body.error.details).toHaveProperty('userId');
    }
    expect((await prisma.topic.findUnique({ where: { id: t.id } })).version).toBe(0); // rollback
    expect((await leaders(t.id)).map((m) => m.userId)).toEqual([U.s8.id]);
  });

  it('409 TOPIC_NOT_EDITABLE ở trạng thái kết thúc, chuyển được ở trạng thái đang xử lý', async () => {
    for (const status of ['REJECTED', 'CANCELLED', 'CLOSED']) {
      const t = await setup('s11', 's12');
      await prisma.topic.update({ where: { id: t.id }, data: { status } });
      const r = await post('s11', `/api/topics/${t.id}/leader`, { userId: U.s12.id, version: 0 });
      expect(r.status, status).toBe(409);
      expect(r.body.error.code).toBe('TOPIC_NOT_EDITABLE');
      expect((await prisma.topic.findUnique({ where: { id: t.id } })).version).toBe(0);
    }
    const t = await setup('s13', 's14');
    await prisma.topic.update({ where: { id: t.id }, data: { status: 'HAS_ADVISOR' } });
    expect((await post('s13', `/api/topics/${t.id}/leader`, { userId: U.s14.id, version: 0 })).status).toBe(200);
  });

  it('chuyển đồng thời với cùng version: đúng một bên thắng, vẫn đúng một LEADER', async () => {
    const t = await setup('s15', 's16');
    await prisma.topicMember.create({ data: { topicId: t.id, userId: U.s17.id, role: 'MEMBER' } });
    const rs = await Promise.all([
      post('s15', `/api/topics/${t.id}/leader`, { userId: U.s16.id, version: 0 }),
      post('s15', `/api/topics/${t.id}/leader`, { userId: U.s17.id, version: 0 }),
    ]);
    expect(rs.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await leaders(t.id)).toHaveLength(1);
  });
});
