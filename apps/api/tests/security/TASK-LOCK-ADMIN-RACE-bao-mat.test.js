// TASK-LOCK-ADMIN-RACE bao-mat: race chéo "khóa ‖ xóa" giữa hai ADMIN. Hồi quy: hiện đạt vì người khóa đã ghi AuditLog USER_LOCK
// nên FK AuditLog.actorId (TASK-USER-DELETE m4) chặn xóa họ (409); remove() tự nó vẫn đếm cả ADMIN đã khóa trong adminsLeft.
// Gọi tầng service với actor đã nạp = thứ tự xấu nhất của hai request song song.
import { it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createAccountRepo } from '../../src/modules/accounts/prismaRepo.js';
import { createAccountService } from '../../src/modules/accounts/service.js';
import { fakeHasher } from '../helpers.js';
import { resetData } from '../db.js';

const prisma = new PrismaClient();
afterAll(() => prisma.$disconnect());
const svc = createAccountService({ repo: createAccountRepo(prisma), hasher: fakeHasher });
const actor = (u) => ({ id: u.id, role: 'ADMIN', staffFacultyIds: [] });
const mkAdmin = (code) => prisma.user.create({ data: { code, email: `${code.toLowerCase()}@t.vn`, fullName: code, passwordHash: 'x', role: 'ADMIN' } });

it('B khóa A ‖ A xóa B: phải còn ít nhất một ADMIN hoạt động', async () => {
  await resetData(prisma);
  const a = await mkAdmin('QTLA');
  const b = await mkAdmin('QTLB');
  await svc.setLocked(actor(b), a.id, true, null); // B thắng khóa trước
  await svc.remove(actor(a), b.id, null).catch(() => {}); // request của A đã qua requireAuth trước khi bị khóa
  expect(await prisma.user.count({ where: { role: 'ADMIN', isLocked: false } })).toBeGreaterThan(0);
});
