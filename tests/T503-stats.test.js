// T503 (FR14, FR20, FR23, FR25, NFR04): GET /api/stats + /api/stats/export.csv – phạm vi theo vai trò, JSON khớp CSV,
// chống CSV injection, đề tài hủy vẫn được đếm, kết quả theo phiên bản hiện hành của đề tài CLOSED (G27); G27 cho GET /api/topics.
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { parseCsv, STATS_GROUP_BY, STATS_DIMENSION_LABEL } from '@nckh/shared';
import { createApp } from '../src/app.js';
import { createAuthRepo } from '../src/modules/auth/prismaRepo.js';
import { createTopicRepo } from '../src/modules/topics/prismaRepo.js';
import { createStatsService } from '../src/modules/stats/service.js';
import { signAccessToken } from '../src/lib/tokens.js';
import { fakeHasher, testEnv } from './helpers.js';
import { resetData } from './db.js';

const prisma = new PrismaClient();
const topicRepo = createTopicRepo(prisma);
const app = createApp({ env: testEnv, logger: undefined, authRepo: createAuthRepo(prisma), hasher: fakeHasher, topicRepo });
const U = {};
const tok = {};
const T = {};
const day = 86400000;
const call = (who, path, qs) => request(app).get(`/api/stats${path}?${new URLSearchParams(qs)}`).set({ Authorization: `Bearer ${tok[who]}` });
const stats = (who, qs) => call(who, '', qs);
const csv = (who, qs) => call(who, '/export.csv', qs);
const counts = (r) => Object.fromEntries(r.body.rows.map((x) => [x.key, x.count]));
const roles = { sv: 'STUDENT', lectA: 'LECTURER', lectB: 'LECTURER', lectOld: 'LECTURER', lectEvil: 'LECTURER', staff: 'STAFF', staff2: 'STAFF', admin: 'ADMIN' };
let F1, F2, AI, WEB, EVIL, R1, R2, R3;

beforeAll(async () => {
  await resetData(prisma);
  F1 = await prisma.faculty.create({ data: { code: 'CNTT', name: 'CNTT' } });
  F2 = await prisma.faculty.create({ data: { code: 'KT', name: 'KT' } });
  AI = await prisma.field.create({ data: { code: 'AI', name: 'Trí tuệ nhân tạo' } });
  WEB = await prisma.field.create({ data: { code: 'WEB', name: 'Web' } });
  EVIL = await prisma.field.create({ data: { code: 'EV', name: '-2+3' } });
  const round = (facultyId, name, academicYear) => prisma.round.create({ data: { facultyId, name, academicYear, regOpenAt: new Date(Date.now() - day), regCloseAt: new Date(Date.now() + day), reviewDeadline: new Date(Date.now() + 2 * day), endAt: new Date(Date.now() + 90 * day), config: {} } });
  R1 = await round(F1.id, 'Đợt 1', '2026-2027');
  R2 = await round(F1.id, 'Đợt cũ', '2025-2026');
  R3 = await round(F2.id, 'Đợt KT', '2026-2027');
  for (const k of Object.keys(roles)) {
    const fullName = k === 'lectEvil' ? '=HYPERLINK("http://x")' : `Tên ${k}`;
    U[k] = await prisma.user.create({ data: { code: k, email: `${k}@t.vn`, fullName, passwordHash: 'x', role: roles[k], mustChangePassword: false, facultyId: k === 'admin' ? null : k === 'staff2' ? F2.id : F1.id } });
    tok[k] = signAccessToken(U[k], { secret: testEnv.JWT_ACCESS_SECRET, ttlSeconds: 600 });
  }
  await prisma.staffScope.create({ data: { userId: U.staff.id, facultyId: F1.id } });
  await prisma.staffScope.create({ data: { userId: U.staff2.id, facultyId: F2.id } });
  const topic = async (key, status, { field, round = R1, facultyId = F1.id, lect } = {}) => {
    T[key] = await prisma.topic.create({ data: { code: `T503-${key}`, title: key, keywords: [], status, roundId: round.id, facultyId, fieldId: field?.id ?? null } });
    if (lect) await prisma.advising.create({ data: { topicId: T[key].id, lecturerId: U[lect].id } });
  };
  const result = (key, version, r, isCurrent) => prisma.resultVersion.create({ data: { topicId: T[key].id, version, result: r, summary: 's', isCurrent, createdById: U.staff.id } });
  await topic('draft', 'DRAFT', { field: AI, lect: 'lectA' });
  await topic('p1', 'IN_PROGRESS', { field: AI, lect: 'lectA' });
  await topic('p2', 'CLOSED', { field: AI, lect: 'lectA' });
  await result('p2', 1, 'GOOD', false); // FR23: bản cũ, đã bị thay
  await result('p2', 2, 'EXCELLENT', true);
  await topic('p3', 'CLOSED', { field: WEB, round: R2, lect: 'lectB' });
  await result('p3', 1, 'FAIL', true);
  // p4: đã hủy, GVHD cũ lectOld đã được thay bằng lectB (Advising.endAt – cách thay GV hiện có)
  await topic('p4', 'CANCELLED', {});
  await prisma.advising.create({ data: { topicId: T.p4.id, lecturerId: U.lectOld.id, endAt: new Date() } });
  await prisma.advising.create({ data: { topicId: T.p4.id, lecturerId: U.lectB.id } });
  await topic('p5', 'WAITING_CLOSE', { lect: 'lectA' });
  await result('p5', 1, 'PASS', true); // chưa đóng → chưa phải kết quả chính thức (G27)
  await topic('p6', 'REJECTED', { field: AI, round: R2 });
  await topic('p7', 'IN_PROGRESS', { field: EVIL, lect: 'lectEvil' });
  await topic('q1', 'IN_PROGRESS', { field: AI, round: R3, facultyId: F2.id, lect: 'lectB' });
});

describe('quyền (FR14, FR25)', () => {
  it('SV, ADMIN 403 cả JSON lẫn CSV; chưa đăng nhập 401', async () => {
    for (const who of ['sv', 'admin']) {
      expect((await stats(who, { groupBy: 'status' })).status).toBe(403);
      expect((await csv(who, { groupBy: 'status' })).status).toBe(403);
    }
    expect((await request(app).get('/api/stats?groupBy=status')).status).toBe(401);
  });
  it('cán bộ khoa: chỉ khoa được cấp, loại DRAFT; lọc khoa ngoài phạm vi 403', async () => {
    const r = await stats('staff', { groupBy: 'status' });
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(7);
    expect(counts(r)).toEqual({ IN_PROGRESS: 2, CLOSED: 2, CANCELLED: 1, WAITING_CLOSE: 1, REJECTED: 1 });
    expect((await stats('staff', { groupBy: 'status', facultyId: F2.id })).status).toBe(403);
    expect((await csv('staff', { groupBy: 'status', facultyId: F2.id })).status).toBe(403);
    expect((await stats('staff', { groupBy: 'status', facultyId: F1.id })).body.total).toBe(7);
    const k = await stats('staff2', { groupBy: 'status' });
    expect(k.body).toEqual({ groupBy: 'status', total: 1, rows: [{ key: 'IN_PROGRESS', label: 'Đang thực hiện', count: 1 }] });
  });
  it('GV chỉ thấy đề tài mình đang hướng dẫn; GV cũ sau khi thay không còn thấy; lọc GV khác không mở rộng', async () => {
    expect(counts(await stats('lectA', { groupBy: 'status' }))).toEqual({ IN_PROGRESS: 1, CLOSED: 1, WAITING_CLOSE: 1 });
    expect(counts(await stats('lectB', { groupBy: 'round' }))).toEqual({ [R2.id]: 1, [R1.id]: 1, [R3.id]: 1 });
    expect(await stats('lectOld', { groupBy: 'status' }).then((r) => r.body)).toEqual({ groupBy: 'status', total: 0, rows: [] });
    expect((await stats('lectA', { groupBy: 'status', lecturerId: U.lectB.id })).body.total).toBe(0);
    const g = await stats('lectA', { groupBy: 'lecturer' });
    expect(g.body.rows).toEqual([{ key: U.lectA.id, label: 'Tên lectA', count: 3 }]);
  });
  it('GV gửi facultyId → 400', async () => {
    const r = await stats('lectA', { groupBy: 'status', facultyId: F1.id });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('dữ liệu và bộ lọc', () => {
  it('mỗi chiều: total = số đề tài, nhãn tiếng Việt, nhóm rỗng có nhãn riêng', async () => {
    const lect = await stats('staff', { groupBy: 'lecturer' });
    expect(counts(lect)).toEqual({ [U.lectA.id]: 3, [U.lectB.id]: 2, [U.lectEvil.id]: 1, null: 1 });
    expect(lect.body.rows.find((x) => x.key === null).label).toBe('Chưa có giảng viên hướng dẫn');
    expect(counts(lect)[U.lectOld.id]).toBeUndefined();
    const f = await stats('staff', { groupBy: 'field' });
    expect(counts(f)).toEqual({ [AI.id]: 3, [WEB.id]: 1, [EVIL.id]: 1, null: 2 });
    expect(f.body.rows.find((x) => x.key === null).label).toBe('Chưa chọn lĩnh vực');
    expect(counts(await stats('staff', { groupBy: 'academicYear' }))).toEqual({ '2026-2027': 5, '2025-2026': 2 });
    const rd = await stats('staff', { groupBy: 'round' });
    expect(rd.body.rows).toEqual([{ key: R1.id, label: 'Đợt 1', count: 5 }, { key: R2.id, label: 'Đợt cũ', count: 2 }]);
    for (const g of STATS_GROUP_BY) {
      const r = await stats('staff', { groupBy: g });
      expect(r.body.total).toBe(7);
      const sorted = [...r.body.rows].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'vi'));
      expect(r.body.rows).toEqual(sorted);
    }
  });
  it('FR20: đề tài hủy vẫn có trong thống kê', async () => {
    const r = await stats('staff', { groupBy: 'status', status: 'CANCELLED' });
    expect(r.body.rows).toEqual([{ key: 'CANCELLED', label: 'Đã hủy', count: 1 }]);
  });
  it('FR23 + G27: kết quả = phiên bản hiện hành của đề tài CLOSED', async () => {
    const r = await stats('staff', { groupBy: 'result' });
    expect(counts(r)).toEqual({ EXCELLENT: 1, FAIL: 1, null: 5 });
    expect(r.body.rows.find((x) => x.key === null).label).toBe('Chưa có kết quả chính thức');
    expect(r.body.rows.find((x) => x.key === 'EXCELLENT').label).toBe('Xuất sắc');
    expect((await stats('staff', { groupBy: 'status', result: 'GOOD' })).body.total).toBe(0); // bản cũ
    expect((await stats('staff', { groupBy: 'status', result: 'PASS' })).body.total).toBe(0); // chưa đóng
    expect(counts(await stats('staff', { groupBy: 'field', result: 'EXCELLENT' }))).toEqual({ [AI.id]: 1 });
  });
  it('lọc roundId, academicYear, fieldId, lecturerId, status kết hợp', async () => {
    expect((await stats('staff', { groupBy: 'status', roundId: R2.id })).body.total).toBe(2);
    expect((await stats('staff', { groupBy: 'status', academicYear: '2025-2026' })).body.total).toBe(2);
    expect((await stats('staff', { groupBy: 'status', fieldId: AI.id })).body.total).toBe(3);
    expect(counts(await stats('staff', { groupBy: 'field', lecturerId: U.lectA.id, status: 'IN_PROGRESS' }))).toEqual({ [AI.id]: 1 });
  });
  it('query sai → 400: thiếu/lạ groupBy, status DRAFT, khóa lặp', async () => {
    expect((await stats('staff', {})).status).toBe(400);
    expect((await stats('staff', { groupBy: 'facultyId' })).status).toBe(400);
    expect((await stats('staff', { groupBy: 'status', status: 'DRAFT' })).status).toBe(400);
    const dup = await request(app).get(`/api/stats?groupBy=status&roundId=${R1.id}&roundId=${R2.id}`).set({ Authorization: `Bearer ${tok.staff}` });
    expect(dup.status).toBe(400);
    expect((await csv('staff', { groupBy: 'x' })).status).toBe(400);
  });
});

describe('CSV (FR14: cùng số, BOM, chống injection)', () => {
  it('mọi chiều, nhiều bộ lọc, 2 vai trò: dòng CSV khớp rows JSON', async () => {
    const cases = [];
    for (const g of STATS_GROUP_BY) cases.push(['staff', { groupBy: g }], ['lectB', { groupBy: g }]);
    cases.push(['staff', { groupBy: 'field', roundId: R1.id, status: 'IN_PROGRESS' }], ['staff', { groupBy: 'lecturer', result: 'EXCELLENT' }]);
    for (const [who, qs] of cases) {
      const j = await stats(who, qs);
      const c = await csv(who, qs);
      expect(c.status).toBe(200);
      expect(c.text.startsWith('﻿')).toBe(true);
      const [head, ...body] = parseCsv(c.text.slice(1));
      expect(head).toEqual([STATS_DIMENSION_LABEL[qs.groupBy], 'Số đề tài']);
      const unescape = (s) => (/^'[=+\-@\t\r]/.test(s) ? s.slice(1) : s);
      expect(body.map(([label, n]) => ({ label: unescape(label), count: Number(n) }))).toEqual(j.body.rows.map(({ label, count }) => ({ label, count })));
    }
  });
  it('header tải về, UTF-8, tên file theo ngày VN', async () => {
    const c = await csv('staff', { groupBy: 'academicYear' });
    expect(c.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(c.headers['cache-control']).toBe('no-store');
    expect(c.headers['content-disposition']).toMatch(/^attachment; filename="thong-ke-academicYear-\d{8}\.csv"$/);
    expect(Buffer.from(c.text, 'utf8').subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
  });
  it('ô bắt đầu bằng = hoặc - được thoát bằng dấu nháy', async () => {
    const l = await csv('staff', { groupBy: 'lecturer' });
    expect(l.text).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(l.text).not.toMatch(/(^|[\n,])=HYPERLINK/);
    const f = await csv('staff', { groupBy: 'field' });
    expect(f.text).toContain("\r\n'-2+3,1");
  });
});

describe('G27 cho GET /api/topics', () => {
  it('bộ lọc result và item.result chỉ tính đề tài CLOSED', async () => {
    const get = (qs) => request(app).get(`/api/topics?${qs}`).set({ Authorization: `Bearer ${tok.staff}` });
    expect((await get('result=PASS')).body.total).toBe(0);
    expect((await get('result=GOOD')).body.total).toBe(0);
    const ex = await get('result=EXCELLENT');
    expect(ex.body.items.map((i) => [i.code, i.result])).toEqual([['T503-p2', 'EXCELLENT']]);
    const p5 = (await get('status=WAITING_CLOSE')).body.items[0];
    expect([p5.code, p5.result]).toEqual(['T503-p5', null]);
  });
});

describe('NFR04: ≤ 2 giây với 2.000 đề tài', () => {
  it('mọi chiều dưới 2 s', async () => {
    const statuses = ['IN_PROGRESS', 'CLOSED', 'CANCELLED', 'UNDER_REVIEW'];
    await prisma.topic.createMany({ data: Array.from({ length: 2000 }, (_, i) => ({ code: `T503-N${i}`, title: `N${i}`, keywords: [], status: statuses[i % 4], roundId: i % 2 ? R1.id : R2.id, facultyId: F1.id, fieldId: i % 3 ? AI.id : WEB.id })) });
    const svc = createStatsService({ repo: topicRepo });
    const staff = { id: U.staff.id, role: 'STAFF', staffFacultyIds: [F1.id] };
    for (const g of STATS_GROUP_BY) {
      const t0 = performance.now();
      const r = await svc.computeStats(staff, { groupBy: g });
      expect(performance.now() - t0).toBeLessThan(2000);
      expect(r.total).toBe(2007);
    }
  });
});
