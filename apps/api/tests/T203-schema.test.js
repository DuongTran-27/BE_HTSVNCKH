// T203 (FR04, FR06, FR15, FR17 – API_GD2 §11b): index/trigger SQL thô còn đủ sau mọi migration, và dữ liệu mẫu
// hợp lệ theo bảng chuyển trạng thái. Chạy trên DB test đã `db:test:reset` (migrate reset).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { DEFAULT_ROUND_CONFIG, TOPIC_STATUS, countWords, findTransition } from '@nckh/shared';
import { resetData } from './db.js';
import { seed } from '../prisma/seed.js';
import { ALGORITHM_VERSION } from '../src/modules/similarity/engine.js';
import { PENDING_SAME_ROUND_STATUSES, PUBLIC_CORPUS_STATUSES } from '../src/modules/similarity/service.js';

const prismaDir = new URL('../prisma/', import.meta.url);
const prisma = new PrismaClient();
const apiDir = fileURLToPath(new URL('..', import.meta.url));
const PRISMA_CLI = fileURLToPath(new URL('../../../node_modules/prisma/build/index.js', import.meta.url));
const GUARD_DB = 'nckh_seedguard';

beforeAll(async () => {
  await resetData(prisma); // trước mọi lần chèn dữ liệu (reviews/T201-kiem-thu-v3.md)
  await seed(prisma);
}, 60000);
afterAll(() => prisma.$disconnect());

describe('§11b – index và trigger viết bằng SQL thô', () => {
  it('đủ 5 partial unique index (có WHERE) và topic_title_trgm_idx (GIN trigram)', async () => {
    const rows = await prisma.$queryRaw`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public'`;
    const def = Object.fromEntries(rows.map((r) => [r.indexname, r.indexdef]));
    const partial = {
      topic_one_leader: ['"TopicMember"', "role = 'LEADER'", '"leftAt" IS NULL'],
      topic_member_current: ['"TopicMember"', '"leftAt" IS NULL'],
      invitation_one_pending: ['"Invitation"', "status = 'PENDING'"],
      advisor_request_one_pending: ['"AdvisorRequest"', "status = 'PENDING'"],
      advising_one_current: ['"Advising"', '"endAt" IS NULL'],
    };
    for (const [name, parts] of Object.entries(partial)) {
      expect(def[name], `thiếu index ${name}`).toMatch(/^CREATE UNIQUE INDEX .* WHERE /);
      for (const p of parts) expect(def[name]).toContain(p);
    }
    expect(def.topic_title_trgm_idx).toMatch(/USING gin .*immutable_unaccent\(title\).*gin_trgm_ops/);
  });

  it('đủ 5 trigger chỉ-thêm BEFORE UPDATE OR DELETE gọi forbid_mutation()', async () => {
    const rows = await prisma.$queryRaw`
      SELECT t.tgname, c.relname, p.proname, t.tgtype FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_proc p ON p.oid = t.tgfoid WHERE NOT t.tgisinternal`;
    const byName = Object.fromEntries(rows.map((r) => [r.tgname, r]));
    const expected = {
      audit_log_append_only: 'AuditLog',
      status_history_append_only: 'StatusHistory',
      submission_immutable: 'Submission',
      review_decision_immutable: 'ReviewDecision',
      similarity_check_immutable: 'SimilarityCheck',
    };
    for (const [name, table] of Object.entries(expected)) {
      expect(byName[name], `thiếu trigger ${name}`).toMatchObject({ relname: table, proname: 'forbid_mutation' });
      // tgtype: 1 = ROW, 2 = BEFORE, 8 = DELETE, 16 = UPDATE
      expect(byName[name].tgtype & 27).toBe(27);
    }
  });

  it('after_init.sql trùng khớp migration search_and_security', () => {
    const dir = readdirSync(new URL('migrations/', prismaDir)).find((d) => d.endsWith('_search_and_security'));
    const norm = (u) => readFileSync(u, 'utf8').replace(/\r\n/g, '\n');
    expect(norm(new URL(`migrations/${dir}/migration.sql`, prismaDir))).toBe(
      norm(new URL('sql/after_init.sql', prismaDir)),
    );
  });

  it('mọi cột thời gian là timestamptz (quy tắc 8)', async () => {
    const rows = await prisma.$queryRaw`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND data_type = 'timestamp without time zone' AND table_name <> '_prisma_migrations'`;
    expect(rows).toEqual([]);
  });
});

describe('§11b – bất biến được DB giữ', () => {
  const immutable = /chỉ cho phép thêm mới/;

  it('Submission, ReviewDecision, SimilarityCheck từ chối UPDATE và DELETE (FR17)', async () => {
    const decision = await prisma.reviewDecision.findFirstOrThrow({ include: { submission: true } });
    const { id: sid, similarityCheckId } = decision.submission;
    await expect(prisma.submission.update({ where: { id: sid }, data: { seq: 99 } })).rejects.toThrow(immutable);
    await expect(prisma.submission.delete({ where: { id: sid } })).rejects.toThrow(immutable);
    await expect(prisma.reviewDecision.update({ where: { id: decision.id }, data: { reason: 'x' } })).rejects.toThrow(
      immutable,
    );
    await expect(prisma.reviewDecision.delete({ where: { id: decision.id } })).rejects.toThrow(immutable);
    await expect(
      prisma.similarityCheck.update({ where: { id: similarityCheckId }, data: { level: 'HIGH' } }),
    ).rejects.toThrow(immutable);
    await expect(prisma.similarityCheck.delete({ where: { id: similarityCheckId } })).rejects.toThrow(immutable);
  });

  it('partial unique: trưởng nhóm thứ hai, thành viên trùng, đề nghị GVHD PENDING thứ hai, GVHD hiện hành thứ hai → P2002', async () => {
    const topic = await prisma.topic.findFirstOrThrow({
      where: { status: 'WAITING_ADVISOR' },
      include: { members: true, advisorRequests: { where: { status: 'PENDING' } } },
    });
    // Mọi SV mẫu đã ở một nhóm; index ở DB không xét vai trò nên dùng tài khoản GV làm người ngoài nhóm.
    const outsider = await prisma.user.findFirstOrThrow({ where: { role: 'LECTURER' } });
    const p2002 = { code: 'P2002' };
    await expect(
      prisma.topicMember.create({ data: { topicId: topic.id, userId: outsider.id, role: 'LEADER' } }),
    ).rejects.toMatchObject(p2002);
    await expect(
      prisma.topicMember.create({ data: { topicId: topic.id, userId: topic.members[0].userId, role: 'MEMBER' } }),
    ).rejects.toMatchObject(p2002);
    await expect(
      prisma.invitation.createMany({
        data: [
          { topicId: topic.id, inviteeId: outsider.id },
          { topicId: topic.id, inviteeId: outsider.id },
        ],
      }),
    ).rejects.toMatchObject(p2002);
    await expect(
      prisma.advisorRequest.create({ data: { topicId: topic.id, lecturerId: topic.advisorRequests[0].lecturerId } }),
    ).rejects.toMatchObject(p2002);
    const advised = await prisma.advising.findFirstOrThrow({ where: { endAt: null } });
    await expect(
      prisma.advising.create({ data: { topicId: advised.topicId, lecturerId: advised.lecturerId } }),
    ).rejects.toMatchObject(p2002);
    // Bản ghi đã kết thúc (leftAt/endAt khác NULL) không bị chặn – index chỉ áp lên dòng hiện hành.
    await prisma.advising.create({
      data: { topicId: advised.topicId, lecturerId: advised.lecturerId, endAt: new Date() },
    });
  });
});

describe('Dữ liệu mẫu (seed)', () => {
  it('đủ số lượng danh mục, người dùng, đề tài (3 đề tài mỗi trạng thái)', async () => {
    const counts = await Promise.all([
      prisma.faculty.count(),
      prisma.major.count(),
      prisma.round.count(),
      prisma.field.count(),
      prisma.synonym.count(),
    ]);
    expect(counts.slice(0, 3)).toEqual([1, 3, 1]);
    expect(counts[3]).toBeGreaterThan(0);
    expect(counts[4]).toBeGreaterThan(0);
    const roles = await prisma.user.groupBy({ by: ['role'], _count: true });
    expect(Object.fromEntries(roles.map((r) => [r.role, r._count]))).toEqual({
      ADMIN: 1,
      STAFF: 2,
      LECTURER: 8,
      STUDENT: 40,
    });
    const statuses = await prisma.topic.groupBy({ by: ['status'], _count: true });
    expect(Object.fromEntries(statuses.map((s) => [s.status, s._count]))).toEqual(
      Object.fromEntries(Object.values(TOPIC_STATUS).map((s) => [s, 3])),
    );
  });

  it('lịch sử mỗi đề tài là chuỗi action hợp lệ theo TRANSITIONS, kết thúc đúng trạng thái hiện tại', async () => {
    const topics = await prisma.topic.findMany({ include: { statusHistory: { orderBy: { at: 'asc' } } } });
    for (const t of topics) {
      if (t.status !== 'DRAFT') expect(t.statusHistory.length, t.code).toBeGreaterThan(0);
      let cur = 'DRAFT';
      for (const h of t.statusHistory) {
        const tr = findTransition(h.action);
        expect({ from: h.from, to: h.to }, `${t.code} ${h.action}`).toEqual({ from: cur, to: tr.to });
        expect(tr.from).toBe(cur);
        if (tr.reasonRequired) expect(h.reason?.length, `${t.code} ${h.action} thiếu lý do`).toBeGreaterThanOrEqual(5);
        cur = h.to;
      }
      expect(cur, t.code).toBe(t.status);
    }
  });

  it('mỗi lần gửi có snapshot + kết quả FR06 OK, hồ sơ đủ trường bắt buộc FR05; quyết định trỏ snapshot', async () => {
    const subs = await prisma.submission.findMany({ include: { similarityCheck: true } });
    const sends = await prisma.statusHistory.count({ where: { action: { in: ['SUBMIT_FOR_REVIEW', 'RESUBMIT'] } } });
    expect(subs.length).toBe(sends);
    for (const s of subs) {
      expect(s.similarityCheck?.status).toBe('OK');
      expect(countWords(s.payload.summary)).toBeGreaterThanOrEqual(DEFAULT_ROUND_CONFIG.minSummaryWords);
      expect(s.payload.keywords.length).toBeGreaterThanOrEqual(DEFAULT_ROUND_CONFIG.minKeywords);
      expect(s.payload.keywords.length).toBeLessThanOrEqual(DEFAULT_ROUND_CONFIG.maxKeywords);
      expect(s.payload.fieldId).toBeTruthy();
    }
    const decisions = await prisma.statusHistory.count({
      where: { action: { in: ['REQUEST_REVISION', 'REJECT', 'APPROVE'] } },
    });
    expect(await prisma.reviewDecision.count()).toBe(decisions);
  });

  it('giới hạn mặc định mục 8: SV tối đa 1 đề tài hoạt động, GV tối đa 5 đề tài hướng dẫn hiện hành', async () => {
    const perStudent = await prisma.topicMember.groupBy({ by: ['userId'], where: { leftAt: null }, _count: true });
    expect(Math.max(...perStudent.map((r) => r._count))).toBe(1);
    const perLecturer = await prisma.advising.groupBy({ by: ['lecturerId'], where: { endAt: null }, _count: true });
    expect(Math.max(...perLecturer.map((r) => r._count))).toBeLessThanOrEqual(
      DEFAULT_ROUND_CONFIG.maxTopicsPerLecturer,
    );
  });

  it('mật khẩu băm Argon2id, buộc đổi ở lần đăng nhập đầu; không nạp lại vào DB đã có dữ liệu', async () => {
    const users = await prisma.user.findMany({ select: { passwordHash: true, mustChangePassword: true } });
    expect(users.every((u) => u.passwordHash.startsWith('$argon2id$') && u.mustChangePassword)).toBe(true);
    await expect(seed(prisma)).rejects.toThrow(/đã có người dùng/);
  });

  it('từ chối DB không bật cờ nckh.seed_allowed và không phải DB test "*_test"; bật cờ thì chạy được (review bao-mat T203 #1)', async () => {
    // DB phụ trên server test đóng vai DB Supabase (tên không phải *_test, như "postgres" của production/demo).
    const urlFor = (db) =>
      Object.assign(new URL(process.env.DATABASE_URL), { pathname: `/${db}`, search: '' }).toString();
    const withDb = async (db, fn) => {
      const c = new PrismaClient({ datasourceUrl: urlFor(db) });
      try {
        return await fn(c);
      } finally {
        await c.$disconnect();
      }
    };
    const dropGuardDb = () =>
      withDb('postgres', (c) => c.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${GUARD_DB} WITH (FORCE)`));
    await dropGuardDb();
    try {
      await withDb('postgres', (c) => c.$executeRawUnsafe(`CREATE DATABASE ${GUARD_DB}`));
      const url = urlFor(GUARD_DB);
      const r = spawnSync(process.execPath, [PRISMA_CLI, 'migrate', 'deploy'], {
        cwd: apiDir,
        env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
        encoding: 'utf8',
      });
      expect(r.status, r.stderr).toBe(0);

      await withDb(GUARD_DB, async (c) => {
        await expect(seed(c)).rejects.toThrow(/chưa bật cờ cho phép dữ liệu mẫu.*nckh\.seed_allowed/);
        expect(await c.user.count()).toBe(0);
      });
      await withDb('postgres', (c) => c.$executeRawUnsafe(`ALTER DATABASE ${GUARD_DB} SET nckh.seed_allowed = 'on'`));
      await withDb(GUARD_DB, async (c) => {
        await seed(c);
        expect(await c.user.count()).toBe(51);
      });
    } finally {
      await dropGuardDb();
    }
  }, 120000);

  it('đợt đang mở đăng ký tại thời điểm chạy seed (review T203 #3)', async () => {
    const round = await prisma.round.findFirst();
    const now = new Date();
    expect(round.regOpenAt <= now && now <= round.regCloseAt).toBe(true);
  });

  it('kết quả FR06 trong seed là kết quả thuật toán thật trên kho tại thời điểm gửi (review T203 #2)', async () => {
    const checks = await prisma.similarityCheck.findMany();
    for (const c of checks) {
      expect(c.algorithmVersion).toBe(ALGORITHM_VERSION);
      expect(c.matches.length).toBe(Math.min(5, c.corpusSize));
      if (c.level === 'HIGH')
        expect(countWords(c.justification)).toBeGreaterThanOrEqual(
          DEFAULT_ROUND_CONFIG.similarity.minJustificationWords,
        );
    }
    expect(checks.some((c) => c.corpusSize > 0)).toBe(true);
    expect(checks.some((c) => c.level === 'REVIEW')).toBe(true);
  });

  it('kho so FR06 đúng phạm vi mục 3, dựng lại độc lập từ StatusHistory (review T203 #5)', async () => {
    const topics = await prisma.topic.findMany({ select: { id: true, roundId: true, createdAt: true } });
    const history = await prisma.statusHistory.findMany({ orderBy: { at: 'asc' } });
    const checks = await prisma.similarityCheck.findMany({ include: { topic: { select: { roundId: true } } } });
    // Trạng thái ngay trước thời điểm kiểm: bước cuối có at < createdAt của lần kiểm; chưa có bước nào = Nháp.
    const statusAt = (topicId, when) =>
      history.filter((h) => h.topicId === topicId && h.at < when).at(-1)?.to ?? TOPIC_STATUS.DRAFT;
    for (const c of checks) {
      const expected = topics.filter(
        (t) =>
          t.id !== c.topicId &&
          t.createdAt < c.createdAt &&
          (PUBLIC_CORPUS_STATUSES.includes(statusAt(t.id, c.createdAt)) ||
            (t.roundId === c.topic.roundId && PENDING_SAME_ROUND_STATUSES.includes(statusAt(t.id, c.createdAt)))),
      );
      expect(c.corpusSize, `kho so của lần kiểm ${c.id}`).toBe(expected.length);
      const ids = new Set(expected.map((t) => t.id));
      for (const m of c.matches) expect(ids.has(m.topicId), 'match ngoài kho hoặc chính đề tài').toBe(true);
      if (c.level !== 'HIGH') expect(c.justification).toBeNull();
    }
  });

  it('RLS bật trên mọi bảng schema public, kể cả _prisma_migrations – không ngoại lệ (NFR03, review bao-mat T203 #2)', async () => {
    const rows = await prisma.$queryRaw`
      SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity`;
    expect(rows.map((r) => r.relname)).toEqual([]);
  });
});
