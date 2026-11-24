// Khung yêu cầu thay đổi dùng chung FR18–FR21 (API_GD6 §2). Vòng đời chung ở đây; điều kiện + hiệu lực theo loại ở TYPES.
// Handler: { canCreate, checkStatus, precheck? (ngoài tx), prepare (dưới khóa), pendingScope?, onAccept?, apply }.
import { CHANGE_TYPE_LABEL } from '@nckh/shared';
import { conflict, forbidden, notFound } from '../../lib/errors.js';
import { relations, canView, presentFormerAdvisors, inWindows } from '../topics/service.js';
import { topicName } from '../notifications/notify.js';
import { similarityView } from '../similarity/service.js';
import { advisorChange } from './advisorChange.js';
import { pendingExists } from './prismaRepo.js';
import { cancel } from './cancel.js';
import { leaveGroup } from './leaveGroup.js';
import { topicChange } from './topicChange.js';

export const TYPES = { TOPIC_CHANGE: topicChange, ADVISOR_CHANGE: advisorChange, CANCEL: cancel, LEAVE_GROUP: leaveGroup };
const ACTION_ORDER = ['ACCEPT', 'APPROVE', 'DECLINE', 'WITHDRAW'];
const iso = (d) => d?.toISOString() ?? null;
const closed = () => conflict('CHANGE_REQUEST_CLOSED', 'Yêu cầu không còn ở trạng thái chờ xử lý');
const person = (u) => u && { id: u.id, fullName: u.fullName, role: u.role };
const label = (cr) => CHANGE_TYPE_LABEL[cr.type].toLowerCase();

// stage suy ra (§2.1)
export const stageOf = (cr) => (cr.status !== 'PENDING' ? null : cr.targetUserId && !cr.targetAcceptedAt ? 'TARGET' : 'STAFF');
const inScope = (user, facultyId) => user.role === 'STAFF' && !!user.staffFacultyIds?.includes(facultyId);
// Đang chờ cán bộ: không có người đích hoặc người đích đã đồng ý
const STAFF_STAGE = { OR: [{ targetUserId: null }, { targetAcceptedAt: { not: null } }] };

export const availableCrActions = (cr, user) => {
  const stage = stageOf(cr);
  const set = new Set();
  if (stage === 'TARGET' && cr.targetUserId === user.id) set.add('ACCEPT').add('DECLINE');
  if (stage && inScope(user, cr.topic.facultyId)) {
    set.add('DECLINE');
    if (stage === 'STAFF') set.add('APPROVE');
  }
  if (stage && cr.createdById === user.id) set.add('WITHDRAW');
  return ACTION_ORDER.filter((a) => set.has(a));
};

// title: tên đề tài người xem được thấy (titleFor)
export const presentChangeRequest = (cr, user, title = cr.topic.title) => ({
  id: cr.id, type: cr.type, status: cr.status, stage: stageOf(cr),
  topic: { id: cr.topic.id, code: cr.topic.code, title },
  reason: cr.reason, payload: cr.payload,
  createdBy: person(cr.createdBy), createdAt: iso(cr.createdAt),
  target: person(cr.target), targetAcceptedAt: iso(cr.targetAcceptedAt),
  decidedBy: person(cr.decidedBy), decisionReason: cr.decisionNote ?? null, decidedAt: iso(cr.decidedAt),
  similarityCheck: cr.similarityCheck ? similarityView(cr.similarityCheck, user.role) : null, // chỉ TOPIC_CHANGE đổi tên/tóm tắt
  availableActions: availableCrActions(cr, user),
});

// Phạm vi đọc theo vai trò, áp ở WHERE trước phân trang (§2.4; MINOR m2 T600: GV cũ thấy yêu cầu thay mình)
export const scopeWhere = (user) => {
  const me = user.id;
  if (user.role === 'STAFF') return { topic: { facultyId: { in: user.staffFacultyIds ?? [] } } };
  if (user.role === 'LECTURER') {
    return { OR: [
      { targetUserId: me },
      { topic: { advisings: { some: { lecturerId: me, endAt: null } } } },
      { type: 'ADVISOR_CHANGE', payload: { path: ['from', 'lecturerId'], equals: me } },
    ] };
  }
  if (user.role === 'STUDENT') return { OR: [{ targetUserId: me }, { createdById: me }, { topic: { members: { some: { userId: me, leftAt: null } } } }] };
  return { id: { in: [] } };
};
const stageWhere = (stage) => (stage === 'TARGET'
  ? { status: 'PENDING', targetUserId: { not: null }, targetAcceptedAt: null }
  : { status: 'PENDING', ...STAFF_STAGE });

export const createChangeRequestService = ({ repo, getTopic, now = () => new Date() }) => {
  const load = async (id) => {
    const cr = await repo.findChangeRequest(id);
    if (!cr) throw notFound();
    return cr;
  };
  // m1 T603-bao-mat (FR18, §5.4): người không còn quan hệ hiện hành với đề tài (đã rời nhóm, GV cũ không được cấp quyền đọc,
  // người đích đã quyết định) không thấy tên hiện tại – chỉ tên snapshot trong khoảng còn là thành viên, không có thì null
  const titleFor = async (cr, user) => {
    const t = cr.topic;
    const current = inScope(user, t.facultyId) || t.members.some((m) => !m.leftAt) || t.advisings.length > 0
      || (cr.status === 'PENDING' && cr.targetUserId === user.id);
    if (current) return t.title;
    const w = t.members.filter((m) => m.leftAt);
    if (!w.length) return null;
    return (await repo.submissionTitles(t.id)).find((s) => inWindows(s.createdAt, w))?.payload?.title ?? null;
  };
  const present = async (cr, user) => presentChangeRequest(cr, user, await titleFor(cr, user));
  const view = async (id, user) => ({ changeRequest: await present(await repo.findChangeRequest(id, user.id), user) });
  const page = async (where, q, user) => {
    const { items, total } = await repo.listChangeRequests({ where, skip: (q.page - 1) * q.pageSize, take: q.pageSize, viewerId: user.id });
    return { items: await Promise.all(items.map((cr) => present(cr, user))), page: q.page, pageSize: q.pageSize, total };
  };
  const loadTopic = async (user, topicId) => {
    const t = await repo.findDetail(topicId);
    if (!t) throw notFound();
    const rel = relations(t, user);
    if (!canView(t, rel)) throw forbidden();
    return { t, rel };
  };
  const decidedLink = (cr) => `/de-tai/${cr.topicId}/yeu-cau`;
  // CHANGE_DECIDED (§11b): thành viên + GVHD hiện hành (đọc sau hiệu lực), người tạo, người đích; extra theo loại
  const notifyDecided = async (o, cr, user, verb, extra, title) => {
    const n = { topicId: cr.topicId, actorId: user.id, type: 'CHANGE_DECIDED', key: `CHANGE_DECIDED:${cr.id}`, title: title ?? ((x) => `Yêu cầu ${label(cr)} đã ${verb} – đề tài ${topicName(x)}`) };
    // extra trước: cùng dedupeKey nên link của extra thắng (người rời LEAVE_GROUP cũng là người tạo + người đích)
    for (const e of extra) await o.notify({ ...n, userIds: e.userIds, link: e.link });
    await o.notify({ ...n, to: ['members', 'advisor'], userIds: [cr.createdById], link: decidedLink(cr) });
    if (cr.targetUserId) await o.notify({ ...n, userIds: [cr.targetUserId], link: verb === 'được duyệt' ? decidedLink(cr) : '/yeu-cau' });
  };

  return {
    // POST /api/topics/:id/change-requests (§2.3)
    async create(user, topicId, body, ip) {
      const { t, rel } = await loadTopic(user, topicId);
      const h = TYPES[body.type];
      if (!h.canCreate(rel, user)) throw forbidden();
      h.checkStatus(t.status);
      // m1 T605: trả 409 sớm, không chạy FR06 (tốn thời gian, ghi SimilarityCheck mồ côi); kiểm lại dưới khóa bên dưới
      if (await repo.hasPending(topicId, body.type, h.pendingScope?.(user))) throw pendingExists();
      const pre = await h.precheck?.(repo, t, body, user, ip); // TOPIC_CHANGE: FR06 ngoài transaction (§6.2)
      const id = await repo.changeRequestTx(async (o) => {
        const lock = await o.lockTopic(topicId);
        h.checkStatus(lock.status); // kiểm lại dưới khóa
        if (await o.hasPending(topicId, body.type, h.pendingScope?.(user))) throw conflict('CHANGE_REQUEST_PENDING', 'Đề tài đã có yêu cầu cùng loại đang chờ xử lý');
        const { payload, targetUserId = null, targetAcceptedAt = null, similarityCheckId = null } = await h.prepare(o, { ...t, status: lock.status }, body, user, now(), pre);
        const cr = await o.create({ topicId, type: body.type, payload, reason: body.reason, createdById: user.id, targetUserId, targetAcceptedAt, similarityCheckId });
        await o.audit({ actorId: user.id, action: 'CHANGE_REQUEST_CREATE', entityType: 'ChangeRequest', entityId: cr.id, before: null, after: { topicId, type: cr.type, payload, reason: cr.reason }, ip });
        await o.notify({ topicId, to: ['members', 'advisor', 'staff'], actorId: user.id, type: 'CHANGE_REQUESTED', key: `CHANGE_REQUESTED:${cr.id}`, link: decidedLink(cr), title: (x) => `Yêu cầu ${label(cr)} – đề tài ${topicName(x)}` });
        if (stageOf(cr) === 'TARGET') { // MINOR m3 T600: chỉ khi thật sự chờ người đích (LEAVE_GROUP vào thẳng STAFF)
          await o.notify({ topicId, userIds: [targetUserId], actorId: user.id, type: 'CHANGE_TARGET_INVITED', key: `CHANGE_TARGET_INVITED:${cr.id}`, link: '/yeu-cau', title: (x) => `Bạn được đề xuất trong yêu cầu ${label(cr)} – đề tài ${topicName(x)}` });
        }
        return cr.id;
      });
      return view(id, user);
    },

    // POST /api/change-requests/:id/accept – người đích, stage TARGET
    async accept(user, id, ip) {
      const cr = await load(id);
      if (cr.targetUserId !== user.id) throw forbidden();
      if (stageOf(cr) !== 'TARGET') throw closed();
      await repo.changeRequestTx(async (o) => {
        await TYPES[cr.type].onAccept?.(o, cr, user);
        if (!(await o.transition({ id, status: 'PENDING', targetUserId: user.id, targetAcceptedAt: null }, { targetAcceptedAt: now() }))) throw closed();
        await o.audit({ actorId: user.id, action: 'CHANGE_REQUEST_ACCEPT', entityType: 'ChangeRequest', entityId: id, before: { stage: 'TARGET' }, after: { stage: 'STAFF' }, ip });
        const n = { actorId: user.id, type: 'CHANGE_TARGET_ACCEPTED', key: `CHANGE_TARGET_ACCEPTED:${id}`, title: (x) => `Người được đề xuất đã đồng ý yêu cầu ${label(cr)} – đề tài ${topicName(x)}` };
        await o.notify({ ...n, topicId: cr.topicId, to: ['staff'], link: '/yeu-cau' });
        await o.notify({ ...n, topicId: cr.topicId, userIds: [cr.createdById], link: decidedLink(cr) });
      });
      return view(id, user);
    },

    // POST /api/change-requests/:id/decline – người đích (stage TARGET) hoặc cán bộ trong phạm vi (mọi stage)
    async decline(user, id, body, ip) {
      const cr = await load(id);
      const asStaff = inScope(user, cr.topic.facultyId);
      if (!asStaff && cr.targetUserId !== user.id) throw forbidden();
      if (!asStaff && stageOf(cr) !== 'TARGET') throw closed();
      if (cr.status !== 'PENDING') throw closed();
      await repo.changeRequestTx(async (o) => {
        // MINOR m4 T600: nhánh người đích ràng targetAcceptedAt null – không từ chối sau khi chính mình vừa đồng ý
        const where = asStaff ? { id, status: 'PENDING' } : { id, status: 'PENDING', targetUserId: user.id, targetAcceptedAt: null };
        if (!(await o.transition(where, { status: 'DECLINED', decidedById: user.id, decidedAt: now(), decisionNote: body.reason }))) throw closed();
        await o.audit({ actorId: user.id, action: 'CHANGE_REQUEST_DECLINE', entityType: 'ChangeRequest', entityId: id, before: { status: 'PENDING' }, after: { status: 'DECLINED', reason: body.reason }, ip });
        await notifyDecided(o, cr, user, 'bị từ chối', []);
      });
      return view(id, user);
    },

    // POST /api/change-requests/:id/withdraw – chỉ người tạo
    async withdraw(user, id, ip) {
      const cr = await load(id);
      if (cr.createdById !== user.id) throw forbidden();
      if (cr.status !== 'PENDING') throw closed();
      // MINOR m5 T601-bao-mat: người tạo phải còn quan hệ cho phép tạo (đã rời nhóm / thôi là GVHD / mất phạm vi khoa → 403)
      const rel = relations(await repo.findDetail(cr.topicId), user);
      if (!(rel.isMember || rel.isCurrentAdvisor || rel.inStaffScope)) throw forbidden();
      await repo.changeRequestTx(async (o) => {
        if (!(await o.transition({ id, status: 'PENDING', createdById: user.id }, { status: 'WITHDRAWN', decidedAt: now() }))) throw closed();
        await o.audit({ actorId: user.id, action: 'CHANGE_REQUEST_WITHDRAW', entityType: 'ChangeRequest', entityId: id, before: { status: 'PENDING' }, after: { status: 'WITHDRAWN' }, ip });
        const n = { topicId: cr.topicId, actorId: user.id, type: 'CHANGE_WITHDRAWN', key: `CHANGE_WITHDRAWN:${id}`, title: (x) => `Yêu cầu ${label(cr)} đã bị rút – đề tài ${topicName(x)}` };
        await o.notify({ ...n, to: ['members', 'advisor', 'staff'], link: decidedLink(cr) });
        if (cr.targetUserId) await o.notify({ ...n, userIds: [cr.targetUserId], link: '/yeu-cau' });
      });
      return view(id, user);
    },

    // POST /api/change-requests/:id/approve – cán bộ trong phạm vi, stage STAFF; hiệu lực theo loại trong CÙNG transaction
    async approve(user, id, body, ip) {
      const cr = await load(id);
      if (!inScope(user, cr.topic.facultyId)) throw forbidden();
      if (cr.status !== 'PENDING') throw closed();
      if (stageOf(cr) === 'TARGET') throw conflict('CHANGE_NOT_READY', 'Người được đề xuất chưa đồng ý');
      const h = TYPES[cr.type]; // mọi ChangeType đều có handler (T605)
      await repo.changeRequestTx(async (o) => {
        const lock = await o.lockTopic(cr.topicId);
        const at = now(); // sau khóa: mọi ghi của GV cũ commit trước đó đều có thời điểm sớm hơn endAt
        const ok = await o.transition({ id, status: 'PENDING', ...STAFF_STAGE }, { status: 'ACCEPTED', decidedById: user.id, decidedAt: at, decisionNote: body.reason ?? null });
        if (!ok) throw closed();
        const { decidedExtra = [], decidedTitle } = (await h.apply(o, cr, { lock, user, at, reason: body.reason, ip })) ?? {};
        await o.audit({ actorId: user.id, action: 'CHANGE_REQUEST_APPROVE', entityType: 'ChangeRequest', entityId: id, before: { status: 'PENDING' }, after: { status: 'ACCEPTED', reason: body.reason ?? null }, ip });
        await notifyDecided(o, cr, user, 'được duyệt', decidedExtra, decidedTitle);
      });
      return { ...(await view(id, user)), topic: (await getTopic(user, cr.topicId)).topic };
    },

    // GET /api/topics/:id/change-requests – người đích chỉ thấy yêu cầu của mình
    async listForTopic(user, topicId, q) {
      const { rel } = await loadTopic(user, topicId);
      const all = rel.isMember || rel.isCurrentAdvisor || rel.isFormerAdvisorReader || rel.inStaffScope;
      return page({ topicId, ...(!all && { targetUserId: user.id }) }, q, user);
    },

    // GET /api/change-requests – hộp yêu cầu theo vai trò
    async list(user, q) {
      const and = [scopeWhere(user)];
      for (const k of ['status', 'type', 'topicId']) if (q[k]) and.push({ [k]: q[k] });
      if (q.stage) and.push(stageWhere(q.stage));
      if (q.roundId) and.push({ topic: { roundId: q.roundId } });
      return page({ AND: and }, q, user);
    },

    async get(user, id) {
      const cr = await repo.findChangeRequestWhere({ AND: [scopeWhere(user), { id }] }, user.id);
      if (!cr) {
        await load(id); // 404 nếu không tồn tại, còn lại 403
        throw forbidden();
      }
      return { changeRequest: await present(cr, user) };
    },

    // PUT /api/topics/:id/former-advisors/:lecturerId/read-access (§3.5) – FR19.4
    async setFormerAdvisorAccess(user, topicId, lecturerId, body, ip) {
      const t = await repo.findDetail(topicId);
      if (!t) throw notFound();
      if (!relations(t, user).inStaffScope) throw forbidden();
      return repo.changeRequestTx(async (o) => {
        await o.lockTopic(topicId);
        const rows = (await o.formerAdvisings(topicId)).filter((a) => a.lecturerId === lecturerId);
        if (!rows.length || (await o.currentAdvising(topicId))?.lecturerId === lecturerId) throw notFound('Không tìm thấy giảng viên cũ của đề tài');
        await o.setReadOnly(topicId, lecturerId, body.granted);
        await o.audit({ actorId: user.id, action: 'FORMER_ADVISOR_ACCESS', entityType: 'Topic', entityId: topicId, before: { lecturerId, readOnlyGranted: rows.some((a) => a.readOnlyGranted) }, after: { lecturerId, readOnlyGranted: body.granted, reason: body.reason }, ip });
        return { formerAdvisors: presentFormerAdvisors(await o.formerAdvisings(topicId)) };
      });
    },
  };
};
