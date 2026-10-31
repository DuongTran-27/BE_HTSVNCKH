// Truy vấn kho so bằng pg_trgm (điểm tên tính trong database, có index GIN).
import { Prisma } from '@prisma/client';
import { PUBLIC_CORPUS_STATUSES, PENDING_SAME_ROUND_STATUSES } from './service.js';

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
  saveCheck: (data) => prisma.similarityCheck.create({ data }),
});
