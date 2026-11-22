import { asyncHandler } from '../../utils/asyncHandler';
import { ok } from '../../utils/response';
import * as users from './user.service';

const page = (req: any) => ({ page: Number(req.query.page ?? 1), limit: Number(req.query.limit ?? 10) });

export const getMe = asyncHandler(async (req, res) => ok(res, await users.getMe(req.user!)));
export const updateMe = asyncHandler(async (req, res) => ok(res, await users.updateMe(req.user!, req.body), 'Profile updated'));
export const getProfile = asyncHandler(async (req, res) => ok(res, await users.getProfile(req.user!, req.params.id)));

export const follow = asyncHandler(async (req, res) => {
  const r = await users.follow(req.user!, req.params.id);
  ok(res, r, r.status === 'pending' ? 'Follow request sent' : 'Followed', 201);
});
export const unfollow = asyncHandler(async (req, res) => {
  await users.unfollow(req.user!, req.params.id);
  ok(res, undefined, 'Unfollowed');
});

export const listRequests = asyncHandler(async (req, res) => {
  const { page: p, limit } = page(req);
  ok(res, await users.listFollowRequests(req.user!, p, limit));
});
export const acceptRequest = asyncHandler(async (req, res) => {
  await users.respondToRequest(req.user!, req.params.userId, 'accept');
  ok(res, undefined, 'Request accepted');
});
export const rejectRequest = asyncHandler(async (req, res) => {
  await users.respondToRequest(req.user!, req.params.userId, 'reject');
  ok(res, undefined, 'Request rejected');
});

export const followers = asyncHandler(async (req, res) => {
  const { page: p, limit } = page(req);
  ok(res, await users.listConnections(req.user!, req.params.id, 'followers', p, limit));
});
export const following = asyncHandler(async (req, res) => {
  const { page: p, limit } = page(req);
  ok(res, await users.listConnections(req.user!, req.params.id, 'following', p, limit));
});

export const search = asyncHandler(async (req, res) => {
  const { page: p, limit } = page(req);
  ok(res, await users.searchUsers(req.user!, String(req.query.q), p, limit));
});
export const suggestions = asyncHandler(async (req, res) =>
  ok(res, await users.getSuggestions(req.user!, Number(req.query.limit ?? 10))),
);

export const getSettings = asyncHandler(async (req, res) => ok(res, users.getSettings(req.user!)));
export const updateSettings = asyncHandler(async (req, res) =>
  ok(res, await users.updateSettings(req.user!, req.body.isPrivate), 'Settings updated'),
);
export const changePassword = asyncHandler(async (req, res) => {
  await users.changePassword(req.user!._id, req.body.oldPassword, req.body.newPassword);
  ok(res, undefined, 'Password changed. Please log in again on all devices.');
});
