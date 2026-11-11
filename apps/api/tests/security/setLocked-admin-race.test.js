// Race khóa tài khoản (bao-mat TASK-USER-DELETE v2, ngoài phạm vi → task riêng): hai ADMIN khóa nhau cùng lúc không được
// để hệ thống không còn ADMIN hoạt động. Gọi tầng service với actor đã nạp = thứ tự xấu nhất của hai request song song.
import { it, expect, beforeEach, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createAccountRepo } from '../../src/modules/accounts/prismaRepo.js';
import { createAccountService } from '../../src/modules/accounts/service.js';
import { fakeHasher } from '../helpers.js';
import { resetData } from '../db.js';

const prisma = new PrismaClient();
const svc = createAccountService({ repo: createAccountRepo(prisma), hasher: fakeHasher });
const actor = (u) => ({ id: u.id, role: 'ADMIN', staffFacultyIds: [] });
const mkAdmin = (code) => prisma.user.create({ data: { code, email: `${code.toLowerCase()}@t.vn`, fullName: code, passwordHash: 'x', role: 'ADMIN' } });
let a1, a2;

beforeEach(async () => {
  await resetData(prisma);
  [a1, a2] = [await mkAdmin('QTA'), await mkAdmin('QTB')];
});
afterAll(() => prisma.$disconnect());

it('hai ADMIN khóa nhau đồng thời: còn ít nhất một ADMIN hoạt động, bên thua nhận 403', async () => {
  const results = await Promise.allSettled([svc.setLocked(actor(a1), a2.id, true, null), svc.setLocked(actor(a2), a1.id, true, null)]);
  expect(await prisma.user.count({ where: { role: 'ADMIN', isLocked: false } })).toBeGreaterThan(0);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(results.find((r) => r.status === 'rejected').reason.status).toBe(403);
});

it('ADMIN đã bị khóa (token cũ còn hạn ở tầng service) không khóa được ADMIN khác; mở khóa không bị chặn', async () => {
  await prisma.user.update({ where: { id: a1.id }, data: { isLocked: true } });
  await expect(svc.setLocked(actor(a1), a2.id, true, null)).rejects.toMatchObject({ status: 403 });
  expect((await svc.setLocked(actor(a2), a1.id, false, null)).user.isLocked).toBe(false);
});
