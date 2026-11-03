// T211 (FR06, FR08, FR25): kiểm tra tương tự qua pg_trgm trên DB test thật.
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
const topicRepo = createTopicRepo(prisma);
const mkApp = (repo) => createApp({ env: testEnv, logger: undefined, authRepo: createAuthRepo(prisma), hasher: fakeHasher, topicRepo: repo });
const app = mkApp(topicRepo);

const U = {};
const tok = {};
const as = (who) => ({ Authorization: `Bearer ${tok[who]}` });
const post = (who, url, a = app) => request(a).post(url).set(as(who)).send({});
const get = (who, url) => request(app).get(url).set(as(who));
const day = 86400000;
let F1, round, oldRound, field;

const CONTENT = {
  title: 'Ứng dụng học sâu nhận diện khuôn mặt điểm danh sinh viên',
  summary: 'Xây dựng hệ thống điểm danh tự động bằng camera trong lớp học, sử dụng mô hình học sâu để nhận diện khuôn mặt sinh viên và ghi nhận chuyên cần vào cơ sở dữ liệu theo thời gian thực.',
  objectives: 'Đạt độ chính xác nhận diện trên 95 phần trăm trong điều kiện ánh sáng lớp học',
  keywords: ['học sâu', 'nhận diện khuôn mặt', 'điểm danh'],
};
let seq = 0;
const mkTopic = async (roundRow, leader, status, content = CONTENT) => {
  seq += 1;
  return prisma.topic.create({
    data: {
      ...content, code: `NCKH-T211-${String(seq).padStart(4, '0')}`, roundId: roundRow.id, facultyId: F1.id, fieldId: field.id, status,
      members: leader ? { create: { userId: U[leader].id, role: 'LEADER' } } : undefined,
    },
  });
};

beforeAll(async () => {
  await resetData(prisma);
  F1 = await prisma.faculty.create({ data: { code: 'CNTT', name: 'Công nghệ thông tin' } });
  field = await prisma.field.create({ data: { code: 'AI', name: 'Trí tuệ nhân tạo' } });
  const mkRound = (name, year, open, close) =>
    prisma.round.create({ data: { facultyId: F1.id, name, academicYear: year, regOpenAt: new Date(Date.now() + open * day), regCloseAt: new Date(Date.now() + close * day), reviewDeadline: new Date(Date.now() + 60 * day), endAt: new Date(Date.now() + 200 * day), config: {} } });
  round = await mkRound('Đợt hiện tại', '2026-2027', -1, 30);
  oldRound = await mkRound('Đợt cũ', '2025-2026', -300, -250);
  const mk = async (key, role) => {
    U[key] = await prisma.user.create({ data: { code: key, email: `${key}@t.vn`, fullName: key, passwordHash: 'x', role, mustChangePassword: false, facultyId: role === 'ADMIN' ? null : F1.id } });
    tok[key] = signAccessToken(U[key], { secret: testEnv.JWT_ACCESS_SECRET, ttlSeconds: 600 });
  };
  await mk('admin', 'ADMIN');
  await mk('staff', 'STAFF');
  await mk('lect', 'LECTURER');
  for (const k of ['svA', 'svB', 'svC', 'svD', 'svE', 'svOut']) await mk(k, 'STUDENT');
  await prisma.staffScope.create({ data: { userId: U.staff.id, facultyId: F1.id } });
});

describe('POST /api/topics/:id/similarity-checks', () => {
  let mine, closedOld, pendingOther, pendingOldRound;
  beforeAll(async () => {
    mine = await mkTopic(round, 'svA', 'DRAFT', { ...CONTENT, keywords: ['học sâu', 'react', 'điểm danh'] });
    closedOld = await mkTopic(oldRound, 'svB', 'CLOSED');
    pendingOther = await mkTopic(round, 'svC', 'UNDER_REVIEW');
    pendingOldRound = await mkTopic(oldRound, 'svD', 'UNDER_REVIEW'); // khác đợt: không thuộc kho
  });

  it('thành viên kiểm: lưu một dòng, level HIGH, hồ sơ chờ bị ẩn với SV, kho đúng phạm vi', async () => {
    const r = await post('svA', `/api/topics/${mine.id}/similarity-checks`);
    expect(r.status).toBe(200);
    const c = r.body.similarityCheck;
    expect(c).toMatchObject({ status: 'OK', level: 'HIGH', justificationRequired: true, isStale: false, corpusSize: 2, algorithmVersion: 'tfidf-bigram-v1+trgm' });
    expect(c).not.toHaveProperty('errorMessage');
    const hidden = c.matches.filter((m) => m.hidden);
    const shown = c.matches.filter((m) => !m.hidden);
    expect(hidden).toHaveLength(1);
    expect(hidden[0]).not.toHaveProperty('title');
    expect(hidden[0]).not.toHaveProperty('code');
    expect(JSON.stringify(c)).not.toContain(pendingOther.code);
    expect(shown).toHaveLength(1);
    expect(shown[0]).toMatchObject({ code: closedOld.code, title: CONTENT.title, academicYear: '2025-2026', field: 'Trí tuệ nhân tạo', status: 'CLOSED', level: 'HIGH', matchedKeywords: ['học sâu', 'điểm danh'] });
    expect(shown[0].titleScore).toBeGreaterThan(0.9);
    const rows = await prisma.similarityCheck.findMany({ where: { topicId: mine.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].matches).toHaveLength(2);
    expect(rows[0].matches.find((m) => m.topicId === pendingOther.id)).toMatchObject({ code: pendingOther.code, title: CONTENT.title, status: 'UNDER_REVIEW' });
    expect(rows[0].matches.some((m) => m.topicId === pendingOldRound.id)).toBe(false);
    expect(await prisma.auditLog.count({ where: { entityType: 'SimilarityCheck', entityId: rows[0].id } })).toBe(1);
    expect((await prisma.topic.findUnique({ where: { id: mine.id } })).status).toBe('DRAFT');
  });

  it('đề tài không liên quan → NONE, không cần giải trình', async () => {
    const t = await mkTopic(round, 'svE', 'DRAFT', { title: 'Website bán sách cũ', summary: 'Sàn thương mại điện tử cho giáo trình', objectives: 'Hoàn thiện mua bán', keywords: ['thương mại'] });
    const c = (await post('svE', `/api/topics/${t.id}/similarity-checks`)).body.similarityCheck;
    expect(c).toMatchObject({ status: 'OK', level: 'NONE', justificationRequired: false });
  });

  it('403 vai trò sai / không phải thành viên; 409 sai trạng thái; 400 hồ sơ rỗng; 404', async () => {
    const url = `/api/topics/${mine.id}/similarity-checks`;
    for (const who of ['admin', 'staff', 'lect']) expect((await post(who, url)).status).toBe(403);
    expect((await post('svOut', url)).status).toBe(403);
    expect((await post('svC', `/api/topics/${pendingOther.id}/similarity-checks`)).status).toBe(409); // UNDER_REVIEW
    const empty = await prisma.topic.create({ data: { code: 'NCKH-T211-EMPTY', roundId: round.id, facultyId: F1.id, status: 'DRAFT', members: { create: { userId: U.svOut.id, role: 'LEADER' } } } });
    const r = await post('svOut', `/api/topics/${empty.id}/similarity-checks`);
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('TOPIC_INCOMPLETE');
    expect(await prisma.similarityCheck.count({ where: { topicId: empty.id } })).toBe(0);
    expect((await post('svA', '/api/topics/khong-co/similarity-checks')).status).toBe(404);
  });

  it('lỗi khi tải kho → 200, status ERROR, level null, không bao giờ NONE; lưu ERROR', async () => {
    const t = await mkTopic(round, 'svD', 'DRAFT');
    const broken = mkApp({ ...topicRepo, loadCorpus: async () => { throw new Error('mất kết nối nội bộ'); } });
    const r = await post('svD', `/api/topics/${t.id}/similarity-checks`, broken);
    expect(r.status).toBe(200);
    expect(r.body.similarityCheck).toMatchObject({ status: 'ERROR', level: null, matches: [], justificationRequired: false, message: 'Chưa kiểm tra được' });
    expect(JSON.stringify(r.body)).not.toContain('mất kết nối');
    const row = await prisma.similarityCheck.findFirst({ where: { topicId: t.id } });
    expect(row).toMatchObject({ status: 'ERROR', level: null });
    const latest = (await get('svD', `/api/topics/${t.id}/similarity-checks/latest`)).body.similarityCheck;
    expect(latest).toMatchObject({ status: 'ERROR', level: null, message: 'Chưa kiểm tra được' });
  });

  it('limiter 10 lần / 15 phút / người dùng', async () => {
    const t = await mkTopic(round, 'svOut', 'DRAFT', { ...CONTENT, title: 'Đề tài khác hẳn về mạng máy tính', summary: 'Thiết kế mạng', objectives: 'Mục tiêu', keywords: ['mạng'] });
    const a = mkApp(topicRepo);
    const codes = [];
    for (let i = 0; i < 11; i += 1) codes.push((await post('svOut', `/api/topics/${t.id}/similarity-checks`, a)).status);
    expect(codes.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(codes[10]).toBe(429);
  });
});

describe('GET /api/topics/:id/similarity-checks/latest', () => {
  let mine;
  beforeAll(async () => {
    await mkTopic(oldRound, 'svB', 'CLOSED');
    await mkTopic(round, 'svC', 'HAS_ADVISOR');
    mine = await mkTopic(round, 'svE', 'NEEDS_REVISION');
  });

  it('chưa kiểm → null; 403 người ngoài', async () => {
    expect((await get('svE', `/api/topics/${mine.id}/similarity-checks/latest`)).body).toEqual({ similarityCheck: null });
    expect((await get('svOut', `/api/topics/${mine.id}/similarity-checks/latest`)).status).toBe(403);
    expect((await get('admin', `/api/topics/${mine.id}/similarity-checks/latest`)).status).toBe(403);
  });

  it('trả kết quả đã lưu theo vai trò; isStale khi nội dung đổi; kết quả cũ không đổi theo đề tài khớp', async () => {
    await post('svE', `/api/topics/${mine.id}/similarity-checks`);
    let c = (await get('svE', `/api/topics/${mine.id}/similarity-checks/latest`)).body.similarityCheck;
    expect(c).toMatchObject({ status: 'OK', isStale: false });
    expect(c.matches.some((m) => m.hidden)).toBe(true);

    // STAFF trong phạm vi: xem hồ sơ NEEDS_REVISION được và thấy đầy đủ hồ sơ chờ
    const sv = (await get('staff', `/api/topics/${mine.id}/similarity-checks/latest`));
    expect(sv.status).toBe(200);
    expect(sv.body.similarityCheck.matches.every((m) => !m.hidden)).toBe(true);
    expect(sv.body.similarityCheck.matches.find((m) => m.status === 'HAS_ADVISOR')).toHaveProperty('topicId');

    // đổi tên đề tài khớp đã đóng: kết quả cũ vẫn hiển thị tên lúc kiểm
    await prisma.topic.updateMany({ where: { status: 'CLOSED' }, data: { title: 'Tên đã đổi sau đó' } });
    c = (await get('svE', `/api/topics/${mine.id}/similarity-checks/latest`)).body.similarityCheck;
    expect(c.matches.find((m) => !m.hidden).title).toBe(CONTENT.title);

    await prisma.topic.update({ where: { id: mine.id }, data: { title: 'Tên của hồ sơ này đã đổi' } });
    c = (await get('svE', `/api/topics/${mine.id}/similarity-checks/latest`)).body.similarityCheck;
    expect(c.isStale).toBe(true);
  });
});
