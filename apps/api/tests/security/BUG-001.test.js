// BUG-001: lỗi body-parser 4xx khác (content-encoding lạ, gzip hỏng) → đúng status, mã + thông điệp tiếng Việt cố định,
// không lộ message gốc, ghi warn thay vì error. Giữ nguyên 400 BAD_JSON và 413 PAYLOAD_TOO_LARGE.
import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import pino from 'pino';
import { createApp } from '../../src/app.js';
import { createMemoryAuthRepo, fakeHasher, testEnv, student } from '../helpers.js';

const setup = () => {
  const logger = pino({ level: 'silent' });
  vi.spyOn(logger, 'error');
  vi.spyOn(logger, 'warn');
  return { logger, app: createApp({ env: testEnv, logger, authRepo: createMemoryAuthRepo([student]), hasher: fakeHasher }) };
};
const post = (app, enc, body) => {
  const r = request(app).post('/api/auth/login').set('content-type', 'application/json');
  return (enc ? r.set('content-encoding', enc) : r).send(body);
};

describe('BUG-001 – errorHandler lỗi body-parser 4xx', () => {
  it('content-encoding lạ → 415 UNSUPPORTED_MEDIA_TYPE, tiếng Việt, warn không error', async () => {
    const { app, logger } = setup();
    const r = await post(app, 'br-fake', '{}');
    expect(r.status).toBe(415);
    expect(r.body).toEqual({ error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Định dạng dữ liệu gửi lên không được hỗ trợ' } });
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it('gzip hỏng → 400 BAD_REQUEST, không lộ message gốc (zlib/tiếng Anh)', async () => {
    const { app, logger } = setup();
    const r = await post(app, 'gzip', 'khong-phai-gzip');
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: { code: 'BAD_REQUEST', message: 'Yêu cầu không hợp lệ' } });
    expect(r.text).not.toMatch(/header|check|zlib|incorrect/i);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('JSON hỏng vẫn 400 BAD_JSON như cũ', async () => {
    const { app, logger } = setup();
    const r = await post(app, undefined, '{"a":');
    expect(r.status).toBe(400);
    expect(r.body.error).toEqual({ code: 'BAD_JSON', message: 'JSON không hợp lệ' });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('body quá lớn vẫn 413 PAYLOAD_TOO_LARGE như cũ', async () => {
    const { app } = setup();
    const r = await post(app, undefined, JSON.stringify({ identifier: 'x', password: 'a'.repeat(200_000) }));
    expect(r.status).toBe(413);
    expect(r.body.error).toEqual({ code: 'PAYLOAD_TOO_LARGE', message: 'Dữ liệu gửi lên quá lớn' });
  });

  it('body sai schema vẫn 400 VALIDATION_ERROR như cũ', async () => {
    const { app } = setup();
    const r = await post(app, undefined, JSON.stringify({ identifier: 'x', password: 'a'.repeat(129) }));
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_ERROR');
  });
});
