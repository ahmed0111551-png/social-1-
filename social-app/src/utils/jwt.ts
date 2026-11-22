import jwt, { JwtPayload } from 'jsonwebtoken';
import { env } from '../config/env';

export interface TokenPayload extends JwtPayload {
  sub: string;
  fam: string; // session family (one login = one family)
  jti?: string; // refresh token id
}

export const signAccessToken = (userId: string, family: string) =>
  jwt.sign({ fam: family }, env.JWT_ACCESS_SECRET, {
    subject: userId,
    expiresIn: env.ACCESS_TOKEN_TTL_MIN * 60,
  });

export const signRefreshToken = (userId: string, family: string, jti: string) =>
  jwt.sign({ fam: family, jti }, env.JWT_REFRESH_SECRET, {
    subject: userId,
    expiresIn: env.REFRESH_TOKEN_TTL_DAYS * 86400,
  });

export const verifyAccessToken = (t: string) => jwt.verify(t, env.JWT_ACCESS_SECRET) as TokenPayload;
export const verifyRefreshToken = (t: string) => jwt.verify(t, env.JWT_REFRESH_SECRET) as TokenPayload;
