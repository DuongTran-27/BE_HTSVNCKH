// Khung yêu cầu thay đổi FR18–FR21 (API_GD6 §2) + thay GV FR19 (§3). `write` chạy withLockTx; ops gắn với tx.
import { withLockTx } from '../../lib/tx.js';
import { conflict } from '../../lib/errors.js';
import { recordAudit } from '../audit/service.js';
import { notifyTopic } from '../notifications/notify.js';
import { lockTopicRow } from '../execution/lock.js';
import { countLecturerActive, lockUsers } from '../topics/advisorRepo.js';
import { findFormerAdvisings } from '../topics/prismaRepo.js';

const person = { select: { id: true, fullName: true, role: true } };
export const CR_INCLUDE = {
  topic: { select: { id: true, code: true, title: true, facultyId: true } },
  createdBy: person, target: person, decidedBy: person,
};
export const pendingExists = () => conflict('CHANGE_REQUEST_PENDING', 'Đề tài đã có yêu cầu cùng loại đang chờ xử lý');

const ops = (tx) => ({
  lockTopic: (topicId) => lockTopicRow(tx, topicId), // FOR NO KEY UPDATE, như mọi ghi GĐ4 (API_GD6 §1.3)
  lockUsers: (ids) => lockUsers(tx, ids),
  findUser: (id) => tx.user.findUnique({ where: { id }, select: { id: true, role: true, isLocked: true, facultyId: true, fullName: true } }),
  currentAdvising: (topicId) => tx.advising.findFirst({ where: { topicId, endAt: null }, select: { lecturerId: true, lecturer: { select: { fullName: true } } } }),
  formerAdvisings: (topicId) => findFormerAdvisings(tx, topicId),
  roundOfTopic: async (topicId) => (await tx.topic.findUnique({ where: { id: topicId }, select: { round: { select: { id: true, config: true } } } })).round,
  countLecturerActive: (lecturerId, roundId) => countLecturerActive(tx, lecturerId, roundId),
  hasPending: async (topicId, type) => (await tx.changeRequest.count({ where: { topicId, type, status: 'PENDING' } })) > 0,
  // Lưới an toàn change_request_one_pending (P2002) → 409 riêng, không thành DUPLICATE chung (§2.6)
  create: async (data) => {
    try {
      return await tx.changeRequest.create({ data });
    } catch (e) {
      if (e?.code === 'P2002') throw pendingExists();
      throw e;
    }
  },
  // Cập nhật có điều kiện (§1.3): false = yêu cầu đã bị xử lý bởi người khác
  transition: async (where, data) => (await tx.changeRequest.updateMany({ where, data })).count === 1,
  // advising_one_current không deferrable: kết thúc bản cũ TRƯỚC khi tạo bản mới (§3.4 bước 4)
  endAdvising: (topicId, at) => tx.advising.updateMany({ where: { topicId, endAt: null }, data: { endAt: at } }),
  createAdvising: (data) => tx.advising.create({ data }),
  bumpTopicVersion: (topicId) => tx.topic.updateMany({ where: { id: topicId }, data: { version: { increment: 1 } } }),
  // G36: bản mới nhất mỗi chuỗi mốc chưa Đạt, chưa có nhận xét nào
  pendingDocumentIds: async (topicId) => {
    const docs = await tx.document.findMany({
      where: { topicId, status: 'READY', milestoneId: { not: null }, milestone: { evaluation: { not: 'PASSED' } } },
      orderBy: [{ version: 'desc' }], select: { id: true, milestoneId: true, _count: { select: { feedbacks: true } } },
    });
    const latest = new Map();
    for (const d of docs) if (!latest.has(d.milestoneId)) latest.set(d.milestoneId, d);
    return [...latest.values()].filter((d) => d._count.feedbacks === 0).map((d) => d.id).sort();
  },
  setReadOnly: (topicId, lecturerId, granted) => tx.advising.updateMany({ where: { topicId, lecturerId, endAt: { not: null } }, data: { readOnlyGranted: granted } }),
  audit: (entry) => recordAudit(tx, entry),
  notify: (args) => notifyTopic(tx, args), // FR13, cùng tx
});

export const createChangeRequestRepo = (prisma) => ({
  changeRequestTx: (fn) => withLockTx(prisma, (tx) => fn(ops(tx))),
  findChangeRequest: (id) => prisma.changeRequest.findUnique({ where: { id }, include: CR_INCLUDE }),
  findChangeRequestWhere: (where) => prisma.changeRequest.findFirst({ where, include: CR_INCLUDE }),
  listChangeRequests: async ({ where, skip, take }) => {
    const [items, total] = await prisma.$transaction([
      prisma.changeRequest.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip, take, include: CR_INCLUDE }),
      prisma.changeRequest.count({ where }),
    ]);
    return { items, total };
  },
});
