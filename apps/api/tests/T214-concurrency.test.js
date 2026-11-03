// T214 (FR03, FR07, FR16, FR17, NFR05): ca đồng thời trên DB test thật, viết từ đặc tả API_GD2 §5.3, §5.5, §6, §8.3.
// Mỗi ca lặp vài lượt với dữ liệu mới để bắt race chập chờn; bất biến kiểm trên DB chứ không chỉ trên response.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma, S, U, seedBase, mkRound, mkTopic, addMember, mkInvite, mkWaiting, topicOf, activeCount, post, act, as } from './t214-kit.js';
import request from 'supertest';
import { app } from './t214-kit.js';

let n = 0;
const nextStudent = () => `s${++n}`;
const codes = (rs) => rs.map((r) => r.status).sort();

beforeAll(() => seedBase(), 60000);
afterAll(() => prisma.$disconnect());

describe('TC-FR03-C1 cancel || accept cùng một lời mời', () => {
  it.each([1, 2, 3, 4, 5, 6])('lượt %i: đúng một bên thắng, không có WITHDRAWN mà vẫn có thành viên', async () => {
    const leader = nextStudent();
    const invitee = nextStudent();
    const t = await mkTopic(leader);
    const inv = await mkInvite(t, invitee);
    const rs = await Promise.all([post(invitee, `/api/invitations/${inv.id}/accept`), post(leader, `/api/invitations/${inv.id}/cancel`)]);
    expect(codes(rs), JSON.stringify(rs.map((r) => r.body))).toEqual([200, 409]);
    const loser = rs.find((r) => r.status === 409);
    expect(loser.body.error.code).toBe('INVITATION_CLOSED');
    const after = await prisma.invitation.findUnique({ where: { id: inv.id } });
    const members = await prisma.topicMember.count({ where: { topicId: t.id, userId: U[invitee].id, leftAt: null } });
    const version = (await topicOf(t)).version;
    if (rs[0].status === 200) {
      expect({ s: after.status, members, version }).toEqual({ s: 'ACCEPTED', members: 1, version: 1 });
    } else {
      expect({ s: after.status, members, version }).toEqual({ s: 'WITHDRAWN', members: 0, version: 0 });
    }
  });

  it('TC-FR03-C2 hai lần accept cùng lời mời đồng thời: một thành viên, version +1', async () => {
    const leader = nextStudent();
    const invitee = nextStudent();
    const t = await mkTopic(leader);
    const inv = await mkInvite(t, invitee);
    const rs = await Promise.all([1, 2, 3].map(() => post(invitee, `/api/invitations/${inv.id}/accept`)));
    expect(codes(rs)).toEqual([200, 409, 409]);
    expect(await prisma.topicMember.count({ where: { topicId: t.id, userId: U[invitee].id } })).toBe(1);
    expect((await topicOf(t)).version).toBe(1);
  });
});

describe('TC-FR03-C3 một SV accept 2 lời mời vào 2 nhóm rồi cả hai REQUEST_ADVISOR', () => {
  it.each([1, 2, 3, 4])('lượt %i: đúng một nhóm qua, nhóm kia 409 STUDENT_TOPIC_LIMIT kèm mã SV', async () => {
    const c = nextStudent();
    const lx = nextStudent();
    const ly = nextStudent();
    const [x, y] = [await mkTopic(lx), await mkTopic(ly)];
    const [ix, iy] = [await mkInvite(x, c), await mkInvite(y, c)];
    // accept đồng thời: cả hai nhóm còn Nháp nên chưa tính là hoạt động, cả hai phải thành công
    const acc = await Promise.all([post(c, `/api/invitations/${ix.id}/accept`), post(c, `/api/invitations/${iy.id}/accept`)]);
    expect(codes(acc), JSON.stringify(acc.map((r) => r.body))).toEqual([200, 200]);
    const rs = await Promise.all([
      act(lx, x, { action: 'REQUEST_ADVISOR', lecturerId: U.lecA.id, version: 1 }),
      act(ly, y, { action: 'REQUEST_ADVISOR', lecturerId: U.lecB.id, version: 1 }),
    ]);
    expect(codes(rs), JSON.stringify(rs.map((r) => r.body))).toEqual([200, 409]);
    const bad = rs.find((r) => r.status === 409);
    expect(bad.body.error.code).toBe('STUDENT_TOPIC_LIMIT');
    expect(bad.body.error.details.codes).toContain(c);
    expect(await activeCount(c)).toBe(1);
    // bên thua rollback hoàn toàn: vẫn Nháp, không AdvisorRequest, không StatusHistory
    const loserTopic = rs[0].status === 409 ? x : y;
    expect((await topicOf(loserTopic)).status).toBe('DRAFT');
    expect(await prisma.advisorRequest.count({ where: { topicId: loserTopic.id } })).toBe(0);
    expect(await prisma.statusHistory.count({ where: { topicId: loserTopic.id } })).toBe(0);
  });
});

describe('TC-FR03-C4 §5.5: accept vào X || Y của cùng SV gửi || X gửi', () => {
  it.each([1, 2, 3, 4, 5])('lượt %i: không bao giờ có 2 đề tài hoạt động, không 5xx', async () => {
    const c = nextStudent();
    const lx = nextStudent();
    const x = await mkTopic(lx);
    const y = await mkTopic(c); // C là trưởng nhóm Y
    const ix = await mkInvite(x, c);
    const rs = await Promise.all([
      act(c, y, { action: 'REQUEST_ADVISOR', lecturerId: U.lecA.id }),
      post(c, `/api/invitations/${ix.id}/accept`),
      act(lx, x, { action: 'REQUEST_ADVISOR', lecturerId: U.lecB.id }),
    ]);
    for (const r of rs) expect(r.status, JSON.stringify(r.body)).toBeLessThan(500);
    expect(await activeCount(c)).toBeLessThanOrEqual(1);
    // nhất quán: C chỉ là thành viên X nếu lời mời ACCEPTED, và ngược lại
    const inv = await prisma.invitation.findUnique({ where: { id: ix.id } });
    const isMember = (await prisma.topicMember.count({ where: { topicId: x.id, userId: U[c].id, leftAt: null } })) === 1;
    expect(isMember).toBe(inv.status === 'ACCEPTED');
    // X đã gửi đề nghị thì không còn lời mời PENDING nào của X
    if ((await topicOf(x)).status === 'WAITING_ADVISOR') {
      expect(await prisma.invitation.count({ where: { topicId: x.id, status: 'PENDING' } })).toBe(0);
    }
  });

  it('kịch bản nối tiếp của §5.5: C vào X, Y của C gửi trước, rồi X gửi -> STUDENT_TOPIC_LIMIT', async () => {
    const c = nextStudent();
    const lx = nextStudent();
    const x = await mkTopic(lx);
    const y = await mkTopic(c);
    const ix = await mkInvite(x, c);
    expect((await post(c, `/api/invitations/${ix.id}/accept`)).status).toBe(200);
    expect((await act(c, y, { action: 'REQUEST_ADVISOR', lecturerId: U.lecA.id })).status).toBe(200);
    const r = await act(lx, x, { action: 'REQUEST_ADVISOR', lecturerId: U.lecB.id, version: 1 });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('STUDENT_TOPIC_LIMIT');
    expect(r.body.error.details.codes).toEqual([c]);
  });
});

describe('TC-FR16-C5 hạn mức GV khi nhận đồng thời', () => {
  it.each([1, 2, 3])('lượt %i: GV còn 1 suất nhận 2 đề tài khác nhau cùng lúc -> một thành công, một LECTURER_QUOTA_EXCEEDED', async () => {
    const r1 = await mkRound(S.F1.id, `GV tối đa 1 (${Date.now()}-${n})`, { maxTopicsPerLecturer: 1 });
    const [a, b] = [nextStudent(), nextStudent()];
    const [ta, tb] = [await mkWaiting(a, 'lecC', r1), await mkWaiting(b, 'lecC', r1)];
    const rs = await Promise.all([act('lecC', ta, { action: 'ACCEPT_ADVISING' }), act('lecC', tb, { action: 'ACCEPT_ADVISING' })]);
    expect(codes(rs), JSON.stringify(rs.map((r) => r.body))).toEqual([200, 409]);
    expect(rs.find((r) => r.status === 409).body.error.code).toBe('LECTURER_QUOTA_EXCEEDED');
    expect(await prisma.advising.count({ where: { lecturerId: U.lecC.id, endAt: null, topic: { roundId: r1.id } } })).toBe(1);
    const loser = rs[0].status === 409 ? ta : tb;
    expect((await topicOf(loser)).status).toBe('WAITING_ADVISOR');
    expect(await prisma.advisorRequest.count({ where: { topicId: loser.id, status: 'PENDING' } })).toBe(1);
  });

  it('TC-FR16-C6 hai lần REQUEST_ADVISOR cùng version của cùng đề tài: một AdvisorRequest, một StatusHistory', async () => {
    const t = await mkTopic(nextStudent());
    const leader = (await prisma.topicMember.findFirst({ where: { topicId: t.id }, include: { user: true } })).user.code;
    const rs = await Promise.all([
      act(leader, t, { action: 'REQUEST_ADVISOR', lecturerId: U.lecA.id }),
      act(leader, t, { action: 'REQUEST_ADVISOR', lecturerId: U.lecB.id }),
    ]);
    expect(codes(rs)).toEqual([200, 409]);
    expect(await prisma.advisorRequest.count({ where: { topicId: t.id } })).toBe(1);
    expect(await prisma.statusHistory.count({ where: { topicId: t.id } })).toBe(1);
    expect((await topicOf(t)).version).toBe(1);
  });
});

describe('TC-FR07-C7 hai cán bộ quyết định đồng thời trên cùng snapshot', () => {
  it.each([1, 2, 3])('lượt %i: APPROVE || REJECT -> chỉ một ReviewDecision', async () => {
    const t = await mkTopic(nextStudent(), S.round, { status: 'UNDER_REVIEW' });
    const leader = (await prisma.topicMember.findFirst({ where: { topicId: t.id }, include: { user: true } })).user;
    const sub = await prisma.submission.create({ data: { topicId: t.id, seq: 1, createdById: leader.id, payload: { title: 'x' } } });
    const rs = await Promise.all([
      act('staff1', t, { action: 'APPROVE', submissionId: sub.id }),
      act('staff1', t, { action: 'REJECT', submissionId: sub.id, reason: 'Không phù hợp định hướng' }),
    ]);
    expect(codes(rs), JSON.stringify(rs.map((r) => r.body))).toEqual([200, 409]);
    expect(await prisma.reviewDecision.count({ where: { submissionId: sub.id } })).toBe(1);
    expect(await prisma.statusHistory.count({ where: { topicId: t.id } })).toBe(1);
    expect(['IN_PROGRESS', 'REJECTED']).toContain((await topicOf(t)).status);
  });
});

describe('TC-FR25-C8 đồng thời không nới quyền', () => {
  it('người ngoài và ADMIN gọi accept/cancel song song vẫn 403', async () => {
    const [leader, invitee, other] = [nextStudent(), nextStudent(), nextStudent()];
    const t = await mkTopic(leader);
    await addMember(t, other);
    const inv = await mkInvite(t, invitee);
    const rs = await Promise.all([
      post(other, `/api/invitations/${inv.id}/accept`),
      post(other, `/api/invitations/${inv.id}/cancel`),
      request(app).post(`/api/invitations/${inv.id}/cancel`).set(as('admin')).send({}),
    ]);
    expect(rs.map((r) => r.status)).toEqual([403, 403, 403]);
    expect((await prisma.invitation.findUnique({ where: { id: inv.id } })).status).toBe('PENDING');
  });
});
