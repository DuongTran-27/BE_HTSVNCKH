// T601 (FR19, API_GD6 §1–§3): khung yêu cầu thay đổi + thay giảng viên + quyền chỉ đọc GV cũ; các MINOR gom vào T601. DB test thật.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Writable } from 'node:stream';
import { prisma, S, U, tok, seedBase, mkTopic, mkRound, addMember, post, put, get, act, at } from './t214-kit.js';
import { signAccessToken } from '../src/lib/tokens.js';
import { createLogger } from '../src/lib/logger.js';
import { pendingRequestOf } from '../src/modules/topics/advisorService.js';
import { createRoundService } from '../src/modules/rounds/service.js';
import { testEnv } from './helpers.js';

const code = (r) => r.body.error?.code;
const REASON = 'GVHD đi công tác dài hạn';

// Người dùng mới mỗi test: limiter 30/15 phút/người của §2.3 và hạn mức GV không bị dồn giữa các test
let n = 0;
const mkUser = async (role, extra = {}) => {
  const key = `${role.toLowerCase()}-t601-${++n}`;
  U[key] = await prisma.user.create({ data: { code: key, email: `${key}@t.vn`, fullName: `Tên ${key}`, passwordHash: 'x', role, mustChangePassword: false, facultyId: S.F1.id, ...extra } });
  tok[key] = signAccessToken(U[key], { secret: testEnv.JWT_ACCESS_SECRET, ttlSeconds: 600 });
  if (role === 'STAFF') await prisma.staffScope.create({ data: { userId: U[key].id, facultyId: S.F1.id } });
  return key;
};
let seq = 0;
const mkRunning = async ({ status = 'IN_PROGRESS', round = S.round, lec = 'lecA' } = {}) => {
  const leader = `s${++seq}`;
  const t = await mkTopic(leader, round, { status });
  await prisma.advising.create({ data: { topicId: t.id, lecturerId: U[lec].id } });
  return { t, leader };
};
const create = (who, t, newLec, o = {}) => post(who, `/api/topics/${t.id}/change-requests`, { type: 'ADVISOR_CHANGE', reason: REASON, newLecturerId: U[newLec]?.id ?? newLec, ...o });
const cr = (verb) => (who, id, body = {}) => post(who, `/api/change-requests/${id}/${verb}`, body);
const accept = cr('accept');
const approve = cr('approve');
const decline = cr('decline');
const withdraw = cr('withdraw');
// Yêu cầu đã qua bước GV mới đồng ý (stage STAFF)
const ready = async (t, leader, newLec) => {
  const c = await create(leader, t, newLec);
  expect(c.status, JSON.stringify(c.body)).toBe(201);
  expect((await accept(newLec, c.body.changeRequest.id)).status).toBe(200);
  return c.body.changeRequest.id;
};
const mkDoc = (t, leader, o = {}) => prisma.document.create({
  data: { topicId: t.id, stage: 'MIDTERM', kind: 'LINK', externalUrl: 'https://x.vn', fileName: 'L', version: 1, status: 'READY', uploadedById: U[leader].id, ...o },
});
const mkMilestone = (t, o = {}) => prisma.milestone.create({ data: { topicId: t.id, order: 1, name: 'Giữa kỳ', output: 'PDF', dueAt: at(5), createdById: U.lecA.id, ...o } });
const currentLecturer = async (t) => (await prisma.advising.findFirst({ where: { topicId: t.id, endAt: null } }))?.lecturerId;

beforeAll(() => seedBase({ students: 80 }), 60000);
afterAll(() => prisma.$disconnect());

describe('FR19 – luồng đủ (API_GD6 §3.7 ca 1, 2, 6, 11)', () => {
  it('SV tạo → GV mới đồng ý → cán bộ duyệt: Advising chuyển, GV cũ mất quyền, bàn giao bản nộp chờ, giữ tên nhận xét cũ', async () => {
    const { t, leader } = await mkRunning();
    const lecNew = await mkUser('LECTURER');
    const staff = await mkUser('STAFF');
    const m = await mkMilestone(t);
    await prisma.milestone.create({ data: { topicId: t.id, order: 2, name: 'Cuối kỳ', output: 'PDF', dueAt: at(5), evaluation: 'PASSED', createdById: U.lecA.id } });
    const d1 = await mkDoc(t, leader, { milestoneId: m.id });
    // FR19.5: trong lúc yêu cầu chờ, GVHD hiện hành vẫn làm việc bình thường
    const c = await create(leader, t, lecNew);
    expect(c.status, JSON.stringify(c.body)).toBe(201);
    const id = c.body.changeRequest.id;
    expect(c.body.changeRequest).toMatchObject({
      type: 'ADVISOR_CHANGE', status: 'PENDING', stage: 'TARGET', reason: REASON,
      payload: { from: { lecturerId: U.lecA.id, fullName: U.lecA.fullName }, to: { lecturerId: U[lecNew].id, fullName: U[lecNew].fullName }, topicStatus: 'IN_PROGRESS' },
      createdBy: { id: U[leader].id, role: 'STUDENT' }, target: { id: U[lecNew].id, role: 'LECTURER' }, availableActions: ['WITHDRAW'],
    });
    expect((await post('lecA', `/api/documents/${d1.id}/feedbacks`, { content: 'Nhận xét của GV cũ' })).status).toBe(201);
    const d2 = await mkDoc(t, leader, { milestoneId: m.id, version: 2 }); // bản mới nhất chưa nhận xét → chờ
    expect(await prisma.auditLog.count({ where: { action: 'CHANGE_REQUEST_CREATE', entityId: id } })).toBe(1);
    const notes = (type) => prisma.notification.findMany({ where: { dedupeKey: `${type}:${id}` }, select: { userId: true, link: true } });
    expect((await notes('CHANGE_TARGET_INVITED')).map((x) => x.userId)).toEqual([U[lecNew].id]);
    expect((await notes('CHANGE_REQUESTED')).map((x) => x.userId)).toEqual(expect.arrayContaining([U.lecA.id, U.staff1.id]));

    // GV mới xem được chi tiết để quyết định (isChangeTarget), chưa xem phần thực hiện
    const view = await get(lecNew, `/api/topics/${t.id}`);
    expect([view.status, view.body.topic.pendingChangeRequests]).toEqual([200, [{ id, type: 'ADVISOR_CHANGE', stage: 'TARGET', createdAt: expect.any(String) }]]);
    expect((await get(lecNew, `/api/topics/${t.id}/milestones`)).status).toBe(403);
    expect((await get(lecNew, `/api/change-requests/${id}`)).body.changeRequest.availableActions).toEqual(['ACCEPT', 'DECLINE']);

    // Ca 6: duyệt khi còn chờ người đích
    expect(code(await approve(staff, id))).toBe('CHANGE_NOT_READY');
    const a = await accept(lecNew, id);
    expect([a.status, a.body.changeRequest.stage, a.body.changeRequest.targetAcceptedAt]).toEqual([200, 'STAFF', expect.any(String)]);
    expect(await prisma.notification.count({ where: { dedupeKey: `CHANGE_TARGET_ACCEPTED:${id}`, userId: { in: [U[leader].id, U[staff].id] } } })).toBe(2);
    const queue = await get(staff, '/api/change-requests?status=PENDING&stage=STAFF');
    expect(queue.body.items.map((x) => [x.id, x.availableActions])).toContainEqual([id, ['APPROVE', 'DECLINE']]);

    const r = await approve(staff, id);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.changeRequest).toMatchObject({ status: 'ACCEPTED', stage: null, decidedBy: { id: U[staff].id }, availableActions: [] });
    expect(r.body.topic).toMatchObject({ id: t.id, version: 1, formerAdvisors: [{ lecturerId: U.lecA.id, readOnlyGranted: false }] });
    const adv = await prisma.advising.findMany({ where: { topicId: t.id }, orderBy: { startAt: 'asc' } });
    expect(adv.map((x) => [x.lecturerId, x.endAt === null])).toEqual([[U.lecA.id, false], [U[lecNew].id, true]]);
    expect(adv[0].endAt.getTime()).toBe(adv[1].startAt.getTime());

    // GV cũ mất mọi quyền, kể cả đọc (FR19.4); GV mới có quyền
    for (const url of [`/api/topics/${t.id}`, `/api/topics/${t.id}/milestones`, `/api/topics/${t.id}/documents`, `/api/topics/${t.id}/status-history`]) {
      expect((await get('lecA', url)).status, url).toBe(403);
      expect((await get(lecNew, url)).status, url).toBe(200);
    }
    expect((await get('lecA', '/api/topics?pageSize=100')).body.items.map((x) => x.id)).not.toContain(t.id);
    expect((await get(lecNew, '/api/topics')).body.items.map((x) => x.id)).toContain(t.id);

    // Ca 2: bàn giao bản nộp chờ nhận xét
    const audit = await prisma.auditLog.findFirst({ where: { action: 'ADVISOR_CHANGE_APPLY', entityId: t.id } });
    expect([audit.before, audit.after]).toEqual([{ lecturerId: U.lecA.id }, { lecturerId: U[lecNew].id, pendingDocumentIds: [d2.id], changeRequestId: id }]);
    expect(await prisma.notification.count({ where: { userId: U[lecNew].id, dedupeKey: `ADVISOR_HANDOVER:${id}` } })).toBe(1);
    expect((await post('lecA', `/api/documents/${d2.id}/feedbacks`, { content: 'Muộn' })).status).toBe(403);
    expect((await post(lecNew, `/api/documents/${d2.id}/feedbacks`, { content: 'GV mới nhận xét' })).status).toBe(201);
    const fbs = await get(lecNew, `/api/topics/${t.id}/feedbacks`);
    expect(fbs.body.items.map((f) => f.lecturer.fullName).sort()).toEqual([U.lecA.fullName, U[lecNew].fullName].sort());

    // CHANGE_DECIDED tới GV cũ (link hộp yêu cầu) và GV cũ vẫn xem được yêu cầu thay mình (MINOR m2 T600)
    const decided = await notes('CHANGE_DECIDED');
    expect(decided).toEqual(expect.arrayContaining([{ userId: U.lecA.id, link: '/yeu-cau' }, { userId: U[leader].id, link: `/de-tai/${t.id}/yeu-cau` }, { userId: U[lecNew].id, link: `/de-tai/${t.id}/yeu-cau` }]));
    expect((await get('lecA', `/api/change-requests/${id}`)).status).toBe(200);
    expect((await get('lecA', '/api/change-requests')).body.items.map((x) => x.id)).toContain(id);
    expect(await prisma.auditLog.count({ where: { action: 'CHANGE_REQUEST_APPROVE', entityId: id } })).toBe(1);
    expect(await prisma.statusHistory.count({ where: { topicId: t.id } })).toBe(0); // FR19 không đổi trạng thái (mục 5)
  });

  it('cán bộ tạo được; ca 11: kết quả do GV cũ nhập không tính – GV mới REQUEST_CLOSE 409 NO_FINAL_RESULT', async () => {
    const { t } = await mkRunning();
    const lecNew = await mkUser('LECTURER');
    const staff = await mkUser('STAFF');
    await prisma.milestone.create({ data: { topicId: t.id, order: 1, name: 'Mốc 1', output: 'PDF', dueAt: at(1), evaluation: 'PASSED', createdById: U.lecA.id } });
    await prisma.resultVersion.create({ data: { topicId: t.id, version: 1, result: 'GOOD', summary: 'Nhập bởi GV cũ trước khi thay.', createdById: U.lecA.id } });
    const id = await ready(t, staff, lecNew);
    expect((await approve(staff, id)).status).toBe(200);
    const topic = (await get(lecNew, `/api/topics/${t.id}`)).body.topic;
    expect(topic.closeReadiness.hasFinalResult).toBe(false);
    expect(code(await act(lecNew, t, { action: 'REQUEST_CLOSE', version: topic.version }))).toBe('NO_FINAL_RESULT');
  });

  it('thay GV ở HAS_ADVISOR (G35) được; WAITING_CLOSE, DRAFT, WAITING_ADVISOR → 409 INVALID_TRANSITION', async () => {
    const { t, leader } = await mkRunning({ status: 'HAS_ADVISOR' });
    const lecNew = await mkUser('LECTURER');
    const staff = await mkUser('STAFF');
    const id = await ready(t, leader, lecNew);
    expect((await approve(staff, id)).status).toBe(200);
    expect(await currentLecturer(t)).toBe(U[lecNew].id);
    for (const status of ['WAITING_CLOSE', 'WAITING_ADVISOR']) {
      const x = await mkRunning({ status });
      const r = await create(x.leader, x.t, lecNew);
      expect([r.status, code(r), r.body.error.message], status).toEqual([409, 'INVALID_TRANSITION', 'Không thể thay giảng viên ở trạng thái hiện tại']);
    }
    const draft = await mkTopic(`s${++seq}`, S.round);
    expect(code(await create(`s${seq}`, draft, lecNew))).toBe('INVALID_TRANSITION');
  });

  it('đề tài đổi trạng thái khi yêu cầu chờ (G39): duyệt 409 INVALID_TRANSITION, yêu cầu vẫn PENDING; GVHD đổi ngoài luồng → 409 STALE_CHANGE_REQUEST', async () => {
    const lecNew = await mkUser('LECTURER');
    const staff = await mkUser('STAFF');
    const a = await mkRunning();
    const idA = await ready(a.t, a.leader, lecNew);
    await prisma.topic.update({ where: { id: a.t.id }, data: { status: 'WAITING_CLOSE' } });
    expect(code(await approve(staff, idA))).toBe('INVALID_TRANSITION');
    expect((await prisma.changeRequest.findUnique({ where: { id: idA } })).status).toBe('PENDING');
    expect(await currentLecturer(a.t)).toBe(U.lecA.id);
    const b = await mkRunning();
    const idB = await ready(b.t, b.leader, lecNew);
    await prisma.advising.updateMany({ where: { topicId: b.t.id }, data: { endAt: new Date() } });
    await prisma.advising.create({ data: { topicId: b.t.id, lecturerId: U.lecB.id } });
    expect(code(await approve(staff, idB))).toBe('STALE_CHANGE_REQUEST');
    // GV mới bị khóa sau khi đồng ý
    const c = await mkRunning();
    const lecLocked = await mkUser('LECTURER');
    const idC = await ready(c.t, c.leader, lecLocked);
    await prisma.user.update({ where: { id: U[lecLocked].id }, data: { isLocked: true } });
    const rc = await approve(staff, idC);
    expect([code(rc), rc.body.error.message]).toEqual(['STALE_CHANGE_REQUEST', 'Giảng viên mới không còn hoạt động']);
    for (const x of [idB, idC]) expect((await prisma.changeRequest.findUnique({ where: { id: x } })).status).toBe('PENDING');
  });
});

describe('FR19 – hạn mức GV mới (FR16, §3.3–3.4)', () => {
  it('GV đã đủ hạn mức: đồng ý 409 LECTURER_QUOTA_EXCEEDED; ca 4 đồng thời: hai lần duyệt tranh suất cuối – đúng một thành công', async () => {
    const round = await mkRound(S.F1.id, 'Đợt hạn mức 1', { maxTopicsPerLecturer: 1 });
    const lecNew = await mkUser('LECTURER');
    const [s1, s2] = [await mkUser('STAFF'), await mkUser('STAFF')];
    const x = await mkRunning({ round });
    const y = await mkRunning({ round });
    const [ix, iy] = [await ready(x.t, x.leader, lecNew), await ready(y.t, y.leader, lecNew)]; // chưa nhận đề tài nào: cả hai đồng ý được
    const rs = await Promise.all([approve(s1, ix), approve(s2, iy)]);
    expect(rs.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(code(rs.find((r) => r.status === 409))).toBe('LECTURER_QUOTA_EXCEEDED');
    expect(await prisma.advising.count({ where: { lecturerId: U[lecNew].id, endAt: null } })).toBe(1);
    expect(await prisma.changeRequest.count({ where: { id: { in: [ix, iy] }, status: 'PENDING' } })).toBe(1); // bên thua rollback, vẫn chờ
    const z = await mkRunning({ round });
    const c = await create(z.leader, z.t, lecNew);
    expect(code(await accept(lecNew, c.body.changeRequest.id))).toBe('LECTURER_QUOTA_EXCEEDED');
    expect((await prisma.changeRequest.findUnique({ where: { id: c.body.changeRequest.id } })).targetAcceptedAt).toBeNull();
  });
});

describe('FR19 – đồng thời với thao tác của GV cũ (§1.2, ca 3)', () => {
  it('duyệt ‖ GV cũ nhận xét / nhập kết quả / REQUEST_CLOSE: không có bản ghi của GV cũ sau thời điểm duyệt, không 500', async () => {
    const staff = await mkUser('STAFF');
    for (let i = 0; i < 4; i++) {
      const { t, leader } = await mkRunning();
      const lecNew = await mkUser('LECTURER');
      const m = await mkMilestone(t, { evaluation: 'PASSED' });
      const d = await mkDoc(t, leader, { milestoneId: m.id });
      await prisma.resultVersion.create({ data: { topicId: t.id, version: 1, result: 'GOOD', summary: 'Kết quả ban đầu của nhóm.', createdById: U.lecA.id } });
      const id = await ready(t, leader, lecNew);
      const rs = await Promise.all([
        approve(staff, id),
        post('lecA', `/api/documents/${d.id}/feedbacks`, { content: 'Nhận xét đua' }),
        post('lecA', `/api/topics/${t.id}/results`, { result: 'PASS', summary: 'Nhóm hoàn thành mục tiêu đề ra.', expectedVersion: 1 }),
        act('lecA', t, { action: 'REQUEST_CLOSE' }),
      ]);
      for (const r of rs) expect([200, 201, 403, 409], JSON.stringify(r.body)).toContain(r.status);
      const old = await prisma.advising.findFirst({ where: { topicId: t.id, lecturerId: U.lecA.id } });
      if (!old.endAt) { // REQUEST_CLOSE thắng → WAITING_CLOSE, duyệt 409
        expect([rs[0].status, code(rs[0])]).toEqual([409, 'INVALID_TRANSITION']);
        continue;
      }
      expect(rs[0].status).toBe(200);
      const after = { gt: old.endAt };
      expect(await prisma.feedback.count({ where: { topicId: t.id, lecturerId: U.lecA.id, createdAt: after } })).toBe(0);
      expect(await prisma.resultVersion.count({ where: { topicId: t.id, createdById: U.lecA.id, createdAt: after } })).toBe(0);
      expect(await prisma.statusHistory.count({ where: { topicId: t.id, at: after } })).toBe(0);
    }
  });
});

describe('khung ChangeRequest – vòng đời, đua, trùng (§2, ca 5, 7, 10)', () => {
  it('ca 7: tạo trùng → 409 CHANGE_REQUEST_PENDING; index change_request_one_pending chặn ở DB', async () => {
    const { t, leader } = await mkRunning();
    const lecNew = await mkUser('LECTURER');
    expect((await create(leader, t, lecNew)).status).toBe(201);
    expect(code(await create(leader, t, 'lecB'))).toBe('CHANGE_REQUEST_PENDING');
    await expect(prisma.changeRequest.create({ data: { topicId: t.id, type: 'ADVISOR_CHANGE', payload: {}, reason: REASON, createdById: U[leader].id } }))
      .rejects.toMatchObject({ code: 'P2002' });
  });

  it('ca 10: GV mới từ chối có lý do → DECLINED, Advising không đổi; thiếu lý do 400; sau khi đồng ý không tự từ chối được (MINOR m4 T600)', async () => {
    const { t, leader } = await mkRunning();
    const lecNew = await mkUser('LECTURER');
    const id = (await create(leader, t, lecNew)).body.changeRequest.id;
    for (const body of [{}, { reason: 'abc' }, { reason: 'Bận việc', x: 1 }]) expect((await decline(lecNew, id, body)).status, JSON.stringify(body)).toBe(400);
    const r = await decline(lecNew, id, { reason: 'Đã đủ việc trong học kỳ' });
    expect([r.status, r.body.changeRequest.status, r.body.changeRequest.decisionReason, r.body.changeRequest.decidedBy.id]).toEqual([200, 'DECLINED', 'Đã đủ việc trong học kỳ', U[lecNew].id]);
    expect(await currentLecturer(t)).toBe(U.lecA.id);
    expect(code(await accept(lecNew, id))).toBe('CHANGE_REQUEST_CLOSED');
    expect(await prisma.notification.count({ where: { dedupeKey: `CHANGE_DECIDED:${id}`, userId: U[leader].id } })).toBe(1);
    // Đồng ý rồi thì người đích không còn từ chối được
    const lec2 = await mkUser('LECTURER');
    const id2 = await ready(t, leader, lec2);
    expect([(await decline(lec2, id2, { reason: 'Đổi ý rồi' })).status, (await get(lec2, `/api/change-requests/${id2}`)).body.changeRequest.status]).toEqual([409, 'PENDING']);
  });

  it('người tạo rút; cán bộ từ chối ở stage TARGET; rút xong không duyệt được', async () => {
    const { t, leader } = await mkRunning();
    const staff = await mkUser('STAFF');
    const lecNew = await mkUser('LECTURER');
    const id = (await create(leader, t, lecNew)).body.changeRequest.id;
    const w = await withdraw(leader, id);
    expect([w.status, w.body.changeRequest.status]).toEqual([200, 'WITHDRAWN']);
    expect(await prisma.notification.count({ where: { dedupeKey: `CHANGE_WITHDRAWN:${id}`, userId: { in: [U[lecNew].id, U.lecA.id] } } })).toBe(2);
    expect(code(await approve(staff, id))).toBe('CHANGE_REQUEST_CLOSED');
    expect(code(await withdraw(leader, id))).toBe('CHANGE_REQUEST_CLOSED');
    const id2 = (await create(leader, t, lecNew)).body.changeRequest.id; // đã hết PENDING → tạo lại được
    const d = await decline(staff, id2, { reason: 'Chưa đủ căn cứ để thay' });
    expect([d.status, d.body.changeRequest.status]).toEqual([200, 'DECLINED']);
  });

  it('ca 5: hai cán bộ duyệt ‖ từ chối, người tạo rút ‖ cán bộ duyệt – một bên thắng, bên kia 409 CHANGE_REQUEST_CLOSED', async () => {
    const [s1, s2] = [await mkUser('STAFF'), await mkUser('STAFF')];
    for (let i = 0; i < 3; i++) {
      const a = await mkRunning();
      const lecA2 = await mkUser('LECTURER');
      const ia = await ready(a.t, a.leader, lecA2);
      const ra = await Promise.all([approve(s1, ia), decline(s2, ia, { reason: 'Không đồng ý thay' })]);
      expect(ra.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(code(ra.find((r) => r.status === 409))).toBe('CHANGE_REQUEST_CLOSED');
      const final = (await prisma.changeRequest.findUnique({ where: { id: ia } })).status;
      expect(await currentLecturer(a.t)).toBe(final === 'ACCEPTED' ? U[lecA2].id : U.lecA.id);

      const b = await mkRunning();
      const lecB2 = await mkUser('LECTURER');
      const ib = await ready(b.t, b.leader, lecB2);
      const rb = await Promise.all([withdraw(b.leader, ib), approve(s1, ib)]);
      expect(rb.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(code(rb.find((r) => r.status === 409))).toBe('CHANGE_REQUEST_CLOSED');
      const wb = (await prisma.changeRequest.findUnique({ where: { id: ib } })).status;
      expect(await prisma.advising.count({ where: { topicId: b.t.id } })).toBe(wb === 'WITHDRAWN' ? 1 : 2); // rút thắng: không có Advising mới
    }
  });

  it('trigger change_request_guard: payload bất biến, đã quyết định thì không sửa, không xóa', async () => {
    const { t, leader } = await mkRunning();
    const lecNew = await mkUser('LECTURER');
    const id = (await create(leader, t, lecNew)).body.changeRequest.id;
    await expect(prisma.changeRequest.update({ where: { id }, data: { payload: { x: 1 } } })).rejects.toThrow(/bất biến/);
    await expect(prisma.changeRequest.update({ where: { id }, data: { reason: 'Lý do khác hẳn' } })).rejects.toThrow(/bất biến/);
    await withdraw(leader, id);
    await expect(prisma.changeRequest.update({ where: { id }, data: { status: 'PENDING' } })).rejects.toThrow(/đã quyết định/);
    await expect(prisma.changeRequest.delete({ where: { id } })).rejects.toThrow(/chỉ thêm/);
  });

  // T602 cắm CANCEL, T603 cắm LEAVE_GROUP (test ở T602-cancel / T603-leave); loại còn chưa có handler là TOPIC_CHANGE (T605).
  // T605 cắm nốt thì đổi ca này sang loại không có trong TYPES (dòng DB đi vòng enum không được) – xem reports/T603.md
  it('loại chưa có handler duyệt (TOPIC_CHANGE, T605) → 409 CHANGE_NOT_READY, không 500, yêu cầu vẫn PENDING', async () => {
    const { t, leader } = await mkRunning();
    const staff = await mkUser('STAFF');
    const c = await prisma.changeRequest.create({ data: { topicId: t.id, type: 'TOPIC_CHANGE', payload: {}, reason: REASON, createdById: U[leader].id } });
    expect(code(await approve(staff, c.id))).toBe('CHANGE_NOT_READY');
    expect((await prisma.changeRequest.findUnique({ where: { id: c.id } })).status).toBe('PENDING');
  });
});

describe('quyền (FR25, ca 8)', () => {
  it('tạo: thành viên thường, GV hiện hành, GV khác, SV ngoài, cán bộ khoa khác, ADMIN → 403; GV mới sai → 400', async () => {
    const { t, leader } = await mkRunning();
    await addMember(t, 's70');
    const lecNew = await mkUser('LECTURER');
    for (const who of ['s70', 'lecA', 'lecB', 's71', 'staff2', 'admin']) expect((await create(who, t, lecNew)).status, who).toBe(403);
    const locked = await mkUser('LECTURER', { isLocked: true });
    for (const bad of ['lecA', 's72', 'lecF2', locked, 'khong-ton-tai']) {
      const r = await create(leader, t, bad);
      expect([r.status, r.body.error?.details?.newLecturerId], bad).toEqual([400, 'Giảng viên không hợp lệ']);
    }
    for (const body of [{ type: 'ADVISOR_CHANGE', reason: 'abc', newLecturerId: U.lecB.id }, { type: 'KHAC', reason: REASON }, { type: 'ADVISOR_CHANGE', reason: REASON }]) {
      expect((await post(leader, `/api/topics/${t.id}/change-requests`, body)).status, JSON.stringify(body)).toBe(400);
    }
    expect(await prisma.changeRequest.count({ where: { topicId: t.id } })).toBe(0);
  });

  it('đồng ý/duyệt/từ chối/rút sai người → 403; xem: SV ngoài 403, ADMIN 403, không tồn tại 404', async () => {
    const { t, leader } = await mkRunning();
    await addMember(t, 's73');
    const lecNew = await mkUser('LECTURER');
    const staff = await mkUser('STAFF');
    const id = (await create(leader, t, lecNew)).body.changeRequest.id;
    for (const who of [leader, 'lecA', 'lecB', 'staff2']) expect((await accept(who, id)).status, who).toBe(403);
    expect((await accept('admin', id)).status).toBe(403);
    expect((await accept(lecNew, id)).status).toBe(200);
    for (const who of [leader, 's73', 'lecA', lecNew, 'staff2', 'admin']) expect((await approve(who, id)).status, who).toBe(403);
    for (const who of [leader, 'lecA', 'staff2']) expect((await decline(who, id, { reason: 'Không đồng ý' })).status, who).toBe(403);
    for (const who of ['s73', staff, lecNew]) expect((await withdraw(who, id)).status, who).toBe(403);
    expect((await prisma.changeRequest.findUnique({ where: { id } })).status).toBe('PENDING');
    expect((await get('s74', `/api/change-requests/${id}`)).status).toBe(403);
    expect((await get('s74', `/api/topics/${t.id}/change-requests`)).status).toBe(403);
    expect((await get('admin', '/api/change-requests')).status).toBe(403);
    expect((await get(staff, '/api/change-requests/khong-co')).status).toBe(404);
    expect((await get('s74', '/api/change-requests')).body.items).toEqual([]);
    for (const who of [leader, 's73', 'lecA', staff]) {
      const r = await get(who, `/api/topics/${t.id}/change-requests`);
      expect([r.status, r.body.items.map((x) => x.id)], who).toEqual([200, [id]]);
    }
    const lecView = await get(lecNew, `/api/topics/${t.id}`); // đã đồng ý, chưa duyệt: vẫn là người đích
    expect(lecView.status).toBe(200);
  });
});

describe('quyền chỉ đọc của GV cũ (FR19.4, §3.5, ca 9)', () => {
  it('cán bộ cấp → GV cũ đọc được, mọi ghi 403; thu hồi → 403; kiểm quyền và lý do', async () => {
    const { t, leader } = await mkRunning();
    const lecNew = await mkUser('LECTURER');
    const staff = await mkUser('STAFF');
    const m = await mkMilestone(t);
    const d = await mkDoc(t, leader, { milestoneId: m.id });
    expect((await approve(staff, await ready(t, leader, lecNew))).status).toBe(200);
    const access = (who, lec, body) => put(who, `/api/topics/${t.id}/former-advisors/${U[lec]?.id ?? lec}/read-access`, body);
    const ok = { granted: true, reason: 'Hỗ trợ GV mới tiếp nhận' };
    for (const who of ['staff2', 'lecA', lecNew, leader, 'admin']) expect((await access(who, 'lecA', ok)).status, who).toBe(403);
    expect((await access(staff, 'lecA', { granted: true })).status).toBe(400);
    expect((await access(staff, lecNew, ok)).status).toBe(404); // GVHD hiện hành không phải GV cũ
    expect((await access(staff, 'lecB', ok)).status).toBe(404);
    const g = await access(staff, 'lecA', ok);
    expect([g.status, g.body.formerAdvisors]).toEqual([200, [expect.objectContaining({ lecturerId: U.lecA.id, readOnlyGranted: true })]]);
    expect(await prisma.auditLog.count({ where: { action: 'FORMER_ADVISOR_ACCESS', entityId: t.id } })).toBe(1);

    const v = await get('lecA', `/api/topics/${t.id}`);
    expect(v.status).toBe(200);
    expect(v.body.topic).toMatchObject({ readOnlyAccess: true, formerAdvisors: [], availableActions: [] });
    const writes = Object.entries(v.body.topic.permissions).filter(([k, x]) => x && !['readExecution', 'viewHistory'].includes(k));
    expect([writes, v.body.topic.permissions.readExecution, v.body.topic.permissions.viewHistory]).toEqual([[], true, true]);
    for (const url of ['milestones', 'documents', 'submissions', 'status-history', 'feedbacks', 'results', 'change-requests']) {
      expect((await get('lecA', `/api/topics/${t.id}/${url}`)).status, url).toBe(200);
    }
    expect((await get('lecA', '/api/topics')).body.items.map((x) => x.id)).toContain(t.id);
    // Không ghi gì được
    expect((await post('lecA', `/api/documents/${d.id}/feedbacks`, { content: 'Không được' })).status).toBe(403);
    expect((await post('lecA', `/api/topics/${t.id}/milestones`, { name: 'Mốc', output: 'PDF', dueAt: at(3).toISOString() })).status).toBe(403);
    expect((await post('lecA', `/api/topics/${t.id}/results`, { result: 'GOOD', summary: 'Nhóm hoàn thành tốt mục tiêu.', expectedVersion: 0 })).status).toBe(403);
    expect((await act('lecA', t, { action: 'REQUEST_CLOSE', version: 1 })).status).toBe(403);
    expect((await create('lecA', t, 'lecB')).status).toBe(403);
    // Thống kê vẫn chỉ GVHD hiện hành (G29)
    expect((await get('lecA', `/api/topics?lecturerId=${U.lecA.id}`)).body.items.map((x) => x.id)).not.toContain(t.id);

    expect((await access(staff, 'lecA', { granted: false, reason: 'Đã bàn giao xong' })).status).toBe(200);
    expect((await get('lecA', `/api/topics/${t.id}`)).status).toBe(403);
    expect((await get('lecA', `/api/topics/${t.id}/milestones`)).status).toBe(403);
  });
});

describe('MINOR gom vào T601', () => {
  it('m1 T404 / m4 T405: GV vừa bị thay (Advising đổi sau khi tải) – nhận xét, mốc, REQUEST_CLOSE 403 nhờ kiểm dưới khóa', async () => {
    // Kiểm qua service với repo thật nhưng findExecTopic/findDetail trả "ảnh cũ" (lecA còn là GVHD) để mô phỏng đổi GV giữa lúc tải và lúc khóa
    const { createTopicRepo } = await import('../src/modules/topics/prismaRepo.js');
    const { createFeedbackService } = await import('../src/modules/execution/feedbackService.js');
    const { createCloseService } = await import('../src/modules/topics/closeService.js');
    const { createMilestoneService } = await import('../src/modules/execution/service.js');
    const { t, leader } = await mkRunning();
    const m = await mkMilestone(t, { evaluation: 'PASSED' });
    const d = await mkDoc(t, leader, { milestoneId: m.id });
    await prisma.resultVersion.create({ data: { topicId: t.id, version: 1, result: 'GOOD', summary: 'Kết quả ban đầu của nhóm.', createdById: U.lecA.id } });
    const real = createTopicRepo(prisma);
    const staleExec = await real.findExecTopic(t.id);
    const staleDetail = await real.findDetail(t.id);
    const staleCond = await real.readCloseConditions(t.id);
    const repo = { ...real, findExecTopic: async () => staleExec, findDetail: async () => staleDetail, readCloseConditions: async () => staleCond };
    await prisma.advising.updateMany({ where: { topicId: t.id }, data: { endAt: new Date() } });
    await prisma.advising.create({ data: { topicId: t.id, lecturerId: U.lecB.id } });
    const lecA = { ...U.lecA, staffFacultyIds: [] };
    await expect(createFeedbackService({ repo }).createForDocument(lecA, d.id, { content: 'x' })).rejects.toMatchObject({ status: 403 });
    await expect(createMilestoneService({ repo }).create(lecA, t.id, { name: 'Mốc', output: 'PDF', dueAt: at(3).toISOString() })).rejects.toMatchObject({ status: 403 });
    await expect(createCloseService({ repo, getTopic: async () => ({}) }).act(lecA, t.id, { action: 'REQUEST_CLOSE', version: 0 })).rejects.toMatchObject({ status: 403 });
    expect(await prisma.feedback.count({ where: { topicId: t.id } })).toBe(0);
    expect(await prisma.milestone.count({ where: { topicId: t.id } })).toBe(1);
    expect((await prisma.topic.findUnique({ where: { id: t.id } })).status).toBe('IN_PROGRESS');
  });

  it('T406: POST …/documents/links với URL sai dạng → 400, không 500', async () => {
    const leader = `s${++seq}`;
    const t = await mkTopic(leader, S.round);
    for (const url of ['abc', 'https://', 'https:// x', '://x.vn']) {
      const r = await post(leader, `/api/topics/${t.id}/documents/links`, { stage: 'PROPOSAL', title: 'Mã nguồn', url });
      expect([r.status, code(r)], url).toEqual([400, 'VALIDATION_ERROR']);
    }
  });

  it('A T501: logger redact header Authorization/Cookie/Set-Cookie', () => {
    let out = '';
    const sink = new Writable({ write(chunk, _e, cb) { out += chunk; cb(); } });
    const log = createLogger({ NODE_ENV: 'production' }, sink);
    log.info({ req: { headers: { authorization: 'Bearer bi-mat', cookie: 'rt=bi-mat' } }, res: { headers: { 'set-cookie': 'rt=bi-mat' } } }, 'x');
    const line = JSON.parse(out);
    expect(out).not.toContain('bi-mat');
    expect([line.req.headers.authorization, line.req.headers.cookie, line.res.headers['set-cookie']]).toEqual(['[Redacted]', '[Redacted]', '[Redacted]']);
  });

  it('B T501: pendingRequestOf ném lỗi khi thiếu id đề nghị (không sinh dedupeKey "...:undefined")', () => {
    expect(() => pendingRequestOf({ id: 't1', advisorRequests: [] })).toThrow(/không có đề nghị/);
    expect(() => pendingRequestOf({ id: 't1', advisorRequests: [{ lecturerId: 'l' }] })).toThrow();
    expect(pendingRequestOf({ id: 't1', advisorRequests: [{ id: 'r1', lecturerId: 'l' }] }).id).toBe('r1');
  });

  it('registrationOpen nửa mở [regOpenAt, regCloseAt) (API_GD2 §1.4)', async () => {
    const r = { id: 'r', facultyId: 'f', name: 'Đợt', academicYear: '2026-2027', regOpenAt: new Date(1000), regCloseAt: new Date(2000), reviewDeadline: new Date(3000), endAt: new Date(4000), config: {} };
    const open = async (ms) => (await createRoundService({ repo: { findById: async () => r }, now: () => new Date(ms) }).get({ role: 'STAFF', staffFacultyIds: ['f'] }, 'r')).round.registrationOpen;
    expect([await open(999), await open(1000), await open(1999), await open(2000)]).toEqual([false, true, true, false]);
  });
});
