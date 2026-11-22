import { HydratedDocument, Schema, model } from 'mongoose';

export interface IOtp {
  hash: string;
  expiresAt: Date;
  attempts: number;
  sentAt: Date;
}

export interface IUser {
  firstName: string;
  lastName: string;
  email: string;
  password?: string;
  provider: 'local' | 'google';
  googleId?: string;
  isVerified: boolean;
  isPrivate: boolean;
  bio: string;
  avatar: string;
  verifyOtp?: IOtp;
  resetOtp?: IOtp;
  createdAt: Date;
  updatedAt: Date;
}

const otpSchema = new Schema<IOtp>(
  {
    hash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    sentAt: { type: Date, required: true },
  },
  { _id: false },
);

const userSchema = new Schema<IUser>(
  {
    firstName: { type: String, required: true, trim: true, minlength: 1, maxlength: 30 },
    lastName: { type: String, required: true, trim: true, minlength: 1, maxlength: 30 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, select: false },
    provider: { type: String, enum: ['local', 'google'], default: 'local' },
    googleId: { type: String, index: { unique: true, sparse: true } },
    isVerified: { type: Boolean, default: false },
    isPrivate: { type: Boolean, default: false },
    bio: { type: String, maxlength: 160, default: '' },
    avatar: { type: String, default: '' },
    verifyOtp: { type: otpSchema, select: false },
    resetOtp: { type: otpSchema, select: false },
  },
  { timestamps: true },
);

userSchema.index({ firstName: 1, lastName: 1 });

export type UserDoc = HydratedDocument<IUser>;
export const User = model<IUser>('User', userSchema);
