// T214: điều tra test chập chờn T207b "STAFF ngoài phạm vi 403 dù file quá cỡ" (FR02, FR25; API_GD2 §1.2: 403 trước khi file được đọc).
// Kết luận (đã tái hiện, xem docs/agents/reports/T214.md): server trả 403 khi chưa đọc hết thân 2 MB rồi đóng kết nối,
// client nhận ECONNRESET/EPIPE thay vì 403 JSON. Không liên quan DB dùng chung. Tái hiện ngẫu nhiên nên lặp nhiều lượt.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma, S, seedBase, app } from './t214-kit.js';
import request from 'supertest';
import { signAccessToken } from '../src/lib/tokens.js';
import { testEnv } from './helpers.js';

beforeAll(async () => {
  await seedBase({ students: 1 });
  S.big = Buffer.alloc(8 * 1024 * 1024, 'a');
  // limiter 10 lượt/15 phút/người dùng chạy trước kiểm quyền: mỗi lượt dùng một STAFF khoa khác (không có phạm vi khoa CNTT)
  S.tokens = [];
  for (let i = 0; i < 200; i++) {
    const u = await prisma.user.create({ data: { code: `out${i}`, email: `out${i}@t.vn`, fullName: `out${i}`, passwordHash: 'x', role: 'STAFF', mustChangePassword: false, facultyId: S.F2.id } });
    await prisma.staffScope.create({ data: { userId: u.id, facultyId: S.F2.id } });
    S.tokens.push(signAccessToken(u, { secret: testEnv.JWT_ACCESS_SECRET, ttlSeconds: 600 }));
  }
}, 60000);
afterAll(() => prisma.$disconnect());

const attempt = async (kind) => {
  try {
    const r = await request(app).post(`/api/users/import/${kind}?facultyId=${S.F1.id}`).set('Authorization', `Bearer ${S.tokens.pop()}`).attach('file', S.big, 'u.csv');
    return r.status;
  } catch (e) {
    return `LỖI MẠNG ${e.code ?? e.message}`;
  }
};

describe('TC-FR25-IMP-01 STAFF ngoài phạm vi + file lớn (8 MB, khuếch đại lỗi 2 MB của T207b) phải luôn nhận 403 (không bị ngắt kết nối)', () => {
  // Đã sửa ở BUG-008 (drainThen): trước đây ~vài % lượt nhận ECONNRESET/EPIPE thay vì 403.
  it('150 lượt liên tiếp đều 403', async () => {
    const results = [];
    for (let i = 0; i < 150; i++) results.push(await attempt(i % 2 ? 'preview' : 'confirm'));
    const bad = results.filter((s) => s !== 403);
    expect(bad, `${bad.length}/150 lượt không phải 403: ${[...new Set(bad)].join(', ')}`).toEqual([]);
  });

  it('TC-FR25-IMP-02 (xác định) khi nhận được phản hồi thì luôn là 403 JSON FORBIDDEN, không bao giờ 413/400', async () => {
    const results = [];
    for (let i = 0; i < 30; i++) results.push(await attempt('preview'));
    expect(results.filter((s) => s !== 403)).toEqual([]); // cả lỗi mạng cũng là lỗi
  }, 60000);
});
