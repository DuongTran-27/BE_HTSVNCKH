// Repo trong bộ nhớ + hasher giả để test không cần database.
export const fakeHasher = {
  hash: async (p) => `h:${p}`,
  verify: async (h, p) => h === `h:${p}`,
};

export const testEnv = {
  NODE_ENV: 'test', PORT: 0, JWT_ACCESS_SECRET: 'x'.repeat(40),
  ACCESS_TOKEN_TTL_SECONDS: 900, REFRESH_TOKEN_TTL_DAYS: 7, CORS_ORIGIN: 'http://localhost:5173',
};

export const createMemoryAuthRepo = (users = []) => {
  const u = new Map(users.map((x) => [x.id, { failedLogins: 0, lockedUntil: null, isLocked: false, mustChangePassword: false, ...x }]));
  const tokens = new Map();
  let seq = 0;
  const repo = {
    users: u, tokens,
    withFamilyLock: (_family, fn) => fn(repo), // một luồng: không cần khóa
    transaction: (fn) => fn(repo),
    lockUser: async () => {},
    findUserByIdentifier: async (id) => [...u.values()].find((x) => x.email === id || x.code.toLowerCase() === id) ?? null,
    findUserById: async (id) => u.get(id) ?? null,
    updateUser: async (id, data) => { const x = { ...u.get(id), ...data }; u.set(id, x); return x; },
    createRefreshToken: async (data) => { const rec = { id: `rt${++seq}`, revokedAt: null, ...data }; tokens.set(rec.id, rec); return rec; },
    findRefreshTokenByHash: async (h) => [...tokens.values()].find((t) => t.tokenHash === h) ?? null,
    revokeToken: async (id, at, replacedBy) => {
      const t = tokens.get(id);
      if (!t || t.revokedAt) return false;
      Object.assign(t, { revokedAt: at, replacedBy });
      return true;
    },
    revokeFamily: async (family, at) => { for (const t of tokens.values()) if (t.family === family && !t.revokedAt) t.revokedAt = at; },
    revokeAllForUser: async (userId, at, except) => {
      for (const t of tokens.values()) if (t.userId === userId && !t.revokedAt && t.family !== except) t.revokedAt = at;
    },
  };
  return repo;
};

export const student = { id: 'u1', code: 'SV001', email: 'sv001@st.edu.vn', fullName: 'Nguyễn Văn A', role: 'STUDENT', passwordHash: 'h:Matkhau123' };
