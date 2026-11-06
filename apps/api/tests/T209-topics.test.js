// T209 (FR05, FR25, FR15): API hồ sơ đề tài trên DB test thật qua supertest. Dữ liệu riêng, resetData ở beforeAll.
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../src/app.js';
import { createAuthRepo } from '../src/modules/auth/prismaRepo.js';
import { createTopicRepo } from '../src/modules/topics/prismaRepo.js';
import { signAccessToken } from '../src/lib/tokens.js';
import { fakeHasher, testEnv } from './helpers.js';
import { resetData } from './db.js';

const prisma = new PrismaClient();
const app = createApp({ env: testEnv, logger: undefined, authRepo: createAuthRepo(prisma), hasher: fakeHasher, topicRepo: createTopicRepo(prisma) });

let F1, F2, round, closedRound, futureRound, otherRound, fieldOk, fieldOff;
const U = {};
const tok = {};
const as = (who) => ({ Authorization: `Bearer ${tok[who]}` });
const post = (who, url, body) => request(app).post(url).set(as(who)).send(body);
const put = (who, url, body) => request(app).put(url).set(as(who)).send(body);
const get = (who, url) => request(app).get(url).set(as(who));
const audits = (id) => prisma.auditLog.findMany({ where: { entityType: 'Topic', entityId: id }, orderBy: { id: 'asc' } });
const day = 86400000;
const at = (d) => new Date(Date.now() + d * day);
const body = (extra = {}) => ({ roundId: round.id, title: 'Hệ thống quản lý NCKH', summary: 'tóm tắt ngắn', objectives: 'Mục tiêu', keywords: ['web'], fieldId: fieldOk.id, ...extra });
const mkRound = (facultyId, name, open, close, config = {}) =>
  prisma.round.create({ data: { facultyId, name, academicYear: '2026-2027', regOpenAt: at(open), regCloseAt: at(close), reviewDeadline: at(60), endAt: at(200), config } });

beforeAll(async () => {
  await resetData(prisma);
  F1 = await prisma.faculty.create({ data: { code: 'CNTT', name: 'Công nghệ thông tin' } });
  F2 = await prisma.faculty.create({ data: { code: 'KT', name: 'Kinh tế' } });
  fieldOk = await prisma.field.create({ data: { code: 'AI', name: 'Trí tuệ nhân tạo' } });
  fieldOff = await prisma.field.create({ data: { code: 'OLD', name: 'Cũ', isActive: false } });
  round = await mkRound(F1.id, 'Mở', -1, 30, { maxKeywords: 3 });
  closedRound = await mkRound(F1.id, 'Đã đóng', -30, -1);
  futureRound = await mkRound(F1.id, 'Chưa mở', 5, 30);
  otherRound = await mkRound(F2.id, 'Khoa khác', -1, 30);
  const mk = async (key, role, facultyId) => {
    U[key] = await prisma.user.create({ data: { code: key, email: `${key}@t.vn`, fullName: key, passwordHash: 'x', role, mustChangePassword: false, facultyId } });
    tok[key] = signAccessToken(U[key], { secret: testEnv.JWT_ACCESS_SECRET, ttlSeconds: 600 });
  };
  await mk('admin', 'ADMIN');
  await mk('staff1', 'STAFF', F1.id);
  await mk('staff2', 'STAFF', F2.id);
  await mk('lectReq', 'LECTURER', F1.id);
  await mk('lectAdv', 'LECTURER', F1.id);
  await mk('lectOut', 'LECTURER', F1.id);
  for (const k of ['sv1', 'sv2', 'sv3', 'svOut']) await mk(k, 'STUDENT', F1.id);
  await mk('svF2', 'STUDENT', F2.id);
  await prisma.staffScope.createMany({ data: [{ userId: U.staff1.id, facultyId: F1.id }, { userId: U.staff2.id, facultyId: F2.id }] });
});

describe('POST /api/topics', () => {
  it('SV tạo nháp: 201, mã từ sequence, trưởng nhóm, AuditLog, quyền', async () => {
    const r = await post('sv1', '/api/topics', body());
    expect(r.status).toBe(201);
    const t = r.body.topic;
    expect(t).toMatchObject({ status: 'DRAFT', version: 0, title: 'Hệ thống quản lý NCKH', field: { id: fieldOk.id } });
    expect(t.code).toMatch(/^NCKH-2026-\d{4}$/);
    expect(t.facultyId).toBeUndefined();
    expect(t.members).toMatchObject([{ userId: U.sv1.id, role: 'LEADER' }]);
    expect(t.round).toMatchObject({ registrationOpen: true, effectiveConfig: { maxKeywords: 3, minMembers: 1 } });
    // T405: API_GD45 §7.4 thêm 7 quyền GĐ4; T601: API_GD6 §2.5 thêm 2 quyền thay GV – vẫn so khớp toàn bộ
    expect(t.permissions).toEqual({ edit: true, invite: true, transferLeader: true, checkSimilarity: true, viewHistory: true,
      manageMilestones: false, addProgress: false, uploadProposal: true, uploadMilestone: false, giveFeedback: false, enterResult: false, readExecution: true,
      requestAdvisorChange: false, manageFormerAdvisorAccess: false });
    expect(t.availableActions).toEqual(['REQUEST_ADVISOR']);
    expect(t.latestSimilarity).toBeNull();
    const [a, ...rest] = await audits(t.id);
    expect(rest).toEqual([]);
    expect(a).toMatchObject({ action: 'TOPIC_CREATE', actorId: U.sv1.id });
    expect(JSON.stringify(a.after)).not.toContain('tóm tắt ngắn');
  });

  it('nháp rỗng được phép (FR05); body {roundId} đủ', async () => {
    const r = await post('sv1', '/api/topics', { roundId: round.id });
    expect(r.status).toBe(201);
    expect(r.body.topic).toMatchObject({ title: '', keywords: [], field: null });
  });

  it('mã duy nhất khi tạo đồng thời (sequence)', async () => {
    const rs = await Promise.all(Array.from({ length: 12 }, (_, i) => post(['sv1', 'sv2', 'sv3'][i % 3], '/api/topics', { roundId: round.id })));
    expect(rs.map((r) => r.status)).toEqual(new Array(12).fill(201));
    expect(new Set(rs.map((r) => r.body.topic.code)).size).toBe(12);
  });

  it.each(['admin', 'staff1', 'lectReq'])('%s -> 403', async (who) => {
    expect((await post(who, '/api/topics', body())).status).toBe(403);
  });

  it('chưa đăng nhập -> 401', async () => {
    expect((await request(app).post('/api/topics').send(body())).status).toBe(401);
  });

  it('đợt của khoa khác -> 403; đợt không tồn tại -> 400 tại roundId', async () => {
    expect((await post('sv1', '/api/topics', body({ roundId: otherRound.id }))).status).toBe(403);
    const r = await post('sv1', '/api/topics', body({ roundId: 'khong-co' }));
    expect(r.status).toBe(400);
    expect(r.body.error.details).toHaveProperty('roundId');
  });

  it('đợt đã đóng đăng ký -> 409 REGISTRATION_CLOSED; đợt chưa mở vẫn tạo được nháp', async () => {
    const c = await post('sv1', '/api/topics', body({ roundId: closedRound.id }));
    expect(c.status).toBe(409);
    expect(c.body.error.code).toBe('REGISTRATION_CLOSED');
    const f = await post('sv1', '/api/topics', body({ roundId: futureRound.id }));
    expect(f.status).toBe(201);
    expect(f.body.topic.round.registrationOpen).toBe(false);
  });

  it('lĩnh vực ngừng dùng/không tồn tại, từ khóa vượt cấu hình đợt/trần cứng -> 400 theo trường', async () => {
    const f = await post('sv1', '/api/topics', body({ fieldId: fieldOff.id }));
    expect(f.status).toBe(400);
    expect(f.body.error).toMatchObject({ code: 'VALIDATION_ERROR', details: { fieldId: expect.any(String) } });
    expect((await post('sv1', '/api/topics', body({ fieldId: 'khong-co' }))).status).toBe(400);
    const k = await post('sv1', '/api/topics', body({ keywords: ['a', 'b', 'c', 'd'] })); // đợt maxKeywords 3
    expect(k.body.error.details).toHaveProperty('keywords');
    const hard = await post('sv1', '/api/topics', body({ keywords: Array.from({ length: 11 }, (_, i) => `k${i}`) }));
    expect(hard.status).toBe(400);
    expect(hard.body.error.details).toHaveProperty('keywords');
  });
});

describe('GET /api/topics/:id', () => {
  let id;
  beforeAll(async () => {
    id = (await post('sv2', '/api/topics', body())).body.topic.id;
    await prisma.invitation.create({ data: { topicId: id, inviteeId: U.sv3.id } });
  });

  it('thành viên xem được, thấy lời mời đang chờ', async () => {
    const r = await get('sv2', `/api/topics/${id}`);
    expect(r.status).toBe(200);
    expect(r.body.topic.pendingInvitations).toMatchObject([{ invitee: { code: 'sv3' } }]);
  });

  it('người ngoài, ADMIN, STAFF nhìn Nháp, GV không liên quan -> 403; id lạ -> 404', async () => {
    for (const who of ['svOut', 'admin', 'staff1', 'staff2', 'lectOut']) expect((await get(who, `/api/topics/${id}`)).status).toBe(403);
    expect((await get('sv2', '/api/topics/khong-co')).status).toBe(404);
  });

  it('GV được đề nghị (PENDING) xem được; GVHD hiện hành xem được và có viewHistory; GV ngoài 403', async () => {
    await prisma.topic.update({ where: { id }, data: { status: 'WAITING_ADVISOR' } });
    await prisma.advisorRequest.create({ data: { topicId: id, lecturerId: U.lectReq.id, createdAt: at(-3) } });
    const r = await get('lectReq', `/api/topics/${id}`);
    expect(r.status).toBe(200);
    expect(r.body.topic.pendingAdvisorRequest).toMatchObject({ lecturer: { id: U.lectReq.id }, pendingDays: 3 });
    expect(r.body.topic.availableActions).toEqual(['ACCEPT_ADVISING', 'DECLINE_ADVISING']);
    expect(r.body.topic.pendingInvitations).toEqual([]);
    expect(r.body.topic.permissions).toMatchObject({ edit: false, viewHistory: false });
    expect((await get('lectOut', `/api/topics/${id}`)).status).toBe(403);

    await prisma.advisorRequest.updateMany({ where: { topicId: id }, data: { status: 'ACCEPTED' } });
    await prisma.advising.create({ data: { topicId: id, lecturerId: U.lectAdv.id } });
    await prisma.topic.update({ where: { id }, data: { status: 'UNDER_REVIEW' } });
    const adv = await get('lectAdv', `/api/topics/${id}`);
    expect(adv.body.topic).toMatchObject({ advisor: { id: U.lectAdv.id }, permissions: { viewHistory: true }, availableActions: [] });
    expect((await get('lectReq', `/api/topics/${id}`)).status).toBe(403);
  });

  it('STAFF trong phạm vi xem được hồ sơ không phải Nháp, có hành động xét duyệt; STAFF khoa khác 403', async () => {
    const r = await get('staff1', `/api/topics/${id}`);
    expect(r.status).toBe(200);
    expect(r.body.topic.availableActions).toEqual(['REQUEST_REVISION', 'REJECT', 'APPROVE']);
    expect(r.body.topic.permissions).toMatchObject({ edit: false, viewHistory: true });
    expect((await get('staff2', `/api/topics/${id}`)).status).toBe(403);
  });

  it('thành viên không phải trưởng nhóm không có hành động leaderOnly; latestSubmission kèm quyết định; isStale', async () => {
    const t = (await post('sv1', '/api/topics', body())).body.topic;
    await prisma.topicMember.create({ data: { topicId: t.id, userId: U.sv3.id, role: 'MEMBER' } });
    await prisma.topic.update({ where: { id: t.id }, data: { status: 'NEEDS_REVISION' } });
    const m = (await get('sv3', `/api/topics/${t.id}`)).body.topic;
    expect(m.availableActions).toEqual([]);
    expect(m.permissions).toMatchObject({ edit: true, invite: false, transferLeader: false });
    expect((await get('sv1', `/api/topics/${t.id}`)).body.topic.availableActions).toEqual(['RESUBMIT']);

    const sub = await prisma.submission.create({ data: { topicId: t.id, seq: 1, payload: {}, createdById: U.sv1.id } });
    await prisma.reviewDecision.create({ data: { submissionId: sub.id, action: 'REQUEST_REVISION', reason: 'Bổ sung', decidedById: U.staff1.id } });
    const { contentHash } = await import('../src/modules/similarity/engine.js');
    const cur = await prisma.topic.findUnique({ where: { id: t.id } });
    await prisma.similarityCheck.create({ data: { topicId: t.id, algorithmVersion: 'v', thresholds: {}, contentHash: contentHash(cur), corpusSize: 0, level: 'NONE', matches: [], status: 'OK' } });
    let d = (await get('sv1', `/api/topics/${t.id}`)).body.topic;
    expect(d.latestSubmission).toMatchObject({ seq: 1, decision: { action: 'REQUEST_REVISION', reason: 'Bổ sung', decidedBy: { fullName: 'staff1' } } });
    expect(d.latestSimilarity).toMatchObject({ status: 'OK', isStale: false });
    await put('sv1', `/api/topics/${t.id}`, { ...body(), roundId: undefined, title: 'Tên đề tài đã đổi', version: d.version });
    d = (await get('sv1', `/api/topics/${t.id}`)).body.topic;
    expect(d.latestSimilarity.isStale).toBe(true);
  });
});

describe('PUT /api/topics/:id', () => {
  let t;
  const upd = (extra = {}) => ({ title: 'Tên mới của đề tài', summary: 'Tóm tắt mới', objectives: 'Mục tiêu mới', keywords: ['a', 'b'], fieldId: fieldOk.id, version: t.version, ...extra });
  beforeAll(async () => { t = (await post('sv1', '/api/topics', body())).body.topic; });

  it('thành viên sửa Nháp: thay toàn bộ, version +1, AuditLog before/after (summary dạng digest)', async () => {
    const r = await put('sv1', `/api/topics/${t.id}`, upd());
    expect(r.status).toBe(200);
    expect(r.body.topic).toMatchObject({ title: 'Tên mới của đề tài', version: t.version + 1, keywords: ['a', 'b'], status: 'DRAFT' });
    const log = (await audits(t.id)).find((a) => a.action === 'TOPIC_UPDATE');
    expect(log.before.title).toBe('Hệ thống quản lý NCKH');
    expect(log.after.title).toBe('Tên mới của đề tài');
    expect(log.after.summaryDigest).toMatchObject({ words: 3 });
    expect(JSON.stringify({ ...log, id: 0 })).not.toContain('Tóm tắt mới');
    t = r.body.topic;
  });

  it('PUT thay toàn bộ: trường không gửi bị đặt về mặc định', async () => {
    const r = await put('sv1', `/api/topics/${t.id}`, { version: t.version });
    expect(r.body.topic).toMatchObject({ title: '', keywords: [], field: null });
    t = r.body.topic;
  });

  it('version lệch -> 409 CONCURRENT_UPDATE và không ghi gì', async () => {
    const r = await put('sv1', `/api/topics/${t.id}`, upd({ version: t.version - 1 }));
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('CONCURRENT_UPDATE');
    expect((await prisma.topic.findUnique({ where: { id: t.id } })).version).toBe(t.version);
  });

  it('hai PUT đồng thời cùng version: đúng một cái thành công', async () => {
    const rs = await Promise.all([put('sv1', `/api/topics/${t.id}`, upd({ title: 'A' })), put('sv1', `/api/topics/${t.id}`, upd({ title: 'B' }))]);
    expect(rs.map((r) => r.status).sort()).toEqual([200, 409]);
    t = (await get('sv1', `/api/topics/${t.id}`)).body.topic;
  });

  it('quyền: người ngoài, ADMIN, STAFF, GV -> 403; id lạ -> 404; thiếu version -> 400', async () => {
    for (const who of ['svOut', 'admin', 'staff1', 'lectReq']) expect((await put(who, `/api/topics/${t.id}`, upd())).status).toBe(403);
    expect((await put('sv1', '/api/topics/khong-co', upd())).status).toBe(404);
    const { version: _v, ...noVersion } = upd();
    expect((await put('sv1', `/api/topics/${t.id}`, noVersion)).status).toBe(400);
  });

  it.each(['WAITING_ADVISOR', 'HAS_ADVISOR', 'UNDER_REVIEW', 'IN_PROGRESS', 'REJECTED', 'CLOSED'])('trạng thái %s -> 409 TOPIC_NOT_EDITABLE', async (status) => {
    await prisma.topic.update({ where: { id: t.id }, data: { status } });
    const r = await put('sv1', `/api/topics/${t.id}`, upd());
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('TOPIC_NOT_EDITABLE');
  });

  it('NEEDS_REVISION sửa được', async () => {
    await prisma.topic.update({ where: { id: t.id }, data: { status: 'NEEDS_REVISION' } });
    const r = await put('sv1', `/api/topics/${t.id}`, upd());
    expect(r.status).toBe(200);
    expect(r.body.topic.status).toBe('NEEDS_REVISION');
    await prisma.topic.update({ where: { id: t.id }, data: { status: 'DRAFT' } });
  });

  it('lĩnh vực ngừng dùng và từ khóa vượt cấu hình đợt -> 400; giữ nguyên lĩnh vực cũ đã ngừng dùng thì không lỗi', async () => {
    expect((await put('sv1', `/api/topics/${t.id}`, upd({ fieldId: fieldOff.id }))).body.error.details).toHaveProperty('fieldId');
    expect((await put('sv1', `/api/topics/${t.id}`, upd({ keywords: ['a', 'b', 'c', 'd'] }))).body.error.details).toHaveProperty('keywords');
    const cur = (await get('sv1', `/api/topics/${t.id}`)).body.topic;
    await prisma.topic.update({ where: { id: t.id }, data: { fieldId: fieldOff.id } });
    expect((await put('sv1', `/api/topics/${t.id}`, upd({ fieldId: fieldOff.id, version: cur.version }))).status).toBe(200);
  });
});
