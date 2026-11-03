// T214: dựng app + dữ liệu nền dùng chung cho các file T214-*.test.js (chỉ qua HTTP + Prisma, không gọi service).
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../src/app.js';
import { createAuthRepo } from '../src/modules/auth/prismaRepo.js';
import { createTopicRepo } from '../src/modules/topics/prismaRepo.js';
import { createRoundRepo } from '../src/modules/rounds/prismaRepo.js';
import { createAccountRepo } from '../src/modules/accounts/prismaRepo.js';
import { signAccessToken } from '../src/lib/tokens.js';
import { fakeHasher, testEnv } from './helpers.js';
import { resetData } from './db.js';

export const prisma = new PrismaClient();
export const app = createApp({ env: testEnv, logger: undefined, authRepo: createAuthRepo(prisma), hasher: fakeHasher, topicRepo: createTopicRepo(prisma), roundRepo: createRoundRepo(prisma), accountRepo: createAccountRepo(prisma) });

export const S = {}; // F1, F2, field, round
export const U = {};
export const tok = {};
export const day = 86400000;
export const at = (d) => new Date(Date.now() + d * day);
export const as = (who) => ({ Authorization: `Bearer ${tok[who]}` });
export const post = (who, url, body = {}) => request(app).post(url).set(as(who)).send(body);
export const put = (who, url, body) => request(app).put(url).set(as(who)).send(body);
export const get = (who, url) => request(app).get(url).set(as(who));
export const act = (who, topic, body) => post(who, `/api/topics/${topic.id ?? topic}/actions`, { version: 0, ...body });

// Cấu hình đợt nhẹ để dữ liệu test ngắn; phần còn lại theo mặc định đặc tả.
export const CFG = { minSummaryWords: 3, minKeywords: 1 };
export const mkRound = (facultyId, name, config = {}, open = -1, close = 30) =>
  prisma.round.create({ data: { facultyId, name, academicYear: '2026-2027', regOpenAt: at(open), regCloseAt: at(close), reviewDeadline: at(60), endAt: at(200), config: { ...CFG, ...config } } });

let seq = 0;
// Từ ngẫu nhiên để hai đề tài của test không bị FR06 coi là nghi trùng (cần giải trình) khi gửi xét duyệt.
const words = (k) => Array.from({ length: k }, () => Math.random().toString(36).slice(2, 9)).join(' ');
export const CONTENT = () => ({ title: `Đề tài ${words(6)}`, summary: words(8), objectives: `Mục tiêu ${words(8)}`, keywords: [words(1)] });
export const mkTopic = (leader, round = S.round, extra = {}) => {
  seq += 1;
  return prisma.topic.create({
    data: {
      code: `T214-${Date.now().toString(36)}-${seq}`, ...CONTENT(), fieldId: S.field.id, roundId: round.id, facultyId: round.facultyId, status: 'DRAFT',
      members: { create: { userId: U[leader].id, role: 'LEADER' } }, ...extra,
    },
  });
};
export const addMember = (t, who) => prisma.topicMember.create({ data: { topicId: t.id, userId: U[who].id, role: 'MEMBER' } });
export const mkInvite = (t, who) => prisma.invitation.create({ data: { topicId: t.id, inviteeId: U[who].id } });
export const mkWaiting = async (leader, lec, round = S.round) => {
  const t = await mkTopic(leader, round, { status: 'WAITING_ADVISOR' });
  await prisma.advisorRequest.create({ data: { topicId: t.id, lecturerId: U[lec].id } });
  return t;
};
export const topicOf = (t) => prisma.topic.findUnique({ where: { id: t.id } });
const ACTIVE = ['WAITING_ADVISOR', 'HAS_ADVISOR', 'UNDER_REVIEW', 'NEEDS_REVISION', 'IN_PROGRESS', 'WAITING_CLOSE'];
export const activeCount = (who, roundId = S.round.id) =>
  prisma.topic.count({ where: { roundId, status: { in: ACTIVE }, members: { some: { userId: U[who].id, leftAt: null } } } });

export async function seedBase({ students = 80 } = {}) {
  await resetData(prisma);
  S.F1 = await prisma.faculty.create({ data: { code: 'CNTT', name: 'Công nghệ thông tin' } });
  S.F2 = await prisma.faculty.create({ data: { code: 'KT', name: 'Kinh tế' } });
  S.field = await prisma.field.create({ data: { code: 'AI', name: 'Trí tuệ nhân tạo' } });
  S.round = await mkRound(S.F1.id, 'Đợt mặc định');
  const mk = async (key, role, facultyId, extra = {}) => {
    U[key] = await prisma.user.create({ data: { code: key, email: `${key}@t.vn`, fullName: `Tên ${key}`, passwordHash: 'x', role, mustChangePassword: false, facultyId, ...extra } });
    tok[key] = signAccessToken(U[key], { secret: testEnv.JWT_ACCESS_SECRET, ttlSeconds: 600 });
  };
  await mk('admin', 'ADMIN');
  await mk('staff1', 'STAFF', S.F1.id);
  await mk('staff2', 'STAFF', S.F2.id);
  for (const k of ['lecA', 'lecB', 'lecC']) await mk(k, 'LECTURER', S.F1.id);
  await mk('lecF2', 'LECTURER', S.F2.id);
  await mk('sF2', 'STUDENT', S.F2.id);
  for (let i = 1; i <= students; i++) await mk(`s${i}`, 'STUDENT', S.F1.id);
  await prisma.staffScope.createMany({ data: [{ userId: U.staff1.id, facultyId: S.F1.id }, { userId: U.staff2.id, facultyId: S.F2.id }] });
}
