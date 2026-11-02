// Lịch sử thao tác (FR15): AuditLog + StatusHistory chỉ thêm. `db` là prisma hoặc tx của $transaction, để ghi
// trong CÙNG transaction với thao tác nghiệp vụ (API_GD2 §1).

// before/after không bao giờ chứa mật khẩu, hash, token, khóa API... (API_GD2 §1) – lọc theo tên khóa ở mọi độ sâu.
const SECRET_KEY = /password|token|secret|hash$|key$|authorization|cookie|credential|otp|salt/i;
const isPlainObject = (v) => v !== null && typeof v === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(v));
export const redact = (v) => {
  if (Array.isArray(v)) return v.map(redact);
  if (v instanceof Date) return v.toISOString();
  // Decimal/Buffer/BigInt... giữ nguyên, không biến thành object rỗng hay mảng byte
  if (!isPlainObject(v)) return v;
  return Object.fromEntries(
    Object.entries(v)
      .filter(([k]) => !SECRET_KEY.test(k))
      .map(([k, x]) => [k, redact(x)]),
  );
};

const toRow = ({ actorId = null, action, entityType, entityId, before, after, ip = null }) => ({
  actorId,
  action,
  entityType,
  entityId: String(entityId),
  before: before == null ? undefined : redact(before),
  after: after == null ? undefined : redact(after),
  ip,
});

export const recordAudit = (db, entry) => db.auditLog.create({ data: toRow(entry) });
export const recordAuditMany = (db, entries) => db.auditLog.createMany({ data: entries.map(toRow) });

// Helper duy nhất ghi StatusHistory (applyTransition đi qua đây).
export const recordStatus = (db, { topicId, from = null, to, action, actorId, reason = null }) =>
  db.statusHistory.create({ data: { topicId, from, to, action, actorId, reason } });

// Đọc: mới nhất trước, phân trang theo id; id BigInt trả về dạng chuỗi để JSON hóa được.
export async function listAudit(db, { entityType, entityId, actorId, limit = 50, beforeId } = {}) {
  const rows = await db.auditLog.findMany({
    where: {
      ...(entityType && { entityType }),
      ...(entityId && { entityId: String(entityId) }),
      ...(actorId && { actorId }),
      ...(beforeId && { id: { lt: BigInt(beforeId) } }),
    },
    orderBy: { id: 'desc' },
    take: Math.min(Math.max(limit, 1), 200),
  });
  return rows.map((r) => ({ ...r, id: r.id.toString() }));
}

export const listStatusHistory = (db, topicId) =>
  db.statusHistory.findMany({ where: { topicId }, orderBy: [{ at: 'asc' }, { id: 'asc' }] });
