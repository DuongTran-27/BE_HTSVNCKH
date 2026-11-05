// Thông báo trong web FR13 (API_GD45 §8.1) + nhắc hạn do bộ lập lịch ngoài gọi (§8.4).
import { effectiveRoundConfig } from '@nckh/shared';
import { notFound } from '../../lib/errors.js';
import { topicName } from './notify.js';

const iso = (d) => d?.toISOString() ?? null;
const DAY = 86400000;
export const REMINDER_BATCH = 5000; // trần mỗi phần; lần chạy sau làm tiếp nhờ dedupeKey/remindedAt
const MAX_REMINDER_DAYS = 30; // trần của dueReminderDays/advisorReminderDays trong roundConfigSchema
const vnTime = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });

export const createNotificationService = ({ repo, now = () => new Date() }) => ({
  async list(user, q) {
    const readFilter = q.unread === undefined ? {} : { readAt: q.unread === 'true' ? null : { not: null } };
    const { items, total, unreadCount } = await repo.listNotifications({ userId: user.id, readFilter, skip: (q.page - 1) * q.pageSize, take: q.pageSize });
    return {
      items: items.map((n) => ({ id: n.id, type: n.type, title: n.title, link: n.link, readAt: iso(n.readAt), createdAt: iso(n.createdAt) })),
      page: q.page, pageSize: q.pageSize, total, unreadCount,
    };
  },
  async unreadCount(user) {
    return { count: await repo.countUnread(user.id) };
  },
  // Không phải của mình hoặc không có → 404 (không cho dò id); đã đọc → vẫn thành công
  async markRead(user, id) {
    if ((await repo.markRead(user.id, id, now())) === 0 && !(await repo.ownsNotification(user.id, id))) throw notFound();
  },
  async markAllRead(user) {
    await repo.markAllRead(user.id, now());
  },
});

/**
 * Mốc "đang chờ nộp" (§8.4 bước 1): chưa có bản nộp sau lần đánh giá Cần bổ sung gần nhất
 * (chưa từng bị đánh giá thì: chưa có bản nộp nào).
 */
export const awaitingSubmission = (m) => {
  const doc = m.documents[0]?.uploadedAt;
  const needsWork = m.feedbacks[0]?.createdAt;
  if (!doc) return true;
  return !!needsWork && doc <= needsWork;
};

export const createReminderService = ({ repo, now = () => new Date(), logger }) => ({
  async run() {
    const n = now(); // giờ server (NFR06), không nhận thời gian từ client
    const out = { ranAt: n.toISOString(), dueSoon: 0, overdue: 0, advisorReminders: 0, notificationsCreated: 0 };

    // 1. Mốc sắp đến hạn / quá hạn: khóa có dueAt → cùng hạn không bao giờ nhắc hai lần, đổi hạn thì nhắc theo hạn mới
    const ms = await repo.findDueMilestones(new Date(n.getTime() + MAX_REMINDER_DAYS * DAY), REMINDER_BATCH);
    if (ms.length === REMINDER_BATCH) logger?.warn({ part: 'milestones' }, 'Nhắc hạn chạm trần số dòng, lần chạy sau làm tiếp');
    const items = [];
    for (const m of ms) {
      if (!awaitingSubmission(m)) continue;
      const due = m.dueAt.toISOString();
      const members = m.topic.members.map((x) => x.userId);
      const link = `/de-tai/${m.topicId}/moc`;
      if (m.dueAt <= n) {
        out.overdue += 1;
        const title = `Mốc "${m.name}" đã quá hạn (${vnTime.format(m.dueAt)}) – đề tài ${topicName(m.topic)}`;
        for (const userId of [...members, ...m.topic.advisings.map((a) => a.lecturerId)]) {
          items.push({ userId, type: 'MILESTONE_OVERDUE', title, link, dedupeKey: `MILESTONE_OVERDUE:${m.id}:${due}` });
        }
      } else if (m.dueAt.getTime() <= n.getTime() + effectiveRoundConfig(m.topic.round.config).dueReminderDays * DAY) {
        out.dueSoon += 1;
        const title = `Mốc "${m.name}" sắp đến hạn (${vnTime.format(m.dueAt)}) – đề tài ${topicName(m.topic)}`;
        for (const userId of members) items.push({ userId, type: 'MILESTONE_DUE_SOON', title, link, dedupeKey: `MILESTONE_DUE_SOON:${m.id}:${due}` });
      }
    }
    if (items.length) out.notificationsCreated += await repo.reminderTx((o) => o.notify(items));

    // 2. Đề nghị hướng dẫn chưa phản hồi sau X ngày (FR16.4): nhắc GV được đề nghị + cán bộ khoa, đúng một lần
    const stale = await repo.findStaleAdvisorRequests(new Date(n.getTime() - DAY), REMINDER_BATCH);
    if (stale.length === REMINDER_BATCH) logger?.warn({ part: 'advisorRequests' }, 'Nhắc hạn chạm trần số dòng, lần chạy sau làm tiếp');
    const reqs = stale
      .filter((r) => r.createdAt.getTime() <= n.getTime() - effectiveRoundConfig(r.topic.round.config).advisorReminderDays * DAY);
    if (reqs.length) {
      await repo.reminderTx(async (o) => {
        const won = new Set(await o.markReminded(reqs.map((r) => r.id), n));
        const staff = new Map();
        const notices = [];
        for (const r of reqs.filter((x) => won.has(x.id))) {
          if (!staff.has(r.topic.facultyId)) staff.set(r.topic.facultyId, await o.staffIdsOf(r.topic.facultyId));
          const days = Math.floor((n - r.createdAt) / DAY);
          const title = `Đề nghị hướng dẫn đề tài ${topicName(r.topic)} chưa được phản hồi sau ${days} ngày`;
          for (const userId of new Set([r.lecturerId, ...staff.get(r.topic.facultyId)])) {
            notices.push({ userId, type: 'ADVISOR_REQUEST_REMINDER', title, link: '/de-nghi-huong-dan', dedupeKey: `ADVISOR_REQUEST_REMINDER:${r.id}` });
          }
        }
        out.advisorReminders = won.size;
        out.notificationsCreated += await o.notify(notices);
      });
    }
    return out;
  },
});
