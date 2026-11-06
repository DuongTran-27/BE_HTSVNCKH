// T505 (FR14, M4): số trên API thống kê khớp CSV với cùng bộ lọc. Độc lập với T503: dữ liệu ngẫu nhiên (seed cố định),
// "đáp án" tính bằng JS từ DB (không dùng SQL của sản phẩm), tổ hợp bộ lọc nhiều chiều, ô CSV nguy hiểm, và số liệu sau
// các sự kiện đổi dữ liệu (nhập/sửa kết quả, đề nghị đóng, xác nhận đóng, hủy qua API đề nghị + duyệt).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { parseCsv, STATS_GROUP_BY } from '@nckh/shared';
import { createApp } from '../src/app.js';
import { createAuthRepo } from '../src/modules/auth/prismaRepo.js';
import { createTopicRepo } from '../src/modules/topics/prismaRepo.js';
import { signAccessToken } from '../src/lib/tokens.js';
import { fakeHasher, testEnv } from './helpers.js';
import { prisma, S, U, tok, seedBase, mkRound, mkTopic, act, post, at } from './t214-kit.js';

// PRNG cố định để test lặp lại được
const rng = ((a) => () => {
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
})(20261106);
const pick = (xs) => xs[Math.floor(rng() * xs.length)];
const NASTY = ['=1+1', '+SUM(A1)', '@cmd', '-2+3', '\tTab đầu', 'Trí tuệ, "nhân tạo"', 'Lập trình\nweb', 'Đề án Ơ Ư Đ ă â ê ô', '=HYPERLINK("http://x","y")'];
const STATUSES = ['WAITING_ADVISOR', 'HAS_ADVISOR', 'UNDER_REVIEW', 'NEEDS_REVISION', 'IN_PROGRESS', 'WAITING_CLOSE', 'CLOSED', 'REJECTED', 'CANCELLED'];
const RESULTS = ['EXCELLENT', 'GOOD', 'PASS', 'FAIL'];
let fields;
let rounds;
let lecs;
// limiter 60/30 lần mỗi 15 phút nằm trong từng app, nên mỗi tổ hợp dùng app mới
const freshApp = () => createApp({ env: testEnv, logger: undefined, authRepo: createAuthRepo(prisma), hasher: fakeHasher, topicRepo: createTopicRepo(prisma) });
const bearer = (who) => ({ Authorization: `Bearer ${tok[who]}` });

beforeAll(async () => {
  await seedBase({ students: 4 });
  fields = [];
  for (const [i, name] of NASTY.slice(0, 5).entries()) fields.push(await prisma.field.create({ data: { code: `F${i}`, name } }));
  rounds = [S.round, await mkRound(S.F1.id, NASTY[8], {}), await mkRound(S.F1.id, 'Đợt Đ', {})];
  await prisma.round.update({ where: { id: rounds[2].id }, data: { academicYear: '2025-2026' } });
  rounds.push(await prisma.round.create({ data: { facultyId: S.F2.id, name: 'Đợt khoa khác', academicYear: '2026-2027', regOpenAt: at(-1), regCloseAt: at(30), reviewDeadline: at(60), endAt: at(200), config: {} } }));
  lecs = [];
  for (const [i, name] of ['=cmd|calc', 'Nguyễn Văn Ơ', '+1', 'Trần Thị Ê'].entries()) {
    lecs.push(await prisma.user.create({ data: { code: `L505${i}`, email: `l505${i}@t.vn`, fullName: name, passwordHash: 'x', role: 'LECTURER', mustChangePassword: false, facultyId: S.F1.id } }));
  }
  tok.l505 = signAccessToken(lecs[1], { secret: testEnv.JWT_ACCESS_SECRET, ttlSeconds: 600 });
  for (let i = 0; i < 160; i++) {
    const round = pick(rounds);
    const status = rng() < 0.08 ? 'DRAFT' : pick(STATUSES);
    const t = await prisma.topic.create({ data: { code: `T505-${i}`, title: `Đề tài ${i}`, keywords: [], status, roundId: round.id, facultyId: round.facultyId, fieldId: rng() < 0.2 ? null : pick(fields).id } });
    if (!['DRAFT', 'WAITING_ADVISOR'].includes(status) && rng() < 0.85) {
      if (rng() < 0.3) await prisma.advising.create({ data: { topicId: t.id, lecturerId: pick(lecs).id, endAt: new Date() } }); // GV cũ đã được thay
      await prisma.advising.create({ data: { topicId: t.id, lecturerId: pick(lecs).id } });
    }
    const versions = rng() < 0.7 ? 1 + Math.floor(rng() * 3) : 0; // kể cả đề tài chưa đóng (G27)
    for (let v = 1; v <= versions; v++) await prisma.resultVersion.create({ data: { topicId: t.id, version: v, result: pick(RESULTS), summary: 's', isCurrent: v === versions, createdById: U.staff1.id } });
  }
}, 120000);
afterAll(() => prisma.$disconnect());

// Đáp án độc lập: đọc thô DB rồi gom bằng JS
async function oracle(scope, f, groupBy) {
  const all = await prisma.topic.findMany({ include: { round: true, advisings: { where: { endAt: null } }, results: { where: { isCurrent: true } } } });
  const rows = all.filter((t) => t.status !== 'DRAFT').map((t) => ({ t, lecturerId: t.advisings[0]?.lecturerId ?? null, result: t.status === 'CLOSED' ? (t.results[0]?.result ?? null) : null }));
  const hit = rows.filter(({ t, lecturerId, result }) => (scope.facultyId ? t.facultyId === scope.facultyId : lecturerId === scope.lecturerId)
    && (!f.roundId || t.roundId === f.roundId) && (!f.academicYear || t.round.academicYear === f.academicYear) && (!f.fieldId || t.fieldId === f.fieldId)
    && (!f.lecturerId || lecturerId === f.lecturerId) && (!f.status || t.status === f.status) && (!f.result || result === f.result));
  const key = { status: (r) => r.t.status, round: (r) => r.t.roundId, academicYear: (r) => r.t.round.academicYear, field: (r) => r.t.fieldId, lecturer: (r) => r.lecturerId, result: (r) => r.result }[groupBy];
  const m = new Map();
  for (const r of hit) m.set(key(r), (m.get(key(r)) ?? 0) + 1);
  return { total: hit.length, map: m };
}

const unescape = (s) => (/^'[=+\-@\t\r]/.test(s) ? s.slice(1) : s);
// So JSON, CSV và đáp án; trả về tổng
async function check(app, who, scope, f, groupBy) {
  const qs = new URLSearchParams({ groupBy, ...f }).toString();
  const j = await request(app).get(`/api/stats?${qs}`).set(bearer(who));
  const c = await request(app).get(`/api/stats/export.csv?${qs}`).set(bearer(who));
  const ctx = JSON.stringify({ who, groupBy, f });
  expect(j.status, ctx).toBe(200);
  expect(c.status, ctx).toBe(200);
  expect(c.text.charCodeAt(0), ctx).toBe(0xfeff);
  const [, ...body] = parseCsv(c.text.slice(1));
  // Không ô nhãn nào bắt đầu bằng ký tự công thức sau khi parse (đã được thoát bằng dấu nháy)
  for (const [label] of body) expect(label, ctx).not.toMatch(/^[=+\-@\t\r]/);
  expect(body.length, ctx).toBe(j.body.rows.length);
  expect(body.map(([l, n]) => [unescape(l), Number(n)]), ctx).toEqual(j.body.rows.map((r) => [r.label, r.count]));
  const sumJson = j.body.rows.reduce((s, r) => s + r.count, 0);
  const sumCsv = body.reduce((s, [, n]) => s + Number(n), 0);
  expect([sumJson, sumCsv], ctx).toEqual([j.body.total, j.body.total]);
  const want = await oracle(scope, f, groupBy);
  expect(j.body.total, ctx).toBe(want.total);
  expect(new Map(j.body.rows.map((r) => [r.key, r.count])), ctx).toEqual(want.map);
  return j.body.total;
}

describe('TC-FR14 JSON = CSV = dữ liệu thật (property-style, seed cố định)', () => {
  it('TC-FR14-P01 STAFF: 30 tổ hợp bộ lọc ngẫu nhiên x 6 chiều, ô CSV nguy hiểm được thoát', async () => {
    const scope = { facultyId: S.F1.id };
    let nonEmpty = 0;
    for (let i = 0; i < 30; i++) {
      const app = freshApp();
      const f = {};
      if (rng() < 0.4) f.roundId = pick(rounds.slice(0, 3)).id;
      if (rng() < 0.3) f.academicYear = pick(['2026-2027', '2025-2026', '2024-2025']);
      if (rng() < 0.4) f.fieldId = pick(fields).id;
      if (rng() < 0.4) f.lecturerId = pick(lecs).id;
      if (rng() < 0.5) f.status = pick(STATUSES);
      if (rng() < 0.3) f.result = pick(RESULTS);
      for (const g of STATS_GROUP_BY) nonEmpty += (await check(app, 'staff1', scope, f, g)) > 0 ? 1 : 0;
    }
    expect(nonEmpty).toBeGreaterThan(30); // chống test rỗng: không phải mọi tổ hợp đều ra 0
  }, 180000);

  it('TC-FR14-P02 GV: phạm vi chỉ đề tài đang hướng dẫn; JSON = CSV = đáp án với bộ lọc ngẫu nhiên', async () => {
    for (let i = 0; i < 10; i++) {
      const f = {};
      if (rng() < 0.4) f.roundId = pick(rounds.slice(0, 3)).id;
      if (rng() < 0.4) f.fieldId = pick(fields).id;
      if (rng() < 0.4) f.status = pick(STATUSES);
      if (rng() < 0.3) f.result = pick(RESULTS);
      const app = freshApp();
      for (const g of STATS_GROUP_BY) await check(app, 'l505', { lecturerId: lecs[1].id }, f, g);
    }
  }, 120000);

  it('TC-FR14-P03 bộ lọc chỉ thu hẹp: các đợt của khoa cộng lại bằng tổng; đợt khoa khác ra 0', async () => {
    const app = freshApp();
    const get = (q) => request(app).get(`/api/stats?${new URLSearchParams(q)}`).set(bearer('staff1'));
    const base = (await get({ groupBy: 'status' })).body.total;
    let parts = 0;
    for (const r of rounds.slice(0, 3)) parts += (await get({ groupBy: 'status', roundId: r.id })).body.total;
    expect(parts).toBe(base);
    expect((await get({ groupBy: 'status', roundId: rounds[3].id })).body.total).toBe(0);
  });
});

describe('TC-FR14 số liệu sau sự kiện đổi dữ liệu', () => {
  it('TC-FR14-E01 nhập/sửa kết quả, đề nghị đóng, xác nhận đóng, hủy: JSON = CSV = đáp án ở mỗi bước và số đổi đúng', async () => {
    const scope = { facultyId: S.F1.id };
    const body = async (q) => (await request(freshApp()).get(`/api/stats?${new URLSearchParams(q)}`).set(bearer('staff1'))).body;
    const all = async () => {
      const app = freshApp();
      for (const g of ['status', 'result']) await check(app, 'staff1', scope, {}, g);
    };
    const n = async (q) => (await body({ groupBy: 'status', ...q })).total;

    const t = await mkTopic('s1', S.round, { status: 'IN_PROGRESS' });
    await prisma.advising.create({ data: { topicId: t.id, lecturerId: U.lecA.id } });
    await prisma.milestone.create({ data: { topicId: t.id, order: 1, name: 'M', output: 'x', dueAt: at(5), evaluation: 'PASSED', createdById: U.lecA.id } });
    await all();
    const exBefore = await n({ result: 'EXCELLENT' });
    const goodBefore = await n({ result: 'GOOD' });

    const r1 = await post('lecA', `/api/topics/${t.id}/results`, { result: 'GOOD', summary: 'Hoàn thành tốt các mục tiêu đề ra.', expectedVersion: 0 });
    expect(r1.status, JSON.stringify(r1.body)).toBe(201);
    expect(await n({ result: 'GOOD' })).toBe(goodBefore); // G27: chưa CLOSED thì chưa tính
    const r2 = await post('lecA', `/api/topics/${t.id}/results`, { result: 'EXCELLENT', summary: 'Sửa lại: kết quả xuất sắc hơn dự kiến.', expectedVersion: 1 });
    expect(r2.status, JSON.stringify(r2.body)).toBe(201);
    await all();
    const waitBefore = await n({ status: 'WAITING_CLOSE' });
    expect((await act('lecA', t, { action: 'REQUEST_CLOSE', version: 0 })).status).toBe(200);
    expect(await n({ status: 'WAITING_CLOSE' })).toBe(waitBefore + 1);
    expect(await n({ result: 'EXCELLENT' })).toBe(exBefore);
    await all();
    expect((await act('staff1', t, { action: 'CONFIRM_CLOSE', version: 1 })).status).toBe(200);
    expect(await n({ result: 'EXCELLENT' })).toBe(exBefore + 1); // bản hiện hành EXCELLENT, không phải GOOD cũ
    expect(await n({ result: 'GOOD' })).toBe(goodBefore);
    expect(await n({ status: 'WAITING_CLOSE' })).toBe(waitBefore);
    await all();

    // FR20: hủy vẫn được đếm, chuyển nhóm – qua API đề nghị + duyệt hủy (T602, API_GD6 §4.4 ca 6)
    const c = await mkTopic('s2', S.round, { status: 'IN_PROGRESS' });
    const inProg = await n({ status: 'IN_PROGRESS' });
    const total = await n({});
    const cr = await post('s2', `/api/topics/${c.id}/change-requests`, { type: 'CANCEL', reason: 'Nhóm không thể tiếp tục đề tài' });
    expect(cr.status, JSON.stringify(cr.body)).toBe(201);
    const ap = await post('staff1', `/api/change-requests/${cr.body.changeRequest.id}/approve`, { reason: 'Đồng ý hủy theo đề nghị của nhóm' });
    expect([ap.status, ap.body.topic?.status], JSON.stringify(ap.body)).toEqual([200, 'CANCELLED']);
    expect(await n({ status: 'IN_PROGRESS' })).toBe(inProg - 1);
    expect(await n({})).toBe(total);
    await all();
  }, 120000);

  it('TC-FR14-E02 đề tài khoa khác không lọt vào số của cán bộ khoa này', async () => {
    const other = await prisma.topic.count({ where: { facultyId: S.F2.id, status: { not: 'DRAFT' } } });
    expect(other).toBeGreaterThan(0);
    const total = (await request(freshApp()).get('/api/stats?groupBy=status').set(bearer('staff1'))).body.total;
    expect(total).toBe((await prisma.topic.count({ where: { status: { not: 'DRAFT' } } })) - other);
  });
});
