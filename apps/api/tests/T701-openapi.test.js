import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { toOpenApiPath } from '../src/openapi/spec.js';
import { fakeHasher, testEnv, createMemoryAuthRepo } from './helpers.js';

// Repo giả: chỉ cần tồn tại để app mount mọi router; không route nào được gọi.
const stub = new Proxy({}, { get: () => async () => null });
const build = (env) => createApp({ env, logger: undefined, authRepo: createMemoryAuthRepo(), hasher: fakeHasher, catalogRepo: stub, roundRepo: stub, accountRepo: stub, topicRepo: stub, storage: stub });

describe('T701 OpenAPI', () => {
  it('production: /api/openapi.json và /api/docs trả 404', async () => {
    const app = build({ ...testEnv, NODE_ENV: 'production' });
    expect((await request(app).get('/api/openapi.json')).status).toBe(404);
    expect((await request(app).get('/api/docs')).status).toBe(404);
  });

  it('test/dev: 200, JSON OpenAPI 3, Swagger UI có, không lộ secret', async () => {
    const app = build({ ...testEnv, ENABLE_SWAGGER: true });
    const res = await request(app).get('/api/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toMatch(/^3\./);
    expect(res.body.info.title).toBeTruthy();
    expect(JSON.stringify(res.body)).not.toContain(testEnv.JWT_ACCESS_SECRET);
    const login = res.body.paths['/api/auth/login'].post;
    expect(login.requestBody.content['application/json'].schema.properties).toBeTruthy(); // sinh từ Zod loginSchema
    expect(login.security).toEqual([]);
    expect(res.body.paths['/api/rounds'].post.responses[403]).toBeTruthy();
    const docs = await request(app).get('/api/docs');
    expect(docs.status).toBe(200);
    expect(docs.text).toContain('swagger-ui');
  });

  it('mọi route đăng ký trong Express đều có trong tài liệu và ngược lại', async () => {
    const mounts = [];
    const orig = express.application.use;
    express.application.use = function (...a) {
      if (typeof a[0] === 'string' && a[1]?.stack) mounts.push([a[0], a[1]]);
      return orig.apply(this, a);
    };
    let doc;
    try {
      const app = build({ ...testEnv, ENABLE_SWAGGER: true });
      doc = (await request(app).get('/api/openapi.json')).body;
      const actual = new Set(['GET /api/health']); // route khai báo trực tiếp trên app
      for (const [prefix, router] of mounts) {
        for (const layer of router.stack) {
          if (layer.route) for (const m of Object.keys(layer.route.methods)) actual.add(`${m.toUpperCase()} ${toOpenApiPath(prefix + (layer.route.path === '/' ? '' : layer.route.path))}`);
          else expect(layer.handle.stack, 'router lồng chưa được hỗ trợ trong test').toBeUndefined();
        }
      }
      const documented = new Set(Object.entries(doc.paths).flatMap(([p, ops]) => Object.keys(ops).map((m) => `${m.toUpperCase()} ${p}`)));
      expect([...actual].filter((x) => !documented.has(x))).toEqual([]);
      expect([...documented].filter((x) => !actual.has(x))).toEqual([]);
      expect(actual.size).toBeGreaterThan(80);
    } finally {
      express.application.use = orig;
    }
  });
});
