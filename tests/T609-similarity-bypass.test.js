// T609 (G5 – FR06 mục 3, FR07, API_GD6 §9): cán bộ cho phép gửi với cờ "chưa kiểm tra" khi FR06 lỗi, cron chạy lại FR06,
// trigger submission_immutable chỉ nới cột similarityCheckId. DB test thật; bảng ca theo §9.8.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { prisma, app, S, U, tok, seedBase, mkTopic } from './t214-kit.js';
import { createApp } from '../src/app.js';
import { createAuthRepo } from '../src/modules/auth/prismaRepo.js';
import { createTopicRepo } from '../src/modules/topics/prismaRepo.js';
import { signAccessToken } from '../src/lib/tokens.js';
import { fakeHasher, testEnv } from './helpers.js';
import { checkTransition } from '../src/modules/topics/stateMachine.js';
import { activeBypassOf, justificationMissing } from '../src/modules/similarity/service.js';
import { contentHash } from '../src/modules/similarity/engine.js';

const SECRET = 'cron-secret-t609-0123456789abcdef';
const mkApp = (repo = {}, env = {}) => createApp({ env: { ...testEnv, CRON_SECRET: SECRET, ...env }, logger: undefined, authRepo: createAuthRepo(prisma), hasher: fakeHasher, topicRepo: { ...createTopicRepo(prisma), ...repo } });
// FR06 lỗi giả lập: kho so không tải được
const boom = { loadCorpus: async () => { throw new Error('boom'); } };
const broken = mkApp(boom);
const cronOk = mkApp();
const cronBroken = mkApp(boom);
const cron = (a = cronOk, auth = `Bearer ${SECRET}`) => request(a).post('/api/cron/similarity-rechecks').set('Authorization', auth);

const as = (who) => ({ Authorization: `Bearer ${tok[who]}` });
const post = (who, url, body = {}, a = app) => request(a).post(url).set(as(who)).send(body);
const get = (who, url) => request(app).get(url).set(as(who));
const code = (r) => r.body.error?.code;
const REASON = 'Dịch vụ kiểm tra trùng lặp lỗi kéo dài';

let n = 0;
const mkUser = async (role, facultyId = S.F1.id) => {
  const key = `${role.toLowerCase()}-t609-${++n}`;
  U[key] = await prisma.user.create({ data: { code: key, email: `${key}@t.vn`, fullName: `Tên ${key}`, passwordHash: 'x', role, mustChangePassword: false, facultyId } });
  tok[key] = signAccessToken(U[key], { secret: testEnv.JWT_ACCESS_SECRET, ttlSeconds: 600 });
  if (role === 'STAFF') await prisma.staffScope.create({ data: { userId: U[key].id, facultyId } });
  return key;
};
// Đề tài HAS_ADVISOR đủ hồ sơ, có GVHD; mỗi test người dùng mới (limiter theo người)
const mkReady = async ({ status = 'HAS_ADVISOR' } = {}) => {
  const leader = await mkUser('STUDENT');
  const member = await mkUser('STUDENT');
  const t = await mkTopic(leader, S.round, { status });
  await prisma.topicMember.create({ data: { topicId: t.id, userId: U[member].id, role: 'MEMBER' } });
  const lec = await mkUser('LECTURER');
  await prisma.advising.create({ data: { topicId: t.id, lecturerId: U[lec].id } });
  const staff = await mkUser('STAFF');
  return { t, leader, member, lec, staff };
};
const version = async (t) => (await prisma.topic.findUnique({ where: { id: t.id } })).version;
const act = async (who, t, body, a = app) => post(who, `/api/topics/${t.id}/actions`, { version: await version(t), ...body }, a);
const submit = (who, t, a = broken, action = 'SUBMIT_FOR_REVIEW') => act(who, t, { action }, a);
const grant = (who, t, reason = REASON) => post(who, `/api/topics/${t.id}/similarity-bypasses`, { reason });
// Lần kiểm gần nhất lỗi: SV bấm "kiểm tra trước" khi FR06 lỗi
const failCheck = (who, t) => post(who, `/api/topics/${t.id}/similarity-checks`, {}, broken);
const detail = async (who, t) => (await get(who, `/api/topics/${t.id}`)).body.topic;
const subOf = (t, seq = 1) => prisma.submission.findUnique({ where: { topicId_seq: { topicId: t.id, seq } }, include: { similarityCheck: true } });

// Đề tài có lần gửi "chưa kiểm tra" (bản seq 1 trỏ dòng ERROR)
const mkUncheckedSubmission = async () => {
  const g = await mkReady();
  await failCheck(g.leader, g.t);
  expect((await grant(g.staff, g.t)).status).toBe(201);
  const r = await submit(g.leader, g.t);
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return { ...g, sub: await subOf(g.t) };
};

beforeAll(() => seedBase({ students: 1 }), 60000);
afterAll(() => prisma.$disconnect());

describe('§9.2 – cán bộ cho phép (ca 4)', () => {
  it('201: bản ghi mới, AuditLog, thông báo thành viên; TopicDetail.similarityBypass + permissions', async () => {
    const { t, leader, member, lec, staff } = await mkReady();
    expect((await detail(staff, t)).permissions.grantSimilarityBypass).toBe(false); // chưa kiểm lần nào
    expect((await failCheck(leader, t)).body.similarityCheck).toMatchObject({ status: 'ERROR', level: null });
    const before = await detail(staff, t);
    expect(before.permissions.grantSimilarityBypass).toBe(true);
    expect(before.similarityBypass).toBeNull();
    expect((await detail(leader, t)).permissions.grantSimilarityBypass).toBe(false);

    const r = await grant(staff, t, `  ${REASON}  `);
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.similarityBypass).toMatchObject({ reason: REASON, grantedBy: { fullName: U[staff].fullName } });
    const row = await prisma.similarityBypass.findUniqueOrThrow({ where: { id: r.body.similarityBypass.id } });
    expect(row).toMatchObject({ topicId: t.id, reason: REASON, grantedById: U[staff].id });
    expect(await prisma.auditLog.findFirst({ where: { action: 'SIMILARITY_BYPASS_GRANT', entityId: row.id } })).toMatchObject({ actorId: U[staff].id, entityType: 'SimilarityBypass', after: { topicId: t.id, reason: REASON } });
    const notes = await prisma.notification.findMany({ where: { dedupeKey: `SIMILARITY_BYPASS_GRANTED:${row.id}` } });
    expect(notes.map((x) => x.userId).sort()).toEqual([U[leader].id, U[member].id].sort());
    expect(notes[0]).toMatchObject({ type: 'SIMILARITY_BYPASS_GRANTED', link: `/de-tai/${t.id}/gui` });
    expect(notes[0].title).not.toContain(REASON);

    for (const who of [leader, member, lec, staff]) expect((await detail(who, t)).similarityBypass).toMatchObject({ id: row.id, reason: REASON, grantedBy: { fullName: U[staff].fullName } });
    expect((await detail(staff, t)).permissions.grantSimilarityBypass).toBe(false);
    // không đụng Submission/SimilarityCheck
    expect(await prisma.submission.count({ where: { topicId: t.id } })).toBe(0);
  });

  it('409 SIMILARITY_CHECK_OK (chưa kiểm / gần nhất OK), 409 SIMILARITY_BYPASS_EXISTS, 409 INVALID_TRANSITION (IN_PROGRESS), 400 lý do ngắn', async () => {
    const { t, leader, staff } = await mkReady();
    expect(code(await grant(staff, t))).toBe('SIMILARITY_CHECK_OK'); // chưa kiểm lần nào
    expect((await post(leader, `/api/topics/${t.id}/similarity-checks`)).body.similarityCheck.status).toBe('OK');
    const ok = await grant(staff, t);
    expect([ok.status, code(ok)]).toEqual([409, 'SIMILARITY_CHECK_OK']);
    await failCheck(leader, t);
    const short = await grant(staff, t, 'abc');
    expect([short.status, code(short)]).toEqual([400, 'VALIDATION_ERROR']);
    expect((await post(staff, `/api/topics/${t.id}/similarity-bypasses`, { reason: REASON, extra: 1 })).status).toBe(400); // strict
    expect((await grant(staff, t)).status).toBe(201);
    const dup = await grant(staff, t);
    expect([dup.status, code(dup)]).toEqual([409, 'SIMILARITY_BYPASS_EXISTS']);
    expect(await prisma.similarityBypass.count({ where: { topicId: t.id } })).toBe(1);

    const g = await mkReady({ status: 'IN_PROGRESS' });
    await prisma.similarityCheck.create({ data: { topicId: g.t.id, algorithmVersion: 'x', thresholds: {}, contentHash: 'h', corpusSize: 0, matches: [], status: 'ERROR' } });
    const ip = await grant(g.staff, g.t);
    expect([ip.status, code(ip)]).toEqual([409, 'INVALID_TRANSITION']);
    expect(await prisma.similarityBypass.count({ where: { topicId: g.t.id } })).toBe(0);
  });

  it('403: cán bộ khoa khác, GV (kể cả GVHD), SV (kể cả trưởng nhóm), ADMIN; cán bộ với đề tài Nháp; 404 đề tài không có', async () => {
    const { t, leader, lec } = await mkReady();
    await failCheck(leader, t);
    const other = await mkUser('STAFF', S.F2.id);
    for (const who of [other, lec, leader, 'admin']) {
      const r = await grant(who, t);
      expect([who, r.status, code(r)]).toEqual([who, 403, 'FORBIDDEN']);
    }
    const d = await mkReady({ status: 'DRAFT' });
    expect((await grant(d.staff, d.t)).status).toBe(403);
    expect((await post(d.staff, '/api/topics/cm0000000000000000000000/similarity-bypasses', { reason: REASON })).status).toBe(404);
    expect(await prisma.similarityBypass.count({ where: { topicId: { in: [t.id, d.t.id] } } })).toBe(0);
  });
});

describe('§9.4 – gửi khi FR06 lỗi (ca 1, 2, 3, 8)', () => {
  it('ca 1: FR06 lỗi, chưa có quyền → 409 SIMILARITY_NOT_CHECKED, không có snapshot', async () => {
    const { t, leader } = await mkReady();
    const r = await submit(leader, t);
    expect([r.status, code(r)]).toEqual([409, 'SIMILARITY_NOT_CHECKED']);
    expect(r.body.error.details.similarityCheck).toMatchObject({ status: 'ERROR', level: null });
    expect((await prisma.topic.findUnique({ where: { id: t.id } })).status).toBe('HAS_ADVISOR');
    expect(await prisma.submission.count({ where: { topicId: t.id } })).toBe(0);
  });

  it('ca 2: cho phép → gửi khi FR06 vẫn lỗi: UNDER_REVIEW, StatusHistory, unchecked ở snapshot, danh sách snapshot, TopicDetail, danh sách đề tài', async () => {
    const { t, leader, member, lec, staff } = await mkReady();
    await failCheck(leader, t);
    const b = (await grant(staff, t)).body.similarityBypass;
    const r = await submit(leader, t);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.topic.status).toBe('UNDER_REVIEW');
    expect(r.body.submission).toMatchObject({ seq: 1, unchecked: true });
    expect(r.body.similarityCheck).toMatchObject({ status: 'ERROR', level: null, message: 'Chưa kiểm tra được' });
    const s = await subOf(t);
    expect(s.similarityCheck.status).toBe('ERROR');
    expect(s.similarityCheckId).toBe(r.body.similarityCheck.id);
    expect(s.payload.similarityBypassId).toBe(b.id);
    expect(await prisma.statusHistory.findFirst({ where: { topicId: t.id, action: 'SUBMIT_FOR_REVIEW' } })).toMatchObject({ from: 'HAS_ADVISOR', to: 'UNDER_REVIEW', actorId: U[leader].id });

    const list = (await get(staff, `/api/topics/${t.id}/submissions`)).body.items;
    expect(list[0]).toMatchObject({ seq: 1, similarityStatus: 'ERROR', unchecked: true, similarityLevel: null });
    const snap = (who) => get(who, `/api/topics/${t.id}/submissions/1`).then((x) => x.body.submission);
    for (const who of [staff, leader, member]) {
      expect(await snap(who)).toMatchObject({ unchecked: true, similarityCheck: { status: 'ERROR' }, similarityBypass: { reason: REASON, grantedBy: { fullName: U[staff].fullName }, createdAt: b.createdAt } });
    }
    // G46 (đổi từ T609 cũ): GVHD hiện hành là quan hệ hiện hành nên thấy lý do
    expect((await snap(lec)).similarityBypass).toEqual({ reason: REASON, grantedBy: { fullName: U[staff].fullName }, createdAt: b.createdAt });

    // G46: GV cũ được cấp quyền đọc và SV đã rời chỉ thấy reason null, vẫn thấy grantedBy/createdAt
    const old = await mkUser('LECTURER');
    await prisma.advising.create({ data: { topicId: t.id, lecturerId: U[old].id, endAt: new Date(Date.now() - 1000), readOnlyGranted: true } });
    const gone = await mkUser('STUDENT');
    await prisma.topicMember.create({ data: { topicId: t.id, userId: U[gone].id, role: 'MEMBER', joinedAt: new Date(Date.now() - 3600000), leftAt: new Date(Date.now() + 3600000) } });
    for (const who of [old, gone]) {
      const x = await get(who, `/api/topics/${t.id}/submissions/1`);
      expect([who, x.status]).toEqual([who, 200]);
      expect(x.body.submission.similarityBypass).toEqual({ reason: null, grantedBy: { fullName: U[staff].fullName }, createdAt: b.createdAt });
    }

    const d = await detail(staff, t);
    expect(d.latestSubmission.unchecked).toBe(true);
    expect(d.similarityBypass).toBeNull(); // đã dùng (§9.3)
    expect(d.latestSimilarity).toMatchObject({ status: 'ERROR', level: null });
    const item = (await get(staff, `/api/topics?q=${t.code}`)).body.items.find((x) => x.id === t.id);
    expect(item).toMatchObject({ latestSimilarityStatus: 'ERROR', latestSimilarityLevel: null, latestSubmission: { seq: 1, unchecked: true } });
  });

  it('ca 3: quyền chỉ dùng một lần – yêu cầu chỉnh sửa rồi gửi lại khi FR06 vẫn lỗi → 409', async () => {
    const { t, leader, staff, sub } = await mkUncheckedSubmission();
    const rr = await act(staff, t, { action: 'REQUEST_REVISION', submissionId: sub.id, reason: 'Cần làm rõ mục tiêu' });
    expect(rr.status, JSON.stringify(rr.body)).toBe(200);
    expect((await detail(staff, t)).permissions.grantSimilarityBypass).toBe(true); // lần kiểm gần nhất lỗi, quyền cũ đã dùng
    const r = await submit(leader, t, broken, 'RESUBMIT');
    expect([r.status, code(r)]).toEqual([409, 'SIMILARITY_NOT_CHECKED']);
    expect(await prisma.submission.count({ where: { topicId: t.id } })).toBe(1);
    // cấp lần hai thì gửi lại được
    expect((await grant(staff, t, 'Lỗi vẫn kéo dài, cho phép lần nữa')).status).toBe(201);
    expect((await submit(leader, t, broken, 'RESUBMIT')).status).toBe(200);
  });

  it('có quyền nhưng FR06 lần này thành công → đường thường (unchecked false, không ghi similarityBypassId) và quyền coi như đã dùng', async () => {
    const { t, leader, staff } = await mkReady();
    await failCheck(leader, t);
    await grant(staff, t);
    const r = await submit(leader, t, app);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.submission.unchecked).toBe(false);
    const s = await subOf(t);
    expect(s.similarityCheck.status).toBe('OK');
    expect(s.payload.similarityBypassId).toBeUndefined();
    const d = await detail(staff, t);
    expect([d.similarityBypass, d.latestSubmission.unchecked]).toEqual([null, false]);
  });

  it('ca 8 – đồng thời: hai lần gửi đôi dùng cùng quyền → một 200, một 409; một snapshot', async () => {
    const { t, leader, staff } = await mkReady();
    await failCheck(leader, t);
    await grant(staff, t);
    const v = await version(t);
    const send = () => post(leader, `/api/topics/${t.id}/actions`, { version: v, action: 'SUBMIT_FOR_REVIEW' }, broken);
    const rs = await Promise.all([send(), send()]);
    expect(rs.map((x) => x.status).sort()).toEqual([200, 409]);
    expect(['SIMILARITY_NOT_CHECKED', 'CONCURRENT_UPDATE']).toContain(code(rs.find((x) => x.status === 409)));
    expect(await prisma.submission.count({ where: { topicId: t.id } })).toBe(1);
    expect(await prisma.statusHistory.count({ where: { topicId: t.id } })).toBe(1);
  });
});

describe('§9.5 – cron chạy lại FR06 (ca 5, 6, 9)', () => {
  it('xác thực: chưa cấu hình CRON_SECRET → 404; sai bí mật → 401; đúng → 200 no-store', async () => {
    expect((await cron(mkApp({}, { CRON_SECRET: undefined }))).status).toBe(404);
    expect((await cron(cronOk, 'Bearer sai')).status).toBe(401);
    const r = await cron();
    expect([r.status, r.headers['cache-control']]).toEqual([200, 'no-store']);
    expect(Object.keys(r.body).sort()).toEqual(['checked', 'ranAt', 'stillFailing', 'updated']);
  });

  it('ca 6: vẫn lỗi → không chèn dòng, stillFailing đúng, snapshot giữ nguyên', async () => {
    await cron(); // dọn bản chưa kiểm của test trước
    const { t, sub } = await mkUncheckedSubmission();
    const checks = await prisma.similarityCheck.count();
    const r = await cron(cronBroken);
    expect(r.body).toMatchObject({ checked: 1, updated: 0, stillFailing: 1 });
    expect(await prisma.similarityCheck.count()).toBe(checks);
    expect((await subOf(t)).similarityCheckId).toBe(sub.similarityCheckId);
  });

  it('ca 5: hết lỗi → similarityCheckId trỏ dòng OK mới, dòng ERROR còn nguyên, AuditLog, cán bộ khoa nhận SIMILARITY_RECHECKED; lần hai không đổi gì', async () => {
    await cron();
    const { t, leader, staff, sub } = await mkUncheckedSubmission();
    const errRow = sub.similarityCheck;
    const r = await cron();
    expect(r.body).toMatchObject({ checked: 1, updated: 1, stillFailing: 0 });
    const s = await subOf(t);
    expect(s.similarityCheckId).not.toBe(errRow.id);
    expect(s.similarityCheck).toMatchObject({ status: 'OK', topicId: t.id, level: 'NONE' });
    expect(s.similarityCheck.createdAt > sub.createdAt).toBe(true);
    expect(await prisma.similarityCheck.findUnique({ where: { id: errRow.id } })).toEqual(errRow);
    expect({ seq: s.seq, payload: s.payload, createdAt: s.createdAt }).toEqual({ seq: sub.seq, payload: sub.payload, createdAt: sub.createdAt });
    expect(await prisma.auditLog.findFirst({ where: { action: 'SIMILARITY_RECHECK', entityId: sub.id } })).toMatchObject({ actorId: null, entityType: 'Submission', before: { similarityCheckId: errRow.id }, after: { similarityCheckId: s.similarityCheckId, level: 'NONE' } });
    const notes = await prisma.notification.findMany({ where: { dedupeKey: `SIMILARITY_RECHECKED:${sub.id}` } });
    const f1Staff = (await prisma.staffScope.findMany({ where: { facultyId: S.F1.id } })).map((x) => x.userId);
    expect(notes.map((x) => x.userId).sort()).toEqual(f1Staff.sort()); // cán bộ khoa F1, không SV/GV
    expect(f1Staff).toContain(U[staff].id);
    expect(notes[0]).toMatchObject({ type: 'SIMILARITY_RECHECKED', link: `/xet-duyet/${t.id}` });
    // hiển thị cập nhật
    expect((await detail(leader, t)).latestSubmission.unchecked).toBe(false);
    expect((await get(staff, `/api/topics/${t.id}/submissions`)).body.items[0]).toMatchObject({ similarityStatus: 'OK', unchecked: false, similarityLevel: 'NONE' });

    const checks = await prisma.similarityCheck.count();
    const again = await cron();
    expect(again.body).toMatchObject({ checked: 0, updated: 0, stillFailing: 0 });
    expect(await prisma.similarityCheck.count()).toBe(checks);
    expect(await prisma.notification.count({ where: { dedupeKey: `SIMILARITY_RECHECKED:${sub.id}` } })).toBe(f1Staff.length);
  });

  it('chạy chồng: lần chạy khác đã cập nhật (updateMany count 0) → rollback dòng OK vừa chèn (m5b)', async () => {
    await cron();
    const { sub } = await mkUncheckedSubmission();
    const repo = createTopicRepo(prisma);
    // Lần chạy A đọc danh sách, lần chạy B cập nhật xong trước khi A ghi
    const [stale] = await repo.findUncheckedSubmissions(20);
    expect((await cron()).body.updated).toBe(1);
    const checks = await prisma.similarityCheck.count();
    const c = (await subOf({ id: sub.topicId })).similarityCheck;
    const data = { topicId: c.topicId, algorithmVersion: c.algorithmVersion, thresholds: c.thresholds, contentHash: c.contentHash, corpusSize: c.corpusSize, level: c.level, matches: c.matches, justification: null, status: 'OK' };
    const ok = await repo.applySimilarityRecheck(stale, data);
    expect(ok).toBe(false);
    expect(await prisma.similarityCheck.count()).toBe(checks);
    expect(await prisma.auditLog.count({ where: { action: 'SIMILARITY_RECHECK', entityId: sub.id } })).toBe(1);
  });

  it('ca 9: chạy lại ra HIGH mà SV chưa giải trình → justificationMissing = true trong view của cán bộ', async () => {
    await cron();
    const { t, staff, sub } = await mkUncheckedSubmission();
    // Một đề tài đã duyệt trùng nội dung xuất hiện trong kho so sau khi gửi
    const twin = await mkTopic(await mkUser('STUDENT'), S.round, { status: 'IN_PROGRESS' });
    const p = sub.payload;
    await prisma.topic.update({ where: { id: twin.id }, data: { title: p.title, summary: p.summary, objectives: p.objectives, keywords: p.keywords } });
    expect((await cron()).body).toMatchObject({ checked: 1, updated: 1 });
    const v = (await get(staff, `/api/topics/${t.id}/submissions/1`)).body.submission;
    expect(v).toMatchObject({ unchecked: false, similarityCheck: { status: 'OK', level: 'HIGH', justification: null, justificationMissing: true } });
  });
});

describe('§9.7 – trigger submission_immutable chỉ nới similarityCheckId (ca 7, SQL trực tiếp)', () => {
  const rejected = /chỉ cho phép thêm mới|Chỉ được thay kết quả FR06 lỗi/;
  // createdAt sau lần gửi: Prisma đặt now() theo ms nên tạo liền nhau có thể trùng mốc (trigger đòi lớn hơn hẳn)
  const mkCheck = (topicId, status = 'OK', extra = {}) => prisma.similarityCheck.create({ data: { topicId, algorithmVersion: 'x', thresholds: {}, contentHash: 'h', corpusSize: 0, matches: [], status, level: status === 'OK' ? 'NONE' : null, createdAt: new Date(Date.now() + 60e3), ...extra } });
  const setCheck = (id, checkId) => prisma.$executeRaw`UPDATE "Submission" SET "similarityCheckId" = ${checkId} WHERE id = ${id}`;
  const mkSub = async (checkStatus) => {
    const { t, leader } = await mkReady({ status: 'UNDER_REVIEW' });
    const c = checkStatus ? await mkCheck(t.id, checkStatus) : null;
    const s = await prisma.submission.create({ data: { topicId: t.id, seq: 1, createdById: U[leader].id, similarityCheckId: c?.id ?? null, payload: { title: t.title } } });
    return { t, s, leader };
  };

  it('các cột khác, DELETE, ERROR → ERROR, ERROR → NULL, OK đề tài khác, OK cũ hơn, OK của ChangeRequest: DB từ chối; dữ liệu không đổi', async () => {
    const { t, s, leader } = await mkSub('ERROR');
    // contentHash khớp payload của s: mỗi ca chỉ còn đỏ vì đúng điều kiện cần kiểm (topicId / createdAt / ChangeRequest)
    const h = contentHash({ title: t.title, keywords: [] });
    const okOther = await mkCheck((await mkReady()).t.id, 'OK', { contentHash: h });
    const okNew = await mkCheck(t.id, 'OK', { contentHash: h });
    const errNew = await mkCheck(t.id, 'ERROR');
    const okOld = await mkCheck(t.id, 'OK', { createdAt: new Date(s.createdAt.getTime() - 1000), contentHash: h });
    const crCheck = await mkCheck(t.id, 'OK', { contentHash: h });
    await prisma.changeRequest.create({ data: { topicId: t.id, type: 'TOPIC_CHANGE', payload: {}, reason: 'Đổi tên đề tài', createdById: U[leader].id, similarityCheckId: crCheck.id } });
    const tries = [
      () => prisma.$executeRaw`UPDATE "Submission" SET seq = 9 WHERE id = ${s.id}`,
      () => prisma.$executeRaw`UPDATE "Submission" SET payload = '{"title":"khác"}'::jsonb WHERE id = ${s.id}`,
      () => prisma.$executeRaw`UPDATE "Submission" SET "createdAt" = now() + interval '1 day' WHERE id = ${s.id}`,
      () => prisma.$executeRaw`UPDATE "Submission" SET "createdById" = ${U[leader].id} WHERE id = ${s.id}`, // cùng giá trị cũng không được
      () => prisma.$executeRaw`UPDATE "Submission" SET "similarityCheckId" = ${okNew.id}, seq = 9 WHERE id = ${s.id}`, // đúng cột + cột khác
      () => prisma.$executeRaw`DELETE FROM "Submission" WHERE id = ${s.id}`,
      () => setCheck(s.id, errNew.id), // ERROR → ERROR
      () => prisma.$executeRaw`UPDATE "Submission" SET "similarityCheckId" = NULL WHERE id = ${s.id}`,
      () => setCheck(s.id, okOther.id), // OK của đề tài khác
      () => setCheck(s.id, okOld.id), // OK cũ hơn lần gửi
      () => setCheck(s.id, crCheck.id), // OK của ChangeRequest (m5c)
    ];
    for (const f of tries) await expect(f()).rejects.toThrow(rejected);
    expect(await prisma.submission.findUnique({ where: { id: s.id } })).toEqual(s);
  });

  it('ERROR → OK mới cùng đề tài: được, đúng một lần (OK → OK khác bị từ chối); NULL → OK: được', async () => {
    const { t, s } = await mkSub('ERROR');
    // T703b: dòng OK phải kiểm đúng nội dung đã gửi (submission_guard so contentHash với payload)
    const hashOf = (x) => contentHash({ title: x.title, keywords: [] });
    const ok1 = await mkCheck(t.id, 'OK', { contentHash: hashOf(t) });
    expect(await setCheck(s.id, ok1.id)).toBe(1);
    const after = await prisma.submission.findUnique({ where: { id: s.id } });
    expect(after).toEqual({ ...s, similarityCheckId: ok1.id });
    await expect(setCheck(s.id, (await mkCheck(t.id, 'OK', { contentHash: hashOf(t) })).id)).rejects.toThrow(/Chỉ được thay kết quả FR06 lỗi/);
    await expect(prisma.$executeRaw`DELETE FROM "Submission" WHERE id = ${s.id}`).rejects.toThrow(/chỉ cho phép thêm mới/);

    const n0 = await mkSub(null);
    expect(await setCheck(n0.s.id, (await mkCheck(n0.t.id, 'OK', { contentHash: hashOf(n0.t) })).id)).toBe(1);
  });

  it('SimilarityBypass chỉ thêm: UPDATE, DELETE bị từ chối', async () => {
    const { t, leader, staff } = await mkReady();
    await failCheck(leader, t);
    const id = (await grant(staff, t)).body.similarityBypass.id;
    await expect(prisma.similarityBypass.update({ where: { id }, data: { reason: 'đổi lý do' } })).rejects.toThrow(/chỉ cho phép thêm mới/);
    await expect(prisma.similarityBypass.delete({ where: { id } })).rejects.toThrow(/chỉ cho phép thêm mới/);
  });
});

describe('hàm thuần G5', () => {
  const base = { topic: { status: 'HAS_ADVISOR' }, action: 'SUBMIT_FOR_REVIEW', actor: { role: 'STUDENT' } };
  const run = (similarity, similarityBypass, justification) => () => checkTransition({ ...base, justification, ctx: { isLeader: true, similarity, similarityBypass } });
  it('checkTransition: bypass chỉ bỏ qua khi FR06 không OK; OK + HIGH vẫn đòi giải trình; không bypass thì lỗi vẫn 409', () => {
    expect(run({ status: 'ERROR', level: null }, true)).not.toThrow();
    expect(run(null, true)).not.toThrow();
    expect(run({ status: 'ERROR', level: null }, false)).toThrow(expect.objectContaining({ code: 'SIMILARITY_NOT_CHECKED' }));
    expect(run({ status: 'OK', level: 'HIGH' }, true)).toThrow(expect.objectContaining({ code: 'JUSTIFICATION_REQUIRED' }));
    expect(run({ status: 'OK', level: 'NONE' }, true)).not.toThrow();
  });
  it('activeBypassOf: còn hiệu lực khi chưa có lần gửi nào từ lúc cấp (trùng mốc coi như đã dùng)', () => {
    const b = { id: 'b', createdAt: new Date(1000) };
    expect(activeBypassOf(null, null)).toBeNull();
    expect(activeBypassOf(b, null)).toBe(b);
    expect(activeBypassOf(b, { createdAt: new Date(999) })).toBe(b);
    expect(activeBypassOf(b, { createdAt: new Date(1000) })).toBeNull();
    expect(activeBypassOf(b, { createdAt: new Date(1001) })).toBeNull();
  });
  it('justificationMissing: chỉ OK + HIGH + giải trình thiếu theo ngưỡng lúc kiểm', () => {
    const c = (o) => ({ status: 'OK', level: 'HIGH', justification: null, thresholds: { minJustificationWords: 3 }, ...o });
    expect(justificationMissing(c({}))).toBe(true);
    expect(justificationMissing(c({ justification: 'một hai ba' }))).toBe(false);
    expect(justificationMissing(c({ level: 'REVIEW' }))).toBe(false);
    expect(justificationMissing(c({ status: 'ERROR', level: null }))).toBe(false);
  });
});
