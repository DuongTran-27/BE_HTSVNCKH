// T505 (FR13, M2 "Nhắc hạn không gửi trùng"): bổ sung cho T501 – cron gọi đồng thời/lặp, sự kiện nghiệp vụ retry hoặc chạy
// đồng thời không tạo thông báo trùng cho cùng người nhận; người nhận khác nhau vẫn nhận riêng; đã đọc không bị "hồi sinh".
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createAuthRepo } from '../src/modules/auth/prismaRepo.js';
import { createTopicRepo } from '../src/modules/topics/prismaRepo.js';
import { fakeHasher, testEnv } from './helpers.js';
import { prisma, S, U, seedBase, mkTopic, addMember, mkWaiting, post, get, act, at, day } from './t214-kit.js';

const SECRET = 'secret-gia-t505-'.padEnd(48, 'x'); // bí mật giả chỉ dùng trong test
const cronApp = () => createApp({ env: { ...testEnv, CRON_SECRET: SECRET }, logger: undefined, authRepo: createAuthRepo(prisma), hasher: fakeHasher, topicRepo: createTopicRepo(prisma) });
const cron = (a) => request(a).post('/api/cron/reminders').set('Authorization', `Bearer ${SECRET}`);
let seq = 0;
const next = () => `s${++seq}`;
const running = async () => {
  const leader = next();
  const member = next();
  const t = await mkTopic(leader, S.round, { status: 'IN_PROGRESS' });
  await addMember(t, member);
  await prisma.advising.create({ data: { topicId: t.id, lecturerId: U.lecA.id } });
  return { t, leader, member };
};
const milestone = (t, name, dueAt, o = {}) => prisma.milestone.create({ data: { topicId: t.id, order: ++seq, name, output: 'x', dueAt, createdById: U.lecA.id, ...o } });
// Mọi cặp (người nhận, khóa) chỉ có đúng một dòng – kiểm độc lập với ràng buộc unique của DB
const duplicates = async () => {
  const rows = await prisma.notification.findMany({ select: { userId: true, dedupeKey: true } });
  const seen = new Set();
  return rows.filter((r) => { const k = `${r.userId}|${r.dedupeKey}`; return seen.has(k) || !seen.add(k); }).length;
};
const count = (where) => prisma.notification.count({ where });

beforeAll(() => seedBase({ students: 40 }), 60000);
afterAll(() => prisma.$disconnect());

describe('TC-FR13 cron nhắc hạn không trùng', () => {
  it('TC-FR13-D01 5 lần gọi đồng thời: tổng notificationsCreated = số dòng thật, không dòng trùng, mỗi người một thông báo mỗi mốc', async () => {
    const a = cronApp();
    await cron(a); // dọn trước
    const { t, leader, member } = await running();
    const soon = await milestone(t, 'Sắp hạn', at(2));
    const over = await milestone(t, 'Quá hạn', at(-1));
    const old = await mkWaiting(next(), 'lecB');
    await prisma.advisorRequest.updateMany({ where: { topicId: old.id }, data: { createdAt: new Date(Date.now() - 5 * day) } });
    const before = await count({});
    const rs = await Promise.all(Array.from({ length: 5 }, () => cron(a)));
    for (const r of rs) expect(r.status, JSON.stringify(r.body)).toBe(200);
    const created = rs.reduce((s, r) => s + r.body.notificationsCreated, 0);
    const mine = await count({ OR: [{ dedupeKey: { contains: soon.id } }, { dedupeKey: { contains: over.id } }, { type: 'ADVISOR_REQUEST_REMINDER' }] });
    expect(mine).toBe(2 + 3 + 2); // sắp hạn: 2 SV; quá hạn: 2 SV + GVHD; nhắc đề nghị: GV + cán bộ
    expect(await count({}) - before).toBe(created); // số báo cáo = số ghi thật (không báo "đã tạo" cho dòng bị bỏ qua)
    expect(await duplicates()).toBe(0);
    expect(await count({ userId: U[leader].id, dedupeKey: { contains: soon.id } })).toBe(1);
    expect(await count({ userId: U[member].id, dedupeKey: { contains: over.id } })).toBe(1);
    expect(rs.reduce((s, r) => s + r.body.advisorReminders, 0)).toBe(1);
  });

  it('TC-FR13-D02 gọi lặp nhiều lần theo thời gian: 0 dòng mới; đã đọc không bị tạo lại thành chưa đọc', async () => {
    const a = cronApp();
    const { t, leader } = await running();
    const m = await milestone(t, 'Hạn gần', at(1));
    await cron(a);
    const [n] = await prisma.notification.findMany({ where: { userId: U[leader].id, dedupeKey: { contains: m.id } } });
    expect(n).toBeTruthy();
    expect((await post(leader, `/api/notifications/${n.id}/read`)).status).toBe(204);
    for (let i = 0; i < 3; i++) expect((await cron(a)).body.notificationsCreated).toBe(0);
    expect((await get(leader, '/api/notifications/unread-count')).body.count).toBe(0);
    expect(await count({ userId: U[leader].id, dedupeKey: { contains: m.id } })).toBe(1);
  });

  it('TC-FR13-D03 cùng một SV thuộc hai đề tài cùng quá hạn: nhận riêng hai thông báo (khóa theo mốc, không gộp theo người)', async () => {
    const a = cronApp();
    await cron(a);
    const t1 = await mkTopic(next(), S.round, { status: 'IN_PROGRESS' });
    const t2 = await mkTopic(next(), S.round, { status: 'IN_PROGRESS' });
    const shared = next();
    await addMember(t1, shared);
    await addMember(t2, shared);
    const m1 = await milestone(t1, 'Trùng tên', at(-1));
    const m2 = await milestone(t2, 'Trùng tên', at(-1));
    await cron(a);
    expect(await count({ userId: U[shared].id, type: 'MILESTONE_OVERDUE' })).toBe(2);
    expect(await count({ userId: U[shared].id, dedupeKey: { contains: m1.id } })).toBe(1);
    expect(await count({ userId: U[shared].id, dedupeKey: { contains: m2.id } })).toBe(1);
    expect(await duplicates()).toBe(0);
  });

  it('TC-FR13-D04 hai mốc quá hạn khác nhau của một đề tài nhắc riêng; mốc đã nhắc rồi bị đổi hạn sang quá khứ khác thì nhắc lại đúng một lần', async () => {
    const a = cronApp();
    await cron(a);
    const { t, leader } = await running();
    const m1 = await milestone(t, 'M1', at(-1));
    await milestone(t, 'M2', at(-2));
    await cron(a);
    expect(await count({ userId: U[leader].id, type: 'MILESTONE_OVERDUE' })).toBe(2);
    await prisma.milestone.update({ where: { id: m1.id }, data: { dueAt: at(-3) } });
    expect((await cron(a)).body.notificationsCreated).toBe(3); // 2 SV + GVHD cho hạn mới
    expect((await cron(a)).body.notificationsCreated).toBe(0);
    expect(await duplicates()).toBe(0);
  });

  it('TC-FR13-D05 nhắc đề nghị hướng dẫn: gọi đồng thời 4 lần chỉ một lần nhắc; GV khác và đề nghị khác nhận riêng', async () => {
    const a = cronApp();
    await cron(a);
    const x = await mkWaiting(next(), 'lecB');
    const y = await mkWaiting(next(), 'lecC');
    await prisma.advisorRequest.updateMany({ where: { topicId: { in: [x.id, y.id] } }, data: { createdAt: new Date(Date.now() - 6 * day) } });
    const rs = await Promise.all(Array.from({ length: 4 }, () => cron(a)));
    expect(rs.reduce((s, r) => s + r.body.advisorReminders, 0)).toBe(2);
    const [rx, ry] = await Promise.all([x, y].map((tp) => prisma.advisorRequest.findFirst({ where: { topicId: tp.id } })));
    const key = (r) => `ADVISOR_REQUEST_REMINDER:${r.id}`;
    expect(await count({ dedupeKey: key(rx), userId: U.lecB.id })).toBe(1);
    expect(await count({ dedupeKey: key(ry), userId: U.lecC.id })).toBe(1);
    expect(await count({ dedupeKey: key(rx), userId: U.lecC.id })).toBe(0); // GV khác không nhận nhắc của đề nghị không phải của mình
    expect(await count({ userId: U.staff1.id, dedupeKey: { in: [key(rx), key(ry)] } })).toBe(2); // một cán bộ, hai đề nghị khác nhau
    expect(await duplicates()).toBe(0);
  });

  it('TC-FR13-D06 người nhận bị khóa không nhận nhắc hạn, người còn lại vẫn nhận', async () => {
    const a = cronApp();
    await cron(a);
    const { t, leader, member } = await running();
    await prisma.user.update({ where: { id: U[member].id }, data: { isLocked: true } });
    const m = await milestone(t, 'Hạn', at(-1));
    await cron(a);
    expect(await count({ userId: U[member].id, dedupeKey: { contains: m.id } })).toBe(0);
    expect(await count({ userId: U[leader].id, dedupeKey: { contains: m.id } })).toBe(1);
  });
});

describe('TC-FR13 sự kiện nghiệp vụ lặp/đồng thời không tạo thông báo trùng', () => {
  it('TC-FR13-D07 hai lần REQUEST_CLOSE đồng thời cùng version: một thành công, cán bộ chỉ nhận một thông báo', async () => {
    const { t } = await running();
    await prisma.milestone.create({ data: { topicId: t.id, order: 1, name: 'M', output: 'x', dueAt: at(5), evaluation: 'PASSED', createdById: U.lecA.id } });
    await prisma.resultVersion.create({ data: { topicId: t.id, version: 1, result: 'GOOD', summary: 'Nhóm hoàn thành tốt mục tiêu.', createdById: U.lecA.id } });
    const rs = await Promise.all([act('lecA', t, { action: 'REQUEST_CLOSE', version: 0 }), act('lecA', t, { action: 'REQUEST_CLOSE', version: 0 })]);
    expect(rs.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await count({ type: 'CLOSE_REQUESTED', dedupeKey: { startsWith: `CLOSE_REQUESTED:${t.id}` }, userId: U.staff1.id })).toBe(1);
    // retry sau khi đã chuyển trạng thái: bị từ chối và không thêm thông báo
    const again = await act('lecA', t, { action: 'REQUEST_CLOSE', version: 0 });
    expect(again.status).toBeGreaterThanOrEqual(400);
    expect(await count({ type: 'CLOSE_REQUESTED', dedupeKey: { startsWith: `CLOSE_REQUESTED:${t.id}` } })).toBe(1);
  });

  it('TC-FR13-D08 hai lần CONFIRM_CLOSE đồng thời: mỗi thành viên và GVHD chỉ nhận đúng một TOPIC_CLOSED', async () => {
    const { t, leader, member } = await running();
    await prisma.milestone.create({ data: { topicId: t.id, order: 1, name: 'M', output: 'x', dueAt: at(5), evaluation: 'PASSED', createdById: U.lecA.id } });
    await prisma.resultVersion.create({ data: { topicId: t.id, version: 1, result: 'PASS', summary: 'Nhóm hoàn thành mục tiêu.', createdById: U.lecA.id } });
    expect((await act('lecA', t, { action: 'REQUEST_CLOSE', version: 0 })).status).toBe(200);
    const rs = await Promise.all([act('staff1', t, { action: 'CONFIRM_CLOSE', version: 1 }), act('staff1', t, { action: 'CONFIRM_CLOSE', version: 1 })]);
    expect(rs.map((r) => r.status).sort()).toEqual([200, 409]);
    for (const who of [leader, member, 'lecA']) expect(await count({ type: 'TOPIC_CLOSED', userId: U[who].id, dedupeKey: `TOPIC_CLOSED:${t.id}` })).toBe(1);
    expect(await duplicates()).toBe(0);
  });

  it('TC-FR13-D09 nhập kết quả đồng thời cùng expectedVersion: một bản thành công, thành viên chỉ nhận một RESULT_ENTERED', async () => {
    const { t, leader, member } = await running();
    const body = { result: 'GOOD', summary: 'Nhóm hoàn thành các mục tiêu đề ra.', expectedVersion: 0 };
    const rs = await Promise.all([post('lecA', `/api/topics/${t.id}/results`, body), post('lecA', `/api/topics/${t.id}/results`, body)]);
    expect(rs.map((r) => r.status).sort(), JSON.stringify(rs.map((r) => r.body))).toEqual([201, 409]);
    for (const who of [leader, member]) expect(await count({ type: 'RESULT_ENTERED', userId: U[who].id, dedupeKey: { startsWith: 'RESULT_ENTERED:' } })).toBe(1);
  });

  it('TC-FR13-D10 chấp nhận lời mời hai lần đồng thời: trưởng nhóm nhận một INVITATION_ACCEPTED; mời lại cùng người khi lời mời còn mở không tạo thông báo thứ hai', async () => {
    const leader = next();
    const invitee = next();
    const t = await mkTopic(leader);
    const inv = await post(leader, `/api/topics/${t.id}/invitations`, { inviteeCode: invitee });
    expect(inv.status).toBe(201);
    const dup = await post(leader, `/api/topics/${t.id}/invitations`, { inviteeCode: invitee });
    expect(dup.status).toBeGreaterThanOrEqual(400);
    expect(await count({ userId: U[invitee].id, type: 'INVITATION_RECEIVED' })).toBe(1);
    const rs = await Promise.all([post(invitee, `/api/invitations/${inv.body.invitation.id}/accept`), post(invitee, `/api/invitations/${inv.body.invitation.id}/accept`)]);
    expect(rs.filter((r) => r.status === 200).length).toBe(1);
    expect(await count({ userId: U[leader].id, type: 'INVITATION_ACCEPTED' })).toBe(1);
  });

  it('TC-FR13-D11 người gây sự kiện không tự nhận thông báo; người nhận khác nhau nhận riêng đúng nội dung', async () => {
    const { t, leader, member } = await running();
    const r = await post('lecA', `/api/topics/${t.id}/milestones`, { name: 'Mốc mới', output: 'PDF', dueAt: at(9).toISOString() });
    expect(r.status).toBe(201);
    expect(await count({ userId: U.lecA.id, type: 'MILESTONE_CREATED' })).toBe(0);
    for (const who of [leader, member]) {
      const rows = await prisma.notification.findMany({ where: { userId: U[who].id, type: 'MILESTONE_CREATED' } });
      expect(rows).toHaveLength(1);
      expect(rows[0].title).toContain('Mốc mới');
    }
    // thông báo của người này không lộ cho người kia qua API
    const mine = await get(leader, '/api/notifications');
    expect(mine.body.items.every((n) => n.link.includes(t.id) || n.link.startsWith('/'))).toBe(true);
    const others = await get(next(), '/api/notifications');
    expect(others.body.total).toBe(0);
  });
});
