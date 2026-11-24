// TASK-DC-03 trên Postgres: cấp phiên SSO trong transaction có khóa User (m1 BM), AuditLog LOGIN_SSO, khớp email
// không phân biệt hoa thường qua Prisma, khóa tài khoản ‖ callback không để lại refresh token sống.
import { it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../src/app.js';
import { createAuthRepo } from '../src/modules/auth/prismaRepo.js';
import { createAccountRepo } from '../src/modules/accounts/prismaRepo.js';
import { createAccountService } from '../src/modules/accounts/service.js';
import { resetData } from './db.js';
import { fakeHasher } from './helpers.js';
import { ssoEnv, fakeGoogle, runSso } from './sso-kit.js';

const prisma = new PrismaClient();
const accounts = createAccountService({ repo: createAccountRepo(prisma), hasher: fakeHasher });
let google, app, sv, adminUser;

beforeEach(async () => {
  await resetData(prisma);
  sv = await prisma.user.create({ data: { code: 'SV950', email: 'SV950@VanLangUni.vn', fullName: 'Lê Văn C', role: 'STUDENT', passwordHash: 'x', mustChangePassword: false } });
  adminUser = await prisma.user.create({ data: { code: 'QT950', email: 'qt950@vanlanguni.vn', fullName: 'QT', role: 'ADMIN', passwordHash: 'x' } });
  google = fakeGoogle();
  app = createApp({ env: ssoEnv, authRepo: createAuthRepo(prisma), hasher: fakeHasher, google });
});
afterAll(() => prisma.$disconnect());

const live = () => prisma.refreshToken.count({ where: { userId: sv.id, revokedAt: null } });

it('thành công: email khác hoa thường khớp, refresh token lưu DB, AuditLog LOGIN_SSO có ip, refresh trả user', async () => {
  const { res } = await runSso(app, google, { email: 'sv950@vanlanguni.vn', ip: '198.51.100.4' });
  expect(res.headers.location).toBe('https://app.test/dang-nhap/google');
  expect(await live()).toBe(1);
  const logs = await prisma.auditLog.findMany({ where: { action: 'LOGIN_SSO' } });
  expect(logs).toHaveLength(1);
  expect(logs[0]).toMatchObject({ actorId: sv.id, entityType: 'User', entityId: sv.id, after: { provider: 'google' }, ip: '198.51.100.4' });
  const rt = res.headers['set-cookie'].find((c) => c.startsWith('nckh_rt=')).split(';')[0];
  const r = await request(app).post('/api/auth/refresh').set('Cookie', rt);
  expect(r.body.user).toMatchObject({ id: sv.id, code: 'SV950' });
});

it('ADMIN → PASSWORD_ONLY, không token, không AuditLog', async () => {
  const { res } = await runSso(app, google, { email: 'qt950@vanlanguni.vn' });
  expect(res.headers.location).toBe('https://app.test/dang-nhap?sso_error=PASSWORD_ONLY');
  expect(await prisma.refreshToken.count()).toBe(0);
  expect(await prisma.auditLog.count({ where: { action: 'LOGIN_SSO' } })).toBe(0);
});

it('khóa tài khoản ‖ callback: dù thứ tự nào, không còn refresh token sống của người bị khóa', async () => {
  for (let i = 0; i < 6; i++) {
    await prisma.user.update({ where: { id: sv.id }, data: { isLocked: false } });
    await prisma.refreshToken.updateMany({ where: { userId: sv.id }, data: { revokedAt: new Date() } });
    const [sso] = await Promise.all([
      runSso(app, google, { email: 'sv950@vanlanguni.vn' }),
      accounts.setLocked({ id: adminUser.id, role: 'ADMIN', staffFacultyIds: [] }, sv.id, true, null),
    ]);
    expect(sso.res.status).toBe(302);
    expect(await live()).toBe(0);
  }
});

it('tài khoản đã khóa → ACCOUNT_LOCKED', async () => {
  await prisma.user.update({ where: { id: sv.id }, data: { isLocked: true } });
  const { res } = await runSso(app, google, { email: 'sv950@vanlanguni.vn' });
  expect(res.headers.location).toBe('https://app.test/dang-nhap?sso_error=ACCOUNT_LOCKED');
  expect(await prisma.refreshToken.count()).toBe(0);
});
