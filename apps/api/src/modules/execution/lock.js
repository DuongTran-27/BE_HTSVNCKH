import { conflict, notFound } from '../../lib/errors.js';

// API_GD45 §1.2: câu khóa ĐẦU TIÊN của mọi thao tác ghi GĐ4; kiểm lại IN_PROGRESS từ kết quả câu khóa (không dùng trạng thái đã tải trước).
export async function lockTopicForExecution(tx, topicId) {
  const [row] = await tx.$queryRaw`SELECT id, status, version FROM "Topic" WHERE id = ${topicId} FOR NO KEY UPDATE`;
  if (!row) throw notFound();
  if (row.status !== 'IN_PROGRESS') throw conflict('TOPIC_NOT_IN_PROGRESS', 'Chỉ thực hiện được khi đề tài đang thực hiện');
  return row;
}
