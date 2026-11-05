// Dựng DB E2E: tạo nckh_t309_test nếu chưa có, reset, nạp seed T203 + tài khoản/đề tài riêng của E2E, ghi state.json.
import process from 'node:process';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { API_ENV, DB_NAME, OUT_DIR, STATE_FILE, TEMPLATE_URL } from './env.js';

Object.assign(process.env, API_ENV);
const apiDir = new URL('../../api/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const admin = new PrismaClient({ datasourceUrl: TEMPLATE_URL });
try {
  const found = await admin.$queryRawUnsafe(`SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}'`);
  if (!found.length) await admin.$executeRawUnsafe(`CREATE DATABASE ${DB_NAME}`);
} finally {
  await admin.$disconnect();
}
execSync('npm run db:test:reset', { cwd: apiDir, stdio: 'inherit', env: process.env });

const { seed, SEED_PASSWORD } = await import('../../api/prisma/seed.js');
const { nextTopicCode } = await import('../../api/src/modules/topics/code.js');
const prisma = new PrismaClient();
try {
  await seed(prisma);
  await prisma.user.updateMany({ data: { mustChangePassword: false } });
  const [round, base] = [await prisma.round.findFirst(), await prisma.user.findUnique({ where: { code: 'QT001' } })];
  const faculty = await prisma.faculty.findFirst();
  const mk = (role, code, fullName) => prisma.user.create({ data: { code, email: `${code.toLowerCase()}@nckh.example`, fullName, passwordHash: base.passwordHash, role, mustChangePassword: false, facultyId: faculty.id } });
  const [sv1, sv2, sv3, gv, cb] = [
    await mk('STUDENT', 'SVE2E1', 'Nguyễn Thị Đào E2E'), await mk('STUDENT', 'SVE2E2', 'Trần Văn Ê E2E'), await mk('STUDENT', 'SVE2E3', 'Lê Văn Mobile'),
    await mk('LECTURER', 'GVE2E', 'TS. Phạm Đức E2E'), await mk('STAFF', 'CBE2E', 'Võ Thị Cán Bộ E2E'),
  ];
  await prisma.staffScope.create({ data: { userId: cb.id, facultyId: faculty.id } });

  const inProg = await prisma.topic.findMany({ where: { status: 'IN_PROGRESS' }, include: { field: true }, orderBy: { code: 'asc' }, take: 2 });
  const content = (t) => ({ title: t.title, summary: t.summary, objectives: t.objectives, keywords: t.keywords, fieldName: t.field.name });
  // Đề tài SV3 (ca 360 px) ở HAS_ADVISOR, nội dung trùng đề tài đang thực hiện thứ hai -> HIGH
  const m = inProg[1];
  const mobile = await prisma.$transaction(async (tx) => {
    const t = await tx.topic.create({ data: { code: await nextTopicCode(tx, round.academicYear), roundId: round.id, facultyId: faculty.id, fieldId: m.fieldId, title: m.title, summary: m.summary, objectives: m.objectives, keywords: m.keywords, status: 'HAS_ADVISOR', version: 2 } });
    await tx.topicMember.create({ data: { topicId: t.id, userId: sv3.id, role: 'LEADER' } });
    await tx.advisorRequest.create({ data: { topicId: t.id, lecturerId: gv.id, status: 'ACCEPTED', respondedAt: new Date() } });
    await tx.advising.create({ data: { topicId: t.id, lecturerId: gv.id } });
    return t;
  });
  // Đề tài đã đóng kết quả FAIL: không được xuất hiện trong kho
  const failTopic = await prisma.$transaction(async (tx) => {
    const t = await tx.topic.create({ data: { code: await nextTopicCode(tx, round.academicYear), roundId: round.id, facultyId: faculty.id, fieldId: m.fieldId, title: 'Đề tài đóng không đạt E2E', summary: 'Tóm tắt đề tài không đạt dùng cho kiểm thử kho.', objectives: 'Mục tiêu', keywords: ['không đạt'], status: 'CLOSED', version: 9 } });
    await tx.topicMember.create({ data: { topicId: t.id, userId: sv2.id, role: 'LEADER' } });
    await tx.resultVersion.create({ data: { topicId: t.id, version: 1, result: 'FAIL', summary: 'Không đạt', createdById: cb.id } });
    return t;
  });
  // GĐ4 (T407): hai đề tài IN_PROGRESS có GVHD GVE2E; "flow" chạy đủ luồng đóng, "neg" không đủ điều kiện (ca âm + 360 px)
  const [sv4, sv5] = [await mk('STUDENT', 'SVE2E4', 'Đặng Thị Hạnh E2E'), await mk('STUDENT', 'SVE2E5', 'Bùi Văn Di Động')];
  const day = 86_400_000;
  const mkExec = (sv, title, milestones) => prisma.$transaction(async (tx) => {
    const t = await tx.topic.create({ data: { code: await nextTopicCode(tx, round.academicYear), roundId: round.id, facultyId: faculty.id, fieldId: m.fieldId, title, summary: 'Tóm tắt đề tài thực hiện dùng cho kiểm thử E2E giai đoạn 4.', objectives: 'Mục tiêu', keywords: ['thực hiện'], status: 'IN_PROGRESS', version: 5 } });
    await tx.topicMember.create({ data: { topicId: t.id, userId: sv.id, role: 'LEADER' } });
    await tx.advisorRequest.create({ data: { topicId: t.id, lecturerId: gv.id, status: 'ACCEPTED', respondedAt: new Date() } });
    await tx.advising.create({ data: { topicId: t.id, lecturerId: gv.id } });
    for (const [i, [name, dueMs]] of milestones.entries()) {
      await tx.milestone.create({ data: { topicId: t.id, order: i + 1, name, output: 'Báo cáo PDF', dueAt: new Date(Date.now() + dueMs), required: true, createdById: gv.id } });
    }
    return t;
  });
  const flow = await mkExec(sv4, 'Đề tài thực hiện E2E luồng đóng', [['Báo cáo giữa kỳ E2E', 30 * day], ['Báo cáo cuối kỳ E2E', -2 * day]]);
  const neg = await mkExec(sv5, 'Đề tài thực hiện E2E chưa đủ điều kiện', [['Mốc chưa đạt E2E', 30 * day]]);
  const closedOk = await prisma.topic.findMany({ where: { status: 'CLOSED', results: { some: { isCurrent: true, result: { in: ['EXCELLENT', 'GOOD', 'PASS'] } } } }, select: { code: true, title: true, summary: true, results: { where: { isCurrent: true }, select: { result: true } } }, orderBy: { code: 'asc' } });
  const leaders = await prisma.user.findMany({ where: { code: { in: ['SV22027', 'SV22028'] } }, select: { fullName: true } });
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify({
    exec: { flow: { id: flow.id, code: flow.code, sv: { code: sv4.code } }, neg: { id: neg.id, code: neg.code, sv: { code: sv5.code } } },
    password: SEED_PASSWORD, main: content(inProg[0]), mobile: { id: mobile.id, code: mobile.code, ...content(m) },
    fail: { code: failTopic.code, title: failTopic.title }, closedOk, leaderNames: leaders.map((l) => l.fullName),
    users: { sv1: { code: sv1.code, name: sv1.fullName }, sv2: { code: sv2.code, name: sv2.fullName }, gv: { code: gv.code, name: gv.fullName }, cb: { code: cb.code }, admin: { code: 'QT001' } },
  }, null, 2));
  console.log(`E2E DB sẵn sàng: ${closedOk.length} đề tài kho, 1 đề tài FAIL.`);
} finally {
  await prisma.$disconnect();
}
