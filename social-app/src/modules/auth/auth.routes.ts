import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import * as c from './auth.controller';
import * as v from './auth.validation';

const router = Router();

router.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 50,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests, try again later' },
  }),
);

router.post('/register', validate({ body: v.registerSchema }), c.register);
router.post('/verify-email', validate({ body: v.verifyEmailSchema }), c.verifyEmail);
router.post('/resend-verification', validate({ body: v.emailOnlySchema }), c.resendVerification);

router.post('/login', validate({ body: v.loginSchema }), c.login);
router.post('/google', validate({ body: v.googleSchema }), c.google);

router.post('/refresh', validate({ body: v.refreshSchema }), c.refresh);
router.post('/logout', validate({ body: v.refreshSchema }), c.logout);
router.post('/logout-all', authenticate, c.logoutAll);

router.post('/forgot-password', validate({ body: v.emailOnlySchema }), c.forgotPassword);
router.post('/reset-password', validate({ body: v.resetPasswordSchema }), c.resetPassword);

export default router;
