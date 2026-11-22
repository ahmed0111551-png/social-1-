import { Request } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ok } from '../../utils/response';
import * as auth from './auth.service';

const meta = (req: Request): auth.ClientMeta => ({ userAgent: req.get('user-agent'), ip: req.ip });

export const register = asyncHandler(async (req, res) => {
  await auth.register(req.body);
  ok(res, undefined, 'Registered. A 6-digit verification code was sent to your email.', 201);
});

export const verifyEmail = asyncHandler(async (req, res) => {
  await auth.verifyEmail(req.body.email, req.body.otp);
  ok(res, undefined, 'Email verified. You can log in now.');
});

export const resendVerification = asyncHandler(async (req, res) => {
  await auth.resendVerification(req.body.email);
  ok(res, undefined, 'If the account exists and is unverified, a new code was sent.');
});

export const login = asyncHandler(async (req, res) => {
  ok(res, await auth.login(req.body.email, req.body.password, meta(req)), 'Logged in');
});

export const google = asyncHandler(async (req, res) => {
  ok(res, await auth.googleLogin(req.body.idToken, meta(req)), 'Logged in with Google');
});

export const refresh = asyncHandler(async (req, res) => {
  ok(res, await auth.refresh(req.body.refreshToken, meta(req)));
});

export const logout = asyncHandler(async (req, res) => {
  await auth.logout(req.body.refreshToken);
  ok(res, undefined, 'Logged out');
});

export const logoutAll = asyncHandler(async (req, res) => {
  await auth.revokeAllSessions(req.user!._id);
  ok(res, undefined, 'Logged out from all devices');
});

export const forgotPassword = asyncHandler(async (req, res) => {
  await auth.forgotPassword(req.body.email);
  ok(res, undefined, 'If the email exists, a reset code was sent.');
});

export const resetPassword = asyncHandler(async (req, res) => {
  await auth.resetPassword(req.body.email, req.body.otp, req.body.newPassword);
  ok(res, undefined, 'Password updated. Please log in again.');
});
