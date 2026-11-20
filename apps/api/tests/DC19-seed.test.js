// DC-19: dữ liệu mẫu có đơn ứng tuyển (FR32–FR33) và hội đồng + phân công + điểm bảo vệ (FR35–FR37) khớp quy tắc nghiệp vụ.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { isActiveStatus } from '@nckh/shared';
import { resetData } from './db.js';
import { seed } from '../prisma/seed.js';

const prisma = new PrismaClient();

beforeAll(async () => {
  await resetData(prisma);
  await seed(prisma);
}, 60000);
afterAll(() => prisma.$disconnect());

describe('DC-19 seed – đơn ứng tuyển và hội đồng', () => {
  it('đơn ứng tuyển thuộc đề tài GV đang tuyển, SV không có đề tài hoạt động; có cả đơn chờ và bị từ chối', async () => {
    const apps = await prisma.topicApplication.findMany({ include: { topic: true, student: { include: { memberships: { include: { topic: true } } } } } });
    expect(apps.filter((a) => a.status === 'PENDING').length).toBeGreaterThanOrEqual(2);
    expect(apps.filter((a) => a.status === 'DECLINED').length).toBe(1);
    for (const a of apps) {
      expect([a.topic.origin, a.topic.status]).toEqual(['LECTURER', 'RECRUITING']);
      expect(a.student.memberships.filter((m) => !m.leftAt && isActiveStatus(m.topic.status))).toHaveLength(0);
      if (a.status === 'DECLINED') expect([!!a.reason, !!a.decidedById]).toEqual([true, true]);
    }
  });

  it('hội đồng đủ chủ tịch/thư ký/ủy viên, không ai là GVHD của đề tài được phân công; phân công mở, có điểm', async () => {
    const councils = await prisma.council.findMany({ include: { members: true, assignments: { include: { topic: { include: { advisings: true } }, scores: true } } } });
    expect(councils).toHaveLength(1);
    const [c] = councils;
    expect(c.code).toMatch(/^HD-\d{4}-001$/);
    expect(c.members.map((m) => m.role).sort()).toEqual(['CHAIR', 'MEMBER', 'SECRETARY']);
    expect(c.assignments).toHaveLength(1);
    const [a] = c.assignments;
    expect([a.topic.status, a.decidedAt, a.cancelledAt]).toEqual(['WAITING_DEFENSE', null, null]);
    const advisors = a.topic.advisings.filter((x) => !x.endAt).map((x) => x.lecturerId);
    for (const m of c.members) expect(advisors).not.toContain(m.lecturerId);
    expect(a.scores).toHaveLength(1);
    expect(await prisma.processScore.count({ where: { topicId: a.topicId } })).toBe(1);
  });
});
