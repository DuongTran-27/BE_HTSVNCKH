// T703 bước B: các MINOR bảo mật còn lại (T703a-reviewer, T609/T603/T403/T503-bao-mat). Mỗi mục một describe.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { escapeCell } from '@nckh/shared';
import { prisma, S, U, seedBase, mkTopic } from './t214-kit.js';
import { createApp } from '../src/app.js';
import { createMemoryStorage } from '../src/lib/storage.js';
import { createTopicRepo } from '../src/modules/topics/prismaRepo.js';
import { createTopicService } from '../src/modules/topics/service.js';
import { createGroupService } from '../src/modules/topics/groupService.js';
import { createReviewService } from '../src/modules/topics/reviewService.js';
import { createDocumentService } from '../src/modules/execution/documentService.js';
import { createStatsService } from '../src/modules/stats/service.js';
import { contentHash } from '../src/modules/similarity/engine.js';
import { runCleanup } from '../scripts/cleanup-orphans.js';
import { createMemoryAuthRepo, fakeHasher, testEnv } from './helpers.js';

const stub = new Proxy({}, { get: () => async () => null });
const build = (env = testEnv, hasher = fakeHasher) =>
  createApp({ env, logger: undefined, authRepo: createMemoryAuthRepo(), hasher, catalogRepo: stub, roundRepo: stub, accountRepo: stub, topicRepo: stub, storage: stub });

describe('1. login: hash giả lỗi lần đầu không bị cache vĩnh viễn (MINOR T703a-reviewer)', () => {
  it('lần đầu băm lỗi → 500; lần sau băm lại, trả 401 chung', async () => {
    let fail = true;
    const hasher = { ...fakeHasher, hash: vi.fn(async (p) => { if (fail) { fail = false; throw new Error('argon down'); } return fakeHasher.hash(p); }) };
    const app = build(testEnv, hasher);
    const login = () => request(app).post('/api/auth/login').send({ identifier: 'khong-ton-tai', password: 'Matkhau123' });
    expect((await login()).status).toBe(500);
    expect((await login()).status).toBe(401);
    expect((await login()).status).toBe(401);
    expect(hasher.hash).toHaveBeenCalledTimes(2); // thành công thì vẫn cache
  });
});

describe('2c. cron: hạn mức riêng /reminders và /similarity-rechecks (m4 T609-bao-mat)', () => {
  it('đốt hết hạn mức /reminders không làm /similarity-rechecks 429', async () => {
    const app = build({ ...testEnv, CRON_SECRET: 'cron-secret-t703b-0123456789abcdef' });
    const cron = (path) => request(app).post(`/api/cron/${path}`).set('Authorization', 'Bearer sai');
    for (let i = 0; i < 10; i++) expect((await cron('reminders')).status).toBe(401);
    expect((await cron('reminders')).status).toBe(429);
    expect((await cron('similarity-rechecks')).status).toBe(401);
  });
});

describe('5a. escapeCell: khoảng trắng đầu ô + công thức, ký tự toàn chiều rộng (MINOR 1 T503-bao-mat)', () => {
  it.each([' =1+1', '  +1', '　@SUM(A1)', '＝1+1', '＋1', '－1', '＠x', ' ＝x', '\t=x'])('%j được thoát', (v) => {
    expect(escapeCell(v)).toBe(`'${v}`);
  });
  it('ô bình thường giữ nguyên', () => {
    for (const v of [' abc', 'a =b', 'Nguyễn Văn A', '12']) expect(escapeCell(v)).toBe(v);
  });
});

describe('5b. thống kê: total tính trước khi cắt MAX_ROWS (MINOR 2 T503-bao-mat, API_GD45 §9)', () => {
  it('1.001 nhóm: rows 1.000 dòng, total = tổng thật 1.001 + 5', async () => {
    const raw = Array.from({ length: 1001 }, (_, i) => ({ key: `k${i}`, name: `N${String(i).padStart(4, '0')}`, count: i === 0 ? 6 : 1 }));
    const svc = createStatsService({ repo: { groupTopics: async () => raw } });
    const r = await svc.computeStats({ role: 'STAFF', staffFacultyIds: ['f1'] }, { groupBy: 'field' });
    expect([r.rows.length, r.total]).toEqual([1000, 1006]);
  });
});

describe('4. cleanup-orphans: các nhánh ngưỡng (MINOR 1–2 T403-bao-mat-v2)', () => {
  const old = new Date(Date.now() - 2 * 86400000).toISOString();
  const setup = (total, orphans) => {
    const s = createMemoryStorage();
    const docs = [];
    for (let i = 0; i < total; i++) {
      s.files.set(`f/${i}`, { bytes: 1, created_at: old });
      if (i >= orphans) docs.push({ id: `d${i}`, publicId: `f/${i}`, status: 'READY', uploadedAt: new Date() });
    }
    const db = { document: { findMany: async () => docs, count: async ({ where }) => docs.filter((d) => d.publicId === where.publicId).length }, auditLog: { create: async () => {} } };
    return { s, db };
  };
  it('dưới ngưỡng (1/20 file): --apply không cần --max-delete vẫn xóa', async () => {
    const { s, db } = setup(20, 1);
    const r = await runCleanup({ prisma: db, storage: s, folder: 'f', apply: true, log: () => {} });
    expect([r.deleted, s.files.size]).toEqual([['f/0'], 19]);
  });
  it('> 10 file dù < 10% (11/200): từ chối, không xóa gì, in danh sách mồ côi trước khi báo lỗi', async () => {
    const { s, db } = setup(200, 11);
    const log = vi.fn();
    await expect(runCleanup({ prisma: db, storage: s, folder: 'f', apply: true, log })).rejects.toThrow(/TỪ CHỐI xóa 11\/200/);
    expect(s.files.size).toBe(200);
    const printed = log.mock.calls.map((c) => c[0]).join('\n');
    for (let i = 0; i < 11; i++) expect(printed).toContain(`f/${i}`);
  });
});

describe('DB', () => {
  let n = 0;
  const mkUser = async (role) => {
    const key = `${role.toLowerCase()}-t703b-${++n}`;
    U[key] = await prisma.user.create({ data: { code: key, email: `${key}@t.vn`, fullName: `Tên ${key}`, passwordHash: 'x', role, mustChangePassword: false, facultyId: S.F1.id } });
    return key;
  };
  const mkSub = (t, who, payload, extra = {}) => prisma.submission.create({ data: { topicId: t.id, seq: 1, createdById: U[who].id, payload, ...extra } });
  const mkCheck = (topicId, hash, status = 'OK') => prisma.similarityCheck.create({ data: { topicId, algorithmVersion: 'x', thresholds: {}, contentHash: hash, corpusSize: 0, matches: [], status, level: status === 'OK' ? 'NONE' : null, createdAt: new Date(Date.now() + 60e3) } });
  // Giống recheck.js: nội dung đem băm lấy từ payload, keywords thiếu = []
  const jsHash = (p) => contentHash({ title: p.title, summary: p.summary, objectives: p.objectives, keywords: p.keywords ?? [] });

  beforeAll(() => seedBase({ students: 1 }), 60000);
  afterAll(() => prisma.$disconnect());

  describe('2a. submission_guard so contentHash với payload (m1 T609-bao-mat)', () => {
    it('hash SQL trùng từng byte với contentHash() JS, kể cả ký tự đặc biệt, null, thiếu khóa', async () => {
      const payloads = [
        { title: 'Đề tài "trích" \\ a/b\n\t\r\u0001\u001f 😀  ', summary: 'Tóm tắt, có: dấu', objectives: '', keywords: ['k "1"', 'học máy', ''] },
        { title: 'Chỉ tên', summary: null, objectives: null, keywords: [] },
        { title: 'Thiếu khóa' },
        { title: 'U+2028    \b\f \u007f', summary: 'x\u0085y', keywords: ['\b', '\f\u007f'] },
      ];
      for (const p of payloads) {
        const [{ h }] = await prisma.$queryRaw`SELECT submission_payload_hash(${JSON.stringify(p)}::jsonb) AS h`;
        expect(h).toBe(jsHash(p));
      }
    });
    it('dòng OK kiểm nội dung khác payload (SV "kiểm tra trước" sau khi sửa) bị từ chối; đúng nội dung thì được', async () => {
      const leader = await mkUser('STUDENT');
      const t = await mkTopic(leader, S.round, { status: 'UNDER_REVIEW' });
      const p = { title: 'Bản đã gửi', summary: 's', objectives: 'o', keywords: ['k'] };
      const s = await mkSub(t, leader, p, { similarityCheckId: (await mkCheck(t.id, 'e', 'ERROR')).id });
      const set = (c) => prisma.$executeRaw`UPDATE "Submission" SET "similarityCheckId" = ${c.id} WHERE id = ${s.id}`;
      await expect(set(await mkCheck(t.id, jsHash({ ...p, title: 'Bản đã sửa' })))).rejects.toThrow(/Chỉ được thay kết quả FR06 lỗi/);
      expect(await set(await mkCheck(t.id, jsHash(p)))).toBe(1);
    });
  });

  describe('2b. job recheck bỏ đề tài đã kết thúc (m3 T609-bao-mat)', () => {
    it('lần gửi chưa kiểm của đề tài CLOSED/CANCELLED/REJECTED không được lấy; đề tài còn xử lý thì có', async () => {
      const leader = await mkUser('STUDENT');
      const ids = {};
      for (const st of ['CLOSED', 'CANCELLED', 'REJECTED', 'UNDER_REVIEW']) {
        const t = await mkTopic(leader, S.round, { status: st });
        ids[st] = (await mkSub(t, leader, { title: t.title })).id;
      }
      const got = (await createTopicRepo(prisma).findUncheckedSubmissions(1000)).map((x) => x.id);
      expect(got).toContain(ids.UNDER_REVIEW);
      for (const st of ['CLOSED', 'CANCELLED', 'REJECTED']) expect(got).not.toContain(ids[st]);
    });
  });

  describe('3a. isLatest không lộ bản mới cho người đã rời (m2 T603-bao-mat)', () => {
    it('người đã rời thấy bản trong khoảng là bản mới nhất họ được xem; thành viên hiện hành thấy đúng chuỗi', async () => {
      const leader = await mkUser('STUDENT');
      const m = await mkUser('STUDENT');
      const t = await mkTopic(leader, S.round, { status: 'IN_PROGRESS' });
      const ago = (s) => new Date(Date.now() - s * 1000);
      await prisma.topicMember.create({ data: { topicId: t.id, userId: U[m].id, role: 'MEMBER', joinedAt: ago(100), leftAt: ago(10) } });
      const mkDoc = (v, uploadedAt) => prisma.document.create({ data: { topicId: t.id, stage: 'PROPOSAL', kind: 'FILE', fileName: `v${v}.pdf`, publicId: `t703b/${t.id}/v${v}.pdf`, version: v, status: 'READY', uploadedById: U[leader].id, uploadedAt } });
      const v1 = await mkDoc(1, ago(50));
      const v2 = await mkDoc(2, ago(1));
      const svc = createDocumentService({ repo: createTopicRepo(prisma), storage: createMemoryStorage(), folder: 'f' });
      const former = await svc.list(U[m], t.id, {});
      expect(former.items.map((d) => [d.id, d.isLatest])).toEqual([[v1.id, true]]);
      expect((await svc.list(U[m], t.id, { latestOnly: 'true' })).items.map((d) => d.id)).toEqual([v1.id]);
      const cur = await svc.list(U[leader], t.id, {});
      expect(Object.fromEntries(cur.items.map((d) => [d.id, d.isLatest]))).toEqual({ [v1.id]: false, [v2.id]: true });
    });
  });

  describe('3b. joinedAt và Submission.createdAt cùng nguồn giờ now() của app với leftAt (m3 T603-bao-mat)', () => {
    const FIXED = new Date(Date.now() - 3600e3); // trong khoảng đăng ký của đợt
    const now = () => FIXED;
    const repo = createTopicRepo(prisma);
    const topics = createTopicService({ repo, now });

    it('tạo đề tài (trưởng nhóm) và nhận lời mời (thành viên): joinedAt = now()', async () => {
      const leader = await mkUser('STUDENT');
      const r = await topics.create(U[leader], { title: 'Đề tài thử giờ app', summary: 'một hai ba bốn', objectives: 'mục tiêu', keywords: ['k'], fieldId: S.field.id, roundId: S.round.id }, null);
      const id = r.topic?.id ?? r.id;
      expect((await prisma.topicMember.findFirst({ where: { topicId: id, userId: U[leader].id } })).joinedAt).toEqual(FIXED);
      const m = await mkUser('STUDENT');
      const inv = await prisma.invitation.create({ data: { topicId: id, inviteeId: U[m].id } });
      await createGroupService({ repo, now, getTopic: topics.get }).accept(U[m], inv.id, null);
      expect((await prisma.topicMember.findFirst({ where: { topicId: id, userId: U[m].id } })).joinedAt).toEqual(FIXED);
    });

    it('gửi xét duyệt: Submission.createdAt = now()', async () => {
      const leader = await mkUser('STUDENT');
      const m = await mkUser('STUDENT');
      const lec = await mkUser('LECTURER');
      const t = await mkTopic(leader, S.round, { status: 'HAS_ADVISOR' });
      await prisma.topicMember.create({ data: { topicId: t.id, userId: U[m].id, role: 'MEMBER' } });
      await prisma.advising.create({ data: { topicId: t.id, lecturerId: U[lec].id } });
      const r = await createReviewService({ repo, now, getTopic: topics.get }).act(U[leader], t.id, { action: 'SUBMIT_FOR_REVIEW', version: 0 }, null);
      expect(r.submission.createdAt).toBe(FIXED.toISOString());
      expect((await prisma.submission.findUnique({ where: { id: r.submission.id } })).createdAt).toEqual(FIXED);
    });
  });
});
