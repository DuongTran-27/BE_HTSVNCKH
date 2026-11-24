// BUG-002: logout bằng refresh token đã xoay vòng vẫn thu hồi cả họ phiên; refresh chạy song song với logout
// không được để lại token còn sống (FR01, NFR02). Repo giả trong bộ nhớ – integration DB thật để T205.
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { createAuthService } from '../../src/modules/auth/service.js';
import { sha256 } from '../../src/lib/tokens.js';
import { createMemoryAuthRepo, fakeHasher, testEnv, student } from '../helpers.js';

const cookieOf = (res) => (res.headers['set-cookie'] ?? []).find((c) => c.startsWith('nckh_rt='))?.split(';')[0];
const live = (repo) => [...repo.tokens.values()].filter((t) => !t.revokedAt);

describe('BUG-002 – logout thu hồi cả họ phiên kể cả token đã xoay', () => {
  it('logout bằng cookie cũ (đã xoay) → token mới nhất bị thu hồi, refresh sau đó 401', async () => {
    const repo = createMemoryAuthRepo([student]);
    const app = createApp({ env: testEnv, logger: undefined, authRepo: repo, hasher: fakeHasher });
    const c1 = cookieOf(await request(app).post('/api/auth/login').send({ identifier: 'SV001', password: 'Matkhau123' }));
    const c2 = cookieOf(await request(app).post('/api/auth/refresh').set('Cookie', c1));
    expect(c2).toBeTruthy();
    expect((await request(app).post('/api/auth/logout').set('Cookie', c1)).status).toBe(204);
    expect(live(repo)).toHaveLength(0);
    expect((await request(app).post('/api/auth/refresh').set('Cookie', c2)).status).toBe(401);
  });

  it('logout token lạ / không có cookie → 204, không thu hồi phiên khác', async () => {
    const repo = createMemoryAuthRepo([student]);
    const app = createApp({ env: testEnv, logger: undefined, authRepo: repo, hasher: fakeHasher });
    const c = cookieOf(await request(app).post('/api/auth/login').send({ identifier: 'SV001', password: 'Matkhau123' }));
    const r1 = await request(app).post('/api/auth/logout').set('Cookie', 'nckh_rt=khong-ton-tai');
    const r2 = await request(app).post('/api/auth/logout');
    expect([r1.status, r2.status]).toEqual([204, 204]);
    expect(r1.text).toBe('');
    expect((await request(app).post('/api/auth/refresh').set('Cookie', c)).status).toBe(200);
  });

  // Chen logout vào giữa các bước của refresh (cùng cookie cũ) để mô phỏng hai request đồng thời.
  const race = async (hookAt) => {
    const repo = createMemoryAuthRepo([student]);
    const svc = createAuthService({ repo, hasher: fakeHasher, env: testEnv });
    const { refreshToken } = await svc.login({ identifier: 'SV001', password: 'Matkhau123' });
    const orig = { create: repo.createRefreshToken, revoke: repo.revokeToken };
    let fired = false;
    const fire = async () => { if (!fired) { fired = true; await svc.logout({ refreshToken }); } };
    repo.createRefreshToken = async (d) => { if (hookAt === 'beforeCreate') await fire(); return orig.create(d); };
    repo.revokeToken = async (...a) => { if (hookAt === 'beforeRotate') await fire(); return orig.revoke(...a); };
    const result = await svc.refresh({ refreshToken }).then(() => 'ok', (e) => e.status);
    return { repo, result, fired };
  };

  it.each(['beforeCreate', 'beforeRotate'])('logout chen giữa refresh (%s) → refresh 401, không còn token sống', async (at) => {
    const { repo, result, fired } = await race(at);
    expect(fired).toBe(true);
    expect(result).toBe(401);
    expect(live(repo)).toHaveLength(0);
  });

  it('logout xong rồi mới refresh bằng token mới (thứ tự ngược) → 401', async () => {
    const repo = createMemoryAuthRepo([student]);
    const svc = createAuthService({ repo, hasher: fakeHasher, env: testEnv });
    const { refreshToken: t1 } = await svc.login({ identifier: 'SV001', password: 'Matkhau123' });
    const { refreshToken: t2 } = await svc.refresh({ refreshToken: t1 });
    await svc.logout({ refreshToken: t1 });
    expect((await repo.findRefreshTokenByHash(sha256(t2))).revokedAt).toBeTruthy();
    await expect(svc.refresh({ refreshToken: t2 })).rejects.toMatchObject({ status: 401 });
  });
});
