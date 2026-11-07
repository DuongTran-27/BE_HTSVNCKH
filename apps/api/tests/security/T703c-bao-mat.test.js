// T703 bước C (bao-mat): IDOR / phạm vi theo quan hệ (FR25, NFR02), cookie refresh (NFR01), CORS (NFR02).
// Người tấn công là người ĐÚNG vai trò nhưng SAI quan hệ: SV ngoài nhóm, SV khoa khác, GV không hướng dẫn, GV khoa khác,
// cán bộ khoa khác. Mọi thao tác phải bị từ chối (không 2xx) và DB không đổi. DB test thật, kho file giả.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { createAuthRepo } from '../../src/modules/auth/prismaRepo.js';
import { createTopicRepo } from '../../src/modules/topics/prismaRepo.js';
import { createAccountRepo } from '../../src/modules/accounts/prismaRepo.js';
import { createRoundRepo } from '../../src/modules/rounds/prismaRepo.js';
import { createMemoryStorage } from '../../src/lib/storage.js';
import { createMemoryAuthRepo, fakeHasher, testEnv, student } from '../helpers.js';
import { prisma, S, U, seedBase, mkTopic, mkWaiting, mkInvite, addMember, as, at } from '../t214-kit.js';

const mem = createMemoryStorage();
const app = createApp({
  env: testEnv, logger: undefined, authRepo: createAuthRepo(prisma), hasher: fakeHasher, storage: mem,
  topicRepo: createTopicRepo(prisma), accountRepo: createAccountRepo(prisma), roundRepo: createRoundRepo(prisma),
});
const REASON = 'Lý do kiểm thử bảo mật T703c';
const PDF = Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\n%%EOF');
const call = (who, method, url, body) => {
  const r = request(app)[method.toLowerCase()](url).set(as(who));
  return method === 'GET' ? r : r.send(body ?? {});
};

const X = {}; // T, Dr, W, M, P, D, CR, I, N
let snapshot;
const snap = async () => ({
  topics: await prisma.topic.findMany({ orderBy: { id: 'asc' }, select: { id: true, status: true, version: true, title: true } }),
  members: await prisma.topicMember.findMany({ orderBy: [{ topicId: 'asc' }, { userId: 'asc' }], select: { topicId: true, userId: true, role: true, leftAt: true } }),
  milestones: await prisma.milestone.findMany({ orderBy: { id: 'asc' }, select: { id: true, name: true, dueAt: true, version: true, evaluation: true } }),
  progress: await prisma.progressUpdate.findMany({ orderBy: { id: 'asc' }, select: { id: true, done: true, lockedAt: true } }),
  documents: await prisma.document.count(),
  feedbacks: await prisma.feedback.count(),
  results: await prisma.resultVersion.count(),
  changeRequests: await prisma.changeRequest.findMany({ orderBy: { id: 'asc' }, select: { id: true, status: true, targetAcceptedAt: true } }),
  invitations: await prisma.invitation.findMany({ orderBy: { id: 'asc' }, select: { id: true, status: true } }),
  advisorRequests: await prisma.advisorRequest.findMany({ orderBy: { id: 'asc' }, select: { id: true, status: true } }),
  advisings: await prisma.advising.findMany({ orderBy: { id: 'asc' }, select: { id: true, endAt: true, readOnlyGranted: true } }),
  bypasses: await prisma.similarityBypass.count(),
  checks: await prisma.similarityCheck.count(),
  notifications: await prisma.notification.findMany({ orderBy: { id: 'asc' }, select: { id: true, readAt: true } }),
  users: await prisma.user.findMany({ orderBy: { id: 'asc' }, select: { id: true, passwordHash: true, isLocked: true, fullName: true, mustChangePassword: true } }),
});

beforeAll(async () => {
  await seedBase({ students: 8 });
  // T: đang thực hiện, trưởng nhóm s1, thành viên s3, GVHD lecA
  X.T = await mkTopic('s1', S.round, { status: 'IN_PROGRESS' });
  await addMember(X.T, 's3');
  await prisma.advising.create({ data: { topicId: X.T.id, lecturerId: U.lecA.id } });
  X.M = await prisma.milestone.create({ data: { topicId: X.T.id, order: 1, name: 'Giữa kỳ', output: 'Báo cáo', dueAt: at(5), createdById: U.lecA.id } });
  X.P = await prisma.progressUpdate.create({ data: { topicId: X.T.id, authorId: U.s1.id, done: 'd', issues: '', nextPlan: 'n', percent: 10 } });
  X.D = await prisma.document.create({ data: { topicId: X.T.id, stage: 'PROPOSAL', kind: 'FILE', version: 1, fileName: 'a.pdf', publicId: 'nckh/test/topics/x/a.pdf', status: 'READY', uploadedById: U.s1.id } });
  await mem.upload(PDF, { publicId: X.D.publicId });
  await prisma.submission.create({ data: { topicId: X.T.id, seq: 1, payload: { title: X.T.title }, createdById: U.s1.id } });
  // Dr: nháp của s5, có lời mời s6 đang chờ; W: chờ GVHD lecA
  X.Dr = await mkTopic('s5');
  X.I = await mkInvite(X.Dr, 's6');
  X.W = await mkWaiting('s4', 'lecA');
  X.N = await prisma.notification.create({ data: { userId: U.s1.id, type: 'INVITATION_RECEIVED', title: 'Riêng của s1', dedupeKey: 't703c' } });
  const cr = await call('s1', 'POST', `/api/topics/${X.T.id}/change-requests`, { type: 'CANCEL', reason: REASON });
  expect(cr.status).toBe(201);
  X.CR = cr.body.changeRequest;
  snapshot = await snap();
}, 60000);
afterAll(() => prisma.$disconnect());

const STUDENTS = ['s2', 'sF2'];
const LECTURERS = ['lecB', 'lecF2'];
const OUTSIDERS = [...STUDENTS, ...LECTURERS, 'staff2'];

// [method, url(), body(), attackers]
const READS = () => [
  ['GET', `/api/topics/${X.T.id}`],
  ['GET', `/api/topics/${X.T.id}/submissions`],
  ['GET', `/api/topics/${X.T.id}/submissions/1`],
  ['GET', `/api/topics/${X.T.id}/status-history`],
  ['GET', `/api/topics/${X.T.id}/similarity-checks/latest`],
  ['GET', `/api/topics/${X.T.id}/milestones`],
  ['GET', `/api/topics/${X.T.id}/progress`],
  ['GET', `/api/topics/${X.T.id}/documents`],
  ['GET', `/api/topics/${X.T.id}/feedbacks`],
  ['GET', `/api/topics/${X.T.id}/results`],
  ['GET', `/api/topics/${X.T.id}/change-requests`],
  ['GET', `/api/topics/${X.Dr.id}`],
  ['GET', `/api/topics/${X.W.id}`],
  ['GET', `/api/change-requests/${X.CR.id}`],
  ['GET', `/api/milestones/${X.M.id}/due-changes`],
  ['GET', `/api/milestones/${X.M.id}/reopens`],
  ['POST', `/api/documents/${X.D.id}/download-url`, {}],
].map(([m, u, b]) => [m, u, b, OUTSIDERS]);

const WRITES = () => {
  const T = X.T.id;
  return [
    ['PUT', `/api/topics/${X.Dr.id}`, { version: 0, title: 'Bị sửa trộm' }, STUDENTS],
    ['POST', `/api/topics/${X.Dr.id}/invitations`, { inviteeCode: 's7' }, STUDENTS],
    ['POST', `/api/topics/${T}/leader`, { userId: U.s3.id, version: 0 }, STUDENTS],
    ['POST', `/api/topics/${T}/leave`, { version: 0 }, STUDENTS],
    ['POST', `/api/topics/${T}/similarity-checks`, {}, STUDENTS],
    ['POST', `/api/topics/${T}/similarity-bypasses`, { reason: REASON }, ['staff2']],
    ['POST', `/api/topics/${X.W.id}/actions`, { action: 'ACCEPT_ADVISING', version: 0 }, LECTURERS],
    ['POST', `/api/topics/${X.W.id}/actions`, { action: 'DECLINE_ADVISING', version: 0, reason: REASON }, LECTURERS],
    ['POST', `/api/topics/${X.W.id}/actions`, { action: 'WITHDRAW_ADVISOR_REQUEST', version: 0 }, STUDENTS],
    ['POST', `/api/topics/${T}/actions`, { action: 'REQUEST_CLOSE', version: 0 }, LECTURERS],
    ['POST', `/api/topics/${T}/actions`, { action: 'CONFIRM_CLOSE', version: 0 }, ['staff2']],
    ['POST', `/api/topics/${T}/milestones`, { name: 'Mốc lạ', output: 'x', dueAt: at(9).toISOString() }, [...LECTURERS, 'staff2', 's2']],
    ['POST', `/api/topics/${T}/progress`, { done: 'x', nextPlan: 'y', percent: 50 }, STUDENTS],
    ['POST', `/api/topics/${T}/documents/links`, { stage: 'PROPOSAL', title: 'Lạ', url: 'https://example.com/x' }, STUDENTS],
    ['POST', `/api/topics/${T}/results`, { result: 'GOOD', summary: 'Nhận xét tổng kết giả mạo đủ hai mươi ký tự', expectedVersion: 0 }, LECTURERS],
    ['POST', `/api/topics/${T}/result-corrections`, { result: 'FAIL', reason: REASON, expectedVersion: 0 }, ['staff2']],
    ['POST', `/api/topics/${T}/change-requests`, { type: 'CANCEL', reason: REASON }, OUTSIDERS],
    ['PUT', `/api/topics/${T}/former-advisors/${U.lecB.id}/read-access`, { granted: true, reason: REASON }, ['staff2']],
    ['POST', `/api/change-requests/${X.CR.id}/accept`, {}, OUTSIDERS],
    ['POST', `/api/change-requests/${X.CR.id}/decline`, { reason: REASON }, OUTSIDERS],
    ['POST', `/api/change-requests/${X.CR.id}/withdraw`, {}, OUTSIDERS],
    ['POST', `/api/change-requests/${X.CR.id}/approve`, {}, OUTSIDERS],
    ['PATCH', `/api/milestones/${X.M.id}`, { version: 0, name: 'Bị sửa' }, [...LECTURERS, 'staff2']],
    ['POST', `/api/milestones/${X.M.id}/due-changes`, { version: 0, reason: REASON, newDueAt: at(20).toISOString() }, [...LECTURERS, 'staff2']],
    ['POST', `/api/milestones/${X.M.id}/reopen`, { version: 0, reason: REASON }, [...LECTURERS, 'staff2']],
    ['POST', `/api/documents/${X.D.id}/feedbacks`, { content: 'Nhận xét lạ' }, LECTURERS],
    ['PATCH', `/api/progress/${X.P.id}`, { done: 'Bị sửa' }, STUDENTS],
    ['POST', `/api/progress/${X.P.id}/feedbacks`, { content: 'Nhận xét lạ' }, LECTURERS],
    ['POST', `/api/invitations/${X.I.id}/accept`, {}, STUDENTS],
    ['POST', `/api/invitations/${X.I.id}/decline`, {}, STUDENTS],
    ['POST', `/api/invitations/${X.I.id}/cancel`, {}, STUDENTS],
    ['POST', `/api/notifications/${X.N.id}/read`, {}, ['s2', 'lecB', 'staff2', 'admin']],
    // Tài khoản: cán bộ khoa khác; cán bộ leo thang lên STAFF/ADMIN cùng khoa
    ['GET', `/api/users/${U.s1.id}`, undefined, ['staff2']],
    ['PATCH', `/api/users/${U.s1.id}`, { fullName: 'Bị đổi tên' }, ['staff2']],
    ['POST', `/api/users/${U.s1.id}/lock`, {}, ['staff2']],
    ['POST', `/api/users/${U.s1.id}/reset-password`, {}, ['staff2']],
    ['POST', `/api/users/${U.admin.id}/reset-password`, {}, ['staff1', 'staff2']],
    ['POST', `/api/users/${U.staff2.id}/reset-password`, {}, ['staff1']],
    ['PATCH', `/api/users/${U.staff2.id}`, { fullName: 'Bị đổi tên' }, ['staff1']],
    ['PUT', `/api/users/${U.staff1.id}/staff-scopes`, { facultyIds: [S.F1.id, S.F2.id] }, ['staff1']],
  ];
};

const run = async (rows) => {
  const out = [];
  for (const [m, u, b, who] of rows) {
    for (const w of who) {
      const res = await call(w, m, u, b);
      out.push({ who: w, req: `${m} ${u.replace(/[a-z0-9]{20,}/g, ':id')}`, status: res.status, body: JSON.stringify(res.body) });
    }
  }
  return out;
};

describe('T703c-1 IDOR / phạm vi quan hệ (FR25, NFR02)', () => {
  let reads;
  let writes;
  beforeAll(async () => {
    // Kiểm chứng đối chứng: người có quan hệ đọc được (test không rỗng vì id sai)
    expect((await call('s1', 'GET', `/api/topics/${X.T.id}`)).status).toBe(200);
    expect((await call('staff1', 'GET', `/api/topics/${X.T.id}/milestones`)).status).toBe(200);
    expect((await call('lecA', 'GET', `/api/topics/${X.T.id}/documents`)).status).toBe(200);
    expect((await call('s3', 'POST', `/api/documents/${X.D.id}/download-url`, {})).status).toBe(200);
    reads = await run(READS());
    writes = await run(WRITES());
    if (process.env.T703C_DEBUG) (await import('node:fs')).writeFileSync(process.env.T703C_DEBUG, [...reads, ...writes].map((r) => `${r.status} ${r.who} ${r.req} ${r.body.slice(0, 120)}`).join(String.fromCharCode(10)));
  }, 120000);

  it('không request nào của người ngoài quan hệ thành công (2xx)', () => {
    const leaked = [...reads, ...writes].filter((r) => r.status < 300);
    expect(leaked.map((r) => `${r.who} ${r.req} -> ${r.status} ${r.body.slice(0, 120)}`)).toEqual([]);
  });

  it('đọc: người ngoài nhận 403/404 (không lộ nội dung qua 409/400)', () => {
    const odd = reads.filter((r) => ![403, 404].includes(r.status));
    expect(odd.map((r) => `${r.who} ${r.req} -> ${r.status}`)).toEqual([]);
  });

  it('không có URL ký nào được cấp cho người ngoài; không 500', () => {
    expect([...reads, ...writes].filter((r) => r.status >= 500).map((r) => `${r.who} ${r.req} -> ${r.status}`)).toEqual([]);
    expect([...reads, ...writes].filter((r) => r.body.includes('cloudinary')).map((r) => r.req)).toEqual([]);
  });

  it('DB không đổi sau toàn bộ loạt tấn công', async () => {
    expect(await snap()).toEqual(snapshot);
  });

  it('upload file vào đề tài người khác bị từ chối, không có file mới trong kho', async () => {
    const before = mem.files.size;
    for (const w of STUDENTS) {
      const res = await request(app).post(`/api/topics/${X.T.id}/documents`).set(as(w)).field('stage', 'PROPOSAL').attach('file', PDF, 'a.pdf');
      expect([403, 404]).toContain(res.status);
    }
    expect(mem.files.size).toBe(before);
    expect(await prisma.document.count()).toBe(snapshot.documents);
  });

  it('danh sách không lộ đề tài/yêu cầu/lời mời/thông báo ngoài phạm vi', async () => {
    const ids = [X.T.id, X.Dr.id, X.W.id, X.CR.id, X.I.id, X.N.id];
    const lists = [
      ...['s2', 'sF2', 'lecB', 'lecF2', 'staff2'].flatMap((w) => [[w, '/api/topics'], [w, '/api/change-requests']]),
      ['lecB', '/api/advisor-requests'], ['lecF2', '/api/advisor-requests'], ['staff2', '/api/advisor-requests'],
      ['s2', '/api/invitations'], ['sF2', '/api/invitations'],
      ['s2', '/api/notifications'], ['admin', '/api/notifications'],
      ['s2', `/api/repository`], ['sF2', `/api/repository/${X.T.code}`],
      ['staff2', `/api/users?facultyId=${S.F1.id}`], ['staff2', '/api/users'],
    ];
    const bad = [];
    for (const [w, u] of lists) {
      const res = await call(w, 'GET', u);
      const body = JSON.stringify(res.body);
      if (res.status < 300 && ids.some((id) => body.includes(id))) bad.push(`${w} ${u} lộ id`);
      if (res.status < 300 && u.startsWith('/api/users') && body.includes(U.s1.id)) bad.push(`${w} ${u} lộ tài khoản khoa khác`);
    }
    expect(bad).toEqual([]);
  });
});

describe('T703c-2 cookie refresh (NFR01)', () => {
  const cookieOf = (res) => res.headers['set-cookie']?.find((c) => c.startsWith('nckh_rt='));
  const login = (env) => request(createApp({ env, logger: undefined, authRepo: createMemoryAuthRepo([student]), hasher: fakeHasher }))
    .post('/api/auth/login').send({ identifier: 'SV001', password: 'Matkhau123' });

  it('production: HttpOnly, Secure, SameSite=Lax, Path=/api/auth, có hạn; body không chứa refresh token', async () => {
    const res = await login({ ...testEnv, NODE_ENV: 'production' });
    expect(res.status).toBe(200);
    const c = cookieOf(res);
    expect(c).toMatch(/; HttpOnly/);
    expect(c).toMatch(/; Secure/);
    expect(c).toMatch(/; SameSite=Lax/);
    expect(c).toMatch(/; Path=\/api\/auth(;|$)/);
    expect(c).toMatch(/; Max-Age=604800/);
    expect(c).not.toMatch(/Domain=/i);
    const token = c.split(';')[0].slice('nckh_rt='.length);
    expect(JSON.stringify(res.body)).not.toContain(token);
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  it('logout/refresh lỗi xóa cookie đúng Path (nếu sai path trình duyệt giữ cookie cũ)', async () => {
    const a = createApp({ env: testEnv, logger: undefined, authRepo: createMemoryAuthRepo([student]), hasher: fakeHasher });
    const out = await request(a).post('/api/auth/logout').set('Cookie', 'nckh_rt=abc');
    expect(out.status).toBe(204);
    expect(cookieOf(out)).toMatch(/Path=\/api\/auth/);
    const bad = await request(a).post('/api/auth/refresh').set('Cookie', 'nckh_rt=abc');
    expect(bad.status).toBe(401);
    expect(cookieOf(bad)).toMatch(/Path=\/api\/auth/);
  });

  it('refresh chỉ nhận POST (GET điều hướng top-level vẫn gửi cookie Lax)', async () => {
    const a = createApp({ env: testEnv, logger: undefined, authRepo: createMemoryAuthRepo([student]), hasher: fakeHasher });
    expect((await request(a).get('/api/auth/refresh').set('Cookie', 'nckh_rt=abc')).status).toBe(404);
  });
});

describe('T703c-3 CORS chỉ domain cấu hình (NFR02)', () => {
  const a = createApp({ env: { ...testEnv, CORS_ORIGIN: 'https://nckh.example.vn,http://localhost:5173' }, logger: undefined, authRepo: createMemoryAuthRepo(), hasher: fakeHasher });
  it('origin lạ: không có Access-Control-Allow-Origin (kể cả preflight, null, tiền tố/hậu tố giống)', async () => {
    for (const o of ['https://evil.vn', 'null', 'https://nckh.example.vn.evil.vn', 'https://evilnckh.example.vn', 'http://nckh.example.vn']) {
      const pre = await request(a).options('/api/auth/refresh').set('Origin', o).set('Access-Control-Request-Method', 'POST');
      expect(pre.headers['access-control-allow-origin'], o).toBeUndefined();
      const res = await request(a).get('/api/health').set('Origin', o);
      expect(res.headers['access-control-allow-origin'], o).toBeUndefined();
    }
  });
  it('origin cấu hình: phản chiếu đúng origin + credentials, không dùng *', async () => {
    const res = await request(a).options('/api/auth/refresh').set('Origin', 'https://nckh.example.vn').set('Access-Control-Request-Method', 'POST');
    expect(res.headers['access-control-allow-origin']).toBe('https://nckh.example.vn');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(res.headers.vary).toMatch(/Origin/);
  });
  it('helmet: nosniff + không x-powered-by', async () => {
    const res = await request(a).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('T703c-4 RLS Supabase (NFR03) – bổ sung T203', () => {
  it('không có policy nào cho public/anon/authenticated (mở Data API); policy riêng cho role app nckh_app thì được', async () => {
    expect(await prisma.$queryRaw`SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public' AND roles && ARRAY['public', 'anon', 'authenticated']::name[]`).toEqual([]);
  });
  it('không có hàm SECURITY DEFINER trong public (gọi được qua /rest/v1/rpc, bỏ qua RLS)', async () => {
    const rows = await prisma.$queryRaw`SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.prosecdef`;
    expect(rows).toEqual([]);
  });
});
