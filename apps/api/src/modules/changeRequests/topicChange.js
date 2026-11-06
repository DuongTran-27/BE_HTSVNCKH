// FR18 – thay đổi sau duyệt (API_GD6 §6). Handler loại TOPIC_CHANGE của khung yêu cầu thay đổi (service.js).
import { effectiveRoundConfig, topicSubmitSchema } from '@nckh/shared';
import { AppError, badRequest, conflict } from '../../lib/errors.js';
import { runSimilarityCheck, similarityView, needsJustification } from '../similarity/service.js';
import { topicSnapshot } from '../topics/service.js';
import { assertTopicComplete } from '../topics/advisorService.js';

const FIELDS = ['title', 'summary', 'objectives', 'keywords', 'fieldId'];
const notRunning = () => conflict('TOPIC_NOT_IN_PROGRESS', 'Chỉ yêu cầu thay đổi được khi đề tài đang thực hiện');
const stale = (msg = 'Đề tài đã thay đổi sau khi tạo yêu cầu, vui lòng tạo yêu cầu mới') => conflict('STALE_CHANGE_REQUEST', msg);
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const content = (t) => Object.fromEntries(FIELDS.map((k) => [k, t[k] ?? null]));
const groupFull = (max) => conflict('GROUP_FULL', `Nhóm đã đủ số thành viên tối đa (${max})`);
const topicLimit = (code) => conflict('STUDENT_TOPIC_LIMIT', 'Sinh viên đã đạt số đề tài hoạt động tối đa trong đợt', { codes: [code] });
const noStudent = () => badRequest('VALIDATION_ERROR', 'Dữ liệu không hợp lệ', { addMemberCode: 'Không tìm thấy sinh viên phù hợp' });

// Kiểm khi SV đích đồng ý và khi cán bộ duyệt: sau khóa User, đếm bằng câu riêng (FR03)
const assertStudentLimit = async (o, student, topicId) => {
  const round = await o.roundOfTopic(topicId);
  if ((await o.countActiveTopics(student.id, round.id, topicId)) >= effectiveRoundConfig(round.config).maxActiveTopicsPerStudent) throw topicLimit(student.code);
};

export const topicChange = {
  // §6.2: chỉ trưởng nhóm (FR03 "chỉ trưởng nhóm gửi hồ sơ")
  canCreate: (rel, user) => user.role === 'STUDENT' && rel.isLeader,
  checkStatus: (status) => {
    if (status !== 'IN_PROGRESS') throw notRunning();
  },
  // §6.2 NGOÀI transaction: kiểm nội dung, thành viên thêm, rồi FR06 (nếu đổi tên/tóm tắt) trên nội dung sau khi gộp
  async precheck(repo, t, body, user, ip) {
    const cur = content(t);
    const diff = Object.fromEntries(Object.entries(body.changes ?? {}).filter(([k, v]) => v !== undefined && !same(v, cur[k])));
    if (!Object.keys(diff).length && !body.addMemberCode) throw badRequest('VALIDATION_ERROR', 'Dữ liệu không hợp lệ', { _: 'Yêu cầu phải có ít nhất một thay đổi' });
    const merged = { ...cur, ...diff };
    assertTopicComplete({ ...merged, round: t.round }); // 400 TOPIC_INCOMPLETE theo cấu hình hiện tại
    let newField = null;
    if (diff.fieldId) {
      newField = await repo.findField(diff.fieldId);
      if (!newField?.isActive) throw badRequest('VALIDATION_ERROR', 'Dữ liệu không hợp lệ', { 'changes.fieldId': 'Lĩnh vực không tồn tại hoặc đã ngừng dùng' });
    }
    const cfg = effectiveRoundConfig(t.round.config);
    let addMember = null;
    if (body.addMemberCode) {
      const s = await repo.read.findStudentByCode(body.addMemberCode);
      if (!s || s.role !== 'STUDENT' || s.isLocked || s.facultyId !== t.facultyId || t.members.some((m) => m.userId === s.id)) throw noStudent();
      if (t.members.length >= cfg.maxMembers) throw groupFull(cfg.maxMembers); // kiểm sớm; duyệt kiểm lại dưới khóa
      addMember = { userId: s.id, code: s.code, fullName: s.fullName };
    }
    let similarityCheckId = null;
    if ('title' in diff || 'summary' in diff) {
      const justification = body.justification || null;
      const row = await runSimilarityCheck({
        repo, topic: { ...t, ...merged }, cfg, justification,
        audit: (r) => ({ actorId: user.id, action: 'SIMILARITY_CHECK', entityType: 'SimilarityCheck', entityId: r.id, before: null, after: { topicId: t.id, status: r.status, level: r.level, forChangeRequest: true }, ip }),
      });
      const details = { similarityCheck: similarityView(row, user.role) };
      // CLAUDE.md quy tắc 5: lỗi không bao giờ coi là "không trùng" → không tạo yêu cầu
      if (row.status !== 'OK') throw new AppError(409, 'SIMILARITY_NOT_CHECKED', 'Chưa kiểm tra được trùng lặp, vui lòng thử lại', details);
      if (needsJustification(row.level, justification, cfg)) {
        throw badRequest('JUSTIFICATION_REQUIRED', `Hồ sơ nghi trùng cao, cần giải trình tối thiểu ${cfg.similarity.minJustificationWords} từ`, details);
      }
      similarityCheckId = row.id;
    }
    const side = (src) => ({ ...Object.fromEntries(Object.keys(diff).map((k) => [k, src[k]])), ...('fieldId' in diff && { fieldName: src.fieldName }) });
    return {
      cur, similarityCheckId, targetUserId: addMember?.userId ?? null,
      payload: { before: side({ ...cur, fieldName: t.field?.name ?? null }), after: side({ ...diff, fieldName: newField?.name ?? null }), addMember },
    };
  },
  // Dưới khóa Topic: nội dung không đổi kể từ lúc kiểm FR06 (kết quả gắn yêu cầu phải ứng với đúng nội dung đề xuất)
  async prepare(o, t, _body, _user, _at, pre) {
    if (!same(content(await o.topicContent(t.id)), pre.cur)) throw conflict('CONCURRENT_UPDATE', 'Dữ liệu vừa được người khác cập nhật, vui lòng tải lại');
    return { payload: pre.payload, targetUserId: pre.targetUserId, similarityCheckId: pre.similarityCheckId };
  },
  // §6.3: SV được thêm đồng ý – kiểm sớm số đề tài hoạt động
  async onAccept(o, cr, user) {
    await o.lockUsers([user.id]);
    await assertStudentLimit(o, user, cr.topicId);
  },
  // §6.4 hiệu lực. Phạm vi khoa của cán bộ đã kiểm ở service.approve TRƯỚC handler
  async apply(o, cr, { lock, user, at, ip }) {
    if (lock.status !== 'IN_PROGRESS') throw notRunning();
    const { before, after, addMember } = cr.payload;
    const cur = await o.topicContent(cr.topicId);
    for (const k of FIELDS) if (k in before && !same(cur[k], before[k])) throw stale();
    const data = Object.fromEntries(FIELDS.filter((k) => k in after).map((k) => [k, after[k]]));
    const merged = { ...content(cur), ...data };
    const cfg = effectiveRoundConfig(cur.round.config);
    if (!topicSubmitSchema(cfg).safeParse({ ...merged, fieldId: merged.fieldId ?? '' }).success) {
      throw conflict('TOPIC_INCOMPLETE', 'Hồ sơ sau thay đổi không còn đạt yêu cầu của đợt, vui lòng tạo yêu cầu mới');
    }
    if (addMember) { // FR03 kiểm lại dưới khóa, thứ tự Topic → User
      await o.lockUsers([addMember.userId]);
      const s = await o.findUser(addMember.userId);
      const members = await o.currentMembers(cr.topicId);
      if (!s || s.isLocked || s.role !== 'STUDENT' || s.facultyId !== cr.topic.facultyId || members.some((m) => m.userId === s.id)) throw stale('Sinh viên được thêm không còn hợp lệ, vui lòng tạo yêu cầu mới');
      if (members.length >= cfg.maxMembers) throw groupFull(cfg.maxMembers);
      await assertStudentLimit(o, s, cr.topicId);
      const m = await o.addMember(cr.topicId, s.id, at);
      await o.audit({ actorId: user.id, action: 'MEMBER_ADD', entityType: 'Topic', entityId: cr.topicId, before: null, after: { userId: s.id, topicMemberId: m.id, changeRequestId: cr.id }, ip });
    }
    // G34: không tạo Submission; tăng version kể cả khi chỉ thêm thành viên (§1.3)
    await o.updateTopicContent(cr.topicId, data);
    await o.audit({ actorId: user.id, action: 'TOPIC_CHANGE_APPLY', entityType: 'Topic', entityId: cr.topicId, before: topicSnapshot(cur), after: { ...topicSnapshot(merged), changeRequestId: cr.id }, ip });
  },
};
