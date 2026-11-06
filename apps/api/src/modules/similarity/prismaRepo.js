// Truy vấn kho so bằng pg_trgm (điểm tên tính trong database, có index GIN).
import { Prisma } from '@prisma/client';
import { recordAudit } from '../audit/service.js';
import { withLockTx } from '../../lib/tx.js';
import { lockTopicRow } from '../execution/lock.js';
import { notifyTopic, topicName } from '../notifications/notify.js';
import { PUBLIC_CORPUS_STATUSES, PENDING_SAME_ROUND_STATUSES, activeBypassOf } from './service.js';

const grantedBy = { select: { fullName: true } };
// G5 §9.3: quyền cho phép còn hiệu lực, đọc trên db (prisma hoặc tx đã khóa Topic)
export const activeBypass = async (db, topicId) => activeBypassOf(
  await db.similarityBypass.findFirst({ where: { topicId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], include: { grantedBy } }),
  await db.submission.findFirst({ where: { topicId }, orderBy: { seq: 'desc' }, select: { createdAt: true } }),
);
const SKIP = new Error('recheck-skip'); // chỉ để rollback, không ra ngoài repo

export const createSimilarityRepo = (prisma) => ({
  async loadCorpus(topic) {
    return prisma.$queryRaw`
      SELECT t.id, t.code, t.title, t.summary, t.objectives, t.keywords, t.status,
             r."academicYear", f.name AS "fieldName",
             similarity(lower(immutable_unaccent(t.title)), lower(immutable_unaccent(${topic.title}))) AS "titleScore"
      FROM "Topic" t
      JOIN "Round" r ON r.id = t."roundId"
      LEFT JOIN "Field" f ON f.id = t."fieldId"
      WHERE t.id <> ${topic.id}
        AND (
          t.status::text IN (${Prisma.join(PUBLIC_CORPUS_STATUSES)})
          OR (t."roundId" = ${topic.roundId} AND t.status::text IN (${Prisma.join(PENDING_SAME_ROUND_STATUSES)}))
        )`;
  },
  loadSynonyms: () => prisma.synonym.findMany({ select: { term: true, canonical: true } }),
  // buildAudit(row) tùy chọn: ghi AuditLog cùng transaction
  saveCheck: (data, buildAudit) =>
    prisma.$transaction(async (tx) => {
      const row = await tx.similarityCheck.create({ data });
      if (buildAudit) await recordAudit(tx, buildAudit(row));
      return row;
    }),

  // G5 §9.2: cán bộ cho phép gửi khi FR06 lỗi – kiểm dưới khóa Topic (FOR NO KEY UPDATE)
  grantSimilarityBypass: (topicId, fn) => withLockTx(prisma, async (tx) => fn({
    latestCheck: () => tx.similarityCheck.findFirst({ where: { topicId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { status: true } }),
    activeBypass: () => activeBypass(tx, topicId),
    createBypass: (data) => tx.similarityBypass.create({ data, include: { grantedBy } }),
    audit: (entry) => recordAudit(tx, entry),
    notify: (args) => notifyTopic(tx, args),
  }, await lockTopicRow(tx, topicId))),
  findBypass: (id) => prisma.similarityBypass.findUnique({ where: { id }, include: { grantedBy } }),

  // G5 §9.5: lần gửi "chưa kiểm tra". Thứ tự ngẫu nhiên: bản lỗi lặp lại không chặn mãi bản khác (m5a reviews/T600-reviewer-v1.md)
  findUncheckedSubmissions: async (limit) => {
    const ids = await prisma.$queryRaw`
      SELECT s.id FROM "Submission" s LEFT JOIN "SimilarityCheck" c ON c.id = s."similarityCheckId"
      WHERE c.id IS NULL OR c.status <> 'OK' ORDER BY random() LIMIT ${limit}`;
    return prisma.submission.findMany({
      where: { id: { in: ids.map((r) => r.id) } },
      include: { similarityCheck: { select: { justification: true } }, topic: { select: { roundId: true, round: { select: { config: true } } } } },
    });
  },
  // Chèn dòng OK mới rồi đổi đúng cột similarityCheckId (trigger submission_guard). count 0 = lần chạy khác đã cập nhật →
  // rollback cả dòng vừa chèn (m5b). Trả true nếu đã cập nhật.
  applySimilarityRecheck: async (s, data) => {
    try {
      return await prisma.$transaction(async (tx) => {
        const row = await tx.similarityCheck.create({ data });
        const { count } = await tx.submission.updateMany({ where: { id: s.id, similarityCheckId: s.similarityCheckId }, data: { similarityCheckId: row.id } });
        if (count !== 1) throw SKIP;
        await recordAudit(tx, { actorId: null, action: 'SIMILARITY_RECHECK', entityType: 'Submission', entityId: s.id, before: { similarityCheckId: s.similarityCheckId }, after: { similarityCheckId: row.id, level: row.level } });
        await notifyTopic(tx, {
          topicId: s.topicId, to: ['staff'], actorId: null, type: 'SIMILARITY_RECHECKED', key: `SIMILARITY_RECHECKED:${s.id}`, link: `/xet-duyet/${s.topicId}`,
          title: (x) => `Đã kiểm tra lại trùng lặp cho lần gửi ${s.seq} của đề tài ${topicName(x)}`,
        });
        return true;
      });
    } catch (e) {
      if (e === SKIP) return false;
      throw e;
    }
  },
});
