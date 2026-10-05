import { Router } from 'express';
import {
  sendZaloOtp,
  verifyZaloOtp,
  login,
  googleAuth,
  sendEmailOtp,
  verifyEmailOtp,
  getMe,
  refreshSession,
  logout,
  logoutAllDevices,
} from '../controllers/authController';
import { requireAuth } from '../lib/authMiddleware';
import { slidingWindowWithFreeze } from '../middlewares/rateLimiter';

const router = Router();

const otpRequestLimiter = slidingWindowWithFreeze({
  windowSeconds: 15 * 60,
  maxRequests: 5,
  freezeSeconds: 30 * 60,
  eventType: 'OTP_ABUSE',
});
const loginLimiter = slidingWindowWithFreeze({
  windowSeconds: 15 * 60,
  maxRequests: 10,
  freezeSeconds: 15 * 60,
  eventType: 'LOGIN_BRUTE_FORCE',
});

router.post('/send-zalo-otp', otpRequestLimiter, sendZaloOtp);
router.post('/verify-zalo-otp', otpRequestLimiter, verifyZaloOtp);
router.post('/login', loginLimiter, login);
router.post('/google', loginLimiter, googleAuth);
router.post('/send-email-otp', otpRequestLimiter, sendEmailOtp);
router.post('/verify-email-otp', otpRequestLimiter, verifyEmailOtp);
router.post('/refresh', refreshSession);
router.post('/logout', logout);
router.post('/logout-all', requireAuth, logoutAllDevices);
router.get('/me', requireAuth, getMe);

export default router;
