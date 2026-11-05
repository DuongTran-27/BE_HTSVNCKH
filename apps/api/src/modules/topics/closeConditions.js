// Điều kiện đóng đề tài FR27 (API_GD45 §7.2) – luôn theo đánh giá hiện hành (FR22).
// Hàm thuần `evaluateClose` dùng chung cho TopicDetail.closeReadiness và cho kiểm tra trước/trong transaction.

/**
 * milestones: mốc required = true ({ id, name, evaluation }); result: ResultVersion isCurrent (hoặc null);
 * advisorId: GVHD hiện hành (hoặc null).
 */
export const evaluateClose = ({ milestones, result, advisorId }) => {
  const pending = milestones.filter((m) => m.evaluation !== 'PASSED');
  const requiredMilestoneCount = milestones.length;
  // G24/CAU_HOI #8: không có mốc bắt buộc → chưa đủ điều kiện
  const requiredMilestonesPassed = requiredMilestoneCount > 0 && pending.length === 0;
  // G25: kết quả hiện hành do GVHD hiện hành tạo, có nhận xét tổng kết
  const hasFinalResult = !!result && !!result.summary?.trim() && !!advisorId && result.createdById === advisorId;
  return {
    requiredMilestoneCount,
    requiredMilestonesPassed,
    hasFinalResult,
    closeConditionsMet: requiredMilestonesPassed && hasFinalResult,
    pendingMilestones: pending.slice(0, 20).map((m) => ({ id: m.id, name: m.name })),
    pendingCount: pending.length,
  };
};

// Đọc bằng `db` truyền vào (prisma ngoài transaction, hoặc tx sau khi đã giữ khóa Topic)
export const loadCloseConditions = async (db, topicId) => {
  const milestones = await db.milestone.findMany({ where: { topicId, required: true }, orderBy: { order: 'asc' }, select: { id: true, name: true, evaluation: true } });
  const result = await db.resultVersion.findFirst({ where: { topicId, isCurrent: true }, select: { summary: true, createdById: true } });
  const adv = await db.advising.findFirst({ where: { topicId, endAt: null }, select: { lecturerId: true } });
  return evaluateClose({ milestones, result, advisorId: adv?.lecturerId ?? null });
};
