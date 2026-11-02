// T207b bao-mat: parser multipart tự viết (lib/multipart.js) – giới hạn byte khi không có Content-Length (chunked),
// số phần, nhiều file, ranh giới hỏng, tên field sai. Không cần DB.
import { it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import express from 'express';
import { singleFileUpload } from '../../src/lib/multipart.js';

let server;
let port;
beforeAll(async () => {
  const app = express();
  app.post('/u', singleFileUpload({ fileSize: 1024, maxParts: 7, fieldSize: 64 }), (req, res) =>
    res.json({ size: req.file.size, name: req.file.originalname }),
  );
  app.use((err, _req, res, _next) => res.status(err.status ?? 500).json({ code: err.code }));
  server = app.listen(0);
  port = server.address().port;
});
afterAll(() => new Promise((r) => server.close(r)));

const B = 'XyZ';
const part = (name, body, filename) =>
  `--${B}\r\nContent-Disposition: form-data; name="${name}"${filename ? `; filename="${filename}"` : ''}\r\n\r\n${body}\r\n`;
const end = `--${B}--\r\n`;
// Gửi body theo từng chunk, không có Content-Length (Transfer-Encoding: chunked)
const send = (chunks, ct = `multipart/form-data; boundary=${B}`) =>
  new Promise((resolve, reject) => {
    const req = http.request({ port, path: '/u', method: 'POST', headers: { 'content-type': ct } }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve({ status: res.statusCode, body: d ? JSON.parse(d) : null }));
    });
    req.on('error', reject);
    for (const c of chunks) req.write(c);
    req.end();
  });

it('hợp lệ: một file đúng field → 200', async () => {
  const r = await send([part('file', 'a,b', 'u.csv') + end]);
  expect(r).toEqual({ status: 200, body: { size: 3, name: 'u.csv' } });
});

it('chunked không Content-Length, vượt giới hạn → 413 (không đọc hết vào RAM)', async () => {
  const big = Buffer.alloc(64 * 1024, 'a');
  const r = await send([`--${B}\r\nContent-Disposition: form-data; name="file"; filename="u.csv"\r\n\r\n`, big, big, '\r\n', end]);
  expect(r.status).toBe(413);
});

it('file vượt fileSize nhưng tổng body dưới ngưỡng slack → 413', async () => {
  const r = await send([part('file', 'a'.repeat(2000), 'u.csv') + end]);
  expect(r.status).toBe(413);
});

it.each([
  ['8 phần (> maxParts)', Array.from({ length: 7 }, (_, i) => part(`f${i}`, 'x')).join('') + part('file', 'a', 'u.csv') + end],
  ['hai file', part('file', 'a', 'u.csv') + part('file', 'b', 'v.csv') + end],
  ['file ở field khác', part('other', 'a', 'u.csv') + end],
  ['field văn bản quá dài', part('note', 'x'.repeat(100)) + part('file', 'a', 'u.csv') + end],
  ['có preamble trước biên', `rac\r\n${part('file', 'a', 'u.csv')}${end}`],
  ['thiếu biên kết thúc', part('file', 'a', 'u.csv')],
  ['không có file', part('note', 'x') + end],
])('%s → 400', async (_n, body) => {
  expect((await send([body])).status).toBe(400);
});

it('Content-Type không phải multipart / thiếu boundary → 400', async () => {
  expect((await send(['x'], 'text/csv')).status).toBe(400);
  expect((await send(['x'], 'multipart/form-data')).status).toBe(400);
});
