// Thông báo trong web FR13 (API_GD45 §8.2). `db` là tx của thao tác nghiệp vụ: rollback thì không có thông báo "ma".
// Chống trùng: unique (userId, dedupeKey) + skipDuplicates – gọi lại cùng sự kiện không tạo thêm.

const CHUNK = 1000; // createMany 5 cột/dòng, giữ xa trần 65.535 tham số của Postgres
const cut = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
// Mã + tên đề tài – người nhận luôn đã có quyền xem tên này (§8.2)
export const topicName = (t) => `${t.code} – ${cut(t.title, 150)}`;

// Email FR29 (API_GD7 §9.2): server.js bật khi đủ cấu hình SMTP; khi bật, mỗi thông báo mới là một dòng hộp thư đi PENDING.
let emailOutbox = false;
export const setEmailOutbox = (on) => { emailOutbox = !!on; };

/** items: [{ userId, type, title, link, dedupeKey }]. Bỏ người gây ra sự kiện và tài khoản bị khóa. Trả số dòng tạo mới. */
export async function notify(db, items, actorId = null) {
  const want = items.filter((i) => i.userId && i.userId !== actorId);
  if (!want.length) return 0;
  const ids = [...new Set(want.map((i) => i.userId))];
  const active = new Set((await db.user.findMany({ where: { id: { in: ids }, isLocked: false }, select: { id: true } })).map((u) => u.id));
  const data = want
    .filter((i) => active.has(i.userId))
    .map(({ userId, type, title, link, dedupeKey }) => ({ userId, type, title: cut(title, 300), link, dedupeKey, emailStatus: emailOutbox ? 'PENDING' : null }));
  let created = 0;
  for (let i = 0; i < data.length; i += CHUNK) {
    created += (await db.notification.createMany({ data: data.slice(i, i + CHUNK), skipDuplicates: true })).count;
  }
  return created;
}

/** "Cán bộ khoa" của khoa = user STAFF có StaffScope của khoa (§8.2); khóa thì notify() tự bỏ. */
export const staffIdsOf = async (db, facultyId) =>
  (await db.staffScope.findMany({ where: { facultyId, user: { role: 'STAFF' } }, select: { userId: true } })).map((s) => s.userId);

/**
 * Thông báo theo quan hệ đề tài, đọc trong tx (sau khóa) nên đúng người tại thời điểm sự kiện.
 * to: ['members' | 'leader' | 'advisor' | 'staff'], userIds: người nhận thêm; title(t) nhận { code, title } của đề tài.
 */
export async function notifyTopic(db, { topicId, to = [], userIds = [], actorId, type, key, link, title }) {
  const t = await db.topic.findUnique({
    where: { id: topicId },
    select: {
      code: true, title: true, facultyId: true,
      members: { where: { leftAt: null }, select: { userId: true, role: true } },
      advisings: { where: { endAt: null }, select: { lecturerId: true } },
    },
  });
  const ids = [...userIds];
  if (to.includes('members')) ids.push(...t.members.map((m) => m.userId));
  if (to.includes('leader')) ids.push(...t.members.filter((m) => m.role === 'LEADER').map((m) => m.userId));
  if (to.includes('advisor')) ids.push(...t.advisings.map((a) => a.lecturerId));
  if (to.includes('staff')) ids.push(...(await staffIdsOf(db, t.facultyId)));
  const text = title(t);
  return notify(db, [...new Set(ids)].map((userId) => ({ userId, type, title: text, link, dedupeKey: key })), actorId);
}
