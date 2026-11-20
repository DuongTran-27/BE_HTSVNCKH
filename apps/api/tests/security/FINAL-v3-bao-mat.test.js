// Review bảo mật cuối v3 (mở rộng đề cương DC-00..24): quét chéo các route mới.
// 1) ADMIN không có quyền nghiệp vụ trên mọi route mới (FR25). 2) Ủy viên không thấy điểm người khác trước chốt qua
// MỌI đường đọc (chi tiết phân công, danh sách phân công, chi tiết hội đồng, chi tiết đề tài) – G53.
// 3) G62: đề tài CLOSED thì thành viên hội đồng mất quyền đọc đề tài. 4) Đơn ứng tuyển: SV không đọc/rút đơn người khác (IDOR),
// không lộ email/SĐT SV.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma, S, U, tok, seedBase, mkTopic, get, post, app, as } from '../t214-kit.js';
import { signAccessToken } from '../../src/lib/tokens.js';
import { testEnv } from '../helpers.js';
import request from 'supertest';

const COMMENT = 'Nhận xét của thành viên hội đồng.';
let council, a, t, appRow, leader;

beforeAll(async () => {
  await seedBase({ students: 10 });
  for (const k of ['lecD']) {
    U[k] = await prisma.user.create({ data: { code: k, email: `${k}@t.vn`, fullName: `Tên ${k}`, passwordHash: 'x', role: 'LECTURER', mustChangePassword: false, facultyId: S.F1.id } });
    tok[k] = signAccessToken(U[k], { secret: testEnv.JWT_ACCESS_SECRET, ttlSeconds: 600 });
  }
  leader = 's1';
  t = await mkTopic(leader, S.round, { status: 'WAITING_DEFENSE' });
  await prisma.advising.create({ data: { topicId: t.id, lecturerId: U.lecA.id } });
  council = await prisma.council.create({
    data: { code: 'HD-SEC-1', name: 'Hội đồng bảo mật', facultyId: S.F1.id, roundId: S.round.id, createdById: U.staff1.id,
      members: { create: [{ lecturerId: U.lecB.id, role: 'CHAIR' }, { lecturerId: U.lecC.id, role: 'SECRETARY' }, { lecturerId: U.lecD.id, role: 'MEMBER' }] } },
  });
  a = await prisma.councilAssignment.create({ data: { councilId: council.id, topicId: t.id, assignedById: U.staff1.id } });
  await prisma.defenseScore.create({ data: { assignmentId: a.id, memberId: U.lecB.id, score: '9.75', comment: COMMENT } });
  await prisma.defenseScore.create({ data: { assignmentId: a.id, memberId: U.lecD.id, score: '4.25', comment: COMMENT } });
  // Đơn ứng tuyển của s2 vào một đề tài GV đang tuyển
  const rt = await mkTopic('s9', S.round, { status: 'RECRUITING', origin: 'LECTURER' });
  await prisma.topicMember.deleteMany({ where: { topicId: rt.id } });
  await prisma.advising.create({ data: { topicId: rt.id, lecturerId: U.lecA.id } });
  await prisma.user.update({ where: { id: U.s2.id }, data: { phone: '0912345678' } });
  appRow = await prisma.topicApplication.create({ data: { topicId: rt.id, studentId: U.s2.id, coverLetter: 'Em muốn tham gia đề tài này.' } });
}, 60000);
afterAll(() => prisma.$disconnect());

describe('FINAL v3 – ADMIN không có quyền nghiệp vụ trên route mới (FR25)', () => {
  it('mọi route mới trả 403 cho ADMIN', async () => {
    const id = a.id;
    const calls = [
      ['get', '/api/recruitments'], ['get', `/api/recruitments/${t.id}`], ['post', `/api/recruitments/${t.id}/applications`, { coverLetter: 'Em muốn tham gia đề tài này.' }],
      ['get', '/api/applications'], ['post', `/api/applications/${appRow.id}/withdraw`, {}], ['post', `/api/applications/${appRow.id}/accept`, {}],
      ['post', `/api/applications/${appRow.id}/decline`, { reason: 'Không phù hợp với đề tài.' }], ['get', `/api/topics/${appRow.topicId}/applications`],
      ['get', '/api/councils'], ['get', `/api/councils/${council.id}`], ['post', '/api/councils', {}], ['patch', `/api/councils/${council.id}`, {}],
      ['put', `/api/councils/${council.id}/members`, {}], ['post', `/api/councils/${council.id}/assignments`, {}],
      ['get', '/api/council-assignments'], ['get', `/api/council-assignments/${id}`], ['put', `/api/council-assignments/${id}/my-score`, { score: 8, comment: COMMENT }],
      ['post', `/api/council-assignments/${id}/finalize`, {}], ['post', `/api/council-assignments/${id}/cancel`, { reason: 'Lý do hủy phân công.' }],
      ['get', '/api/stats/export.xlsx?groupBy=field'],
    ];
    for (const [m, url, body] of calls) {
      const r = await request(app)[m](url).set(as('admin')).send(body ?? {});
      expect(r.status, `${m} ${url}`).toBe(403);
    }
  });
});

describe('FINAL v3 – G53 ủy viên không thấy điểm người khác trước chốt qua mọi đường đọc', () => {
  it('chi tiết/danh sách phân công, chi tiết hội đồng, chi tiết đề tài không chứa 9.75 của chủ tịch', async () => {
    const reads = [`/api/council-assignments/${a.id}`, '/api/council-assignments', `/api/councils/${council.id}`, '/api/councils', `/api/topics/${t.id}`];
    for (const url of reads) {
      const r = await get('lecD', url);
      expect(r.status, url).toBe(200);
      expect(JSON.stringify(r.body), url).not.toContain('9.75');
    }
    // Chủ tịch thấy (G53), SV/GVHD không thấy điểm thành viên trước chốt
    expect(JSON.stringify((await get('lecB', `/api/council-assignments/${a.id}`)).body)).toContain('4.25');
    for (const who of [leader, 'lecA']) {
      const r = await get(who, `/api/topics/${t.id}`);
      expect(r.status, who).toBe(200);
      expect(JSON.stringify(r.body), who).not.toMatch(/9\.75|4\.25/);
    }
  });
});

describe('FINAL v3 – đơn ứng tuyển: IDOR và PII', () => {
  it('SV khác không rút được đơn của s2, danh sách đơn không có đơn người khác; GV không thấy email/SĐT SV', async () => {
    expect((await post('s3', `/api/applications/${appRow.id}/withdraw`)).status).toBe(403);
    const mine = await get('s3', '/api/applications');
    expect(mine.status).toBe(200);
    expect(mine.body.items.map((x) => x.id)).not.toContain(appRow.id);
    // GV ngoài đề tài không duyệt được
    expect((await post('lecB', `/api/applications/${appRow.id}/accept`)).status).toBe(403);
    const lec = await get('lecA', '/api/applications');
    expect(lec.body.items.map((x) => x.id)).toContain(appRow.id);
    const s = JSON.stringify(lec.body);
    expect(s).not.toContain('0912345678');
    expect(s).not.toContain(U.s2.email);
    expect(s).not.toMatch(/passwordHash/);
  });
});

describe('FINAL v3 – G62 sau khi đóng đề tài', () => {
  it('thành viên hội đồng mất quyền đọc đề tài CLOSED; cán bộ vẫn đọc', async () => {
    await prisma.$executeRaw`UPDATE "Topic" SET status = 'CLOSED' WHERE id = ${t.id}`;
    for (const who of ['lecB', 'lecD']) expect((await get(who, `/api/topics/${t.id}`)).status, who).toBe(403);
    expect((await get('staff1', `/api/topics/${t.id}`)).status).toBe(200);
  });
});


describe('FINAL v3 – m1 điểm 0..10 kiểm ở DB', () => {
  it('CHECK miền điểm có trên ProcessScore, DefenseScore, CouncilAssignment và đã được kiểm (validated)', async () => {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT conname, convalidated, pg_get_constraintdef(oid) AS def FROM pg_constraint
       WHERE conname IN ('ProcessScore_score_range', 'DefenseScore_score_range', 'CouncilAssignment_finalScore_range') ORDER BY conname`,
    );
    expect(rows.map((r) => r.conname)).toEqual(['CouncilAssignment_finalScore_range', 'DefenseScore_score_range', 'ProcessScore_score_range']);
    for (const r of rows) {
      expect(r.convalidated).toBe(true);
      expect(r.def).toMatch(/>= ?\(?0/);
      expect(r.def).toMatch(/<= ?\(?10/);
    }
  });
});
