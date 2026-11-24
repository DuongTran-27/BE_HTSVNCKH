// Kiểm chứng bảo mật T199 (GHSA-mrhx-c7xc-m3w5, QD_ZOD §4, §5). Do bao-mat viết khi review T199 vòng 1.
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { topicDraftSchema } from '@nckh/shared';
import { createApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { validate } from '../../src/middlewares/validate.js';
import { createMemoryAuthRepo, fakeHasher, testEnv, student } from '../helpers.js';

const makeApp = () => createApp({ env: testEnv, logger: undefined, authRepo: createMemoryAuthRepo([student]), hasher: fakeHasher });

describe('T199 – giới hạn kích thước đầu vào', () => {
  // Hồi quy QD_ZOD §4: entity.too.large → 413 PAYLOAD_TOO_LARGE (T215 đã sửa).
  it('body JSON quá giới hạn trả 413 PAYLOAD_TOO_LARGE', async () => {
    const r = await request(makeApp()).post('/api/auth/login')
      .set('content-type', 'application/json')
      .send(JSON.stringify({ identifier: 'SV001', password: 'a'.repeat(1_100_000) }));
    expect(r.status).toBe(413);
    expect(r.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  // Hồi quy QD_ZOD §4: express.json 100kb (T215).
  it('body JSON 200kb bị từ chối (QD_ZOD §4: limit 100kb)', async () => {
    const r = await request(makeApp()).post('/api/auth/login')
      .send({ identifier: 'SV001', password: 'a'.repeat(200_000) });
    expect(r.status).toBe(413);
  });

  // Hồi quy QD_ZOD §5: password .max(128) (T215).
  it('mật khẩu dài hơn 128 ký tự bị 400 VALIDATION_ERROR', async () => {
    const r = await request(makeApp()).post('/api/auth/login').send({ identifier: 'SV001', password: 'a'.repeat(129) });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_ERROR');
  });

  // Đây là đường khai thác GHSA-mrhx-c7xc-m3w5 qua validate.js: mảng có .max() vẫn bị duyệt toàn bộ,
  // mỗi phần tử sai sinh 1 issue và validate.js phản chiếu hết vào response (khuếch đại ~25 lần).
  // Hồi quy: chặn nhờ zod 4.6.7 (T215).
  it('mảng keywords vượt max chỉ sinh lỗi giới hạn, không phản chiếu từng phần tử', async () => {
    const app = (await import('express')).default();
    app.use((await import('express')).default.json({ limit: '100kb' }));
    app.post('/x', validate(topicDraftSchema), (_req, res) => res.json({ ok: true }));
    app.use((err, _req, res, _next) => res.status(err.status ?? 500).json({ details: err.details }));
    const keywords = new Array(45_000).fill(1); // ≈ 90kb, lọt giới hạn 100kb
    const r = await request(app).post('/x').send({ keywords });
    expect(r.status).toBe(400);
    expect(Object.keys(r.body.details).length).toBeLessThanOrEqual(2);
    expect(r.text.length).toBeLessThan(1024);
  });

  // Hồi quy QD_ZOD §2: z.stringbool() (T215).
  it('ENABLE_SWAGGER="false" phải ra false', () => {
    expect(loadEnv({ ...testEnv, ENABLE_SWAGGER: 'false' }).ENABLE_SWAGGER).toBe(false);
  });

  it('query string dùng bộ phân tích simple (không dựng object lồng từ a[b]=1)', async () => {
    const express = (await import('express')).default;
    const app = express();
    app.get('/q', (req, res) => res.json(req.query));
    const r = await request(app).get('/q?a[b]=1&c=1&c=2');
    expect(r.body).toEqual({ 'a[b]': '1', c: ['1', '2'] });
  });
});
