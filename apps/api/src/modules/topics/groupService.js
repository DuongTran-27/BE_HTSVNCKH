// Nhóm, lời mời, trưởng nhóm (FR03, API_GD2 §5.3–5.5). Quyền theo quan hệ tính từ DB; giới hạn kiểm SAU câu khóa.
import { effectiveRoundConfig } from '@nckh/shared';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';

const FINISHED = ['REJECTED', 'CANCELLED', 'CLOSED'];
const iso = (d) => d?.toISOString() ?? null;
const isLeader = (g, userId) => g.members.some((m) => m.userId === userId && m.role === 'LEADER');
const closed = () => conflict('INVITATION_CLOSED', 'Lời mời không còn hiệu lực');

export const createGroupService = ({ repo, getTopic, now = () => new Date() }) => {
  const present = (i) => ({
    id: i.id, status: i.status, createdAt: iso(i.createdAt), respondedAt: iso(i.respondedAt),
    topic: { id: i.topic.id, code: i.topic.code, title: i.topic.title },
    invitee: { code: i.invitee.code, fullName: i.invitee.fullName },
  });
  const loadInvitation = async (id) => {
    const i = await repo.findInvitation(id);
    if (!i) throw notFound();
    return i;
  };

  return {
    async invite(user, topicId, body, ip) {
      const pre = await repo.read.findGroup(topicId);
      if (!pre) throw notFound();
      if (!isLeader(pre, user.id)) throw forbidden();
      const inv = await repo.lockTx(async (o) => {
        if (!(await o.lockTopic(topicId))) throw notFound();
        const g = await o.findGroup(topicId); // đọc lại SAU khóa
        if (!isLeader(g, user.id)) throw forbidden();
        if (g.status !== 'DRAFT') throw conflict('TOPIC_NOT_EDITABLE', 'Chỉ mời thành viên khi hồ sơ ở trạng thái Nháp');
        const invitee = await o.findStudentByCode(body.inviteeCode);
        if (!invitee || invitee.role !== 'STUDENT' || invitee.isLocked || invitee.facultyId !== g.round.facultyId) {
          throw badRequest('VALIDATION_ERROR', 'Dữ liệu không hợp lệ', { inviteeCode: 'Không tìm thấy sinh viên phù hợp' });
        }
        if (g.members.some((m) => m.userId === invitee.id) || (await o.hasPendingInvitation(topicId, invitee.id))) {
          throw conflict('ALREADY_MEMBER', 'Sinh viên đã là thành viên hoặc đã được mời');
        }
        const max = effectiveRoundConfig(g.round.config).maxMembers;
        if ((await o.countMembers(topicId)) + (await o.countPendingInvitations(topicId)) >= max) {
          throw conflict('GROUP_FULL', `Nhóm đã đủ số thành viên tối đa (${max})`);
        }
        const created = await o.createInvitation({ topicId, inviteeId: invitee.id });
        await o.audit({ actorId: user.id, action: 'INVITATION_CREATE', entityType: 'Invitation', entityId: created.id, before: null, after: { topicId, inviteeId: invitee.id }, ip });
        return created;
      });
      return { invitation: present(inv) };
    },

    async list(user, query) {
      const { items, total } = await repo.listInvitations({ inviteeId: user.id, status: query.status, skip: (query.page - 1) * query.pageSize, take: query.pageSize });
      return {
        page: query.page, pageSize: query.pageSize, total,
        items: items.map((i) => {
          const leader = i.topic.members.find((m) => m.role === 'LEADER')?.user;
          return {
            id: i.id, status: i.status, createdAt: iso(i.createdAt), respondedAt: iso(i.respondedAt),
            topic: {
              id: i.topic.id, code: i.topic.code, title: i.topic.title, round: i.topic.round,
              leader: leader ? { code: leader.code, fullName: leader.fullName } : null, memberCount: i.topic.members.length,
            },
          };
        }),
      };
    },

    async accept(user, id, ip) {
      const pre = await loadInvitation(id);
      if (pre.inviteeId !== user.id) throw forbidden();
      await repo.lockTx(async (o) => {
        // 1) câu khóa Topic + kiểm DRAFT + tăng version (§1.5, §5.3)
        if (!(await o.bumpTopic({ id: pre.topicId, status: 'DRAFT' }))) throw closed();
        // 2) cập nhật có điều kiện PENDING, trước khi tạo TopicMember
        if (!(await o.closeInvitation(id, 'ACCEPTED', now()))) throw closed();
        const g = await o.findGroup(pre.topicId);
        // BUG-006: người được mời có thể đã đổi khoa sau khi được mời -> 403 FORBIDDEN (ngoài khoa của đợt), rollback cả tx
        if ((await o.findUserFaculty(user.id))?.facultyId !== g.round.facultyId) throw forbidden();
        const cfg = effectiveRoundConfig(g.round.config);
        // 3) đếm sau khóa, bằng câu riêng
        if ((await o.countMembers(pre.topicId)) >= cfg.maxMembers) throw conflict('GROUP_FULL', `Nhóm đã đủ số thành viên tối đa (${cfg.maxMembers})`);
        if ((await o.countActiveTopics(user.id, g.round.id, pre.topicId)) >= cfg.maxActiveTopicsPerStudent) {
          throw conflict('STUDENT_TOPIC_LIMIT', 'Sinh viên đã đạt số đề tài hoạt động tối đa trong đợt', { codes: [user.code] });
        }
        await o.addMember(pre.topicId, user.id);
        await o.audit({ actorId: user.id, action: 'INVITATION_ACCEPT', entityType: 'Invitation', entityId: id, before: { status: 'PENDING' }, after: { status: 'ACCEPTED', topicId: pre.topicId }, ip });
      });
      return { invitation: present(await loadInvitation(id)), topicId: pre.topicId };
    },

    // decline (người được mời) và cancel (trưởng nhóm) khác nhau ở người được phép và trạng thái đích
    async close(user, id, kind, ip) {
      const pre = await loadInvitation(id);
      const allowed = kind === 'DECLINED' ? pre.inviteeId === user.id : pre.topic.members.some((m) => m.userId === user.id); // members chỉ gồm LEADER
      if (!allowed) throw forbidden();
      await repo.tx(async (o) => {
        if (!(await o.closeInvitation(id, kind, now()))) throw closed();
        await o.audit({ actorId: user.id, action: kind === 'DECLINED' ? 'INVITATION_DECLINE' : 'INVITATION_CANCEL', entityType: 'Invitation', entityId: id, before: { status: 'PENDING' }, after: { status: kind }, ip });
      });
      return { invitation: present(await loadInvitation(id)) };
    },

    async transferLeader(user, topicId, body, ip) {
      const pre = await repo.read.findGroup(topicId);
      if (!pre) throw notFound();
      if (!isLeader(pre, user.id)) throw forbidden();
      await repo.lockTx(async (o) => {
        // câu đầu = khóa Topic + khóa lạc quan
        if (!(await o.bumpTopic({ id: topicId, version: body.version }))) throw conflict('CONCURRENT_UPDATE', 'Dữ liệu vừa được người khác cập nhật, vui lòng tải lại');
        const g = await o.findGroup(topicId);
        if (!isLeader(g, user.id)) throw forbidden();
        if (FINISHED.includes(g.status)) throw conflict('TOPIC_NOT_EDITABLE', 'Đề tài đã kết thúc, không đổi được trưởng nhóm');
        if (body.userId === user.id || !g.members.some((m) => m.userId === body.userId)) {
          throw badRequest('VALIDATION_ERROR', 'Dữ liệu không hợp lệ', { userId: 'Phải chọn một thành viên khác của nhóm' });
        }
        await o.setLeader(topicId, user.id, body.userId);
        await o.audit({ actorId: user.id, action: 'LEADER_TRANSFER', entityType: 'Topic', entityId: topicId, before: { leaderUserId: user.id }, after: { leaderUserId: body.userId }, ip });
      });
      return getTopic(user, topicId);
    },
  };
};
