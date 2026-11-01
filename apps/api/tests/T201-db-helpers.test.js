// T201 vòng sửa 2: chốt chặn NFR08 (BUG-003/004) và helper resetData() cho test integration.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { checkTestDbEnv, prismaUrlVars } from '../scripts/test-db-guard.js';
import { resetData } from './db.js';

describe('checkTestDbEnv / prismaUrlVars', () => {
  const vars = ['DATABASE_URL', 'DIRECT_URL'];
  const local = 'postgresql://postgres:postgres@localhost:54329/nckh_test';

  it('lấy đủ biến URL từ schema.prisma (url + directUrl)', () => {
    expect(prismaUrlVars()).toEqual(['DATABASE_URL', 'DIRECT_URL']);
    expect(prismaUrlVars('url = env("A")\ndirectUrl = env("B")\nshadowDatabaseUrl = env("C")')).toEqual(['A', 'B', 'C']);
  });
  it('cả hai URL cục bộ, DB *_test → an toàn', () => {
    expect(checkTestDbEnv({ DATABASE_URL: local, DIRECT_URL: local.replace('localhost', '127.0.0.1') }, vars)).toEqual([]);
  });
  it('chỉ DIRECT_URL trỏ ra ngoài vẫn bị chặn (BUG-003)', () => {
    const e = checkTestDbEnv({ DATABASE_URL: local, DIRECT_URL: 'postgresql://u:p@db.supabase.co:5432/postgres' }, vars);
    expect(e).toHaveLength(1);
    expect(e[0]).toMatch(/DIRECT_URL.*db\.supabase\.co/);
  });
  it('localhost nhưng DB không phải *_test (DB dev cục bộ) bị chặn', () => {
    expect(checkTestDbEnv({ DATABASE_URL: local, DIRECT_URL: 'postgresql://u:p@localhost:54329/nckh_dev_qa' }, vars)[0])
      .toMatch(/nckh_dev_qa/);
  });
  it('BUG-005: nhiều đoạn đường dẫn, tham số host/lạ bị chặn; tham số trong danh sách trắng được nhận', () => {
    const one = (u) => checkTestDbEnv({ DATABASE_URL: u, DIRECT_URL: local }, vars);
    expect(one('postgresql://u:p@localhost:54329/nckh_dev/x_test')[0]).toMatch(/nckh_dev\/x_test/);
    expect(one(`${local}?host=db-dev.example.invalid`)[0]).toMatch(/tham số không được phép: host/);
    expect(one(`${local}?Host=x&hostaddr=1.2.3.4`)[0]).toMatch(/Host, hostaddr/);
    expect(one(`${local}?schema=public&connection_limit=1`)).toEqual([]);
  });
  it('thiếu biến hoặc URL hỏng bị chặn', () => {
    expect(checkTestDbEnv({ DATABASE_URL: local }, vars)).toEqual(['DIRECT_URL chưa đặt.']);
    expect(checkTestDbEnv({ DATABASE_URL: 'abc', DIRECT_URL: local }, vars)[0]).toMatch(/không phải URL/);
  });
});

describe('resetData (DB test thật)', () => {
  const prisma = new PrismaClient();
  beforeAll(() => resetData(prisma));
  afterAll(async () => { await resetData(prisma); await prisma.$disconnect(); });

  it('xóa mọi bảng kể cả bảng chỉ-thêm, đưa identity và topic_code_seq về đầu', async () => {
    await prisma.faculty.create({ data: { code: 'CNTT', name: 'Công nghệ thông tin' } });
    await prisma.auditLog.create({ data: { action: 'x', entityType: 'T', entityId: '1' } });
    await prisma.$queryRawUnsafe("SELECT nextval('topic_code_seq')");
    await prisma.$queryRawUnsafe("SELECT nextval('topic_code_seq')");
    // Bẫy mà helper tránh: deleteMany đụng trigger chỉ-thêm.
    await expect(prisma.auditLog.deleteMany()).rejects.toThrow(/chỉ cho phép thêm mới/);

    await resetData(prisma);

    expect(await prisma.faculty.count()).toBe(0);
    expect(await prisma.auditLog.count()).toBe(0);
    const [{ v }] = await prisma.$queryRawUnsafe("SELECT nextval('topic_code_seq')::int AS v");
    expect(v).toBe(1);
    const log = await prisma.auditLog.create({ data: { action: 'x', entityType: 'T', entityId: '1' } });
    expect(log.id).toBe(1n);
  });
});
