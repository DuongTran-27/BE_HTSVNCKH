import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';

// Argon2id theo khuyến nghị OWASP (m=19 MiB, t=2, p=1) cho mật khẩu người dùng tự đặt
export const FULL_PARAMS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };
// BUG-013: mật khẩu tạm (generateTempPassword, ≥ 78 bit ngẫu nhiên, bắt đổi ở lần đăng nhập đầu) không cần làm chậm
// dò từ điển → Argon2id nhẹ (m=2 MiB, t=2 – argon2 0.41 không cho t=1). Chuỗi mã hóa mang tham số nên verify không đổi.
export const TEMP_PARAMS = { type: argon2.argon2id, memoryCost: 2048, timeCost: 2, parallelism: 1 };

// Hash bù: bộ nhớ = FULL − TEMP vì verify hash nhẹ đã tốn TEMP, tổng khớp một verify đầy đủ (BUG-013 MINOR 1)
const PAD_PARAMS = { ...FULL_PARAMS, memoryCost: FULL_PARAMS.memoryCost - TEMP_PARAMS.memoryCost };
let pad; // tạo một lần

export const passwordHasher = {
  hash: (plain, { temporary = false } = {}) => argon2.hash(plain, temporary ? TEMP_PARAMS : FULL_PARAMS),
  async verify(hash, plain) {
    const ok = await argon2.verify(hash, plain).catch(() => false);
    // Hash nhẹ: thêm một verify tham số đầy đủ để thời gian đăng nhập không lộ "tài khoản còn mật khẩu tạm" (T703 bước A)
    let light = false;
    try {
      light = argon2.needsRehash(hash, FULL_PARAMS);
    } catch {
      /* chuỗi hỏng: verify đã trả false */
    }
    if (light) {
      pad ??= argon2.hash(randomBytes(16).toString('hex'), PAD_PARAMS).catch((e) => { pad = undefined; throw e; });
      await pad.then((p) => argon2.verify(p, plain)).catch(() => false);
    }
    return ok;
  },
};
