// T403 (FR11, FR24, FR17 §5.6, FR26 §5.7): upload/link/danh sách/tải về tài liệu. DB test thật, kho file giả trong bộ nhớ (không gọi Cloudinary).
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { v2 as cloudinary } from 'cloudinary';
import { createApp } from '../src/app.js';
import { createAuthRepo } from '../src/modules/auth/prismaRepo.js';
import { createTopicRepo } from '../src/modules/topics/prismaRepo.js';
import { createMemoryStorage, createCloudinaryStorage, defaultStorageFolder } from '../src/lib/storage.js';
import { sanitizeFileName, contentMatches, toUploadError } from '../src/lib/upload.js';
import { loadEnv } from '../src/config/env.js';
import { runCleanup } from '../scripts/cleanup-orphans.js';
import { fakeHasher, testEnv } from './helpers.js';
import { prisma, S, U, seedBase, mkTopic, mkRound, mkWaiting, get, as, act, day } from './t214-kit.js';

const mem = createMemoryStorage();
const app = createApp({ env: testEnv, logger: undefined, authRepo: createAuthRepo(prisma), hasher: fakeHasher, topicRepo: createTopicRepo(prisma), storage: mem });

const PDF = Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\n%%EOF');
const DOCX = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('....[Content_Types].xml....word/document.xml')]);
const upload = (who, t, { buf = PDF, name = 'bao-cao.pdf', stage = 'PROPOSAL', milestoneId } = {}) => {
  const r = request(app).post(`/api/topics/${t.id}/documents`).set(as(who)).field('stage', stage);
  if (milestoneId) r.field('milestoneId', milestoneId);
  return buf ? r.attach('file', buf, name) : r;
};
const link = (who, t, o = {}) => request(app).post(`/api/topics/${t.id}/documents/links`).set(as(who)).send({ stage: 'PROPOSAL', title: 'Mã nguồn', url: 'https://github.com/x/y', ...o });
const dl = (who, id) => request(app).post(`/api/documents/${id}/download-url`).set(as(who)).send({});
const list = (who, t, q = '') => get(who, `/api/topics/${t.id}/documents${q}`);
const code = (r) => r.body.error?.code;

let n = 0;
// Mỗi đề tài một trưởng nhóm riêng (limiter 20/15 phút theo người dùng)
const mk = async (status = 'DRAFT', { round = S.round, advisor = true } = {}) => {
  const leader = `s${++n}`;
  const t = await mkTopic(leader, round, { status });
  if (advisor && status !== 'DRAFT') await prisma.advising.create({ data: { topicId: t.id, lecturerId: U.lecA.id } });
  return { t, leader };
};
const mkMilestone = (t, o = {}) => prisma.milestone.create({ data: { topicId: t.id, order: 1, name: 'Giữa kỳ', output: 'Báo cáo', dueAt: new Date(Date.now() + day), createdById: U.lecA.id, ...o } });
const mkDoc = (t, o = {}) => prisma.document.create({ data: { topicId: t.id, stage: 'PROPOSAL', kind: 'LINK', externalUrl: 'https://x.vn', fileName: 'L', version: 1, status: 'READY', uploadedById: U.s1.id, ...o } });

beforeAll(() => seedBase({ students: 70 }), 60000);
beforeEach(() => Object.assign(mem, { failUpload: false, failSign: false, failDestroy: false, tamper: null }));
afterAll(() => prisma.$disconnect());

describe('POST /api/topics/:id/documents – upload file (FR11)', () => {
  it('thành viên nộp đề cương ở DRAFT: 201, phiên bản mới không ghi đè, mime do server gán, không lộ publicId, AuditLog', async () => {
    const { t, leader } = await mk('DRAFT');
    const r1 = await upload(leader, t, { name: 'C:\\Users\\a\\Đề cương<1>.pdf' });
    expect(r1.status, JSON.stringify(r1.body)).toBe(201);
    expect(r1.body.document).toMatchObject({ stage: 'PROPOSAL', kind: 'FILE', version: 1, fileName: 'Đề cương1.pdf', mimeType: 'application/pdf', sizeBytes: PDF.length, isLate: false, isLatest: true, milestoneId: null, externalUrl: null });
    expect(r1.body.document).not.toHaveProperty('publicId');
    const r2 = await upload(leader, t, { buf: DOCX, name: 'v2.docx' });
    expect([r2.status, r2.body.document.version, r2.body.document.mimeType]).toEqual([201, 2, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']);
    const rows = await prisma.document.findMany({ where: { topicId: t.id }, orderBy: { version: 'asc' } });
    expect(rows.map((d) => [d.version, d.status])).toEqual([[1, 'READY'], [2, 'READY']]);
    for (const d of rows) {
      expect(d.publicId).toMatch(new RegExp(`^nckh/test/topics/${t.id}/[0-9a-f-]{36}\\.(pdf|docx)$`));
      expect(mem.files.has(d.publicId)).toBe(true); // xác minh tồn tại trên kho trước khi ghi DB
    }
    const a = await prisma.auditLog.findFirst({ where: { action: 'DOCUMENT_UPLOAD', entityId: rows[0].id } });
    expect(a).toMatchObject({ actorId: U[leader].id, entityType: 'Document' });
    expect(a.after).toMatchObject({ documentId: rows[0].id, stage: 'PROPOSAL', version: 1, sizeBytes: PDF.length, isLate: false });
  });

  it('401/403 trước khi đọc file: chưa đăng nhập, GVHD, cán bộ, SV ngoài nhóm, ADMIN; không gọi kho', async () => {
    const { t } = await mk('IN_PROGRESS');
    const before = mem.calls.upload;
    expect((await request(app).post(`/api/topics/${t.id}/documents`).field('stage', 'PROPOSAL').attach('file', PDF, 'a.pdf')).status).toBe(401);
    for (const who of ['lecA', 'staff1', 's70', 'admin']) expect((await upload(who, t)).status, who).toBe(403);
    expect(mem.calls.upload).toBe(before);
    expect(await prisma.document.count({ where: { topicId: t.id } })).toBe(0);
  });

  it('409 theo trạng thái và stage: đề cương ngoài DRAFT/NEEDS_REVISION, tài liệu mốc ngoài IN_PROGRESS, đề tài đã đóng', async () => {
    const a = await mk('IN_PROGRESS');
    expect(code(await upload(a.leader, a.t))).toBe('TOPIC_NOT_EDITABLE');
    const b = await mk('DRAFT');
    const m = await mkMilestone(b.t);
    expect(code(await upload(b.leader, b.t, { stage: 'MIDTERM', milestoneId: m.id }))).toBe('TOPIC_NOT_IN_PROGRESS');
    const c = await mk('CLOSED');
    const r = await upload(c.leader, c.t);
    expect([r.status, code(r)]).toEqual([409, 'TOPIC_NOT_EDITABLE']);
    const d = await mk('NEEDS_REVISION');
    expect((await upload(d.leader, d.t)).status).toBe(201);
  });

  it('tài liệu mốc: nhãn nộp muộn theo giờ server; mốc đã Đạt 409; mốc đề tài khác 404', async () => {
    const { t, leader } = await mk('IN_PROGRESS');
    const late = await mkMilestone(t, { dueAt: new Date(Date.now() - 60000) });
    const onTime = await mkMilestone(t, { order: 2 });
    const r1 = await upload(leader, t, { stage: 'MIDTERM', milestoneId: late.id });
    expect([r1.status, r1.body.document.isLate, r1.body.document.milestoneId]).toEqual([201, true, late.id]);
    const r2 = await upload(leader, t, { stage: 'FINAL', milestoneId: onTime.id });
    expect([r2.status, r2.body.document.isLate, r2.body.document.version]).toEqual([201, false, 1]);
    const passed = await mkMilestone(t, { order: 3, evaluation: 'PASSED' });
    expect(code(await upload(leader, t, { stage: 'FINAL', milestoneId: passed.id }))).toBe('MILESTONE_ALREADY_PASSED');
    const other = await mk('IN_PROGRESS');
    const mo = await mkMilestone(other.t);
    expect((await upload(leader, t, { stage: 'MIDTERM', milestoneId: mo.id })).status).toBe(404);
  });

  it('400: sai loại theo đuôi, nội dung không khớp đuôi, thiếu file, field sai, file thừa; 413 quá 10 MB', async () => {
    const { t, leader } = await mk('DRAFT');
    const bad = async (o, field = 'file') => {
      const r = await upload(leader, t, o);
      expect([r.status, code(r)], JSON.stringify(o.name ?? o)).toEqual([400, 'VALIDATION_ERROR']);
      expect(r.body.error.details).toHaveProperty(field);
    };
    await bad({ name: 'virus.exe' });
    await bad({ buf: Buffer.from('MZ not a pdf'), name: 'gia.pdf' });
    await bad({ buf: Buffer.concat([Buffer.from([0x50, 0x4b, 3, 4]), Buffer.from('[Content_Types].xml ppt/')]), name: 'sai.docx' });
    await bad({ buf: null });
    await bad({ stage: 'XYZ' }, 'stage');
    const m = await mkMilestone(t);
    await bad({ milestoneId: m.id }, 'milestoneId'); // đề cương không gắn mốc
    const extra = await request(app).post(`/api/topics/${t.id}/documents`).set(as(leader)).field('stage', 'PROPOSAL').attach('khac', PDF, 'a.pdf');
    expect([extra.status, code(extra)]).toEqual([400, 'VALIDATION_ERROR']);
    const big = await upload(leader, t, { buf: Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024)]) });
    expect([big.status, code(big)]).toEqual([413, 'PAYLOAD_TOO_LARGE']);
    expect(await prisma.document.count({ where: { topicId: t.id } })).toBe(0);
  });

  it('giới hạn theo cấu hình đợt: đuôi không cho phép 400, vượt maxFileSizeMB 413', async () => {
    const round = await mkRound(S.F1.id, 'Đợt chỉ PDF 1MB', { allowedFileTypes: ['pdf'], maxFileSizeMB: 1 });
    const { t, leader } = await mk('DRAFT', { round });
    expect(code(await upload(leader, t, { buf: DOCX, name: 'a.docx' }))).toBe('VALIDATION_ERROR');
    const r = await upload(leader, t, { buf: Buffer.concat([PDF, Buffer.alloc(1024 * 1024)]) });
    expect([r.status, code(r)]).toEqual([413, 'PAYLOAD_TOO_LARGE']);
  });

  it('503 STORAGE_UNAVAILABLE khi kho lỗi hoặc không xác minh được; không ghi DB, file hỏng bị xóa', async () => {
    const { t, leader } = await mk('DRAFT');
    mem.failUpload = true;
    const r1 = await upload(leader, t);
    expect([r1.status, code(r1)]).toEqual([503, 'STORAGE_UNAVAILABLE']);
    mem.failUpload = false;
    mem.tamper = (x) => ({ ...x, bytes: x.bytes - 1 });
    const filesBefore = mem.files.size;
    const r2 = await upload(leader, t);
    expect([r2.status, code(r2)]).toEqual([503, 'STORAGE_UNAVAILABLE']);
    expect(mem.files.size).toBe(filesBefore); // đã destroy bản không xác minh được
    expect(await prisma.document.count({ where: { topicId: t.id } })).toBe(0);
  });

  it('409 DOCUMENT_VERSION_LIMIT: transaction lỗi thì xóa file vừa tải', async () => {
    const { t, leader } = await mk('DRAFT');
    for (let v = 1; v <= 50; v++) await mkDoc(t, { version: v, uploadedById: U[leader].id });
    const filesBefore = mem.files.size;
    const r = await upload(leader, t);
    expect([r.status, code(r)]).toEqual([409, 'DOCUMENT_VERSION_LIMIT']);
    expect(mem.files.size).toBe(filesBefore);
  });

  it('hai upload đồng thời cùng chuỗi: version 1 và 2, không trùng', async () => {
    const { t, leader } = await mk('DRAFT');
    const rs = await Promise.all([upload(leader, t), upload(leader, t)]);
    expect(rs.map((r) => r.status)).toEqual([201, 201]);
    expect(rs.map((r) => r.body.document.version).sort()).toEqual([1, 2]);
  });

  it('429 sau 20 lần/15 phút (đếm cả upload và link)', async () => {
    const { t } = await mk('DRAFT');
    for (let i = 0; i < 10; i++) expect((await upload('s69', t)).status).toBe(403);
    for (let i = 0; i < 10; i++) expect((await link('s69', t)).status).toBe(403);
    expect(code(await upload('s69', t))).toBe('RATE_LIMITED');
  });
});

describe('POST /api/topics/:id/documents/links – nộp bằng link', () => {
  it('201 kind LINK, cùng chuỗi phiên bản với file; AuditLog DOCUMENT_LINK', async () => {
    const { t, leader } = await mk('IN_PROGRESS');
    const m = await mkMilestone(t, { dueAt: new Date(Date.now() - 1000) });
    await upload(leader, t, { stage: 'FINAL', milestoneId: m.id });
    const r = await link(leader, t, { stage: 'FINAL', milestoneId: m.id, url: 'https://drive.google.com/file/abc' });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.document).toMatchObject({ kind: 'LINK', version: 2, fileName: 'Mã nguồn', externalUrl: 'https://drive.google.com/file/abc', mimeType: null, sizeBytes: null, isLate: true });
    expect(await prisma.auditLog.count({ where: { action: 'DOCUMENT_LINK', entityId: r.body.document.id } })).toBe(1);
  });
  it('400 link không phải https; 403 GVHD/ngoài nhóm/ADMIN; 409 sai trạng thái', async () => {
    const { t, leader } = await mk('DRAFT');
    for (const url of ['http://x.vn', 'javascript:alert(1)', 'ftp://x.vn']) expect((await link(leader, t, { url })).status, url).toBe(400);
    for (const who of ['lecA', 's68', 'admin']) expect((await link(who, t)).status, who).toBe(403);
    expect((await link('lecA', t, { url: 'bad' })).status).toBe(403); // kiểm quyền trước validate
    expect((await link(leader, t, { url: 'https://u:p@evil.vn/x' })).status).toBe(400);
    const c = await mk('UNDER_REVIEW');
    expect(code(await link(c.leader, c.t))).toBe('TOPIC_NOT_EDITABLE');
  });
});

describe('GET /api/topics/:id/documents', () => {
  it('thành viên/GVHD/cán bộ đọc; isLatest + latestOnly; người ngoài, cán bộ khoa khác, ADMIN 403', async () => {
    const { t, leader } = await mk('IN_PROGRESS');
    const m = await mkMilestone(t);
    for (let i = 0; i < 2; i++) await upload(leader, t, { stage: 'MIDTERM', milestoneId: m.id });
    for (const who of [leader, 'lecA', 'staff1']) {
      const r = await list(who, t);
      expect(r.status, who).toBe(200);
      expect(r.body.items.map((d) => [d.version, d.isLatest])).toEqual([[2, true], [1, false]]);
      expect(r.body.items[0]).not.toHaveProperty('publicId');
    }
    expect((await list(leader, t, '?latestOnly=true')).body.items.map((d) => d.version)).toEqual([2]);
    expect((await list(leader, t, '?latestOnly=1')).status).toBe(400);
    for (const who of ['s67', 'lecB', 'staff2', 'admin']) expect((await list(who, t)).status, who).toBe(403);
  });
  it('isLatest tính trên cả chuỗi mốc dù lọc ?stage', async () => {
    const { t, leader } = await mk('IN_PROGRESS');
    const m = await mkMilestone(t);
    await upload(leader, t, { stage: 'MIDTERM', milestoneId: m.id });
    await upload(leader, t, { stage: 'FINAL', milestoneId: m.id });
    const r = await list(leader, t, '?stage=MIDTERM');
    expect(r.body.items.map((d) => [d.stage, d.isLatest])).toEqual([['MIDTERM', false]]);
  });
  it('GV được đề nghị chỉ xem đề cương (G23)', async () => {
    const t = await mkWaiting(`s${++n}`, 'lecB');
    await mkDoc(t, { uploadedById: U.s1.id });
    expect((await list('lecB', t, '?stage=PROPOSAL')).body.items).toHaveLength(1);
    expect((await list('lecB', t)).status).toBe(403);
  });
});

describe('POST /api/documents/:id/download-url (FR24)', () => {
  it('cấp URL ký 5 phút chế độ attachment, no-store; mỗi lần tải ghi lịch sử', async () => {
    const { t, leader } = await mk('IN_PROGRESS');
    const m = await mkMilestone(t);
    const d = (await upload(leader, t, { stage: 'MIDTERM', milestoneId: m.id })).body.document;
    for (const who of [leader, 'lecA', 'staff1']) {
      const r = await dl(who, d.id);
      expect(r.status, who).toBe(200);
      expect(r.headers['cache-control']).toBe('no-store');
      const ttl = Date.parse(r.body.expiresAt) - Date.now();
      expect(ttl).toBeGreaterThan(290000);
      expect(ttl).toBeLessThanOrEqual(300000);
      expect(r.body.url).toContain('attachment=true');
      expect(r.body.url).toContain(`expires_at=${Math.floor(Date.parse(r.body.expiresAt) / 1000)}`);
    }
    const logs = await prisma.auditLog.findMany({ where: { action: 'DOCUMENT_DOWNLOAD', entityId: d.id } });
    expect(logs.map((l) => l.actorId).sort()).toEqual([U[leader].id, U.lecA.id, U.staff1.id].sort());
    expect(logs[0].after).toEqual({ topicId: t.id, version: 1 });
  });
  it('403 người ngoài/ADMIN (không ghi lịch sử); 404 không có; 400 tài liệu link; 503 khi không ký được', async () => {
    const { t, leader } = await mk('DRAFT');
    const d = (await upload(leader, t)).body.document;
    for (const who of ['s66', 'lecB', 'staff1', 'admin']) expect((await dl(who, d.id)).status, who).toBe(403); // staff1: DRAFT ngoài phạm vi đọc
    expect(await prisma.auditLog.count({ where: { action: 'DOCUMENT_DOWNLOAD', entityId: d.id } })).toBe(0);
    expect((await dl(leader, 'khongco123')).status).toBe(404);
    const l = (await link(leader, t)).body.document;
    expect([(await dl(leader, l.id)).status, code(await dl(leader, l.id))]).toEqual([400, 'VALIDATION_ERROR']);
    mem.failSign = true;
    expect(code(await dl(leader, d.id))).toBe('STORAGE_UNAVAILABLE');
  });
});

describe('snapshot gắn tài liệu đề cương (FR17, §5.6)', () => {
  it('SUBMIT_FOR_REVIEW lưu documentIds = bản đề cương mới nhất; GET submission trả documents', async () => {
    const { t, leader } = await mk('HAS_ADVISOR');
    await mkDoc(t, { version: 1, uploadedById: U[leader].id });
    const v2 = await mkDoc(t, { version: 2, fileName: 'Đề cương v2', uploadedById: U[leader].id });
    const r = await act(leader, t, { action: 'SUBMIT_FOR_REVIEW' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const s = await prisma.submission.findUnique({ where: { id: r.body.submission.id } });
    expect(s.payload.documentIds).toEqual([v2.id]);
    const g = await get(leader, `/api/topics/${t.id}/submissions/1`);
    expect(g.body.submission.payload.documents).toEqual([{ id: v2.id, fileName: 'Đề cương v2', kind: 'LINK', version: 2, uploadedAt: v2.uploadedAt.toISOString() }]);
  });
});

describe('thuần: upload.js, storage.js, env', () => {
  it('sanitizeFileName, contentMatches, toUploadError', () => {
    expect(sanitizeFileName('../../etc/pa:ss*wd?.pdf', 'pdf')).toBe('passwd.pdf');
    expect(sanitizeFileName(Buffer.from('a‮xc​od.pdf').toString('latin1'), 'pdf')).toBe('axcod.pdf');
    expect(sanitizeFileName('<>|.pdf', 'pdf')).toBe('tai-lieu.pdf');
    expect(sanitizeFileName(`${'a'.repeat(300)}.docx`, 'docx')).toHaveLength(200);
    expect(sanitizeFileName(Buffer.from('Báo cáo.pdf').toString('latin1'), 'pdf')).toBe('Báo cáo.pdf');
    expect(contentMatches('pdf', PDF)).toBe(true);
    expect(contentMatches('xlsx', DOCX)).toBe(false);
    expect(contentMatches('exe', PDF)).toBe(false);
    expect(toUploadError(new Error('Unexpected end of form'))).toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });

  it('createCloudinaryStorage gọi SDK đúng tham số raw/authenticated/overwrite=false; URL ký có attachment + expires_at', async () => {
    const seen = {};
    const sdk = {
      uploader: {
        upload_stream: (opts, cb) => { seen.upload = opts; return { end: (b) => cb(null, { public_id: opts.public_id, bytes: b.length, type: 'authenticated', resource_type: 'raw' }) }; },
        destroy: async (id, opts) => { seen.destroy = [id, opts]; },
      },
      utils: { private_download_url: (...a) => { seen.sign = a; return 'u'; } },
      api: { resources: async (o) => { seen.list = o; return { resources: [{ public_id: 'p', bytes: 1, created_at: 'c', x: 1 }], next_cursor: undefined }; } },
    };
    const s = createCloudinaryStorage({ cloudinary: sdk });
    expect(await s.upload(PDF, { publicId: 'f/a.pdf' })).toMatchObject({ public_id: 'f/a.pdf', bytes: PDF.length });
    expect(seen.upload).toMatchObject({ resource_type: 'raw', type: 'authenticated', public_id: 'f/a.pdf', overwrite: false });
    await s.destroy('f/a.pdf');
    expect(seen.destroy[1]).toMatchObject({ resource_type: 'raw', type: 'authenticated' });
    s.signedDownloadUrl('f/a.pdf', { expiresAt: new Date(1_800_000_000_500), attachment: true });
    expect(seen.sign).toEqual(['f/a.pdf', '', { resource_type: 'raw', type: 'authenticated', expires_at: 1_800_000_000, attachment: true }]);
    expect(await s.list({ prefix: 'f/' })).toEqual({ resources: [{ public_id: 'p', bytes: 1, created_at: 'c' }], next_cursor: null });
    expect(seen.list).toMatchObject({ resource_type: 'raw', type: 'authenticated', prefix: 'f/' });
  });

  it('SDK cloudinary thật (không gọi mạng): private_download_url là URL API có hạn, không phải URL giao hàng cố định', () => {
    cloudinary.config({ cloud_name: 'demo', api_key: '123', api_secret: 'khong-phai-bi-mat' });
    const url = createCloudinaryStorage({ cloudinary }).signedDownloadUrl('nckh/test/a.pdf', { expiresAt: new Date(1_800_000_000_000), attachment: true });
    expect(url).toMatch(/^https:\/\/api\.cloudinary\.com\/v1_1\/demo\/raw\/download\?/);
    expect(url).toContain('attachment=true');
    expect(url).toContain('expires_at=1800000000');
    expect(url).toContain('type=authenticated');
    expect(url).not.toContain('res.cloudinary.com');
  });

  it('env: production thiếu CLOUDINARY_URL thì báo lỗi; thư mục mặc định nckh/<NODE_ENV>', () => {
    const base = { DATABASE_URL: 'postgresql://x/y', JWT_ACCESS_SECRET: 'x'.repeat(40) };
    expect(() => loadEnv({ ...base, NODE_ENV: 'production' })).toThrow(/CLOUDINARY_URL/);
    expect(loadEnv({ ...base, NODE_ENV: 'production', CLOUDINARY_URL: 'cloudinary://a:b@c' }).NODE_ENV).toBe('production');
    expect(defaultStorageFolder({ NODE_ENV: 'production' })).toBe('nckh/production');
    expect(defaultStorageFolder({ NODE_ENV: 'test', CLOUDINARY_FOLDER: 'khac' })).toBe('khac');
  });
});

describe('cleanup-orphans (FR26, §5.7)', () => {
  const old = new Date(Date.now() - 2 * day).toISOString();
  const fakeDb = (docs) => {
    const audits = [];
    return {
      audits,
      document: { findMany: async () => docs, count: async ({ where }) => docs.filter((d) => d.publicId === where.publicId).length },
      auditLog: { create: async ({ data }) => audits.push(data) },
    };
  };
  const mkStore = () => {
    const s = createMemoryStorage({ now: () => new Date(old) });
    for (const id of ['f/a', 'f/b', 'f/c', 'g/x']) s.files.set(id, { bytes: 7, created_at: old });
    return s;
  };

  it('dry-run: liệt kê đủ các trang theo tiền tố, không xóa gì', async () => {
    const s = mkStore();
    const db = fakeDb([{ id: 'd1', publicId: 'f/a', status: 'READY', uploadedAt: new Date() }]);
    const r = await runCleanup({ prisma: db, storage: s, folder: 'f', log: () => {} });
    expect(r.storageOrphans.map((f) => f.publicId)).toEqual(['f/b', 'f/c']);
    expect([r.deleted, s.files.size, db.audits.length]).toEqual([[], 4, 0]);
  });

  it('--apply: xóa mồ côi, ghi AuditLog từng file; không đụng file có Document; lỗi một file vẫn chạy tiếp', async () => {
    const s = mkStore();
    s.files.set('f/moi', { bytes: 1, created_at: new Date().toISOString() }); // < 24h: giữ
    const db = fakeDb([{ id: 'd1', publicId: 'f/a', status: 'READY', uploadedAt: new Date() }]);
    const r = await runCleanup({ prisma: db, storage: s, folder: 'f', apply: true, maxDelete: 10, log: () => {} });
    expect(r.deleted).toEqual(['f/b', 'f/c']);
    expect([...s.files.keys()].sort()).toEqual(['f/a', 'f/moi', 'g/x']);
    expect(db.audits).toEqual(['f/b', 'f/c'].map((id) => ({ actorId: null, action: 'STORAGE_ORPHAN_DELETE', entityType: 'StorageObject', entityId: id, before: undefined, after: { bytes: 7, createdAt: old }, ip: null })));
    const s2 = mkStore();
    s2.failDestroy = true;
    const r2 = await runCleanup({ prisma: fakeDb([]), storage: s2, folder: 'f', apply: true, maxDelete: 10, log: () => {} });
    expect([r2.deleted.length, r2.failed.length]).toEqual([0, 3]);
  });

  it('--apply: chốt chặn ngưỡng (>10% hoặc >10 file) trừ khi --max-delete đủ lớn; ghi AuditLog lỗi thì không xóa', async () => {
    const s = mkStore();
    await expect(runCleanup({ prisma: fakeDb([]), storage: s, folder: 'f', apply: true, log: () => {} })).rejects.toThrow(/TỪ CHỐI/);
    await expect(runCleanup({ prisma: fakeDb([]), storage: s, folder: 'f', apply: true, maxDelete: 2, log: () => {} })).rejects.toThrow(/TỪ CHỐI/);
    expect(s.files.size).toBe(4);
    expect((await runCleanup({ prisma: fakeDb([]), storage: s, folder: 'f', apply: true, maxDelete: 3, log: () => {} })).deleted).toHaveLength(3);
    const s2 = mkStore();
    const db = fakeDb([]);
    db.auditLog.create = async () => { throw new Error('audit down'); };
    const r = await runCleanup({ prisma: db, storage: s2, folder: 'f', apply: true, maxDelete: 10, log: () => {} });
    expect([r.deleted.length, r.failed.length, s2.files.size]).toEqual([0, 3, 4]);
  });

  it('--apply kiểm lại ngay trước khi xóa: file vừa có Document tham chiếu thì giữ', async () => {
    const s = mkStore();
    const docs = [];
    const db = fakeDb(docs);
    db.document.findMany = async () => []; // lúc liệt kê chưa có
    docs.push({ id: 'd9', publicId: 'f/b' }); // lúc xóa đã có
    const r = await runCleanup({ prisma: db, storage: s, folder: 'f', apply: true, maxDelete: 10, log: () => {} });
    expect(r.deleted).toEqual(['f/a', 'f/c']);
    expect(s.files.has('f/b')).toBe(true);
  });
});
