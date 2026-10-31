import argon2 from 'argon2';

// Argon2id theo khuyến nghị OWASP (m=19 MiB, t=2, p=1)
export const passwordHasher = {
  hash: (plain) => argon2.hash(plain, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 }),
  verify: (hash, plain) => argon2.verify(hash, plain).catch(() => false),
};
