// T213b (FR08, §9.2, G3): GET /api/repository – chỉ CLOSED đạt, chỉ trường FR08, cần đăng nhập, ADMIN được xem.
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
const tok = {};
const get = (who, path = '') => request(app).get(`/api/repository${path}`).set({ Authorization: `Bearer ${tok[who]}` });
let field, round;

beforeAll(async () => {
  await resetData(prisma);
  const F = await prisma.faculty.create({ data: { code: 'CNTT', name: 'CNTT' } });
  field = await prisma.field.create({ data: { code: 'AI', name: 'Trí tuệ nhân tạo' } });
  const day = 86400000;
  round = await prisma.round.create({ data: { facultyId: F.id, name: 'Đợt', academicYear: '2026-2027', regOpenAt: new Date(Date.now() - day), regCloseAt: new Date(Date.now() + day), reviewDeadline: new Date(Date.now() + 2 * day), endAt: new Date(Date.now() + 9 * day), config: {} } });
  const users = {};
  for (const [k, role] of Object.entries({ sv: 'STUDENT', gv: 'LECTURER', staff: 'STAFF', admin: 'ADMIN' })) {
    users[k] = await prisma.user.create({ data: { code: k, email: `${k}@t.vn`, fullName: k, passwordHash: 'x', role, mustChangePassword: false, facultyId: k === 'admin' ? null : F.id } });
    tok[k] = signAccessToken(users[k], { secret: testEnv.JWT_ACCESS_SECRET, ttlSeconds: 600 });
  }
  const mk = async (code, status, result, extra = {}) => {
    const t = await prisma.topic.create({ data: { code, title: `Đề tài ${code}`, summary: 'Tóm tắt', objectives: 'O', keywords: ['học máy'], status, roundId: round.id, facultyId: F.id, ...extra, members: { create: [{ userId: users.sv.id, role: 'LEADER' }] } } });
    await prisma.advising.create({ data: { topicId: t.id, lecturerId: users.gv.id } });
    if (result) await prisma.resultVersion.create({ data: { topicId: t.id, version: 1, result, summary: 'NX riêng', isCurrent: true, createdById: users.staff.id } });
  };
  await mk('R-good', 'CLOSED', 'GOOD', { fieldId: field.id, summary: 'ă'.repeat(400) });
  await mk('R-pass', 'CLOSED', 'PASS');
  await mk('R-fail', 'CLOSED', 'FAIL');
  await mk('R-prog', 'IN_PROGRESS');
  await mk('R-noresult', 'CLOSED');
});

describe('GET /api/repository', () => {
  it('chưa đăng nhập 401; mọi vai trò đã đăng nhập kể cả ADMIN 200', async () => {
    expect((await request(app).get('/api/repository')).status).toBe(401);
    for (const who of ['sv', 'gv', 'staff', 'admin']) expect((await get(who)).status, who).toBe(200);
  });
  it('chỉ đề tài CLOSED đạt; không FAIL, không đang thực hiện, không thiếu kết quả', async () => {
    const r = await get('admin');
    expect(r.body.items.map((i) => i.code).sort()).toEqual(['R-good', 'R-pass']);
    expect(r.body.total).toBe(2);
  });
  it('item chỉ đúng trường FR08; excerpt ≤ 300 ký tự', async () => {
    const r = await get('sv');
    const good = r.body.items.find((i) => i.code === 'R-good');
    expect(Object.keys(good).sort()).toEqual(['academicYear', 'code', 'field', 'result', 'summaryExcerpt', 'title']);
    expect(good).toMatchObject({ field: { name: 'Trí tuệ nhân tạo' }, academicYear: '2026-2027', result: 'GOOD' });
    expect([...good.summaryExcerpt]).toHaveLength(300);
  });
  it('lọc result, fieldId, academicYear, q không dấu; tham số sai 400', async () => {
    expect((await get('sv', '?result=PASS')).body.items.map((i) => i.code)).toEqual(['R-pass']);
    expect((await get('sv', '?result=FAIL')).status).toBe(400);
    expect((await get('sv', `?fieldId=${field.id}`)).body.items.map((i) => i.code)).toEqual(['R-good']);
    expect((await get('sv', '?academicYear=2020-2021')).body.total).toBe(0);
    expect((await get('sv', '?q=' + encodeURIComponent('de tai R-pass'))).body.items.map((i) => i.code)).toEqual(['R-pass']);
    expect((await get('sv', '?pageSize=1&page=2')).body).toMatchObject({ total: 2, page: 2, pageSize: 1 });
    expect((await get('sv', '?pageSize=1&page=2')).body.items).toHaveLength(1);
  });
  it('chi tiết theo mã: đủ summary, không lộ trường riêng; ngoài kho 404', async () => {
    const r = await get('admin', '/R-good');
    expect(r.status).toBe(200);
    expect(Object.keys(r.body.topic).sort()).toEqual(['academicYear', 'code', 'field', 'result', 'summary', 'title']);
    expect(r.body.topic.summary).toHaveLength(400);
    for (const c of ['R-fail', 'R-prog', 'R-noresult', 'khong-co', 'a%20b']) expect((await get('sv', `/${c}`)).status, c).toBe(404);
  });
});
