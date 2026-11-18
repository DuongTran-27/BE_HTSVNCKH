import { describe, it, expect } from 'vitest';
import { checkTransition } from '../src/modules/topics/stateMachine.js';

const topic = (status) => ({ id: 't1', status, version: 0 });
const sv = { id: 'u1', role: 'STUDENT' };
const gv = { id: 'g1', role: 'LECTURER' };
const cb = { id: 's1', role: 'STAFF' };
const words = (n) => Array.from({ length: n }, () => 'từ').join(' ');
const expectCode = (fn, code) => { try { fn(); throw new Error('không ném lỗi'); } catch (e) { expect(e.code).toBe(code); } };

describe('Luồng trạng thái', () => {
  it('trưởng nhóm gửi đề nghị hướng dẫn', () => {
    expect(checkTransition({ topic: topic('DRAFT'), action: 'REQUEST_ADVISOR', actor: sv, ctx: { isLeader: true } }).to).toBe('WAITING_ADVISOR');
  });
  it('thành viên thường không gửi được', () => {
    expectCode(() => checkTransition({ topic: topic('DRAFT'), action: 'REQUEST_ADVISOR', actor: sv, ctx: { isLeader: false } }), 'FORBIDDEN');
  });
  it('sai trạng thái nguồn → INVALID_TRANSITION', () => {
    expectCode(() => checkTransition({ topic: topic('DRAFT'), action: 'APPROVE', actor: cb, ctx: { inStaffScope: true } }), 'INVALID_TRANSITION');
  });
  it('sinh viên không tự duyệt đề tài', () => {
    expectCode(() => checkTransition({ topic: topic('UNDER_REVIEW'), action: 'APPROVE', actor: sv, ctx: {} }), 'FORBIDDEN');
  });
  it('cán bộ ngoài khoa bị chặn', () => {
    expectCode(() => checkTransition({ topic: topic('UNDER_REVIEW'), action: 'APPROVE', actor: cb, ctx: { inStaffScope: false } }), 'FORBIDDEN');
  });
  it('từ chối bắt buộc lý do', () => {
    expectCode(() => checkTransition({ topic: topic('UNDER_REVIEW'), action: 'REJECT', actor: cb, ctx: { inStaffScope: true } }), 'REASON_REQUIRED');
  });
  it('gửi xét duyệt khi kiểm tra trùng lỗi → chặn', () => {
    expectCode(() => checkTransition({ topic: topic('HAS_ADVISOR'), action: 'SUBMIT_FOR_REVIEW', actor: sv,
      ctx: { isLeader: true, similarity: { status: 'ERROR' } } }), 'SIMILARITY_NOT_CHECKED');
  });
  it('nghi trùng cao thiếu giải trình → chặn; đủ 50 từ → qua', () => {
    const ctx = { isLeader: true, similarity: { status: 'OK', level: 'HIGH' } };
    expectCode(() => checkTransition({ topic: topic('HAS_ADVISOR'), action: 'SUBMIT_FOR_REVIEW', actor: sv, ctx, justification: words(20) }), 'JUSTIFICATION_REQUIRED');
    expect(checkTransition({ topic: topic('HAS_ADVISOR'), action: 'SUBMIT_FOR_REVIEW', actor: sv, ctx, justification: words(50) }).to).toBe('UNDER_REVIEW');
  });
  it('mức REVIEW không bắt buộc giải trình', () => {
    expect(checkTransition({ topic: topic('HAS_ADVISOR'), action: 'SUBMIT_FOR_REVIEW', actor: sv,
      ctx: { isLeader: true, similarity: { status: 'OK', level: 'REVIEW' } } }).to).toBe('UNDER_REVIEW');
  });
  it('đóng đề tài cần mọi mốc bắt buộc Đạt và có kết quả cuối (FR27)', () => {
    const base = { topic: topic('IN_PROGRESS'), action: 'REQUEST_CLOSE', actor: gv };
    expectCode(() => checkTransition({ ...base, ctx: { isCurrentAdvisor: true, requiredMilestonesPassed: false, hasFinalResult: true } }), 'MILESTONES_NOT_PASSED');
    expectCode(() => checkTransition({ ...base, ctx: { isCurrentAdvisor: true, requiredMilestonesPassed: true, hasFinalResult: false } }), 'NO_FINAL_RESULT');
    expect(checkTransition({ ...base, ctx: { isCurrentAdvisor: true, requiredMilestonesPassed: true, hasFinalResult: true } }).to).toBe('WAITING_CLOSE');
  });
  it('giảng viên không phải GVHD hiện hành không đóng được', () => {
    expectCode(() => checkTransition({ topic: topic('IN_PROGRESS'), action: 'REQUEST_CLOSE', actor: gv,
      ctx: { isCurrentAdvisor: false, requiredMilestonesPassed: true, hasFinalResult: true } }), 'FORBIDDEN');
  });

  // GĐ7 §0 (TASK-DC-01)
  it('COUNCIL_FINALIZE: chỉ chủ tịch/thư ký (councilOfficerOnly); GVHD, SV, ADMIN 403; sai trạng thái 409', () => {
    const base = { topic: topic('WAITING_DEFENSE'), action: 'COUNCIL_FINALIZE' };
    expect(checkTransition({ ...base, actor: gv, ctx: { isCouncilOfficer: true } }).to).toBe('WAITING_CLOSE');
    expectCode(() => checkTransition({ ...base, actor: gv, ctx: { isCouncilOfficer: false, isCurrentAdvisor: true } }), 'FORBIDDEN');
    expectCode(() => checkTransition({ ...base, actor: sv, ctx: { isCouncilOfficer: true } }), 'FORBIDDEN');
    expectCode(() => checkTransition({ ...base, actor: { id: 'a', role: 'ADMIN' }, ctx: { isCouncilOfficer: true } }), 'FORBIDDEN');
    expectCode(() => checkTransition({ ...base, topic: topic('IN_PROGRESS'), actor: gv, ctx: { isCouncilOfficer: true } }), 'INVALID_TRANSITION');
  });
  it('PUBLISH_RECRUITMENT: GV không hướng dẫn 403, SV 403; FR06 lỗi → SIMILARITY_NOT_CHECKED; OK → RECRUITING', () => {
    const base = { topic: topic('DRAFT'), action: 'PUBLISH_RECRUITMENT', actor: gv };
    expectCode(() => checkTransition({ ...base, ctx: { isCurrentAdvisor: false, similarity: { status: 'OK', level: 'NONE' } } }), 'FORBIDDEN');
    expectCode(() => checkTransition({ ...base, actor: sv, ctx: { isLeader: true } }), 'FORBIDDEN');
    expectCode(() => checkTransition({ ...base, ctx: { isCurrentAdvisor: true, similarity: { status: 'ERROR' } } }), 'SIMILARITY_NOT_CHECKED');
    expect(checkTransition({ ...base, ctx: { isCurrentAdvisor: true, similarity: { status: 'OK', level: 'NONE' } } }).to).toBe('RECRUITING');
  });
  it('UNPUBLISH_RECRUITMENT bắt buộc lý do; FINALIZE_GROUP chỉ GVHD hiện hành', () => {
    const ctx = { isCurrentAdvisor: true };
    expectCode(() => checkTransition({ topic: topic('RECRUITING'), action: 'UNPUBLISH_RECRUITMENT', actor: gv, ctx }), 'REASON_REQUIRED');
    expect(checkTransition({ topic: topic('RECRUITING'), action: 'UNPUBLISH_RECRUITMENT', actor: gv, ctx, reason: 'Không đủ sinh viên' }).to).toBe('DRAFT');
    expectCode(() => checkTransition({ topic: topic('RECRUITING'), action: 'FINALIZE_GROUP', actor: gv, ctx: { isCurrentAdvisor: false } }), 'FORBIDDEN');
    expect(checkTransition({ topic: topic('RECRUITING'), action: 'FINALIZE_GROUP', actor: gv, ctx }).to).toBe('HAS_ADVISOR');
  });
  it('REQUEST_DEFENSE chỉ GVHD hiện hành; RETURN_FROM_DEFENSE chỉ cán bộ trong phạm vi, bắt buộc lý do', () => {
    expect(checkTransition({ topic: topic('IN_PROGRESS'), action: 'REQUEST_DEFENSE', actor: gv, ctx: { isCurrentAdvisor: true } }).to).toBe('WAITING_DEFENSE');
    expectCode(() => checkTransition({ topic: topic('IN_PROGRESS'), action: 'REQUEST_DEFENSE', actor: cb, ctx: { inStaffScope: true } }), 'FORBIDDEN');
    const back = { topic: topic('WAITING_DEFENSE'), action: 'RETURN_FROM_DEFENSE', actor: cb };
    expectCode(() => checkTransition({ ...back, ctx: { inStaffScope: false }, reason: 'Thiếu minh chứng' }), 'FORBIDDEN');
    expectCode(() => checkTransition({ ...back, ctx: { inStaffScope: true } }), 'REASON_REQUIRED');
    expect(checkTransition({ ...back, ctx: { inStaffScope: true }, reason: 'Thiếu minh chứng' }).to).toBe('IN_PROGRESS');
  });
});
