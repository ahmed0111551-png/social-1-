import { Schema, Types, model } from 'mongoose';

export interface ISession {
  user: Types.ObjectId;
  family: string;
  jti: string;
  userAgent?: string;
  ip?: string;
  revokedAt?: Date;
  expiresAt: Date;
}

const sessionSchema = new Schema<ISession>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    family: { type: String, required: true, index: true },
    jti: { type: String, required: true, unique: true },
    userAgent: String,
    ip: String,
    revokedAt: Date,
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } }, // TTL cleanup
  },
  { timestamps: true },
);

export const Session = model<ISession>('Session', sessionSchema);
