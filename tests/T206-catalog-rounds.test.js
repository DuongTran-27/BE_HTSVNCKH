// T206 (FR04, FR25, FR15): API danh mục + đợt trên DB test thật qua supertest. Dữ liệu riêng, resetData ở beforeAll.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../src/app.js';
import { createAuthRepo } from '../src/modules/auth/prismaRepo.js';
import { createCatalogRepo } from '../src/modules/catalog/prismaRepo.js';
import { createRoundRepo } from '../src/modules/rounds/prismaRepo.js';
import { signAccessToken } from '../src/lib/tokens.js';
import { fakeHasher, testEnv } from './helpers.js';
import { resetData } from './db.js';

const prisma = new PrismaClient();
const app = createApp({
  env: testEnv,
  logger: undefined,
  authRepo: createAuthRepo(prisma),
  hasher: fakeHasher,
  catalogRepo: createCatalogRepo(prisma),
  roundRepo: createRoundRepo(prisma),
});

let F1;
let F2;
const tok = {};
const as = (who) => ({ Authorization: `Bearer ${tok[who]}` });
const get = (who, url) => request(app).get(url).set(as(who));
const post = (who, url, body) => request(app).post(url).set(as(who)).send(body);
const patch = (who, url, body) => request(app).patch(url).set(as(who)).send(body);
const audits = (entityType, entityId) =>
  prisma.auditLog.findMany({ where: { entityType, entityId }, orderBy: { id: 'asc' } });

const dates = {
  regOpenAt: '2026-11-01T00:00:00+07:00',
  regCloseAt: '2026-12-01T00:00:00+07:00',
  reviewDeadline: '2027-01-01T00:00:00+07:00',
  endAt: '2027-06-30T00:00:00+07:00',
};
const roundBody = (extra = {}) => ({
  facultyId: F1.id,
  name: 'Đợt NCKH 2026-2027',
  academicYear: '2026-2027',
  ...dates,
  ...extra,
});

beforeAll(async () => {
  await resetData(prisma);
  F1 = await prisma.faculty.create({ data: { code: 'CNTT', name: 'Công nghệ thông tin' } });
  F2 = await prisma.faculty.create({ data: { code: 'KT', name: 'Kinh tế' } });
  const mk = async (key, role, extra = {}) => {
    const u = await prisma.user.create({
      data: {
        code: key,
        email: `${key}@t.vn`,
        fullName: key,
        passwordHash: 'x',
        role,
        mustChangePassword: false,
        ...extra,
      },
    });
    tok[key] = signAccessToken(u, { secret: testEnv.JWT_ACCESS_SECRET, ttlSeconds: 600 });
    return u;
  };
  await mk('admin', 'ADMIN');
  const s1 = await mk('staff1', 'STAFF', { facultyId: F1.id });
  const s2 = await mk('staff2', 'STAFF', { facultyId: F2.id });
  await prisma.staffScope.createMany({
    data: [
      { userId: s1.id, facultyId: F1.id },
      { userId: s2.id, facultyId: F2.id },
    ],
  });
  await mk('lect', 'LECTURER', { facultyId: F1.id });
  await mk('stud', 'STUDENT', { facultyId: F1.id });
  await mk('studF2', 'STUDENT', { facultyId: F2.id });
  await mk('mustChange', 'STAFF', { mustChangePassword: true });
}, 60000);
afterAll(() => prisma.$disconnect());

describe('danh mục – quyền (FR25) và CRUD (FR04)', () => {
  it('chưa đăng nhập 401; phải đổi mật khẩu trước 403 PASSWORD_CHANGE_REQUIRED', async () => {
    expect((await request(app).get('/api/faculties')).status).toBe(401);
    const r = await get('mustChange', '/api/rounds');
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
  });

  it('khoa: ADMIN tạo được (201) + AuditLog CATALOG_CREATE; STAFF/LECTURER/STUDENT 403', async () => {
    for (const who of ['staff1', 'lect', 'stud']) {
      const r = await post(who, '/api/faculties', { code: 'X1', name: 'X' });
      expect(r.status, who).toBe(403);
    }
    const r = await post('admin', '/api/faculties', { code: 'TOAN', name: 'Toán' });
    expect(r.status).toBe(201);
    expect(r.body.item).toMatchObject({ code: 'TOAN', name: 'Toán', isActive: true });
    const [a] = await audits('Faculty', r.body.item.id);
    expect(a).toMatchObject({ action: 'CATALOG_CREATE', before: null });
    expect(a.after).toMatchObject({ code: 'TOAN' });
    expect(a.actorId).toBeTruthy();
  });

  it('mã sai định dạng 400; trùng mã 409 DUPLICATE có details.code', async () => {
    const bad = await post('admin', '/api/faculties', { code: 'có dấu', name: 'X' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details.code).toBeTruthy();
    const dup = await post('admin', '/api/faculties', { code: 'CNTT', name: 'Khác' });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toMatchObject({ code: 'DUPLICATE', details: { code: 'Đã tồn tại' } });
  });

  it('TC-FR04-01 sửa tên + ngừng dùng thay vì xóa; không đổi được code; không có DELETE; audit before/after', async () => {
    const f = await prisma.faculty.create({ data: { code: 'TMP', name: 'Cũ' } });
    const r = await patch('admin', `/api/faculties/${f.id}`, { name: 'Mới', isActive: false, code: 'DOI' });
    expect(r.status).toBe(200);
    expect(r.body.item).toMatchObject({ code: 'TMP', name: 'Mới', isActive: false });
    const [a] = await audits('Faculty', f.id);
    expect(a).toMatchObject({
      action: 'CATALOG_UPDATE',
      before: { name: 'Cũ', isActive: true },
      after: { name: 'Mới', isActive: false },
    });
    expect((await request(app).delete(`/api/faculties/${f.id}`).set(as('admin'))).status).toBe(404);
    expect(await prisma.faculty.count({ where: { id: f.id } })).toBe(1);
    expect((await patch('admin', `/api/faculties/${f.id}`, {})).status).toBe(400);
    expect((await patch('admin', '/api/faculties/khong-co', { name: 'x' })).status).toBe(404);
  });

  it('danh sách: mặc định ẩn mục ngừng dùng; includeInactive chỉ ADMIN/STAFF; mọi vai trò đọc được', async () => {
    const codes = (r) => r.body.items.map((x) => x.code);
    for (const who of ['admin', 'staff1', 'lect', 'stud']) {
      const r = await get(who, '/api/faculties');
      expect(r.status, who).toBe(200);
      expect(codes(r)).toContain('CNTT');
      expect(codes(r)).not.toContain('TMP');
    }
    expect(codes(await get('admin', '/api/faculties?includeInactive=true'))).toContain('TMP');
    expect(codes(await get('staff1', '/api/faculties?includeInactive=true'))).toContain('TMP');
    expect((await get('stud', '/api/faculties?includeInactive=true')).status).toBe(403);
    expect((await get('stud', '/api/faculties?includeInactive=maybe')).status).toBe(400);
    expect(codes(await get('stud', '/api/faculties?q=toán'))).toEqual(['TOAN']);
  });

  it('ngành: STAFF chỉ trong phạm vi khoa, ADMIN mọi khoa; LECTURER 403; cha ngừng dùng/không tồn tại 400', async () => {
    expect((await post('lect', '/api/majors', { facultyId: F1.id, code: 'M0', name: 'x' })).status).toBe(403);
    expect((await post('staff1', '/api/majors', { facultyId: F2.id, code: 'M0', name: 'x' })).status).toBe(403);
    const ok = await post('staff1', '/api/majors', { facultyId: F1.id, code: 'KTPM', name: 'Kỹ thuật phần mềm' });
    expect(ok.status).toBe(201);
    expect((await post('admin', '/api/majors', { facultyId: F2.id, code: 'TCNH', name: 'Tài chính' })).status).toBe(
      201,
    );
    const inactive = await prisma.faculty.findUnique({ where: { code: 'TMP' } });
    const r = await post('admin', '/api/majors', { facultyId: inactive.id, code: 'M9', name: 'x' });
    expect(r.status).toBe(400);
    expect(r.body.error.details.facultyId).toBeTruthy();
    expect((await post('admin', '/api/majors', { facultyId: 'khong-co', code: 'M8', name: 'x' })).status).toBe(400);
    // sửa ngành khoa khác: STAFF 403
    const other = await prisma.major.findUnique({ where: { code: 'TCNH' } });
    expect((await patch('staff1', `/api/majors/${other.id}`, { name: 'đổi' })).status).toBe(403);
    expect((await patch('staff2', `/api/majors/${other.id}`, { name: 'Tài chính NH' })).status).toBe(200);
    const list = await get('stud', `/api/majors?facultyId=${F1.id}`);
    expect(list.body.items.map((m) => m.code)).toEqual(['KTPM']);
  });

  it('lớp: phạm vi theo khoa của ngành; chỉ có isActive (name -> 400)', async () => {
    const major = await prisma.major.findUnique({ where: { code: 'KTPM' } });
    const other = await prisma.major.findUnique({ where: { code: 'TCNH' } });
    expect((await post('staff1', '/api/classes', { majorId: other.id, code: 'K1' })).status).toBe(403);
    const c = await post('staff1', '/api/classes', { majorId: major.id, code: 'D21KTPM' });
    expect(c.status).toBe(201);
    expect((await patch('staff2', `/api/classes/${c.body.item.id}`, { isActive: false })).status).toBe(403);
    const bad = await patch('staff1', `/api/classes/${c.body.item.id}`, { name: 'x' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details.name).toBeTruthy();
    expect((await patch('staff1', `/api/classes/${c.body.item.id}`, { isActive: false })).body.item.isActive).toBe(
      false,
    );
    expect((await get('stud', `/api/classes?majorId=${major.id}`)).body.items).toEqual([]);
    expect((await get('staff1', `/api/classes?majorId=${major.id}&includeInactive=true`)).body.items).toHaveLength(1);
  });

  it('lĩnh vực: ADMIN và STAFF ghi được, LECTURER/STUDENT 403', async () => {
    expect((await post('stud', '/api/fields', { code: 'AI', name: 'Trí tuệ nhân tạo' })).status).toBe(403);
    expect((await post('lect', '/api/fields', { code: 'AI', name: 'Trí tuệ nhân tạo' })).status).toBe(403);
    expect((await post('staff2', '/api/fields', { code: 'AI', name: 'Trí tuệ nhân tạo' })).status).toBe(201);
    expect((await post('admin', '/api/fields', { code: 'WEB', name: 'Web' })).status).toBe(201);
    const f = await prisma.field.findUnique({ where: { code: 'AI' } });
    expect((await patch('lect', `/api/fields/${f.id}`, { isActive: false })).status).toBe(403);
  });

  it('từ đồng nghĩa: chỉ STAFF; trùng 409; xóa cứng nhưng có AuditLog giữ before', async () => {
    for (const who of ['admin', 'lect', 'stud']) {
      expect((await get(who, '/api/synonyms')).status, who).toBe(403);
      expect((await post(who, '/api/synonyms', { term: 'ai', canonical: 'trí tuệ nhân tạo' })).status, who).toBe(403);
    }
    const c = await post('staff1', '/api/synonyms', { term: ' AI ', canonical: 'Trí tuệ nhân tạo' });
    expect(c.status).toBe(201);
    expect(c.body.item).toMatchObject({ term: 'ai', canonical: 'trí tuệ nhân tạo' });
    const dup = await post('staff2', '/api/synonyms', { term: 'ai', canonical: 'khác' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.details).toEqual({ term: 'Đã tồn tại' });
    expect((await post('staff1', '/api/synonyms', { term: 'x', canonical: 'X' })).status).toBe(400);
    expect((await get('staff1', '/api/synonyms')).body.items).toHaveLength(1);
    expect((await request(app).delete(`/api/synonyms/${c.body.item.id}`).set(as('admin'))).status).toBe(403);
    expect((await request(app).delete(`/api/synonyms/${c.body.item.id}`).set(as('staff1'))).status).toBe(204);
    expect((await request(app).delete(`/api/synonyms/${c.body.item.id}`).set(as('staff1'))).status).toBe(404);
    const log = await audits('Synonym', c.body.item.id);
    expect(log.map((a) => a.action)).toEqual(['CATALOG_CREATE', 'CATALOG_UPDATE']);
    expect(log[1].before).toEqual({ term: 'ai', canonical: 'trí tuệ nhân tạo' });
  });

  it('ghi danh mục và AuditLog cùng transaction: lỗi ở AuditLog thì bản ghi không được tạo', async () => {
    const repo = createCatalogRepo(prisma);
    await expect(repo.create('Field', { code: 'ROLLBACK', name: 'x' }, () => ({ action: null }))).rejects.toThrow();
    expect(await prisma.field.count({ where: { code: 'ROLLBACK' } })).toBe(0);
  });
});

describe('đợt (FR04, FR25)', () => {
  let round;

  it('ADMIN, LECTURER, STUDENT không tạo được (403); STAFF khoa khác 403', async () => {
    for (const who of ['admin', 'lect', 'stud'])
      expect((await post(who, '/api/rounds', roundBody())).status, who).toBe(403);
    expect((await post('staff2', '/api/rounds', roundBody())).status).toBe(403);
    expect(await prisma.round.count()).toBe(0);
  });

  it('STAFF tạo đợt trong phạm vi: 201, mốc ISO, effectiveConfig, AuditLog ROUND_CREATE', async () => {
    const r = await post('staff1', '/api/rounds', roundBody({ config: { maxTopicsPerLecturer: 6 } }));
    expect(r.status).toBe(201);
    round = r.body.round;
    expect(round).toMatchObject({
      facultyId: F1.id,
      regOpenAt: '2026-10-31T17:00:00.000Z',
      config: { maxTopicsPerLecturer: 6 },
      effectiveConfig: { maxTopicsPerLecturer: 6, minMembers: 1, maxMembers: 5 },
    });
    expect(typeof round.registrationOpen).toBe('boolean');
    const [a] = await audits('Round', round.id);
    expect(a).toMatchObject({ action: 'ROUND_CREATE', before: null });
    expect(a.after).toMatchObject({ regOpenAt: '2026-10-31T17:00:00.000Z', config: { maxTopicsPerLecturer: 6 } });
  });

  it('TC-FR04-02 mốc sai thứ tự -> 400 tại trường sai đầu tiên, không ghi gì', async () => {
    const n = await prisma.round.count();
    const r = await post('staff1', '/api/rounds', roundBody({ regCloseAt: dates.regOpenAt }));
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(r.body.error.details)).toEqual(['regCloseAt']);
    expect(r.body.error.details.regCloseAt).toMatch(/theo thứ tự/);
    expect(await prisma.round.count()).toBe(n);
  });

  it('TC-FR04-03 cấu hình hiệu lực sai (min > max, khóa lạ, vượt trần) -> 400 tại config.*', async () => {
    const a = await post('staff1', '/api/rounds', roundBody({ config: { minMembers: 4, maxMembers: 2 } }));
    expect(a.status).toBe(400);
    expect(a.body.error.details['config.minMembers']).toBeTruthy();
    expect((await post('staff1', '/api/rounds', roundBody({ config: { abc: 1 } }))).status).toBe(400);
    expect((await post('staff1', '/api/rounds', roundBody({ config: { maxFileSizeMB: 50 } }))).status).toBe(400);
    expect((await post('staff1', '/api/rounds', roundBody({ academicYear: '2026-2028' }))).status).toBe(400);
    expect((await post('staff1', '/api/rounds', roundBody({ regOpenAt: '2026-11-01T00:00:00' }))).status).toBe(400);
  });

  it('khoa ngừng dùng -> 400 tại facultyId', async () => {
    const f = await prisma.faculty.create({ data: { code: 'OFF', name: 'Off' } });
    await prisma.staffScope.create({
      data: { userId: (await prisma.user.findUnique({ where: { code: 'staff1' } })).id, facultyId: f.id },
    });
    await prisma.faculty.update({ where: { id: f.id }, data: { isActive: false } });
    const me = await get('staff1', '/api/auth/me');
    expect(me.body.user.staffFacultyIds).toContain(f.id);
    const r = await post('staff1', '/api/rounds', roundBody({ facultyId: f.id }));
    expect(r.status).toBe(400);
    expect(r.body.error.details.facultyId).toBeTruthy();
  });

  it('đọc: STAFF thấy config; STUDENT/LECTURER chỉ đợt của khoa mình và không có config; ADMIN 403', async () => {
    const other = await post('staff2', '/api/rounds', roundBody({ facultyId: F2.id, name: 'Đợt khoa KT' }));
    expect(other.status).toBe(201);

    const s = await get('staff1', '/api/rounds');
    expect(s.body.items.map((x) => x.id)).toEqual([round.id]);
    expect(s.body.items[0].config).toEqual({ maxTopicsPerLecturer: 6 });
    expect(s.body).toMatchObject({ page: 1, pageSize: 20, total: 1 });

    for (const who of ['stud', 'lect']) {
      const r = await get(who, '/api/rounds');
      expect(
        r.body.items.map((x) => x.id),
        who,
      ).toEqual([round.id]);
      expect(r.body.items[0].config).toBeUndefined();
      expect(r.body.items[0].effectiveConfig.maxTopicsPerLecturer).toBe(6);
    }
    expect((await get('studF2', '/api/rounds')).body.items.map((x) => x.id)).toEqual([other.body.round.id]);
    expect((await get('admin', '/api/rounds')).status).toBe(403);
    expect((await get('stud', `/api/rounds?facultyId=${F2.id}`)).status).toBe(403);
    expect((await get('staff1', `/api/rounds?facultyId=${F2.id}`)).status).toBe(403);
    expect((await get('staff1', '/api/rounds?academicYear=2025-2026')).body.items).toEqual([]);
    expect((await get('staff1', '/api/rounds?pageSize=1000')).status).toBe(400);
    expect((await get('staff1', '/api/rounds?page=9')).body.items).toEqual([]);

    expect((await get('stud', `/api/rounds/${round.id}`)).body.round.id).toBe(round.id);
    expect((await get('studF2', `/api/rounds/${round.id}`)).status).toBe(403);
    expect((await get('staff2', `/api/rounds/${round.id}`)).status).toBe(403);
    expect((await get('admin', `/api/rounds/${round.id}`)).status).toBe(403);
    expect((await get('staff1', '/api/rounds/khong-co')).status).toBe(404);
  });

  it('sửa: quyền theo khoa; gộp rồi kiểm lại thứ tự mốc; config thay hẳn; AuditLog before/after', async () => {
    for (const who of ['admin', 'lect', 'stud', 'staff2']) {
      expect((await patch(who, `/api/rounds/${round.id}`, { name: 'x' })).status, who).toBe(403);
    }
    expect((await patch('staff1', `/api/rounds/${round.id}`, {})).status).toBe(400);
    // chỉ đổi một mốc nhưng phá thứ tự với mốc hiện có
    const bad = await patch('staff1', `/api/rounds/${round.id}`, { regOpenAt: '2026-12-15T00:00:00+07:00' });
    expect(bad.status).toBe(400);
    expect(Object.keys(bad.body.error.details)).toEqual(['regCloseAt']);
    expect(await prisma.round.findUnique({ where: { id: round.id } })).toMatchObject({ name: 'Đợt NCKH 2026-2027' });

    const ok = await patch('staff1', `/api/rounds/${round.id}`, { name: 'Đợt đổi tên', config: { minMembers: 2 } });
    expect(ok.status).toBe(200);
    expect(ok.body.round.config).toEqual({ minMembers: 2 }); // maxTopicsPerLecturer: 6 cũ đã bị thay
    expect(ok.body.round.effectiveConfig.maxTopicsPerLecturer).toBe(5);
    const log = await audits('Round', round.id);
    expect(log.map((a) => a.action)).toEqual(['ROUND_CREATE', 'ROUND_UPDATE']);
    expect(log[1].before).toMatchObject({ name: 'Đợt NCKH 2026-2027', config: { maxTopicsPerLecturer: 6 } });
    expect(log[1].after).toMatchObject({ name: 'Đợt đổi tên', config: { minMembers: 2 } });
    // cấu hình mới sai so với cấu hình hiệu lực (min 2 > max mới 1)
    expect(
      (await patch('staff1', `/api/rounds/${round.id}`, { config: { minMembers: 2, maxMembers: 1 } })).status,
    ).toBe(400);
    expect((await patch('staff1', '/api/rounds/khong-co', { name: 'x' })).status).toBe(404);
  });

  it('không có endpoint xóa đợt; registrationOpen theo giờ server', async () => {
    expect((await request(app).delete(`/api/rounds/${round.id}`).set(as('staff1'))).status).toBe(404);
    const now = Date.now();
    const iso = (d) => new Date(now + d * 864e5).toISOString();
    const open = await post(
      'staff1',
      '/api/rounds',
      roundBody({
        name: 'Đang mở',
        regOpenAt: iso(-1),
        regCloseAt: iso(10),
        reviewDeadline: iso(20),
        endAt: iso(30),
      }),
    );
    expect(open.body.round.registrationOpen).toBe(true);
  });

  it('đợt và AuditLog cùng transaction: lỗi ở AuditLog thì đợt không được tạo', async () => {
    const n = await prisma.round.count();
    await expect(
      createRoundRepo(prisma).create(
        {
          facultyId: F1.id,
          name: 'x',
          academicYear: '2026-2027',
          regOpenAt: new Date(),
          regCloseAt: new Date(),
          reviewDeadline: new Date(),
          endAt: new Date(),
          config: {},
        },
        () => ({ action: null }),
      ),
    ).rejects.toThrow();
    expect(await prisma.round.count()).toBe(n);
  });
});

describe('vòng sửa 1 – cổng xác thực và PATCH đồng thời', () => {
  it('mọi tiền tố nghiệp vụ: không token 401, phải đổi mật khẩu 403, đường dẫn lạ vẫn 404', async () => {
    const prefixes = ['faculties', 'majors', 'classes', 'fields', 'synonyms', 'rounds'];
    for (const p of prefixes) {
      for (const [method, url] of [
        ['get', `/api/${p}`],
        ['post', `/api/${p}`],
        ['patch', `/api/${p}/x`],
        ['delete', `/api/${p}/x`],
      ]) {
        expect((await request(app)[method](url)).status, `${method} ${url} không token`).toBe(401);
        const r = await request(app)[method](url).set(as('mustChange'));
        expect(r.body.error?.code, `${method} ${url} phải đổi mật khẩu`).toBe('PASSWORD_CHANGE_REQUIRED');
      }
    }
    expect((await request(app).get('/api/khong-co')).status).toBe(404);
  });

  it('router nghiệp vụ chỉ được tạo qua businessRouter (không import Router của express trực tiếp)', () => {
    const root = fileURLToPath(new URL('../src/modules/', import.meta.url));
    for (const dir of readdirSync(root).filter((d) => d !== 'auth')) {
      const f = `${root}${dir}/routes.js`;
      if (!existsSync(f)) continue;
      const src = readFileSync(f, 'utf8');
      expect(
        /\bRouter\b\s*[,}]?\s*from\s*'express'/.test(src) || /Router\(\)/.test(src),
        `${dir}/routes.js tự tạo Router`,
      ).toBe(false);
      expect(src, `${dir}/routes.js`).toContain('businessRouter');
    }
  });

  it('hai PATCH đồng thời mỗi cái hợp lệ riêng nhưng sai thứ tự khi gộp: đúng một cái thành công, DB luôn đúng thứ tự', async () => {
    const created = (await post('staff1', '/api/rounds', roundBody({ name: 'Đua PATCH' }))).body.round;
    const a = patch('staff1', `/api/rounds/${created.id}`, { reviewDeadline: '2026-12-01T01:00:00+07:00' });
    const b = patch('staff1', `/api/rounds/${created.id}`, { regCloseAt: '2026-12-30T00:00:00+07:00' });
    const codes = (await Promise.all([a, b])).map((r) => r.status).sort();
    expect(codes).toEqual([200, 400]);
    const row = await prisma.round.findUnique({ where: { id: created.id } });
    expect(row.regCloseAt < row.reviewDeadline).toBe(true);
    const log = await audits('Round', created.id);
    expect(log.map((x) => x.action)).toEqual(['ROUND_CREATE', 'ROUND_UPDATE']);
  });

  it('id tồn tại nhưng ngoài phạm vi -> 403, id không tồn tại -> 404 (hợp đồng §2)', async () => {
    const any = await prisma.round.findFirst({ where: { facultyId: F1.id } });
    expect((await patch('staff2', `/api/rounds/${any.id}`, { name: 'x' })).status).toBe(403);
    expect((await patch('staff2', '/api/rounds/khong-co', { name: 'x' })).status).toBe(404);
  });
});
