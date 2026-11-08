// T602 (FR20, API_GD6 §4): đề nghị và quyết định hủy qua khung ChangeRequest + MINOR m2–m3 reviews/T601-bao-mat-v1.md. DB test thật.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { prisma, S, U, tok, seedBase, mkTopic, addMember, post, get, act, at, as } from './t214-kit.js';
import { createApp } from '../src/app.js';
import { createAuthRepo } from '../src/modules/auth/prismaRepo.js';
import { createTopicRepo } from '../src/modules/topics/prismaRepo.js';
import { createSimilarityRepo } from '../src/modules/similarity/prismaRepo.js';
import { createMemoryStorage } from '../src/lib/storage.js';
import { signAccessToken } from '../src/lib/tokens.js';
import { fakeHasher, testEnv } from './helpers.js';

const code = (r) => r.body.error?.code;
const REASON = 'Nhóm không thể tiếp tục đề tài';
const DECISION = 'Đồng ý hủy theo đề nghị';

// Người dùng mới mỗi test: limiter 30/15 phút/người của §2.3 không bị dồn
let n = 0;
const mkUser = async (role, extra = {}) => {
  const key = `${role.toLowerCase()}-t602-${++n}`;
  U[key] = await prisma.user.create({ data: { code: key, email: `${key}@t.vn`, fullName: `Tên ${key}`, passwordHash: 'x', role, mustChangePassword: false, facultyId: S.F1.id, ...extra } });
  tok[key] = signAccessToken(U[key], { secret: testEnv.JWT_ACCESS_SECRET, ttlSeconds: 600 });
  if (role === 'STAFF') await prisma.staffScope.create({ data: { userId: U[key].id, facultyId: S.F1.id } });
  return key;
};
let seq = 0;
// Đề tài IN_PROGRESS có GVHD riêng; closable: đủ điều kiện REQUEST_CLOSE (mốc Đạt + kết quả của GVHD hiện hành)
const mkRunning = async ({ closable = false } = {}) => {
  const leader = `s${++seq}`;
  const lec = await mkUser('LECTURER');
  const t = await mkTopic(leader, S.round, { status: 'IN_PROGRESS' });
  await prisma.advising.create({ data: { topicId: t.id, lecturerId: U[lec].id } });
  if (closable) {
    await prisma.milestone.create({ data: { topicId: t.id, order: 1, name: 'Mốc 1', output: 'PDF', dueAt: at(1), evaluation: 'PASSED', createdById: U[lec].id } });
    await prisma.resultVersion.create({ data: { topicId: t.id, version: 1, result: 'GOOD', summary: 'Nhóm hoàn thành tốt mục tiêu.', createdById: U[lec].id } });
  }
  return { t, leader, lec };
};
const create = (who, t, o = {}) => post(who, `/api/topics/${t.id}/change-requests`, { type: 'CANCEL', reason: REASON, ...o });
const approve = (who, id, body = { reason: DECISION }) => post(who, `/api/change-requests/${id}/approve`, body);
const decline = (who, id) => post(who, `/api/change-requests/${id}/decline`, { reason: 'Đề tài vẫn tiếp tục được' });
const topicStatus = async (t) => (await prisma.topic.findUnique({ where: { id: t.id } })).status;
const crStatus = async (id) => (await prisma.changeRequest.findUnique({ where: { id } })).status;
const statusTotal = async (who, status) => {
  const r = await get(who, `/api/stats?groupBy=status${status ? `&status=${status}` : ''}`);
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body.total;
};

beforeAll(() => seedBase({ students: 60 }), 60000);
afterAll(() => prisma.$disconnect());

describe('FR20 – tạo đề nghị hủy (§4.1, ca 1)', () => {
  it('TC-FR20-01 trưởng nhóm tạo 201, GVHD tạo 201 (sau khi đề nghị trước kết thúc); payload theo §2.1; thông báo + AuditLog', async () => {
    const { t, leader, lec } = await mkRunning();
    const staff = await mkUser('STAFF');
    const a = await create(leader, t);
    expect(a.status, JSON.stringify(a.body)).toBe(201);
    expect(a.body.changeRequest).toMatchObject({
      type: 'CANCEL', status: 'PENDING', stage: 'STAFF', reason: REASON, target: null,
      payload: { topicStatus: 'IN_PROGRESS', requesterRole: 'STUDENT' }, createdBy: { id: U[leader].id, role: 'STUDENT' }, availableActions: ['WITHDRAW'],
    });
    const id = a.body.changeRequest.id;
    expect(await prisma.auditLog.count({ where: { action: 'CHANGE_REQUEST_CREATE', entityId: id } })).toBe(1);
    const notes = await prisma.notification.findMany({ where: { dedupeKey: `CHANGE_REQUESTED:${id}` }, select: { userId: true } });
    expect(notes.map((x) => x.userId)).toEqual(expect.arrayContaining([U[lec].id, U[staff].id])); // GVHD, cán bộ khoa; không gửi người tạo
    expect(notes.map((x) => x.userId)).not.toContain(U[leader].id);
    expect(await prisma.notification.count({ where: { dedupeKey: `CHANGE_TARGET_INVITED:${id}` } })).toBe(0); // CANCEL không có người đích
    // Trưởng nhóm, GVHD thấy quyền requestCancel; cán bộ không (G38)
    expect((await get(leader, `/api/topics/${t.id}`)).body.topic.permissions.requestCancel).toBe(true);
    expect((await get(lec, `/api/topics/${t.id}`)).body.topic.permissions.requestCancel).toBe(true);
    expect((await get(staff, `/api/topics/${t.id}`)).body.topic.permissions.requestCancel).toBe(false);
    // Trùng loại đang chờ → 409; GVHD tạo được sau khi đề nghị cũ bị rút
    expect(code(await create(lec, t))).toBe('CHANGE_REQUEST_PENDING');
    expect((await post(leader, `/api/change-requests/${id}/withdraw`)).status).toBe(200);
    const b = await create(lec, t);
    expect(b.status, JSON.stringify(b.body)).toBe(201);
    expect(b.body.changeRequest.payload).toEqual({ topicStatus: 'IN_PROGRESS', requesterRole: 'LECTURER' });
  });

  it('thành viên thường, GV khác, SV ngoài, cán bộ (kể cả trong khoa), cán bộ khoa khác, ADMIN → 403; thiếu lý do 400', async () => {
    const { t, leader } = await mkRunning();
    await addMember(t, 's59');
    const staff = await mkUser('STAFF');
    for (const who of ['s59', 'lecB', 's58', staff, 'staff2', 'admin']) expect((await create(who, t)).status, who).toBe(403);
    for (const body of [{ reason: 'abc' }, { reason: undefined }, { reason: REASON, newLecturerId: U.lecB.id }]) {
      expect((await create(leader, t, body)).status, JSON.stringify(body)).toBe(400);
    }
    expect(await prisma.changeRequest.count({ where: { topicId: t.id } })).toBe(0);
  });

  it('trạng thái khác IN_PROGRESS → 409 INVALID_TRANSITION', async () => {
    for (const status of ['DRAFT', 'HAS_ADVISOR', 'UNDER_REVIEW', 'WAITING_CLOSE', 'CLOSED', 'CANCELLED']) {
      const leader = `s${++seq}`;
      const t = await mkTopic(leader, S.round, { status });
      expect(code(await create(leader, t)), status).toBe('INVALID_TRANSITION');
    }
  });
});

describe('FR20 – cán bộ quyết định (§4.2, ca 2, 5)', () => {
  it('TC-FR20-02 duyệt có lý do: CANCELLED, StatusHistory có lý do, ACCEPTED, AuditLog, thông báo "đã bị hủy"; dữ liệu không bị xóa', async () => {
    const { t, leader, lec } = await mkRunning();
    await addMember(t, 's57');
    const staff = await mkUser('STAFF');
    const m = await prisma.milestone.create({ data: { topicId: t.id, order: 1, name: 'Mốc', output: 'PDF', dueAt: at(3), createdById: U[lec].id } });
    const id = (await create(lec, t)).body.changeRequest.id;
    const before = await prisma.topic.findUnique({ where: { id: t.id } });

    // Thiếu lý do → 400 REASON_REQUIRED, rollback: yêu cầu vẫn PENDING, đề tài không đổi
    const r0 = await approve(staff, id, {});
    expect([r0.status, code(r0)]).toEqual([400, 'REASON_REQUIRED']);
    expect([await crStatus(id), await topicStatus(t)]).toEqual(['PENDING', 'IN_PROGRESS']);
    expect(await prisma.statusHistory.count({ where: { topicId: t.id } })).toBe(0);

    const r = await approve(staff, id);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.changeRequest).toMatchObject({ status: 'ACCEPTED', stage: null, decisionReason: DECISION, decidedBy: { id: U[staff].id }, availableActions: [] });
    expect(r.body.topic).toMatchObject({ id: t.id, status: 'CANCELLED', version: before.version + 1 });
    const h = await prisma.statusHistory.findMany({ where: { topicId: t.id } });
    expect(h).toMatchObject([{ from: 'IN_PROGRESS', to: 'CANCELLED', action: 'CANCEL', reason: DECISION, actorId: U[staff].id }]);
    expect(await prisma.auditLog.count({ where: { action: 'CHANGE_REQUEST_APPROVE', entityId: id } })).toBe(1);
    // FR20 "không bị xóa": đề tài, thành viên, Advising, mốc còn nguyên
    expect(await prisma.topicMember.count({ where: { topicId: t.id, leftAt: null } })).toBe(2);
    expect(await prisma.advising.count({ where: { topicId: t.id, endAt: null, lecturerId: U[lec].id } })).toBe(1);
    expect(await prisma.milestone.findUnique({ where: { id: m.id } })).not.toBeNull();
    // Thông báo: thành viên, GVHD, người tạo (là GVHD – người gây sự kiện là cán bộ nên vẫn nhận)
    const notes = await prisma.notification.findMany({ where: { dedupeKey: `CHANGE_DECIDED:${id}` }, select: { userId: true, title: true } });
    expect(notes.map((x) => x.userId).sort()).toEqual([U[leader].id, U.s57.id, U[lec].id].sort());
    expect(notes.every((x) => x.title.includes('đã bị hủy') && !x.title.includes(DECISION))).toBe(true);
    // Sau hủy: ghi GĐ4 bị chặn, duyệt lại 409, không tạo đề nghị mới
    expect(code(await post(lec, `/api/topics/${t.id}/milestones`, { name: 'Mốc 2', output: 'PDF', dueAt: at(3).toISOString() }))).toBe('TOPIC_NOT_IN_PROGRESS');
    expect(code(await approve(staff, id))).toBe('CHANGE_REQUEST_CLOSED');
    expect(code(await create(leader, t))).toBe('INVALID_TRANSITION');
  });

  it('duyệt/từ chối sai người → 403; cán bộ từ chối có lý do → DECLINED, đề tài giữ nguyên', async () => {
    const { t, leader, lec } = await mkRunning();
    const staff = await mkUser('STAFF');
    const id = (await create(leader, t)).body.changeRequest.id;
    for (const who of [leader, lec, 'lecB', 'staff2', 'admin']) expect((await approve(who, id)).status, who).toBe(403);
    for (const who of [leader, lec, 'staff2']) expect((await decline(who, id)).status, who).toBe(403);
    expect((await get(staff, `/api/change-requests/${id}`)).body.changeRequest.availableActions).toEqual(['APPROVE', 'DECLINE']);
    const d = await decline(staff, id);
    expect([d.status, d.body.changeRequest.status]).toEqual([200, 'DECLINED']);
    expect(await topicStatus(t)).toBe('IN_PROGRESS');
    expect(await prisma.statusHistory.count({ where: { topicId: t.id } })).toBe(0);
  });

  it('ca 5: /actions với CANCEL vẫn 400 (chỉ một đường hủy)', async () => {
    const { t } = await mkRunning();
    const staff = await mkUser('STAFF');
    expect((await act(staff, t, { action: 'CANCEL', reason: DECISION })).status).toBe(400);
    expect(await topicStatus(t)).toBe('IN_PROGRESS');
  });
});

describe('FR20 – đề nghị không tự đóng, đồng thời (ca 3, 4)', () => {
  it('TC-FR20-03 ca 3: đề tài sang WAITING_CLOSE khi đề nghị đang chờ → vẫn PENDING; duyệt 409 INVALID_TRANSITION; cán bộ từ chối được', async () => {
    const { t, leader, lec } = await mkRunning({ closable: true });
    const staff = await mkUser('STAFF');
    const id = (await create(leader, t)).body.changeRequest.id;
    expect((await act(lec, t, { action: 'REQUEST_CLOSE', version: 0 })).status).toBe(200);
    expect(await crStatus(id)).toBe('PENDING');
    const r = await approve(staff, id);
    expect([r.status, code(r)]).toEqual([409, 'INVALID_TRANSITION']);
    expect([await crStatus(id), await topicStatus(t)]).toEqual(['PENDING', 'WAITING_CLOSE']);
    expect((await decline(staff, id)).status).toBe(200);
    expect(await crStatus(id)).toBe('DECLINED');
  });

  it('ca 4: duyệt hủy ‖ REQUEST_CLOSE – đúng một thành công, không 500, lịch sử khớp trạng thái cuối', async () => {
    for (let i = 0; i < 4; i++) {
      const { t, leader, lec } = await mkRunning({ closable: true });
      const staff = await mkUser('STAFF');
      const id = (await create(leader, t)).body.changeRequest.id;
      const [a, c] = await Promise.all([approve(staff, id), act(lec, t, { action: 'REQUEST_CLOSE', version: 0 })]);
      expect([a.status, c.status].filter((s) => s === 200), JSON.stringify([a.body, c.body])).toHaveLength(1);
      expect([a.status, c.status].every((s) => s === 200 || s === 409), JSON.stringify([a.body, c.body])).toBe(true);
      const final = await topicStatus(t);
      expect(final).toBe(a.status === 200 ? 'CANCELLED' : 'WAITING_CLOSE');
      expect(await crStatus(id)).toBe(a.status === 200 ? 'ACCEPTED' : 'PENDING');
      const h = await prisma.statusHistory.findMany({ where: { topicId: t.id } });
      expect(h.map((x) => x.to)).toEqual([final]);
    }
  });
});

describe('FR20 – ảnh hưởng thống kê và kho FR06 (ca 7)', () => {
  it('TC-FR20-04 đề tài hủy vẫn có trong /api/stats chiều status; rời kho so FR06', async () => {
    const { t, leader } = await mkRunning();
    const staff = await mkUser('STAFF');
    const sim = createSimilarityRepo(prisma);
    const probe = { id: 'probe', title: t.title, roundId: S.round.id };
    expect((await sim.loadCorpus(probe)).map((x) => x.id)).toContain(t.id);
    const total = await statusTotal(staff);
    const cancelled = await statusTotal(staff, 'CANCELLED');
    expect((await approve(staff, (await create(leader, t)).body.changeRequest.id)).status).toBe(200);
    expect(await statusTotal(staff)).toBe(total);
    expect(await statusTotal(staff, 'CANCELLED')).toBe(cancelled + 1);
    expect((await sim.loadCorpus(probe)).map((x) => x.id)).not.toContain(t.id);
  });
});

describe('MINOR reviews/T601-bao-mat-v1.md', () => {
  it('m2: GV mới chuyển khoa giữa lúc tạo và lúc duyệt → 409 STALE_CHANGE_REQUEST, Advising không đổi', async () => {
    const { t, leader, lec } = await mkRunning();
    const lecNew = await mkUser('LECTURER');
    const staff = await mkUser('STAFF');
    const c = await post(leader, `/api/topics/${t.id}/change-requests`, { type: 'ADVISOR_CHANGE', reason: 'GVHD đi công tác dài hạn', newLecturerId: U[lecNew].id });
    expect(c.status, JSON.stringify(c.body)).toBe(201);
    const id = c.body.changeRequest.id;
    expect((await post(lecNew, `/api/change-requests/${id}/accept`)).status).toBe(200);
    await prisma.user.update({ where: { id: U[lecNew].id }, data: { facultyId: S.F2.id } });
    const r = await approve(staff, id, {});
    expect([code(r), r.body.error?.message]).toEqual(['STALE_CHANGE_REQUEST', 'Giảng viên mới không còn hoạt động']);
    expect(await crStatus(id)).toBe('PENDING');
    expect((await prisma.advising.findFirst({ where: { topicId: t.id, endAt: null } })).lecturerId).toBe(U[lec].id);
  });

  it('m3: link tải – GV đích 403; GV cũ chưa cấp quyền 403, được cấp 200, thu hồi 403', async () => {
    const storage = createMemoryStorage();
    const app = createApp({ env: testEnv, logger: undefined, authRepo: createAuthRepo(prisma), hasher: fakeHasher, topicRepo: createTopicRepo(prisma), storage });
    const dl = (who, id) => request(app).post(`/api/documents/${id}/download-url`).set(as(who)).send({});
    const { t, leader, lec } = await mkRunning();
    const lecNew = await mkUser('LECTURER');
    const staff = await mkUser('STAFF');
    const m = await prisma.milestone.create({ data: { topicId: t.id, order: 1, name: 'Giữa kỳ', output: 'PDF', dueAt: at(5), createdById: U[lec].id } });
    const d = await prisma.document.create({ data: { topicId: t.id, milestoneId: m.id, stage: 'MIDTERM', kind: 'FILE', fileName: 'bc.pdf', publicId: `t602/${t.id}/bc.pdf`, version: 1, status: 'READY', uploadedById: U[leader].id } });
    expect((await dl(lec, d.id)).status).toBe(200); // GVHD hiện hành: đối chứng
    const id = (await post(leader, `/api/topics/${t.id}/change-requests`, { type: 'ADVISOR_CHANGE', reason: 'GVHD đi công tác dài hạn', newLecturerId: U[lecNew].id })).body.changeRequest.id;
    expect((await dl(lecNew, d.id)).status).toBe(403); // isChangeTarget không đọc phần thực hiện
    expect((await post(lecNew, `/api/change-requests/${id}/accept`)).status).toBe(200);
    expect((await approve(staff, id, {})).status).toBe(200);
    expect((await dl(lec, d.id)).status).toBe(403); // FR19.4 mất mọi quyền
    expect((await dl(lecNew, d.id)).status).toBe(200);
    const access = (granted) => request(app).put(`/api/topics/${t.id}/former-advisors/${U[lec].id}/read-access`).set(as(staff)).send({ granted, reason: 'Hỗ trợ bàn giao đề tài' });
    expect((await access(true)).status).toBe(200);
    const ok = await dl(lec, d.id);
    expect([ok.status, typeof ok.body.url]).toEqual([200, 'string']);
    expect(await prisma.auditLog.count({ where: { action: 'DOCUMENT_DOWNLOAD', entityId: d.id, actorId: U[lec].id } })).toBe(2);
    expect((await access(false)).status).toBe(200);
    expect((await dl(lec, d.id)).status).toBe(403);
  });
});
