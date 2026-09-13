import { Router } from 'express';
import { sendZaloOtp, verifyZaloOtp, login, googleAuth } from '../controllers/authController';
import { sendEmailOtp, verifyEmailOtp } from '../controllers/authController';

const router = Router();

router.post('/send-zalo-otp', sendZaloOtp);
router.post('/verify-zalo-otp', verifyZaloOtp);
router.post('/login', login);
router.post('/google', googleAuth);
router.post('/send-email-otp', sendEmailOtp);
router.post('/verify-email-otp', verifyEmailOtp);

export default router;