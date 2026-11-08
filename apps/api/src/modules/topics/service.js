// Hồ sơ đề tài (FR05, API_GD2 §5.1): tạo nháp, xem chi tiết, sửa khi Nháp/Cần chỉnh sửa. Quyền theo quan hệ tính từ DB.
import { createHash } from 'node:crypto';
import { effectiveRoundConfig, findTransition, availableActions, countWords, ENABLED_ACTIONS, ADVISOR_CHANGE_STATUSES, PRE_APPROVAL_STATUSES } from '@nckh/shared';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { contentHash } from '../similarity/engine.js';
import { activeBypassOf, isUnchecked, presentBypass } from '../similarity/service.js';
import { evaluateClose } from './closeConditions.js';

const EDITABLE = ['DRAFT', 'NEEDS_REVISION'];
// Hành động GĐ2 (API_GD2 §10). TopicDetail dùng ENABLED_ACTIONS (GĐ2 + đóng đề tài, API_GD45 §7.4)
export const GD2_ACTIONS = ['REQUEST_ADVISOR', 'ACCEPT_ADVISING', 'DECLINE_ADVISING', 'WITHDRAW_ADVISOR_REQUEST', 'SUBMIT_FOR_REVIEW', 'RESUBMIT', 'REQUEST_REVISION', 'REJECT', 'APPROVE'];
const FINISHED = ['REJECTED', 'CANCELLED', 'CLOSED'];
const CLOSING = ['IN_PROGRESS', 'WAITING_CLOSE'];
const iso = (d) => d.toISOString();

// summary ghi dạng digest + số từ để log không phình (API_GD2 §5.1). Không đặt khóa tên "...hash": redact() sẽ lọc mất.
export const topicSnapshot = (t) => ({
  title: t.title,
  objectives: t.objectives,
  keywords: t.keywords,
  fieldId: t.fieldId ?? null,
  summaryDigest: { sha256: createHash('sha256').update(t.summary).digest('hex'), words: countWords(t.summary) },
});
export const presentFormerAdvisors = (rows) => rows.map((a) => ({
  lecturerId: a.lecturerId, fullName: a.lecturer.fullName, startAt: iso(a.startAt), endAt: iso(a.endAt), readOnlyGranted: a.readOnlyGranted,
}));
const fail = (details) => badRequest('VALIDATION_ERROR', 'Dữ liệu không hợp lệ', details);

// FR21 (API_GD6 §5.4): khoảng [joinedAt, leftAt) – biên joinedAt được đọc, leftAt không
export const inWindows = (at, windows) => windows.some((w) => w.joinedAt <= at && at < w.leftAt);

// t.advisings: Advising hiện hành (endAt null); t.formerAdvisings: đã kết thúc (API_GD6 §1.1); t.changeRequests: PENDING
// t.formerMembers: TopicMember đã rời (leftAt khác null) của mọi người
export const relations = (t, user) => {
  const me = t.members.find((m) => m.userId === user.id);
  const isCurrentAdvisor = t.advisings.some((a) => a.lecturerId === user.id);
  return {
    isMember: !!me,
    isLeader: me?.role === 'LEADER',
    isCurrentAdvisor,
    isRequestedLecturer: t.advisorRequests.some((r) => r.lecturerId === user.id),
    inStaffScope: user.role === 'STAFF' && !!user.staffFacultyIds?.includes(t.facultyId),
    isFormerAdvisorReader: !isCurrentAdvisor && (t.formerAdvisings ?? []).some((a) => a.lecturerId === user.id && a.readOnlyGranted),
    // Chỉ GV mới của ADVISOR_CHANGE được xem chi tiết (MINOR m1 T600: SV đích của TOPIC_CHANGE xem qua ChangeRequestView)
    isChangeTarget: (t.changeRequests ?? []).some((c) => c.type === 'ADVISOR_CHANGE' && c.targetUserId === user.id),
    // Chỉ khi không còn là thành viên hiện hành (§5.4); thành viên hiện hành đã đọc được mọi thứ
    formerMemberWindows: me ? [] : (t.formerMembers ?? []).filter((m) => m.userId === user.id).map((m) => ({ joinedAt: m.joinedAt, leftAt: m.leftAt })),
  };
};
export const canView = (t, rel) => rel.isMember || rel.isCurrentAdvisor || rel.isRequestedLecturer || rel.isFormerAdvisorReader || rel.isChangeTarget
  || (rel.inStaffScope && t.status !== 'DRAFT');
// Quyền đọc phần thực hiện + snapshot/lịch sử (API_GD45 §1.1, API_GD2 §8.4, API_GD6 §1.1) – một nơi duy nhất
export const canReadExecution = (t, rel) => rel.isMember || rel.isCurrentAdvisor || rel.isFormerAdvisorReader || (rel.inStaffScope && t.status !== 'DRAFT');
// Quyền đọc "phiên bản" (snapshot hồ sơ, phiên bản tài liệu – G41): null = không được; còn lại là hàm at → được đọc bản tạo lúc at.
// Người đã rời nhóm chỉ đọc bản trong khoảng còn là thành viên (FR21, API_GD6 §5.4)
// G46: lý do cho phép gửi khi chưa kiểm tra chỉ hiện theo quan hệ hiện hành (không cho GV cũ/SV đã rời)
export const canSeeBypassReason = (rel) => rel.isMember || rel.isCurrentAdvisor || rel.inStaffScope;
export const versionReader = (t, rel) => {
  if (canReadExecution(t, rel)) return () => true;
  const w = rel.formerMemberWindows;
  return w.length ? (at) => inWindows(at, w) : null;
};

export const createTopicService = ({ repo, now = () => new Date() }) => {
  const present = (t, user, rel) => {
    const n = now();
    const round = t.round;
    const adv = t.advisings[0];
    const req = t.advisorRequests[0];
    const sub = t.submissions[0];
    const sim = t.similarityChecks[0];
    const res = t.results[0];
    const bypass = activeBypassOf(t.similarityBypasses?.[0], sub); // G5 §9.3
    const running = t.status === 'IN_PROGRESS';
    const actions = availableActions(t.status, user.role).filter((a) => {
      const tr = findTransition(a);
      return ENABLED_ACTIONS.includes(a)
        && (!tr.leaderOnly || rel.isLeader)
        && (!tr.requestedLecturerOnly || rel.isRequestedLecturer)
        && (!tr.currentAdvisorOnly || rel.isCurrentAdvisor)
        && (user.role !== 'STAFF' || rel.inStaffScope);
    });
    return {
      id: t.id, code: t.code, status: t.status, version: t.version,
      title: t.title, summary: t.summary, objectives: t.objectives, keywords: t.keywords,
      field: t.field ? { id: t.field.id, name: t.field.name } : null,
      round: {
        id: round.id, name: round.name, academicYear: round.academicYear,
        regOpenAt: iso(round.regOpenAt), regCloseAt: iso(round.regCloseAt), reviewDeadline: iso(round.reviewDeadline),
        registrationOpen: round.regOpenAt <= n && n < round.regCloseAt,
        effectiveConfig: effectiveRoundConfig(round.config),
        endAt: iso(round.endAt), ended: n >= round.endAt,
      },
      members: t.members.map((m) => ({ userId: m.userId, code: m.user.code, fullName: m.user.fullName, role: m.role, joinedAt: iso(m.joinedAt) })),
      pendingInvitations: rel.isMember
        ? t.invitations.map((i) => ({ id: i.id, invitee: { code: i.invitee.code, fullName: i.invitee.fullName }, createdAt: iso(i.createdAt) }))
        : [],
      advisor: adv ? { id: adv.lecturer.id, fullName: adv.lecturer.fullName } : null,
      pendingAdvisorRequest: req
        ? { id: req.id, lecturer: { id: req.lecturer.id, fullName: req.lecturer.fullName }, createdAt: iso(req.createdAt), pendingDays: Math.floor((n - req.createdAt) / 86400000) }
        : null,
      latestSubmission: sub
        ? {
            id: sub.id, seq: sub.seq, createdAt: iso(sub.createdAt), unchecked: isUnchecked(sub),
            decision: sub.decision
              ? { action: sub.decision.action, reason: sub.decision.reason, decidedAt: iso(sub.decision.decidedAt), decidedBy: { fullName: sub.decision.decidedBy.fullName } }
              : null,
          }
        : null,
      latestSimilarity: sim
        ? { id: sim.id, status: sim.status, level: sim.level, createdAt: iso(sim.createdAt), isStale: sim.contentHash !== contentHash(t) }
        : null,
      // G5 (API_GD6 §9.3): thành viên, GVHD hiện hành, cán bộ trong phạm vi
      similarityBypass: bypass && canSeeBypassReason(rel) ? presentBypass(bypass) : null,
      availableActions: actions,
      currentResult: res ? { version: res.version, result: res.result, createdAt: iso(res.createdAt) } : null,
      closeReadiness: CLOSING.includes(t.status) && (rel.isCurrentAdvisor || rel.inStaffScope)
        ? (({ requiredMilestonesPassed, hasFinalResult, requiredMilestoneCount, pendingCount }) => ({
            requiredMilestonesPassed, hasFinalResult, requiredMilestoneCount, pendingMilestones: pendingCount, requiredRemovedCount: t._count.milestones,
          }))(evaluateClose({ milestones: t.milestones, result: res, advisorId: adv?.lecturerId ?? null }))
        : null,
      permissions: {
        edit: rel.isMember && EDITABLE.includes(t.status),
        invite: rel.isLeader && t.status === 'DRAFT',
        transferLeader: rel.isLeader && !FINISHED.includes(t.status),
        checkSimilarity: rel.isMember && ['DRAFT', 'WAITING_ADVISOR', 'HAS_ADVISOR', 'NEEDS_REVISION'].includes(t.status),
        viewHistory: rel.isMember || rel.isCurrentAdvisor || rel.isFormerAdvisorReader || rel.inStaffScope,
        manageMilestones: (rel.isCurrentAdvisor || rel.inStaffScope) && running,
        addProgress: rel.isMember && running,
        uploadProposal: rel.isMember && EDITABLE.includes(t.status),
        uploadMilestone: rel.isMember && running,
        giveFeedback: rel.isCurrentAdvisor && running,
        enterResult: rel.isCurrentAdvisor && running,
        readExecution: canReadExecution(t, rel),
        // GĐ6 (API_GD6 §2.5); quyền của loại khác do task của loại đó thêm
        requestTopicChange: rel.isLeader && t.status === 'IN_PROGRESS',
        requestAdvisorChange: (rel.isLeader || rel.inStaffScope) && ADVISOR_CHANGE_STATUSES.includes(t.status),
        requestCancel: (rel.isLeader || rel.isCurrentAdvisor) && t.status === 'IN_PROGRESS',
        leave: rel.isMember && !rel.isLeader && PRE_APPROVAL_STATUSES.includes(t.status),
        requestLeave: rel.isMember && !rel.isLeader && t.status === 'IN_PROGRESS',
        reopenMilestone: rel.isCurrentAdvisor && t.status === 'IN_PROGRESS',
        correctResult: rel.inStaffScope && t.status === 'CLOSED',
        manageFormerAdvisorAccess: rel.inStaffScope,
        grantSimilarityBypass: rel.inStaffScope && ['HAS_ADVISOR', 'NEEDS_REVISION'].includes(t.status) && sim?.status === 'ERROR' && !bypass,
      },
      pendingChangeRequests: (t.changeRequests ?? []).filter((c) => rel.isMember || rel.isCurrentAdvisor || rel.inStaffScope || c.targetUserId === user.id)
        .map((c) => ({ id: c.id, type: c.type, stage: c.targetUserId && !c.targetAcceptedAt ? 'TARGET' : 'STAFF', createdAt: iso(c.createdAt) })),
      readOnlyAccess: rel.isFormerAdvisorReader,
      formerAdvisors: rel.inStaffScope ? presentFormerAdvisors(t.formerAdvisings ?? []) : [],
      createdAt: iso(t.createdAt), updatedAt: iso(t.updatedAt),
    };
  };

  // Kiểm dữ liệu phụ thuộc đợt/danh mục; trả về fieldId chuẩn hóa (null nếu trống)
  const checkContent = async (body, cfg, currentFieldId = null) => {
    const errors = {};
    if (body.keywords.length > cfg.maxKeywords) errors.keywords = `Tối đa ${cfg.maxKeywords} từ khóa`;
    const fieldId = body.fieldId || null;
    if (fieldId && fieldId !== currentFieldId) { // giữ nguyên lĩnh vực đã chọn thì không bắt lỗi dù sau đó bị ngừng dùng
      const f = await repo.findField(fieldId);
      if (!f?.isActive) errors.fieldId = 'Lĩnh vực không tồn tại hoặc đã ngừng dùng';
    }
    if (Object.keys(errors).length) throw fail(errors);
    return fieldId;
  };
  const content = (body, fieldId) => ({ title: body.title, summary: body.summary, objectives: body.objectives, keywords: body.keywords, fieldId });

  const load = async (id) => {
    const t = await repo.findDetail(id);
    if (!t) throw notFound();
    return t;
  };
  const get = async (user, id) => {
    const t = await load(id);
    const rel = relations(t, user);
    if (!canView(t, rel)) throw forbidden();
    return { topic: present(t, user, rel) };
  };

  return {
    get,

    async create(user, body, ip) {
      const round = await repo.findRound(body.roundId);
      if (!round) throw fail({ roundId: 'Đợt không tồn tại' });
      if (round.facultyId !== user.facultyId) throw forbidden();
      if (now() >= round.regCloseAt) throw conflict('REGISTRATION_CLOSED', 'Ngoài thời gian đăng ký của đợt');
      const fieldId = await checkContent(body, effectiveRoundConfig(round.config));
      const id = await repo.create({ round, userId: user.id, data: content(body, fieldId), joinedAt: now() }, (t) => ({
        actorId: user.id, action: 'TOPIC_CREATE', entityType: 'Topic', entityId: t.id,
        before: null, after: { code: t.code, roundId: round.id, ...topicSnapshot(t) }, ip,
      }));
      return get(user, id);
    },

    async update(user, id, body, ip) {
      const t = await load(id);
      if (!relations(t, user).isMember) throw forbidden();
      if (!EDITABLE.includes(t.status)) throw conflict('TOPIC_NOT_EDITABLE', 'Chỉ sửa được hồ sơ ở trạng thái Nháp hoặc Cần chỉnh sửa');
      const fieldId = await checkContent(body, effectiveRoundConfig(t.round.config), t.fieldId);
      const data = content(body, fieldId);
      const ok = await repo.update({ id, version: body.version, editableStatuses: EDITABLE, data }, () => ({
        actorId: user.id, action: 'TOPIC_UPDATE', entityType: 'Topic', entityId: id,
        before: topicSnapshot(t), after: topicSnapshot(data), ip,
      }));
      if (!ok) throw conflict('CONCURRENT_UPDATE', 'Dữ liệu vừa được người khác cập nhật, vui lòng tải lại');
      return get(user, id);
    },
  };
};
