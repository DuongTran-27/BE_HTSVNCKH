// T704 (NFR04): đo hiệu năng với 2.000 đề tài qua HTTP (Supertest, app thật + Postgres thật). Chạy: npm run perf -w @nckh/api
// Ngưỡng NFR04 (p95, server đã khởi động): danh sách <= 1s, thống kê <= 2s, FR06 <= 3s. Test đỏ = vi phạm ngưỡng/đặc tả.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import os from 'node:os';
import { PrismaClient } from '@prisma/client';
import { STATS_GROUP_BY } from '@nckh/shared';
import { createApp } from '../../src/app.js';
import { createAuthRepo } from '../../src/modules/auth/prismaRepo.js';
import { createTopicRepo } from '../../src/modules/topics/prismaRepo.js';
import { createAccountRepo } from '../../src/modules/accounts/prismaRepo.js';
import { createListRepo } from '../../src/modules/topics/listRepo.js';
import { passwordHasher } from '../../src/lib/password.js';
import { signAccessToken } from '../../src/lib/tokens.js';
import { testEnv } from '../helpers.js';
import { resetData } from '../db.js';

const N_TOPICS = 2000;
const N_CSV = 2000;
const day = 86400000;
const prisma = new PrismaClient();
const topicRepo = createTopicRepo(prisma);
const app = createApp({ env: testEnv, logger: undefined, authRepo: createAuthRepo(prisma), hasher: passwordHasher, topicRepo, accountRepo: createAccountRepo(prisma) });
const auth = (u) => ({ Authorization: `Bearer ${signAccessToken(u, { secret: testEnv.JWT_ACCESS_SECRET, ttlSeconds: 3600 })}` });
const table = [];
const record = (name, ms, extra = {}) => {
  const s = [...ms].sort((a, b) => a - b);
  const pick = (p) => s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)];
  const row = { name, n: s.length, p50: Math.round(pick(0.5)), p95: Math.round(pick(0.95)), max: Math.round(s.at(-1)), ...extra };
  table.push(row);
  return row;
};
const timed = async (fn) => { const t = performance.now(); const r = await fn(); return [performance.now() - t, r]; };
// Mỗi lần gọi một người dùng khác nhau (xoay vòng) để không dính limiter của thống kê (60 / 15 phút / người dùng).
const measure = async (name, users, mk, n = 20) => {
  const ms = [];
  for (let i = 0; i < n; i++) {
    const [t, res] = await timed(() => mk(users[i % users.length]));
    expect(res.status, `${name} lần ${i}: ${JSON.stringify(res.body).slice(0, 200)}`).toBe(200);
    ms.push(t);
  }
  return record(name, ms);
};

const WORDS = 'hệ thống ứng dụng mô hình học máy mạng nơ ron phân loại nhận diện dữ liệu phân tích thuật toán tối ưu tìm kiếm văn bản tiếng Việt ảnh video camera cảm biến thiết bị di động web thương mại điện tử quản lý sinh viên học tập đánh giá dự đoán khuyến nghị bảo mật an toàn thông tin mã hóa blockchain đám mây phân tán song song đồ thị cơ sở dữ liệu truy vấn chatbot ngôn ngữ tự nhiên giọng nói robot tự động hóa giám sát giao thông y tế nông nghiệp giáo dục chuỗi cung ứng kho vận tài chính chứng khoán cảnh báo sớm phát hiện bất thường xe điện năng lượng thông minh đô thị nhà trường thư viện số trò chơi thực tế ảo tăng cường'.split(' ');
let rnd = 12345; // PRNG cố định: dữ liệu giống nhau giữa các lần chạy
const rand = () => ((rnd = (rnd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pickW = (k) => Array.from({ length: k }, () => WORDS[Math.floor(rand() * WORDS.length)]).join(' ');
const chunks = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, (i + 1) * n));
const STATUS_MIX = [['DRAFT', 100], ['WAITING_ADVISOR', 100], ['HAS_ADVISOR', 150], ['UNDER_REVIEW', 150], ['NEEDS_REVISION', 50], ['REJECTED', 100], ['IN_PROGRESS', 500], ['CANCELLED', 50], ['WAITING_CLOSE', 100], ['CLOSED', 700]];

let F1, rounds, staffs, lecturers, leaders, closedRound, topics;

beforeAll(async () => {
  await resetData(prisma);
  F1 = await prisma.faculty.create({ data: { code: 'CNTT', name: 'CNTT' } });
  const major = await prisma.major.create({ data: { facultyId: F1.id, code: 'KTPM', name: 'Kỹ thuật phần mềm' } });
  await prisma.class.create({ data: { majorId: major.id, code: 'DH22KTPM' } });
  const fields = await Promise.all(['AI', 'WEB', 'IOT', 'ATTT', 'DL', 'MOB'].map((c) => prisma.field.create({ data: { code: c, name: `Lĩnh vực ${c}` } })));
  const mkRound = (name, year, regClose) => prisma.round.create({ data: { facultyId: F1.id, name, academicYear: year, regOpenAt: new Date(Date.now() - 90 * day), regCloseAt: regClose, reviewDeadline: new Date(Date.now() + 60 * day), endAt: new Date(Date.now() + 200 * day), config: {} } });
  rounds = [];
  for (const y of ['2022-2023', '2023-2024', '2024-2025', '2025-2026']) rounds.push(await mkRound(`Đợt ${y}`, y, new Date(Date.now() - 30 * day)));
  rounds.push(await mkRound('Đợt 2026-2027', '2026-2027', new Date(Date.now() + 30 * day)));
  closedRound = rounds[3];

  const mkUser = (code, role, facultyId = F1.id) => ({ id: `u_${code}`, code, email: `${code}@t.vn`.toLowerCase(), fullName: `Nguyễn Văn ${code}`, passwordHash: 'x', role, mustChangePassword: false, facultyId });
  const lectRows = Array.from({ length: 60 }, (_, i) => mkUser(`GV${i}`, 'LECTURER'));
  const staffRows = Array.from({ length: 8 }, (_, i) => mkUser(`CB${i}`, 'STAFF'));
  const leaderRows = Array.from({ length: N_TOPICS }, (_, i) => mkUser(`SV${i}`, 'STUDENT'));
  const extraLeaders = Array.from({ length: 40 }, (_, i) => mkUser(`SVK${i}`, 'STUDENT'));
  const memberRows = Array.from({ length: 1200 }, (_, i) => mkUser(`TV${i}`, 'STUDENT'));
  await prisma.user.createMany({ data: [...lectRows, ...staffRows, ...leaderRows, ...extraLeaders, ...memberRows, mkUser('ADM', 'ADMIN', null)] });
  await prisma.staffScope.createMany({ data: staffRows.map((s) => ({ userId: s.id, facultyId: F1.id })) });
  lecturers = lectRows;
  leaders = leaderRows;
  staffs = staffRows.map((s) => ({ ...s, staffFacultyIds: [F1.id] }));

  const statuses = STATUS_MIX.flatMap(([s, n]) => Array(n).fill(s));
  expect(statuses.length).toBe(N_TOPICS);
  topics = statuses.map((status, i) => {
    const started = ['IN_PROGRESS', 'WAITING_CLOSE', 'CLOSED'].includes(status);
    const at = new Date(Date.now() - (i % 400) * day / 4);
    return { id: `t_${i}`, code: `NCKH-2026-${String(i + 1).padStart(4, '0')}`, title: `${pickW(2 + Math.floor(rand() * 3))} ${pickW(3)}`.replace(/^./, (c) => c.toUpperCase()), summary: pickW(70), objectives: pickW(30), keywords: [pickW(1), pickW(2), pickW(1)], status, roundId: (started ? rounds[i % 4] : rounds[4]).id, facultyId: F1.id, fieldId: fields[i % 6].id, createdAt: at, updatedAt: at };
  });
  // Đợt kẹt: hạn đăng ký đã qua, 150 HAS_ADVISOR + 20 WAITING_ADVISOR (MINOR T504)
  for (let k = 0; k < 170; k++) {
    const at = new Date(Date.now() - k * 1000);
    topics.push({ id: `t_stuck_${k}`, code: `STUCK-${String(k).padStart(4, '0')}`, title: `Đề tài kẹt ${pickW(3)}`, summary: pickW(40), objectives: pickW(10), keywords: [pickW(1)], status: k < 150 ? 'HAS_ADVISOR' : 'WAITING_ADVISOR', roundId: closedRound.id, facultyId: F1.id, fieldId: null, createdAt: at, updatedAt: at });
  }
  for (const c of chunks(topics, 500)) await prisma.topic.createMany({ data: c });
  const leaderOf = (i) => (i < N_TOPICS ? leaderRows[i] : extraLeaders[i % 40]);
  await prisma.topicMember.createMany({ data: topics.map((t, i) => ({ topicId: t.id, userId: leaderOf(i).id, role: 'LEADER' })) });
  await prisma.topicMember.createMany({ data: memberRows.map((m, i) => ({ topicId: topics[i].id, userId: m.id, role: 'MEMBER' })) });
  const advised = topics.filter((t) => !['DRAFT', 'WAITING_ADVISOR', 'CANCELLED'].includes(t.status));
  await prisma.advising.createMany({ data: advised.map((t, i) => ({ topicId: t.id, lecturerId: lecturers[i % 60].id })) });
  const submitted = topics.filter((t) => !['DRAFT', 'WAITING_ADVISOR', 'HAS_ADVISOR'].includes(t.status));
  await prisma.submission.createMany({ data: submitted.map((t) => ({ topicId: t.id, seq: 1, createdById: leaderRows[0].id, payload: { title: t.title } })) });
  await prisma.similarityCheck.createMany({ data: submitted.map((t) => ({ topicId: t.id, algorithmVersion: '1', thresholds: {}, contentHash: 'h', corpusSize: 0, level: 'NONE', matches: [], status: 'OK' })) });
  await prisma.resultVersion.createMany({ data: topics.filter((t) => t.status === 'CLOSED').map((t, i) => ({ topicId: t.id, version: 1, result: ['EXCELLENT', 'GOOD', 'PASS', 'FAIL'][i % 4], summary: 's', isCurrent: true, createdById: staffRows[0].id })) });
  await prisma.$executeRawUnsafe('ANALYZE');
}, 600000);

afterAll(async () => {
  const cpu = os.cpus();
  console.log(`\n=== T704 máy: ${cpu[0].model.trim()} x${cpu.length}, RAM ${(os.totalmem() / 2 ** 30).toFixed(1)} GiB, ${os.platform()} ${os.release()}, Node ${process.version}; ${N_TOPICS} đề tài (+170 kẹt)`);
  console.table(table);
  await prisma.$disconnect();
});

describe('NFR04 danh sách đề tài (p95 <= 1000 ms)', () => {
  const get = (qs) => (u) => request(app).get(`/api/topics${qs}`).set(auth(u));
  for (const [label, qs] of [
    ['không q, trang 1', '?pageSize=20'],
    ['không q, pageSize 100', '?pageSize=100'],
    ['lọc status+năm học', '?status=CLOSED&academicYear=2023-2024'],
    ['sort title_asc trang 10', '?sort=title_asc&page=10&pageSize=100'],
    ['q dài "hệ thống thông minh"', `?q=${encodeURIComponent('hệ thống thông minh')}`],
    ['q mã đề tài', '?q=NCKH-2026-0123'],
    ['q ngắn 2 ký tự phổ biến "an"', '?q=an'],
    ['q ngắn 2 ký tự phổ biến "hệ"', `?q=${encodeURIComponent('hệ')}`],
    ['q ngắn 2 ký tự "ng"', '?q=ng'],
    ['q ngắn 2 ký tự "mô"', `?q=${encodeURIComponent('mô')}`],
  ]) {
    it(`TC-NFR04-01 ${label}`, async () => {
      const r = await measure(`list staff ${label}`, staffs, get(qs));
      expect(r.p95).toBeLessThanOrEqual(1000);
    });
  }
  it('TC-NFR04-01 sinh viên và giảng viên (phạm vi nhóm/GVHD)', async () => {
    const a = await measure('list student', leaders.slice(0, 10), get('?pageSize=20'));
    const b = await measure('list lecturer', lecturers.slice(0, 6), get('?pageSize=20'));
    expect(Math.max(a.p95, b.p95)).toBeLessThanOrEqual(1000);
  });
  it('TC-NFR04-01 kho chung /api/repository có q ngắn 2 ký tự', async () => {
    const r = await measure('repository q=an', lecturers.slice(0, 6), (u) => request(app).get('/api/repository?q=an&pageSize=100').set(auth(u)));
    expect(r.p95).toBeLessThanOrEqual(1000);
  });
  it('TC-NFR04-01 q 1 ký tự (sau trim) bị từ chối 400 ở danh sách và kho chung', async () => {
    for (const q of ['a', '%', ' h ']) {
      for (const path of ['/api/topics', '/api/repository']) {
        const res = await request(app).get(`${path}?q=${encodeURIComponent(q)}`).set(auth(staffs[0]));
        expect(res.status, `${path} q="${q}"`).toBe(400);
      }
    }
  });
  it('TC-NFR04-02 searchIds với q ngắn không được trả gần cả bảng (MINOR T213-bao-mat)', async () => {
    const hit = (await createListRepo(prisma).searchIds('a')).length;
    const total = await prisma.topic.count();
    console.log(`searchIds("a"): ${hit}/${total} id`);
    // q 1 ký tự phải bị chặn (trả []), không dựng IN (...) gần toàn bảng
    expect(hit).toBeLessThan(total * 0.5);
  });
  it('TC-NFR04-02 đánh giá searchIds q 2 ký tự phổ biến (chỉ ghi nhận, giới hạn bind 32.767)', async () => {
    const total = await prisma.topic.count();
    for (const q of ['an', 'ng', 'hệ', 'ô']) {
      const [ms, ids] = await timed(() => createListRepo(prisma).searchIds(q));
      console.log(`searchIds("${q}"): ${ids.length}/${total} id (${((100 * ids.length) / total).toFixed(1)} %), ${Math.round(ms)} ms`);
      expect(ids.length).toBeLessThan(32767); // trần tham số bind của Postgres
      expect(ms).toBeLessThanOrEqual(1000);
    }
  });
});

describe('NFR04 thống kê (p95 <= 2000 ms)', () => {
  for (const g of STATS_GROUP_BY) {
    it(`TC-NFR04-03 groupBy=${g} (cán bộ)`, async () => {
      const r = await measure(`stats ${g}`, staffs, (u) => request(app).get(`/api/stats?groupBy=${g}`).set(auth(u)), 16);
      expect(r.p95).toBeLessThanOrEqual(2000);
    });
  }
  it('TC-NFR04-03 export.csv và lọc academicYear', async () => {
    const a = await measure('stats export.csv lecturer', staffs, (u) => request(app).get('/api/stats/export.csv?groupBy=lecturer').set(auth(u)), 16);
    const b = await measure('stats status+năm học', staffs, (u) => request(app).get('/api/stats?groupBy=status&academicYear=2023-2024').set(auth(u)), 16);
    expect(Math.max(a.p95, b.p95)).toBeLessThanOrEqual(2000);
  });
  it('TC-NFR04-03 vai trò giảng viên', async () => {
    const r = await measure('stats lecturer-role', lecturers.slice(0, 6), (u) => request(app).get('/api/stats?groupBy=status').set(auth(u)), 16);
    expect(r.p95).toBeLessThanOrEqual(2000);
  });
});

describe('NFR04 FR06 kiểm tra tương tự (p95 <= 3000 ms)', () => {
  it('TC-NFR04-04 POST /topics/:id/similarity-checks, kho ~1.300 hồ sơ', async () => {
    // Mỗi trưởng nhóm một lần (limiter 10/15 phút/người dùng). Đề tài HAS_ADVISOR trong đợt mở: kho thêm hồ sơ chờ duyệt cùng đợt
    const mine = topics.map((t, i) => ({ t, i })).filter(({ t, i }) => t.status === 'HAS_ADVISOR' && i < N_TOPICS).slice(0, 30);
    const ms = [];
    let corpusSize = 0;
    for (const { t, i } of mine) {
      const [dt, res] = await timed(() => request(app).post(`/api/topics/${t.id}/similarity-checks`).set(auth(leaders[i])).send({}));
      expect(res.status, JSON.stringify(res.body).slice(0, 200)).toBe(200);
      expect(res.body.similarityCheck.status).toBe('OK');
      corpusSize = res.body.similarityCheck.corpusSize;
      ms.push(dt);
    }
    const r = record('FR06 similarity-check', ms, { corpus: corpusSize });
    expect(r.p95).toBeLessThanOrEqual(3000);
  });
});

describe('MINOR T504 widget "đề tài kẹt"', () => {
  it('TC-NFR04-05 stuck=true trả đủ total = 170 và phân trang thấy đủ mọi đề tài kẹt của đợt đã đóng', async () => {
    const get = (page) => request(app).get(`/api/topics?stuck=true&roundId=${closedRound.id}&pageSize=100&page=${page}`).set(auth(staffs[0]));
    const first = await get(1);
    expect(first.status, JSON.stringify(first.body).slice(0, 200)).toBe(200);
    const items = [...first.body.items];
    for (let p = 2; items.length < first.body.total && p <= 10; p++) items.push(...(await get(p)).body.items);
    const truth = await prisma.topic.count({ where: { roundId: closedRound.id, status: { in: ['WAITING_ADVISOR', 'HAS_ADVISOR'] } } });
    const seen = new Set(items.map((t) => t.id)).size;
    console.log(`stuck=true: total ${first.body.total}, thấy ${seen}/${truth}`);
    expect(truth).toBe(170);
    expect(first.body.total).toBe(truth);
    expect(seen).toBe(truth);
    expect(items.every((t) => ['WAITING_ADVISOR', 'HAS_ADVISOR'].includes(t.status) && t.round?.registrationOpen === false)).toBe(true);
  });
});

describe('MINOR 2 T207b xác nhận nhập CSV với Argon2id thật', () => {
  const PROXY_BUDGET_MS = Number(process.env.PERF_PROXY_BUDGET_MS ?? 30000); // giả định bảo thủ, xem reports/T704.md
  const csv = (n) => ['code,email,fullName,role,classCode', ...Array.from({ length: n }, (_, i) => `IMP${i},imp${i}@sv.edu.vn,Trần Thị Ánh ${i},STUDENT,DH22KTPM`)].join('\n');
  it('TC-NFR04-06 preview rồi confirm 2.000 dòng trong ngân sách proxy', async () => {
    const admin = { id: 'u_ADM', code: 'ADM', role: 'ADMIN', email: 'adm@t.vn', fullName: 'A' };
    const post = (path) => request(app).post(`/api/users/import/${path}?facultyId=${F1.id}`).set(auth(admin)).attach('file', Buffer.from(csv(N_CSV)), 'sv.csv');
    const [tp, p] = await timed(() => post('preview'));
    expect(p.status, JSON.stringify(p.body).slice(0, 200)).toBe(200);
    expect(p.body.validCount, JSON.stringify(p.body.errors?.slice(0, 3))).toBe(N_CSV);
    const [tc, c] = await timed(() => post('confirm'));
    expect(c.status, JSON.stringify(c.body).slice(0, 200)).toBeLessThan(300);
    expect(c.body.credentials.length).toBe(N_CSV);
    record('CSV preview 2000', [tp]);
    record('CSV confirm 2000 (Argon2id thật)', [tc]);
    console.log(`CSV confirm ${Math.round(tc)} ms; ngân sách proxy giả định ${PROXY_BUDGET_MS} ms; UV_THREADPOOL_SIZE=${process.env.UV_THREADPOOL_SIZE ?? 4}`);
    expect(tc).toBeLessThanOrEqual(PROXY_BUDGET_MS);
  });
});
