// TC-FR39 (FR39, FR14, FR25 – GD7 §10.3): GET /api/stats/export.xlsx – quyền, 2 sheet khớp /api/stats và bộ lọc,
// ô chuỗi không thành công thức, trần 5.000, header tải về. Đọc lại file bằng chính exceljs.
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';
import { parseCsv } from '@nckh/shared';
import { createApp } from '../src/app.js';
import { createAuthRepo } from '../src/modules/auth/prismaRepo.js';
import { createTopicRepo } from '../src/modules/topics/prismaRepo.js';
import { signAccessToken } from '../src/lib/tokens.js';
import { fakeHasher, testEnv } from './helpers.js';
import { resetData } from './db.js';
import { cleanCell } from '../src/modules/stats/xlsx.js';

const prisma = new PrismaClient();
const app = createApp({ env: testEnv, logger: undefined, authRepo: createAuthRepo(prisma), hasher: fakeHasher, topicRepo: createTopicRepo(prisma) });
const U = {};
const tok = {};
const T = {};
const day = 86400000;
const roles = { sv: 'STUDENT', lectA: 'LECTURER', lectB: 'LECTURER', lectEvil: 'LECTURER', staff: 'STAFF', staff2: 'STAFF', admin: 'ADMIN' };
let F1, F2, AI, R1, R2;

const get = (who, path, qs) => request(app).get(`/api/stats${path}?${new URLSearchParams(qs)}`).set({ Authorization: `Bearer ${tok[who]}` });
// supertest chỉ buffer sẵn loại text/json → tự gom byte để đọc xlsx
const xlsx = (who, qs) => get(who, '/export.xlsx', qs).buffer(true).parse((res, cb) => { const c = []; res.on('data', (d) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); });
const load = async (buf) => { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf); return wb; };
const sheetRows = (ws) => { const out = []; ws.eachRow((row, i) => { if (i > 1) out.push(row.values.slice(1)); }); return out; };
const codes = (wb) => sheetRows(wb.getWorksheet('Danh sách đề tài')).map((r) => r[0]).sort();

beforeAll(async () => {
  await resetData(prisma);
  F1 = await prisma.faculty.create({ data: { code: 'CNTT', name: 'CNTT' } });
  F2 = await prisma.faculty.create({ data: { code: 'KT', name: 'KT' } });
  AI = await prisma.field.create({ data: { code: 'AI', name: 'Trí tuệ nhân tạo' } });
  const round = (facultyId, name, academicYear) => prisma.round.create({ data: { facultyId, name, academicYear, regOpenAt: new Date(Date.now() - day), regCloseAt: new Date(Date.now() + day), reviewDeadline: new Date(Date.now() + 2 * day), endAt: new Date(Date.now() + 90 * day), config: {} } });
  R1 = await round(F1.id, 'Đợt 1', '2026-2027');
  R2 = await round(F2.id, 'Đợt KT', '2026-2027');
  for (const k of Object.keys(roles)) {
    const fullName = k === 'lectEvil' ? '=HYPERLINK("http://x")' : `Tên ${k}`;
    U[k] = await prisma.user.create({ data: { code: k, email: `${k}@t.vn`, fullName, passwordHash: 'x', role: roles[k], mustChangePassword: false, facultyId: k === 'admin' ? null : k === 'staff2' ? F2.id : F1.id } });
    tok[k] = signAccessToken(U[k], { secret: testEnv.JWT_ACCESS_SECRET, ttlSeconds: 600 });
  }
  await prisma.staffScope.create({ data: { userId: U.staff.id, facultyId: F1.id } });
  await prisma.staffScope.create({ data: { userId: U.staff2.id, facultyId: F2.id } });
  const topic = async (key, status, { title = key, round = R1, facultyId = F1.id, lect, origin } = {}) => {
    T[key] = await prisma.topic.create({ data: { code: `X39-${key}`, title, keywords: [], status, roundId: round.id, facultyId, fieldId: AI.id, ...(origin && { origin }) } });
    if (lect) await prisma.advising.create({ data: { topicId: T[key].id, lecturerId: U[lect].id } });
  };
  await topic('draft', 'DRAFT', { lect: 'lectA' });
  await topic('p1', 'IN_PROGRESS', { lect: 'lectA', title: '=1+1' });
  await topic('p2', 'CLOSED', { lect: 'lectA', origin: 'LECTURER', title: '+cmd|calc' });
  await topic('p3', 'IN_PROGRESS', { lect: 'lectEvil', title: '@SUM(1+1)' });
  await topic('q1', 'IN_PROGRESS', { lect: 'lectB', round: R2, facultyId: F2.id });
  await prisma.resultVersion.create({ data: { topicId: T.p2.id, version: 1, result: 'EXCELLENT', summary: 's', isCurrent: true, createdById: U.staff.id } });
  await prisma.topicMember.create({ data: { topicId: T.p2.id, userId: U.sv.id, role: 'LEADER' } });
  const council = await prisma.council.create({ data: { code: 'HD-2026-001', facultyId: F1.id, roundId: R1.id, name: 'HD', createdById: U.staff.id } });
  const decided = (topicId, finalScore) => prisma.councilAssignment.create({ data: { councilId: council.id, topicId, assignedById: U.staff.id, finalScore, decision: 'PASSED', minutes: 'm', decidedById: U.staff.id, decidedAt: new Date() } });
  await decided(T.p2.id, 8.5);
  await decided(T.p1.id, 9); // p1 chưa CLOSED → điểm không được lộ (m8)
});

describe('TC-FR39-01 quyền', () => {
  it('SV, ADMIN 403; chưa đăng nhập 401; STAFF/LECTURER 200', async () => {
    for (const who of ['sv', 'admin']) expect((await get(who, '/export.xlsx', { groupBy: 'status' })).status).toBe(403);
    expect((await request(app).get('/api/stats/export.xlsx?groupBy=status')).status).toBe(401);
    for (const who of ['staff', 'lectA']) expect((await xlsx(who, { groupBy: 'status' })).status).toBe(200);
  });
  it('STAFF lọc khoa ngoài phạm vi 403; GV gửi facultyId 400; query sai 400', async () => {
    expect((await get('staff', '/export.xlsx', { groupBy: 'status', facultyId: F2.id })).status).toBe(403);
    expect((await get('lectA', '/export.xlsx', { groupBy: 'status', facultyId: F1.id })).status).toBe(400);
    expect((await get('staff', '/export.xlsx', { groupBy: 'x' })).status).toBe(400);
  });
});

describe('TC-FR39-02 nội dung', () => {
  it('đúng 2 sheet; sheet 1 = rows /api/stats = CSV; sheet 2 = total, loại DRAFT', async () => {
    const qs = { groupBy: 'status' };
    const [j, c, x] = [await get('staff', '', qs), await get('staff', '/export.csv', qs), await xlsx('staff', qs)];
    const wb = await load(x.body);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Thống kê', 'Danh sách đề tài']);
    const s1 = sheetRows(wb.getWorksheet('Thống kê'));
    expect(s1).toEqual(j.body.rows.map((r) => [r.label, r.count]));
    expect(s1).toEqual(parseCsv(c.text.slice(1)).slice(1).map(([l, n]) => [l, Number(n)]));
    expect(sheetRows(wb.getWorksheet('Danh sách đề tài'))).toHaveLength(j.body.total);
    expect(codes(wb)).toEqual(['X39-p1', 'X39-p2', 'X39-p3']);
    expect(wb.getWorksheet('Danh sách đề tài').getRow(1).values.slice(1)).toEqual(['Mã', 'Tên đề tài', 'Trạng thái', 'Đợt', 'Năm học', 'Lĩnh vực', 'GVHD hiện hành', 'Số thành viên', 'Nguồn', 'Kết quả', 'Điểm bảo vệ']);
  });
  it('sheet 2: kết quả/điểm chỉ khi CLOSED, nguồn, số thành viên; không lộ dữ liệu SV', async () => {
    const wb = await load((await xlsx('staff', { groupBy: 'status' })).body);
    const rows = Object.fromEntries(sheetRows(wb.getWorksheet('Danh sách đề tài')).map((r) => [r[0], r]));
    expect(rows['X39-p2'].slice(2)).toEqual(['Đã đóng', 'Đợt 1', '2026-2027', 'Trí tuệ nhân tạo', 'Tên lectA', 1, 'Giảng viên công bố', 'Xuất sắc', 8.5]);
    expect(rows['X39-p1'][7]).toBe(0);
    expect(rows['X39-p1'][9] ?? '').toBe('');
    expect(rows['X39-p1'][10] ?? null).toBeNull();
    expect(JSON.stringify(rows)).not.toContain('sv@t.vn');
  });
  it('bộ lọc và phạm vi: GV chỉ đề tài mình; STAFF khoa khác; lọc status', async () => {
    expect(codes(await load((await xlsx('lectA', { groupBy: 'status' })).body))).toEqual(['X39-p1', 'X39-p2']);
    expect(codes(await load((await xlsx('staff2', { groupBy: 'status' })).body))).toEqual(['X39-q1']);
    const f = await load((await xlsx('staff', { groupBy: 'status', status: 'CLOSED' })).body);
    expect(codes(f)).toEqual(['X39-p2']);
    expect(sheetRows(f.getWorksheet('Thống kê'))).toEqual([['Đã đóng', 1]]);
  });
});

describe('TC-FR39-03 chống formula injection', () => {
  it('ô =, +, @ là chuỗi, không có formula', async () => {
    const wb = await load((await xlsx('staff', { groupBy: 'lecturer' })).body);
    const byCode = {};
    wb.getWorksheet('Danh sách đề tài').eachRow((row, i) => { if (i > 1) byCode[row.getCell(1).value] = row; });
    for (const [code, text] of [['X39-p1', '=1+1'], ['X39-p2', '+cmd|calc'], ['X39-p3', '@SUM(1+1)']]) {
      const cell = byCode[code].getCell(2);
      expect(cell.type).toBe(ExcelJS.ValueType.String);
      expect(cell.value).toBe(text);
      expect(cell.formula).toBeUndefined();
    }
    const lecturer = byCode['X39-p3'].getCell(7);
    expect(lecturer.type).toBe(ExcelJS.ValueType.String);
    expect(lecturer.value).toBe('=HYPERLINK("http://x")');
    const s1 = wb.getWorksheet('Thống kê');
    let formulas = 0;
    s1.eachRow((row) => row.eachCell((cell) => { if (cell.type === ExcelJS.ValueType.Formula) formulas += 1; }));
    expect(formulas).toBe(0);
    expect(sheetRows(s1).map((r) => r[0])).toContain('=HYPERLINK("http://x")'); // nhãn GV nguyên văn, kiểu chuỗi
  });
});

describe('TC-FR39-03b ký tự điều khiển và -, tab, CR đầu chuỗi', () => {
  it('cleanCell bỏ ký tự XML không hợp lệ, giữ tab/LF/CR; số không đổi', () => {
    expect(cleanCell('a\u0001b\u0008c\u000Bd\u001Fe')).toBe('abcde');
    expect(cleanCell('\tx\ny\rz')).toBe('\tx\ny\rz');
    expect(cleanCell(7.5)).toBe(7.5);
  });
  it('tên có ký tự điều khiển vẫn ra file đọc được; -, tab, CR đầu chuỗi là chuỗi', async () => {
    const titles = { c1: 'Tên\u0001hỏng', c2: '-2+3', c3: '\t=1', c4: '\r=1' };
    for (const [k, title] of Object.entries(titles)) await prisma.topic.create({ data: { code: `X39-${k}`, title, keywords: [], status: 'IN_PROGRESS', roundId: R1.id, facultyId: F1.id } });
    try {
      const wb = await load((await xlsx('staff', { groupBy: 'status' })).body);
      const byCode = {};
      wb.getWorksheet('Danh sách đề tài').eachRow((row, i) => { if (i > 1) byCode[row.getCell(1).value] = row.getCell(2); });
      expect(byCode['X39-c1'].value).toBe('Tênhỏng');
      for (const k of ['c2', 'c3', 'c4']) {
        expect(byCode[`X39-${k}`].type).toBe(ExcelJS.ValueType.String);
        // Trình đọc XML chuẩn hóa CR → LF (quy tắc end-of-line của XML), nội dung vẫn là chuỗi
        expect(byCode[`X39-${k}`].value).toBe(titles[k].replace(/\r/g, '\n'));
      }
    } finally {
      await prisma.topic.deleteMany({ where: { code: { in: ['X39-c1', 'X39-c2', 'X39-c3', 'X39-c4'] } } });
    }
  });
});

describe('TC-FR39-04 header', () => {
  it('Content-Type, Content-Disposition theo ngày VN, no-store', async () => {
    const r = await xlsx('staff', { groupBy: 'academicYear' });
    expect(r.headers['content-type']).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(r.headers['content-disposition']).toMatch(/^attachment; filename="thong-ke-academicYear-\d{8}\.xlsx"$/);
    expect(r.headers['cache-control']).toBe('no-store');
  });
});

describe('TC-FR39-05 trần 5.000', () => {
  it('đúng 5.000 → 200 đủ dòng; 5.001 → 400 VALIDATION_ERROR, không cắt cụt; thu hẹp bộ lọc thì tải được', async () => {
    const mk = (n, p) => prisma.topic.createMany({ data: Array.from({ length: n }, (_, i) => ({ code: `X39-${p}${i}`, title: `${p}${i}`, keywords: [], status: 'IN_PROGRESS', roundId: R2.id, facultyId: F2.id })) });
    await mk(4999, 'N'); // staff2 đã có q1 → tổng 5.000
    const ok = await xlsx('staff2', { groupBy: 'status' });
    expect(ok.status).toBe(200);
    expect(sheetRows((await load(ok.body)).getWorksheet('Danh sách đề tài'))).toHaveLength(5000);
    await mk(1, 'Z');
    const over = await get('staff2', '/export.xlsx', { groupBy: 'status' });
    expect(over.status).toBe(400);
    expect(over.body.error.code).toBe('VALIDATION_ERROR');
    expect(over.body.error.message).toBe('Quá nhiều đề tài, hãy thu hẹp bộ lọc');
    expect((await xlsx('staff2', { groupBy: 'status', fieldId: AI.id })).status).toBe(200); // chỉ q1 có lĩnh vực
  });
});
