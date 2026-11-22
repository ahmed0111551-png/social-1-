import { z } from 'zod';

const email = z.string().trim().toLowerCase().email();
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(64)
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[0-9]/, 'Password must contain a number');
const otp = z.string().regex(/^\d{6}$/, 'Code must be 6 digits');
const name = z.string().trim().min(2).max(30);

export const registerSchema = z.object({ firstName: name, lastName: name, email, password });
export const verifyEmailSchema = z.object({ email, otp });
export const emailOnlySchema = z.object({ email });
export const loginSchema = z.object({ email, password: z.string().min(1) });
export const googleSchema = z.object({ idToken: z.string().min(10) });
export const refreshSchema = z.object({ refreshToken: z.string().min(10) });
export const resetPasswordSchema = z.object({ email, otp, newPassword: password });

export { password as passwordRule };
