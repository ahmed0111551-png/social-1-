import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { env } from '../../config/env';
import { Session } from '../../models/session.model';
import { IUser, User, UserDoc } from '../../models/user.model';
import { AppError } from '../../utils/appError';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../utils/jwt';
import { sendMail } from '../../utils/mailer';
import { OTP_MAX_ATTEMPTS, OTP_RESEND_COOLDOWN_MS, buildOtp, hashOtp, safeEqual } from '../../utils/otp';

export interface ClientMeta {
  userAgent?: string;
  ip?: string;
}

const BCRYPT_ROUNDS = 12;
const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);

type OtpField = 'verifyOtp' | 'resetOtp';

// ---------- helpers ----------
async function checkOtp(user: UserDoc, field: OtpField, code: string) {
  const rec = user[field];
  if (!rec || rec.expiresAt.getTime() < Date.now()) throw new AppError('Code is invalid or expired', 400);
  if (rec.attempts >= OTP_MAX_ATTEMPTS) throw new AppError('Too many attempts, please request a new code', 429);
  if (!safeEqual(rec.hash, hashOtp(code))) {
    await User.updateOne({ _id: user._id }, { $inc: { [`${field}.attempts`]: 1 } });
    throw new AppError('Code is invalid or expired', 400);
  }
}

const inCooldown = (sentAt?: Date) => !!sentAt && Date.now() - sentAt.getTime() < OTP_RESEND_COOLDOWN_MS;

async function mailCode(to: string, kind: 'verify' | 'reset', code: string) {
  const subject = kind === 'verify' ? 'Verify your email' : 'Reset your password';
  const text =
    `Your ${kind === 'verify' ? 'verification' : 'password reset'} code is: ${code}\n` +
    `It expires in ${env.OTP_TTL_MINUTES} minutes. If you did not request this, ignore this email.`;
  try {
    await sendMail(to, subject, text);
  } catch (err) {
    console.error('Failed to send email:', err);
  }
}

async function issueTokens(user: UserDoc, meta: ClientMeta, family: string = randomUUID()) {
  const jti = randomUUID();
  await Session.create({
    user: user._id,
    family,
    jti,
    userAgent: meta.userAgent,
    ip: meta.ip,
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000),
  });
  const id = user._id.toString();
  return { accessToken: signAccessToken(id, family), refreshToken: signRefreshToken(id, family, jti) };
}

export const toSelf = (u: UserDoc) => ({
  id: u._id,
  firstName: u.firstName,
  lastName: u.lastName,
  email: u.email,
  avatar: u.avatar,
  bio: u.bio,
  isPrivate: u.isPrivate,
  provider: u.provider,
  createdAt: u.createdAt,
});

// ---------- 1) registration + email verification ----------
export async function register(dto: Pick<IUser, 'firstName' | 'lastName' | 'email'> & { password: string }) {
  if (await User.exists({ email: dto.email })) throw new AppError('Email is already registered', 409);

  const { code, record } = buildOtp();
  await User.create({
    ...dto,
    password: await bcrypt.hash(dto.password, BCRYPT_ROUNDS),
    verifyOtp: record,
  });
  await mailCode(dto.email, 'verify', code);
}

export async function verifyEmail(email: string, code: string) {
  const user = await User.findOne({ email }).select('+verifyOtp');
  if (!user) throw new AppError('Code is invalid or expired', 400);
  if (user.isVerified) throw new AppError('Email is already verified', 400);

  await checkOtp(user, 'verifyOtp', code);
  user.isVerified = true;
  user.verifyOtp = undefined;
  await user.save();
}

export async function resendVerification(email: string) {
  const user = await User.findOne({ email }).select('+verifyOtp');
  if (!user || user.isVerified || inCooldown(user.verifyOtp?.sentAt)) return; // generic response, no enumeration
  const { code, record } = buildOtp();
  user.verifyOtp = record;
  await user.save();
  await mailCode(email, 'verify', code);
}

// ---------- 2) login + session generation ----------
export async function login(email: string, password: string, meta: ClientMeta) {
  const user = await User.findOne({ email }).select('+password');
  const valid = !!user?.password && (await bcrypt.compare(password, user.password));
  if (!user || !valid) throw new AppError('Invalid email or password', 401);
  if (!user.isVerified) throw new AppError('Please verify your email first', 403);

  return { user: toSelf(user), ...(await issueTokens(user, meta)) };
}

// ---------- 3) refresh (rotation + reuse detection) & revocation ----------
export async function refresh(token: string, meta: ClientMeta) {
  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    throw new AppError('Invalid or expired refresh token', 401);
  }

  const session = await Session.findOne({ jti: payload.jti });
  if (!session) throw new AppError('Invalid refresh token', 401);

  if (session.revokedAt) {
    // An already-used token came back -> likely stolen. Kill the whole login session.
    await Session.updateMany({ family: session.family, revokedAt: null }, { revokedAt: new Date() });
    throw new AppError('Refresh token reuse detected, please log in again', 401);
  }

  const user = await User.findById(session.user);
  if (!user || !user.isVerified) throw new AppError('Invalid refresh token', 401);

  session.revokedAt = new Date();
  await session.save();
  return issueTokens(user, meta, session.family); // rotate: new refresh token, same family
}

export async function logout(token: string) {
  try {
    const { fam } = verifyRefreshToken(token);
    await Session.updateMany({ family: fam, revokedAt: null }, { revokedAt: new Date() });
  } catch {
    /* already invalid -> nothing to revoke */
  }
}

export const revokeAllSessions = (userId: unknown) =>
  Session.updateMany({ user: userId, revokedAt: null }, { revokedAt: new Date() });

// ---------- 4) password reset (OTP) ----------
export async function forgotPassword(email: string) {
  const user = await User.findOne({ email, isVerified: true }).select('+resetOtp');
  if (!user || inCooldown(user.resetOtp?.sentAt)) return; // always respond the same way
  const { code, record } = buildOtp();
  user.resetOtp = record;
  await user.save();
  await mailCode(email, 'reset', code);
}

export async function resetPassword(email: string, code: string, newPassword: string) {
  const user = await User.findOne({ email }).select('+resetOtp');
  if (!user) throw new AppError('Code is invalid or expired', 400);

  await checkOtp(user, 'resetOtp', code);
  user.password = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  user.resetOtp = undefined;
  user.isVerified = true; // receiving the code proves mailbox ownership
  await user.save();
  await revokeAllSessions(user._id); // log out everywhere
}

// ---------- 5) Google OAuth 2.0 ----------
export async function googleLogin(idToken: string, meta: ClientMeta) {
  if (!env.GOOGLE_CLIENT_ID) throw new AppError('Google sign-in is not configured', 501);

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken, audience: env.GOOGLE_CLIENT_ID });
    payload = ticket.getPayload();
  } catch {
    throw new AppError('Invalid Google token', 401);
  }
  if (!payload?.email || !payload.email_verified) throw new AppError('Google account email is not verified', 401);

  const email = payload.email.toLowerCase();
  let user = await User.findOne({ email });
  if (!user) {
    user = await User.create({
      firstName: payload.given_name || payload.name || 'User',
      lastName: payload.family_name || '-',
      email,
      provider: 'google',
      googleId: payload.sub,
      avatar: payload.picture ?? '',
      isVerified: true,
    });
  } else {
    // link Google to an existing local account with the same (Google-verified) email
    if (!user.googleId) user.googleId = payload.sub;
    if (!user.avatar && payload.picture) user.avatar = payload.picture;
    user.isVerified = true;
    await user.save();
  }

  return { user: toSelf(user), ...(await issueTokens(user, meta)) };
}
