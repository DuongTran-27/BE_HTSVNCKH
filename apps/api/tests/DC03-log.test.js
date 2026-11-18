import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import express from 'express';
import pinoHttp from 'pino-http';
import request from 'supertest';
import { createLogger, logReq } from '../src/lib/logger.js';

// Review TASK-DC-03 bao-mat m1: log request không được chứa code/state của callback Google
describe('DC03 log callback SSO', () => {
  it('query của /api/auth/google/callback bị bỏ, đường dẫn khác giữ nguyên', async () => {
    let out = '';
    const sink = new Writable({ write(chunk, _e, cb) { out += chunk; cb(); } });
    const app = express();
    app.use(pinoHttp({ logger: createLogger({ NODE_ENV: 'production' }, sink), serializers: { req: logReq } }));
    app.get('*splat', (_req, res) => res.sendStatus(204));
    await request(app).get('/api/auth/google/callback?code=ma-bi-mat&state=st-bi-mat');
    await request(app).get('/api/topics?q=abc');
    expect(out).not.toContain('bi-mat');
    const urls = out.trim().split('\n').map((l) => JSON.parse(l).req.url);
    expect(urls).toEqual(['/api/auth/google/callback', '/api/topics?q=abc']);
  });
});
