import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import * as c from './user.controller';
import * as v from './user.validation';

const router = Router();
router.use(authenticate);

// --- "me" routes first, so they are not captured by /:id ---
router.get('/me', c.getMe);
router.patch('/me', validate({ body: v.updateProfileSchema }), c.updateMe);

router.get('/me/settings', c.getSettings);
router.patch('/me/settings', validate({ body: v.settingsSchema }), c.updateSettings);
router.patch('/me/password', validate({ body: v.changePasswordSchema }), c.changePassword);

router.get('/me/follow-requests', validate({ query: v.paginationSchema }), c.listRequests);
router.post('/me/follow-requests/:userId/accept', validate({ params: v.userIdParam }), c.acceptRequest);
router.delete('/me/follow-requests/:userId', validate({ params: v.userIdParam }), c.rejectRequest);

// --- discovery ---
router.get('/search', validate({ query: v.searchSchema }), c.search);
router.get('/suggestions', validate({ query: v.suggestionsSchema }), c.suggestions);

// --- other users ---
router.get('/:id', validate({ params: v.idParam }), c.getProfile);
router.get('/:id/followers', validate({ params: v.idParam, query: v.paginationSchema }), c.followers);
router.get('/:id/following', validate({ params: v.idParam, query: v.paginationSchema }), c.following);
router.post('/:id/follow', validate({ params: v.idParam }), c.follow);
router.delete('/:id/follow', validate({ params: v.idParam }), c.unfollow);

export default router;
