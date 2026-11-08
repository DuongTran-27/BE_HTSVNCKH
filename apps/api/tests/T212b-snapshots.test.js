// T212b (FR17): đọc snapshot, so sánh, lịch sử trạng thái trên DB test thật.
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../src/app.js';
import { createAuthRepo } from '../src/modules/auth/prismaRepo.js';
import { createTopicRepo } from '../src/modules/topics/prismaRepo.js';
import { createReviewService } from '../src/modules/topics/reviewService.js';
import { signAccessToken } from '../src/lib/tokens.js';
import { submissionDiffQuerySchema } from '@nckh/shared';
import { fakeHasher, testEnv } from './helpers.js';
import { resetData } from './db.js';

const prisma = new PrismaClient();
const app = createApp({ env: testEnv, logger: undefined, authRepo: createAuthRepo(prisma), hasher: fakeHasher, topicRepo: createTopicRepo(prisma) });
const U = {};
const tok = {};
const get = (who, url) => request(app).get(url).set({ Authorization: `Bearer ${tok[who]}` });
const day = 86400000;
let F1, field, round, topic, s1;
const WHO = ['svA', 'svB', 'lect', 'lect2', 'staff', 'staff2', 'admin'];

beforeAll(async () => {
  await resetData(prisma);
  F1 = await prisma.faculty.create({ data: { code: 'CNTT', name: 'CNTT' } });
  const F2 = await prisma.faculty.create({ data: { code: 'KT', name: 'KT' } });
  field = await prisma.field.create({ data: { code: 'AI', name: 'Trí tuệ nhân tạo' } });
  round = await prisma.round.create({ data: { facultyId: F1.id, name: 'Đợt', academicYear: '2026-2027', regOpenAt: new Date(Date.now() - day), regCloseAt: new Date(Date.now() + 30 * day), reviewDeadline: new Date(Date.now() + 60 * day), endAt: new Date(Date.now() + 200 * day), config: {} } });
  const roles = { svA: 'STUDENT', svB: 'STUDENT', lect: 'LECTURER', lect2: 'LECTURER', staff: 'STAFF', staff2: 'STAFF', admin: 'ADMIN' };
  for (const k of WHO) {
    U[k] = await prisma.user.create({ data: { code: k, email: `${k}@t.vn`, fullName: `Tên ${k}`, passwordHash: 'x', role: roles[k], mustChangePassword: false, facultyId: k === 'admin' ? null : k === 'staff2' ? F2.id : F1.id } });
    tok[k] = signAccessToken(U[k], { secret: testEnv.JWT_ACCESS_SECRET, ttlSeconds: 600 });
  }
  await prisma.staffScope.create({ data: { userId: U.staff.id, facultyId: F1.id } });
  await prisma.staffScope.create({ data: { userId: U.staff2.id, facultyId: F2.id } });
  topic = await prisma.topic.create({ data: { title: 'T', summary: 'S', objectives: 'O', keywords: ['a'], code: 'T212B-1', roundId: round.id, facultyId: F1.id, fieldId: field.id, status: 'NEEDS_REVISION', members: { create: [{ userId: U.svA.id, role: 'LEADER' }] } } });
  await prisma.advising.create({ data: { topicId: topic.id, lecturerId: U.lect.id } });
  const chk = (data) => prisma.similarityCheck.create({ data: { topicId: topic.id, algorithmVersion: 'v1', thresholds: {}, contentHash: 'h', corpusSize: 1, status: 'OK', ...data } });
  const matches = [
    { topicId: 'x1', code: 'C-1', title: 'Công khai', academicYear: '2025-2026', fieldName: 'AI', status: 'CLOSED', titleScore: 0.9, contentScore: 0.8, level: 'HIGH', matchedKeywords: ['a'] },
    { topicId: 'x2', code: 'C-2', title: 'Hồ sơ chờ', academicYear: '2026-2027', fieldName: 'AI', status: 'UNDER_REVIEW', titleScore: 0.7, contentScore: 0.6, level: 'MEDIUM', matchedKeywords: [] },
  ];
  const c1 = await chk({ level: 'HIGH', matches, justification: 'giải trình của sinh viên' });
  const c2 = await chk({ level: 'NONE', matches: [] });
  s1 = await prisma.submission.create({ data: { topicId: topic.id, seq: 1, createdById: U.svA.id, similarityCheckId: c1.id, payload: { title: 'Tên 1', summary: 'S', objectives: 'O', keywords: ['a', 'b'], fieldId: field.id, fieldName: 'AI', documentIds: [] } } });
  await prisma.submission.create({ data: { topicId: topic.id, seq: 2, createdById: U.svA.id, similarityCheckId: c2.id, payload: { title: 'Tên 2', summary: 'S', objectives: 'O', keywords: ['b', 'c'], fieldId: null, fieldName: null, documentIds: [] } } });
  await prisma.reviewDecision.create({ data: { submissionId: s1.id, action: 'REQUEST_REVISION', reason: 'cần sửa tên', decidedById: U.staff.id } });
  await prisma.statusHistory.createMany({ data: [
    { topicId: topic.id, from: 'HAS_ADVISOR', to: 'UNDER_REVIEW', action: 'SUBMIT_FOR_REVIEW', actorId: U.svA.id, at: new Date(Date.now() - 2000) },
    { topicId: topic.id, from: 'UNDER_REVIEW', to: 'NEEDS_REVISION', action: 'REQUEST_REVISION', actorId: U.staff.id, reason: 'cần sửa tên', at: new Date(Date.now() - 1000) },
  ] });
});

const base = () => `/api/topics/${topic.id}`;

describe('quyền đọc (FR25)', () => {
  it.each(['submissions', 'submissions/1', 'submission-diff?from=1&to=2', 'status-history'])('%s: 200 cho SV nhóm, GVHD, STAFF đúng khoa', async (p) => {
    for (const who of ['svA', 'lect', 'staff']) expect((await get(who, `${base()}/${p}`)).status).toBe(200);
  });
  it.each(['submissions', 'submissions/1', 'submission-diff?from=1&to=2', 'status-history'])('%s: 403 cho vai trò/quan hệ sai, 404 đề tài lạ', async (p) => {
    for (const who of ['svB', 'lect2', 'staff2', 'admin']) expect((await get(who, `${base()}/${p}`)).status).toBe(403);
    expect((await get('svA', `/api/topics/khongco/${p}`)).status).toBe(404);
  });
  it('GV được đề nghị nhưng chưa nhận hướng dẫn chưa có quyền xem', async () => {
    await prisma.advisorRequest.create({ data: { topicId: topic.id, lecturerId: U.lect2.id, status: 'PENDING' } });
    expect((await get('lect2', `${base()}/submissions`)).status).toBe(403);
    await prisma.advisorRequest.deleteMany({ where: { lecturerId: U.lect2.id } });
  });
  it('không đăng nhập 401', async () => {
    expect((await request(app).get(`${base()}/submissions`)).status).toBe(401);
  });
});

describe('submissions', () => {
  it('danh sách giảm dần theo seq kèm mức và quyết định', async () => {
    const r = await get('svA', `${base()}/submissions`);
    expect(r.body.items.map((i) => i.seq)).toEqual([2, 1]);
    expect(r.body.items[1]).toMatchObject({ id: s1.id, similarityLevel: 'HIGH', createdBy: { fullName: 'Tên svA' }, decision: { action: 'REQUEST_REVISION' } });
    expect(r.body.items[0]).toMatchObject({ similarityLevel: 'NONE', decision: null });
  });
  it('chi tiết: STAFF thấy đủ hồ sơ chờ, SV/GV chỉ thấy điểm; có giải trình và quyết định', async () => {
    const st = (await get('staff', `${base()}/submissions/1`)).body.submission;
    expect(st.payload.title).toBe('Tên 1');
    expect(st.decision).toMatchObject({ action: 'REQUEST_REVISION', reason: 'cần sửa tên', decidedBy: { fullName: 'Tên staff' } });
    expect(st.similarityCheck.justification).toBe('giải trình của sinh viên');
    expect(st.similarityCheck.matches.map((m) => m.hidden)).toEqual([false, false]);
    expect(st.similarityCheck.matches[1].code).toBe('C-2');
    for (const who of ['svA', 'lect']) {
      const m = (await get(who, `${base()}/submissions/1`)).body.submission.similarityCheck.matches;
      expect(m[0]).toMatchObject({ hidden: false, code: 'C-1' });
      expect(m[1]).toMatchObject({ hidden: true, titleScore: 0.7 });
      expect(m[1]).not.toHaveProperty('code');
      expect(m[1]).not.toHaveProperty('title');
      expect(m[1]).not.toHaveProperty('topicId');
    }
  });
  it('seq không tồn tại hoặc sai định dạng: 404', async () => {
    for (const s of ['3', '0', 'abc', '1.5']) expect((await get('svA', `${base()}/submissions/${s}`)).status).toBe(404);
  });
  it('TC-FR17-01 snapshot bất biến: payload cũ không đổi khi hồ sơ gốc đổi', async () => {
    await prisma.topic.update({ where: { id: topic.id }, data: { title: 'Đổi sau' } });
    expect((await get('svA', `${base()}/submissions/1`)).body.submission.payload.title).toBe('Tên 1');
  });
});

describe('submission-diff', () => {
  it('TC-FR17-02 so sánh hai snapshot', async () => {
    const r = await get('lect', `${base()}/submission-diff?from=1&to=2`);
    expect(r.status).toBe(200);
    expect(r.body.from.seq).toBe(1);
    expect(r.body.to.payload.title).toBe('Tên 2');
    expect(r.body.changes).toEqual({ title: true, summary: false, objectives: false, fieldId: true, keywords: { added: ['c'], removed: ['a'] }, documents: false });
  });
  it('query sai: 400; seq không có: 404', async () => {
    for (const q of ['', '?from=1', '?from=1&to=1', '?from=0&to=2', '?from=a&to=2', '?from=1&to=10001']) expect((await get('svA', `${base()}/submission-diff${q}`)).status).toBe(400);
    expect((await get('svA', `${base()}/submission-diff?from=1&to=9`)).status).toBe(404);
    expect(submissionDiffQuerySchema.safeParse({ from: '1', to: '2' }).success).toBe(true);
  });
});

describe('status-history', () => {
  it('liệt kê theo thời gian, kèm người thực hiện và lý do', async () => {
    const r = await get('svA', `${base()}/status-history`);
    expect(r.body.items).toHaveLength(2);
    expect(r.body.items[0]).toMatchObject({ from: 'HAS_ADVISOR', to: 'UNDER_REVIEW', action: 'SUBMIT_FOR_REVIEW', actor: { fullName: 'Tên svA', role: 'STUDENT' }, reason: null });
    expect(r.body.items[1]).toMatchObject({ to: 'NEEDS_REVISION', actor: { role: 'STAFF' }, reason: 'cần sửa tên' });
  });
});

describe('reviewService sau commit (T212a MINOR 1)', () => {
  it('getTopic lỗi sau khi đã chuyển trạng thái vẫn trả kết quả đã chuyển', async () => {
    const t = await prisma.topic.create({ data: { title: 'Q', summary: 'S', objectives: 'O', keywords: ['a'], code: 'T212B-2', roundId: round.id, facultyId: F1.id, status: 'UNDER_REVIEW', members: { create: [{ userId: U.svA.id, role: 'LEADER' }] } } });
    const s = await prisma.submission.create({ data: { topicId: t.id, seq: 1, createdById: U.svA.id, payload: { title: 'Q' } } });
    const repo = createTopicRepo(prisma);
    const svc = createReviewService({ repo, getTopic: async () => { throw new Error('đọc lỗi'); } });
    const user = { ...U.staff, staffFacultyIds: [F1.id] };
    const r = await svc.act(user, t.id, { action: 'APPROVE', version: t.version, submissionId: s.id }, '127.0.0.1');
    expect(r.topic).toMatchObject({ id: t.id, status: 'IN_PROGRESS', version: t.version + 1 });
    expect((await prisma.topic.findUnique({ where: { id: t.id } })).status).toBe('IN_PROGRESS');
  });
});
