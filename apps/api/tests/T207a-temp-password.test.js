import { it, expect } from 'vitest';
import { changePasswordSchema } from '@nckh/shared';
import { generateTempPassword } from '../src/lib/tempPassword.js';

it('mật khẩu tạm: ≥ 12 ký tự, có chữ và số, thỏa changePasswordSchema, không trùng nhau', () => {
  const seen = new Set();
  for (let i = 0; i < 500; i++) {
    const p = generateTempPassword();
    expect(p.length).toBeGreaterThanOrEqual(12);
    expect(p).toMatch(/[A-Za-z]/);
    expect(p).toMatch(/\d/);
    expect(changePasswordSchema.safeParse({ currentPassword: 'x', newPassword: p }).success).toBe(true);
    seen.add(p);
  }
  expect(seen.size).toBe(500);
});
