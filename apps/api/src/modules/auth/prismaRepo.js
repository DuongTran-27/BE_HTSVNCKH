import { recordAudit } from '../audit/service.js';

// staffScopes nạp kèm để publicUser trả staffFacultyIds (API_GD2 §1.1, T206)
const withScopes = { staffScopes: { select: { facultyId: true } } };

// `prisma` có thể là tx của $transaction (withFamilyLock tạo repo trên tx, không lồng transaction)
export const createAuthRepo = (prisma) => ({
  // Transaction: repo trên tx (không lồng transaction)
  transaction: (fn) => prisma.$transaction((tx) => fn(createAuthRepo(tx))),
  // Khóa dòng User trong transaction: cấp token (refresh/login) lấy SHARE, đổi mật khẩu lấy NO KEY UPDATE. Hai khóa xung đột
  // với nhau (và với khóa của reset/lock tài khoản), nên thu hồi phiên không bỏ sót token đang được cấp (T207a MAJOR).
  lockUser: async (id, share) => {
    if (share) await prisma.$queryRaw`SELECT id FROM "User" WHERE id = ${id} FOR SHARE`;
    else await prisma.$queryRaw`SELECT id FROM "User" WHERE id = ${id} FOR NO KEY UPDATE`;
  },
  // Khóa tư vấn theo họ phiên, giữ tới hết transaction: refresh/logout cùng họ chạy tuần tự (T205 MINOR).
  // lock_timeout ngắn: kẻ bắn nhiều refresh cùng họ không giữ connection của pool lâu (lỗi 55P03 -> 409, errorHandler).
  withFamilyLock: (family, fn) =>
    prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL lock_timeout = '3s'`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${family}))`;
      return fn(createAuthRepo(tx));
    }),
  findUserByIdentifier: (id) => prisma.user.findFirst({
    where: { OR: [{ email: id }, { code: { equals: id, mode: 'insensitive' } }] }, include: withScopes,
  }),
  // SSO (API_GD7 §8.2): khớp email không phân biệt hoa thường; lấy 2 để phát hiện dữ liệu bẩn (> 1 bản ghi)
  findUsersByEmailInsensitive: (email) => prisma.user.findMany({
    where: { email: { equals: email, mode: 'insensitive' } }, take: 2, include: withScopes,
  }),
  recordAudit: (entry) => recordAudit(prisma, entry),
  findUserById: (id) => prisma.user.findUnique({ where: { id }, include: withScopes }),
  updateUser: (id, data) => prisma.user.update({ where: { id }, data }),
  createRefreshToken: (data) => prisma.refreshToken.create({ data }),
  findRefreshTokenByHash: (tokenHash) => prisma.refreshToken.findUnique({ where: { tokenHash } }),
  // Compare-and-set: chỉ xoay nếu chưa bị thu hồi; trả true nếu thành công
  revokeToken: async (id, at, replacedBy) =>
    (await prisma.refreshToken.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: at, replacedBy } })).count === 1,
  revokeFamily: (family, at) => prisma.refreshToken.updateMany({ where: { family, revokedAt: null }, data: { revokedAt: at } }),
  revokeAllForUser: (userId, at, exceptFamily) => prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null, ...(exceptFamily ? { NOT: { family: exceptFamily } } : {}) },
    data: { revokedAt: at },
  }),
});
