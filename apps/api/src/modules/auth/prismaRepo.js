// staffScopes nạp kèm để publicUser trả staffFacultyIds (API_GD2 §1.1, T206)
const withScopes = { staffScopes: { select: { facultyId: true } } };

export const createAuthRepo = (prisma) => ({
  findUserByIdentifier: (id) => prisma.user.findFirst({
    where: { OR: [{ email: id }, { code: { equals: id, mode: 'insensitive' } }] }, include: withScopes,
  }),
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
