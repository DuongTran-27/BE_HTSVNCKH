// TASK-USER-DELETE bao-mat: các lối xóa cứng tài khoản mà FK RESTRICT không chặn đúng.
// 1) AuditLog.actorId không có FK: cán bộ chỉ có thao tác ghi AuditLog (tạo tài khoản, đợt, danh mục...) xóa được -> actorId mồ côi (FR15 "ghi ai").
// 2) ChangeRequest.targetUserId/decidedById là FK ON DELETE SET NULL; trigger change_request_guard chặn -> lỗi không phải P2003 -> 500 thay vì 409.
// 3) Hai ADMIN xóa nhau đồng thời: mỗi transaction chỉ khóa dòng bị xóa, không khóa dòng actor -> có thể còn 0 ADMIN.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../src/app.js';
import { createAuthRepo } from '../../src/modules/auth/prismaRepo.js';
import { createAccountRepo } from '../../src/modules/accounts/prismaRepo.js';
import { createAccountService } from '../../src/modules/accounts/service.js';
import { signAccessToken } from '../../src/lib/tokens.js';
import { fakeHasher, testEnv } from '../helpers.js';
import { resetData } from '../db.js';

const prisma = new PrismaClient();
const app = createApp({ env: testEnv, logger: undefined, authRepo: createAuthRepo(prisma), hasher: fakeHasher, accountRepo: createAccountRepo(prisma) });
const tokenOf = (u) => signAccessToken(u, { secret: testEnv.JWT_ACCESS_SECRET, ttlSeconds: 600 });
const del = (actor, id) => request(app).delete(`/api/users/${id}`).set({ Authorization: `Bearer ${tokenOf(actor)}` });
let n = 0;
const mk = (role, extra = {}) => {
  n += 1;
  return prisma.user.create({ data: { code: `UD${n}`, email: `ud${n}@t.vn`, fullName: `U ${n}`, passwordHash: 'x', role, mustChangePassword: false, ...extra } });
};
let F1, admin;

beforeAll(async () => {
  await resetData(prisma);
  F1 = await prisma.faculty.create({ data: { code: 'CNTT', name: 'CNTT' } });
  admin = await mk('ADMIN');
}, 60000);
afterAll(() => prisma.$disconnect());

describe('DELETE /api/users/:id – bảo mật', () => {
  it('cán bộ đã có thao tác nghiệp vụ chỉ ghi AuditLog (tạo tài khoản) không được xóa cứng (FR15, NFR05)', async () => {
    const staff = await mk('STAFF', { facultyId: F1.id });
    await prisma.staffScope.create({ data: { userId: staff.id, facultyId: F1.id } });
    const c = await request(app).post('/api/users').set({ Authorization: `Bearer ${tokenOf(staff)}` })
      .send({ code: 'SVAUD', email: 'svaud@t.vn', fullName: 'SV', role: 'LECTURER', facultyId: F1.id });
    expect(c.status).toBe(201);
    expect(await prisma.auditLog.count({ where: { actorId: staff.id } })).toBeGreaterThan(0);
    const r = await del(admin, staff.id);
    expect(r.status).toBe(409); // thực tế: 204, actorId trong AuditLog trỏ tới user không còn
  });

  it('GV là người đích của yêu cầu thay đổi đang chờ: 409 IN_USE, không phải 500', async () => {
    const leader = await mk('STUDENT', { facultyId: F1.id });
    const lec = await mk('LECTURER', { facultyId: F1.id });
    const round = await prisma.round.create({
      data: { facultyId: F1.id, name: 'R', academicYear: '2026-2027', regOpenAt: new Date(), regCloseAt: new Date(Date.now() + 1e9), reviewDeadline: new Date(Date.now() + 2e9), endAt: new Date(Date.now() + 3e9), config: {} },
    });
    const topic = await prisma.topic.create({ data: { code: 'UD-T1', roundId: round.id, facultyId: F1.id } });
    await prisma.changeRequest.create({
      data: { topicId: topic.id, type: 'ADVISOR_CHANGE', payload: {}, reason: 'x', createdById: leader.id, targetUserId: lec.id },
    });
    const r = await del(admin, lec.id);
    expect(r.status).toBe(409);
    expect(await prisma.user.findUnique({ where: { id: lec.id } })).not.toBeNull();
  });

  it('hai ADMIN xóa nhau đồng thời: hệ thống không được còn 0 ADMIN', async () => {
    // Cả hai request đã qua requireAuth (actor còn tồn tại lúc nạp); transaction chỉ khóa dòng bị xóa, không kiểm lại actor.
    // Chạy tuần tự hai lời gọi service với actor đã nạp = đúng thứ tự xấu nhất của hai request song song.
    await prisma.user.deleteMany({ where: { role: 'ADMIN', id: { not: admin.id } } });
    const a2 = await mk('ADMIN');
    const svc = createAccountService({ repo: createAccountRepo(prisma), hasher: fakeHasher });
    const actor = (u) => ({ id: u.id, role: 'ADMIN', staffFacultyIds: [] });
    const results = await Promise.allSettled([svc.remove(actor(admin), a2.id), svc.remove(actor(a2), admin.id)]);
    const left = await prisma.user.count({ where: { role: 'ADMIN' } });
    expect(left, JSON.stringify(results.map((r) => r.status))).toBeGreaterThan(0);
  });
});
