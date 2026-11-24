import { conflict, forbidden, notFound } from '../../lib/errors.js';

// API_GD45 §1.2: câu khóa ĐẦU TIÊN của mọi thao tác ghi GĐ4; kiểm lại IN_PROGRESS từ kết quả câu khóa (không dùng trạng thái đã tải trước).
// Khóa Topic không kiểm trạng thái: caller tự kiểm từ `status` trả về (upload đề cương ở DRAFT/NEEDS_REVISION)
export async function lockTopicRow(tx, topicId) {
  const [row] = await tx.$queryRaw`SELECT id, status, version FROM "Topic" WHERE id = ${topicId} FOR NO KEY UPDATE`;
  if (!row) throw notFound();
  return row;
}

export async function lockTopicForExecution(tx, topicId) {
  const [row] = await tx.$queryRaw`SELECT id, status, version FROM "Topic" WHERE id = ${topicId} FOR NO KEY UPDATE`;
  if (!row) throw notFound();
  if (row.status !== 'IN_PROGRESS') throw conflict('TOPIC_NOT_IN_PROGRESS', 'Chỉ thực hiện được khi đề tài đang thực hiện');
  return row;
}

// Gọi SAU câu khóa Topic: GVHD hiện hành đọc bằng câu riêng (API_GD6 §1.2)
export async function assertCurrentAdvisor(tx, topicId, lecturerId) {
  const cur = await tx.advising.findFirst({ where: { topicId, endAt: null }, select: { lecturerId: true } });
  if (cur?.lecturerId !== lecturerId) throw forbidden('Bạn không còn là giảng viên hướng dẫn hiện hành của đề tài');
}
