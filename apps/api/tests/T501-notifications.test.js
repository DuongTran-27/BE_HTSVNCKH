// T501 (FR13, API_GD45 §8): thông báo trong web – sự kiện §8.3, endpoint §8.1, nhắc hạn §8.4. Unit + DB test thật.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { notificationListQuerySchema, NOTIFICATION_TYPES, NOTIFICATION_TYPE_LABEL } from '@nckh/shared';
import { createApp } from '../src/app.js';
import { createAuthRepo } from '../src/modules/auth/prismaRepo.js';
import { createTopicRepo } from '../src/modules/topics/prismaRepo.js';
import { loadEnv } from '../src/config/env.js';
import { notify, notifyTopic } from '../src/modules/notifications/notify.js';
import { requireCronSecret } from '../src/modules/notifications/routes.js';
import { awaitingSubmission, createReminderService } from '../src/modules/notifications/service.js';
import { fakeHasher, testEnv } from './helpers.js';
import { prisma, S, U, seedBase, mkTopic, mkRound, addMember, mkInvite, mkWaiting, post, get, act, as, app, at, day } from './t214-kit.js';

const SECRET = 'secret-gia-cho-test-'.padEnd(48, 'x'); // bí mật giả, chỉ dùng trong test
const cronApp = () => createApp({ env: { ...testEnv, CRON_SECRET: SECRET }, logger: undefined, authRepo: createAuthRepo(prisma), hasher: fakeHasher, topicRepo: createTopicRepo(prisma) });
const cron = (a, auth = `Bearer ${SECRET}`) => {
  const r = request(a).post('/api/cron/reminders');
  return auth === null ? r : r.set('Authorization', auth);
};
const patch = (who, url, body) => request(app).patch(url).set(as(who)).send(body);
const code = (r) => r.body.error?.code;
const inbox = (who, type) => prisma.notification.findMany({ where: { userId: U[who].id, ...(type && { type }) }, orderBy: { createdAt: 'asc' } });
const recipients = async (type, key) => (await prisma.notification.findMany({ where: { type, ...(key && { dedupeKey: key }) }, include: { user: { select: { code: true } } } })).map((n) => n.user.code).sort();
// "Gọi lại cùng sự kiện không tạo thêm" (§8.2): ghi lại đúng các dòng đã có → 0 dòng mới
const replay = async (type) => {
  const rows = await prisma.notification.findMany({ where: { type } });
  expect(rows.length).toBeGreaterThan(0);
  expect(await notify(prisma, rows.map(({ userId, type: t, title, link, dedupeKey }) => ({ userId, type: t, title, link, dedupeKey })))).toBe(0);
};

// ---------- Unit ----------
describe('notify() – unit (db giả)', () => {
  const fakeDb = (locked = []) => {
    const calls = [];
    return {
      calls,
      user: { findMany: async ({ where }) => where.id.in.filter((id) => !locked.includes(id)).map((id) => ({ id })) },
      notification: { createMany: async (args) => { calls.push(args); return { count: args.data.length }; } },
    };
  };
  it('bỏ người gây sự kiện, tài khoản khóa; skipDuplicates; cắt tiêu đề 300 ký tự', async () => {
    const db = fakeDb(['locked']);
    const n = await notify(db, ['a', 'b', 'locked', 'actor'].map((userId) => ({ userId, type: 'X', title: 't'.repeat(400), link: '/l', dedupeKey: 'X:1' })), 'actor');
    expect(n).toBe(2);
    expect(db.calls[0].skipDuplicates).toBe(true);
    expect(db.calls[0].data.map((d) => d.userId)).toEqual(['a', 'b']);
    expect(db.calls[0].data[0].title).toHaveLength(300);
  });
  it('không có người nhận thì không ghi', async () => {
    const db = fakeDb();
    expect(await notify(db, [{ userId: 'actor', type: 'X', title: 't', link: '/', dedupeKey: 'k' }], 'actor')).toBe(0);
    expect(db.calls).toEqual([]);
  });
});

describe('requireCronSecret – unit', () => {
  const run = (secret, header) => {
    const next = vi.fn();
    try {
      requireCronSecret(secret)({ get: () => header }, {}, next);
    } catch (e) { return { err: e, next }; }
    return { next };
  };
  it('chưa cấu hình → 404; thiếu/sai/khác độ dài → 401, lỗi không chứa bí mật; đúng → next', () => {
    expect(run(undefined, `Bearer ${SECRET}`).err.status).toBe(404);
    for (const h of [undefined, '', SECRET, `Bearer ${SECRET}x`, 'Bearer x', `Basic ${SECRET}`]) {
      const { err, next } = run(SECRET, h);
      expect([err?.status, next.mock.calls.length]).toEqual([401, 0]);
      expect(JSON.stringify({ m: err.message, d: err.details })).not.toContain(SECRET.slice(0, 20));
    }
    expect(run(SECRET, `Bearer ${SECRET}`).next).toHaveBeenCalledOnce();
  });
  it('env: CRON_SECRET tùy chọn; có thì tối thiểu 32 ký tự', () => {
    expect(loadEnv(testEnv).CRON_SECRET).toBeUndefined();
    expect(() => loadEnv({ ...testEnv, CRON_SECRET: 'ngan' })).toThrow(/CRON_SECRET/);
    expect(loadEnv({ ...testEnv, CRON_SECRET: SECRET }).CRON_SECRET).toBe(SECRET);
  });
});

describe('nhắc hạn – unit', () => {
  const T = (h) => new Date(Date.UTC(2026, 10, 3) + h * 3600e3);
  it('awaitingSubmission: chưa nộp → chờ; đã nộp chưa đánh giá → không; nộp lại sau Cần bổ sung → không', () => {
    expect(awaitingSubmission({ documents: [], feedbacks: [] })).toBe(true);
    expect(awaitingSubmission({ documents: [{ uploadedAt: T(1) }], feedbacks: [] })).toBe(false);
    expect(awaitingSubmission({ documents: [{ uploadedAt: T(1) }], feedbacks: [{ createdAt: T(2) }] })).toBe(true);
    expect(awaitingSubmission({ documents: [{ uploadedAt: T(3) }], feedbacks: [{ createdAt: T(2) }] })).toBe(false);
  });
  it('phân loại theo dueReminderDays của đợt; cửa sổ (now, now + X ngày]; khóa có dueAt', async () => {
    const now = T(0);
    const topic = (config = {}) => ({ code: 'C', title: 'Đề', round: { config }, members: [{ userId: 'sv' }], advisings: [{ lecturerId: 'gv' }] });
    const m = (id, dueH, config) => ({ id, name: id, topicId: 't', dueAt: T(dueH), topic: topic(config), documents: [], feedbacks: [] });
    let items = [];
    const repo = {
      findDueMilestones: async () => [m('over', -1), m('now', 0), m('soon', 72), m('far', 73), m('far15', 24 * 10, { dueReminderDays: 15 })],
      findStaleAdvisorRequests: async () => [],
      reminderTx: (fn) => fn({ notify: async (x) => { items = x; return x.length; } }),
    };
    const out = await createReminderService({ repo, now: () => now }).run();
    expect(out).toMatchObject({ ranAt: now.toISOString(), dueSoon: 2, overdue: 2, advisorReminders: 0, notificationsCreated: 6 });
    expect(items.map((i) => `${i.type}:${i.userId}:${i.dedupeKey.split(':')[1]}`).sort()).toEqual([
      'MILESTONE_DUE_SOON:sv:far15', 'MILESTONE_DUE_SOON:sv:soon',
      'MILESTONE_OVERDUE:gv:now', 'MILESTONE_OVERDUE:gv:over', 'MILESTONE_OVERDUE:sv:now', 'MILESTONE_OVERDUE:sv:over',
    ]);
    expect(items.find((i) => i.dedupeKey.includes('soon')).dedupeKey).toBe(`MILESTONE_DUE_SOON:soon:${T(72).toISOString()}`);
  });
});

describe('shared – hằng và schema thông báo', () => {
  it('mỗi type có nhãn tiếng Việt; query unread chỉ nhận true/false', () => {
    expect(NOTIFICATION_TYPES.filter((t) => !NOTIFICATION_TYPE_LABEL[t])).toEqual([]);
    expect(NOTIFICATION_TYPES).toHaveLength(31); // T601: API_GD6 §11b thêm 6 loại (CHANGE_*, ADVISOR_HANDOVER); T604 thêm RESULT_CORRECTED; T606 thêm MILESTONE_REOPENED; T609 thêm SIMILARITY_BYPASS_GRANTED, SIMILARITY_RECHECKED
    expect(notificationListQuerySchema.safeParse({ unread: 'yes' }).success).toBe(false);
    expect(notificationListQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
  });
});

// ---------- DB ----------
let seq = 0;
const nextLeader = () => `s${++seq}`;
const mkRunning = async (round = S.round) => {
  const leader = nextLeader();
  const member = nextLeader();
  const t = await mkTopic(leader, round, { status: 'IN_PROGRESS' });
  await addMember(t, member);
  await prisma.advising.create({ data: { topicId: t.id, lecturerId: U.lecA.id } });
  return { t, leader, member };
};

beforeAll(() => seedBase({ students: 80 }), 60000);
afterAll(() => prisma.$disconnect());

describe('sự kiện GĐ2 – lời mời, đề nghị hướng dẫn, xét duyệt', () => {
  it('INVITATION_RECEIVED / ACCEPTED / DECLINED đúng người nhận; hủy lời mời không báo; gọi lại không trùng', async () => {
    const leader = nextLeader();
    const [a, b, c] = [nextLeader(), nextLeader(), nextLeader()];
    const t = await mkTopic(leader);
    const ra = await post(leader, `/api/topics/${t.id}/invitations`, { inviteeCode: a });
    expect(ra.status).toBe(201);
    const [n] = await inbox(a, 'INVITATION_RECEIVED');
    expect([n.link, n.dedupeKey, n.readAt, n.title]).toEqual(['/loi-moi', `INVITATION_RECEIVED:${ra.body.invitation.id}`, null, `Bạn được mời tham gia nhóm đề tài ${t.code} – ${t.title}`]);
    expect(await inbox(leader)).toEqual([]); // không tự báo cho mình

    expect((await post(a, `/api/invitations/${ra.body.invitation.id}/accept`)).status).toBe(200);
    const [acc] = await inbox(leader, 'INVITATION_ACCEPTED');
    expect([acc.link, acc.title.startsWith(`Tên ${a} đã nhận lời mời`)]).toEqual([`/de-tai/${t.id}/nhom`, true]);

    const ib = await mkInvite(t, b);
    expect((await post(b, `/api/invitations/${ib.id}/decline`)).status).toBe(200);
    expect(await recipients('INVITATION_DECLINED', `INVITATION_DECLINED:${ib.id}`)).toEqual([leader]);
    const ic = await mkInvite(t, c);
    expect((await post(leader, `/api/invitations/${ic.id}/cancel`)).status).toBe(200);
    expect(await inbox(c)).toEqual([]);
    for (const type of ['INVITATION_RECEIVED', 'INVITATION_ACCEPTED', 'INVITATION_DECLINED']) await replay(type);
  });

  it('ADVISOR_REQUESTED → GV; ACCEPTED → thành viên (khóa ADVISOR_RESPONSE); DECLINED; WITHDRAWN chỉ có mã đề tài', async () => {
    const leader = nextLeader();
    const member = nextLeader();
    const t = await mkTopic(leader);
    await addMember(t, member);
    const r = await act(leader, t, { action: 'REQUEST_ADVISOR', lecturerId: U.lecB.id });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const req = await prisma.advisorRequest.findFirst({ where: { topicId: t.id } });
    expect(await recipients('ADVISOR_REQUESTED', `ADVISOR_REQUESTED:${req.id}`)).toEqual(['lecB']);
    expect((await act('lecB', t, { action: 'ACCEPT_ADVISING', version: 1 })).status).toBe(200);
    expect(await recipients('ADVISOR_ACCEPTED', `ADVISOR_RESPONSE:${req.id}`)).toEqual([leader, member].sort());

    const d = await mkWaiting(nextLeader(), 'lecC');
    const dreq = await prisma.advisorRequest.findFirst({ where: { topicId: d.id } });
    expect((await act('lecC', d, { action: 'DECLINE_ADVISING', reason: 'Hết thời gian nhận' })).status).toBe(200);
    const [dn] = await prisma.notification.findMany({ where: { dedupeKey: `ADVISOR_RESPONSE:${dreq.id}` } });
    expect([dn.type, dn.link, dn.title.includes('Hết thời gian')]).toEqual(['ADVISOR_DECLINED', `/de-tai/${d.id}`, false]);

    const wl = nextLeader();
    const w = await mkWaiting(wl, 'lecC');
    const wreq = await prisma.advisorRequest.findFirst({ where: { topicId: w.id } });
    expect((await act(wl, w, { action: 'WITHDRAW_ADVISOR_REQUEST' })).status).toBe(200);
    const [wn] = await prisma.notification.findMany({ where: { type: 'ADVISOR_REQUEST_WITHDRAWN', dedupeKey: `ADVISOR_REQUEST_WITHDRAWN:${wreq.id}` }, include: { user: true } });
    expect([wn.user.code, wn.link, wn.title.includes(w.code), wn.title.includes(w.title)]).toEqual(['lecC', '/de-nghi-huong-dan', true, false]);
    for (const type of ['ADVISOR_REQUESTED', 'ADVISOR_ACCEPTED', 'ADVISOR_DECLINED', 'ADVISOR_REQUEST_WITHDRAWN']) await replay(type);
  });

  it('REVIEW_DECIDED → thành viên + GVHD hiện hành, không báo cán bộ quyết định; tài khoản bị khóa không nhận', async () => {
    const leader = nextLeader();
    const member = nextLeader();
    const t = await mkTopic(leader, S.round, { status: 'UNDER_REVIEW' });
    await addMember(t, member);
    await prisma.user.update({ where: { id: U[member].id }, data: { isLocked: true } });
    await prisma.advising.create({ data: { topicId: t.id, lecturerId: U.lecA.id } });
    const s = await prisma.submission.create({ data: { topicId: t.id, seq: 1, createdById: U[leader].id, payload: { title: t.title } } });
    const r = await act('staff1', t, { action: 'REQUEST_REVISION', submissionId: s.id, reason: 'Bổ sung mục tiêu cụ thể' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(await recipients('REVIEW_DECIDED', `REVIEW_DECIDED:${s.id}`)).toEqual([leader, 'lecA'].sort());
    const [n] = await inbox(leader, 'REVIEW_DECIDED');
    expect([n.link, n.title.endsWith('cần chỉnh sửa'), n.title.includes('Bổ sung mục tiêu')]).toEqual([`/de-tai/${t.id}`, true, false]);
    await replay('REVIEW_DECIDED');
  });
});

describe('sự kiện GĐ4 – mốc, tài liệu, nhận xét, kết quả, đóng đề tài', () => {
  it('MILESTONE_CREATED: GVHD tạo → thành viên; cán bộ tạo → thành viên + GVHD', async () => {
    const { t, leader, member } = await mkRunning();
    const m1 = await post('lecA', `/api/topics/${t.id}/milestones`, { name: 'Đề cương chi tiết', output: 'PDF', dueAt: at(5).toISOString() });
    expect(m1.status).toBe(201);
    expect(await recipients('MILESTONE_CREATED', `MILESTONE_CREATED:${m1.body.milestone.id}`)).toEqual([leader, member].sort());
    const m2 = await post('staff1', `/api/topics/${t.id}/milestones`, { name: 'Giữa kỳ', output: 'PDF', dueAt: at(9).toISOString() });
    expect(await recipients('MILESTONE_CREATED', `MILESTONE_CREATED:${m2.body.milestone.id}`)).toEqual([leader, member, 'lecA'].sort());
    const [n] = await inbox(leader, 'MILESTONE_CREATED');
    expect(n.link).toBe(`/de-tai/${t.id}/moc`);
    await replay('MILESTONE_CREATED');
  });

  it('MILESTONE_REQUIRED_REMOVED → cán bộ khoa của đề tài (không khoa khác), khóa theo version; sửa tên không báo', async () => {
    const { t } = await mkRunning();
    const m = await prisma.milestone.create({ data: { topicId: t.id, order: 1, name: 'Mốc A', output: 'x', dueAt: at(5), createdById: U.lecA.id } });
    expect((await patch('lecA', `/api/milestones/${m.id}`, { version: 0, name: 'Mốc A1' })).status).toBe(200);
    expect(await prisma.notification.count({ where: { type: 'MILESTONE_REQUIRED_REMOVED' } })).toBe(0);
    expect((await patch('lecA', `/api/milestones/${m.id}`, { version: 1, required: false })).status).toBe(200);
    expect(await recipients('MILESTONE_REQUIRED_REMOVED', `MILESTONE_REQUIRED_REMOVED:${m.id}:v2`)).toEqual(['staff1']);
    expect((await patch('lecA', `/api/milestones/${m.id}`, { version: 2, required: true })).status).toBe(200);
    expect((await patch('lecA', `/api/milestones/${m.id}`, { version: 3, required: false })).status).toBe(200);
    expect(await recipients('MILESTONE_REQUIRED_REMOVED')).toEqual(['staff1', 'staff1']); // lần bỏ thứ hai là sự kiện mới (v4)
    await replay('MILESTONE_REQUIRED_REMOVED');
  });

  it('MILESTONE_DUE_CHANGED → thành viên + GVHD (trừ người đổi)', async () => {
    const { t, leader, member } = await mkRunning();
    const m = await prisma.milestone.create({ data: { topicId: t.id, order: 1, name: 'Mốc B', output: 'x', dueAt: at(5), createdById: U.lecA.id } });
    const r = await post('staff1', `/api/milestones/${m.id}/due-changes`, { version: 0, newDueAt: at(10).toISOString(), reason: 'Gia hạn do nghỉ lễ' });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(await recipients('MILESTONE_DUE_CHANGED', `MILESTONE_DUE_CHANGED:${r.body.dueChange.id}`)).toEqual([leader, member, 'lecA'].sort());
    await replay('MILESTONE_DUE_CHANGED');
  });

  it('DOCUMENT_SUBMITTED → GVHD khi nộp cho mốc; đề cương không báo', async () => {
    const { t, leader } = await mkRunning();
    const m = await prisma.milestone.create({ data: { topicId: t.id, order: 1, name: 'Mốc C', output: 'x', dueAt: at(5), createdById: U.lecA.id } });
    const r = await post(leader, `/api/topics/${t.id}/documents/links`, { stage: 'MIDTERM', milestoneId: m.id, title: 'Mã nguồn', url: 'https://github.com/x/y' });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(await recipients('DOCUMENT_SUBMITTED', `DOCUMENT_SUBMITTED:${r.body.document.id}`)).toEqual(['lecA']);
    const [n] = await inbox('lecA', 'DOCUMENT_SUBMITTED');
    expect(n.link).toBe(`/de-tai/${t.id}/tai-lieu`);
    const dl = nextLeader();
    const draft = await mkTopic(dl);
    const before = await prisma.notification.count();
    const p = await post(dl, `/api/topics/${draft.id}/documents/links`, { stage: 'PROPOSAL', title: 'Đề cương', url: 'https://x.vn/a' });
    expect(p.status).toBe(201);
    expect(await prisma.notification.count()).toBe(before);
    await replay('DOCUMENT_SUBMITTED');
  });

  it('FEEDBACK_CREATED → thành viên (bản nộp → /tai-lieu, tiến độ → /tien-do); RESULT_ENTERED → thành viên', async () => {
    const { t, leader, member } = await mkRunning();
    const m = await prisma.milestone.create({ data: { topicId: t.id, order: 1, name: 'Mốc D', output: 'x', dueAt: at(5), createdById: U.lecA.id } });
    const d = await prisma.document.create({ data: { topicId: t.id, milestoneId: m.id, stage: 'MIDTERM', kind: 'LINK', externalUrl: 'https://x.vn', fileName: 'Báo cáo giữa kỳ', version: 1, status: 'READY', uploadedById: U[leader].id } });
    const f = await post('lecA', `/api/documents/${d.id}/feedbacks`, { content: 'Nội dung nhận xét riêng tư' });
    expect(f.status, JSON.stringify(f.body)).toBe(201);
    expect(await recipients('FEEDBACK_CREATED', `FEEDBACK_CREATED:${f.body.feedback.id}`)).toEqual([leader, member].sort());
    const [n] = await inbox(member, 'FEEDBACK_CREATED');
    expect([n.link, n.title.includes('"Báo cáo giữa kỳ"'), n.title.includes('riêng tư')]).toEqual([`/de-tai/${t.id}/tai-lieu`, true, false]);
    const p = await prisma.progressUpdate.create({ data: { topicId: t.id, authorId: U[leader].id, done: 'a', issues: '', nextPlan: 'b', percent: 40 } });
    const fp = await post('lecA', `/api/progress/${p.id}/feedbacks`, { content: 'Tốt' });
    expect(fp.status).toBe(201);
    const [pn] = await prisma.notification.findMany({ where: { dedupeKey: `FEEDBACK_CREATED:${fp.body.feedback.id}`, userId: U[leader].id } });
    expect(pn.link).toBe(`/de-tai/${t.id}/tien-do`);
    const r = await post('lecA', `/api/topics/${t.id}/results`, { result: 'GOOD', summary: 'Nhóm hoàn thành tốt mục tiêu đề ra.', expectedVersion: 0 });
    expect(r.status).toBe(201);
    expect(await recipients('RESULT_ENTERED', `RESULT_ENTERED:${r.body.result.id}`)).toEqual([leader, member].sort());
    for (const type of ['FEEDBACK_CREATED', 'RESULT_ENTERED']) await replay(type);
  });

  it('CLOSE_REQUESTED → cán bộ khoa; CLOSE_RETURNED → GVHD + thành viên; gửi lại là sự kiện mới (version); TOPIC_CLOSED', async () => {
    const { t, leader, member } = await mkRunning();
    await prisma.milestone.create({ data: { topicId: t.id, order: 1, name: 'Mốc E', output: 'x', dueAt: at(5), evaluation: 'PASSED', createdById: U.lecA.id } });
    await prisma.resultVersion.create({ data: { topicId: t.id, version: 1, result: 'GOOD', summary: 'Nhóm hoàn thành tốt mục tiêu.', createdById: U.lecA.id } });
    expect((await act('lecA', t, { action: 'REQUEST_CLOSE', version: 0 })).status).toBe(200);
    expect(await recipients('CLOSE_REQUESTED', `CLOSE_REQUESTED:${t.id}:v1`)).toEqual(['staff1']);
    expect((await act('staff1', t, { action: 'RETURN_TO_ADVISOR', reason: 'Thiếu minh chứng', version: 1 })).status).toBe(200);
    expect(await recipients('CLOSE_RETURNED', `CLOSE_RETURNED:${t.id}:v2`)).toEqual([leader, member, 'lecA'].sort());
    expect((await act('lecA', t, { action: 'REQUEST_CLOSE', version: 2 })).status).toBe(200);
    expect(await recipients('CLOSE_REQUESTED', `CLOSE_REQUESTED:${t.id}:v3`)).toEqual(['staff1']);
    expect((await act('staff1', t, { action: 'CONFIRM_CLOSE', version: 3 })).status).toBe(200);
    expect(await recipients('TOPIC_CLOSED', `TOPIC_CLOSED:${t.id}`)).toEqual([leader, member, 'lecA'].sort());
    for (const type of ['CLOSE_REQUESTED', 'CLOSE_RETURNED', 'TOPIC_CLOSED']) await replay(type);
  });

  it('thao tác lỗi (rollback) không để lại thông báo', async () => {
    const { t } = await mkRunning();
    const before = await prisma.notification.count();
    expect(code(await act('lecA', t, { action: 'REQUEST_CLOSE', version: 0 }))).toBe('NO_REQUIRED_MILESTONE');
    await expect(prisma.$transaction(async (tx) => {
      await notifyTopic(tx, { topicId: t.id, to: ['members'], type: 'MILESTONE_CREATED', key: 'ROLLBACK:1', link: '/', title: () => 'x' });
      throw new Error('lỗi giữa chừng');
    })).rejects.toThrow('lỗi giữa chừng');
    expect(await prisma.notification.count()).toBe(before);
  });
});

describe('endpoint /api/notifications – chỉ của chính mình', () => {
  let me;
  let other;
  let rows;
  beforeAll(async () => {
    me = nextLeader();
    other = nextLeader();
    rows = [];
    for (let i = 0; i < 3; i++) {
      rows.push(await prisma.notification.create({ data: { userId: U[me].id, type: 'MILESTONE_CREATED', title: `TB ${i}`, link: '/de-tai/x', dedupeKey: `T501:${me}:${i}`, createdAt: new Date(Date.now() - (3 - i) * 1000) } }));
    }
    rows.push(await prisma.notification.create({ data: { userId: U[other].id, type: 'MILESTONE_CREATED', title: 'Của người khác', link: '/', dedupeKey: `T501:${other}` } }));
  });

  it('GET danh sách mới nhất trước, phân trang, lọc unread, unreadCount; không thấy của người khác', async () => {
    const r = await get(me, '/api/notifications?pageSize=2');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ page: 1, pageSize: 2, total: 3, unreadCount: 3 });
    expect(r.body.items.map((n) => n.title)).toEqual(['TB 2', 'TB 1']);
    expect(Object.keys(r.body.items[0]).sort()).toEqual(['createdAt', 'id', 'link', 'readAt', 'title', 'type']);
    expect((await get(me, '/api/notifications?unread=yes')).status).toBe(400);
    expect((await get(me, '/api/notifications/unread-count')).body).toEqual({ count: 3 });
  });

  it('POST :id/read → 204, idempotent; id của người khác hoặc không tồn tại → 404 và không bị đánh dấu', async () => {
    expect((await post(me, `/api/notifications/${rows[0].id}/read`)).status).toBe(204);
    expect((await post(me, `/api/notifications/${rows[0].id}/read`)).status).toBe(204);
    expect((await prisma.notification.findUnique({ where: { id: rows[0].id } })).readAt).not.toBeNull();
    const o = await post(me, `/api/notifications/${rows[3].id}/read`);
    expect([o.status, code(o)]).toEqual([404, 'NOT_FOUND']);
    expect((await prisma.notification.findUnique({ where: { id: rows[3].id } })).readAt).toBeNull();
    expect((await post(me, '/api/notifications/khong-co/read')).status).toBe(404);
    expect((await get(me, '/api/notifications?unread=true')).body.total).toBe(2);
    expect((await get(me, '/api/notifications?unread=false')).body.items.map((n) => n.id)).toEqual([rows[0].id]);
  });

  it('POST read-all chỉ đánh dấu của mình; ADMIN 200 rỗng; chưa đăng nhập 401', async () => {
    expect((await post(me, '/api/notifications/read-all')).status).toBe(204);
    expect((await get(me, '/api/notifications/unread-count')).body.count).toBe(0);
    expect((await get(other, '/api/notifications/unread-count')).body.count).toBe(1);
    const a = await get('admin', '/api/notifications');
    expect([a.status, a.body.items, a.body.unreadCount]).toEqual([200, [], 0]);
    expect((await request(app).get('/api/notifications')).status).toBe(401);
  });
});

describe('POST /api/cron/reminders (§8.4)', () => {
  it('chưa cấu hình CRON_SECRET → 404; thiếu/sai bí mật → 401 không lộ bí mật; đúng → 200 no-store', async () => {
    expect((await request(app).post('/api/cron/reminders').set('Authorization', `Bearer ${SECRET}`)).status).toBe(404);
    const a = cronApp();
    for (const h of [null, 'Bearer sai', `Bearer ${SECRET.slice(0, -1)}`]) {
      const r = await cron(a, h);
      expect([r.status, code(r)]).toEqual([401, 'UNAUTHORIZED']);
      expect(JSON.stringify(r.body)).not.toContain(SECRET.slice(0, 20));
    }
    const ok = await cron(a);
    expect([ok.status, ok.headers['cache-control']]).toEqual([200, 'no-store']);
    expect(Object.keys(ok.body).sort()).toEqual(['advisorReminders', 'dueSoon', 'notificationsCreated', 'overdue', 'ranAt']);
  });

  it('mốc sắp hạn/quá hạn đúng người nhận; bỏ mốc đã nộp, đã Đạt, ngoài cửa sổ, đề tài không IN_PROGRESS; chạy lại không trùng; đổi hạn nhắc lại', async () => {
    const a = cronApp();
    await cron(a); // dọn phần còn lại từ các test trước để đếm chính xác
    const { t, leader, member } = await mkRunning();
    const ms = async (name, dueAt, o = {}) => prisma.milestone.create({ data: { topicId: t.id, order: ++seq, name, output: 'x', dueAt, createdById: U.lecA.id, ...o } });
    const soon = await ms('Sắp hạn', at(2));
    const over = await ms('Quá hạn', at(-1));
    const far = await ms('Còn xa', at(10));
    const passed = await ms('Đã đạt', at(1), { evaluation: 'PASSED' });
    const submitted = await ms('Đã nộp', at(1));
    await prisma.document.create({ data: { topicId: t.id, milestoneId: submitted.id, stage: 'MIDTERM', kind: 'LINK', externalUrl: 'https://x.vn', fileName: 'L', version: 1, status: 'READY', uploadedById: U[leader].id, uploadedAt: new Date(Date.now() - 2 * day) } });
    const redo = await ms('Cần nộp lại', at(-2), { evaluation: 'NEEDS_WORK' });
    const rd = await prisma.document.create({ data: { topicId: t.id, milestoneId: redo.id, stage: 'MIDTERM', kind: 'LINK', externalUrl: 'https://x.vn', fileName: 'L', version: 1, status: 'READY', uploadedById: U[leader].id, uploadedAt: new Date(Date.now() - 2 * day) } });
    await prisma.feedback.create({ data: { topicId: t.id, documentId: rd.id, milestoneId: redo.id, lecturerId: U.lecA.id, content: 'Bổ sung', evaluation: 'NEEDS_WORK', createdAt: new Date(Date.now() - day) } });
    const wide = await mkRound(S.F1.id, 'Đợt nhắc 15 ngày', { dueReminderDays: 15 });
    const t2 = await mkRunning(wide);
    const wideMs = await prisma.milestone.create({ data: { topicId: t2.t.id, order: 1, name: 'Hạn 10 ngày', output: 'x', dueAt: at(10), createdById: U.lecA.id } });
    const idle = await mkTopic(nextLeader(), S.round, { status: 'WAITING_CLOSE' });
    await prisma.milestone.create({ data: { topicId: idle.id, order: 1, name: 'Đề tài chờ đóng', output: 'x', dueAt: at(-1), createdById: U.lecA.id } });

    const r = await cron(a);
    expect(r.body, JSON.stringify(r.body)).toMatchObject({ dueSoon: 2, overdue: 2, advisorReminders: 0, notificationsCreated: 2 + 3 + 3 + 2 });
    const key = (type, m) => `${type}:${m.id}:${m.dueAt.toISOString()}`;
    expect(await recipients('MILESTONE_DUE_SOON', key('MILESTONE_DUE_SOON', soon))).toEqual([leader, member].sort());
    expect(await recipients('MILESTONE_OVERDUE', key('MILESTONE_OVERDUE', over))).toEqual([leader, member, 'lecA'].sort());
    expect(await recipients('MILESTONE_OVERDUE', key('MILESTONE_OVERDUE', redo))).toEqual([leader, member, 'lecA'].sort());
    expect(await recipients('MILESTONE_DUE_SOON', key('MILESTONE_DUE_SOON', wideMs))).toEqual([t2.leader, t2.member].sort());
    for (const m of [far, passed, submitted]) expect(await prisma.notification.count({ where: { dedupeKey: { contains: m.id } } })).toBe(0);
    const [n] = await inbox(leader, 'MILESTONE_DUE_SOON');
    expect([n.link, n.title.startsWith('Mốc "Sắp hạn" sắp đến hạn')]).toEqual([`/de-tai/${t.id}/moc`, true]);

    const again = await cron(a);
    expect(again.body.notificationsCreated).toBe(0); // idempotent nhờ dedupeKey
    const newDue = at(1);
    await prisma.milestone.update({ where: { id: soon.id }, data: { dueAt: newDue } });
    expect((await cron(a)).body.notificationsCreated).toBe(2);
    expect(await recipients('MILESTONE_DUE_SOON', `MILESTONE_DUE_SOON:${soon.id}:${newDue.toISOString()}`)).toEqual([leader, member].sort());
  });

  it('đề nghị hướng dẫn quá X ngày: nhắc GV + cán bộ khoa đúng một lần, đặt remindedAt; chưa đủ ngày thì không; hai lần chạy song song chỉ nhắc một lần', async () => {
    const a = cronApp();
    await cron(a);
    const old = await mkWaiting(nextLeader(), 'lecB');
    const fresh = await mkWaiting(nextLeader(), 'lecB');
    await prisma.advisorRequest.updateMany({ where: { topicId: old.id }, data: { createdAt: new Date(Date.now() - 4 * day) } });
    await prisma.advisorRequest.updateMany({ where: { topicId: fresh.id }, data: { createdAt: new Date(Date.now() - 2 * day) } });
    const [r1, r2] = await Promise.all([cron(a), cron(a)]);
    expect(r1.body.advisorReminders + r2.body.advisorReminders).toBe(1);
    const req = await prisma.advisorRequest.findFirst({ where: { topicId: old.id } });
    expect(req.remindedAt).not.toBeNull();
    expect(await recipients('ADVISOR_REQUEST_REMINDER', `ADVISOR_REQUEST_REMINDER:${req.id}`)).toEqual(['lecB', 'staff1']);
    const [n] = await inbox('lecB', 'ADVISOR_REQUEST_REMINDER');
    expect([n.link, n.title.endsWith('chưa được phản hồi sau 4 ngày')]).toEqual(['/de-nghi-huong-dan', true]);
    expect((await prisma.advisorRequest.findFirst({ where: { topicId: fresh.id } })).remindedAt).toBeNull();
    expect((await cron(a)).body.advisorReminders).toBe(0);
  });

  it('giới hạn 10 lần/15 phút theo IP → 429', async () => {
    const a = cronApp();
    for (let i = 0; i < 10; i++) await cron(a, 'Bearer sai');
    expect((await cron(a)).status).toBe(429);
  });
});

