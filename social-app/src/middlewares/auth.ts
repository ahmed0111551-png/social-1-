import { Session } from '../models/session.model';
import { User } from '../models/user.model';
import { AppError } from '../utils/appError';
import { asyncHandler } from '../utils/asyncHandler';
import { TokenPayload, verifyAccessToken } from '../utils/jwt';

export const authenticate = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw new AppError('Authentication required', 401);

  let payload: TokenPayload;
  try {
    payload = verifyAccessToken(header.slice(7));
  } catch {
    throw new AppError('Invalid or expired access token', 401);
  }

  // The session family must still have a live (non-revoked) refresh token -> instant logout/revocation
  const [user, active] = await Promise.all([
    User.findById(payload.sub),
    Session.exists({ family: payload.fam, revokedAt: null, expiresAt: { $gt: new Date() } }),
  ]);
  if (!user || !user.isVerified || !active) throw new AppError('Session is no longer valid', 401);

  req.user = user;
  req.auth = { family: payload.fam };
  next();
});
