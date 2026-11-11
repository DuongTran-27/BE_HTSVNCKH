// Dữ liệu demo thống kê (scripts/demo-stats.js): đúng bảng chuyển trạng thái, đề tài đóng có kết quả hiện hành, chạy lại không nhân đôi.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { findTransition } from '@nckh/shared';
import { resetData } from './db.js';
import { seed } from '../prisma/seed.js';
import { demoStats, SUBJECTS, YEARS } from '../scripts/demo-stats.js';

const prisma = new PrismaClient();
const total = YEARS.reduce((s, y) => s + y[2], 0);
let added;

beforeAll(async () => {
  await resetData(prisma);
  await seed(prisma);
  added = await demoStats(prisma);
}, 120000);
afterAll(() => prisma.$disconnect());

describe('demo-stats', () => {
  it('thêm đủ đề tài cho từng năm học, chỉ trạng thái kết thúc; chạy lại không thêm', async () => {
    expect(added).toBe(total);
    for (const [academicYear, , count] of YEARS) {
      expect(await prisma.topic.count({ where: { round: { academicYear } } })).toBe(count);
    }
    const statuses = await prisma.topic.groupBy({ by: ['status'], where: { round: { academicYear: { in: YEARS.map((y) => y[0]) } } } });
    expect(statuses.map((s) => s.status).sort()).toEqual(['CANCELLED', 'CLOSED', 'REJECTED']);
    expect(await demoStats(prisma)).toBe(0);
    expect(await prisma.topic.count({ where: { round: { academicYear: YEARS[0][0] } } })).toBe(YEARS[0][2]);
  });

  it('lịch sử nối liền DRAFT → trạng thái hiện tại, đúng vai trò; đề tài đóng có đúng một kết quả hiện hành và GVHD', async () => {
    const topics = await prisma.topic.findMany({
      where: { round: { academicYear: { in: YEARS.map((y) => y[0]) } } },
      include: { statusHistory: { include: { actor: true }, orderBy: { at: 'asc' } }, results: true, advisings: true, members: true },
    });
    for (const t of topics) {
      let s = 'DRAFT';
      for (const h of t.statusHistory) {
        const tr = findTransition(h.action);
        expect(h.from, t.code).toBe(s);
        expect(tr.actors, `${t.code} ${h.action}`).toContain(h.actor.role);
        s = h.to;
      }
      expect(s, t.code).toBe(t.status);
      // Từ khóa là bộ viết tay của đúng chủ đề (không cắt từ tên đề tài)
      const subject = Object.values(SUBJECTS).flat().find(([name]) => t.title.startsWith(name));
      expect(t.keywords, t.code).toEqual(subject[1]);
      expect(t.members.filter((m) => m.role === 'LEADER')).toHaveLength(1);
      expect(t.advisings.filter((a) => !a.endAt)).toHaveLength(1);
      expect(t.results.filter((r) => r.isCurrent)).toHaveLength(t.status === 'CLOSED' ? 1 : 0);
    }
  });
});
