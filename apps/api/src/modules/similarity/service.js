// Dịch vụ FR06: chọn kho đúng phạm vi, tính điểm, áp quy tắc hiển thị, lưu kết quả.
import { DEFAULT_ROUND_CONFIG, countWords } from '@nckh/shared';
import { compare, contentHash, ALGORITHM_VERSION } from './engine.js';

// Trạng thái thuộc kho so (mục 3 đặc tả)
export const PUBLIC_CORPUS_STATUSES = ['IN_PROGRESS', 'WAITING_CLOSE', 'CLOSED'];
export const PENDING_SAME_ROUND_STATUSES = ['WAITING_ADVISOR', 'HAS_ADVISOR', 'UNDER_REVIEW', 'NEEDS_REVISION'];

/**
 * Ẩn thông tin hồ sơ đang chờ của nhóm khác khi người xem là sinh viên.
 */
export const presentMatches = (matches, corpusById, viewerRole) =>
  matches.map((m) => {
    const t = corpusById.get(m.topicId);
    const isPending = PENDING_SAME_ROUND_STATUSES.includes(t.status);
    if (isPending && viewerRole === 'STUDENT') {
      return { hidden: true, note: 'Có hồ sơ đang chờ duyệt trong đợt có nội dung tương tự', titleScore: m.titleScore, contentScore: m.contentScore, level: m.level };
    }
    return { ...m, title: t.title, academicYear: t.academicYear, field: t.fieldName, status: t.status, hidden: false };
  });

export const needsJustification = (level, justification, cfg = DEFAULT_ROUND_CONFIG) =>
  level === 'HIGH' && countWords(justification ?? '') < cfg.similarity.minJustificationWords;

/**
 * Chạy kiểm tra. repo cung cấp loadCorpus, loadSynonyms, saveCheck (tách để test được không cần DB).
 * Lỗi KHÔNG bao giờ được coi là "không tương tự": trả status ERROR.
 */
export const runSimilarityCheck = async ({ repo, topic, cfg = DEFAULT_ROUND_CONFIG, justification = null }) => {
  const thresholds = cfg.similarity;
  const hash = contentHash(topic);
  try {
    const [corpus, synonyms] = await Promise.all([repo.loadCorpus(topic), repo.loadSynonyms()]);
    const result = compare({ candidate: topic, corpus, thresholds, synonyms });
    return repo.saveCheck({
      topicId: topic.id, algorithmVersion: ALGORITHM_VERSION, thresholds, contentHash: hash,
      corpusSize: result.corpusSize, level: result.level, matches: result.matches,
      justification, status: 'OK',
    });
  } catch (err) {
    return repo.saveCheck({
      topicId: topic.id, algorithmVersion: ALGORITHM_VERSION, thresholds, contentHash: hash,
      corpusSize: 0, level: null, matches: [], justification, status: 'ERROR', errorMessage: String(err.message ?? err),
    });
  }
};
