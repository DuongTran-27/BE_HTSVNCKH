// T212a (FR06, FR07, FR17): gửi/gửi lại, snapshot bất biến, quyết định xét duyệt trên DB test thật.
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../src/app.js';
import { createAuthRepo } from '../src/modules/auth/prismaRepo.js';
import { createTopicRepo } from '../src/modules/topics/prismaRepo.js';
import { checkTransition } from '../src/modules/topics/stateMachine.js';
import { signAccessToken } from '../src/lib/tokens.js';
import { topicActionSchema } from '@nckh/shared';
import { fakeHasher, testEnv } from './helpers.js';
import { resetData } from './db.js';

const prisma = new PrismaClient();
const topicRepo = createTopicRepo(prisma);
const mkApp = (repo) => createApp({ env: testEnv, logger: undefined, authRepo: createAuthRepo(prisma), hasher: fakeHasher, topicRepo: repo });
const app = mkApp(topicRepo);
const U = {};
const tok = {};
const as = (who) => ({ Authorization: `Bearer ${tok[who]}` });
const act = (who, t, body, a = app) => request(a).post(`/api/topics/${t.id}/actions`).set(as(who)).send({ version: t.version ?? 0, ...body });
const code = (r) => r.body.error?.code;
const day = 86400000;
const at = (d) => new Date(Date.now() + d * day);
let F1, F2, field, round, closedRound, oldRound;
const rw = () => Math.random().toString(36).slice(2, 10);
const fresh = () => ({
  title: `${rw()} ${rw()} ${rw()} ${rw()}`, summary: `${rw()} ${rw()} ${rw()} ${rw()} ${rw()} ${rw()}`,
  objectives: `${rw()} ${rw()} ${rw()}`, keywords: [rw(), rw()],
});
let seq = 0;
const mkTopic = async (r, status, leader = 'svA', content = fresh()) => {
  const t = await prisma.topic.create({
    data: { ...content, code: `T212A-${++seq}`, roundId: r.id, facultyId: r.facultyId, fieldId: field.id, status, members: { create: [{ userId: U[leader].id, role: 'LEADER' }] } },
  });
  if (status !== 'DRAFT' && status !== 'WAITING_ADVISOR') await prisma.advising.create({ data: { topicId: t.id, lecturerId: U.lect.id } });
  return t;
};
// đề tài đang xét duyệt với một snapshot chưa có quyết định
const mkUnderReview = async () => {
  const t = await mkTopic(round, 'UNDER_REVIEW');
  const s = await prisma.submission.create({ data: { topicId: t.id, seq: 1, createdById: U.svA.id, payload: { title: t.title } } });
  return { t, s };
};
const justification = Array.from({ length: 55 }, (_, i) => `ly${i}`).join(' ');

beforeAll(async () => {
  await resetData(prisma);
  F1 = await prisma.faculty.create({ data: { code: 'CNTT', name: 'Công nghệ thông tin' } });
  F2 = await prisma.faculty.create({ data: { code: 'KT', name: 'Kinh tế' } });
  field = await prisma.field.create({ data: { code: 'AI', name: 'Trí tuệ nhân tạo' } });
  const mkRound = (name, year, open, close) => prisma.round.create({ data: { facultyId: F1.id, name, academicYear: year, regOpenAt: at(open), regCloseAt: at(close), reviewDeadline: at(60), endAt: at(200), config: { minSummaryWords: 3, minKeywords: 1 } } });
  round = await mkRound('Đang mở', '2026-2027', -1, 30);
  closedRound = await mkRound('Đã đóng đăng ký', '2026-2027', -30, -1);
  oldRound = await mkRound('Đợt cũ', '2025-2026', -300, -250);
  const mk = async (key, role, fac = F1) => {
    U[key] = await prisma.user.create({ data: { code: key, email: `${key}@t.vn`, fullName: key, passwordHash: 'x', role, mustChangePassword: false, facultyId: role === 'ADMIN' ? null : fac.id } });
    tok[key] = signAccessToken(U[key], { secret: testEnv.JWT_ACCESS_SECRET, ttlSeconds: 600 });
  };
  await mk('admin', 'ADMIN');
  await mk('staff', 'STAFF');
  await mk('staff2', 'STAFF', F2);
  await mk('lect', 'LECTURER');
  for (const k of ['svA', 'svOut']) await mk(k, 'STUDENT');
  await prisma.staffScope.create({ data: { userId: U.staff.id, facultyId: F1.id } });
  await prisma.staffScope.create({ data: { userId: U.staff2.id, facultyId: F2.id } });
});

describe('schema và stateMachine', () => {
  it('checkTransition bỏ qua FR06 khi skipSimilarity, nếu không thì chặn', () => {
    const args = { topic: { status: 'HAS_ADVISOR' }, action: 'SUBMIT_FOR_REVIEW', actor: { role: 'STUDENT' }, ctx: { isLeader: true } };
    expect(checkTransition({ ...args, skipSimilarity: true }).to).toBe('UNDER_REVIEW');
    expect(() => checkTransition(args)).toThrow(expect.objectContaining({ code: 'SIMILARITY_NOT_CHECKED' }));
  });
  it('topicActionSchema nhận 5 action mới, từ chối thiếu lý do/submissionId, vẫn từ chối action ngoài GĐ2', () => {
    const p = (o) => topicActionSchema.safeParse({ version: 1, ...o }).success;
    expect(p({ action: 'SUBMIT_FOR_REVIEW' })).toBe(true);
    expect(p({ action: 'RESUBMIT', justification: ' x ' })).toBe(true);
    expect(p({ action: 'APPROVE', submissionId: 's1' })).toBe(true);
    expect(p({ action: 'APPROVE' })).toBe(false);
    expect(p({ action: 'REJECT', submissionId: 's1' })).toBe(false);
    expect(p({ action: 'REQUEST_REVISION', submissionId: 's1', reason: 'đủ năm' })).toBe(true);
    expect(p({ action: 'CANCEL', reason: 'khong the huy' })).toBe(false);
  });
});

describe('SUBMIT_FOR_REVIEW / RESUBMIT', () => {
  it('trưởng nhóm gửi: tạo snapshot bất biến + SimilarityCheck + StatusHistory + AuditLog', async () => {
    const t = await mkTopic(round, 'HAS_ADVISOR');
    const r = await act('svA', t, { action: 'SUBMIT_FOR_REVIEW' });
    expect(r.status).toBe(200);
    expect(r.body.topic.status).toBe('UNDER_REVIEW');
    expect(r.body.submission).toMatchObject({ seq: 1 });
    expect(r.body.similarityCheck).toMatchObject({ status: 'OK', level: 'NONE' });
    expect(r.body.topic).not.toHaveProperty('submission');
    const s = await prisma.submission.findUnique({ where: { id: r.body.submission.id } });
    expect(s.payload).toEqual({ title: t.title, summary: t.summary, objectives: t.objectives, keywords: t.keywords, fieldId: field.id, fieldName: 'Trí tuệ nhân tạo', documentIds: [] });
    expect(s.similarityCheckId).toBe(r.body.similarityCheck.id);
    expect(await prisma.statusHistory.count({ where: { topicId: t.id, action: 'SUBMIT_FOR_REVIEW', from: 'HAS_ADVISOR', to: 'UNDER_REVIEW', actorId: U.svA.id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'TOPIC_SUBMIT', entityId: s.id } })).toBe(1);
    // FR17: snapshot không sửa/xóa được
    await expect(prisma.submission.update({ where: { id: s.id }, data: { seq: 9 } })).rejects.toThrow();
    await expect(prisma.submission.delete({ where: { id: s.id } })).rejects.toThrow();
  });

  it('403 trước 409: vai trò/quan hệ sai không lộ trạng thái', async () => {
    const t = await mkTopic(round, 'HAS_ADVISOR');
    const draft = await mkTopic(round, 'DRAFT');
    await prisma.topicMember.create({ data: { topicId: t.id, userId: U.svOut.id, role: 'MEMBER' } }); // thành viên không phải trưởng nhóm
    for (const who of ['svOut', 'lect', 'staff', 'admin', 'staff2']) expect((await act(who, t, { action: 'SUBMIT_FOR_REVIEW' })).status).toBe(403);
    // người ngoài nhóm gọi vào Nháp: 403 chứ không phải 409
    expect((await act('lect', draft, { action: 'SUBMIT_FOR_REVIEW' })).status).toBe(403);
    expect(await prisma.submission.count({ where: { topicId: t.id } })).toBe(0);
    expect(await prisma.similarityCheck.count({ where: { topicId: t.id } })).toBe(0);
  });

  it('sai trạng thái 409 và không chạy thuật toán; sai version 409; thiếu thông tin 400', async () => {
    const draft = await mkTopic(round, 'DRAFT');
    const r1 = await act('svA', draft, { action: 'SUBMIT_FOR_REVIEW' });
    expect([r1.status, code(r1)]).toEqual([409, 'INVALID_TRANSITION']);
    expect(await prisma.similarityCheck.count({ where: { topicId: draft.id } })).toBe(0);
    const t = await mkTopic(round, 'HAS_ADVISOR');
    const r2 = await act('svA', t, { action: 'SUBMIT_FOR_REVIEW', version: 99 });
    expect([r2.status, code(r2)]).toEqual([409, 'CONCURRENT_UPDATE']);
    const bad = await mkTopic(round, 'HAS_ADVISOR', 'svA', { ...fresh(), keywords: [] });
    const r3 = await act('svA', bad, { action: 'SUBMIT_FOR_REVIEW' });
    expect([r3.status, code(r3)]).toEqual([400, 'TOPIC_INCOMPLETE']);
    expect(await prisma.similarityCheck.count({ where: { topicId: bad.id } })).toBe(0);
  });

  it('SUBMIT chỉ trong thời gian đăng ký, RESUBMIT thì không', async () => {
    const t = await mkTopic(closedRound, 'HAS_ADVISOR');
    const r = await act('svA', t, { action: 'SUBMIT_FOR_REVIEW' });
    expect([r.status, code(r)]).toEqual([409, 'REGISTRATION_CLOSED']);
    const rs = await mkTopic(closedRound, 'NEEDS_REVISION');
    const ok = await act('svA', rs, { action: 'RESUBMIT' });
    expect(ok.status).toBe(200);
    expect(ok.body.topic.status).toBe('UNDER_REVIEW');
  });

  it('nghi trùng cao: thiếu giải trình 400 JUSTIFICATION_REQUIRED (kèm kết quả), đủ giải trình thì gửi được', async () => {
    const content = fresh();
    await mkTopic(oldRound, 'CLOSED', 'svOut', content);
    const t = await mkTopic(round, 'HAS_ADVISOR', 'svA', content);
    const r = await act('svA', t, { action: 'SUBMIT_FOR_REVIEW', justification: 'ngắn quá' });
    expect([r.status, code(r)]).toEqual([400, 'JUSTIFICATION_REQUIRED']);
    expect(r.body.error.details.similarityCheck).toMatchObject({ status: 'OK', level: 'HIGH', justificationRequired: true });
    expect((await prisma.topic.findUnique({ where: { id: t.id } })).status).toBe('HAS_ADVISOR');
    expect(await prisma.submission.count({ where: { topicId: t.id } })).toBe(0);
    const ok = await act('svA', t, { action: 'SUBMIT_FOR_REVIEW', justification });
    expect(ok.status).toBe(200);
    expect(ok.body.similarityCheck).toMatchObject({ level: 'HIGH', justification });
  });

  it('FR06 lỗi: 409 SIMILARITY_NOT_CHECKED, không bao giờ coi là không trùng, không gửi', async () => {
    const broken = mkApp({ ...topicRepo, loadCorpus: async () => { throw new Error('boom'); } });
    const t = await mkTopic(round, 'HAS_ADVISOR');
    const r = await act('svA', t, { action: 'SUBMIT_FOR_REVIEW' }, broken);
    expect([r.status, code(r)]).toEqual([409, 'SIMILARITY_NOT_CHECKED']);
    expect(r.body.error.details.similarityCheck).toMatchObject({ status: 'ERROR', level: null, matches: [] });
    expect(JSON.stringify(r.body)).not.toContain('boom');
    expect((await prisma.topic.findUnique({ where: { id: t.id } })).status).toBe('HAS_ADVISOR');
    expect(await prisma.submission.count({ where: { topicId: t.id } })).toBe(0);
    expect(await prisma.similarityCheck.count({ where: { topicId: t.id, status: 'ERROR' } })).toBe(1);
  });

  it('gửi đôi đồng thời: một thành công, một 409; chỉ một snapshot', async () => {
    const t = await mkTopic(round, 'HAS_ADVISOR');
    const rs = await Promise.all([1, 2].map(() => act('svA', t, { action: 'SUBMIT_FOR_REVIEW' })));
    expect(rs.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await prisma.submission.count({ where: { topicId: t.id } })).toBe(1);
  });
});

describe('quyết định xét duyệt', () => {
  it('REQUEST_REVISION lưu ReviewDecision + lý do, RESUBMIT tạo snapshot seq 2, snapshot cũ hết hiệu lực', async () => {
    const { t, s } = await mkUnderReview();
    const r = await act('staff', t, { action: 'REQUEST_REVISION', submissionId: s.id, reason: 'Cần làm rõ mục tiêu' });
    expect(r.status).toBe(200);
    expect(r.body.topic.status).toBe('NEEDS_REVISION');
    const d = await prisma.reviewDecision.findUnique({ where: { submissionId: s.id } });
    expect(d).toMatchObject({ action: 'REQUEST_REVISION', reason: 'Cần làm rõ mục tiêu', decidedById: U.staff.id });
    expect(await prisma.statusHistory.count({ where: { topicId: t.id, action: 'REQUEST_REVISION', reason: 'Cần làm rõ mục tiêu', actorId: U.staff.id } })).toBe(1);
    await expect(prisma.reviewDecision.delete({ where: { id: d.id } })).rejects.toThrow();
    const re = await act('svA', { id: t.id, version: r.body.topic.version }, { action: 'RESUBMIT' });
    expect(re.status).toBe(200);
    expect(re.body.submission.seq).toBe(2);
    const v = { id: t.id, version: re.body.topic.version };
    const stale = await act('staff', v, { action: 'APPROVE', submissionId: s.id });
    expect([stale.status, code(stale)]).toEqual([409, 'STALE_SUBMISSION']);
    const ok = await act('staff', v, { action: 'APPROVE', submissionId: re.body.submission.id });
    expect(ok.status).toBe(200);
    expect(ok.body.topic.status).toBe('IN_PROGRESS');
  });

  it('REJECT kết thúc hồ sơ; snapshot đã có quyết định -> STALE_SUBMISSION', async () => {
    const a = await mkUnderReview();
    const rj = await act('staff', a.t, { action: 'REJECT', submissionId: a.s.id, reason: 'Không phù hợp' });
    expect(rj.body.topic.status).toBe('REJECTED');
    const b = await mkUnderReview();
    await prisma.reviewDecision.create({ data: { submissionId: b.s.id, action: 'REQUEST_REVISION', reason: 'x', decidedById: U.staff.id } });
    const st = await act('staff', b.t, { action: 'APPROVE', submissionId: b.s.id });
    expect([st.status, code(st)]).toEqual([409, 'STALE_SUBMISSION']);
    expect((await prisma.topic.findUnique({ where: { id: b.t.id } })).status).toBe('UNDER_REVIEW');
  });

  it('403 vai trò/phạm vi sai, 409 sai trạng thái, 400 thiếu lý do, 409 version', async () => {
    const { t, s } = await mkUnderReview();
    const body = { action: 'APPROVE', submissionId: s.id };
    for (const who of ['svA', 'svOut', 'lect', 'admin', 'staff2']) expect((await act(who, t, body)).status).toBe(403);
    expect((await act('staff', t, { action: 'REJECT', submissionId: s.id })).status).toBe(400);
    expect(code(await act('staff', t, { ...body, version: 99 }))).toBe('CONCURRENT_UPDATE');
    const adv = await mkTopic(round, 'HAS_ADVISOR');
    expect(code(await act('staff', adv, body))).toBe('INVALID_TRANSITION');
    const draft = await mkTopic(round, 'DRAFT');
    expect((await act('staff', draft, body)).status).toBe(403); // STAFF không xem được Nháp
    expect((await prisma.topic.findUnique({ where: { id: t.id } })).status).toBe('UNDER_REVIEW');
    expect(await prisma.reviewDecision.count({ where: { submissionId: s.id } })).toBe(0);
  });
});

describe('POST similarity-checks body rỗng (MINOR 2 T211)', () => {
  it('từ chối trường thừa, chấp nhận không body', async () => {
    const t = await mkTopic(round, 'DRAFT');
    const url = `/api/topics/${t.id}/similarity-checks`;
    expect((await request(app).post(url).set(as('svA')).send({ x: 1 })).status).toBe(400);
    expect((await request(app).post(url).set(as('svA'))).status).toBe(200);
  });
});
