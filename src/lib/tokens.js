import { randomBytes, createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';

export const sha256 = (s) => createHash('sha256').update(s).digest('hex');
export const newOpaqueToken = () => randomBytes(32).toString('base64url');

export const signAccessToken = (user, { secret, ttlSeconds }) =>
  jwt.sign({ sub: user.id, role: user.role }, secret, { expiresIn: ttlSeconds, algorithm: 'HS256' });

export const verifyAccessToken = (token, secret) => jwt.verify(token, secret, { algorithms: ['HS256'] });
