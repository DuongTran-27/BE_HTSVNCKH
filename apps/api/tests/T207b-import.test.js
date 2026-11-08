// T207b (FR02, FR25, NFR05): nhập CSV tài khoản preview/confirm trên DB test thật qua supertest.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../src/app.js';
import { createAuthRepo } from '../src/modules/auth/prismaRepo.js';
import { createAccountRepo } from '../src/modules/accounts/prismaRepo.js';
import { authRouter } from '../src/modules/auth/routes.js';
import { errorHandler } from '../src/middlewares/errorHandler.js';
import { AppError } from '../src/lib/errors.js';
import { signAccessToken } from '../src/lib/tokens.js';
import { testEnv } from './helpers.js';
import { resetData } from './db.js';

const prisma = new PrismaClient();
const HEAD = 'code,email,fullName,role,classCode';
let inFlight = 0;
let maxInFlight = 0;
let gate = null; // Promise | null: giữ phép băm cho tới khi mở
const hasher = {
  hash: async (p) => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    if (gate) await gate;
    inFlight--;
    return `h:${p}`;
  },
  verify: async (h, p) => h === `h:${p}`,
};
let repo = createAccountRepo(prisma);
const app = createApp({
  env: testEnv,
  logger: undefined,
  authRepo: createAuthRepo(prisma),
  hasher,
  accountRepo: new Proxy({}, { get: (_t, k) => repo[k] }), // cho phép thay repo trong từng test
});

let F1, F2, C1;
const tok = {};
const U = {};
const mk = async (key, role, extra = {}) => {
  const u = await prisma.user.create({
    data: { code: key, email: `${key.toLowerCase()}@t.vn`, fullName: key, passwordHash: 'x', role, mustChangePassword: false, ...extra },
  });
  U[key] = u;
  tok[key] = signAccessToken(u, { secret: testEnv.JWT_ACCESS_SECRET, ttlSeconds: 600 });
  return u;
};
// Mỗi request của 'admin' dùng một ADMIN khác nhau (xoay vòng) để không chạm limiter 10/15 phút của chính nó
let adminSeq = 0;
const adminTokens = [];
const send = (who, kind, csv, facultyId = F1?.id) => {
  const buf = Buffer.isBuffer(csv) ? csv : Buffer.from(csv);
  const q = request(app).post(`/api/users/import/${kind}${facultyId === null ? '' : `?facultyId=${facultyId}`}`);
  if (who) q.set('Authorization', `Bearer ${who === 'admin' ? adminTokens[adminSeq++ % adminTokens.length] : tok[who]}`);
  return q.attach('file', buf, 'u.csv');
};
const users = (...lines) => [HEAD, ...lines].join('\n');
const countUsers = () => prisma.user.count();
const tick = (ms) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  await resetData(prisma);
  [F1, F2] = await Promise.all([
    prisma.faculty.create({ data: { code: 'CNTT', name: 'CNTT' } }),
    prisma.faculty.create({ data: { code: 'KT', name: 'KT' } }),
  ]);
  const m1 = await prisma.major.create({ data: { facultyId: F1.id, code: 'KTPM', name: 'KTPM' } });
  const m2 = await prisma.major.create({ data: { facultyId: F2.id, code: 'KTDN', name: 'KTDN' } });
  C1 = await prisma.class.create({ data: { majorId: m1.id, code: 'K20A' } });
  await prisma.class.create({ data: { majorId: m2.id, code: 'KT01' } });
  await prisma.class.create({ data: { majorId: m1.id, code: 'OLD', isActive: false } });
  await mk('admin', 'ADMIN');
  for (let i = 0; i < 40; i++) {
    const a = await mk(`adm${i}`, 'ADMIN');
    adminTokens.push(tok[a.code]);
  }
  const s1 = await mk('staff1', 'STAFF', { facultyId: F1.id });
  const s2 = await mk('staff2', 'STAFF', { facultyId: F2.id });
  await prisma.staffScope.createMany({ data: [{ userId: s1.id, facultyId: F1.id }, { userId: s2.id, facultyId: F2.id }] });
  await mk('lect', 'LECTURER', { facultyId: F1.id });
  await mk('stud', 'STUDENT', { facultyId: F1.id, classId: C1.id });
  await mk('mustChange', 'ADMIN', { mustChangePassword: true });
  await mk('existing', 'STUDENT', { facultyId: F1.id, classId: C1.id });
}, 60000);
afterAll(() => prisma.$disconnect());
beforeEach(() => {
  repo = createAccountRepo(prisma);
  gate = null;
  inFlight = 0;
  maxInFlight = 0;
});

describe('preview', () => {
  it('TC-FR02-05 trả validCount/errorCount/errors/preview, dòng tính cả tiêu đề, không ghi DB', async () => {
    const before = await countUsers();
    const csv = users(
      'SV001,sv001@st.vn,Trần B,STUDENT,K20A', // 2 ok
      'GV001,gv001@st.vn,Cô C,LECTURER,', // 3 ok
      'SV002,không-phải-email,D,STUDENT,K20A', // 4 email
      'SV003,sv003@st.vn,E,ADMIN,', // 5 role
      'SV004,sv004@st.vn,F,STUDENT,', // 6 thiếu lớp
      'SV005,sv005@st.vn,G,STUDENT,KT01', // 7 lớp khoa khác
      'SV006,sv006@st.vn,H,STUDENT,OLD', // 8 lớp ngừng dùng
      'SV007,sv007@st.vn', // 9 sai số cột
    );
    const res = await send('admin', 'preview', csv);
    expect(res.status).toBe(200);
    expect(res.body.validCount).toBe(2);
    expect(res.body.errorCount).toBe(6);
    expect(res.body.errors).toEqual([
      { row: 4, field: 'email', message: expect.any(String) },
      { row: 5, field: 'role', message: expect.any(String) },
      { row: 6, field: 'classCode', message: 'Sinh viên cần mã lớp' },
      { row: 7, field: 'classCode', message: expect.stringContaining('không thuộc khoa') },
      { row: 8, field: 'classCode', message: expect.stringContaining('ngừng dùng') },
      { row: 9, field: null, message: expect.stringContaining('Sai số cột') },
    ]);
    expect(res.body.preview).toEqual([
      { row: 2, code: 'SV001', email: 'sv001@st.vn', fullName: 'Trần B', role: 'STUDENT', classCode: 'K20A' },
      { row: 3, code: 'GV001', email: 'gv001@st.vn', fullName: 'Cô C', role: 'LECTURER', classCode: '' },
    ]);
    expect(await countUsers()).toBe(before);
  });

  it('nhận BOM, CRLF, ô có ngoặc kép chứa dấu phẩy', async () => {
    const csv = `\uFEFF${HEAD}\r\nSV010,sv010@st.vn,"Trần, Văn B",STUDENT,K20A\r\n`;
    const res = await send('admin', 'preview', csv);
    expect(res.status).toBe(200);
    expect(res.body.preview[0].fullName).toBe('Trần, Văn B');
  });

  it('trùng trong file (mã không phân biệt hoa thường, email, cả dòng) và trùng DB', async () => {
    const res = await send(
      'admin',
      'preview',
      users(
        'SV020,a20@st.vn,A,STUDENT,K20A', // 2 ok
        'sv020,b20@st.vn,B,STUDENT,K20A', // 3 mã trùng dòng 2
        'SV021,a20@st.vn,C,STUDENT,K20A', // 4 email trùng dòng 2
        'SV020,a20@st.vn,A,STUDENT,K20A', // 5 trùng hoàn toàn
        'EXISTING,new@st.vn,D,STUDENT,K20A', // 6 mã trùng DB (khác hoa/thường)
        'SV022,existing@t.vn,E,STUDENT,K20A', // 7 email trùng DB
      ),
    );
    expect(res.body.validCount).toBe(1);
    expect(res.body.errors).toEqual([
      { row: 3, field: 'code', message: expect.stringContaining('dòng 2') },
      { row: 4, field: 'email', message: expect.stringContaining('dòng 2') },
      { row: 5, field: null, message: expect.stringContaining('trùng hoàn toàn') },
      { row: 6, field: 'code', message: 'Mã đã tồn tại' },
      { row: 7, field: 'email', message: 'Email đã tồn tại' },
    ]);
  });

  it('errors/preview tối đa 100 mục, errorCount/validCount là tổng thật', async () => {
    const bad = Array.from({ length: 150 }, (_, i) => `B${i},khong-email,X,LECTURER,`);
    const good = Array.from({ length: 120 }, (_, i) => `G${i},g${i}@st.vn,X,LECTURER,`);
    const res = await send('admin', 'preview', users(...bad, ...good));
    expect(res.body).toMatchObject({ validCount: 120, errorCount: 150 });
    expect(res.body.errors).toHaveLength(100);
    expect(res.body.preview).toHaveLength(100);
  });

  it('2.000 dòng được nhận; 2.001 dòng bị từ chối ở cấp file', async () => {
    const mkRows = (n) => Array.from({ length: n }, (_, i) => `L${i},l${i}@st.vn,X,LECTURER,`);
    expect((await send('admin', 'preview', users(...mkRows(2000)))).body.validCount).toBe(2000);
    const over = await send('admin', 'preview', users(...mkRows(2001)));
    expect(over.status).toBe(400);
    expect(over.body.error).toMatchObject({ code: 'VALIDATION_ERROR', details: { file: expect.stringContaining('2000') } });
  });

  it.each([
    ['sai tiêu đề', 'code,mail,fullName,role,classCode\nA,b,c,STUDENT,K'],
    ['thiếu cột tiêu đề', 'code,email\nA,b'],
    ['file chỉ có tiêu đề', HEAD],
    ['ngoặc kép không đóng', `${HEAD}\nA,"b,c,LECTURER,`],
    ['byte NUL', Buffer.from(`${HEAD}\nA,b\u0000,c,LECTURER,`)],
    ['không phải UTF-8', Buffer.concat([Buffer.from(`${HEAD}\nA,b@c.vn,`), Buffer.from([0xff, 0xfe, 0xfd]), Buffer.from(',LECTURER,')])],
  ])('lỗi cấp file: %s -> 400 VALIDATION_ERROR details.file', async (_n, csv) => {
    const res = await send('admin', 'preview', csv);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.file).toEqual(expect.any(String));
  });

  it.each(['u.exe', 'u.txt', 'u.csv.exe', 'csv', 'evilcsv'])('đuôi file %s không phải .csv -> 400 Loại file không được hỗ trợ (cả preview và confirm)', async (name) => {
    for (const kind of ['preview', 'confirm']) {
      const res = await request(app).post(`/api/users/import/${kind}?facultyId=${F1.id}`).set('Authorization', `Bearer ${tok.staff1}`)
        .attach('file', Buffer.from(users('X1,x1@st.vn,X,LECTURER,')), name);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatchObject({ code: 'VALIDATION_ERROR', details: { file: 'Loại file không được hỗ trợ' } });
    }
    expect(await prisma.user.count({ where: { code: 'X1' } })).toBe(0);
  });

  it('đuôi .CSV viết hoa được nhận', async () => {
    const res = await request(app).post(`/api/users/import/preview?facultyId=${F1.id}`).set('Authorization', `Bearer ${tok.staff1}`)
      .attach('file', Buffer.from(users('X2,x2@st.vn,X,LECTURER,')), 'U.CSV');
    expect(res.status).toBe(200);
  });

  it('file > 1 MB -> 413 PAYLOAD_TOO_LARGE', async () => {
    const res = await send('admin', 'preview', Buffer.alloc(1024 * 1024 + 10, 'a'));
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('thiếu file hoặc không phải multipart -> 400; thiếu facultyId -> 400; khoa không có -> 400', async () => {
    const auth = { Authorization: `Bearer ${tok.admin}` };
    const url = `/api/users/import/preview?facultyId=${F1.id}`;
    expect((await request(app).post(url).set(auth).field('x', '1')).status).toBe(400);
    expect((await request(app).post(url).set(auth).send({ a: 1 })).status).toBe(400);
    expect((await send('admin', 'preview', users(), null)).status).toBe(400);
    const nofac = await send('admin', 'preview', users('L1,l1@st.vn,X,LECTURER,'), 'khong-co');
    expect(nofac.body.error.details.facultyId).toEqual(expect.any(String));
  });

  it('file ở field khác tên `file` -> 400', async () => {
    const res = await request(app)
      .post(`/api/users/import/preview?facultyId=${F1.id}`)
      .set('Authorization', `Bearer ${tok.admin}`)
      .attach('other', Buffer.from(users('L1,l1@st.vn,X,LECTURER,')), 'u.csv');
    expect(res.status).toBe(400);
  });
});

describe('quyền (FR25) – kiểm trước khi đọc file', () => {
  const ok = users('L1,l1@st.vn,X,LECTURER,');
  it.each(['preview', 'confirm'])('%s: không đăng nhập 401; LECTURER/STUDENT 403; phải đổi mật khẩu 403', async (kind) => {
    expect((await send(null, kind, ok)).status).toBe(401);
    for (const who of ['lect', 'stud']) expect((await send(who, kind, ok)).status).toBe(403);
    const mc = await send('mustChange', kind, ok);
    expect(mc.status).toBe(403);
    expect(mc.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
  });
  it.each(['preview', 'confirm'])('%s: STAFF ngoài phạm vi 403 dù file quá cỡ (không đọc file)', async (kind) => {
    expect((await send('staff2', kind, ok, F1.id)).status).toBe(403);
    expect((await send('staff2', kind, Buffer.alloc(2 * 1024 * 1024, 'a'), F1.id)).status).toBe(403);
  });
  it('STAFF trong phạm vi được preview; ADMIN được nhập vào mọi khoa', async () => {
    expect((await send('staff1', 'preview', ok, F1.id)).status).toBe(200);
    expect((await send('admin', 'preview', users('S1,s1@st.vn,X,STUDENT,KT01'), F2.id)).body.validCount).toBe(1);
  });
  it('giới hạn 10 lượt / 15 phút / người dùng', async () => {
    await mk('limited', 'ADMIN');
    const codes = [];
    for (let i = 0; i < 11; i++) codes.push((await send('limited', 'preview', ok)).status);
    expect(codes.slice(0, 10).every((c) => c === 200)).toBe(true);
    expect(codes[10]).toBe(429);
  });
});

describe('confirm', () => {
  it('TC-FR02-06 ghi tất cả user + AuditLog, mật khẩu tạm dùng được và chỉ trả một lần, no-store', async () => {
    const before = await countUsers();
    const res = await send('staff1', 'confirm', users('SV100,sv100@st.vn,Trần B,STUDENT,K20A', 'GV100,gv100@st.vn,Cô C,LECTURER,'));
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.createdCount).toBe(2);
    expect(await countUsers()).toBe(before + 2);
    const sv = await prisma.user.findUnique({ where: { code: 'SV100' } });
    expect(sv).toMatchObject({ role: 'STUDENT', facultyId: F1.id, classId: C1.id, mustChangePassword: true, isLocked: false });
    const cred = res.body.credentials.find((c) => c.code === 'SV100');
    expect(cred.temporaryPassword).toMatch(/^(?=.*[A-Za-z])(?=.*\d).{12,}$/);
    expect(sv.passwordHash).toBe(`h:${cred.temporaryPassword}`);
    const audits = await prisma.auditLog.findMany({ where: { action: 'USER_CREATE', entityId: sv.id } });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ actorId: U.staff1.id, entityType: 'User' });
    const all = JSON.stringify(await prisma.auditLog.findMany({ where: { action: 'USER_CREATE' }, select: { before: true, after: true } }));
    expect(all).not.toContain(cred.temporaryPassword);
    expect(all).not.toContain('passwordHash');
  });

  it('còn lỗi -> 400 IMPORT_HAS_ERRORS, details như preview, không ghi gì (kể cả dòng hợp lệ)', async () => {
    const before = await countUsers();
    const csv = users('SV200,sv200@st.vn,A,STUDENT,K20A', 'SV201,hỏng,B,STUDENT,K20A');
    const prev = await send('admin', 'preview', csv);
    const res = await send('admin', 'confirm', csv);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('IMPORT_HAS_ERRORS');
    expect(res.body.error.details).toEqual(prev.body);
    expect(await countUsers()).toBe(before);
  });

  it('gửi lại cùng file: báo "đã tồn tại" theo dòng, không tạo trùng', async () => {
    const csv = users('SV300,sv300@st.vn,A,STUDENT,K20A');
    expect((await send('admin', 'confirm', csv)).status).toBe(200);
    const again = await send('admin', 'confirm', csv);
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe('IMPORT_HAS_ERRORS');
    expect(again.body.error.details.errors).toEqual(
      expect.arrayContaining([
        { row: 2, field: 'code', message: 'Mã đã tồn tại' },
        { row: 2, field: 'email', message: 'Email đã tồn tại' },
      ]),
    );
    expect(await prisma.user.count({ where: { code: 'SV300' } })).toBe(1);
  });

  it('kiểm lại từ đầu: lớp bị ngừng dùng sau preview -> confirm không ghi', async () => {
    const csv = users('SV310,sv310@st.vn,A,STUDENT,K20A');
    expect((await send('admin', 'preview', csv)).body.validCount).toBe(1);
    await prisma.class.update({ where: { id: C1.id }, data: { isActive: false } });
    try {
      expect((await send('admin', 'confirm', csv)).status).toBe(400);
    } finally {
      await prisma.class.update({ where: { id: C1.id }, data: { isActive: true } });
    }
    expect(await prisma.user.count({ where: { code: 'SV310' } })).toBe(0);
  });

  it('rollback (NFR05): va chạm unique lúc ghi -> 409 DUPLICATE, không user nào của file được tạo, không AuditLog', async () => {
    const real = createAccountRepo(prisma);
    repo = { ...real, findExisting: async () => [] }; // mô phỏng người khác tạo "existing" sau bước kiểm
    const auditsBefore = await prisma.auditLog.count({ where: { action: 'USER_CREATE' } });
    const res = await send('admin', 'confirm', users('SV400,sv400@st.vn,A,STUDENT,K20A', 'SV401,existing@t.vn,B,STUDENT,K20A'));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE');
    expect(await prisma.user.count({ where: { code: { in: ['SV400', 'SV401'] } } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: 'USER_CREATE' } })).toBe(auditsBefore);
    repo = real; // cờ importLock đã nhả: lượt sau chạy được
    expect((await send('admin', 'confirm', users('SV402,sv402@st.vn,A,STUDENT,K20A'))).status).toBe(200);
  });

  it('2.000 dòng ghi trong một transaction', async () => {
    const rows = Array.from({ length: 2000 }, (_, i) => `M${i},m${i}@st.vn,X,LECTURER,`);
    const res = await send('admin', 'confirm', users(...rows));
    expect(res.status).toBe(200);
    expect(res.body.createdCount).toBe(2000);
    expect(await prisma.user.count({ where: { code: { startsWith: 'M' } } })).toBe(2000);
  }, 60000);

  it('importLock: xác nhận thứ hai khi lượt đầu đang băm -> 409 IMPORT_IN_PROGRESS; băm ≤ 2 song song; cờ nhả sau đó', async () => {
    let open;
    gate = new Promise((r) => (open = r));
    const rows = Array.from({ length: 8 }, (_, i) => `P${i},p${i}@st.vn,X,LECTURER,`);
    const first = send('admin', 'confirm', users(...rows)).then((r) => r);
    for (let i = 0; i < 200 && inFlight < 2; i++) await tick(25);
    expect(inFlight).toBe(2);
    const second = await send('admin', 'confirm', users('Q1,q1@st.vn,X,LECTURER,'));
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('IMPORT_IN_PROGRESS');
    open();
    expect((await first).status).toBe(200);
    expect(maxInFlight).toBeLessThanOrEqual(2);
    expect(await prisma.user.count({ where: { code: 'Q1' } })).toBe(0);
    expect((await send('admin', 'confirm', users('Q1,q1@st.vn,X,LECTURER,'))).status).toBe(200);
  }, 30000);

  it('5 xác nhận bắn cùng lúc -> đúng một thắng cờ, bốn cái 409', async () => {
    let open;
    gate = new Promise((r) => (open = r));
    const reqs = Array.from({ length: 5 }, (_, i) => send('admin', 'confirm', users(`R${i},r${i}@st.vn,X,LECTURER,`)).then((r) => r));
    for (let i = 0; i < 200 && inFlight < 1; i++) await tick(25);
    await tick(300); // để cả 5 request tới nơi
    open();
    const statuses = (await Promise.all(reqs)).map((r) => r.status);
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(4);
  }, 30000);
});

describe('/api/auth/refresh chỉ xóa cookie khi lỗi 401 (MINOR 1 T207a)', () => {
  const mkAuthApp = (err) => {
    const a = express();
    a.use(express.json());
    const requireAuth = (_q, _s, n) => n();
    a.use('/api/auth', authRouter({ authService: { refresh: async () => { throw err; } }, requireAuth, env: testEnv }));
    a.use(errorHandler(undefined));
    return a;
  };
  const clears = (res) => (res.headers['set-cookie'] ?? []).some((c) => c.startsWith('nckh_rt=;'));
  it('401 xóa cookie', async () => {
    const res = await request(mkAuthApp(new AppError(401, 'UNAUTHORIZED', 'x'))).post('/api/auth/refresh').set('Cookie', 'nckh_rt=abc');
    expect(res.status).toBe(401);
    expect(clears(res)).toBe(true);
  });
  it('409 hết lock_timeout giữ cookie', async () => {
    const lockErr = Object.assign(new Error('55P03 lock timeout'), { name: 'PrismaClientKnownRequestError', code: 'P2010', meta: { code: '55P03' } });
    const res = await request(mkAuthApp(lockErr)).post('/api/auth/refresh').set('Cookie', 'nckh_rt=abc');
    expect(res.status).toBe(409);
    expect(clears(res)).toBe(false);
  });
});
