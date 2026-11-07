// BUG-013: mật khẩu tạm băm Argon2id tham số nhẹ; mật khẩu tự đặt giữ tham số đầy đủ.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../src/app.js';
import { createAuthRepo } from '../src/modules/auth/prismaRepo.js';
import { createAccountRepo } from '../src/modules/accounts/prismaRepo.js';
import { passwordHasher } from '../src/lib/password.js';
import { signAccessToken } from '../src/lib/tokens.js';
import { testEnv } from './helpers.js';
import { resetData } from './db.js';

const LIGHT = '$argon2id$v=19$m=2048,t=2,p=1$';
const FULL = '$argon2id$v=19$m=19456,t=2,p=1$';

describe('passwordHasher', () => {
  it('temporary: chuỗi mang tham số nhẹ, verify đúng/sai', async () => {
    const h = await passwordHasher.hash('Tam12345abcdXY', { temporary: true });
    expect(h.startsWith(LIGHT)).toBe(true);
    expect(await passwordHasher.verify(h, 'Tam12345abcdXY')).toBe(true);
    expect(await passwordHasher.verify(h, 'Tam12345abcdXZ')).toBe(false);
  });

  it('mặc định giữ tham số đầy đủ; chuỗi hỏng -> false', async () => {
    const h = await passwordHasher.hash('Matkhau@123');
    expect(h.startsWith(FULL)).toBe(true);
    expect(await passwordHasher.verify(h, 'Matkhau@123')).toBe(true);
    expect(await passwordHasher.verify('khong-phai-hash', 'x')).toBe(false);
  });

  it('verify hash nhẹ không nhanh hơn hash đầy đủ (không lộ tài khoản còn mật khẩu tạm qua thời gian)', async () => {
    const light = await passwordHasher.hash('Tam12345abcdXY', { temporary: true });
    const full = await passwordHasher.hash('Tam12345abcdXY');
    await passwordHasher.verify(light, 'sai'); // làm nóng hash bù
    const time = async (h) => {
      const t = performance.now();
      for (let i = 0; i < 10; i++) await passwordHasher.verify(h, 'sai');
      return performance.now() - t;
    };
    expect(await time(light)).toBeGreaterThanOrEqual((await time(full)) * 0.8);
  });
});

describe('nhập CSV với Argon2 thật: đăng nhập bằng mật khẩu tạm, buộc đổi, đổi xong dùng tham số đầy đủ', () => {
  const prisma = new PrismaClient();
  const authRepo = createAuthRepo(prisma);
  const app = createApp({ env: testEnv, logger: undefined, authRepo, hasher: passwordHasher, accountRepo: createAccountRepo(prisma) });
  let F1;
  let adminTok;

  beforeAll(async () => {
    await resetData(prisma);
    F1 = await prisma.faculty.create({ data: { code: 'CNTT', name: 'CNTT' } });
    const admin = await prisma.user.create({
      data: { code: 'ADM13', email: 'adm13@t.vn', fullName: 'A', passwordHash: 'x', role: 'ADMIN', mustChangePassword: false },
    });
    adminTok = signAccessToken(admin, { secret: testEnv.JWT_ACCESS_SECRET, ttlSeconds: 600 });
  });
  afterAll(() => prisma.$disconnect());

  it('confirm -> hash nhẹ, login được, chỉ được đổi mật khẩu; đổi xong hash đầy đủ', async () => {
    const csv = 'code,email,fullName,role,classCode\nGV013,gv013@t.vn,Cô D,LECTURER,\n';
    const c = await request(app)
      .post(`/api/users/import/confirm?facultyId=${F1.id}`)
      .set('Authorization', `Bearer ${adminTok}`)
      .attach('file', Buffer.from(csv), 'u.csv');
    expect(c.status).toBe(200);
    const { temporaryPassword } = c.body.credentials[0];
    const stored = await prisma.user.findUnique({ where: { code: 'GV013' } });
    expect(stored.passwordHash.startsWith(LIGHT)).toBe(true);
    expect(stored.mustChangePassword).toBe(true);

    expect((await request(app).post('/api/auth/login').send({ identifier: 'GV013', password: 'Sai12345abcdXY' })).status).toBe(401);
    const login = await request(app).post('/api/auth/login').send({ identifier: 'GV013', password: temporaryPassword });
    expect(login.status).toBe(200);
    expect(login.body.user.mustChangePassword).toBe(true);
    const bearer = `Bearer ${login.body.accessToken}`;
    expect((await request(app).get('/api/users').set('Authorization', bearer)).body.error?.code ?? '').toBe('PASSWORD_CHANGE_REQUIRED');

    const ch = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', bearer)
      .send({ currentPassword: temporaryPassword, newPassword: 'MatKhauMoi@456' });
    expect(ch.status).toBe(204);
    const after = await prisma.user.findUnique({ where: { code: 'GV013' } });
    expect(after.passwordHash.startsWith(FULL)).toBe(true);
    expect(after.mustChangePassword).toBe(false);
  }, 30000);
});
