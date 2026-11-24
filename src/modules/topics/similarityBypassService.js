// G5 (API_GD6 §9.2): cán bộ khoa cho phép gửi một lần khi FR06 lỗi kéo dài (FR06 mục 3). Chỉ thêm bản ghi, không đổi Submission/SimilarityCheck.
import { conflict, forbidden, notFound } from '../../lib/errors.js';
import { relations, canView } from './service.js';
import { topicName } from '../notifications/notify.js';
import { presentBypass } from '../similarity/service.js';

export const BYPASS_STATUSES = ['HAS_ADVISOR', 'NEEDS_REVISION']; // hai trạng thái gửi được (SUBMIT_FOR_REVIEW, RESUBMIT)

export const createSimilarityBypassService = ({ repo }) => ({
  async grant(user, topicId, body, ip) {
    const t = await repo.findDetail(topicId);
    if (!t) throw notFound();
    const rel = relations(t, user);
    if (!canView(t, rel) || !rel.inStaffScope) throw forbidden('Đề tài không thuộc khoa bạn quản lý');
    const row = await repo.grantSimilarityBypass(topicId, async (o, lock) => {
      if (!BYPASS_STATUSES.includes(lock.status)) throw conflict('INVALID_TRANSITION', 'Chỉ cho phép khi đề tài đang chờ gửi hoặc gửi lại xét duyệt');
      if ((await o.latestCheck())?.status !== 'ERROR') throw conflict('SIMILARITY_CHECK_OK', 'Lần kiểm tra gần nhất không lỗi, không cần cho phép');
      if (await o.activeBypass()) throw conflict('SIMILARITY_BYPASS_EXISTS', 'Đề tài đã được cho phép gửi khi chưa kiểm tra và chưa dùng');
      const b = await o.createBypass({ topicId, reason: body.reason, grantedById: user.id });
      await o.audit({ actorId: user.id, action: 'SIMILARITY_BYPASS_GRANT', entityType: 'SimilarityBypass', entityId: b.id, before: null, after: { topicId, reason: body.reason }, ip });
      await o.notify({
        topicId, to: ['members'], actorId: user.id, type: 'SIMILARITY_BYPASS_GRANTED', key: `SIMILARITY_BYPASS_GRANTED:${b.id}`, link: `/de-tai/${topicId}/gui`,
        title: (x) => `Cán bộ khoa đã cho phép gửi xét duyệt đề tài ${topicName(x)} dù chưa kiểm tra được trùng lặp`,
      });
      return b;
    });
    return { similarityBypass: presentBypass(row) };
  },
});
