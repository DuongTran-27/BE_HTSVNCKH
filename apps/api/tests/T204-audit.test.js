// T204 (FR15): service AuditLog + helper StatusHistory, bảng chỉ-thêm ở mức DB (UPDATE/DELETE/TRUNCATE),
// và resetData vẫn dọn được dù TRUNCATE bị chặn.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { findTransition } from '@nckh/shared';
import { resetData } from './db.js';
import { seed } from '../prisma/seed.js';
import {
  recordAudit,
  recordAuditMany,
  recordStatus,
  listAudit,
  listStatusHistory,
  redact,
} from '../src/modules/audit/service.js';
import { applyTransition, checkTransition } from '../src/modules/topics/stateMachine.js';

const prisma = new PrismaClient();
let draft;
let leader;
let staff;
let admin;

beforeAll(async () => {
  await resetData(prisma);
  await seed(prisma);
  draft = await prisma.topic.findFirst({ where: { status: 'DRAFT' } });
  const m = await prisma.topicMember.findFirst({ where: { topicId: draft.id, role: 'LEADER' } });
  leader = await prisma.user.findUnique({ where: { id: m.userId } });
  staff = await prisma.user.findFirst({ where: { role: 'STAFF' } });
  admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
}, 60000);
afterAll(() => prisma.$disconnect());

const trunc = (t) => prisma.$executeRawUnsafe(`TRUNCATE "${t}" CASCADE`);

describe('redact', () => {
  it('bỏ mật khẩu, hash, token ở mọi độ sâu; Date thành ISO', () => {
    const d = new Date('2026-01-02T03:04:05Z');
    expect(
      redact({
        email: 'a',
        passwordHash: 'x',
        nested: { tokenHash: 'y', refreshToken: 'z', ok: [{ secret: 1, v: 2 }] },
        d,
      }),
    ).toEqual({
      email: 'a',
      nested: { ok: [{ v: 2 }] },
      d: d.toISOString(),
    });
  });
});

describe('AuditLog (FR15)', () => {
  it('ghi người, thời điểm, thao tác, đối tượng, trước/sau; không lưu trường bí mật', async () => {
    await recordAudit(prisma, {
      actorId: staff.id,
      action: 'USER_UPDATE',
      entityType: 'User',
      entityId: leader.id,
      before: { fullName: 'Cũ', passwordHash: 'h' },
      after: { fullName: 'Mới' },
      ip: '10.0.0.1',
    });
    const [row] = await listAudit(prisma, { entityType: 'User', entityId: leader.id });
    expect(row).toMatchObject({
      actorId: staff.id,
      action: 'USER_UPDATE',
      before: { fullName: 'Cũ' },
      after: { fullName: 'Mới' },
      ip: '10.0.0.1',
    });
    expect(row.at).toBeInstanceOf(Date);
    expect(typeof row.id).toBe('string');
  });

  it('createMany + lọc + phân trang theo id (mới nhất trước)', async () => {
    await recordAuditMany(
      prisma,
      [1, 2, 3].map((i) => ({
        actorId: admin.id,
        action: 'CATALOG_CREATE',
        entityType: 'Field',
        entityId: `f${i}`,
        after: { i },
      })),
    );
    const all = await listAudit(prisma, { entityType: 'Field' });
    expect(all.map((r) => r.entityId)).toEqual(['f3', 'f2', 'f1']);
    const page = await listAudit(prisma, { entityType: 'Field', beforeId: all[0].id, limit: 1 });
    expect(page.map((r) => r.entityId)).toEqual(['f2']);
  });

  it('ghi trong transaction: rollback thì không còn dòng nào', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await recordAudit(tx, { actorId: admin.id, action: 'X_ROLLBACK', entityType: 'X', entityId: '1' });
        throw new Error('hủy');
      }),
    ).rejects.toThrow('hủy');
    expect(await listAudit(prisma, { entityType: 'X' })).toEqual([]);
  });
});

describe('StatusHistory qua applyTransition', () => {
  it('ghi một dòng StatusHistory (from/to/action/actor/reason) và tăng version', async () => {
    const t = findTransition('REQUEST_ADVISOR');
    const ctx = { isLeader: true };
    checkTransition({ topic: draft, action: t.action, actor: { id: leader.id, role: 'STUDENT' }, ctx });
    const before = (await listStatusHistory(prisma, draft.id)).length;
    const updated = await applyTransition(prisma, { topic: draft, transition: t, actor: leader, reason: 'ghi chú' });
    expect(updated.status).toBe('WAITING_ADVISOR');
    expect(updated.version).toBe(draft.version + 1);
    const hist = await listStatusHistory(prisma, draft.id);
    expect(hist).toHaveLength(before + 1);
    expect(hist.at(-1)).toMatchObject({
      from: 'DRAFT',
      to: 'WAITING_ADVISOR',
      action: 'REQUEST_ADVISOR',
      actorId: leader.id,
      reason: 'ghi chú',
    });
  });

  it('trạng thái sai -> 409 INVALID_TRANSITION, không ghi lịch sử', async () => {
    const n = await prisma.statusHistory.count({ where: { topicId: draft.id } });
    expect(() =>
      checkTransition({
        topic: { ...draft, status: 'CLOSED' },
        action: 'REQUEST_ADVISOR',
        actor: { role: 'STUDENT' },
        ctx: { isLeader: true },
      }),
    ).toThrow(expect.objectContaining({ status: 409, code: 'INVALID_TRANSITION' }));
    expect(await prisma.statusHistory.count({ where: { topicId: draft.id } })).toBe(n);
  });

  it('vai trò sai (ADMIN) -> 403, không ghi lịch sử', () => {
    expect(() =>
      checkTransition({
        topic: { ...draft, status: 'DRAFT' },
        action: 'REQUEST_ADVISOR',
        actor: admin,
        ctx: { isLeader: true },
      }),
    ).toThrow(expect.objectContaining({ status: 403 }));
  });

  it('phiên bản cũ (tranh chấp) -> 409 CONCURRENT_UPDATE và không ghi StatusHistory', async () => {
    const t = findTransition('WITHDRAW_ADVISOR_REQUEST');
    const n = await prisma.statusHistory.count({ where: { topicId: draft.id } });
    await expect(
      applyTransition(prisma, {
        topic: { ...draft, status: 'WAITING_ADVISOR', version: 999 },
        transition: t,
        actor: leader,
      }),
    ).rejects.toMatchObject({
      status: 409,
      code: 'CONCURRENT_UPDATE',
    });
    expect(await prisma.statusHistory.count({ where: { topicId: draft.id } })).toBe(n);
  });

  it('recordStatus ghi bước đầu (from = null)', async () => {
    const row = await recordStatus(prisma, { topicId: draft.id, to: 'DRAFT', action: 'CREATE', actorId: leader.id });
    expect(row.from).toBeNull();
  });
});

describe('bảng chỉ-thêm ở mức DB (FR15)', () => {
  const TABLES = ['AuditLog', 'StatusHistory', 'Submission', 'ReviewDecision', 'SimilarityCheck'];

  it('UPDATE và DELETE AuditLog/StatusHistory bị chặn', async () => {
    await expect(prisma.$executeRaw`UPDATE "AuditLog" SET action = 'x'`).rejects.toThrow(/chỉ cho phép thêm mới/);
    await expect(prisma.$executeRaw`DELETE FROM "AuditLog"`).rejects.toThrow(/chỉ cho phép thêm mới/);
    await expect(prisma.$executeRaw`UPDATE "StatusHistory" SET reason = 'x'`).rejects.toThrow(/chỉ cho phép thêm mới/);
    await expect(prisma.$executeRaw`DELETE FROM "StatusHistory"`).rejects.toThrow(/chỉ cho phép thêm mới/);
  });

  it.each(TABLES)('TRUNCATE %s bị chặn (kể cả CASCADE từ bảng cha)', async (t) => {
    const [{ n: before }] = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}"`);
    expect(before).toBeGreaterThan(0);
    await expect(trunc(t)).rejects.toThrow(/chỉ cho phép thêm mới/);
    const [{ n }] = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}"`);
    expect(n).toBe(before);
  });

  it('TRUNCATE "Topic" CASCADE bị chặn vì kéo theo StatusHistory', async () => {
    await expect(trunc('Topic')).rejects.toThrow(/chỉ cho phép thêm mới/);
    expect(await prisma.topic.count()).toBeGreaterThan(0);
  });

  it('có đủ 9 trigger BEFORE TRUNCATE gọi forbid_mutation() (5 của FR15 + 4 của gd4_execution)', async () => {
    const rows = await prisma.$queryRaw`
      SELECT c.relname, p.proname, t.tgtype FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_proc p ON p.oid = t.tgfoid
      WHERE NOT t.tgisinternal AND (t.tgtype & 32) = 32`; // 32 = TRUNCATE
    expect(rows.map((r) => r.relname).sort()).toEqual([...TABLES, 'Document', 'Feedback', 'MilestoneDueChange', 'ResultVersion'].sort()); // API_GD45 §11b
    for (const r of rows) {
      expect(r.proname).toBe('forbid_mutation');
      expect(r.tgtype & 3).toBe(2); // BEFORE, FOR EACH STATEMENT (bit ROW = 1 tắt)
    }
  });

  it('resetData vẫn dọn được bảng chỉ-thêm và không để lại cờ replica ở phiên khác', async () => {
    await resetData(prisma);
    for (const t of TABLES) {
      const [{ n }] = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}"`);
      expect(n).toBe(0);
    }
    const [{ role }] = await prisma.$queryRaw`SELECT current_setting('session_replication_role') AS role`;
    expect(role).toBe('origin');
  });
});
