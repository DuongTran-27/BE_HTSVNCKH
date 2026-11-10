import { describe, expect, it } from 'vitest';
import { FIRST_STUDENT_SLOT, planDemoPeople } from '../scripts/demo-people.js';
import { seedStudentCode } from '../prisma/seed.js';

describe('planDemoPeople – dữ liệu demo người thật thay tài khoản mẫu', () => {
  it('sinh viên thay mẫu từ slot 21, giảng viên thay GV001…; chuẩn hóa khoảng trắng, email viết thường', () => {
    const plan = planDemoPeople({
      students: [{ code: ' 2374802010999 ', fullName: 'Nguyễn  Văn A ' }, { code: '197CT10001', fullName: 'Trần B' }],
      lecturers: [{ fullName: 'Lê C', email: 'C.L@Truong.edu.vn' }],
    });
    expect(plan).toEqual([
      { codes: [seedStudentCode(FIRST_STUDENT_SLOT), '2374802010999'], data: { code: '2374802010999', fullName: 'Nguyễn Văn A', email: '2374802010999@nckh.example' } },
      { codes: [seedStudentCode(FIRST_STUDENT_SLOT + 1), '197CT10001'], data: { code: '197CT10001', fullName: 'Trần B', email: '197ct10001@nckh.example' } },
      { codes: ['GV001', 'GV001'], data: { fullName: 'Lê C', email: 'c.l@truong.edu.vn' } },
    ]);
  });
  it.each([
    [{ students: [{ code: '', fullName: 'A' }] }, /thiếu mã/],
    [{ students: [{ code: '1', fullName: 'A' }, { code: '1', fullName: 'B' }] }, /trùng/],
    [{ lecturers: [{ fullName: 'A', email: 'khong-phai-email' }] }, /email sai/],
    [{ students: Array.from({ length: 21 }, (_, i) => ({ code: `x${i}`, fullName: 'A' })) }, /Tối đa 20/],
    [{ lecturers: Array.from({ length: 9 }, (_, i) => ({ fullName: 'A', email: `a${i}@b.vn` })) }, /Tối đa 8/],
  ])('dữ liệu sai bị từ chối %#', (input, msg) => {
    expect(() => planDemoPeople(input)).toThrow(msg);
  });
});
