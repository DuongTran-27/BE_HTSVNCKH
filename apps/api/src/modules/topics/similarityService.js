// Kiểm tra tương tự cho một hồ sơ (FR06, API_GD2 §7). Không chuyển trạng thái.
import { effectiveRoundConfig } from '@nckh/shared';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { contentHash } from '../similarity/engine.js';
import { runSimilarityCheck, similarityView } from '../similarity/service.js';
import { relations, canView } from './service.js';

const CHECKABLE = ['DRAFT', 'WAITING_ADVISOR', 'HAS_ADVISOR', 'NEEDS_REVISION'];

export const createSimilarityService = ({ repo }) => {
  const load = async (user, id) => {
    const t = await repo.findDetail(id);
    if (!t) throw notFound();
    const rel = relations(t, user);
    if (!canView(t, rel)) throw forbidden();
    return { t, rel };
  };

  return {
    async latest(user, id) {
      const { t } = await load(user, id);
      const c = t.similarityChecks[0];
      return { similarityCheck: c ? { ...similarityView(c, user.role), isStale: c.contentHash !== contentHash(t) } : null };
    },

    async check(user, id, ip) {
      const { t, rel } = await load(user, id);
      if (!rel.isMember) throw forbidden();
      if (!CHECKABLE.includes(t.status)) throw conflict('INVALID_TRANSITION', 'Trạng thái hiện tại không cho phép kiểm tra tương tự');
      const cfg = effectiveRoundConfig(t.round.config);
      // Hồ sơ rỗng sẽ cho kết quả "không trùng" giả; "kiểm tra trước" chỉ cần có tên và tóm tắt
      const details = {};
      if (!t.title.trim()) details.title = 'Cần nhập tên đề tài';
      if (!t.summary.trim()) details.summary = 'Cần nhập tóm tắt';
      if (Object.keys(details).length) throw badRequest('TOPIC_INCOMPLETE', 'Hồ sơ chưa đủ thông tin để kiểm tra', details);
      const row = await runSimilarityCheck({
        repo, topic: t, cfg,
        audit: (r) => ({ actorId: user.id, action: 'SIMILARITY_CHECK', entityType: 'SimilarityCheck', entityId: r.id, before: null, after: { topicId: t.id, status: r.status, level: r.level }, ip }),
      });
      return { similarityCheck: { ...similarityView(row, user.role), isStale: false } };
    },
  };
};
