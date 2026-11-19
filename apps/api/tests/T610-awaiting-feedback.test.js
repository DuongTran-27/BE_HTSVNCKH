// T610 (FR38, API_GD7 §10.2): MilestoneView.awaitingFeedback + chứng minh không N+1. DB test thật.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createExecutionRepo } from '../src/modules/execution/prismaRepo.js';
import { prisma, S, U, seedBase, mkTopic, get, at } from './t214-kit.js';

let seq = 0;
const mkRunning = async () => {
  const leader = `s${++seq}`;
  const t = await mkTopic(leader, S.round, { status: 'IN_PROGRESS' });
  await prisma.advising.create({ data: { topicId: t.id, lecturerId: U.lecA.id } });
  return { t, leader };
};
const mkMs = (t, order, o = {}) => prisma.milestone.create({ data: { topicId: t.id, order, name: `Mốc ${order}`, output: 'Báo cáo', dueAt: at(5), createdById: U.lecA.id, ...o } });
const mkDoc = (t, m, leader, version = 1) => prisma.document.create({ data: { topicId: t.id, milestoneId: m.id, stage: 'MIDTERM', kind: 'LINK', externalUrl: 'https://x.vn', fileName: 'L', version, status: 'READY', uploadedById: U[leader].id } });
const mkFb = (t, d, evaluation) => prisma.feedback.create({ data: { topicId: t.id, documentId: d.id, milestoneId: d.milestoneId, lecturerId: U.lecA.id, content: 'Nhận xét', evaluation } });
const flag = async (who, t) => Object.fromEntries((await get(who, `/api/topics/${t.id}/milestones`)).body.items.map((x) => [x.order, x.awaitingFeedback]));

beforeAll(() => seedBase({ students: 150 }), 60000);
afterAll(() => prisma.$disconnect());

describe('MilestoneView.awaitingFeedback', () => {
  it('TC-FR38-01: chưa nộp → false; có bản nộp chưa nhận xét → true', async () => {
    const { t, leader } = await mkRunning();
    const m1 = await mkMs(t, 1); await mkMs(t, 2);
    await mkDoc(t, m1, leader);
    expect(await flag(leader, t)).toEqual({ 1: true, 2: false });
  });
  it('TC-FR38-02: nhận xét không đánh giá → vẫn true', async () => {
    const { t, leader } = await mkRunning();
    const m = await mkMs(t, 1); const d = await mkDoc(t, m, leader);
    await mkFb(t, d, null);
    expect(await flag(leader, t)).toEqual({ 1: true });
  });
  it('TC-FR38-03: nhận xét có NEEDS_WORK → false; nộp bản mới sau đó → true', async () => {
    const { t, leader } = await mkRunning();
    const m = await mkMs(t, 1); const d = await mkDoc(t, m, leader);
    await mkFb(t, d, 'NEEDS_WORK');
    expect(await flag(leader, t)).toEqual({ 1: false });
    await mkDoc(t, m, leader, 2);
    expect(await flag(leader, t)).toEqual({ 1: true });
  });
  it('TC-FR38-04: số truy vấn của listMilestones không tăng theo số mốc (không N+1)', async () => {
    const { t, leader } = await mkRunning();
    const count = async (topicId) => {
      const p = new PrismaClient({ log: [{ emit: 'event', level: 'query' }] });
      let n = 0; p.$on('query', () => { n += 1; });
      await createExecutionRepo(p).listMilestones(topicId);
      await p.$disconnect();
      return n;
    };
    const m1 = await mkMs(t, 1); await mkFb(t, await mkDoc(t, m1, leader), 'PASSED');
    const few = await count(t.id);
    for (let i = 2; i <= 6; i += 1) { const m = await mkMs(t, i); await mkDoc(t, m, leader); }
    expect(await count(t.id)).toBe(few);
  });
});
