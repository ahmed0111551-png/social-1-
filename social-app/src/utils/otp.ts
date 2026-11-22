import crypto from 'crypto';
import { env } from '../config/env';

export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_MS = 60_000;

export const hashOtp = (code: string) =>
  crypto.createHash('sha256').update(code + env.JWT_ACCESS_SECRET).digest('hex');

export function buildOtp() {
  const code = crypto.randomInt(100000, 1000000).toString();
  return {
    code,
    record: {
      hash: hashOtp(code),
      expiresAt: new Date(Date.now() + env.OTP_TTL_MINUTES * 60_000),
      attempts: 0,
      sentAt: new Date(),
    },
  };
}

export const safeEqual = (a: string, b: string) => {
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  return A.length === B.length && crypto.timingSafeEqual(A, B);
};
