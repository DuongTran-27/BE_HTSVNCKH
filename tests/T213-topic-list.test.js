// T213 (FR08): GET /api/topics – phạm vi theo vai trò, lọc, tìm không dấu, phân trang server; MINOR T212b.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { createListRepo } from '../src/modules/topics/listRepo.js';
import { createApp } from '../src/app.js';
import { createAuthRepo } from '../src/modules/auth/prismaRepo.js';
import { createTopicRepo } from '../src/modules/topics/prismaRepo.js';
import { createReviewService } from '../src/modules/topics/reviewService.js';
import { signAccessToken } from '../src/lib/tokens.js';
import { topicListQuerySchema } from '@nckh/shared';
import { fakeHasher, testEnv } from './helpers.js';
import { resetData } from './db.js';

const prisma = new PrismaClient();
const app = createApp({ env: testEnv, logger: undefined, authRepo: createAuthRepo(prisma), hasher: fakeHasher, topicRepo: createTopicRepo(prisma) });
const U = {};
const tok = {};
const get = (who, qs = '') => request(app).get(`/api/topics${qs}`).set({ Authorization: `Bearer ${tok[who]}` });
const day = 86400000;
const T = {};
let F1, F2, field1, field2, round1, round2;
const roles = { svA: 'STUDENT', svB: 'STUDENT', lect: 'LECTURER', lect2: 'LECTURER', staff: 'STAFF', staff2: 'STAFF', admin: 'ADMIN' };

beforeAll(async () => {
  await resetData(prisma);
  F1 = await prisma.faculty.create({ data: { code: 'CNTT', name: 'CNTT' } });
  F2 = await prisma.faculty.create({ data: { code: 'KT', name: 'KT' } });
  field1 = await prisma.field.create({ data: { code: 'AI', name: 'Trí tuệ nhân tạo' } });
  field2 = await prisma.field.create({ data: { code: 'WEB', name: 'Web' } });
  const mk = (facultyId, academicYear) => prisma.round.create({ data: { facultyId, name: `Đợt ${academicYear}`, academicYear, regOpenAt: new Date(Date.now() - day), regCloseAt: new Date(Date.now() + 30 * day), reviewDeadline: new Date(Date.now() + 60 * day), endAt: new Date(Date.now() + 200 * day), config: {} } });
  round1 = await mk(F1.id, '2026-2027');
  round2 = await mk(F1.id, '2025-2026');
  for (const k of Object.keys(roles)) {
    U[k] = await prisma.user.create({ data: { code: k, email: `${k}@t.vn`, fullName: `Tên ${k}`, passwordHash: 'x', role: roles[k], mustChangePassword: false, facultyId: k === 'admin' ? null : k === 'staff2' ? F2.id : F1.id } });
    tok[k] = signAccessToken(U[k], { secret: testEnv.JWT_ACCESS_SECRET, ttlSeconds: 600 });
  }
  await prisma.staffScope.create({ data: { userId: U.staff.id, facultyId: F1.id } });
  await prisma.staffScope.create({ data: { userId: U.staff2.id, facultyId: F2.id } });
  const topic = (key, data, leader) => prisma.topic.create({ data: { summary: 'S', objectives: 'O', keywords: [], roundId: round1.id, facultyId: F1.id, ...data, code: `T213-${key}`, members: { create: [{ userId: U[leader].id, role: 'LEADER' }] } } }).then((t) => { T[key] = t; });
  await topic('draftA', { title: 'Nháp của A', status: 'DRAFT' }, 'svA');
  await topic('reviewA', { title: 'Nhận diện khuôn mặt', keywords: ['thị giác máy tính'], status: 'UNDER_REVIEW', fieldId: field1.id }, 'svA');
  await topic('reviewB', { title: 'Hệ thống 100% đặt phòng_họp', status: 'UNDER_REVIEW', fieldId: field2.id, roundId: round2.id }, 'svB');
  await topic('closedB', { title: 'Đề tài cũ', status: 'CLOSED' }, 'svB');
  await topic('otherFaculty', { title: 'Khoa khác', status: 'UNDER_REVIEW', facultyId: F2.id }, 'svB');
  await prisma.advising.create({ data: { topicId: T.reviewA.id, lecturerId: U.lect.id } });
  await prisma.advising.create({ data: { topicId: T.closedB.id, lecturerId: U.lect2.id } });
  await prisma.submission.create({ data: { topicId: T.reviewA.id, seq: 1, createdById: U.svA.id, payload: { title: 'x' } } });
  await prisma.resultVersion.create({ data: { topicId: T.closedB.id, version: 1, result: 'GOOD', summary: 's', isCurrent: true, createdById: U.staff.id } });
  for (let i = 0; i < 25; i++) await prisma.topic.create({ data: { title: `Bulk ${String(i).padStart(2, '0')}`, summary: 'S', objectives: 'O', keywords: [], code: `T213-B${String(i).padStart(2, '0')}`, roundId: round1.id, facultyId: F1.id, status: 'HAS_ADVISOR' } });
});

const codes = (r) => r.body.items.map((i) => i.code).sort();

describe('quyền và phạm vi (FR25)', () => {
  it('ADMIN 403, chưa đăng nhập 401', async () => {
    expect((await get('admin')).status).toBe(403);
    expect((await request(app).get('/api/topics')).status).toBe(401);
  });
  it('SV chỉ thấy đề tài của nhóm mình, không thấy hồ sơ chờ của nhóm khác', async () => {
    const a = await get('svA');
    expect(codes(a)).toEqual(['T213-draftA', 'T213-reviewA']);
    const b = await get('svB');
    expect(codes(b)).toEqual(['T213-closedB', 'T213-otherFaculty', 'T213-reviewB']);
    expect(a.body.total).toBe(2);
  });
  it('lọc không mở rộng phạm vi: SV A lọc status UNDER_REVIEW không thấy hồ sơ của B', async () => {
    expect(codes(await get('svA', '?status=UNDER_REVIEW'))).toEqual(['T213-reviewA']);
  });
  it('SV rời nhóm (leftAt) không còn thấy', async () => {
    const m = await prisma.topicMember.findFirst({ where: { topicId: T.draftA.id } });
    await prisma.topicMember.update({ where: { id: m.id }, data: { leftAt: new Date() } });
    expect(codes(await get('svA'))).toEqual(['T213-reviewA']);
    await prisma.topicMember.update({ where: { id: m.id }, data: { leftAt: null } });
  });
  it('GV chỉ thấy đề tài mình hướng dẫn hiện hành; đề nghị chưa nhận không hiện', async () => {
    expect(codes(await get('lect'))).toEqual(['T213-reviewA']);
    expect(codes(await get('lect2'))).toEqual(['T213-closedB']);
    await prisma.advisorRequest.create({ data: { topicId: T.reviewB.id, lecturerId: U.lect.id, status: 'PENDING' } });
    expect(codes(await get('lect'))).toEqual(['T213-reviewA']);
    await prisma.advisorRequest.deleteMany({ where: { lecturerId: U.lect.id } });
  });
  it('STAFF thấy đề tài khoa mình trừ DRAFT; khoa khác chỉ thấy khoa mình', async () => {
    const s = await get('staff');
    expect(s.body.items.some((i) => i.code === 'T213-draftA')).toBe(false);
    expect(s.body.items.some((i) => i.code === 'T213-otherFaculty')).toBe(false);
    expect(s.body.total).toBe(3 + 25);
    expect(codes(await get('staff2'))).toEqual(['T213-otherFaculty']);
    expect((await get('staff', '?status=DRAFT')).body.total).toBe(0);
  });
});

describe('bộ lọc và item', () => {
  it('item đúng trường FR08', async () => {
    const r = await get('lect');
    expect(r.body.items[0]).toMatchObject({
      code: 'T213-reviewA', status: 'UNDER_REVIEW', version: 0, memberCount: 1,
      round: { id: round1.id, academicYear: '2026-2027', registrationOpen: true },
      field: { name: 'Trí tuệ nhân tạo' }, advisor: { id: U.lect.id }, leader: { code: 'svA', fullName: 'Tên svA' },
      latestSubmission: { seq: 1 }, result: null, latestSimilarityLevel: null,
    });
    expect(r.body.items[0].summary).toBeUndefined();
  });
  it('lọc roundId, academicYear, fieldId, lecturerId, result', async () => {
    expect(codes(await get('staff', `?roundId=${round2.id}`))).toEqual(['T213-reviewB']);
    expect(codes(await get('staff', '?academicYear=2025-2026'))).toEqual(['T213-reviewB']);
    expect(codes(await get('staff', `?fieldId=${field1.id}`))).toEqual(['T213-reviewA']);
    expect(codes(await get('staff', `?lecturerId=${U.lect.id}`))).toEqual(['T213-reviewA']);
    const r = await get('staff', '?result=GOOD');
    expect(codes(r)).toEqual(['T213-closedB']);
    expect(r.body.items[0].result).toBe('GOOD');
    expect((await get('lect', `?lecturerId=${U.lect2.id}`)).body.total).toBe(0); // GV khác chỉ thu hẹp, không mở rộng
  });
  it('hàng chờ xét duyệt = status UNDER_REVIEW', async () => {
    expect(codes(await get('staff', '?status=UNDER_REVIEW'))).toEqual(['T213-reviewA', 'T213-reviewB']);
  });
});

describe('tìm kiếm q', () => {
  it('không dấu, không phân biệt hoa thường', async () => {
    expect(codes(await get('staff', '?q=nhan%20dien%20khuon'))).toEqual(['T213-reviewA']);
    expect(codes(await get('staff', '?q=NHẬN DIỆN'))).toEqual(['T213-reviewA']);
  });
  it('khớp mã và từ khóa', async () => {
    expect(codes(await get('staff', '?q=t213-closedb'))).toEqual(['T213-closedB']);
    expect(codes(await get('staff', `?q=${encodeURIComponent('thi giac may')}`))).toEqual(['T213-reviewA']);
  });
  it('% và _ được escape, không thành ký tự đại diện', async () => {
    expect(codes(await get('staff', `?q=${encodeURIComponent('100%')}`))).toEqual(['T213-reviewB']);
    expect(codes(await get('staff', `?q=${encodeURIComponent('phòng_họp')}`))).toEqual(['T213-reviewB']);
    expect((await get('staff', `?q=${encodeURIComponent('%')}`)).status).toBe(400); // BUG-011: q 1 ký tự bị từ chối
    expect((await get('staff', `?q=${encodeURIComponent('đặt_phòng')}`)).body.total).toBe(0);
  });
  it('q vẫn bị giới hạn bởi phạm vi', async () => {
    expect((await get('svA', '?q=Khoa%20khac')).body.total).toBe(0);
  });
  it('index trigram tồn tại (NFR04)', async () => {
    const r = await prisma.$queryRaw`SELECT indexname FROM pg_indexes WHERE indexname = 'topic_title_trgm_idx'`;
    expect(r).toHaveLength(1);
  });
});

describe('phân trang và sắp xếp ở server', () => {
  it('pageSize/page/total', async () => {
    const p1 = await get('staff', '?pageSize=10&page=1&sort=code_asc');
    const p3 = await get('staff', '?pageSize=10&page=3&sort=code_asc');
    expect(p1.body).toMatchObject({ page: 1, pageSize: 10, total: 28 });
    expect(p1.body.items).toHaveLength(10);
    expect(p3.body.items).toHaveLength(8);
    expect(p1.body.items[0].code).toBe('T213-B00');
    expect(p3.body.items.at(-1).code).toBe('T213-reviewB');
  });
  it('sort title_asc và updatedAt_asc/desc đối nhau', async () => {
    const t = await get('staff', '?sort=title_asc&pageSize=100');
    expect(t.body.items[0].title).toBe('Bulk 00');
    const asc = (await get('staff', '?sort=updatedAt_asc&pageSize=100')).body.items.map((i) => i.updatedAt);
    const desc = (await get('staff', '?sort=updatedAt_desc&pageSize=100')).body.items.map((i) => i.updatedAt);
    expect([...asc].sort()).toEqual(asc);
    expect([...desc].sort().reverse()).toEqual(desc);
  });
  it('tham số sai 400: pageSize quá lớn, status/sort lạ, năm học sai, q quá dài', async () => {
    for (const qs of ['?pageSize=101', '?pageSize=0', '?page=0', '?status=XYZ', '?sort=hack', '?academicYear=2026', `?q=${'a'.repeat(201)}`]) {
      const r = await get('staff', qs);
      expect(r.status, qs).toBe(400);
      expect(r.body.error.code).toBe('VALIDATION_ERROR');
    }
  });
  it('schema: chuỗi rỗng coi như không lọc, mặc định đúng', () => {
    expect(topicListQuerySchema.parse({ status: '', q: '' })).toMatchObject({ sort: 'updatedAt_desc', page: 1, pageSize: 20 });
  });
});

describe('MINOR T212b', () => {
  const sub = (who, id) => request(app).get(`/api/topics/${id}/status-history`).set({ Authorization: `Bearer ${tok[who]}` });
  it('status-history của DRAFT: STAFF 403, thành viên 200', async () => {
    expect((await sub('staff', T.draftA.id)).status).toBe(403);
    expect((await sub('svA', T.draftA.id)).status).toBe(200);
    expect((await sub('staff', T.reviewA.id)).status).toBe(200);
  });
  it('readAfter log logger.warn khi nuốt lỗi', async () => {
    const t = await prisma.topic.create({ data: { title: 'Q', summary: 'S', objectives: 'O', keywords: ['a'], code: 'T213-W', roundId: round1.id, facultyId: F1.id, status: 'UNDER_REVIEW', members: { create: [{ userId: U.svA.id, role: 'LEADER' }] } } });
    const s = await prisma.submission.create({ data: { topicId: t.id, seq: 1, createdById: U.svA.id, payload: { title: 'Q' } } });
    const logger = { warn: vi.fn() };
    const svc = createReviewService({ repo: createTopicRepo(prisma), logger, getTopic: async () => { throw new Error('đọc lỗi'); } });
    const r = await svc.act({ ...U.staff, staffFacultyIds: [F1.id] }, t.id, { action: 'APPROVE', version: t.version, submissionId: s.id }, '127.0.0.1');
    expect(r.topic.status).toBe('IN_PROGRESS');
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
});

describe('BUG-011 q tối thiểu 2 ký tự', () => {
  it('q 1 ký tự (sau trim) -> 400 tiếng Việt; q 2 ký tự -> 200; repo không trả IN toàn bảng', async () => {
    for (const q of ['a', '%20a%20']) {
      const r = await get('staff', `?q=${q}`);
      expect(r.status).toBe(400);
      expect(JSON.stringify(r.body)).toContain('tối thiểu 2 ký tự');
    }
    expect((await get('staff', '?q=T213')).status).toBe(200);
    expect(await createListRepo(prisma).searchIds('a')).toEqual([]);
  });
});

describe('BUG-012 stuck=true (FR16.5)', () => {
  let closed;
  beforeAll(async () => {
    closed = await prisma.round.create({ data: { facultyId: F1.id, name: 'Đợt đã đóng', academicYear: '2020-2021', regOpenAt: new Date(Date.now() - 20 * day), regCloseAt: new Date(Date.now() - day), reviewDeadline: new Date(Date.now() + 60 * day), endAt: new Date(Date.now() + 200 * day), config: {} } });
    const mk = (i, status, roundId) => prisma.topic.create({ data: { title: `Kẹt ${i}`, summary: 'S', objectives: 'O', keywords: [], code: `T213-K${i}`, roundId, facultyId: F1.id, status } });
    for (let i = 0; i < 3; i++) await mk(i, 'WAITING_ADVISOR', closed.id);
    for (let i = 3; i < 6; i++) await mk(i, 'HAS_ADVISOR', closed.id);
    await mk(6, 'UNDER_REVIEW', closed.id); // trạng thái khác: không kẹt
  });
  it('chỉ đề tài WAITING_ADVISOR/HAS_ADVISOR của đợt đã đóng; total và phân trang đúng', async () => {
    const all = await get('staff', '?stuck=true&pageSize=4&page=2');
    expect(all.status).toBe(200);
    expect(all.body.total).toBe(6);
    expect(all.body.items).toHaveLength(2);
    const p1 = await get('staff', '?stuck=true&pageSize=4');
    expect([...p1.body.items, ...all.body.items].every((t) => ['WAITING_ADVISOR', 'HAS_ADVISOR'].includes(t.status) && t.round.registrationOpen === false)).toBe(true);
  });
  it('stuck=false không lọc; kết hợp status; vẫn bị giới hạn bởi phạm vi; ADMIN 403; giá trị lạ 400', async () => {
    expect((await get('staff', '?stuck=false&roundId=' + closed.id)).body.total).toBe(7);
    expect((await get('staff', '?stuck=true&status=HAS_ADVISOR')).body.total).toBe(3);
    expect((await get('staff2', '?stuck=true')).body.total).toBe(0);
    expect((await get('admin', '?stuck=true')).status).toBe(403);
    expect((await get('staff', '?stuck=yes')).status).toBe(400);
  });
  it('TC-FR16-B7 LECTURER/STUDENT với stuck=true: 200, chỉ đề tài kẹt trong phạm vi của mình, không lộ của người khác', async () => {
    const mk = (key, status, leader) => prisma.topic.create({ data: { title: `Kẹt ${key}`, summary: 'S', objectives: 'O', keywords: [], code: `T213-B7${key}`, roundId: closed.id, facultyId: F1.id, status, members: { create: [{ userId: U[leader].id, role: 'LEADER' }] } } });
    const made = [await mk('1', 'HAS_ADVISOR', 'svA'), await mk('2', 'WAITING_ADVISOR', 'svB'), await mk('3', 'UNDER_REVIEW', 'svA')];
    try {
      await prisma.advising.create({ data: { topicId: made[0].id, lecturerId: U.lect.id } });
      await prisma.advising.create({ data: { topicId: made[2].id, lecturerId: U.lect.id } });
      for (const [who, want] of [['svA', ['T213-B71']], ['svB', ['T213-B72']], ['lect', ['T213-B71']], ['lect2', []]]) {
        const r = await get(who, '?stuck=true');
        expect(r.status, who).toBe(200);
        expect(codes(r), who).toEqual(want);
        expect(r.body.total, who).toBe(want.length);
      }
    } finally {
      const ids = made.map((t) => t.id);
      await prisma.advising.deleteMany({ where: { topicId: { in: ids } } });
      await prisma.topicMember.deleteMany({ where: { topicId: { in: ids } } });
      await prisma.topic.deleteMany({ where: { id: { in: ids } } });
    }
  });
});
