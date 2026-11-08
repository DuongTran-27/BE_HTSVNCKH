// T401 (FR09, API_GD45 §3, §11b): mốc thực hiện + schema/trigger/index của migration gd4_execution. DB test thật.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma, S, U, seedBase, mkTopic, post, get, at, as } from './t214-kit.js';
import request from 'supertest';
import { app } from './t214-kit.js';
import { resetData } from './db.js';

const patch = (who, url, body) => request(app).patch(url).set(as(who)).send(body);
const iso = (d) => at(d).toISOString();
let seq = 0;
const mkRunning = async (extra = {}) => {
  const t = await mkTopic(`s${++seq}`, S.round, { status: 'IN_PROGRESS', ...extra });
  await prisma.advising.create({ data: { topicId: t.id, lecturerId: U.lecA.id } });
  return t;
};
const mk = (who, t, body = {}) => post(who, `/api/topics/${t.id}/milestones`, { name: 'Báo cáo giữa kỳ', output: 'PDF', dueAt: iso(10), ...body });
const rawErr = (sql) => prisma.$executeRawUnsafe(sql).then(() => null, (e) => String(e.message));

beforeAll(() => seedBase({ students: 60 }), 60000);
afterAll(() => prisma.$disconnect());

describe('POST /api/topics/:id/milestones', () => {
  it('TC-FR09-01 GVHD hiện hành và cán bộ trong phạm vi tạo được; order tăng, mặc định bắt buộc, version 0', async () => {
    const t = await mkRunning();
    const a = await mk('lecA', t);
    expect(a.status, JSON.stringify(a.body)).toBe(201);
    expect(a.body.milestone).toMatchObject({ order: 1, required: true, evaluation: 'PENDING', version: 0, isOverdue: false, latestDocument: null, dueChangeCount: 0 });
    const b = await mk('staff1', t, { name: 'Mốc 2', required: false });
    expect(b.body.milestone).toMatchObject({ order: 2, required: false });
    expect((await prisma.milestone.findUnique({ where: { id: b.body.milestone.id } })).createdById).toBe(U.staff1.id);
    expect(await prisma.auditLog.count({ where: { action: 'MILESTONE_CREATE', entityId: a.body.milestone.id } })).toBe(1);
  });

  it('TC-FR09-02 403: thành viên SV, GV không phải GVHD, cán bộ khoa khác, ADMIN; người ngoài không biết trạng thái', async () => {
    const t = await mkRunning();
    for (const who of [`s${seq}`, 'lecB', 'staff2', 'admin', 's60']) {
      const r = await mk(who, t);
      expect(r.status, who).toBe(403);
    }
    expect(await prisma.milestone.count({ where: { topicId: t.id } })).toBe(0);
  });

  it('409 TOPIC_NOT_IN_PROGRESS khi đề tài không phải IN_PROGRESS', async () => {
    for (const status of ['HAS_ADVISOR', 'WAITING_CLOSE', 'CLOSED']) {
      const t = await mkRunning({ status });
      const r = await mk('lecA', t);
      expect([r.status, r.body.error.code], status).toEqual([409, 'TOPIC_NOT_IN_PROGRESS']);
    }
  });

  it('400 khi hạn ở quá khứ hoặc thiếu trường; 404 khi không có đề tài', async () => {
    const t = await mkRunning();
    const past = await mk('lecA', t, { dueAt: iso(-1) });
    expect([past.status, past.body.error.details.dueAt]).toEqual([400, 'Hạn phải sau thời điểm hiện tại']);
    expect((await mk('lecA', t, { name: '  ' })).status).toBe(400);
    expect((await post('lecA', '/api/topics/khongco123/milestones', { name: 'a', output: 'b', dueAt: iso(1) })).status).toBe(404);
  });

  it('409 MILESTONE_LIMIT ở mốc thứ 21', async () => {
    const t = await mkRunning();
    await prisma.milestone.createMany({ data: Array.from({ length: 20 }, (_, i) => ({ topicId: t.id, order: i + 1, name: `m${i}`, output: 'o', dueAt: at(5), createdById: U.lecA.id })) });
    const r = await mk('lecA', t);
    expect([r.status, r.body.error.code]).toEqual([409, 'MILESTONE_LIMIT']);
  });
});

describe('GET /api/topics/:id/milestones', () => {
  it('thành viên, GVHD, cán bộ đọc được theo order; người ngoài 403; ADMIN 403', async () => {
    const t = await mkRunning();
    await mk('lecA', t, { name: 'A' });
    await mk('lecA', t, { name: 'B' });
    for (const who of [`s${seq}`, 'lecA', 'staff1']) {
      const r = await get(who, `/api/topics/${t.id}/milestones`);
      expect(r.status, who).toBe(200);
      expect(r.body.items.map((m) => m.name)).toEqual(['A', 'B']);
    }
    for (const who of ['lecB', 'staff2', 'admin', 's60']) expect((await get(who, `/api/topics/${t.id}/milestones`)).status, who).toBe(403);
  });

  it('đọc được cả khi đề tài đã đóng; isOverdue theo giờ server', async () => {
    const t = await mkRunning({ status: 'CLOSED' });
    await prisma.milestone.create({ data: { topicId: t.id, order: 1, name: 'Quá hạn', output: 'o', dueAt: at(-2), createdById: U.lecA.id } });
    const r = await get('lecA', `/api/topics/${t.id}/milestones`);
    expect(r.body.items[0].isOverdue).toBe(true);
  });
});

describe('PATCH /api/milestones/:id', () => {
  it('sửa name/output/required, tăng version, ghi AuditLog; version lệch 409; có dueAt 400 (strict)', async () => {
    const t = await mkRunning();
    const m = (await mk('lecA', t)).body.milestone;
    const ok = await patch('staff1', `/api/milestones/${m.id}`, { version: 0, name: 'Tên mới' });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.milestone).toMatchObject({ name: 'Tên mới', version: 1 });
    const stale = await patch('lecA', `/api/milestones/${m.id}`, { version: 0, name: 'x' });
    expect([stale.status, stale.body.error.code]).toEqual([409, 'CONCURRENT_UPDATE']);
    expect((await patch('lecA', `/api/milestones/${m.id}`, { version: 1, dueAt: iso(3) })).status).toBe(400);
    expect((await patch('lecA', `/api/milestones/${m.id}`, { version: 1 })).status).toBe(400);
    expect(await prisma.auditLog.count({ where: { action: 'MILESTONE_UPDATE', entityId: m.id } })).toBe(1);
  });

  it('403 SV/GV khác/cán bộ khác/ADMIN; 409 khi đề tài không IN_PROGRESS; 404 mốc không tồn tại', async () => {
    const t = await mkRunning();
    const m = (await mk('lecA', t)).body.milestone;
    for (const who of [`s${seq}`, 'lecB', 'staff2', 'admin']) expect((await patch(who, `/api/milestones/${m.id}`, { version: 0, name: 'x' })).status, who).toBe(403);
    await prisma.topic.update({ where: { id: t.id }, data: { status: 'WAITING_CLOSE' } });
    const r = await patch('lecA', `/api/milestones/${m.id}`, { version: 0, name: 'x' });
    expect([r.status, r.body.error.code]).toEqual([409, 'TOPIC_NOT_IN_PROGRESS']);
    expect((await patch('lecA', '/api/milestones/khongco123', { version: 0, name: 'x' })).status).toBe(404);
  });

  it('bỏ cờ bắt buộc khi chưa Đạt: requiredRemovedCount đếm theo cột; bật lại hoặc đã Đạt thì không đếm', async () => {
    const t = await mkRunning();
    for (const n of ['a', 'b']) await mk('lecA', t, { name: n });
    const ms = (await prisma.milestone.findMany({ where: { topicId: t.id }, orderBy: { order: 'asc' } }));
    const { createExecutionRepo } = await import('../src/modules/execution/prismaRepo.js');
    const repo = createExecutionRepo(prisma);
    expect(await repo.countRequiredRemoved(t.id)).toBe(0);
    await patch('lecA', `/api/milestones/${ms[0].id}`, { version: 0, required: false });
    await patch('lecA', `/api/milestones/${ms[1].id}`, { version: 0, required: false });
    await prisma.milestone.update({ where: { id: ms[1].id }, data: { evaluation: 'PASSED' } }); // đã Đạt thì không tính
    expect(await repo.countRequiredRemoved(t.id)).toBe(1);
    await patch('lecA', `/api/milestones/${ms[0].id}`, { version: 1, required: true });
    expect(await repo.countRequiredRemoved(t.id)).toBe(0);
    const row = await prisma.milestone.findUnique({ where: { id: ms[0].id } });
    expect(row.requiredRemovedAt).toBeNull();
  });

  it('PATCH không đổi giá trị: không tăng version, không audit', async () => {
    const t = await mkRunning();
    const m = (await mk('lecA', t)).body.milestone;
    const r = await patch('lecA', `/api/milestones/${m.id}`, { version: 0, required: true, name: m.name });
    expect([r.status, r.body.milestone.version]).toEqual([200, 0]);
    expect(await prisma.auditLog.count({ where: { action: 'MILESTONE_UPDATE', entityId: m.id } })).toBe(0);
  });

  it('hai PATCH đồng thời cùng version: đúng một bên thắng', async () => {
    const t = await mkRunning();
    const m = (await mk('lecA', t)).body.milestone;
    const rs = await Promise.all([patch('lecA', `/api/milestones/${m.id}`, { version: 0, name: 'x1' }), patch('staff1', `/api/milestones/${m.id}`, { version: 0, name: 'x2' })]);
    expect(rs.map((r) => r.status).sort()).toEqual([200, 409]);
  });
});

describe('due-changes (đổi hạn có lịch sử)', () => {
  it('TC-FR09-03 đổi hạn: ghi oldDueAt từ DB, lý do, người đổi; GET trả mới nhất trước; bất biến ở DB', async () => {
    const t = await mkRunning();
    const m = (await mk('lecA', t)).body.milestone;
    const url = `/api/milestones/${m.id}/due-changes`;
    const r1 = await post('staff1', url, { version: 0, newDueAt: iso(20), reason: 'Gia hạn do nghỉ lễ' });
    expect(r1.status, JSON.stringify(r1.body)).toBe(201);
    expect(r1.body.dueChange).toMatchObject({ oldDueAt: m.dueAt, reason: 'Gia hạn do nghỉ lễ', changedBy: { id: U.staff1.id, role: 'STAFF' } });
    expect(r1.body.milestone).toMatchObject({ version: 1, dueChangeCount: 1, dueAt: r1.body.dueChange.newDueAt });
    const r2 = await post('lecA', url, { version: 1, newDueAt: iso(5), reason: 'Rút ngắn hạn' }); // G18: được rút ngắn
    expect(r2.status).toBe(201);
    const list = await get(`s${seq}`, url);
    expect(list.body.items.map((c) => c.reason)).toEqual(['Rút ngắn hạn', 'Gia hạn do nghỉ lễ']);
    expect(await rawErr(`UPDATE "MilestoneDueChange" SET reason = 'x'`)).toMatch(/chỉ cho phép thêm mới/);
    expect(await rawErr(`DELETE FROM "MilestoneDueChange"`)).toMatch(/chỉ cho phép thêm mới/);
    expect(await rawErr(`TRUNCATE "MilestoneDueChange"`)).toMatch(/chỉ cho phép thêm mới/);
    expect(await prisma.auditLog.count({ where: { action: 'MILESTONE_DUE_CHANGE', entityId: m.id } })).toBe(2);
  });

  it('TC-FR09-04 400 hạn trùng/quá khứ/lý do ngắn; 409 version lệch; 409 sai trạng thái; 403 vai trò sai; không ghi gì khi lỗi', async () => {
    const t = await mkRunning();
    const m = (await mk('lecA', t)).body.milestone;
    const url = `/api/milestones/${m.id}/due-changes`;
    const same = await post('lecA', url, { version: 0, newDueAt: m.dueAt, reason: 'Lý do dài đủ' });
    expect([same.status, same.body.error.details.newDueAt]).toEqual([400, 'Hạn mới phải khác hạn cũ']);
    expect((await post('lecA', url, { version: 0, newDueAt: iso(-1), reason: 'Lý do dài đủ' })).status).toBe(400);
    expect((await post('lecA', url, { version: 0, newDueAt: iso(30), reason: 'ngắn' })).status).toBe(400);
    const stale = await post('lecA', url, { version: 5, newDueAt: iso(30), reason: 'Lý do dài đủ' });
    expect([stale.status, stale.body.error.code]).toEqual([409, 'CONCURRENT_UPDATE']);
    for (const who of [`s${seq}`, 'lecB', 'staff2', 'admin']) expect((await post(who, url, { version: 0, newDueAt: iso(30), reason: 'Lý do dài đủ' })).status, who).toBe(403);
    await prisma.topic.update({ where: { id: t.id }, data: { status: 'CLOSED' } });
    const closed = await post('lecA', url, { version: 0, newDueAt: iso(30), reason: 'Lý do dài đủ' });
    expect([closed.status, closed.body.error.code]).toEqual([409, 'TOPIC_NOT_IN_PROGRESS']);
    expect(await prisma.milestoneDueChange.count({ where: { milestoneId: m.id } })).toBe(0);
    expect((await get('lecB', url)).status).toBe(403);
  });
});

describe('migration gd4_execution – schema, index, trigger (API_GD45 §11b)', () => {
  it('có 2 unique index + các index Prisma, 7 trigger mới, 4 CHECK', async () => {
    const idx = (await prisma.$queryRaw`SELECT indexname FROM pg_indexes WHERE schemaname='public'`).map((r) => r.indexname);
    for (const n of ['result_one_current', 'document_chain_version', 'Milestone_topicId_order_idx', 'Milestone_dueAt_idx', 'Milestone_topicId_requiredRemovedAt_idx', 'ProgressUpdate_topicId_createdAt_idx', 'Document_milestoneId_version_idx', 'Feedback_topicId_createdAt_idx', 'Feedback_progressUpdateId_idx', 'ResultVersion_topicId_isCurrent_idx']) expect(idx, n).toContain(n);
    const trg = (await prisma.$queryRaw`SELECT tgname FROM pg_trigger WHERE NOT tgisinternal`).map((r) => r.tgname);
    for (const n of ['document_immutable', 'milestone_due_change_immutable', 'feedback_immutable', 'document_no_truncate', 'feedback_no_truncate', 'milestone_due_change_no_truncate', 'result_version_guarded', 'result_version_no_truncate']) expect(trg, n).toContain(n);
    const ck = (await prisma.$queryRaw`SELECT conname FROM pg_constraint WHERE contype='c'`).map((r) => r.conname);
    for (const n of ['progress_percent_range', 'document_kind_ck', 'document_stage_ck', 'feedback_target_ck']) expect(ck, n).toContain(n);
  });

  it('ResultVersion: một bản hiện hành/đề tài; chỉ được hạ isCurrent; Document trùng chuỗi phiên bản bị chặn', async () => {
    const t = await mkRunning();
    const rv = (version, isCurrent = true) => prisma.resultVersion.create({ data: { topicId: t.id, version, result: 'GOOD', summary: 's', createdById: U.lecA.id, isCurrent } });
    const r1 = await rv(1);
    await expect(rv(2)).rejects.toMatchObject({ code: 'P2002' });
    await prisma.resultVersion.update({ where: { id: r1.id }, data: { isCurrent: false } });
    await rv(2);
    expect(await rawErr(`UPDATE "ResultVersion" SET summary = 'x' WHERE id = '${r1.id}'`)).toMatch(/chỉ được hạ isCurrent/);
    expect(await rawErr(`UPDATE "ResultVersion" SET "isCurrent" = true WHERE id = '${r1.id}'`)).toMatch(/chỉ được hạ isCurrent/);
    expect(await rawErr(`DELETE FROM "ResultVersion" WHERE id = '${r1.id}'`)).toMatch(/chỉ thêm/);

    const doc = (version, over = {}) => prisma.document.create({ data: { topicId: t.id, stage: 'PROPOSAL', kind: 'FILE', version, fileName: 'a.pdf', publicId: `p-${Math.random()}`, status: 'READY', uploadedById: U.s1.id, ...over } });
    const d1 = await doc(1);
    await expect(doc(1)).rejects.toMatchObject({ code: 'P2002' });
    await expect(doc(2, { publicId: null })).rejects.toThrow(); // kind FILE cần publicId
    await expect(doc(2, { stage: 'MIDTERM' })).rejects.toThrow(); // MIDTERM cần milestoneId
    expect(await rawErr(`UPDATE "Document" SET "fileName" = 'x' WHERE id = '${d1.id}'`)).toMatch(/chỉ cho phép thêm mới/);
    await expect(prisma.progressUpdate.create({ data: { topicId: t.id, authorId: U.s1.id, done: 'd', issues: '', nextPlan: 'n', percent: 101 } })).rejects.toThrow();
    await expect(prisma.feedback.create({ data: { topicId: t.id, lecturerId: U.lecA.id, content: 'c' } })).rejects.toThrow(); // thiếu đích
  });

  it('resetData chạy được khi đã có dữ liệu ở bảng có trigger chỉ-thêm mới, rồi bảng rỗng', async () => {
    await resetData(prisma);
    for (const tbl of ['Document', 'Feedback', 'MilestoneDueChange', 'ResultVersion', 'Milestone']) {
      expect(await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${tbl}"`), tbl).toEqual([{ n: 0 }]);
    }
  });
});
