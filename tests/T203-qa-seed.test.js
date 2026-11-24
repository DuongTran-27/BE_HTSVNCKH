// QA review T203 (FR03, FR04, FR07, FR16, FR17, mục 5): dữ liệu mẫu phải khớp bảng mục 5 cả về NGƯỜI thực hiện và
// bản ghi đi kèm, không chỉ chuỗi from/to – vì T204–T214 dùng seed làm fixture.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { DEFAULT_ROUND_CONFIG, findTransition, isActiveStatus } from '@nckh/shared';
import { resetData } from './db.js';
import { seed } from '../prisma/seed.js';

const prisma = new PrismaClient();
let topics;

beforeAll(async () => {
  await resetData(prisma);
  await seed(prisma);
  topics = await prisma.topic.findMany({
    include: {
      round: true,
      members: true,
      advisorRequests: true,
      advisings: true,
      submissions: { include: { decision: true, similarityCheck: true }, orderBy: { seq: 'asc' } },
      statusHistory: { include: { actor: { include: { staffScopes: true } } }, orderBy: { at: 'asc' } },
    },
  });
}, 60000);
afterAll(() => prisma.$disconnect());

describe('QA T203 – seed khớp bảng chuyển trạng thái mục 5', () => {
  it('TC-FR15-20 người thực hiện mỗi bước đúng vai trò và đúng ràng buộc (trưởng nhóm, GV được đề nghị, GVHD hiện hành, cán bộ cùng khoa)', () => {
    for (const t of topics) {
      const leader = t.members.find((m) => m.role === 'LEADER' && !m.leftAt);
      for (const h of t.statusHistory) {
        const tr = findTransition(h.action);
        const msg = `${t.code} ${h.action}`;
        expect(tr.actors, msg).toContain(h.actor.role);
        if (tr.leaderOnly) expect(h.actorId, msg).toBe(leader.userId);
        if (tr.requestedLecturerOnly)
          expect(
            t.advisorRequests.map((r) => r.lecturerId),
            msg,
          ).toContain(h.actorId);
        if (tr.currentAdvisorOnly) {
          expect(
            t.advisings.filter((a) => !a.endAt).map((a) => a.lecturerId),
            msg,
          ).toContain(h.actorId);
        }
        if (h.actor.role === 'STAFF')
          expect(
            h.actor.staffScopes.map((s) => s.facultyId),
            msg,
          ).toContain(t.facultyId);
      }
    }
  });

  // DC-05 (đặc tả đổi – DAC_TA mục 9 FR31, API_GD7 §0.1, §3.1): đề tài GV công bố có Advising từ lúc tạo nháp, không qua
  // AdvisorRequest. Đề tài SV đề xuất giữ nguyên mọi khẳng định cũ.
  it('TC-FR16-20 đề nghị GVHD và quan hệ hướng dẫn khớp trạng thái', () => {
    expect(topics.filter((t) => t.origin === 'LECTURER').length).toBe(3);
    for (const t of topics) {
      const pending = t.advisorRequests.filter((r) => r.status === 'PENDING');
      const current = t.advisings.filter((a) => !a.endAt);
      if (t.origin === 'LECTURER') {
        expect([t.advisorRequests.length, current.length], t.code).toEqual([0, 1]);
        continue;
      }
      expect(pending.length, t.code).toBe(t.status === 'WAITING_ADVISOR' ? 1 : 0);
      const advised = !['DRAFT', 'WAITING_ADVISOR'].includes(t.status);
      expect(current.length, t.code).toBe(advised ? 1 : 0);
      if (advised) {
        const accepted = t.advisorRequests.filter((r) => r.status === 'ACCEPTED').map((r) => r.lecturerId);
        expect(accepted, t.code).toContain(current[0].lecturerId);
      }
    }
  });

  it('TC-FR16-21 không GV nào vượt hạn mức đề tài hướng dẫn đang hoạt động', () => {
    const perLecturer = {};
    for (const t of topics.filter((x) => isActiveStatus(x.status))) {
      for (const a of t.advisings.filter((x) => !x.endAt))
        perLecturer[a.lecturerId] = (perLecturer[a.lecturerId] ?? 0) + 1;
    }
    expect(Math.max(...Object.values(perLecturer))).toBeLessThanOrEqual(DEFAULT_ROUND_CONFIG.maxTopicsPerLecturer);
  });

  it('TC-FR03-20 mỗi đề tài đúng một trưởng nhóm; số thành viên trong [min, max]; SV ≤ N đề tài hoạt động mỗi đợt', () => {
    const active = {};
    for (const t of topics) {
      const cur = t.members.filter((m) => !m.leftAt);
      // m1 BM DC-05: đếm FR03 trước nhánh RECRUITING – đề tài đang tuyển là đề tài hoạt động, thành viên của nó chiếm suất
      if (isActiveStatus(t.status))
        for (const m of cur) active[`${m.userId}|${t.roundId}`] = (active[`${m.userId}|${t.roundId}`] ?? 0) + 1;
      // DC-05 (FR31, FR33): đề tài GV đang tuyển: ≤ min(recruitSlots, max) thành viên; có thành viên thì đúng 1 trưởng nhóm (người được duyệt đầu tiên)
      if (t.origin === 'LECTURER' && t.status === 'RECRUITING') {
        expect(cur.filter((m) => m.role === 'LEADER').length, t.code).toBe(cur.length ? 1 : 0);
        expect(cur.length, t.code).toBeLessThanOrEqual(Math.min(t.recruitSlots, DEFAULT_ROUND_CONFIG.maxMembers));
        continue;
      }
      expect(cur.filter((m) => m.role === 'LEADER').length, t.code).toBe(1);
      expect(cur.length).toBeGreaterThanOrEqual(DEFAULT_ROUND_CONFIG.minMembers);
      expect(cur.length).toBeLessThanOrEqual(DEFAULT_ROUND_CONFIG.maxMembers);
    }
    expect(Math.max(...Object.values(active))).toBeLessThanOrEqual(DEFAULT_ROUND_CONFIG.maxActiveTopicsPerStudent);
  });

  it('TC-FR17-20 quyết định trỏ đúng snapshot mới nhất tại thời điểm quyết định; snapshot có FR06 kiểm trước khi gửi', () => {
    for (const t of topics) {
      const decisions = t.statusHistory.filter((h) => ['REQUEST_REVISION', 'REJECT', 'APPROVE'].includes(h.action));
      for (const h of decisions) {
        const latest = t.submissions.filter((s) => s.createdAt <= h.at).at(-1);
        expect(latest?.decision?.action, `${t.code} ${h.action}`).toBe(h.action);
        expect(latest.decision.decidedById).toBe(h.actorId);
      }
      for (const s of t.submissions) expect(s.similarityCheck.createdAt <= s.createdAt, t.code).toBe(true);
      // Snapshot chưa có quyết định chỉ được là lần gửi cuối và đề tài đang chờ xét duyệt.
      const undecided = t.submissions.filter((s) => !s.decision);
      expect(undecided.length, t.code).toBe(t.status === 'UNDER_REVIEW' ? 1 : 0);
    }
  });

  it('TC-FR04-20 mốc đợt đúng thứ tự; REQUEST_ADVISOR/SUBMIT nằm trong thời gian mở đăng ký; mọi mốc lịch sử trước hiện tại', () => {
    const now = new Date();
    for (const t of topics) {
      const r = t.round;
      expect(r.regOpenAt < r.regCloseAt && r.regCloseAt < r.reviewDeadline && r.reviewDeadline < r.endAt).toBe(true);
      for (const h of t.statusHistory) {
        expect(h.at < now, `${t.code} ${h.action}`).toBe(true);
        if (h.action === 'REQUEST_ADVISOR') {
          expect(h.at >= r.regOpenAt && h.at <= r.regCloseAt, `${t.code} ${h.action}`).toBe(true);
        }
      }
    }
  });
});
