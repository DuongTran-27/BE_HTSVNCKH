import { topicSubmitSchema } from '@nckh/shared';

/** TopicDetail -> giá trị form (UI §4.7). TopicDetail chỉ có field:{id,name}, không có fieldId. */
export const topicToForm = (t) => ({
  title: t.title ?? '',
  summary: t.summary ?? '',
  objectives: t.objectives ?? '',
  keywords: [...(t.keywords ?? [])],
  fieldId: t.field?.id ?? '',
});

export const SUBMIT_FIELDS = [['title', 'Tên đề tài'], ['summary', 'Tóm tắt'], ['objectives', 'Mục tiêu'], ['keywords', 'Từ khóa'], ['fieldId', 'Lĩnh vực']];

/** Chạy topicSubmitSchema(cfg): trả { trường: thông điệp } cho các trường chưa đạt (rỗng = đủ điều kiện gửi) */
export const submitProblems = (form, cfg) => {
  const r = topicSubmitSchema(cfg).safeParse(form);
  const bad = {};
  if (!r.success) for (const i of r.error.issues) bad[i.path[0]] ??= i.message;
  return bad;
};
