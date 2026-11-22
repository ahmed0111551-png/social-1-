import bcrypt from 'bcryptjs';
import { Types } from 'mongoose';
import { Follow } from '../../models/follow.model';
import { User, UserDoc } from '../../models/user.model';
import { AppError } from '../../utils/appError';
import { paginate } from '../../utils/pagination';
import { revokeAllSessions, toSelf } from '../auth/auth.service';

type Relationship = 'self' | 'none' | 'pending' | 'following';
const PUBLIC_FIELDS = 'firstName lastName avatar isPrivate';

const card = (u: any, relationship?: Relationship, extra: object = {}) => ({
  id: u._id,
  firstName: u.firstName,
  lastName: u.lastName,
  avatar: u.avatar,
  isPrivate: u.isPrivate,
  ...(relationship && { relationship }),
  ...extra,
});

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---------- helpers ----------
async function getRelationship(viewerId: Types.ObjectId, targetId: Types.ObjectId): Promise<Relationship> {
  if (viewerId.equals(targetId)) return 'self';
  const f = await Follow.findOne({ follower: viewerId, following: targetId }).lean();
  return !f ? 'none' : f.status === 'accepted' ? 'following' : 'pending';
}

async function relationshipMap(viewerId: Types.ObjectId, ids: Types.ObjectId[]) {
  const rows = await Follow.find({ follower: viewerId, following: { $in: ids } }).lean();
  return new Map(rows.map((r) => [r.following.toString(), (r.status === 'accepted' ? 'following' : 'pending') as Relationship]));
}

const counts = async (id: Types.ObjectId) => {
  const [followersCount, followingCount] = await Promise.all([
    Follow.countDocuments({ following: id, status: 'accepted' }),
    Follow.countDocuments({ follower: id, status: 'accepted' }),
  ]);
  return { followersCount, followingCount };
};

async function findActiveUser(id: string) {
  const user = await User.findOne({ _id: id, isVerified: true });
  if (!user) throw new AppError('User not found', 404);
  return user;
}

// ---------- profile ----------
export async function getMe(me: UserDoc) {
  return { ...toSelf(me), ...(await counts(me._id)) };
}

export async function updateMe(me: UserDoc, dto: Partial<Pick<UserDoc, 'firstName' | 'lastName' | 'bio' | 'avatar'>>) {
  Object.assign(me, dto);
  await me.save();
  return getMe(me);
}

export async function getProfile(me: UserDoc, id: string) {
  const target = await findActiveUser(id);
  const relationship = await getRelationship(me._id, target._id);
  const base = card(target, relationship, await counts(target._id));

  // Private profile: only the owner and accepted followers see the full profile
  const canView = !target.isPrivate || relationship === 'self' || relationship === 'following';
  return canView
    ? { ...base, bio: target.bio, joinedAt: target.createdAt, restricted: false }
    : { ...base, restricted: true };
}

// ---------- follow / unfollow ----------
export async function follow(me: UserDoc, id: string) {
  if (me._id.equals(id)) throw new AppError('You cannot follow yourself', 400);
  const target = await findActiveUser(id);

  if (await Follow.exists({ follower: me._id, following: target._id }))
    throw new AppError('Already following or request already sent', 409);

  const status = target.isPrivate ? 'pending' : 'accepted';
  await Follow.create({ follower: me._id, following: target._id, status });
  return { status: status === 'accepted' ? 'following' : 'pending' };
}

export async function unfollow(me: UserDoc, id: string) {
  const res = await Follow.deleteOne({ follower: me._id, following: id }); // also cancels a pending request
  if (!res.deletedCount) throw new AppError('You are not following this user', 404);
}

export async function listFollowRequests(me: UserDoc, page: number, limit: number) {
  const filter = { following: me._id, status: 'pending' as const };
  const [rows, total] = await Promise.all([
    Follow.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate('follower', PUBLIC_FIELDS).lean(),
    Follow.countDocuments(filter),
  ]);
  return { items: rows.map((r) => card(r.follower, undefined, { requestedAt: (r as any).createdAt })), pagination: paginate(page, limit, total) };
}

export async function respondToRequest(me: UserDoc, followerId: string, action: 'accept' | 'reject') {
  const filter = { follower: followerId, following: me._id, status: 'pending' as const };
  const res = action === 'accept' ? await Follow.updateOne(filter, { status: 'accepted' }) : await Follow.deleteOne(filter);
  const changed = 'modifiedCount' in res ? res.modifiedCount : res.deletedCount;
  if (!changed) throw new AppError('Follow request not found', 404);
}

export async function listConnections(me: UserDoc, id: string, kind: 'followers' | 'following', page: number, limit: number) {
  const target = await findActiveUser(id);
  const rel = await getRelationship(me._id, target._id);
  if (target.isPrivate && rel !== 'self' && rel !== 'following') throw new AppError('This account is private', 403);

  const filter = kind === 'followers' ? { following: target._id, status: 'accepted' as const } : { follower: target._id, status: 'accepted' as const };
  const populateField = kind === 'followers' ? 'follower' : 'following';

  const [rows, total] = await Promise.all([
    Follow.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate(populateField, PUBLIC_FIELDS).lean(),
    Follow.countDocuments(filter),
  ]);
  const users = rows.map((r: any) => r[populateField]).filter(Boolean);
  const rels = await relationshipMap(me._id, users.map((u: any) => u._id));
  return {
    items: users.map((u: any) => card(u, me._id.equals(u._id) ? 'self' : rels.get(u._id.toString()) ?? 'none')),
    pagination: paginate(page, limit, total),
  };
}

// ---------- search & suggestions ----------
export async function searchUsers(me: UserDoc, q: string, page: number, limit: number) {
  const terms = q.split(/\s+/).filter(Boolean).slice(0, 4).map((t) => new RegExp(escapeRegex(t), 'i'));
  const filter = {
    isVerified: true,
    _id: { $ne: me._id },
    $and: terms.map((re) => ({ $or: [{ firstName: re }, { lastName: re }] })),
  };
  const [users, total] = await Promise.all([
    User.find(filter).select(PUBLIC_FIELDS).sort({ firstName: 1, lastName: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    User.countDocuments(filter),
  ]);
  const rels = await relationshipMap(me._id, users.map((u) => u._id));
  return { items: users.map((u) => card(u, rels.get(u._id.toString()) ?? 'none')), pagination: paginate(page, limit, total) };
}

export async function getSuggestions(me: UserDoc, limit: number) {
  const mine = await Follow.find({ follower: me._id }).select('following status').lean();
  const exclude = [me._id, ...mine.map((f) => f.following)];
  const myFollowing = mine.filter((f) => f.status === 'accepted').map((f) => f.following);

  // 1) "People you may know": accounts followed by the people I follow, ranked by mutual count
  const fof = myFollowing.length
    ? await Follow.aggregate<{ _id: Types.ObjectId; mutual: number }>([
        { $match: { follower: { $in: myFollowing }, status: 'accepted', following: { $nin: exclude } } },
        { $group: { _id: '$following', mutual: { $sum: 1 } } },
        { $sort: { mutual: -1 } },
        { $limit: limit },
      ])
    : [];
  const mutualOf = new Map(fof.map((x) => [x._id.toString(), x.mutual]));
  const fofUsers = await User.find({ _id: { $in: fof.map((x) => x._id) }, isVerified: true }).select(PUBLIC_FIELDS).lean();
  fofUsers.sort((a, b) => (mutualOf.get(b._id.toString()) ?? 0) - (mutualOf.get(a._id.toString()) ?? 0));

  // 2) fill the rest with the newest members
  const need = limit - fofUsers.length;
  const fill = need > 0
    ? await User.find({ isVerified: true, _id: { $nin: [...exclude, ...fofUsers.map((u) => u._id)] } })
        .select(PUBLIC_FIELDS).sort({ createdAt: -1 }).limit(need).lean()
    : [];

  return [
    ...fofUsers.map((u) => card(u, 'none', { mutualFollowers: mutualOf.get(u._id.toString()) ?? 0 })),
    ...fill.map((u) => card(u, 'none', { mutualFollowers: 0 })),
  ];
}

// ---------- account settings & privacy ----------
export const getSettings = (me: UserDoc) => ({ isPrivate: me.isPrivate });

export async function updateSettings(me: UserDoc, isPrivate: boolean) {
  const wasPrivate = me.isPrivate;
  me.isPrivate = isPrivate;
  await me.save();
  // going public: pending requests no longer need approval
  if (wasPrivate && !isPrivate) await Follow.updateMany({ following: me._id, status: 'pending' }, { status: 'accepted' });
  return { isPrivate };
}

export async function changePassword(userId: Types.ObjectId, oldPassword: string, newPassword: string) {
  const user = await User.findById(userId).select('+password');
  if (!user?.password) throw new AppError('This account has no password (Google sign-in). Use "forgot password" to set one.', 400);
  if (!(await bcrypt.compare(oldPassword, user.password))) throw new AppError('Old password is incorrect', 400);
  if (await bcrypt.compare(newPassword, user.password)) throw new AppError('New password must be different', 400);

  user.password = await bcrypt.hash(newPassword, 12);
  await user.save();
  await revokeAllSessions(user._id);
}
