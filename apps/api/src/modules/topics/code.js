// Sinh mã đề tài duy nhất, an toàn khi gửi đồng thời (FR05).
// Dạng: NCKH-<năm bắt đầu>-<4 số>; dùng sequence Postgres để không bao giờ trùng.
export const formatTopicCode = (academicYear, n) => `NCKH-${academicYear.slice(0, 4)}-${String(n).padStart(4, '0')}`;

export const nextTopicCode = async (tx, academicYear) => {
  const [{ nextval }] = await tx.$queryRaw`SELECT nextval('topic_code_seq')`;
  return formatTopicCode(academicYear, Number(nextval));
};
