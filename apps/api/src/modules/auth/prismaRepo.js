export const createAuthRepo = (prisma) => ({
  findUserByIdentifier: (id) => prisma.user.findFirst({ where: { OR: [{ email: id }, { code: { equals: id, mode: 'insensitive' } }] } }),
  findUserById: (id) => prisma.user.findUnique({ where: { id } }),
  updateUser: (id, data) => prisma.user.update({ where: { id }, data }),
  createRefreshToken: (data) => prisma.refreshToken.create({ data }),
  findRefreshTokenByHash: (tokenHash) => prisma.refreshToken.findUnique({ where: { tokenHash } }),
  revokeToken: (id, at, replacedBy) => prisma.refreshToken.update({ where: { id }, data: { revokedAt: at, replacedBy } }),
  revokeFamily: (family, at) => prisma.refreshToken.updateMany({ where: { family, revokedAt: null }, data: { revokedAt: at } }),
  revokeAllForUser: (userId, at, exceptFamily) => prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null, ...(exceptFamily ? { NOT: { family: exceptFamily } } : {}) },
    data: { revokedAt: at },
  }),
});
