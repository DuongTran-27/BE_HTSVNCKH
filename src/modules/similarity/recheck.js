// G5 (API_GD6 §9.5): tự chạy lại FR06 cho lần gửi "chưa kiểm tra" và cập nhật snapshot (chỉ cột similarityCheckId).
import { effectiveRoundConfig } from '@nckh/shared';
import { runSimilarityCheck } from './service.js';

export const RECHECK_BATCH = 20; // mỗi lần FR06 ≤ 3 s, giữ dưới --max-time của curl

export const createSimilarityRecheckService = ({ repo, now = () => new Date(), logger }) => ({
  async run() {
    const out = { ranAt: now().toISOString(), checked: 0, updated: 0, stillFailing: 0 };
    for (const s of await repo.findUncheckedSubmissions(RECHECK_BATCH)) {
      out.checked += 1;
      const p = s.payload;
      // Nội dung đã gửi (payload), không phải nội dung hiện tại của đề tài; cfg hiện hành của đợt
      const topic = { id: s.topicId, roundId: s.topic.roundId, title: p.title, summary: p.summary, objectives: p.objectives, keywords: p.keywords ?? [] };
      // saveCheck không ghi: lỗi thì không chèn dòng ERROR mỗi giờ (§9.5 bước 3), OK thì ghi trong transaction riêng bên dưới
      const r = await runSimilarityCheck({
        repo: { loadCorpus: repo.loadCorpus, loadSynonyms: repo.loadSynonyms, saveCheck: async (d) => d },
        topic, cfg: effectiveRoundConfig(s.topic.round.config), justification: s.similarityCheck?.justification ?? null,
      });
      if (r.status !== 'OK') {
        out.stillFailing += 1;
        logger?.warn({ submissionId: s.id, err: r.errorMessage }, 'Chạy lại FR06 vẫn lỗi');
        continue;
      }
      try {
        if (await repo.applySimilarityRecheck(s, r)) out.updated += 1;
      } catch (err) { // một bản lỗi ghi không chặn các bản còn lại
        out.stillFailing += 1;
        logger?.error({ err, submissionId: s.id }, 'Ghi kết quả chạy lại FR06 lỗi');
      }
    }
    return out;
  },
});
