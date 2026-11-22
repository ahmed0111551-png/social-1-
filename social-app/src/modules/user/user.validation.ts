import { z } from 'zod';
import { paginationSchema } from '../../utils/pagination';
import { passwordRule } from '../auth/auth.validation';

const name = z.string().trim().min(2).max(30);

export const idParam = z.object({ id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid user id') });
export const userIdParam = z.object({ userId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid user id') });

export const updateProfileSchema = z
  .object({
    firstName: name.optional(),
    lastName: name.optional(),
    bio: z.string().trim().max(160).optional(),
    avatar: z.string().trim().url().max(500).or(z.literal('')).optional(),
  })
  .refine((o) => Object.keys(o).length > 0, 'Send at least one field to update');

export const settingsSchema = z.object({ isPrivate: z.boolean() });

export const changePasswordSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: passwordRule,
});

export const searchSchema = paginationSchema.extend({ q: z.string().trim().min(1).max(50) });
export const suggestionsSchema = z.object({ limit: z.coerce.number().int().min(1).max(30).default(10) });
export { paginationSchema };
