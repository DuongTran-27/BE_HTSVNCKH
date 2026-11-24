// TASK-DC-20: m1 SKIP LOCKED tất định, m3 CHECK emailStatus + index một phần (DC-04), m2 backfill ResultVersion.source = STAFF (DC-07).
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { notify, setEmailOutbox } from '../src/modules/notifications/notify.js';
import { dispatchEmails } from '../src/modules/notifications/email.js';
import { prisma, U, seedBase, mkTopic } from './t214-kit.js';

const transport = () => ({ sent: [], async sendMail(m) { this.sent.push(m); } });
const dispatch = (tr) => dispatchEmails({ prisma, transport: tr, from: 'NCKH <no-reply@x.vn>', appUrl: 'https://nckh.example.edu.vn' });

beforeAll(() => seedBase({ students: 4 }), 60000);
afterEach(async () => { setEmailOutbox(false); await prisma.notification.deleteMany({}); });
afterAll(() => prisma.$disconnect());

describe('DC-20 m1 SKIP LOCKED', () => {
  it('dòng đang bị giữ khóa bởi transaction khác bị bỏ qua, không chặn; mở khóa rồi gửi được', async () => {
    setEmailOutbox(true);
    await notify(prisma, [
      { userId: U.s1.id, type: 'T', title: 'Bị khóa', link: '/a', dedupeKey: 'DC20:1' },
      { userId: U.s2.id, type: 'T', title: 'Tự do', link: '/b', dedupeKey: 'DC20:2' },
    ]);
    const locked = await prisma.notification.findFirst({ where: { userId: U.s1.id } });
    let release;
    const hold = new Promise((r) => { release = r; });
    let ready;
    const held = new Promise((r) => { ready = r; });
    const tx = prisma.$transaction(async (t) => {
      await t.$queryRaw`SELECT id FROM "Notification" WHERE id = ${locked.id} FOR UPDATE`;
      ready();
      await hold;
    });
    await held;
    const tr = transport();
    const res = await dispatch(tr); // nếu không có SKIP LOCKED sẽ treo tới khi hết hold → test quá hạn
    release(); await tx;
    expect(res).toMatchObject({ sent: 1 });
    expect(tr.sent.map((m) => m.subject)).toEqual([expect.stringContaining('Tự do')]);
    expect((await prisma.notification.findUnique({ where: { id: locked.id } })).emailStatus).toBe('PENDING');
    const tr2 = transport();
    expect(await dispatch(tr2)).toMatchObject({ sent: 1 });
  });
});

describe('DC-20 m3 CHECK + index một phần', () => {
  it('CHECK từ chối giá trị lạ, nhận NULL và 5 trạng thái; index một phần tồn tại', async () => {
    const mk = (emailStatus, k) => prisma.notification.create({ data: { userId: U.s1.id, type: 'T', title: 't', dedupeKey: `DC20c:${k}`, emailStatus } });
    await expect(mk('BAY_BA', 'x')).rejects.toThrow(/Notification_emailStatus_check/);
    for (const s of [null, 'PENDING', 'SENDING', 'SENT', 'FAILED', 'SKIPPED']) await mk(s, String(s));
    const [{ indexdef }] = await prisma.$queryRaw`SELECT indexdef FROM pg_indexes WHERE indexname = 'Notification_email_queue_idx'`;
    expect(indexdef).toMatch(/WHERE .*emailStatus.*PENDING.*SENDING/);
  });
});

describe('DC-20 m2 backfill ResultVersion.source', () => {
  it('đúng câu UPDATE của migration dc_council: bản do STAFF tạo → STAFF, bản GV giữ ADVISOR', async () => {
    const sql = readFileSync(new URL('../prisma/migrations/20261118000400_dc_council/migration.sql', import.meta.url), 'utf8');
    const stmt = sql.match(/^UPDATE "ResultVersion" r SET "source" = 'STAFF'[^;]*;/m)?.[0];
    expect(stmt).toBeTruthy();
    const mk = async (who) => {
      const t = await mkTopic('s3');
      return prisma.resultVersion.create({ data: { topicId: t.id, version: 1, result: 'PASS', summary: 'x', createdById: U[who].id } });
    };
    const byStaff = await mk('staff1');
    const byLec = await mk('lecA');
    expect(byStaff.source).toBe('ADVISOR'); // mặc định cột = trạng thái trước backfill
    // trigger guard chặn UPDATE như migration xử lý: tắt/bật trong cùng transaction
    await prisma.$transaction([
      prisma.$executeRawUnsafe('ALTER TABLE "ResultVersion" DISABLE TRIGGER result_version_guarded'),
      prisma.$executeRawUnsafe(stmt),
      prisma.$executeRawUnsafe('ALTER TABLE "ResultVersion" ENABLE TRIGGER result_version_guarded'),
    ]);
    expect((await prisma.resultVersion.findUnique({ where: { id: byStaff.id } })).source).toBe('STAFF');
    expect((await prisma.resultVersion.findUnique({ where: { id: byLec.id } })).source).toBe('ADVISOR');
  });
});
