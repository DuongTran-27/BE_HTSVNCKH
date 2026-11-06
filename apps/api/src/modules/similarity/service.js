// Dịch vụ FR06: chọn kho đúng phạm vi, tính điểm, áp quy tắc hiển thị, lưu kết quả.
import { DEFAULT_ROUND_CONFIG, countWords } from '@nckh/shared';
import { compare, contentHash, ALGORITHM_VERSION } from './engine.js';

// Trạng thái thuộc kho so (mục 3 đặc tả)
export const PUBLIC_CORPUS_STATUSES = ['IN_PROGRESS', 'WAITING_CLOSE', 'CLOSED'];
export const PENDING_SAME_ROUND_STATUSES = ['WAITING_ADVISOR', 'HAS_ADVISOR', 'UNDER_REVIEW', 'NEEDS_REVISION'];

/**
 * Dựng từ dữ liệu đã lưu lúc kiểm (API_GD2 §7.2). Chỉ hồ sơ đã duyệt trở đi hiện cho mọi người;
 * mọi trạng thái khác (kể cả thiếu/lạ) chỉ STAFF thấy đầy đủ, vai trò khác chỉ thấy điểm.
 */
export const presentMatches = (matches, viewerRole) =>
  matches.map((m) => {
    const isPublic = PUBLIC_CORPUS_STATUSES.includes(m.status);
    if (!isPublic && viewerRole !== 'STAFF') {
      return { hidden: true, note: 'Có 1 hồ sơ đang chờ duyệt trong đợt có nội dung tương tự', titleScore: m.titleScore, contentScore: m.contentScore, level: m.level };
    }
    return {
      hidden: false,
      ...(isPublic ? {} : { topicId: m.topicId }),
      code: m.code, title: m.title, academicYear: m.academicYear, field: m.fieldName ?? null, status: m.status,
      titleScore: m.titleScore, contentScore: m.contentScore, level: m.level, matchedKeywords: m.matchedKeywords ?? [],
    };
  });

// check: dòng SimilarityCheck. Lỗi KHÔNG bao giờ trả level NONE; errorMessage nội bộ không ra client.
export const similarityView = (check, viewerRole) => {
  const head = { id: check.id, status: check.status, createdAt: check.createdAt.toISOString(), algorithmVersion: check.algorithmVersion, corpusSize: check.corpusSize, thresholds: check.thresholds };
  if (check.status !== 'OK') {
    return { ...head, level: null, matches: [], justificationRequired: false, justification: null, message: 'Chưa kiểm tra được' };
  }
  return {
    ...head, level: check.level,
    justificationRequired: check.level === 'HIGH', justification: check.justification ?? null,
    justificationMissing: justificationMissing(check),
    matches: presentMatches(Array.isArray(check.matches) ? check.matches : [], viewerRole),
  };
};

export const needsJustification = (level, justification, cfg = DEFAULT_ROUND_CONFIG) =>
  level === 'HIGH' && countWords(justification ?? '') < cfg.similarity.minJustificationWords;

// G5 (API_GD6 §9.5): kết quả chạy lại HIGH mà SV chưa giải trình – chỉ cảnh báo; ngưỡng lấy từ dòng kiểm (thresholds lúc kiểm)
export const justificationMissing = (check) => check.status === 'OK'
  && needsJustification(check.level, check.justification, { similarity: { ...DEFAULT_ROUND_CONFIG.similarity, ...check.thresholds } });

// G5 §9.1, §9.3: cờ "chưa kiểm tra" và hiệu lực quyền cho phép đều suy ra, không có cột
export const isUnchecked = (submission) => submission.similarityCheck?.status !== 'OK';
// bypass: SimilarityBypass mới nhất của đề tài; latestSubmission: Submission seq lớn nhất. Còn hiệu lực = chưa có lần gửi nào sau khi cấp
// (>=: trùng mốc ms coi như đã dùng – thà bắt cán bộ cấp lại còn hơn dùng một quyền hai lần)
export const activeBypassOf = (bypass, latestSubmission) => (bypass && !(latestSubmission && latestSubmission.createdAt >= bypass.createdAt) ? bypass : null);

/**
 * Chạy kiểm tra. repo cung cấp loadCorpus, loadSynonyms, saveCheck (tách để test được không cần DB).
 * Lỗi KHÔNG bao giờ được coi là "không tương tự": trả status ERROR.
 */
export const runSimilarityCheck = async ({ repo, topic, cfg = DEFAULT_ROUND_CONFIG, justification = null, audit }) => {
  const thresholds = cfg.similarity;
  const hash = contentHash(topic);
  try {
    const [corpus, synonyms] = await Promise.all([repo.loadCorpus(topic), repo.loadSynonyms()]);
    const result = compare({ candidate: topic, corpus, thresholds, synonyms });
    return repo.saveCheck({
      topicId: topic.id, algorithmVersion: ALGORITHM_VERSION, thresholds, contentHash: hash,
      corpusSize: result.corpusSize, level: result.level, matches: result.matches,
      justification, status: 'OK',
    }, audit);
  } catch (err) {
    return repo.saveCheck({
      topicId: topic.id, algorithmVersion: ALGORITHM_VERSION, thresholds, contentHash: hash,
      corpusSize: 0, level: null, matches: [], justification, status: 'ERROR', errorMessage: String(err.message ?? err),
    }, audit);
  }
};
export const presentBypass = (b) => ({ id: b.id, reason: b.reason, grantedBy: { fullName: b.grantedBy.fullName }, createdAt: b.createdAt.toISOString() });
