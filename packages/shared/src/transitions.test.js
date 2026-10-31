import { describe, it, expect } from 'vitest';
import { TRANSITIONS, availableActions, TOPIC_STATUS } from './index.js';

describe('Bảng chuyển trạng thái', () => {
  it('có đúng 14 thao tác, mã duy nhất', () => {
    expect(TRANSITIONS).toHaveLength(14);
    expect(new Set(TRANSITIONS.map((t) => t.action)).size).toBe(14);
  });
  it('mọi trạng thái nguồn/đích đều hợp lệ', () => {
    const all = Object.values(TOPIC_STATUS);
    TRANSITIONS.forEach((t) => { expect(all).toContain(t.from); expect(all).toContain(t.to); });
  });
  it('trạng thái kết thúc không có lối ra', () => {
    ['REJECTED', 'CANCELLED', 'CLOSED'].forEach((s) => expect(TRANSITIONS.some((t) => t.from === s)).toBe(false));
  });
  it('ADMIN không có thao tác nghiệp vụ nào (FR25)', () => {
    Object.values(TOPIC_STATUS).forEach((s) => expect(availableActions(s, 'ADMIN')).toEqual([]));
  });
  it('sinh viên ở Chờ xét duyệt không tự duyệt được', () => {
    expect(availableActions('UNDER_REVIEW', 'STUDENT')).toEqual([]);
  });
});
