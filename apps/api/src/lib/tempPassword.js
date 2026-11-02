import { randomInt } from 'node:crypto';

// Mật khẩu tạm (QD_ZOD §4.4.7): crypto.randomInt, 14 ký tự, luôn có chữ và số (thỏa changePasswordSchema).
// Bỏ ký tự dễ nhầm (0/O, 1/l/I). Chỉ trả cho người dùng một lần, không lưu bản rõ, không log.
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
const DIGITS = '23456789';
const pick = (set) => set[randomInt(set.length)];

export const generateTempPassword = (length = 14) => {
  const chars = [pick(LETTERS), pick(DIGITS)];
  while (chars.length < length) chars.push(pick(LETTERS + DIGITS));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
};
