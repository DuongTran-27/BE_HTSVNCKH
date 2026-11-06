// Tài liệu FR11/FR24 (API_GD45 §5). Không gọi kho file bên trong transaction có khóa (§1.3).
import { randomUUID } from 'node:crypto';
import { effectiveRoundConfig, DOCUMENT_FILE_TYPES, DOCUMENT_MAX_VERSIONS, DOWNLOAD_URL_TTL_SECONDS } from '@nckh/shared';
import { AppError, conflict, forbidden, notFound } from '../../lib/errors.js';
import { extOf, sanitizeFileName, unsupported } from '../../lib/upload.js';
import { relations, canReadExecution, versionReader } from '../topics/service.js';
import { topicName } from '../notifications/notify.js';

const iso = (d) => d.toISOString();
const PROPOSAL_STATES = ['DRAFT', 'NEEDS_REVISION'];
const storageDown = () => new AppError(503, 'STORAGE_UNAVAILABLE', 'Kho lưu trữ file đang lỗi, vui lòng thử lại');

export const presentDocument = (d, isLatest) => ({
  id: d.id, topicId: d.topicId, milestoneId: d.milestoneId, stage: d.stage, kind: d.kind, version: d.version,
  fileName: d.fileName, mimeType: d.mimeType, sizeBytes: d.sizeBytes, externalUrl: d.kind === 'LINK' ? d.externalUrl : null,
  isLate: d.isLate, isLatest, uploadedBy: { id: d.uploadedBy.id, fullName: d.uploadedBy.fullName }, uploadedAt: iso(d.uploadedAt),
  feedbackCount: d._count?.feedbacks ?? 0,
});

export const createDocumentService = ({ repo, storage, folder, now = () => new Date(), logger }) => {
  const loadTopic = async (topicId) => {
    const t = await repo.findExecTopic(topicId);
    if (!t) throw notFound();
    return t;
  };
  // canReadExecution (gồm GV cũ được cấp quyền đọc); GV được đề nghị chỉ xem đề cương (G23)
  // Trả hàm uploadedAt → được đọc, hoặc null. Người đã rời nhóm: chỉ bản tải lên trong khoảng là thành viên (FR21, API_GD6 §5.4)
  const readerOf = (t, user, stage) => {
    const rel = relations(t, user);
    if (rel.isRequestedLecturer && stage === 'PROPOSAL') return () => true;
    return versionReader(t, rel);
  };
  const assertStage = (status, stage) => {
    if (stage === 'PROPOSAL') {
      if (!PROPOSAL_STATES.includes(status)) throw conflict('TOPIC_NOT_EDITABLE', 'Chỉ nộp đề cương khi hồ sơ ở trạng thái Nháp hoặc Cần chỉnh sửa');
    } else if (status !== 'IN_PROGRESS') throw conflict('TOPIC_NOT_IN_PROGRESS', 'Chỉ thực hiện được khi đề tài đang thực hiện');
  };
  const assertMilestone = (m, topicId) => {
    if (!m || m.topicId !== topicId) throw notFound('Không tìm thấy mốc');
    if (m.evaluation === 'PASSED') throw conflict('MILESTONE_ALREADY_PASSED', 'Mốc đã Đạt; muốn thay đổi cần mở lại mốc');
  };

  // Bước 3 của §5.2: chạy TRƯỚC multer, chỉ dựa trên :id (người ngoài bị chặn trước khi file vào RAM)
  const precheck = async (user, topicId) => {
    const t = await loadTopic(topicId);
    if (user.role !== 'STUDENT' || !relations(t, user).isMember) throw forbidden();
    if (![...PROPOSAL_STATES, 'IN_PROGRESS'].includes(t.status)) throw conflict('TOPIC_NOT_EDITABLE', 'Hồ sơ không ở trạng thái cho phép nộp tài liệu');
    return { t, cfg: effectiveRoundConfig(t.round.config) };
  };

  const commit = async (user, topicId, f, data, action, ip) => {
    const d = await repo.writeDocument(topicId, async (o, lock) => {
      assertStage(lock.status, f.stage); // kiểm lại dưới khóa
      let ms = null;
      if (f.milestoneId) {
        ms = await o.findMilestoneForDoc(f.milestoneId);
        assertMilestone(ms, topicId);
      }
      const { max, count } = await o.chainStats(topicId, f.milestoneId ?? null);
      if (count >= DOCUMENT_MAX_VERSIONS) throw conflict('DOCUMENT_VERSION_LIMIT', 'Đã đạt số phiên bản tối đa cho mục này');
      const n = now();
      const row = await o.createDocument({
        topicId, milestoneId: f.milestoneId ?? null, stage: f.stage, version: max + 1, status: 'READY',
        isLate: !!ms && n > ms.dueAt, uploadedById: user.id, uploadedAt: n, ...data,
      });
      await o.audit({
        actorId: user.id, action, entityType: 'Document', entityId: row.id, before: null,
        after: { documentId: row.id, topicId, stage: f.stage, milestoneId: row.milestoneId, version: row.version, kind: row.kind, sizeBytes: row.sizeBytes, isLate: row.isLate }, ip,
      });
      if (ms) { // chỉ bản nộp của mốc (§8.3); đề cương không báo
        await o.notify({ topicId, to: ['advisor'], actorId: user.id, type: 'DOCUMENT_SUBMITTED', key: `DOCUMENT_SUBMITTED:${row.id}`, link: `/de-tai/${topicId}/tai-lieu`, title: (x) => `Nhóm đã nộp bài cho mốc "${ms.name}" – đề tài ${topicName(x)}` });
      }
      return row;
    });
    return { document: presentDocument({ ...d, uploadedBy: { id: user.id, fullName: user.fullName } }, true) };
  };

  return {
    precheck,

    async upload(user, topicId, { file, fields }, cfg, ip) {
      const ext = extOf(file.originalname);
      if (!cfg.allowedFileTypes.includes(ext)) throw unsupported();
      if (file.size > cfg.maxFileSizeMB * 1048576) throw new AppError(413, 'PAYLOAD_TOO_LARGE', 'File vượt quá dung lượng cho phép');
      const t = await loadTopic(topicId);
      assertStage(t.status, fields.stage);
      if (fields.milestoneId) assertMilestone(await repo.findMilestoneBrief(fields.milestoneId), topicId);

      const publicId = `${folder}/topics/${topicId}/${randomUUID()}.${ext}`;
      const cleanup = () => Promise.resolve(storage.destroy(publicId)).catch(() => {}); // một lần; job dọn lo phần còn lại
      let r;
      try {
        r = await storage.upload(file.buffer, { publicId });
      } catch (e) {
        logger?.warn({ err: e?.message }, 'Upload kho file lỗi');
        await cleanup();
        throw storageDown();
      }
      if (!r || r.public_id !== publicId || r.type !== 'authenticated' || r.resource_type !== 'raw' || r.bytes !== file.buffer.length) {
        logger?.warn({ publicId }, 'Không xác minh được bản tải lên');
        await cleanup();
        throw storageDown();
      }
      try {
        return await commit(user, topicId, fields, {
          kind: 'FILE', fileName: sanitizeFileName(file.originalname, ext), mimeType: DOCUMENT_FILE_TYPES[ext], sizeBytes: file.size, publicId,
        }, 'DOCUMENT_UPLOAD', ip);
      } catch (e) {
        await cleanup();
        throw e;
      }
    },

    async addLink(user, topicId, body, ip) {
      const { t } = await precheck(user, topicId);
      assertStage(t.status, body.stage);
      if (body.milestoneId) assertMilestone(await repo.findMilestoneBrief(body.milestoneId), topicId);
      return commit(user, topicId, body, { kind: 'LINK', fileName: body.title, externalUrl: body.url }, 'DOCUMENT_LINK', ip);
    },

    async list(user, topicId, q) {
      const t = await loadTopic(topicId);
      const can = readerOf(t, user, q.stage);
      if (!can) throw forbidden();
      const rel = relations(t, user);
      const full = canReadExecution(t, rel) || (rel.isRequestedLecturer && q.stage === 'PROPOSAL');
      const rows = await repo.listDocuments(topicId, q);
      const key = (d) => `${d.milestoneId ?? ''}|${d.milestoneId ? '' : d.stage}`;
      const max = new Map();
      for (const d of rows) max.set(key(d), Math.max(max.get(key(d)) ?? 0, d.version));
      const items = rows.filter((d) => full || can(d.uploadedAt))
        .map((d) => ({ ...presentDocument(d, d.version === max.get(key(d))), ...(!full && { feedbackCount: null }) })) // người đã rời: không lộ nhận xét
        .filter((d) => (!q.stage || d.stage === q.stage) && (q.latestOnly !== 'true' || d.isLatest)); // isLatest tính trên cả chuỗi trước khi lọc stage
      return { items };
    },

    async downloadUrl(user, id, ip) {
      const d = await repo.findDocument(id);
      if (!d) throw notFound();
      const t = await loadTopic(d.topicId);
      if (!readerOf(t, user, d.stage)?.(d.uploadedAt)) throw forbidden();
      if (d.kind !== 'FILE' || !d.publicId) throw new AppError(400, 'VALIDATION_ERROR', 'Tài liệu dạng link, mở trực tiếp đường dẫn');
      const expiresAt = new Date(now().getTime() + DOWNLOAD_URL_TTL_SECONDS * 1000);
      let url;
      try {
        url = await storage.signedDownloadUrl(d.publicId, { expiresAt, attachment: true });
      } catch (e) {
        logger?.warn({ err: e?.message }, 'Không ký được link tải');
        throw storageDown();
      }
      // Lịch sử lượt tải (FR24): ghi khi cấp link, là điểm kiểm quyền duy nhất (G30)
      await repo.auditNow({ actorId: user.id, action: 'DOCUMENT_DOWNLOAD', entityType: 'Document', entityId: d.id, before: null, after: { topicId: d.topicId, version: d.version }, ip });
      return { url, expiresAt: iso(expiresAt) };
    },
  };
};
