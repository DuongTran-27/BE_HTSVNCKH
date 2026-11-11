// TASK-USER-DELETE bao-mat v2: TOCTOU còn lại. Request của cán bộ đã qua requireAuth trước khi bị xóa;
// thao tác chỉ ghi AuditLog (không FK tới User, không khóa dòng User của actor) vẫn commit sau khi xóa -> actorId mồ côi.
// Gọi tầng service với actor đã nạp = thứ tự xấu nhất của hai request song song.
import { it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createAccountRepo } from '../../src/modules/accounts/prismaRepo.js';
import { createAccountService } from '../../src/modules/accounts/service.js';
import { fakeHasher } from '../helpers.js';
import { resetData } from '../db.js';

const prisma = new PrismaClient();
afterAll(() => prisma.$disconnect());

it('cán bộ bị xóa giữa chừng: thao tác đang chạy không được ghi AuditLog với actorId không tồn tại', async () => {
  await resetData(prisma);
  const F1 = await prisma.faculty.create({ data: { code: 'CNTT', name: 'CNTT' } });
  const admin = await prisma.user.create({ data: { code: 'QTV2', email: 'qtv2@t.vn', fullName: 'QT', passwordHash: 'x', role: 'ADMIN' } });
  const staff = await prisma.user.create({ data: { code: 'CBV2', email: 'cbv2@t.vn', fullName: 'CB', passwordHash: 'x', role: 'STAFF', facultyId: F1.id } });
  await prisma.staffScope.create({ data: { userId: staff.id, facultyId: F1.id } });
  const svc = createAccountService({ repo: createAccountRepo(prisma), hasher: fakeHasher });
  const staffActor = { id: staff.id, role: 'STAFF', staffFacultyIds: [F1.id] }; // đã qua requireAuth
  await svc.remove({ id: admin.id, role: 'ADMIN', staffFacultyIds: [] }, staff.id, '127.0.0.1');
  await svc.create(staffActor, { code: 'GVV2', email: 'gvv2@t.vn', fullName: 'GV', role: 'LECTURER', facultyId: F1.id }, '127.0.0.1').catch(() => {});
  const orphan = await prisma.auditLog.count({ where: { actorId: staff.id, NOT: { action: 'USER_DELETE' } } });
  expect(orphan).toBe(0);
});
